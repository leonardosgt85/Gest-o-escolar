// Material didático, uniformes e outros itens do aluno.
import { serieNormalizada } from '../services/seriesDb.js';
import { Router } from 'express';
import { db } from '../db.js';
import { can } from '../middleware/auth.js';
import { HttpError, wrap } from '../util.js';
import * as svc from '../services/itensService.js';

const router = Router();
const verCat = can('gerencial.cadastros', 1);
const gravCat = can('gerencial.cadastros', 2);
const ver = can('academico.itens', 1);
const grav = can('academico.itens', 2);
const ano = (req) => Number(req.query.ano) || new Date().getFullYear();
const dup = (e) => { if (e.code === '23505') throw new HttpError(409, 'Item já cadastrado.'); throw e; };

/* catálogo (preço por ano e série) */
router.get('/catalogo', verCat, wrap(async (req, res) => {
  const q = db('itens_catalogo').orderBy([{ column: 'tipo' }, { column: 'serie', nulls: 'first' }, { column: 'nome' }]);
  q.where('ano', ano(req));
  res.json((await q).map((c) => ({ ...c, valor: Number(c.valor) })));
}));
router.post('/catalogo', gravCat, wrap(async (req, res) => {
  const d = svc.validarCatalogo(req.body);
  if (d.serie) d.serie = await serieNormalizada(d.serie);
  if (await db('itens_catalogo').where({ ano: d.ano, tipo: d.tipo }).whereRaw('lower(nome) = lower(?)', [d.nome]).whereRaw("coalesce(lower(serie),'') = coalesce(lower(?),'')", [d.serie]).first()) throw new HttpError(409, 'Já existe este item neste ano e série.');
  const [n] = await db('itens_catalogo').insert(d).returning('*').catch(dup);
  res.status(201).json(n);
}));
router.put('/catalogo/:id', gravCat, wrap(async (req, res) => {
  const d = svc.validarCatalogo(req.body);
  if (d.serie) d.serie = await serieNormalizada(d.serie);
  if (req.body.ativo !== undefined) d.ativo = !!req.body.ativo;
  if (!(await db('itens_catalogo').where({ id: req.params.id }).update(d))) throw new HttpError(404, 'Item não encontrado.');
  res.json({ ok: true });
}));
router.delete('/catalogo/:id', gravCat, wrap(async (req, res) => {
  if (await db('aluno_itens').where({ catalogo_id: req.params.id, cancelado: false }).first()) throw new HttpError(409, 'Há alunos com este item. Cancele o item na ficha dos alunos ou inative-o (Editar › desmarcar “Item ativo”).');
  if (!(await db('itens_catalogo').where({ id: req.params.id }).del())) throw new HttpError(404, 'Item não encontrado.');
  res.json({ ok: true });
}));
router.post('/catalogo/copiar-ano', gravCat, wrap(async (req, res) => {
  const de = Number(req.body.de), para = Number(req.body.para);
  if (!de || !para || de === para) throw new HttpError(400, 'Escolha um ano de origem diferente do destino.');
  const f = 1 + (Number(String(req.body.reajuste_percentual ?? 0).replace(',', '.')) || 0) / 100;
  const origem = await db('itens_catalogo').where({ ano: de, ativo: true });
  if (!origem.length) throw new HttpError(409, `O ano ${de} não tem itens ativos.`);
  let criados = 0;
  for (const o of origem) {
    const ja = await db('itens_catalogo').where({ ano: para, tipo: o.tipo }).whereRaw('lower(nome) = lower(?)', [o.nome]).whereRaw("coalesce(lower(serie),'') = coalesce(lower(?),'')", [o.serie]).first();
    if (ja) continue;
    await db('itens_catalogo').insert({ ano: para, tipo: o.tipo, nome: o.nome, serie: o.serie, valor: Math.round(Number(o.valor) * f * 100) / 100, por_bimestre: o.por_bimestre });
    criados += 1;
  }
  res.json({ criados, existentes: origem.length - criados });
}));

/* itens do aluno */
router.get('/aluno/:alunoId', ver, wrap(async (req, res) => res.json(await svc.doAluno(Number(req.params.alunoId), ano(req)))));
router.post('/aluno/:alunoId', grav, wrap(async (req, res) => res.status(201).json(await svc.criar(req.ctx, Number(req.params.alunoId), req.body))));
router.put('/:id', grav, wrap(async (req, res) => res.json(await svc.atualizar(req.ctx, Number(req.params.id), req.body))));
router.delete('/:id', grav, wrap(async (req, res) => res.json(await svc.cancelar(req.ctx, Number(req.params.id)))));
router.post('/:id/pagamentos', grav, wrap(async (req, res) => res.status(201).json(await svc.registrarPagamento(req.ctx, Number(req.params.id), req.body))));
router.delete('/pagamentos/:pid', grav, wrap(async (req, res) => res.json(await svc.estornarPagamento(req.ctx, Number(req.params.pid)))));
router.post('/:id/entregar-liberadas', grav, wrap(async (req, res) => res.json(await svc.entregarLiberadas(req.ctx, Number(req.params.id)))));
router.put('/:id/entregas/:bimestre', grav, wrap(async (req, res) => res.json(await svc.marcarEntrega(req.ctx, Number(req.params.id), req.params.bimestre, req.body))));

export default router;
