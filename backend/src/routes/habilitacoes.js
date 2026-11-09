import { Router } from 'express';
import { db } from '../db.js';
import { can, requireAdmin } from '../middleware/auth.js';
import { HttpError, wrap } from '../util.js';

const router = Router();

router.get(
  '/',
  can('gerencial.habilitacoes', 1),
  wrap(async (req, res) => {
    res.json(await db('habilitacoes').orderBy('ordem'));
  }),
);

// Liga/desliga um módulo da escola (feature flag). Só administradores; o módulo núcleo não desliga.
router.patch(
  '/:chave',
  can('gerencial.habilitacoes', 2),
  requireAdmin,
  wrap(async (req, res) => {
    const h = await db('habilitacoes').where({ chave: req.params.chave }).first();
    if (!h) throw new HttpError(404, 'Módulo não encontrado.');
    if (h.nucleo) throw new HttpError(400, 'O módulo Gerencial é essencial e não pode ser desabilitado.');
    await db('habilitacoes').where({ chave: h.chave }).update({ ativo: !!req.body?.ativo });
    res.json({ ok: true });
  }),
);

export default router;
