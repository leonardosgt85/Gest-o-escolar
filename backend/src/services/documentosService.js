// Geração dos documentos para assinatura manual: preenche os modelos .docx (templates/documentos)
// com os dados do aluno e do responsável e devolve um .zip com os três arquivos.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { db } from '../db.js';
import { HttpError, formatarCpf } from '../util.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'documentos');

export const DOCUMENTOS = [
  { chave: 'contrato', arquivo: 'contrato_2027.docx', nome: 'Contrato 2027', titulo: 'Contrato 2027' },
  { chave: 'termo1', arquivo: 'termo1_whatsapp.docx', nome: 'Termo 1 - Autorizacao grupo WhatsApp', titulo: 'Termo 1 — Grupo de WhatsApp' },
  { chave: 'termo2', arquivo: 'termo2_redes_sociais.docx', nome: 'Termo 2 - Autorizacao redes sociais', titulo: 'Termo 2 — Redes sociais' },
];

export const ROTULOS = { pai: 'Pai', mae: 'Mãe', resp_pedagogico: 'Resp. Pedagógico' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const branco = (n) => '_'.repeat(n);
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const ou = (v, n) => txt(v) || branco(n);

function dataBr(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function dataExtenso() {
  const [a, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cuiaba' }).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
export function telefone(p) {
  const num = txt(p.celular) || txt(p.telefone);
  if (!num) return '';
  return txt(p.ddd) ? `(${txt(p.ddd)}) ${num}` : num;
}
function endereco(p) {
  const partes = [
    txt(p.rua),
    txt(p.numero) && `nº ${txt(p.numero)}`,
    txt(p.complemento),
    txt(p.bairro),
    [txt(p.cidade), txt(p.uf)].filter(Boolean).join('/'),
    txt(p.cep) && `CEP ${txt(p.cep)}`,
  ].filter(Boolean);
  return partes.join(', ');
}
function colegio() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, 'colegio.json'), 'utf8'));
  } catch {
    return {};
  }
}

export async function carregar(alunoId) {
  const aluno = await db('alunos').where({ id: alunoId }).whereNull('excluido_em').first();
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado.');
  const ids = ['pai_id', 'mae_id', 'resp_pedagogico_id'].map((k) => aluno[k]).filter(Boolean);
  const pessoas = ids.length ? await db('pessoas').whereIn('id', ids) : [];
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const responsaveis = { pai: porId.get(aluno.pai_id), mae: porId.get(aluno.mae_id), resp_pedagogico: porId.get(aluno.resp_pedagogico_id) };
  return { aluno, responsaveis };
}

// Quem assina por padrão: o responsável financeiro do cadastro; sem ele, mãe, pai e resp. pedagógico, nessa ordem.
export function padrao(aluno, responsaveis) {
  const financ = { Pai: 'pai', 'Mãe': 'mae', Outros: 'resp_pedagogico' }[aluno.tipo_resp_financ];
  if (financ && responsaveis[financ]) return financ;
  return ['mae', 'pai', 'resp_pedagogico'].find((k) => responsaveis[k]) || null;
}

export async function opcoesResponsaveis(alunoId) {
  const { aluno, responsaveis } = await carregar(alunoId);
  const opcoes = Object.entries(responsaveis)
    .filter(([, p]) => p)
    .map(([chave, p]) => ({ chave, rotulo: ROTULOS[chave], nome: p.nome, cpf: formatarCpf(p.cpf) }));
  return { opcoes, padrao: padrao(aluno, responsaveis) };
}

