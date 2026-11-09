// Link de rematrícula para a família (portal público) e configurações do sistema (e-mail SMTP).

export async function up(knex) {
  await knex.schema.createTable('configuracoes', (t) => {
    t.string('chave', 60).primary();
    t.jsonb('valor').notNullable().defaultTo('{}');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.integer('updated_by').references('id').inTable('usuarios').onDelete('SET NULL');
  });
  await knex.schema.alterTable('matriculas', (t) => {
    t.string('portal_token_hash', 64).unique(); // busca do link (sha256 do token)
    t.text('portal_token_enc'); // token cifrado, para a secretaria poder copiar o link de novo
    t.timestamp('portal_expira_em');
    t.timestamp('portal_enviado_em');
    t.string('portal_enviado_para', 160);
    t.timestamp('portal_acesso_em');
    t.timestamp('dados_confirmados_em'); // família conferiu/atualizou os dados do responsável
  });
}

export async function down(knex) {
  await knex.schema.alterTable('matriculas', (t) => {
    for (const c of ['portal_token_hash', 'portal_token_enc', 'portal_expira_em', 'portal_enviado_em', 'portal_enviado_para', 'portal_acesso_em', 'dados_confirmados_em']) t.dropColumn(c);
  });
  await knex.schema.dropTableIfExists('configuracoes');
}
