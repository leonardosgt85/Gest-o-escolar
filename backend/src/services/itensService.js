// Itens do aluno (material didático, uniformes, outros): compra, pagamentos e entregas.
// Regra de entrega: o item só é entregue com o pagamento correspondente (proporcional ao bimestre);
// quem tem a permissão academico.itens.liberar pode liberar com justificativa (fica registrado).
import { db } from '../db.js';
import { HttpError } from '../util.js';

export const BIMESTRES = 4;
export const FORMAS = ['cartao_credito', 'pix', 'dinheiro', 'boleto', 'outro'];
export const TIPOS = ['material', 'uniforme', 'outro'];
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const txt = (v) => String(v ?? '').trim();
const nv = (ctx, k) => (ctx.usuario.nivel === 'Administrador' ? 9 : ctx.permissoes[k] ?? 0);
const hoje = () => new Date().toISOString().slice(0, 10);

export function dinheiro(v, rot = 'Valor') {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number((s.includes(',') ? s.replace(/\./g, '') : s).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${rot} inválido.`);
  return r2(n);
}
const dataIso = (v, rot) => {
  const s = txt(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${rot} inválida.`);
  return s;
};
const iso = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);

async function evento(trx, itemId, ctx, acao, detalhe) {
  await trx('aluno_item_eventos').insert({ aluno_item_id: itemId, usuario_id: ctx.usuario.id, acao, detalhe: detalhe ? JSON.stringify(detalhe) : null });
}

/** Valor que precisa estar pago para entregar o bimestre `b` (proporcional aos bimestres que o aluno cursa). */
export function esperadoAte(item, b) {
  const total = Number(item.valor_total);
  if (!item.por_bimestre || !b) return r2(total);
  const n = BIMESTRES - item.bimestre_inicio + 1;
  return r2((total * (b - item.bimestre_inicio + 1)) / n);
}

function montar(item, pagamentos, entregas) {
  const total = Number(item.valor_total);
  const pago = r2(pagamentos.reduce((s, p) => s + Number(p.valor), 0));
  const saldo = r2(Math.max(0, total - pago));
  const status = total <= 0 ? 'isento' : pago <= 0 ? 'em_aberto' : pago + 0.005 < total ? 'parcial' : 'pago';
  const porB = new Map(entregas.map((e) => [e.bimestre, e]));
  const bims = item.por_bimestre ? Array.from({ length: BIMESTRES }, (_, i) => i + 1) : [0];
  const etapas = bims.map((b) => {
    const e = porB.get(b);
    const aplica = !item.por_bimestre || b >= item.bimestre_inicio;
    const esperado = esperadoAte(item, b);
    return { bimestre: b, aplica, entregue: !!e?.entregue, data_entrega: iso(e?.data_entrega), justificativa: e?.justificativa || null, esperado, liberada_pelo_pagamento: aplica && pago + 0.005 >= esperado };
  });
  return { ...item, valor_total: total, pago, saldo, status, etapas, pagamentos: pagamentos.map((p) => ({ ...p, data: iso(p.data), valor: Number(p.valor) })) };
}

async function carregarItens(where) {
  const itens = await db('aluno_itens').where(where).andWhere({ cancelado: false }).orderBy('id');
  if (!itens.length) return [];
  const ids = itens.map((i) => i.id);
  const pags = await db('aluno_item_pagamentos').whereIn('aluno_item_id', ids).orderBy(['data', 'id']);
  const ents = await db('aluno_item_entregas').whereIn('aluno_item_id', ids);
  return itens.map((i) => montar(i, pags.filter((p) => p.aluno_item_id === i.id), ents.filter((e) => e.aluno_item_id === i.id)));
}

const mesmaSerie = (a, b) => txt(a).toLowerCase() === txt(b).toLowerCase();

