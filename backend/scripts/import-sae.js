// Importa alunos (e seus responsáveis) de um JSON exportado do SAE.
//
// Uso:  npm run import:sae -- <arquivo.json> [--mapa import/mapa.json] [--dry-run]
//
// O formato do JSON do SAE ainda não é conhecido, então o mapeamento é configurável:
// copie `import/mapa.exemplo.json` para `import/mapa.json` e ajuste os nomes das chaves
// (aceita caminhos com ponto, ex.: "dados.nome"). Reimportar é seguro: o código do SAE
// (legacy_id) é usado para atualizar em vez de duplicar.
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.js';
import { ALUNO_CAMPOS, ALUNO_JSON, OPCOES, PESSOA_CAMPOS } from '../src/fields.js';
import { cpfValido, formatarCpf, soDigitos } from '../src/util.js';

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--mapa');
const dry = args.includes('--dry-run');
const iMapa = args.indexOf('--mapa');
const arquivoMapa = iMapa >= 0 ? args[iMapa + 1] : 'import/mapa.json';

if (!arquivo) {
  console.error('Uso: npm run import:sae -- <arquivo.json> [--mapa import/mapa.json] [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(arquivoMapa)) {
  console.error(`Mapa não encontrado: ${arquivoMapa}\nCopie import/mapa.exemplo.json para import/mapa.json e ajuste as chaves.`);
  process.exit(1);
}

const mapa = JSON.parse(fs.readFileSync(arquivoMapa, 'utf8'));
const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const registros = mapa.raiz ? get(dados, mapa.raiz) : dados;
if (!Array.isArray(registros)) {
  console.error('Não achei a lista de alunos. Ajuste "raiz" no mapa (ex.: "alunos") ou use um JSON que seja uma lista.');
  process.exit(1);
}

function get(obj, caminho) {
  if (!caminho) return undefined;
  return String(caminho).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// dd/mm/aaaa, aaaa-mm-dd ou ISO com hora -> aaaa-mm-dd
function normalizarData(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const CAMPOS_DATA = new Set(['data_nascimento', 'rg_data_expedicao', 'certidao_data_registro']);
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Ajusta valores de select ao texto oficial (ignora caixa/acento). Se não casar, registra aviso e descarta.
function normalizarOpcao(campo, valor, avisos) {
  const lista = OPCOES[campo];
  if (!lista || valor == null || valor === '') return valor ?? null;
  const achou = lista.find((o) => semAcento(o) === semAcento(valor));
  if (!achou) avisos.push(`${campo}: valor "${valor}" não existe nas opções do CSM (descartado)`);
  return achou ?? null;
}

function converter(origem, campos, permitidos, avisos) {
  const out = {};
  for (const [destino, caminho] of Object.entries(campos || {})) {
    if (!permitidos.includes(destino)) {
      avisos.push(`mapa: campo de destino desconhecido "${destino}"`);
      continue;
    }
    let v = get(origem, caminho);
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) v = null;
    if (CAMPOS_DATA.has(destino)) v = normalizarData(v);
    else v = normalizarOpcao(destino, v, avisos);
    out[destino] = v;
  }
  if (out.cpf) {
    if (cpfValido(out.cpf)) out.cpf = formatarCpf(out.cpf);
    else {
      avisos.push(`cpf "${out.cpf}" inválido (mantido como veio)`);
    }
  }
  return out;
}

async function upsertPessoa(origem, mapaPessoa, avisos, trx) {
  if (!origem || !mapaPessoa) return null;
  const p = converter(origem, mapaPessoa.campos, PESSOA_CAMPOS, avisos);
  if (!p.nome) return null;
  const legacy = mapaPessoa.legacy_id ? get(origem, mapaPessoa.legacy_id) : null;
  let existente = null;
  if (legacy != null) existente = await trx('pessoas').where({ legacy_id: String(legacy) }).first();
  if (!existente && p.cpf) existente = await trx('pessoas').where({ cpf: p.cpf }).first();
  if (existente) {
    await trx('pessoas').where({ id: existente.id }).update({ ...p, updated_at: trx.fn.now() });
    return existente.id;
  }
  const [novo] = await trx('pessoas').insert({ ...p, legacy_id: legacy != null ? String(legacy) : null }).returning('id');
  return novo.id;
}

const resumo = { total: registros.length, criados: 0, atualizados: 0, erros: 0, avisos: 0 };
const relatorio = [];

for (const [i, reg] of registros.entries()) {
  const avisos = [];
  try {
    await db.transaction(async (trx) => {
      const aluno = converter(reg, mapa.aluno?.campos, ALUNO_CAMPOS, avisos);
      for (const j of ALUNO_JSON) {
        const v = mapa.aluno?.json?.[j] ? get(reg, mapa.aluno.json[j]) : undefined;
        if (v !== undefined) aluno[j] = JSON.stringify(v);
      }
      if (!aluno.nome_completo) throw new Error('registro sem nome do aluno');
      if (!aluno.data_nascimento) {
        aluno.data_nascimento = '1900-01-01';
        avisos.push('sem data de nascimento válida (usado 1900-01-01 — corrigir depois)');
      }
      const r = mapa.aluno?.responsaveis || {};
      for (const [campo, chave] of [['pai_id', 'pai'], ['mae_id', 'mae'], ['resp_pedagogico_id', 'resp_pedagogico']]) {
        if (r[chave]) aluno[campo] = await upsertPessoa(get(reg, r[chave].origem), r[chave], avisos, trx);
      }
      const legacy = mapa.aluno?.legacy_id ? get(reg, mapa.aluno.legacy_id) : null;
      const existente = legacy != null ? await trx('alunos').where({ legacy_id: String(legacy) }).first() : null;
      if (aluno.cpf && !existente) {
        const dup = await trx('alunos').where({ cpf: aluno.cpf }).whereNull('excluido_em').first();
        if (dup) {
          avisos.push(`CPF ${aluno.cpf} já pertence ao aluno código ${dup.id} (CPF descartado neste registro)`);
          aluno.cpf = null;
        }
      }
      if (existente) {
        await trx('alunos').where({ id: existente.id }).update({ ...aluno, updated_at: trx.fn.now() });
        resumo.atualizados++;
      } else {
        await trx('alunos').insert({ ...aluno, legacy_id: legacy != null ? String(legacy) : null });
        resumo.criados++;
      }
      if (dry) throw Object.assign(new Error('dry-run'), { dry: true });
    });
  } catch (e) {
    if (!e.dry) {
      resumo.erros++;
      relatorio.push(`#${i + 1}: ERRO ${e.message}`);
    }
  }
  resumo.avisos += avisos.length;
  for (const a of avisos) relatorio.push(`#${i + 1}: aviso — ${a}`);
}

const saida = path.resolve('import', `relatorio-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, `${JSON.stringify(resumo)}\n${relatorio.join('\n')}\n`);
console.log(dry ? '(dry-run: nada foi gravado)' : 'Importação concluída.');
console.log(resumo);
console.log(`Relatório detalhado: ${saida}`);
await db.destroy();
