// Link de rematrícula para a família: a secretaria gera/envia o link e os pais conferem os dados,
// enviam os documentos do aluno e assinam. Só o pagamento da 1ª parcela depende da escola.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError, limpar, formatarCpf } from '../util.js';
import { carregar, dadosColegio, ROTULOS } from './documentosService.js';
import * as email from './emailService.js';
import { cifrar, decifrar } from './segredo.js';
import * as mat from './matriculasService.js';

const DIAS_VALIDADE = 30;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const nomeColegio = () => dadosColegio().nome || 'Colégio São Mateus';
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function obterMat(id) {
  const m = await db('matriculas').where({ id }).first();
  if (!m) throw new HttpError(404, 'Matrícula não encontrada.');
  return m;
}

function validarPronta(m) {
  if (!mat.exigeUpload(m)) throw new HttpError(409, 'O link da família é só para rematrícula. Esta é uma matrícula nova.');
  if (['ativa', 'cancelada', 'transferida', 'concluida', 'nao_renovou'].includes(m.status)) throw new HttpError(409, 'Esta matrícula já está encerrada.');
  if (!m.serie || !m.turno || !m.responsavel_chave || m.valor_parcela == null) {
    throw new HttpError(400, 'Defina série, turno, responsável e valores (passos 1 e 2) antes de gerar o link para a família.');
  }
  if (m.assinatura_modo !== 'autentique') throw new HttpError(409, 'A assinatura desta matrícula está no modo manual (presencial). O link da família usa a assinatura digital.');
}

const urlDoToken = (token) => `${config.frontendUrl.replace(/\/$/, '')}/rematricula/${token}`;

/** Gera (ou reaproveita) o link da matrícula. */
export async function garantirLink(id) {
  const m = await obterMat(id);
  validarPronta(m);
  if (m.portal_token_enc && m.portal_expira_em && new Date(m.portal_expira_em) > new Date()) {
    const t = decifrar(m.portal_token_enc);
    if (t) return { url: urlDoToken(t), expira_em: m.portal_expira_em };
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const expira = new Date(Date.now() + DIAS_VALIDADE * 86_400_000);
  await db('matriculas').where({ id }).update({ portal_token_hash: hash(token), portal_token_enc: cifrar(token), portal_expira_em: expira, updated_at: new Date() });
  return { url: urlDoToken(token), expira_em: expira };
}

export async function revogarLink(id, usuarioId) {
  await obterMat(id);
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id }).update({ portal_token_hash: null, portal_token_enc: null, portal_expira_em: null, updated_at: new Date() });
    await mat.evento(trx, id, 'portal_revogado', 'Link da família cancelado', 'O link enviado deixou de funcionar.', usuarioId);
  });
}

