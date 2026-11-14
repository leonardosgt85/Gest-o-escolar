// Relatório do aluno (visão 360°): reúne matrícula, notas, frequência, material/uniformes, documentos,
// responsáveis e linha do tempo. Cada bloco só vem se o usuário tem permissão para vê-lo.
import { db } from '../db.js';
import { HttpError } from '../util.js';
import { DOCS_ALUNO } from './matriculasService.js';
import { media } from './diarioService.js';
import * as itens from './itensService.js';

const nv = (ctx, k) => (ctx.usuario.nivel === 'Administrador' ? 9 : ctx.permissoes[k] ?? 0);
const iso = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const r1 = (n) => Math.round(n * 10) / 10;
const STATUS = { pre_matricula: 'Pré-matrícula', aguardando_documentos: 'Aguardando documentos', aguardando_assinatura: 'Aguardando assinatura', aguardando_parcela: 'Aguardando 1ª parcela', ativa: 'Ativa', nao_renovou: 'Não renovou', transferida: 'Transferida', cancelada: 'Cancelada', concluida: 'Concluída' };
const ROT_DOC = { contrato: 'Contrato de prestação de serviços', termo1: 'Termo de uso de WhatsApp', termo2: 'Termo de uso de imagem em redes sociais' };
const TIPO = { nova: 'Matrícula', rematricula: 'Rematrícula', retorno: 'Retorno' };

async function pessoa(id, papel) {
  if (!id) return null;
  const p = await db('pessoas').where({ id }).first('nome', 'celular', 'telefone', 'ddd', 'email');
  if (!p) return null;
  const fone = p.celular || p.telefone;
  return { nome: p.nome, papel, fone: fone ? `${p.ddd ? `(${p.ddd}) ` : ''}${fone}` : null, email: p.email || null };
}

