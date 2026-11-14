// Limite opcional de alunos por turma (vazio = sem limite).
export async function up(knex) {
  await knex.schema.alterTable('turmas', (t) => { t.integer('limite_alunos'); });
}
export async function down(knex) {
  await knex.schema.alterTable('turmas', (t) => { t.dropColumn('limite_alunos'); });
}
