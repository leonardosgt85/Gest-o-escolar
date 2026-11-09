// Introspecção do schema GraphQL do Autentique (somente leitura, não cria documento, não consome crédito).
//   node scripts/autentique-introspect.cjs            -> imprime resumo
//   node scripts/autentique-introspect.cjs --json     -> salva scripts/autentique-schema.json com tudo
// Lê AUTENTIQUE_KEY do backend/.env.
require('dotenv').config({ quiet: true })
const fs = require('node:fs')
const path = require('node:path')

const URL = 'https://api.autentique.com.br/v2/graphql'
const KEY = process.env.AUTENTIQUE_KEY
if (!KEY) { console.error('AUTENTIQUE_KEY ausente no .env'); process.exit(1) }

const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }'
const QUERY = `query ($n: String!) { __type(name: $n) {
  kind name description
  inputFields { name description defaultValue type { ${TYPE_REF} } }
  fields { name description args { name description type { ${TYPE_REF} } } type { ${TYPE_REF} } }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
} }`

async function gql(query, variables) {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ query, variables }) })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}
const unwrap = (t) => { while (t && t.ofType) t = t.ofType; return t }
const show = (t) => t.kind === 'NON_NULL' ? `${show(t.ofType)}!` : t.kind === 'LIST' ? `[${show(t.ofType)}]` : t.name

async function main() {
  const seen = new Map()
  const queue = ['DocumentInput', 'SignerInput']
  const mut = (await gql(QUERY, { n: 'Mutation' })).__type
  const create = mut.fields.find((f) => f.name === 'createDocument')
  seen.set('Mutation.createDocument', { name: 'createDocument(args)', kind: 'ARGS', inputFields: create.args })
  create.args.forEach((a) => queue.push(unwrap(a.type).name))
  while (queue.length) {
    const n = queue.shift()
    if (!n || seen.has(n) || n.startsWith('__')) continue
    const t = (await gql(QUERY, { n })).__type
    if (!t) continue
    seen.set(n, t)
    for (const f of t.inputFields || []) { const u = unwrap(f.type); if (['INPUT_OBJECT', 'ENUM'].includes(u.kind)) queue.push(u.name) }
  }
  if (process.argv.includes('--json')) {
    const out = path.join(__dirname, 'autentique-schema.json')
    fs.writeFileSync(out, JSON.stringify([...seen.values()], null, 2))
    console.log('Salvo em', out)
  }
  for (const t of seen.values()) {
    console.log(`\n=== ${t.name} (${t.kind}) ${t.description ? '— ' + t.description : ''}`)
    for (const f of t.inputFields || []) console.log(`  ${f.name}: ${show(f.type)}${f.defaultValue != null ? ' = ' + f.defaultValue : ''}${f.description ? '  // ' + f.description.replace(/\s+/g, ' ') : ''}`)
    for (const e of t.enumValues || []) console.log(`  ${e.name}${e.isDeprecated ? ' (deprecated)' : ''}${e.description ? '  // ' + e.description.replace(/\s+/g, ' ') : ''}`)
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1 })
