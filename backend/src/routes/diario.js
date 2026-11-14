import { Router } from 'express';
import { wrap } from '../util.js';
import * as svc from '../services/diarioService.js';

const router = Router();
const ano = (req) => Number(req.query.ano) || new Date().getFullYear();

router.get('/minhas', wrap(async (req, res) => res.json(await svc.minhasTurmas(req.ctx, ano(req)))));
router.get('/:turmaId/:did', wrap(async (req, res) => res.json(await svc.abrir(req.ctx, Number(req.params.turmaId), Number(req.params.did)))));
router.get('/:turmaId/:did/dia', wrap(async (req, res) => res.json(await svc.dia(req.ctx, Number(req.params.turmaId), Number(req.params.did), req.query.data))));
router.put('/:turmaId/:did/dia', wrap(async (req, res) => res.json(await svc.salvarDia(req.ctx, Number(req.params.turmaId), Number(req.params.did), req.body))));
router.delete('/:turmaId/:did/dia', wrap(async (req, res) => res.json(await svc.excluirDia(req.ctx, Number(req.params.turmaId), Number(req.params.did), req.query.data))));
router.get('/:turmaId/:did/resumo', wrap(async (req, res) => res.json(await svc.resumo(req.ctx, Number(req.params.turmaId), Number(req.params.did), req.query.bimestre))));
router.put('/:turmaId/:did/notas', wrap(async (req, res) => res.json(await svc.salvarNotas(req.ctx, Number(req.params.turmaId), Number(req.params.did), req.body))));

export default router;
