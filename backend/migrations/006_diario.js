// Diário de classe: chamada (frequência) por dia e notas por bimestre, por turma × disciplina.
export async function up(knex) {
  await knex.schema.createTable('diario_aulas', (t) => {
    t.increments('id');
    t.integer('turma_id').notNullable().references('id').inTable('turmas').onDelete('CASCADE');
    t.integer('disciplina_id').notNullable().references('id').inTable('disciplinas').onDelete('RESTRICT');
    t.date('data').notNullable();
    t.integer('bimestre').notNullable();
    t.integer('aulas').notNullable().defaultTo(1); // nº de aulas no dia (geminadas): cada falta conta esse tanto
    t.text('conteudo');
    t.integer('registrado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['turma_id', 'disciplina_id', 'data']);
  });
  await knex.schema.createTable('diario_frequencia', (t) => {
    t.integer('aula_id').notNullable().references('id').inTable('diario_aulas').onDelete('CASCADE');
    t.integer('aluno_id').notNullable().references('id').inTable('alunos').onDelete('CASCADE');
    t.string('status', 1).notNullable(); // P presente | F falta
    t.primary(['aula_id', 'aluno_id']);
  });
  await knex.schema.createTable('diario_notas', (t) => {
    t.integer('turma_id').notNullable().references('id').inTable('turmas').onDelete('CASCADE');
    t.integer('disciplina_id').notNullable().references('id').inTable('disciplinas').onDelete('RESTRICT');
    t.integer('bimestre').notNullable();
    t.integer('aluno_id').notNullable().references('id').inTable('alunos').onDelete('CASCADE');
    t.decimal('pm', 4, 1); // prova mensal
    t.decimal('pb', 4, 1); // prova bimestral
    t.decimal('sim', 4, 1); // simulado
    t.integer('lancado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.primary(['turma_id', 'disciplina_id', 'bimestre', 'aluno_id']);
  });
}
export async function down(knex) {
  await knex.schema.dropTableIfExists('diario_notas');
  await knex.schema.dropTableIfExists('diario_frequencia');
  await knex.schema.dropTableIfExists('diario_aulas');
}
