// Estrutura inicial: gerencial (usuários, grupos, habilitações, sessões) e acadêmico (pessoas, alunos).
// Os nomes dos campos de alunos/pessoas seguem as abas do SAE documentadas na wiki.

export async function up(knex) {
  // ---------- Gerencial ----------
  await knex.schema.createTable('habilitacoes', (t) => {
    t.string('chave', 60).primary();
    t.string('nome', 120).notNullable();
    t.string('descricao', 255);
    t.boolean('ativo').notNullable().defaultTo(false);
    t.boolean('nucleo').notNullable().defaultTo(false); // módulo base: não pode ser desligado
    t.integer('ordem').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('grupos_permissao', (t) => {
    t.increments('id');
    t.string('nome', 100).notNullable();
    t.string('vinculo_perfil', 40).notNullable().defaultTo('Todos'); // Todos | Apenas usuários nível avançado
    t.jsonb('horarios').notNullable().defaultTo('{}'); // {seg_sex:{de,ate}, sabado:{}, domingo:{}, feriado:{}} (horário de Brasília)
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE UNIQUE INDEX grupos_permissao_nome_uq ON grupos_permissao (lower(nome))');

  await knex.schema.createTable('grupo_permissoes', (t) => {
    t.integer('grupo_id').notNullable().references('id').inTable('grupos_permissao').onDelete('CASCADE');
    t.string('chave', 80).notNullable();
    t.string('valor', 40).notNullable();
    t.primary(['grupo_id', 'chave']);
  });

  await knex.schema.createTable('usuarios', (t) => {
    t.increments('id'); // Código
    t.string('nome_completo', 150).notNullable();
    t.string('email', 150).notNullable(); // também é o login
    t.string('senha_hash', 100).notNullable();
    t.string('nivel', 30).notNullable().defaultTo('Usuário'); // Administrador | Adm. Financeiro | Adm. Pedagógico | Usuário
    t.string('situacao', 10).notNullable().defaultTo('Ativo'); // Ativo | Inativo (não há exclusão física)
    t.integer('grupo_id').references('id').inTable('grupos_permissao').onDelete('SET NULL');
    t.string('cargo', 100);
    t.date('data_limite'); // acesso expira nesta data
    t.decimal('comissao_vendas', 5, 2); // % Comissão s/ vendas de cursos
    t.string('setor', 100);
    t.text('foto'); // data URL
    t.jsonb('outras_informacoes').notNullable().defaultTo('{}'); // flags Sim/Não da aba "Outras Informações"
    t.jsonb('permissoes_extras').notNullable().defaultTo('{}'); // somadas ao grupo
    t.timestamp('ultimo_acesso');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE UNIQUE INDEX usuarios_email_uq ON usuarios (lower(email))');

  await knex.schema.createTable('sessoes', (t) => {
    t.string('token_hash', 64).primary(); // SHA-256 do token do cookie
    t.integer('usuario_id').notNullable().references('id').inTable('usuarios').onDelete('CASCADE');
    t.timestamp('expira_em').notNullable();
    t.string('ip', 60);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ---------- Acadêmico ----------
  await knex.schema.createTable('pessoas', (t) => {
    t.increments('id'); // Código
    t.string('tipo', 2).notNullable().defaultTo('PF');
    t.string('nome', 150).notNullable();
    t.string('cpf', 14);
    t.string('rg', 30);
    t.string('rg_orgao_emissor', 30);
    t.string('rg_uf', 2);
    t.date('data_nascimento');
    t.string('sexo', 20);
    t.string('estado_civil', 30);
    t.string('profissao', 100);
    t.string('email', 150);
    t.string('ddd', 3);
    t.string('telefone', 20);
    t.string('celular', 20);
    // Aba "Endereço Residencial"
    t.string('cep', 9);
    t.string('rua', 150);
    t.string('numero', 20);
    t.string('complemento', 100);
    t.string('bairro', 100);
    t.string('cidade', 100);
    t.string('uf', 2);
    // Abas "Endereço Comercial" e "Ref. Comerciais" (estrutura detalhada ainda não levantada no SAE)
    t.jsonb('endereco_comercial').notNullable().defaultTo('{}');
    t.jsonb('ref_comerciais').notNullable().defaultTo('[]');
    t.timestamp('ultimo_login');
    t.string('legacy_id', 60); // código no SAE (importação)
    t.text('observacoes');
    t.integer('created_by').references('id').inTable('usuarios').onDelete('SET NULL');
    t.integer('updated_by').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX pessoas_nome_idx ON pessoas (lower(nome))');
  await knex.raw('CREATE INDEX pessoas_cpf_idx ON pessoas (cpf)');
  await knex.raw('CREATE UNIQUE INDEX pessoas_legacy_uq ON pessoas (legacy_id) WHERE legacy_id IS NOT NULL');

  await knex.schema.createTable('alunos', (t) => {
    t.increments('id'); // Código
    // 1. Dados do Aluno
    t.string('nome_completo', 150).notNullable();
    t.string('nome_social', 150);
    t.string('cpf', 14);
    t.date('data_nascimento').notNullable();
    t.string('matricula', 30);
    t.string('rga', 30);
    t.string('nis', 20);
    t.string('sexo', 20);
    t.string('estado_civil', 30);
    t.string('naturalidade', 100);
    t.string('naturalidade_uf', 2);
    t.string('nacionalidade', 60).defaultTo('Brasileira');
    t.string('id_censo', 30);
    t.string('email', 150);
    t.string('rg', 30);
    t.date('rg_data_expedicao');
    t.string('rg_orgao_emissor', 30);
    t.string('rg_uf', 2);
    t.string('cor_raca', 30);
    t.string('docto_apresentado', 40);
    t.string('outros_documentos', 255);
    t.string('necessidades_especiais', 40);
    t.string('necessidades_especiais_complemento', 255);
    // 2. Endereço / Contatos
    t.string('cep', 9);
    t.string('rua', 150);
    t.string('numero', 20);
    t.string('complemento', 100);
    t.string('bairro', 100);
    t.string('cidade', 100);
    t.string('uf', 2);
    t.string('ddd', 3);
    t.string('telefone', 20);
    t.string('celular', 20);
    // 3. Responsáveis (registros de Pessoa reutilizáveis)
    t.integer('pai_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.integer('mae_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.integer('resp_pedagogico_id').references('id').inTable('pessoas').onDelete('SET NULL');
    t.string('tipo_resp_pedag', 30);
    t.string('tipo_resp_financ', 30);
    // 4. Documentos — Certidão de Nascimento
    t.string('certidao_livro', 30);
    t.string('certidao_folha', 30);
    t.string('certidao_matricula', 40);
    t.date('certidao_data_registro');
    t.string('certidao_cartorio', 150);
    // 5. Informações Adicionais
    t.string('escola_origem', 150);
    t.string('cert_reservista', 30);
    t.string('como_conheceu', 60);
    t.string('como_conheceu_outros', 150);
    t.string('titulo_eleitor', 20);
    t.string('titulo_zona', 10);
    t.string('titulo_secao', 10);
    t.string('cnh', 20);
    t.string('cnh_categoria', 5);
    t.string('renach', 20);
    t.string('sit_ocupacional', 30);
    t.string('liberado_novas_matriculas', 3).defaultTo('Sim');
    t.decimal('desconto_percentual', 5, 2);
    t.string('tipo_sanguineo', 20);
    t.string('profissao', 100);
    t.string('religiao', 30);
    // 6. Processo seletivo (formação anterior / ingresso) — tipos ainda não levantados: JSONB
    t.jsonb('processo_seletivo').notNullable().defaultTo('{}');
    // 7. Observações
    t.text('observacoes');
    // Foto e controle
    t.text('foto'); // data URL
    t.string('legacy_id', 60); // código no SAE (importação)
    t.timestamp('excluido_em'); // exclusão lógica
    t.integer('created_by').references('id').inTable('usuarios').onDelete('SET NULL');
    t.integer('updated_by').references('id').inTable('usuarios').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX alunos_nome_idx ON alunos (lower(nome_completo))');
  await knex.raw('CREATE INDEX alunos_cpf_idx ON alunos (cpf)');
  await knex.raw('CREATE INDEX alunos_matricula_idx ON alunos (matricula)');
  await knex.raw('CREATE UNIQUE INDEX alunos_legacy_uq ON alunos (legacy_id) WHERE legacy_id IS NOT NULL');
}

export async function down(knex) {
  for (const t of ['alunos', 'pessoas', 'sessoes', 'usuarios', 'grupo_permissoes', 'grupos_permissao', 'habilitacoes']) {
    await knex.schema.dropTableIfExists(t);
  }
}