export async function doAluno(alunoId, ano) {
  const aluno = await db('alunos').where({ id: alunoId }).first('id', 'nome_completo');
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado.');
  const mat = await db('matriculas').where({ aluno_id: alunoId, ano }).whereNot({ status: 'nao_renovou' }).orderBy('id', 'desc').first('id', 'serie', 'turno');
  const anos = (await db('aluno_itens').where({ aluno_id: alunoId, cancelado: false }).distinct('ano')).map((x) => x.ano);
  const catalogo = (await db('itens_catalogo').where({ ano, ativo: true }).orderBy(['tipo', 'nome'])).filter((c) => !c.serie || (mat && mesmaSerie(c.serie, mat.serie)));
  const itens = await carregarItens({ aluno_id: alunoId, ano });
  const soma = (k) => r2(itens.reduce((s, i) => s + i[k], 0));
  return { aluno: { id: aluno.id, nome: aluno.nome_completo }, ano, matricula: mat || null, anos, catalogo: catalogo.map((c) => ({ ...c, valor: Number(c.valor) })), itens, resumo: { total: soma('valor_total'), pago: soma('pago'), saldo: soma('saldo') } };
}

export async function criar(ctx, alunoId, b) {
  const ano = Number(b.ano);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new HttpError(400, 'Ano inválido.');
  if (!(await db('alunos').where({ id: alunoId }).first())) throw new HttpError(404, 'Aluno não encontrado.');
  const qtd = b.quantidade === undefined || b.quantidade === null || b.quantidade === '' ? 1 : Number(b.quantidade);
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) throw new HttpError(400, 'Quantidade inválida: informe um número inteiro de 1 a 99.');
  let tipo = b.tipo, descricao = txt(b.descricao), porBim = false, unit = null, catalogoId = null;
  if (b.catalogo_id) {
    const c = await db('itens_catalogo').where({ id: Number(b.catalogo_id), ano }).first();
    if (!c) throw new HttpError(400, 'Item do catálogo não encontrado neste ano.');
    ({ tipo, por_bimestre: porBim } = c); descricao = c.nome; unit = Number(c.valor); catalogoId = c.id;
  }
  if (!TIPOS.includes(tipo)) throw new HttpError(400, 'Tipo inválido.');
  if (!descricao) throw new HttpError(400, 'Informe a descrição do item.');
  porBim = tipo === 'material'; // material sempre por bimestre; uniforme e outros, entrega única
  const pode$ = nv(ctx, 'academico.itens.pagamento') >= 1;
  let total;
  const informado = dinheiro(b.valor_total, 'Valor');
  if (informado !== null && (unit === null || informado !== r2(unit * qtd))) {
    if (!pode$) throw new HttpError(403, 'Apenas o financeiro pode definir ou alterar valores.');
    total = informado;
  } else total = unit !== null ? r2(unit * qtd) : informado;
  if (total === null) throw new HttpError(400, 'Informe o valor do item.');
  const ini = porBim ? Number(b.bimestre_inicio || 1) : 1;
  if (!Number.isInteger(ini) || ini < 1 || ini > BIMESTRES) throw new HttpError(400, 'Bimestre inicial inválido.');
  if (b.pagamento && !pode$) throw new HttpError(403, 'Apenas o financeiro pode lançar pagamentos.');
  return db.transaction(async (trx) => {
    const [item] = await trx('aluno_itens').insert({ aluno_id: alunoId, ano, catalogo_id: catalogoId, tipo, descricao: descricao.slice(0, 160), tamanho: txt(b.tamanho).slice(0, 20) || null, quantidade: qtd, valor_total: total, por_bimestre: porBim, bimestre_inicio: ini, observacao: txt(b.observacao) || null, criado_por: ctx.usuario.id }).returning('*');
    await evento(trx, item.id, ctx, 'criado', { descricao: item.descricao, valor_total: total });
    if (b.pagamento) await registrarPagamento(ctx, item.id, b.pagamento, trx);
    return { id: item.id };
  });
}

export async function atualizar(ctx, id, b) {
  const item = await db('aluno_itens').where({ id, cancelado: false }).first();
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  const up = {};
  if ('tamanho' in b) up.tamanho = txt(b.tamanho).slice(0, 20) || null;
  if ('observacao' in b) up.observacao = txt(b.observacao) || null;
  if ('valor_total' in b) {
    if (nv(ctx, 'academico.itens.pagamento') < 1) throw new HttpError(403, 'Apenas o financeiro pode alterar valores.');
    const v = dinheiro(b.valor_total, 'Valor');
    if (v === null) throw new HttpError(400, 'Informe o valor.');
    const pago = Number((await db('aluno_item_pagamentos').where({ aluno_item_id: id }).sum('valor as s').first()).s || 0);
    if (v + 0.005 < pago) throw new HttpError(409, 'O valor não pode ser menor que o já pago. Estorne um pagamento primeiro.');
    up.valor_total = v;
  }
  await db.transaction(async (trx) => { await trx('aluno_itens').where({ id }).update(up); await evento(trx, id, ctx, 'alterado', up); });
  return { ok: true };
}

