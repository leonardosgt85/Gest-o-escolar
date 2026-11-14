// Base do Diário de Classe: disciplinas, professores, turmas e matriz curricular.
export async function up(knex) {
  await knex.schema.createTable('disciplinas', (t) => {
    t.increments('id');
    t.string('nome', 100).notNullable();
    t.string('sigla', 20);
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('create unique index disciplinas_nome_uq on disciplinas (lower(nome))');

  await knex.schema.alterTable('usuarios', (t) => {
    t.boolean('professor').notNullable().defaultTo(false);
  });
  await knex.schema.createTable('usuario_disciplinas', (t) => {
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.integer('disciplina_id').notNullable().references('id').inTable('disciplinas').onDelete('CASCADE');
    t.primary(['usuario_id', 'disciplina_id']);
  });

  await knex.schema.createTable('turmas', (t) => {
    t.increments('id');
    t.integer('ano').notNullable();
    t.string('serie', 60).notNullable();
    t.string('nome', 20).notNullable(); // letra/nome da turma: A, B, Única...
    t.string('turno', 30).notNullable();
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['ano', 'serie', 'nome', 'turno']);
  });
  await knex.schema.alterTable('matriculas', (t) => {
    t.integer('turma_id').references('id').inTable('turmas').onDelete('SET NULL');
  });

  // Matriz curricular por ano e série; dias_semana (1=seg … 6=sáb) alimenta os dias letivos do diário.
  await knex.schema.createTable('matriz_curricular', (t) => {
    t.increments('id');
    t.integer('ano').notNullable();
    t.string('serie', 60).notNullable();
    t.integer('disciplina_id').notNullable().references('id').inTable('disciplinas').onDelete('RESTRICT');
    t.integer('carga_horaria');
    t.integer('aulas_semana');
    t.jsonb('dias_semana').notNullable().defaultTo('[]');
    t.unique(['ano', 'serie', 'disciplina_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('matriz_curricular');
  await knex.schema.alterTable('matriculas', (t) => t.dropColumn('turma_id'));
  await knex.schema.dropTableIfExists('turmas');
  await knex.schema.dropTableIfExists('usuario_disciplinas');
  await knex.schema.alterTable('usuarios', (t) => t.dropColumn('professor'));
  await knex.raw('drop index if exists disciplinas_nome_uq');
  await knex.schema.dropTableIfExists('disciplinas');
}
