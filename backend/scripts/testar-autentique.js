// Teste da chave do Autentique (modo sandbox: não gasta crédito).
// Uso:  npm run autentique:testar -- seu-email@exemplo.com
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import * as aut from '../src/services/autentique.js';

const email = process.argv[2];
const ok = (m) => console.log(`  OK   ${m}`);
const falha = (m) => { console.log(`  FALHA ${m}`); process.exitCode = 1; };

console.log('\nTeste do Autentique');
if (aut.modo() !== 'autentique') { falha('AUTENTIQUE_KEY não encontrada no backend/.env (ou o backend não foi reiniciado).'); process.exit(1); }
ok(`chave encontrada (${config.autentique.token.slice(0, 4)}…), sandbox=${config.autentique.sandbox}`);
if (!config.autentique.sandbox) { falha('AUTENTIQUE_SANDBOX está false: este teste consumiria crédito. Coloque true para testar.'); process.exit(1); }
if (!email) { falha('Informe um e-mail seu: npm run autentique:testar -- seu@email.com'); process.exit(1); }

let docId = null;
try {
  const modelo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'documentos', 'termo2_redes_sociais.docx');
  const arq = await aut.converterParaPdf(fs.readFileSync(modelo), 'Teste CSM');
  ok(`arquivo preparado (${arq.mime.includes('pdf') ? 'PDF convertido pelo LibreOffice' : 'enviado como .docx, LibreOffice não encontrado'})`);
  const r = await aut.enviarDocumento({ nome: 'Teste CSM (sandbox)', arquivo: arq, signatarios: [{ nome: 'Teste', email }], canal: 'email' });
  docId = r.documentoId;
  ok(`documento criado: ${r.documentoId}`);
  console.log(`       link: ${r.assinaturas[0]?.link || '(sem link: o Autentique enviou por e-mail)'}`);
  const d = await aut.consultarDocumento(r.documentoId);
  ok(`consulta de status: ${d.assinaturas.length} assinatura(s), arquivo assinado: ${d.arquivoAssinado ? 'sim' : 'ainda não'}`);
  const link = await aut.criarLink(r.assinaturas[0].publicId);
  ok(`link de assinatura gerado: ${link}`);
  await aut.excluirDocumento(r.documentoId);
  ok('documento de teste apagado');
  console.log('\nTudo certo: a integração está funcionando com a sua chave.\n');
} catch (e) {
  falha(e.message);
  if (docId) await aut.excluirDocumento(docId).then(() => console.log('       (documento de teste apagado)')).catch(() => {});
  console.log('\nCopie esta mensagem de erro e me envie para eu ajustar.\n');
}
process.exit();
