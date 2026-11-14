// Valor da parcela por ano + série + turno: vem das turmas ativas (cadastrado na própria turma).
import { db } from '../db.js';

export async function precosDoAno(ano) {
  const r = await db('turmas').where({ ano, ativo: true }).where('valor_parcela', '>', 0)
    .groupBy('serie', 'turno').select('serie', 'turno').min('valor_parcela as valor_parcela').orderBy(['serie', 'turno']);
  return r.map((x) => ({ serie: x.serie, turno: x.turno, valor_parcela: Number(x.valor_parcela) }));
}

export async function precoDe(ano, serie, turno) {
  const p = await db('turmas').where({ ano, turno, ativo: true }).where('valor_parcela', '>', 0)
    .whereRaw('lower(serie) = lower(?)', [serie]).min('valor_parcela as v').first();
  return p?.v != null ? Number(p.v) : null;
}
