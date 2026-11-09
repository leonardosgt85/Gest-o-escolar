import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const expiraEm = () => new Date(Date.now() + config.sessionMinutes * 60 * 1000);

export async function criarSessao(usuarioId, ip) {
  const token = crypto.randomBytes(32).toString('hex');
  await db('sessoes').insert({ token_hash: hash(token), usuario_id: usuarioId, expira_em: expiraEm(), ip });
  await db('usuarios').where({ id: usuarioId }).update({ ultimo_acesso: db.fn.now() });
  return token;
}

// Valida e renova (janela deslizante: o prazo reinicia a cada ação).
export async function buscarSessao(token) {
  if (!token) return null;
  const h = hash(token);
  const s = await db('sessoes').where({ token_hash: h }).first();
  if (!s) return null;
  if (new Date(s.expira_em) < new Date()) {
    await db('sessoes').where({ token_hash: h }).del();
    return null;
  }
  await db('sessoes').where({ token_hash: h }).update({ expira_em: expiraEm() });
  return s;
}

export async function encerrarSessao(token) {
  if (token) await db('sessoes').where({ token_hash: hash(token) }).del();
}

export async function limparExpiradas() {
  await db('sessoes').where('expira_em', '<', new Date()).del();
}