export async function dados(ctx, alunoId, ano) {
  const aluno = await db('alunos').where({ id: alunoId }).first();
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado.');
  const mats = await db('matriculas').where({ aluno_id: alunoId }).orderBy('ano', 'desc');
  const mat = mats.find((m) => m.ano === ano) || null;
  const turma = mat?.turma_id ? await db('turmas').where({ id: mat.turma_id }).first() : null;
  // contrato e termos assinados (último arquivo assinado de cada documento, por matrícula)
  const arqs = mats.length ? await db('matricula_documentos').whereIn('matricula_id', mats.map((m) => m.id)).whereIn('versao', ['assinado_autentique', 'assinado_manual']).orderBy('id').select('id', 'matricula_id', 'chave', 'versao', 'arquivo', 'created_at') : [];
  const docsDe = (mid) => Object.keys(ROT_DOC).map((ch) => { const a = arqs.filter((x) => x.matricula_id === mid && x.chave === ch).pop(); return a ? { id: a.id, matricula_id: mid, chave: ch, rotulo: ROT_DOC[ch], arquivo: a.arquivo, versao: a.versao === 'assinado_manual' ? 'Assinatura manual' : 'Assinado (Autentique)', quando: a.created_at ? new Date(a.created_at).toISOString() : null } : null; }).filter(Boolean);
  const anos = [...new Set([...mats.map((m) => m.ano), ano])].sort((a, b) => b - a);

  const anexos = mat ? await db('matricula_documentos').where({ matricula_id: mat.id, versao: 'anexo' }).orderBy('id').select('id', 'chave', 'arquivo') : [];
  const out = {
    aluno: { id: aluno.id, nome: aluno.nome_completo, nascimento: iso(aluno.data_nascimento) },
    ano, anos,
    matricula: mat ? { id: mat.id, status: mat.status, statusRotulo: STATUS[mat.status] || mat.status, serie: mat.serie, turno: mat.turno, turma: turma ? turma.nome : null } : null,
    permissoes: { notas: nv(ctx, 'academico.diario') >= 1, material: nv(ctx, 'academico.itens') >= 1 },
    matriculas: mats.map((m) => ({ ano: m.ano, tipo: TIPO[m.tipo] || m.tipo, serie: m.serie, turno: m.turno, status: m.status, statusRotulo: STATUS[m.status] || m.status, docs: docsDe(m.id), assinatura: m.status === 'ativa' || m.status === 'concluida' ? (m.assinatura_modo === 'manual' ? 'Assinatura manual' : 'Assinado (Autentique)') : '—' })),
    responsaveis: (await Promise.all([pessoa(aluno.pai_id, 'Pai'), pessoa(aluno.mae_id, 'Mãe'), pessoa(aluno.resp_pedagogico_id, 'Responsável pedagógico')])).filter(Boolean),
    assinados: mat ? docsDe(mat.id) : [],
    documentos: mat ? DOCS_ALUNO.map(([k, rot]) => { const a = anexos.filter((x) => x.chave === k).pop(); return { chave: k, rotulo: rot, ok: !!mat.docs_entregues?.[k], arquivo: a ? { id: a.id, matricula_id: mat.id, nome: a.arquivo } : null }; }) : [],
    notas: null, frequencia: null, material: null,
    mensalidades: { disponivel: false },
    pendencias: [],
  };

  // notas e frequência (Diário)
  if (out.permissoes.notas && turma) {
    const rows = await db('diario_notas as n').join('disciplinas as d', 'd.id', 'n.disciplina_id')
      .where({ 'n.turma_id': turma.id, 'n.aluno_id': alunoId }).select('d.id as did', 'd.nome', 'n.bimestre', 'n.pm', 'n.pb', 'n.sim').orderBy('d.nome');
    const aulas = await db('diario_aulas as a').join('disciplinas as d', 'd.id', 'a.disciplina_id').where('a.turma_id', turma.id)
      .groupBy('d.id', 'd.nome', 'a.bimestre').select('d.id as did', 'd.nome', 'a.bimestre').sum({ dadas: 'a.aulas' });
    const faltas = await db('diario_frequencia as f').join('diario_aulas as a', 'a.id', 'f.aula_id').where({ 'a.turma_id': turma.id, 'f.aluno_id': alunoId, 'f.status': 'F' })
      .groupBy('a.disciplina_id', 'a.bimestre').select('a.disciplina_id as did', 'a.bimestre').sum({ n: 'a.aulas' });
    const fk = (did, b) => Number(faltas.find((x) => x.did === did && x.bimestre === b)?.n || 0);
    const bim = [1, 2, 3, 4].map((b) => {
      const linhas = rows.filter((r) => r.bimestre === b).map((r) => ({ disciplina: r.nome, pm: num(r.pm), pb: num(r.pb), sim: num(r.sim), media: media(r.pm, r.pb, r.sim), faltas: fk(r.did, b) }));
      const ms = linhas.map((l) => l.media).filter((m) => m !== null);
      return { bimestre: b, linhas, mediaGeral: ms.length ? r1(ms.reduce((a, c) => a + c, 0) / ms.length) : null };
    });
    out.notas = { bimestres: bim, bimestreAtual: [...bim].reverse().find((b) => b.linhas.length)?.bimestre || 1 };
    const porDisc = new Map();
    for (const a of aulas) { const e = porDisc.get(a.did) || { disciplina: a.nome, dadas: 0, faltas: 0 }; e.dadas += Number(a.dadas); porDisc.set(a.did, e); }
    for (const f of faltas) { const e = porDisc.get(f.did); if (e) e.faltas += Number(f.n); }
    const lista = [...porDisc.values()].sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR'));
    const dadas = lista.reduce((s, x) => s + x.dadas, 0), falt = lista.reduce((s, x) => s + x.faltas, 0);
    out.frequencia = { disciplinas: lista, dadas, faltas: falt, presenca: dadas ? r1(((dadas - falt) / dadas) * 100) : null };
  }

  // material e uniformes
  if (out.permissoes.material) {
    const m = await itens.doAluno(alunoId, ano);
    out.material = { itens: m.itens, resumo: m.resumo };
    if (m.resumo.saldo > 0) out.pendencias.push({ tipo: 'Material', texto: `Saldo de material e uniformes em aberto: R$ ${m.resumo.saldo.toFixed(2).replace('.', ',')}.`, bloco: 'material' });
  }
  const falta = out.documentos.filter((d) => !d.ok);
  if (falta.length) out.pendencias.push({ tipo: 'Documento', texto: `${falta.length === 1 ? 'Documento pendente' : 'Documentos pendentes'}: ${falta.map((d) => d.rotulo).join('; ')}.`, bloco: 'documentos' });
  if (mat && !['ativa', 'concluida'].includes(mat.status)) out.pendencias.push({ tipo: 'Matrícula', texto: `Matrícula ${ano}: ${STATUS[mat.status] || mat.status}.`, bloco: 'matricula' });

  // linha do tempo
  const ev = await db('matricula_eventos as e').join('matriculas as m', 'm.id', 'e.matricula_id').where('m.aluno_id', alunoId).select('e.ocorrido_em as created_at', 'e.titulo');
  const evItens = out.permissoes.material
    ? await db('aluno_item_eventos as e').join('aluno_itens as i', 'i.id', 'e.aluno_item_id').where('i.aluno_id', alunoId).select('e.created_at', 'e.acao', 'e.detalhe', 'i.descricao')
    : [];
  const rot = { criado: 'Item registrado', pagamento: 'Pagamento lançado', pagamento_estornado: 'Pagamento estornado', entrega: 'Entrega marcada', entrega_desfeita: 'Entrega desfeita', entrega_em_lote: 'Entregas liberadas marcadas', cancelado: 'Item cancelado', alterado: 'Item alterado' };
  out.tempo = [...ev.map((e) => ({ quando: e.created_at, texto: e.titulo })), ...evItens.map((e) => ({ quando: e.created_at, texto: `${rot[e.acao] || e.acao}: ${e.descricao}${e.detalhe?.valor ? ` (R$ ${Number(e.detalhe.valor).toFixed(2).replace('.', ',')})` : ''}` }))]
    .sort((a, b) => new Date(b.quando) - new Date(a.quando)).slice(0, 20).map((e) => ({ ...e, quando: new Date(e.quando).toISOString() }));
  return out;
}
