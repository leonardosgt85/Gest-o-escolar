import express, { Router } from 'express';
import { can } from '../middleware/auth.js';
import * as portal from '../services/portalService.js';
import * as massa from '../services/rematriculaMassaService.js';
import { db } from '../db.js';
import { HttpError, wrap } from '../util.js';
import * as svc from '../services/matriculasService.js';
import { modo } from '../services/autentique.js';

const router = Router();
const ler = can('academico.alunos', 1);
const gravar = can('academico.alunos', 2);
const id = (req) => Number(req.params.id);

const verValores = can('academico.valores', 1);
const gravarValores = can('academico.valores', 2);

router.get('/anos-letivos', ler, wrap(async (req, res) => res.json(await db('anos_letivos').orderBy('ano', 'desc'))));
router.put('/anos-letivos/:ano', gravarValores, wrap(async (req, res) => {
  const { parcelas, dia_vencimento, valor_parcela, abertura, encerramento, divulgacao_valores, ativo } = req.body;
  const up = {};
  if (parcelas != null) { up.parcelas = Number(parcelas); if (!Number.isInteger(up.parcelas) || up.parcelas < 1 || up.parcelas > 24) throw new HttpError(400, 'Parcelas deve ser um número inteiro entre 1 e 24.'); }
  if (dia_vencimento != null) { up.dia_vencimento = Number(dia_vencimento); if (!Number.isInteger(up.dia_vencimento) || up.dia_vencimento < 1 || up.dia_vencimento > 28) throw new HttpError(400, 'O dia de vencimento deve ficar entre 1 e 28.'); }
  if (valor_parcela != null) { up.valor_parcela = Number(valor_parcela); if (!(up.valor_parcela >= 0)) throw new HttpError(400, 'Valor inválido.'); }
  if (abertura !== undefined) up.abertura = abertura || null;
  if (encerramento !== undefined) up.encerramento = encerramento || null;
  if (divulgacao_valores !== undefined) up.divulgacao_valores = divulgacao_valores || null;
  if (ativo !== undefined) up.ativo = !!ativo;
  if (!(await db('anos_letivos').where({ ano: req.params.ano }).update({ ...up, updated_at: new Date() }))) throw new HttpError(404, 'Ano letivo não encontrado.');
  res.json({ ok: true });
}));

// ----- valores por série e turno -----
router.get('/precos/:ano', verValores, wrap(async (req, res) => res.json(await svc.listarPrecos(Number(req.params.ano)))));
router.put('/precos/:ano', gravarValores, wrap(async (req, res) => { await svc.salvarPreco(Number(req.params.ano), req.body, { criar: req.body.novo === true }); res.json(await svc.listarPrecos(Number(req.params.ano))); }));
router.delete('/precos/:ano/:id', gravarValores, wrap(async (req, res) => { await db('precos_serie').where({ id: Number(req.params.id), ano: Number(req.params.ano) }).del(); res.json(await svc.listarPrecos(Number(req.params.ano))); }));
router.post('/precos/:ano/copiar', gravarValores, wrap(async (req, res) => { await svc.copiarPrecos(Number(req.body.de), Number(req.params.ano), Number(req.body.reajuste_percentual || 0)); res.json(await svc.listarPrecos(Number(req.params.ano))); }));

// ----- envio em massa dos links de rematrícula -----
router.get('/rematricula-massa/previa', gravar, wrap(async (req, res) => res.json(await massa.previa(req.query.ano ? Number(req.query.ano) : undefined, req.query.aluno_id ? Number(req.query.aluno_id) : undefined))));
router.post('/rematricula-massa/enviar', gravar, wrap(async (req, res) => res.json(await massa.enviarLote(req.body.ano ? Number(req.body.ano) : undefined, req.body.itens, req.user.id))));

// ----- histórico do aluno -----
router.get('/aluno/:alunoId', ler, wrap(async (req, res) => res.json(await svc.historicoDoAluno(Number(req.params.alunoId)))));
router.post('/aluno/:alunoId', gravar, wrap(async (req, res) => {
  const { ano, status } = req.body;
  const m = await svc.iniciar(Number(req.params.alunoId), Number(ano), req.user.id, status === 'nao_renovou' ? 'nao_renovou' : undefined);
  res.status(201).json({ id: m.id });
}));

