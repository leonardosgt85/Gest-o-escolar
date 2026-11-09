// Rotas PÚBLICAS do link de rematrícula (o token do link é a credencial). Montadas sem requireAuth.
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { wrap } from '../util.js';
import * as portal from '../services/portalService.js';

const router = Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos.' } }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/:token', wrap(async (req, res) => res.json(await portal.estadoPublico(req.params.token, { atualizar: req.query.atualizar === '1' }))));
router.put('/:token/dados', wrap(async (req, res) => { await portal.confirmarDados(req.params.token, req.body); res.json(await portal.estadoPublico(req.params.token)); }));
router.post('/:token/documentos/:chave', express.raw({ type: '*/*', limit: '11mb' }), wrap(async (req, res) => {
  await portal.anexarDoc(req.params.token, req.params.chave, req.body, String(req.query.arquivo || ''));
  res.json(await portal.estadoPublico(req.params.token));
}));
router.post('/:token/assinar', wrap(async (req, res) => { await portal.iniciarAssinatura(req.params.token); res.json(await portal.estadoPublico(req.params.token)); }));

export default router;
