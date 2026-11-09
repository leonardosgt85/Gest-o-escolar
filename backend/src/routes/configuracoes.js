import { Router } from 'express';
import { wrap } from '../util.js';
import { can } from '../middleware/auth.js';
import * as email from '../services/emailService.js';

const router = Router();
router.get('/email', can('gerencial.email', 1), wrap(async (req, res) => res.json(await email.obterConfig())));
router.put('/email', can('gerencial.email', 2), wrap(async (req, res) => { await email.salvarConfig(req.body, req.user.id); res.json(await email.obterConfig()); }));
router.post('/email/testar', can('gerencial.email', 2), wrap(async (req, res) => { await email.testar(req.body?.para); res.json({ ok: true }); }));

export default router;
