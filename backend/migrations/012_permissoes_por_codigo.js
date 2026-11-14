// Permissões passam a ser gravadas pelo CÓDIGO do valor (0, 1, 2), não pelo rótulo ("Manutenção").
// Converte grupo_permissoes.valor e usuarios.permissoes_extras. Idempotente (código já numérico é mantido).
// Rótulos que não existem mais no catálogo valiam "nega" (0) e são descartados.
// FAÇA BACKUP DO BANCO ANTES. down() devolve os rótulos.
import { codigoValor, TIPOS, POR_CHAVE } from '../src/permissions/catalog.js';

export async function up(knex) {
  const linhas = await knex('grupo_permissoes').select('grupo_id', 'chave', 'valor');
  for (const l of linhas) {
    const c = codigoValor(l.chave, l.valor);
    if (c === null) await knex('grupo_permissoes').where({ grupo_id: l.grupo_id, chave: l.chave }).del();
    else if (String(c) !== l.valor) await knex('grupo_permissoes').where({ grupo_id: l.grupo_id, chave: l.chave }).update({ valor: String(c) });
  }
  const us = await knex('usuarios').select('id', 'permissoes_extras');
  for (const u of us) {
    const out = {};
    for (const [k, v] of Object.entries(u.permissoes_extras || {})) {
      const c = codigoValor(k, v);
      if (c !== null) out[k] = c;
    }
    await knex('usuarios').where({ id: u.id }).update({ permissoes_extras: JSON.stringify(out) });
  }
}

export async function down(knex) {
  const rot = (k, v) => { const p = POR_CHAVE[k]; return p ? TIPOS[p.tipo][Number(v)] : undefined; };
  for (const l of await knex('grupo_permissoes').select('grupo_id', 'chave', 'valor')) {
    const r = rot(l.chave, l.valor);
    if (r) await knex('grupo_permissoes').where({ grupo_id: l.grupo_id, chave: l.chave }).update({ valor: r });
  }
  for (const u of await knex('usuarios').select('id', 'permissoes_extras')) {
    const out = {};
    for (const [k, v] of Object.entries(u.permissoes_extras || {})) { const r = rot(k, v); if (r) out[k] = r; }
    await knex('usuarios').where({ id: u.id }).update({ permissoes_extras: JSON.stringify(out) });
  }
}
