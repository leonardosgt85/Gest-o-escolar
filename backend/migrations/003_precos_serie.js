// Valor da parcela por ano letivo, série e turno + motivo do desconto individual na matrícula.
export async function up(knex) {
  await knex.schema.createTable('precos_serie', (t) => {
    t.increments('id');
    t.integer('ano').notNullable().references('ano').inTable('anos_letivos').onDelete('CASCADE');
    t.string('serie', 60).notNullable();
    t.string('turno', 30).notNullable();
    t.decimal('valor_parcela', 12, 2).notNullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['ano', 'serie', 'turno']);
  });
  await knex.schema.alterTable('matriculas', (t) => {
    t.string('desconto_motivo', 160);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('matriculas', (t) => t.dropColumn('desconto_motivo'));
  await knex.schema.dropTableIfExists('precos_serie');
}
