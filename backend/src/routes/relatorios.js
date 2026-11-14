import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { wrap } from '../util.js';
import * as svc from '../services/documentosAlunoService.js';
import * as diario from '../services/diarioService.js';
import { gerarPdf } from '../services/diarioPdf.js';
import * as relAluno from '../services/alunoRelatorioService.js';
import { gerar as gerarPdfAluno } from '../services/alunoPdf.js';

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

// Relatório do aluno (visão 360°) e seus PDFs.
const anoReq = (req) => Number(req.query.ano) || new Date().getFullYear();
router.get('/aluno/:id', ler, wrap(async (req, res) => res.json(await relAluno.dados(req.ctx, Number(req.params.id), anoReq(req)))));
// Atestados emitidos direto do relatório (com os dados sugeridos do aluno).
router.get('/aluno/:id/documento', ler, wrap(async (req, res) => {
  const tipo = req.query.tipo;
  if (!['escolaridade', 'conclusao'].includes(tipo)) return res.status(400).json({ error: 'Tipo de documento inválido.' });
  const sug = await svc.sugestoes(Number(req.params.id));
  const { buffer, mime, nome } = await svc.gerar(tipo, sug[tipo]);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(buffer);
}));
const PDFS = { boletim: [['notas', 'frequencia'], 'Boletim'], material: [['material'], 'Extrato de material e uniformes'], matricula: [['matricula', 'responsaveis'], 'Ficha do aluno'], completo: [['matricula', 'notas', 'frequencia', 'material', 'documentos', 'responsaveis'], 'Relatório do aluno'] };
router.get('/aluno/:id/pdf', ler, wrap(async (req, res) => {
  const def = PDFS[req.query.tipo];
  if (!def) return res.status(400).json({ error: 'Tipo de PDF inválido.' });
  const d = await relAluno.dados(req.ctx, Number(req.params.id), anoReq(req));
  const buf = await gerarPdfAluno(d, def[0], def[1]);
  const nome = `${def[1]}-${d.aluno.nome}-${d.ano}.pdf`.replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
  res.send(buf);
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
