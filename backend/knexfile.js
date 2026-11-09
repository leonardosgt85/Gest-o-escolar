// Configuração padrão do Knex (usada pela CLI: npx knex migrate:latest / seed:run e pelo app).
import { config } from './src/config.js';

const { schema, ...connection } = config.db;

export default {
  client: 'pg',
  connection,
  searchPath: [schema],
  pool: {
    min: 0,
    max: 10,
    // Garante o schema próprio antes de qualquer migration (permite dividir o Postgres com outro sistema).
    afterCreate(conn, done) {
      conn.query(`create schema if not exists "${schema}"`, (err) => done(err, conn));
    },
  },
  migrations: { directory: './migrations', schemaName: schema, tableName: 'knex_migrations' },
  seeds: { directory: './seeds' },
};
