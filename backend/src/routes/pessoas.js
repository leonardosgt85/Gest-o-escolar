import { Router } from 'express';
import { db } from '../db.js';
import { can } from '../middleware/auth.js';
import { PESSOA_CAMPOS, PESSOA_DATAS, PESSOA_JSON, OPCOES } from '../fields.js';
import { HttpError, cpfValido, ehData, formatarCpf, limpar, paginacao, pick, semAcento, semAcentoSql, soDigitos, wrap } from '../util.js';

const router = Router();

const LISTA = ['p.id', 'p.nome', 'p.cpf', 'p.sexo', 'p.email', 'p.ultimo_login', 'p.celular', 'p.telefone'];

function filtros(q, query) {
  if (query.codigo) q.where('p.id', Number(query.codigo) || 0);
  if (query.nome) q.whereRaw(`${semAcentoSql('p.nome')} like ?`, [`%${semAcento(query.nome)}%`]);
  if (query.cpf) q.whereRaw("regexp_replace(coalesce(p.cpf,''), '\\D', '', 'g') like ?", [`%${soDigitos(query.cpf)}%`]);
  if (query.email) q.whereRaw('lower(p.email) like ?', [`%${String(query.email).toLowerCase()}%`]);
}

// Modal "Vincular / Consultar": filtros Código, Nome, CPF, E-mail.
router.get(
  '/',
  can('academico.pessoas', 1),
  wrap(async (req, res) => {
    const { pagina, porPagina, offset } = paginacao(req.query);
    const base = db('pessoas as p');
    filtros(base, req.query);
    const total = Number((await base.clone().count('p.id as n').first()).n);
    const itens = await base.clone().select(LISTA).orderBy('p.nome').limit(porPagina).offset(offset);
    res.json({ itens, total, pagina, por_pagina: porPagina });
  }),
);

router.get(
  '/:id',
  can('academico.pessoas', 1),
  wrap(async (req, res) => {
    const p = await db('pessoas').where({ id: req.params.id }).first();
    if (!p) throw new HttpError(404, 'Pessoa não encontrada.');
    res.json(p);
  }),
);

function preparar(body) {
  const dados = limpar(pick(body, PESSOA_CAMPOS));
  if (!dados.nome) throw new HttpError(400, 'Informe o nome.');
  if (dados.cpf) {
    if (!cpfValido(dados.cpf)) throw new HttpError(400, 'CPF inválido.');
    dados.cpf = formatarCpf(dados.cpf);
  }
  for (const c of PESSOA_DATAS) if (dados[c] && !ehData(dados[c])) throw new HttpError(400, 'Data inválida.');
  if (dados.sexo && !OPCOES.sexo.includes(dados.sexo)) throw new HttpError(400, 'Sexo inválido.');
  if (dados.estado_civil && !OPCOES.estado_civil.includes(dados.estado_civil)) throw new HttpError(400, 'Estado civil inválido.');
  for (const j of PESSOA_JSON) if (j in (body || {})) dados[j] = JSON.stringify(body[j] ?? (j === 'ref_comerciais' ? [] : {}));
  return dados;
}

async function checarCpf(cpf, ignorarId) {
  if (!cpf) return;
  const q = db('pessoas').where({ cpf });
  if (ignorarId) q.whereNot({ id: ignorarId });
  if (await q.first()) throw new HttpError(409, 'Já existe uma pessoa cadastrada com este CPF.');
}

router.post(
  '/',
  can('academico.pessoas', 2),
  wrap(async (req, res) => {
    const dados = preparar(req.body);
    await checarCpf(dados.cpf);
    const [novo] = await db('pessoas').insert({ ...dados, created_by: req.user.id, updated_by: req.user.id }).returning('id');
    res.status(201).json({ id: novo.id });
  }),
);

router.put(
  '/:id',
  can('academico.pessoas', 2),
  wrap(async (req, res) => {
    const atual = await db('pessoas').where({ id: req.params.id }).first();
    if (!atual) throw new HttpError(404, 'Pessoa não encontrada.');
    const dados = preparar(req.body);
    await checarCpf(dados.cpf, atual.id);
    await db('pessoas').where({ id: atual.id }).update({ ...dados, updated_by: req.user.id, updated_at: db.fn.now() });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  can('academico.pessoas.excluir', 1),
  wrap(async (req, res) => {
    const id = req.params.id;
    const uso = await db('alunos')
      .whereNull('excluido_em')
      .where((b) => b.where({ pai_id: id }).orWhere({ mae_id: id }).orWhere({ resp_pedagogico_id: id }))
      .count('id as n')
      .first();
    if (Number(uso.n) > 0) throw new HttpError(409, 'Esta pessoa está vinculada a alunos e não pode ser excluída.');
    const n = await db('pessoas').where({ id }).del();
    if (!n) throw new HttpError(404, 'Pessoa não encontrada.');
    res.json({ ok: true });
  }),
);

export default router;