export async function enviarLinkPorEmail(id, destino, usuarioId) {
  const m = await obterMat(id);
  validarPronta(m);
  const { contatos } = await mat.estado(id);
  const c = contatos.emails.find((x) => x.valor.toLowerCase() === String(destino || '').trim().toLowerCase());
  if (!c) throw new HttpError(400, 'Esse e-mail não consta no cadastro do aluno/responsáveis.');
  if (!(await email.configurado())) throw new HttpError(409, 'O envio de e-mail ainda não foi configurado. Vá em Gerencial → E-mail (envio).');
  const { url, expira_em } = await garantirLink(id);
  const [aluno, letivo] = await Promise.all([db('alunos').where({ id: m.aluno_id }).first(), db('anos_letivos').where({ ano: m.ano }).first()]);
  const colegio = nomeColegio();
  const primeiro = String(c.nome || '').split(' ')[0] || 'Olá';
  const prazo = letivo?.encerramento ? new Date(letivo.encerramento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null;
  const texto = `Olá, ${primeiro}!\n\nA rematrícula de ${aluno.nome_completo} para ${m.ano} no ${colegio} está aberta. Pelo link abaixo você confere seus dados, envia os documentos do aluno e assina o contrato, tudo pelo celular:\n\n${url}\n\n${prazo ? `Prazo: até ${prazo}.\n` : ''}Depois, a escola confirma o pagamento da 1ª parcela e conclui a rematrícula.\n\nSe você não esperava este e-mail, pode ignorá-lo.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c2340">
    <h2 style="color:#0f1a6b;margin:0 0 12px">Rematrícula ${m.ano}</h2>
    <p>Olá, <b>${esc(primeiro)}</b>!</p>
    <p>A rematrícula de <b>${esc(aluno.nome_completo)}</b> para ${m.ano} no ${esc(colegio)} está aberta. Pelo botão abaixo você confere seus dados, envia os documentos do aluno e assina o contrato, tudo pelo celular.</p>
    <p style="text-align:center;margin:26px 0"><a href="${url}" style="background:#f5c400;color:#0f1a6b;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:8px;display:inline-block">Fazer a rematrícula</a></p>
    ${prazo ? `<p style="color:#555">Prazo: até <b>${prazo}</b>.</p>` : ''}
    <p style="color:#555">Depois disso, a escola confirma o pagamento da 1ª parcela e conclui a rematrícula.</p>
    <p style="color:#888;font-size:12px">Se o botão não abrir, copie este endereço no navegador:<br>${url}<br>Se você não esperava este e-mail, pode ignorá-lo.</p></div>`;
  await email.enviar({ para: c.valor, assunto: `Rematrícula ${m.ano} — ${aluno.nome_completo}`, html, texto });
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id }).update({ portal_enviado_em: new Date(), portal_enviado_para: c.valor, updated_at: new Date() });
    await mat.evento(trx, id, 'portal_enviado', 'Link da rematrícula enviado à família', `Enviado por e-mail para ${c.nome} (${c.valor}).`, usuarioId);
  });
  return { url, expira_em };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- lado da família (sem login: o token é a credencial) ---------- */
async function porToken(token) {
  if (!/^[A-Za-z0-9_-]{20,60}$/.test(String(token || ''))) throw new HttpError(404, 'Link inválido.');
  const m = await db('matriculas').where({ portal_token_hash: hash(token) }).first();
  if (!m) throw new HttpError(404, 'Link inválido ou cancelado. Peça um novo link à secretaria.');
  if (m.portal_expira_em && new Date(m.portal_expira_em) < new Date()) throw new HttpError(410, 'Este link expirou. Peça um novo link à secretaria.');
  return m;
}

