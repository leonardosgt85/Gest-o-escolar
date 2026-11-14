import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { wrap } from '../util.js';
import * as svc from '../services/documentosAlunoService.js';
import * as diario from '../services/diarioService.js';
import { gerarPdf } from '../services/diarioPdf.js';

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

// Diário de classe mensal (PDF): mesmas regras de acesso do diário.
router.get('/diario-mensal', can('academico.diario', 1), wrap(async (req, res) => {
  const { turma_id, disciplina_id, ano, mes } = req.query;
  const dados = await diario.dadosMensais(req.ctx, Number(turma_id), Number(disciplina_id), ano, mes);
  const pdf = await gerarPdf(dados);
  const nome = `Diario-${dados.turma.serie}-${dados.turma.nome}-${dados.disciplina.nome}-${String(dados.mes).padStart(2, '0')}-${dados.ano}.pdf`.replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
  res.send(pdf);
}));

export default router;
