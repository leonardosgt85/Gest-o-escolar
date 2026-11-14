// Série e turma não podem se repetir por diferença de maiúsculas ou espaços ("1ª série" × " 1ª SÉRIE ").
// 1) limpa espaços sobrando; 2) se ainda houver duplicatas, ABORTA com a lista (nada é apagado); 3) cria os índices únicos.
const limpa = (c) => `btrim(regexp_replace(${c}, '\\s+', ' ', 'g'))`;

export async function up(knex) {
  await knex.raw(`update turmas set serie = ${limpa('serie')}, nome = ${limpa('nome')} where serie <> ${limpa('serie')} or nome <> ${limpa('nome')}`);
  await knex.raw(`update matriz_curricular set serie = ${limpa('serie')} where serie <> ${limpa('serie')}`);

  const dupT = (await knex.raw('select ano, lower(serie) as serie, lower(nome) as nome, turno, count(*)::int as n, array_agg(id order by id) as ids from turmas group by 1,2,3,4 having count(*) > 1')).rows;
  const dupM = (await knex.raw('select ano, lower(serie) as serie, disciplina_id, count(*)::int as n, array_agg(id order by id) as ids from matriz_curricular group by 1,2,3 having count(*) > 1')).rows;
  if (dupT.length || dupM.length) {
    const linhas = [
      ...dupT.map((d) => `Turma duplicada: ${d.ano} · ${d.serie} · ${d.nome} · ${d.turno} (ids ${d.ids.join(', ')})`),
      ...dupM.map((d) => `Matriz duplicada: ${d.ano} · ${d.serie} · disciplina ${d.disciplina_id} (ids ${d.ids.join(', ')})`),
    ];
    throw new Error(`Migration 011 abortada: há cadastros duplicados que só diferem por maiúsculas ou espaços. Una ou exclua-os e rode de novo.\n${linhas.join('\n')}`);
  }
  await knex.raw('create unique index if not exists turmas_ano_serie_nome_turno_ci on turmas (ano, lower(serie), lower(nome), turno)');
  await knex.raw('create unique index if not exists matriz_ano_serie_disciplina_ci on matriz_curricular (ano, lower(serie), disciplina_id)');
}

export async function down(knex) {
  await knex.raw('drop index if exists turmas_ano_serie_nome_turno_ci');
  await knex.raw('drop index if exists matriz_ano_serie_disciplina_ci');
}
