// O valor da parcela passa a ser cadastrado na própria turma (some a tabela precos_serie).
export async function up(knex) {
  await knex.schema.alterTable('turmas', (t) => { t.decimal('valor_parcela', 12, 2); });
  // leva os valores já cadastrados para as turmas de mesma ano + série + turno
  await knex.raw(`
    update turmas t set valor_parcela = p.valor_parcela
    from precos_serie p
    where t.ano = p.ano and lower(t.serie) = lower(p.serie) and t.turno = p.turno`);
  // valor que não tem turma correspondente: cria a turma "A" para não perder o dado
  await knex.raw(`
    insert into turmas (ano, serie, nome, turno, ativo, valor_parcela)
    select p.ano, p.serie, 'A', p.turno, true, p.valor_parcela
    from precos_serie p
    where not exists (select 1 from turmas t where t.ano = p.ano and lower(t.serie) = lower(p.serie) and t.turno = p.turno)
    on conflict do nothing`);
  await knex.schema.dropTableIfExists('precos_serie');
}

export async function down(knex) {
  await knex.schema.createTable('precos_serie', (t) => {
    t.increments('id');
    t.integer('ano').notNullable().references('ano').inTable('anos_letivos').onDelete('CASCADE');
    t.string('serie', 60).notNullable();
    t.string('turno', 30).notNullable();
    t.decimal('valor_parcela', 12, 2).notNullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['ano', 'serie', 'turno']);
  });
  await knex.raw(`
    insert into precos_serie (ano, serie, turno, valor_parcela)
    select ano, serie, turno, min(valor_parcela) from turmas
    where valor_parcela > 0 and exists (select 1 from anos_letivos a where a.ano = turmas.ano)
    group by ano, serie, turno`);
  await knex.schema.alterTable('turmas', (t) => t.dropColumn('valor_parcela'));
}
