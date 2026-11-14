import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import usuariosRoutes from './routes/usuarios.js';
import gruposRoutes from './routes/grupos.js';
import habilitacoesRoutes from './routes/habilitacoes.js';
import pessoasRoutes from './routes/pessoas.js';
import alunosRoutes from './routes/alunos.js';
import configuracoesRoutes from './routes/configuracoes.js';
import portalRoutes from './routes/portal.js';
import matriculasRoutes from './routes/matriculas.js';
import relatoriosRoutes from './routes/relatorios.js';
import cadastrosRoutes from './routes/cadastros.js';
import diarioRoutes from './routes/diario.js';
import itensRoutes from './routes/itens.js';
import { assinaturaWebhookValida } from './services/autentique.js';
import { processarWebhook } from './services/matriculasService.js';
import { OPCOES } from './fields.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  // Webhook do Autentique: precisa do corpo bruto para validar o HMAC (antes do express.json).
  app.post('/api/autentique/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const bruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!assinaturaWebhookValida(bruto, req.get('x-autentique-signature'))) return res.status(401).json({ error: 'Assinatura inválida.' });
    res.json({ ok: true }); // responde primeiro; o processamento é assíncrono
    let payload = {};
    try { payload = JSON.parse(bruto.toString('utf8')); } catch { return; }
    processarWebhook(payload).catch((e) => console.error('Webhook Autentique:', e.message));
  });
  app.use(express.json({ limit: '8mb' })); // fotos em data URL
  app.use(cookieParser());
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 1500, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.get('/api/opcoes', requireAuth, (req, res) => res.json(OPCOES));
  app.use('/api/usuarios', requireAuth, usuariosRoutes);
  app.use('/api/grupos', requireAuth, gruposRoutes);
  app.use('/api/habilitacoes', requireAuth, habilitacoesRoutes);
  app.use('/api/pessoas', requireAuth, pessoasRoutes);
  app.use('/api/alunos', requireAuth, alunosRoutes);
  app.use('/api/matriculas', requireAuth, matriculasRoutes);
  app.use('/api/relatorios', requireAuth, relatoriosRoutes);
  app.use('/api/cadastros', requireAuth, cadastrosRoutes);
  app.use('/api/diario', requireAuth, diarioRoutes);
  app.use('/api/itens', requireAuth, itensRoutes);
  app.use('/api/configuracoes', requireAuth, configuracoesRoutes);
  app.use('/api/portal', portalRoutes); // público: o token do link é a credencial

  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo muito grande (limite 8MB).' });
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });
  return app;
}