// ----- uma matrícula -----
router.get('/:id', ler, wrap(async (req, res) => res.json(await svc.estado(id(req)))));
router.patch('/:id', gravar, wrap(async (req, res) => { await svc.atualizar(id(req), req.body, req.user.id); res.json(await svc.estado(id(req))); }));
router.delete('/:id', gravar, wrap(async (req, res) => { await svc.excluir(id(req), req.user.id); res.json({ ok: true }); }));
router.post('/:id/avancar', gravar, wrap(async (req, res) => { await svc.avancar(id(req), req.user.id); res.json(await svc.estado(id(req))); }));
router.post('/:id/reabrir', gravar, wrap(async (req, res) => { await svc.reabrir(id(req), req.user.id); res.json(await svc.estado(id(req))); }));
router.post('/:id/parcela', gravar, wrap(async (req, res) => { await svc.confirmarParcela(id(req), req.body.confirmada !== false, req.user.id); res.json(await svc.estado(id(req))); }));
router.post('/:id/efetivar', gravar, wrap(async (req, res) => { await svc.efetivar(id(req), req.user.id); res.json(await svc.estado(id(req))); }));

// ----- documentos -----
router.get('/:id/documentos.zip', ler, wrap(async (req, res) => {
  const z = await svc.zipDosDocumentos(id(req), req.user.id);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${z.nome}"`,
    'X-Documentos-Info': encodeURIComponent(JSON.stringify({ responsavel: z.responsavel, avisos: z.avisos })),
    'Access-Control-Expose-Headers': 'X-Documentos-Info, Content-Disposition',
    'Cache-Control': 'no-store',
  });
  res.send(z.buffer);
}));
router.get('/:id/documentos/:docId/download', ler, wrap(async (req, res) => {
  const d = await svc.baixarDocumento(id(req), Number(req.params.docId));
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.arquivo)}`, 'Cache-Control': 'no-store' });
  res.send(d.conteudo);
}));

// ----- assinatura digital -----
router.post('/:id/assinatura/enviar', gravar, wrap(async (req, res) => { await svc.enviarParaAssinatura(id(req), req.body.canal, req.user.id, req.body.destino); res.json(await svc.estado(id(req))); }));
router.post('/:id/assinatura/atualizar', gravar, wrap(async (req, res) => { await svc.sincronizar(id(req), req.user.id); res.json(await svc.estado(id(req))); }));
router.post('/:id/assinatura/reenviar', gravar, wrap(async (req, res) => { await svc.reenviarLink(id(req)); res.json({ ok: true }); }));
router.post('/:id/assinatura/cancelar', gravar, wrap(async (req, res) => { await svc.cancelarEnvio(id(req), req.user.id); res.json(await svc.estado(id(req))); }));
router.get('/:id/assinatura/:assinaturaId/link', ler, wrap(async (req, res) => res.json({ link: await svc.linkDaAssinatura(Number(req.params.assinaturaId), id(req)) })));
router.post('/:id/assinatura/simular', gravar, wrap(async (req, res) => { await svc.simular(id(req), req.body.acao, req.user.id); res.json(await svc.estado(id(req))); }));
router.get('/:id/assinatura/driver', ler, (req, res) => res.json({ driver: modo() }));

// ----- assinatura manual (PDF digitalizado no corpo da requisição) -----
router.post('/:id/assinatura/manual/anexar', gravar, express.raw({ type: '*/*', limit: '15mb' }), wrap(async (req, res) => {
  await svc.anexarAssinado(id(req), String(req.query.chave || ''), String(req.query.arquivo || ''), req.body, req.user.id);
  res.json(await svc.estado(id(req)));
}));
router.post('/:id/assinatura/manual/conferir', gravar, wrap(async (req, res) => { await svc.conferirManual(id(req), req.body.ok !== false, req.user.id); res.json(await svc.estado(id(req))); }));

// ----- documentos do aluno por upload (rematrícula) -----
router.post('/:id/anexos/:chave', gravar, express.raw({ type: '*/*', limit: '11mb' }), wrap(async (req, res) => {
  await svc.anexarDocumentoAluno(id(req), req.params.chave, req.body, String(req.query.arquivo || ''), { usuarioId: req.user.id, origem: 'secretaria' });
  res.json(await svc.estado(id(req)));
}));
router.delete('/:id/anexos/:chave', gravar, wrap(async (req, res) => { await svc.removerAnexoAluno(id(req), req.params.chave, req.user.id); res.json(await svc.estado(id(req))); }));

// ----- link da família -----
router.get('/:id/portal/link', gravar, wrap(async (req, res) => res.json(await portal.garantirLink(id(req)))));
router.post('/:id/portal/enviar', gravar, wrap(async (req, res) => { await portal.enviarLinkPorEmail(id(req), req.body.email, req.user.id); res.json(await svc.estado(id(req))); }));
router.delete('/:id/portal', gravar, wrap(async (req, res) => { await portal.revogarLink(id(req), req.user.id); res.json(await svc.estado(id(req))); }));

export default router;
