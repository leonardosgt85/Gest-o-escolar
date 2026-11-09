// Envio de e-mail por SMTP (nodemailer). Configuração salva no banco (tela "E-mail") ou, se vazia, nas variáveis SMTP_* do .env.
import nodemailer from 'nodemailer';
import { db } from '../db.js';
import { HttpError } from '../util.js';
import { cifrar, decifrar } from './segredo.js';

export const PROVEDORES = [
  {
    chave: 'brevo', nome: 'Brevo (recomendado)', gratis: '300 e-mails/dia, grátis para sempre', host: 'smtp-relay.brevo.com', port: 587, secure: false,
    passos: ['Crie a conta grátis em brevo.com.', 'No painel: SMTP e API → Chaves SMTP → Gerar uma nova chave SMTP.', 'Usuário = o e-mail do seu login na Brevo; Senha = a chave SMTP gerada (não a senha de login).', 'Em Remetentes, valide o e-mail da escola que vai aparecer como remetente.'],
  },
  {
    chave: 'gmail', nome: 'Gmail', gratis: '500 e-mails/dia (conta gratuita)', host: 'smtp.gmail.com', port: 587, secure: false,
    passos: ['Ative a verificação em duas etapas na conta Google.', 'Em myaccount.google.com → Segurança → Senhas de app, gere uma senha de app.', 'Usuário = seu e-mail completo; Senha = a senha de app de 16 letras (não a senha normal).'],
  },
  {
    chave: 'resend', nome: 'Resend', gratis: '100 e-mails/dia e 3.000/mês, grátis', host: 'smtp.resend.com', port: 465, secure: true,
    passos: ['Crie a conta em resend.com e verifique o domínio da escola (exige acesso ao DNS).', 'Crie uma chave de API (API Keys).', 'Usuário = resend; Senha = a chave de API. O remetente precisa ser do domínio verificado.'],
  },
  {
    chave: 'outlook', nome: 'Outlook / Microsoft 365', gratis: 'depende da conta', host: 'smtp.office365.com', port: 587, secure: false,
    passos: ['Use o e-mail completo como usuário.', 'Contas com verificação em duas etapas precisam de senha de app; o administrador do Microsoft 365 pode ter desativado o SMTP autenticado.'],
  },
  { chave: 'outro', nome: 'Outro servidor SMTP', gratis: '', host: '', port: 587, secure: false, passos: ['Informe os dados SMTP fornecidos pela hospedagem do e-mail da escola.'] },
];

const CHAVE = 'email';

async function lerBruto() {
  const row = await db('configuracoes').where({ chave: CHAVE }).first();
  if (row?.valor?.host) return row.valor;
  if (process.env.SMTP_HOST) {
    return { provedor: 'outro', host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', user: process.env.SMTP_USER || '', pass_enc: process.env.SMTP_PASS ? cifrar(process.env.SMTP_PASS) : '', remetente_nome: process.env.SMTP_FROM_NAME || '', remetente_email: process.env.SMTP_FROM || process.env.SMTP_USER || '' };
  }
  return null;
}

/** Configuração para a tela (sem a senha). */
export async function obterConfig() {
  const c = await lerBruto();
  return {
    configurado: !!(c?.host && c?.remetente_email),
    provedor: c?.provedor || 'brevo', host: c?.host || '', port: c?.port || 587, secure: !!c?.secure, user: c?.user || '',
    senha_definida: !!c?.pass_enc, remetente_nome: c?.remetente_nome || '', remetente_email: c?.remetente_email || '',
    provedores: PROVEDORES,
  };
}

export async function salvarConfig(body, usuarioId) {
  const atual = (await db('configuracoes').where({ chave: CHAVE }).first())?.valor || {};
  const t = (v) => String(v ?? '').trim();
  const host = t(body.host);
  const email = t(body.remetente_email);
  if (!host) throw new HttpError(400, 'Informe o servidor SMTP.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Informe um e-mail de remetente válido.');
  const port = Number(body.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Porta inválida.');
  const valor = {
    provedor: t(body.provedor) || 'outro', host, port, secure: !!body.secure, user: t(body.user),
    pass_enc: t(body.senha) ? cifrar(t(body.senha).replace(/\s+/g, '')) : atual.pass_enc || '', // senhas de app do Google vêm com espaços
    remetente_nome: t(body.remetente_nome).slice(0, 80), remetente_email: email,
  };
  await db('configuracoes').insert({ chave: CHAVE, valor: JSON.stringify(valor), updated_by: usuarioId, updated_at: new Date() })
    .onConflict('chave').merge();
}

function transporte(c) {
  return nodemailer.createTransport({
    host: c.host, port: Number(c.port), secure: Number(c.port) === 465, // 465 = SSL direto; 587/25 = STARTTLS (marcar SSL em 587 dá erro)
    auth: c.user ? { user: c.user, pass: decifrar(c.pass_enc) } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 25_000,
  });
}

function traduzir(e) {
  const m = String(e?.message || e);
  if (/Invalid login|535|authentication|auth/i.test(m)) return 'O servidor recusou o usuário ou a senha. Confira o usuário e use a senha/chave SMTP (no Gmail, a senha de app).';
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'Servidor SMTP não encontrado. Confira o endereço do servidor.';
  if (/ECONNREFUSED|ETIMEDOUT|timeout|ESOCKET/i.test(m)) return 'Não foi possível conectar ao servidor SMTP. Confira a porta e a opção de conexão segura (SSL) e se o servidor permite a saída dessa porta.';
  if (/sender|from|not verified|verify/i.test(m)) return `O servidor recusou o remetente: o e-mail do remetente precisa estar validado no provedor. (${m})`;
  return `Falha no envio: ${m}`;
}

export async function configurado() {
  const c = await lerBruto();
  return !!(c?.host && c?.remetente_email);
}

export async function enviar({ para, assunto, html, texto }) {
  const c = await lerBruto();
  if (!c?.host || !c?.remetente_email) throw new HttpError(409, 'O envio de e-mail ainda não foi configurado. Vá em Gerencial → E-mail (envio).');
  try {
    // Gmail/Outlook só enviam "em nome" do próprio usuário; outro domínio no From cai no spam ou é descartado.
    const proprio = /gmail|office365|outlook/i.test(c.host) && c.user && c.user.toLowerCase() !== c.remetente_email.toLowerCase();
    const info = await transporte(c).sendMail({
      from: c.remetente_nome ? { name: c.remetente_nome, address: proprio ? c.user : c.remetente_email } : (proprio ? c.user : c.remetente_email),
      replyTo: proprio ? c.remetente_email : undefined,
      to: para, subject: assunto, html, text: texto,
    });
    if (info.rejected?.length) throw new Error(`destinatário recusado: ${info.rejected.join(', ')}`);
  } catch (e) {
    throw new HttpError(502, traduzir(e));
  }
}

export async function testar(para) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(para || ''))) throw new HttpError(400, 'Informe o e-mail que vai receber o teste.');
  await enviar({
    para, assunto: 'Teste de e-mail — CSM Gestão Escolar',
    html: '<p>Tudo certo! O envio de e-mail do <b>CSM Gestão Escolar</b> está funcionando.</p>', texto: 'Tudo certo! O envio de e-mail do CSM Gestão Escolar está funcionando.',
  });
}