export async function cancelar(ctx, id) {
  if (nv(ctx, 'academico.itens.pagamento') < 1) throw new HttpError(403, 'Apenas o financeiro pode cancelar itens.');
  const item = await db('aluno_itens').where({ id, cancelado: false }).first();
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  if ((await db('aluno_item_pagamentos').where({ aluno_item_id: id }).first())) throw new HttpError(409, 'Há pagamentos lançados. Estorne os pagamentos antes de cancelar.');
  if ((await db('aluno_item_entregas').where({ aluno_item_id: id, entregue: true }).first())) throw new HttpError(409, 'Há entregas marcadas. Desmarque as entregas antes de cancelar.');
  await db.transaction(async (trx) => { await trx('aluno_itens').where({ id }).update({ cancelado: true }); await evento(trx, id, ctx, 'cancelado', { descricao: item.descricao }); });
  return { ok: true };
}

export async function registrarPagamento(ctx, id, b, trx = db) {
  if (nv(ctx, 'academico.itens.pagamento') < 1) throw new HttpError(403, 'Apenas o financeiro pode lançar pagamentos.');
  const item = await trx('aluno_itens').where({ id, cancelado: false }).first();
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  const valor = dinheiro(b.valor, 'Valor do pagamento');
  if (!valor || valor <= 0) throw new HttpError(400, 'Informe o valor do pagamento.');
  if (!FORMAS.includes(b.forma)) throw new HttpError(400, 'Forma de pagamento inválida.');
  const data = b.data ? dataIso(b.data, 'Data do pagamento') : hoje();
  if (data > hoje()) throw new HttpError(400, 'A data do pagamento não pode ser futura.');
  const parcelas = Number(b.parcelas || 1);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 24) throw new HttpError(400, 'Número de parcelas inválido.');
  const obs = txt(b.observacao);
  if (b.forma === 'boleto' && obs.length < 5) throw new HttpError(400, 'Boleto é exceção: informe a justificativa na observação.');
  const pago = Number((await trx('aluno_item_pagamentos').where({ aluno_item_id: id }).sum('valor as s').first()).s || 0);
  if (pago + valor > Number(item.valor_total) + 0.005) throw new HttpError(409, `O pagamento ultrapassa o valor do item (saldo de R$ ${r2(Number(item.valor_total) - pago).toFixed(2).replace('.', ',')}).`);
  const run = async (t) => {
    const [p] = await t('aluno_item_pagamentos').insert({ aluno_item_id: id, data, valor, forma: b.forma, parcelas: b.forma === 'cartao_credito' ? parcelas : 1, observacao: obs || null, origem: 'manual', criado_por: ctx.usuario.id }).returning('id');
    await evento(t, id, ctx, 'pagamento', { valor, forma: b.forma, data });
    return { id: p.id ?? p };
  };
  return trx === db ? db.transaction(run) : run(trx);
}

export async function estornarPagamento(ctx, pagId) {
  if (nv(ctx, 'academico.itens.pagamento') < 1) throw new HttpError(403, 'Apenas o financeiro pode estornar pagamentos.');
  const p = await db('aluno_item_pagamentos').where({ id: pagId }).first();
  if (!p) throw new HttpError(404, 'Pagamento não encontrado.');
  await db.transaction(async (trx) => { await trx('aluno_item_pagamentos').where({ id: pagId }).del(); await evento(trx, p.aluno_item_id, ctx, 'pagamento_estornado', { valor: Number(p.valor), forma: p.forma, data: iso(p.data) }); });
  return { ok: true };
}