const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// `mat` (opcional): matrícula com as condições contratadas; preenche série/turno e valores no contrato.
function montarDados(aluno, resp, cfg, mat) {
  const p = resp || {};
  const parcelas = mat?.parcelas ? Number(mat.parcelas) : null;
  const base = mat?.valor_parcela != null ? Number(mat.valor_parcela) : null;
  const valorParcela = base != null ? Math.round(base * (1 - Number(mat.desconto_percentual || 0) / 100) * 100) / 100 : null;
  const t1 = cfg.testemunha1 || {};
  const t2 = cfg.testemunha2 || {};
  const cpf = formatarCpf(p.cpf);
  return {
    aluno_nome: ou(aluno.nome_completo, 30),
    aluno_nascimento: ou(dataBr(aluno.data_nascimento), 10),
    turma: branco(14),
    serie_turno: `${ou(mat?.serie, 14)} — ${ou(mat?.turno, 12)}`,
    resp_nome: ou(p.nome, 30),
    resp_cpf: ou(cpf, 14),
    resp_email: ou(p.email, 28),
    resp_telefone: ou(telefone(p), 16),
    resp_rg_orgao: `${ou(p.rg, 12)} / ${ou(p.rg_orgao_emissor, 8)}`,
    resp_endereco: ou(endereco(p) || endereco(aluno), 40),
    resp_contato: `${ou(telefone(p), 14)} / ${ou(p.email, 24)}`,
    valor_anuidade: valorParcela != null && parcelas ? brl(Math.round(valorParcela * parcelas * 100) / 100) : branco(12),
    parcelas: parcelas ? String(parcelas) : branco(4),
    valor_parcela: valorParcela != null ? brl(valorParcela) : branco(10),
    dia_vencimento: mat?.dia_vencimento ? String(mat.dia_vencimento) : branco(4),
    horario_integral: ou(cfg.horario_termino_integral, 8),
    canal_revogacao: ou(cfg.canal_revogacao, 30),
    rodape_contrato: txt(cfg.rodape_contrato),
    testemunha1_nome: ou(t1.nome, 24), testemunha1_cpf: ou(t1.cpf, 14),
    testemunha2_nome: ou(t2.nome, 24), testemunha2_cpf: ou(t2.cpf, 14),
    data_extenso: dataExtenso(),
  };
}

function preencher(arquivo, dados) {
  const zip = new PizZip(fs.readFileSync(path.join(DIR, arquivo)));
  const doc = new Docxtemplater(zip, { delimiters: { start: '{{', end: '}}' }, paragraphLoop: true, linebreaks: false, nullGetter: () => '' });
  doc.render(dados);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const slug = (s) =>
  txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'aluno';

export const dadosColegio = colegio;

// Gera os três .docx preenchidos. Devolve também o responsável usado e os avisos de cadastro incompleto.
export async function gerarArquivos(alunoId, chaveResp, mat) {
  const { aluno, responsaveis } = await carregar(alunoId);
  const chave = chaveResp && responsaveis[chaveResp] ? chaveResp : padrao(aluno, responsaveis);
  const resp = chave ? responsaveis[chave] : null;
  const dados = montarDados(aluno, resp, colegio(), mat);
  const nomeAluno = slug(aluno.nome_completo);
  const arquivos = DOCUMENTOS.map((d) => ({
    chave: d.chave,
    nome: d.titulo.replace(/2027/, String(mat?.ano || 2027)),
    arquivo: `${d.nome.replace(/2027/, String(mat?.ano || 2027))} - ${nomeAluno}.docx`,
    buffer: preencher(d.arquivo, dados),
  }));
  return { aluno, resp, chave, arquivos, nomeAluno };
}

export async function gerarDocumentos(alunoId, chaveResp) {
  const { aluno, resp, chave, arquivos, nomeAluno } = await gerarArquivos(alunoId, chaveResp);
  const zip = new PizZip();
  for (const a of arquivos) zip.file(a.arquivo, a.buffer);

  const avisos = [];
  if (!resp) avisos.push('O aluno não tem responsável vinculado: os dados do responsável ficaram em branco.');
  else {
    if (!txt(resp.cpf)) avisos.push('O responsável não tem CPF cadastrado.');
    if (!txt(resp.rg)) avisos.push('O responsável não tem RG cadastrado.');
    if (!endereco(resp) && !endereco(aluno)) avisos.push('Sem endereço cadastrado.');
  }
  return {
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    nomeArquivo: `Documentos - ${nomeAluno}.zip`,
    responsavel: resp ? `${resp.nome} (${ROTULOS[chave]})` : null,
    avisos,
  };
}
