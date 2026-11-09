import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { config } from '../config.js';
import { criarSessao, encerrarSessao } from '../services/sessionService.js';
import { carregarContexto, motivoBloqueio, requireAuth } from '../middleware/auth.js';
import { MODULOS, TIPOS } from '../permissions/catalog.js';
import { HttpError, wrap } from '../util.js';

const router = Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

function opcoesCookie() {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

export function montarMe(ctx) {
  const { usuario, grupo, permissoes, modulosAtivos } = ctx;
  return {
    id: usuario.id,
    nome: usuario.nome_completo,
    email: usuario.email,
    nivel: usuario.nivel,
    cargo: usuario.cargo,
    foto: usuario.foto,
    grupo: grupo ? { id: grupo.id, nome: grupo.nome } : null,
    modulos: [...modulosAtivos],
    // índice do acesso efetivo por permissão (0 = nega). Ver /api/permissoes/catalogo para os valores.
    permissoes,
    sessaoMinutos: config.sessionMinutes,
  };
}

router.post(
  '/login',
  limiteLogin,
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const usuario = email ? await db('usuarios').whereRaw('lower(email) = ?', [email]).first() : null;
    // compara sempre, para não revelar se o e-mail existe
    const ok = await bcrypt.compare(senha, usuario?.senha_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid');
    if (!usuario || !ok) throw new HttpError(401, 'E-mail ou senha inválidos.');
    const ctx = await carregarContexto(usuario.id);
    const bloqueio = motivoBloqueio(ctx);
    if (bloqueio) throw new HttpError(403, bloqueio);
    const token = await criarSessao(usuario.id, req.ip);
    res.cookie(config.cookieName, token, { ...opcoesCookie(), maxAge: config.sessionMinutes * 60 * 1000 });
    res.json(montarMe(ctx));
  }),
);

router.post(
  '/logout',
  wrap(async (req, res) => {
    await encerrarSessao(req.cookies?.[config.cookieName]);
    res.clearCookie(config.cookieName, opcoesCookie());
    res.json({ ok: true });
  }),
);

router.get('/me', requireAuth, (req, res) => res.json(montarMe(req.ctx)));

router.post(
  '/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const { senha_atual, nova_senha } = req.body || {};
    if (!nova_senha || String(nova_senha).length < 6) throw new HttpError(400, 'A nova senha deve ter ao menos 6 caracteres.');
    const ok = await bcrypt.compare(String(senha_atual || ''), req.user.senha_hash);
    if (!ok) throw new HttpError(400, 'Senha atual incorreta.');
    await db('usuarios').where({ id: req.user.id }).update({ senha_hash: await bcrypt.hash(String(nova_senha), 10), updated_at: db.fn.now() });
    res.json({ ok: true });
  }),
);

// Catálogo para as telas de grupo/usuário (abas por módulo, valores por tipo).
router.get('/catalogo', requireAuth, (req, res) => res.json({ tipos: TIPOS, modulos: MODULOS }));

export default router;