export async function marcarEntrega(ctx, id, bimestre, { entregue, justificativa }) {
  const item = await db('aluno_itens').where({ id, cancelado: false }).first();
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  const b = Number(bimestre);
  if (item.por_bimestre ? !(Number.isInteger(b) && b >= item.bimestre_inicio && b <= BIMESTRES) : b !== 0) throw new HttpError(400, 'Bimestre inválido para este item.');
  const marcar = entregue !== false;
  let just = null;
  if (marcar) {
    const pago = Number((await db('aluno_item_pagamentos').where({ aluno_item_id: id }).sum('valor as s').first()).s || 0);
    const esperado = esperadoAte(item, b);
    if (pago + 0.005 < esperado) {
      const falta = r2(esperado - pago).toFixed(2).replace('.', ',');
      const quando = item.por_bimestre ? `até o ${b}º bimestre` : 'do item';
      if (nv(ctx, 'academico.itens.liberar') < 1) throw new HttpError(409, `Entrega não liberada: falta pagar R$ ${falta} ${quando}.`);
      just = txt(justificativa);
      if (just.length < 5) throw new HttpError(409, `Falta pagar R$ ${falta} ${quando}. Para liberar mesmo assim, informe a justificativa.`);
    }
  }
  await db.transaction(async (trx) => {
    await trx.raw(
      `insert into aluno_item_entregas (aluno_item_id, bimestre, entregue, data_entrega, entregue_por, justificativa) values (?,?,?,?,?,?)
       on conflict (aluno_item_id, bimestre) do update set entregue = excluded.entregue, data_entrega = excluded.data_entrega, entregue_por = excluded.entregue_por, justificativa = excluded.justificativa`,
      [id, b, marcar, marcar ? hoje() : null, marcar ? ctx.usuario.id : null, just],
    );
    await evento(trx, id, ctx, marcar ? 'entrega' : 'entrega_desfeita', { bimestre: b, justificativa: just });
  });
  return { ok: true };
}

/* ---------- catálogo ---------- */
export function validarCatalogo(b) {
  const ano = Number(b.ano);
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new HttpError(400, 'Informe o ano letivo.');
  if (!TIPOS.includes(b.tipo)) throw new HttpError(400, 'Tipo inválido.');
  const nome = txt(b.nome);
  if (!nome) throw new HttpError(400, 'Informe o nome do item.');
  const valor = dinheiro(b.valor, 'Valor');
  if (valor === null) throw new HttpError(400, 'Informe o valor.');
  return { ano, tipo: b.tipo, nome: nome.slice(0, 120), serie: txt(b.serie) || null, valor, por_bimestre: b.tipo === 'material' };
}

/** Marca como entregues todas as etapas já cobertas pelo pagamento (ex.: pagou tudo → entrega os 4 bimestres). */
export async function entregarLiberadas(ctx, id) {
  const item = await db('aluno_itens').where({ id, cancelado: false }).first();
  if (!item) throw new HttpError(404, 'Item não encontrado.');
  const pago = Number((await db('aluno_item_pagamentos').where({ aluno_item_id: id }).sum('valor as s').first()).s || 0);
  const ja = new Set((await db('aluno_item_entregas').where({ aluno_item_id: id, entregue: true })).map((e) => e.bimestre));
  const bims = item.por_bimestre ? Array.from({ length: BIMESTRES - item.bimestre_inicio + 1 }, (_, i) => item.bimestre_inicio + i) : [0];
  const marcar = bims.filter((b) => !ja.has(b) && pago + 0.005 >= esperadoAte(item, b));
  if (!marcar.length) throw new HttpError(409, 'Não há entregas liberadas pendentes. Falta pagamento para as demais.');
  await db.transaction(async (trx) => {
    for (const b of marcar) {
      await trx.raw(
        `insert into aluno_item_entregas (aluno_item_id, bimestre, entregue, data_entrega, entregue_por, justificativa) values (?,?,true,?,?,null)
         on conflict (aluno_item_id, bimestre) do update set entregue = true, data_entrega = excluded.data_entrega, entregue_por = excluded.entregue_por, justificativa = null`,
        [id, b, hoje(), ctx.usuario.id],
      );
    }
    await evento(trx, id, ctx, 'entrega_em_lote', { bimestres: marcar });
  });
  return { entregues: marcar.length };
}
