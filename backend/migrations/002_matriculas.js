// Matrículas por ano letivo, linha do tempo, documentos e solicitações de assinatura (Autentique ou manual).
// Regra: aluno = cadastro permanente; matrícula = uma por aluno por ano letivo.

export async function up(knex) {
  await knex.schema.createTable('anos_letivos', (t) => {
    t.integer('ano').primary();
    t.boolean('ativo').notNullable().defaultTo(false); // ano com rematrícula/matrícula aberta
    t.date('abertura');
    t.date('encerramento');
    t.date('divulgacao_valores'); // Lei 9.870/99: valores e vagas divulgados com 45 dias de antecedência
    t.integer('parcelas').notNullable().defaultTo(12);
    t.integer('dia_vencimento').notNullable().defaultTo(10);
    t.decimal('valor_parcela', 12, 2); // valor-base; o desconto do aluno é aplicado na matrícula
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('matriculas', (t) => {
    t.increments('id');
    t.integer('aluno_id').notNullable().references('id').inTable('alunos').onDelete('CASCADE');
    t.integer('ano').notNullable().references('ano').inTable('anos_letivos');
    t.string('tipo', 20).notNullable().defaultTo('rematricula'); // nova | rematricula | retorno
    // pre_matricula | aguardando_documentos | aguardando_assinatura | aguardando_parcela | ativa | nao_renovou | transferida | cancelada | concluida
    t.string('status', 30).notNullable().defaultTo('pre_matricula');
    t.integer('passo').notNullable().defaultTo(1); // passo atual do fluxo (1 a 5)
    t.integer('passo_max').notNullable().defaultTo(1);
    t.string('serie', 60);
    t.string('turno', 30);
    t.string('origem', 40); // como a família confirmou
    t.string('responsavel_chave', 20); // pai | mae | resp_pedagogico (quem assina)
    t.integer('responsavel_id').references('id').inTable('pessoas').onDelete('SET NULL');
    // condições contratadas (cópia do ano letivo no momento da matrícula; não mudam depois)
    t.integer('parcelas');
    t.integer('dia_vencimento');
    t.decimal('valor_parcela', 12, 2);
    t.decimal('desconto_percentual', 5, 2).notNullable().defaultTo(0);
    t.jsonb('docs_entregues').notNullable().defaultTo('{}'); // {certidao:true,...}
    t.string('assinatura_modo', 12).notNullable().defaultTo('autentique'); // autentique | manual
    t.string('canal', 12); // email | whatsapp | sms
    t.timestamp('conferido_em'); // assinatura manual conferida pela secretaria
    t.integer('conferido_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('parcela1_confirmada_em');
    t.integer('parcela1_confirmada_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('efetivada_em');
    t.integer('efetivada_por').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.integer('created_by').references('id').inTable('usuarios').onDelete('SET NULL');
    t.unique(['aluno_id', 'ano']);
  });

  await knex.schema.createTable('matricula_eventos', (t) => {
    t.increments('id');
    t.integer('matricula_id').notNullable().references('id').inTable('matriculas').onDelete('CASCADE');
    t.string('tipo', 40).notNullable();
    t.string('titulo', 160).notNullable();
    t.text('detalhe');
    t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('ocorrido_em').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX matricula_eventos_mat_idx ON matricula_eventos (matricula_id, ocorrido_em, id)');

  await knex.schema.createTable('matricula_documentos', (t) => {
    t.increments('id');
    t.integer('matricula_id').notNullable().references('id').inTable('matriculas').onDelete('CASCADE');
    t.string('chave', 30).notNullable(); // contrato | termo1 | termo2
    t.string('versao', 20).notNullable(); // gerado | assinado_autentique | assinado_manual | dossie
    t.string('nome', 200).notNullable();
    t.string('arquivo', 200).notNullable();
    t.string('mime', 100).notNullable();
    t.binary('conteudo').notNullable();
    t.string('sha256', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.integer('created_by').references('id').inTable('usuarios').onDelete('SET NULL');
  });
  await knex.raw('CREATE INDEX matricula_documentos_mat_idx ON matricula_documentos (matricula_id, chave)');

  await knex.schema.createTable('assinaturas', (t) => {
    t.increments('id');
    t.integer('matricula_id').notNullable().references('id').inTable('matriculas').onDelete('CASCADE');
    t.string('chave', 30).notNullable(); // contrato | termo1 | termo2
    t.string('provedor', 20).notNullable(); // autentique | simulado | manual
    t.string('status', 20).notNullable().defaultTo('enviado'); // enviado | visualizado | assinado | recusado | cancelado
    t.string('canal', 12);
    t.string('documento_externo_id', 120);
    t.string('assinatura_externa_id', 120);
    t.text('link');
    t.string('signatario_nome', 160);
    t.string('signatario_contato', 160);
    t.timestamp('enviado_em').defaultTo(knex.fn.now());
    t.timestamp('visualizado_em');
    t.timestamp('assinado_em');
    t.jsonb('retorno').notNullable().defaultTo('{}'); // dados do provedor (IP mascarado, etc.)
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX assinaturas_mat_idx ON assinaturas (matricula_id)');
  await knex.raw('CREATE INDEX assinaturas_ext_idx ON assinaturas (documento_externo_id)');

  // Ano letivo de rematrícula (valores-base editáveis em Anos letivos / pelo script de configuração).
  await knex('anos_letivos').insert([
    { ano: 2026, ativo: false, parcelas: 12, dia_vencimento: 10 },
    { ano: 2027, ativo: true, abertura: '2026-11-03', encerramento: '2026-12-15', divulgacao_valores: '2026-10-02', parcelas: 12, dia_vencimento: 10, valor_parcela: null },
  ]);
}

export async function down(knex) {
  for (const t of ['assinaturas', 'matricula_documentos', 'matricula_eventos', 'matriculas', 'anos_letivos']) {
    await knex.schema.dropTableIfExists(t);
  }
}
