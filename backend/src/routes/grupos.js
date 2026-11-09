import { Router } from 'express';
import { db } from '../db.js';
import { can } from '../middleware/auth.js';
import { valorValido } from '../permissions/catalog.js';
import { HttpError, limpar, wrap } from '../util.js';

const router = Router();
const VINCULOS = ['Todos', 'Apenas usuários nível avançado'];
const JANELAS = ['seg_sex', 'sabado', 'domingo', 'feriado'];

function lerHorarios(h = {}) {
  const out = {};
  for (const j of JANELAS) {
    const de = h[j]?.de || '';
    const ate = h[j]?.ate || '';
    for (const v of [de, ate]) if (v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, 'Horário inválido (use HH:MM).');
    out[j] = { de, ate };
  }
  return out;
}

async function salvarPermissoes(trx, grupoId, permissoes = {}) {
  await trx('grupo_permissoes').where({ grupo_id: grupoId }).del();
  const linhas = Object.entries(permissoes)
    .filter(([chave, valor]) => valorValido(chave, valor))
    .map(([chave, valor]) => ({ grupo_id: grupoId, chave, valor }));
  if (linhas.length) await trx('grupo_permissoes').insert(linhas);
}

router.get(
  '/',
  can('gerencial.grupos', 1),
  wrap(async (req, res) => {
    const grupos = await db('grupos_permissao as g')
      .leftJoin('usuarios as u', 'u.grupo_id', 'g.id')
      .groupBy('g.id')
      .select('g.id', 'g.nome', 'g.vinculo_perfil')
      .count('u.id as qtd_usuarios')
      .orderBy('g.nome');
    res.json(grupos.map((g) => ({ ...g, qtd_usuarios: Number(g.qtd_usuarios) })));
  }),
);

router.get(
  '/:id',
  can('gerencial.grupos', 1),
  wrap(async (req, res) => {
    const g = await db('grupos_permissao').where({ id: req.params.id }).first();
    if (!g) throw new HttpError(404, 'Grupo não encontrado.');
    const linhas = await db('grupo_permissoes').where({ grupo_id: g.id });
    res.json({ ...g, permissoes: Object.fromEntries(linhas.map((l) => [l.chave, l.valor])) });
  }),
);

router.get(
  '/:id/usuarios',
  can('gerencial.grupos', 1),
  wrap(async (req, res) => {
    res.json(await db('usuarios').where({ grupo_id: req.params.id }).select('id', 'nome_completo', 'email', 'nivel', 'situacao', 'ultimo_acesso').orderBy('nome_completo'));
  }),
);

router.post(
  '/',
  can('gerencial.grupos', 2),
  wrap(async (req, res) => {
    const { nome, vinculo_perfil, horarios, permissoes } = req.body || {};
    const n = limpar({ nome }).nome;
    if (!n) throw new HttpError(400, 'Informe o nome do grupo.');
    if (vinculo_perfil && !VINCULOS.includes(vinculo_perfil)) throw new HttpError(400, 'Vínculo de perfil inválido.');
    if (await db('grupos_permissao').whereRaw('lower(nome) = ?', [n.toLowerCase()]).first()) throw new HttpError(409, 'Já existe um grupo com este nome.');
    const id = await db.transaction(async (trx) => {
      const [g] = await trx('grupos_permissao')
        .insert({ nome: n, vinculo_perfil: vinculo_perfil || 'Todos', horarios: JSON.stringify(lerHorarios(horarios)) })
        .returning('id');
      await salvarPermissoes(trx, g.id, permissoes);
      return g.id;
    });
    res.status(201).json({ id });
  }),
);

router.put(
  '/:id',
  can('gerencial.grupos', 2),
  wrap(async (req, res) => {
    const g = await db('grupos_permissao').where({ id: req.params.id }).first();
    if (!g) throw new HttpError(404, 'Grupo não encontrado.');
    const { nome, vinculo_perfil, horarios, permissoes } = req.body || {};
    const n = limpar({ nome }).nome;
    if (!n) throw new HttpError(400, 'Informe o nome do grupo.');
    if (vinculo_perfil && !VINCULOS.includes(vinculo_perfil)) throw new HttpError(400, 'Vínculo de perfil inválido.');
    const dup = await db('grupos_permissao').whereRaw('lower(nome) = ?', [n.toLowerCase()]).whereNot({ id: g.id }).first();
    if (dup) throw new HttpError(409, 'Já existe um grupo com este nome.');
    await db.transaction(async (trx) => {
      await trx('grupos_permissao')
        .where({ id: g.id })
        .update({ nome: n, vinculo_perfil: vinculo_perfil || 'Todos', horarios: JSON.stringify(lerHorarios(horarios)), updated_at: db.fn.now() });
      await salvarPermissoes(trx, g.id, permissoes);
    });
    res.json({ ok: true });
  }),
);

// "Duplicar Permissão": cria um grupo novo a partir de outro.
router.post(
  '/:id/duplicar',
  can('gerencial.grupos', 2),
  wrap(async (req, res) => {
    const g = await db('grupos_permissao').where({ id: req.params.id }).first();
    if (!g) throw new HttpError(404, 'Grupo não encontrado.');
    let nome = limpar({ nome: req.body?.nome }).nome || `${g.nome} (cópia)`;
    while (await db('grupos_permissao').whereRaw('lower(nome) = ?', [nome.toLowerCase()]).first()) nome += ' (cópia)';
    const id = await db.transaction(async (trx) => {
      const [novo] = await trx('grupos_permissao').insert({ nome, vinculo_perfil: g.vinculo_perfil, horarios: JSON.stringify(g.horarios) }).returning('id');
      const linhas = await trx('grupo_permissoes').where({ grupo_id: g.id });
      if (linhas.length) await trx('grupo_permissoes').insert(linhas.map((l) => ({ grupo_id: novo.id, chave: l.chave, valor: l.valor })));
      return novo.id;
    });
    res.status(201).json({ id, nome });
  }),
);

router.delete(
  '/:id',
  can('gerencial.grupos', 2),
  wrap(async (req, res) => {
    const em_uso = await db('usuarios').where({ grupo_id: req.params.id }).count('id as n').first();
    if (Number(em_uso.n) > 0) throw new HttpError(409, 'Este grupo possui usuários vinculados. Mova os usuários para outro grupo antes de excluir.');
    const n = await db('grupos_permissao').where({ id: req.params.id }).del();
    if (!n) throw new HttpError(404, 'Grupo não encontrado.');
    res.json({ ok: true });
  }),
);

export default router;