const CAMPOS_RESP = ['email', 'ddd', 'celular', 'telefone', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'];

export async function estadoPublico(token, { atualizar = false } = {}) {
  let m = await porToken(token);
  if (!m.portal_acesso_em) {
    await db.transaction(async (trx) => {
      await trx('matriculas').where({ id: m.id }).update({ portal_acesso_em: new Date() });
      await mat.evento(trx, m.id, 'portal_acessado', 'Família abriu o link', null, null);
    });
  }
  if (atualizar) await mat.sincronizar(m.id, null).catch(() => {});
  m = await db('matriculas').where({ id: m.id }).first();
  const e = await mat.estado(m.id);
  const { aluno, responsaveis } = await carregar(m.aluno_id);
  const resp = responsaveis[m.responsavel_chave];
  const letivo = e.letivo;
  const desc = Number(m.desconto_percentual || 0);
  const cheio = m.valor_parcela == null ? null : Number(m.valor_parcela);
  const final = cheio == null ? null : Math.round(cheio * (1 - desc / 100) * 100) / 100;
  const efetivada = m.status === 'ativa';
  const doDoc = (c) => e.assinaturas.find((a) => a.chave === c);
  return {
    colegio: nomeColegio(),
    aluno: { nome: aluno.nome_completo },
    ano: m.ano, encerramento: letivo?.encerramento || null,
    serie: m.serie, turno: m.turno,
    financeiro: { parcelas: m.parcelas, dia_vencimento: m.dia_vencimento, valor_parcela: cheio, desconto_percentual: desc, valor_final: final, valor_final_txt: final == null ? null : brl(final) },
    responsavel: resp ? {
      rotulo: ROTULOS[m.responsavel_chave], nome: resp.nome, cpf: formatarCpf(resp.cpf)?.replace(/^(\d{3})\.\d{3}\.\d{3}/, '$1.***.***') || null,
      ...Object.fromEntries(CAMPOS_RESP.map((k) => [k, resp[k] || ''])),
    } : null,
    docs: e.docs_aluno.map((d) => ({ chave: d.chave, rotulo: d.rotulo, enviado: d.ok, arquivo: d.arquivo ? d.arquivo.nome : null, enviado_em: d.arquivo?.enviado_em || null })),
    assinaturas: ['contrato', 'termo1', 'termo2'].map((c) => {
      const a = doDoc(c);
      return { chave: c, titulo: { contrato: 'Contrato de prestação de serviços', termo1: 'Termo 1 — Grupo de WhatsApp', termo2: 'Termo 2 — Redes sociais' }[c], status: a?.status || null, link: a && a.status !== 'assinado' && a.status !== 'cancelado' ? a.link : null };
    }),
    modo_assinatura: m.assinatura_modo,
    etapas: {
      dados: !!m.dados_confirmados_em,
      documentos: e.checks.docs_entregues === e.checks.docs_total,
      assinatura: e.checks.assinado,
      assinatura_enviada: e.checks.enviado || e.checks.assinado,
      parcela: !!m.parcela1_confirmada_em,
      efetivada,
    },
    simulado: e.driver === 'simulado',
  };
}

function numeros(v) { return String(v ?? '').replace(/\D/g, ''); }

export async function confirmarDados(token, body) {
  const m = await porToken(token);
  if (m.status === 'ativa') throw new HttpError(409, 'Rematrícula já concluída.');
  const { responsaveis } = await carregar(m.aluno_id);
  const resp = responsaveis[m.responsavel_chave];
  if (!resp) throw new HttpError(409, 'Responsável não definido. Procure a secretaria.');
  const d = limpar({ ...Object.fromEntries(CAMPOS_RESP.map((k) => [k, body?.[k]])) });
  if (!d.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new HttpError(400, 'Informe um e-mail válido.');
  const ddd = numeros(d.ddd); const cel = numeros(d.celular);
  if (ddd.length !== 2 || cel.length < 8 || cel.length > 9) throw new HttpError(400, 'Informe o celular com DDD (ex.: 65 99999-1234).');
  const up = {
    email: d.email.toLowerCase().slice(0, 150), ddd, celular: cel,
    telefone: d.telefone ? numeros(d.telefone).slice(0, 20) : null,
    cep: d.cep ? numeros(d.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2').slice(0, 9) : null,
    rua: d.rua?.slice(0, 150) || null, numero: d.numero?.slice(0, 20) || null, complemento: d.complemento?.slice(0, 100) || null,
    bairro: d.bairro?.slice(0, 100) || null, cidade: d.cidade?.slice(0, 100) || null, uf: d.uf ? d.uf.toUpperCase().slice(0, 2) : null,
  };
  const mudou = Object.keys(up).filter((k) => String(resp[k] ?? '') !== String(up[k] ?? ''));
  await db.transaction(async (trx) => {
    if (mudou.length) await trx('pessoas').where({ id: resp.id }).update({ ...up, updated_at: new Date() });
    await trx('matriculas').where({ id: m.id }).update({ dados_confirmados_em: new Date(), updated_at: new Date() });
    await mat.evento(trx, m.id, 'familia_dados', 'Família confirmou os dados cadastrais', mudou.length ? `Atualizou: ${mudou.join(', ')}.` : 'Dados conferidos, sem alterações.', null);
  });
}

export async function anexarDoc(token, chave, buffer, nome) {
  const m = await porToken(token);
  await mat.anexarDocumentoAluno(m.id, chave, buffer, nome, { origem: 'familia' });
}

export async function iniciarAssinatura(token) {
  const m = await porToken(token);
  if (m.status === 'ativa') throw new HttpError(409, 'Rematrícula já concluída.');
  if (!m.dados_confirmados_em) throw new HttpError(409, 'Confirme seus dados antes de assinar.');
  const e = await mat.estado(m.id);
  if (e.checks.docs_entregues < e.checks.docs_total) throw new HttpError(409, 'Envie os documentos do aluno antes de assinar.');
  if (!e.checks.enviado && !e.checks.assinado) {
    const { responsaveis } = await carregar(m.aluno_id);
    const resp = responsaveis[m.responsavel_chave];
    await mat.enviarParaAssinatura(m.id, 'email', null, resp?.email);
  }
}
