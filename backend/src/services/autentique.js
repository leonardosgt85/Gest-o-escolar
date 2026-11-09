// Integração com o Autentique (API GraphQL v2) + conversão .docx → PDF.
// Sem AUTENTIQUE_TOKEN o driver é "simulado": nada sai da máquina e o retorno é simulado pela tela (só desenvolvimento).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { HttpError } from '../util.js';

const exec = promisify(execFile);

export const modo = () => (config.autentique.token ? 'autentique' : 'simulado');

/* ---------- conversão .docx → PDF ---------- */
// Usa o LibreOffice (se instalado). Sem ele, o .docx é enviado como está (o Autentique aceita Word).
export async function converterParaPdf(buffer, nomeBase) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csm-pdf-'));
  try {
    const entrada = path.join(dir, 'doc.docx');
    fs.writeFileSync(entrada, buffer);
    await exec(config.sofficePath, ['--headless', '--convert-to', 'pdf', '--outdir', dir, entrada], { timeout: 90_000, env: { ...process.env, HOME: dir } });
    const saida = path.join(dir, 'doc.pdf');
    if (!fs.existsSync(saida)) throw new Error('sem saída');
    return { buffer: fs.readFileSync(saida), arquivo: `${nomeBase}.pdf`, mime: 'application/pdf', convertido: true };
  } catch {
    return {
      buffer,
      arquivo: `${nomeBase}.docx`,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      convertido: false,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Confere se o LibreOffice (conversão docx → PDF) está instalado no servidor. */
export async function sofficeDisponivel() {
  try { await exec(config.sofficePath, ['--version'], { timeout: 20_000 }); return true; } catch { return false; }
}

/**
 * O Autentique só respeita "assinatura desenhada" (document.configs.signature_appearance) quando o campo de
 * assinatura está posicionado (positions). Para ter posição certa em qualquer contrato, acrescentamos ao PDF uma
 * "Folha de assinatura" no fim e posicionamos os campos nela. Exige PDF (LibreOffice instalado); com .docx
 * o envio segue sem posição e o Autentique mostra todas as opções de aparência.
 */
export async function prepararParaAssinatura(arquivo, { titulo, signatarios }) {
  if (arquivo.mime !== 'application/pdf') return { arquivo, posicoes: null };
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.load(arquivo.buffer);
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [595.28, 841.89];
  const pag = doc.addPage([W, H]);
  const num = doc.getPageCount();
  pag.drawText('Folha de assinatura', { x: 56, y: H - 80, size: 18, font: negrito, color: rgb(0.1, 0.1, 0.35) });
  pag.drawText(String(titulo || '').slice(0, 90), { x: 56, y: H - 104, size: 11, font: fonte, color: rgb(0.25, 0.25, 0.25) });
  pag.drawText('Assinado eletronicamente por meio do Autentique (Lei 14.063/2020).', { x: 56, y: H - 122, size: 9, font: fonte, color: rgb(0.4, 0.4, 0.4) });
  const px = Number(process.env.AUTENTIQUE_POS_X || 10);
  const py = Number(process.env.AUTENTIQUE_POS_Y || 22); // % do topo da página
  const posicoes = [];
  signatarios.forEach((sg, i) => {
    const topo = py + i * 22; // um bloco abaixo do outro
    const yLinha = H - (topo + 9) / 100 * H; // linha logo abaixo do campo (campo ocupa ~9% da altura)
    pag.drawLine({ start: { x: 56, y: yLinha }, end: { x: W - 56, y: yLinha }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
    pag.drawText(String(sg.nome || '').slice(0, 80), { x: 56, y: yLinha - 14, size: 11, font: negrito });
    pag.drawText(i === 0 ? 'Responsável financeiro(a)' : 'Representante da escola', { x: 56, y: yLinha - 28, size: 9, font: fonte, color: rgb(0.4, 0.4, 0.4) });
    posicoes.push([{ x: String(px.toFixed(1)), y: String(topo.toFixed(1)), z: num, element: 'SIGNATURE' }]);
  });
  const buffer = Buffer.from(await doc.save());
  return { arquivo: { ...arquivo, buffer }, posicoes };
}

/* ---------- GraphQL ---------- */
async function gql(corpo, arquivo) {
  const { url, token } = config.autentique;
  let res;
  try {
    if (arquivo) {
      // multipart conforme graphql-multipart-request-spec
      const fd = new FormData();
      fd.append('operations', JSON.stringify({ query: corpo.query, variables: { ...corpo.variables, file: null } }));
      fd.append('map', JSON.stringify({ 0: ['variables.file'] }));
      fd.append('0', new Blob([arquivo.buffer], { type: arquivo.mime }), arquivo.arquivo);
      res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    } else {
      res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    }
  } catch (e) {
    throw new HttpError(502, `Não foi possível falar com o Autentique: ${e.message}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new HttpError(502, `Autentique recusou a solicitação: ${msg}`);
  }
  return json.data;
}

const soDig = (s) => String(s || '').replace(/\D/g, '');
export function telefoneE164(ddd, num) {
  let d = soDig(num);
  if (d.startsWith('55') && d.length >= 12) return `+${d}`;
  d = soDig(ddd) + d;
  return d.length >= 10 ? `+55${d}` : null;
}

function signatario(s, canal, verificar = true, positions = null) {
  // Foto do rosto: LIVE (documento + selfie + prova de vida) | MANUAL (documento + selfie, a escola aprova) | PF_FACIAL (só selfie, valida no CPF) | vazio = sem verificação
  const v = config.autentique.verificacao;
  const extra = v && verificar ? { security_verifications: [{ type: v }] } : {};
  if (positions) extra.positions = positions;
  // PF_FACIAL compara a selfie com a foto oficial do CPF: informa o CPF do signatário para a validação
  const cpf = String(s.cpf || '').replace(/\D/g, '');
  if (v === 'PF_FACIAL' && verificar && cpf.length === 11) extra.configs = { cpf };
  if (canal === 'email') return { email: s.email, name: s.nome, action: 'SIGN', ...extra };
  return { phone: s.telefone, name: s.nome, delivery_method: canal === 'sms' ? 'DELIVERY_METHOD_SMS' : 'DELIVERY_METHOD_WHATSAPP', action: 'SIGN', ...extra };
}

const MUTATION_CRIAR = `mutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(${config.autentique.sandbox ? 'sandbox: true, ' : ''}document: $document, signers: $signers, file: $file) {
    id name signatures { public_id name email action { name } link { short_link } }
  }
}`;

/**
 * Cria o documento no Autentique e dispara o link ao(s) signatário(s).
 * signatarios[0] = responsável (canal escolhido); demais (ex.: representante da escola) vão por e-mail.
 */
export async function enviarDocumento({ nome, arquivo, signatarios, canal, mensagem, verificar = true, posicoes = null }) {
  if (modo() === 'simulado') {
    const id = `sim-${crypto.randomUUID()}`;
    return { documentoId: id, assinaturas: signatarios.map((s, i) => ({ publicId: `${id}-${i}`, email: s.email || null, link: `http://localhost/assinar/${id}` })) };
  }
  const signers = signatarios.map((s, i) => signatario(s, i === 0 ? canal : 'email', verificar, posicoes?.[i] || null));
  const data = await gql({ query: MUTATION_CRIAR, variables: { document: { name: nome, message: mensagem || undefined, configs: { signature_appearance: config.autentique.assinatura } }, signers } }, arquivo);
  const d = data.createDocument;
  // A resposta também traz a assinatura do dono da conta (sem ação de assinar): só contam as de SIGN,
  // casadas com os signatários pelo e-mail ou, quando o envio é por telefone, pela ordem.
  const assinam = d.signatures.filter((s) => s.action?.name === 'SIGN');
  const usados = new Set();
  const assinaturas = signatarios.map((sg, i) => {
    let achada = sg.email ? assinam.find((s) => !usados.has(s.public_id) && s.email?.toLowerCase() === sg.email.toLowerCase()) : null;
    if (!achada) achada = assinam.find((s) => !usados.has(s.public_id)) || assinam[i];
    if (achada) usados.add(achada.public_id);
    return { publicId: achada?.public_id || null, email: achada?.email || null, link: achada?.link?.short_link || null };
  });
  return { documentoId: d.id, assinaturas };
}

const QUERY_DOC = (id) => `query { document(id: ${JSON.stringify(id)}) {
  id name files { original signed }
  signatures { public_id name email action { name } viewed { created_at } signed { created_at } rejected { created_at } link { short_link } }
} }`;

// Estado atual do documento: por assinatura (viewed/signed/rejected) + URL do arquivo assinado quando concluído.
export async function consultarDocumento(documentoId) {
  if (modo() === 'simulado') return null;
  const { document: d } = await gql({ query: QUERY_DOC(documentoId) });
  if (!d) return null;
  return {
    arquivoAssinado: d.files?.signed || null,
    assinaturas: (d.signatures || []).map((s) => ({
      publicId: s.public_id,
      email: s.email,
      acao: s.action?.name,
      visualizadoEm: s.viewed?.created_at || null,
      assinadoEm: s.signed?.created_at || null,
      recusadoEm: s.rejected?.created_at || null,
      link: s.link?.short_link || null,
    })),
  };
}

export async function criarLink(publicId) {
  if (modo() === 'simulado') return null;
  const data = await gql({ query: `mutation { createLinkToSignature(public_id: ${JSON.stringify(publicId)}) { short_link } }` });
  return data.createLinkToSignature?.short_link || null;
}

export async function reenviar(publicIds) {
  if (modo() === 'simulado') return true;
  await gql({ query: `mutation { resendSignatures(public_ids: ${JSON.stringify(publicIds)}) }` });
  return true;
}

export async function baixarArquivo(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.autentique.token}` } });
  if (!res.ok) throw new HttpError(502, `Não foi possível baixar o arquivo assinado (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

// Webhook: HMAC-SHA256 do corpo bruto, no cabeçalho x-autentique-signature.
export function assinaturaWebhookValida(corpoBruto, cabecalho) {
  const segredo = config.autentique.webhookSecret;
  if (!segredo || !cabecalho) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(cabecalho));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function excluirDocumento(documentoId) {
  if (modo() === 'simulado') return true;
  await gql({ query: `mutation { deleteDocument(id: ${JSON.stringify(documentoId)}) }` });
  return true;
}
