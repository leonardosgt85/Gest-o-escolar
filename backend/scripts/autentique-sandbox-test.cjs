// Cria um documento de TESTE no Autentique com sandbox: true (não consome crédito de documento)
// para verificar: tela de aparência da assinatura, envio de e-mail no sandbox e reaproveitamento da assinatura.
//
//   node scripts/autentique-sandbox-test.js <email-signatario> [APARENCIA] [--verif TIPO] [--fallback]
//     APARENCIA: DRAW | HANDWRITING | ELECTRONIC | IMAGE | NONE   (padrão DRAW; NONE = não envia o campo)
//     --verif TIPO: MANUAL | UPLOAD | LIVE | PF_FACIAL ...  (ATENÇÃO: a doc não diz se sandbox isenta
//                   créditos de VALIDAÇÃO; só use depois de conferir o saldo antes/depois no painel)
//     --fallback:   envia fallback_behavior: DISABLE_FALLBACK junto com --verif
//     --cpf 00000000000: configs.cpf do signatário (necessário para testar PF_FACIAL)
//
// Exemplos:
//   node scripts/autentique-sandbox-test.js voce@exemplo.com DRAW
//   node scripts/autentique-sandbox-test.js voce@exemplo.com ELECTRONIC
// Depois: confira se o e-mail chegou, abra o link e anote o que a tela mostra.
require('dotenv').config({ quiet: true })

const URL = 'https://api.autentique.com.br/v2/graphql'
const KEY = process.env.AUTENTIQUE_KEY
const args = process.argv.slice(2)
const email = args[0]
const appearance = (args[1] && !args[1].startsWith('--') ? args[1] : 'DRAW').toUpperCase()
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || true) : null }
if (!KEY || !email) { console.error('Uso: node scripts/autentique-sandbox-test.js <email> [DRAW|HANDWRITING|ELECTRONIC|IMAGE|NONE] [--verif TIPO] [--fallback] [--cpf N]'); process.exit(1) }

// PDF mínimo de 1 página, gerado em memória
function tinyPdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const stream = `BT /F1 14 Tf 60 780 Td (${text}) Tj ET`
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let pdf = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16)
  const document = { name: `TESTE sandbox ${appearance} ${stamp}` }
  if (appearance !== 'NONE') document.configs = { signature_appearance: appearance }

  const signer = { email, action: 'SIGN', positions: [{ x: '50.0', y: '80.0', z: 1, element: 'SIGNATURE' }] }
  const verif = flag('--verif')
  if (verif) {
    signer.security_verifications = [{ type: String(verif).toUpperCase(), ...(flag('--fallback') ? { fallback_behavior: 'DISABLE_FALLBACK' } : {}) }]
    console.warn('AVISO: verificação adicional incluída — confira o saldo de créditos no painel antes e depois.')
  }
  const cpf = flag('--cpf')
  if (cpf) signer.configs = { cpf: String(cpf) }

  const query = `mutation ($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(sandbox: true, document: $document, signers: $signers, file: $file) {
      id name created_at
      signatures { public_id name email action { name } link { short_link } }
    } }`
  const form = new FormData()
  form.append('operations', JSON.stringify({ query, variables: { document, signers: [signer], file: null } }))
  form.append('map', JSON.stringify({ file: ['variables.file'] }))
  form.append('file', new Blob([tinyPdf(`Teste sandbox - aparencia ${appearance}`)], { type: 'application/pdf' }), 'teste.pdf')

  console.log('Enviando:', JSON.stringify({ document, signers: [signer] }, null, 2))
  const r = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form })
  const j = await r.json()
  console.log(JSON.stringify(j, null, 2))
  if (j.errors) process.exitCode = 1
}
main().catch((e) => { console.error(e); process.exitCode = 1 })