// Material didático, uniformes e outros itens vendidos ao aluno: catálogo por ano/série, compra do aluno,
// pagamentos (lançados à mão; origem/external_id deixam pronta a baixa automática futura) e entregas por bimestre.
export async function up(knex) {
  await knex.schema.createTable('itens_catalogo', (t) => {
    t.increments('id');
    t.integer('ano').notNullable();
    t.string('tipo', 20).notNullable(); // material | uniforme | outro
    t.string('nome', 120).notNullable();
    t.string('serie', 60); // vazio = todas as séries
    t.decimal('valor', 12, 2).notNullable().defaultTo(0);
    t.boolean('por_bimestre').notNullable().defaultTo(false); // entrega dividida em bimestres
    t.boolean('ativo').notNullable().defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['ano', 'tipo']);
  });
  await knex.schema.createTable('aluno_itens', (t) => {
    t.increments('id');
    t.integer('aluno_id').notNullable().references('id').inTable('alunos').onDelete('CASCADE');
    t.integer('ano').notNullable();
    t.integer('catalogo_id').references('id').inTable('itens_catalogo').onDelete('SET NULL');
    t.string('tipo', 20).notNullable();
    t.string('descricao', 160).notNullable();
    t.string('tamanho', 20);
    t.integer('quantidade').notNullable().defaultTo(1);
    t.decimal('valor_total', 12, 2).notNullable().defaultTo(0);
    t.boolean('por_bimestre').notNullable().defaultTo(false);
    t.integer('bimestre_inicio').notNullable().defaultTo(1); // comprou no meio do ano: bimestres anteriores não se aplicam
    t.text('observacao');
    t.boolean('cancelado').notNullable().defaultTo(false);
    t.integer('criado_por');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['aluno_id', 'ano']);
  });
  await knex.schema.createTable('aluno_item_pagamentos', (t) => {
    t.increments('id');
    t.integer('aluno_item_id').notNullable().references('id').inTable('aluno_itens').onDelete('CASCADE');
    t.date('data').notNullable();
    t.decimal('valor', 12, 2).notNullable();
    t.string('forma', 20).notNullable(); // cartao_credito | pix | dinheiro | boleto | outro
    t.integer('parcelas').notNullable().defaultTo(1);
    t.text('observacao');
    t.string('origem', 20).notNullable().defaultTo('manual'); // manual | integracao
    t.string('external_id', 120);
    t.integer('criado_por');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
  await knex.schema.createTable('aluno_item_entregas', (t) => {
    t.increments('id');
    t.integer('aluno_item_id').notNullable().references('id').inTable('aluno_itens').onDelete('CASCADE');
    t.integer('bimestre').notNullable().defaultTo(0); // 0 = entrega única
    t.boolean('entregue').notNullable().defaultTo(false);
    t.date('data_entrega');
    t.integer('entregue_por');
    t.text('justificativa'); // preenchida quando a entrega foi liberada sem o pagamento correspondente
    t.unique(['aluno_item_id', 'bimestre']);
  });
  await knex.schema.createTable('aluno_item_eventos', (t) => {
    t.increments('id');
    t.integer('aluno_item_id').notNullable().references('id').inTable('aluno_itens').onDelete('CASCADE');
    t.integer('usuario_id');
    t.string('acao', 40).notNullable();
    t.jsonb('detalhe');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}
export async function down(knex) {
  for (const t of ['aluno_item_eventos', 'aluno_item_entregas', 'aluno_item_pagamentos', 'aluno_itens', 'itens_catalogo']) await knex.schema.dropTableIfExists(t);
}
