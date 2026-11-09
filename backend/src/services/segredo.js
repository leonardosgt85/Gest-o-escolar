// Cifra simples (AES-256-GCM) para guardar no banco senhas SMTP e tokens de link.
// A chave vem de APP_SECRET (defina no .env em produção); sem ela, deriva da senha do banco.
import crypto from 'node:crypto';

function chave() {
  const base = process.env.APP_SECRET || `csm-dev:${process.env.DB_PASSWORD || ''}:${process.env.DB_NAME || ''}`;
  return crypto.createHash('sha256').update(base).digest();
}

export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const enc = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decifrar(valor) {
  if (!valor) return '';
  try {
    const [iv, tag, enc] = String(valor).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return ''; // chave trocada ou dado corrompido
  }
}
