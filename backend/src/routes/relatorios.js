import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { wrap } from '../util.js';
import * as svc from '../services/documentosAlunoService.js';

const router = Router();
const ler = can('academico.alunos', 1);

router.get('/documentos/aluno/:id', ler, wrap(async (req, res) => {
  res.json({ ...(await svc.sugestoes(Number(req.params.id))), disciplinas: svc.DISCIPLINAS_PADRAO });
}));

router.post('/documentos/gerar', ler, wrap(async (req, res) => {
  const { buffer, mime, nome } = await svc.gerar(req.body?.tipo, req.body?.dados);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(buffer);
}));

export default router;
