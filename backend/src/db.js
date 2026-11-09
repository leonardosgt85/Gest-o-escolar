import knex from 'knex';
import pg from 'pg';
import knexfile from '../knexfile.js';

// DATE (1082) volta como string 'YYYY-MM-DD' (evita deslocamento de fuso).
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC (1700) volta como número.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const db = knex(knexfile);
