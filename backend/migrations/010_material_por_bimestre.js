// Material didático é sempre entregue por bimestre; uniforme e outros, entrega única.
export async function up(knex) {
  await knex('itens_catalogo').where({ tipo: 'material' }).update({ por_bimestre: true });
  await knex('itens_catalogo').whereNot({ tipo: 'material' }).update({ por_bimestre: false });
  await knex.raw(`update aluno_itens set por_bimestre = true where tipo = 'material' and por_bimestre = false
    and not exists (select 1 from aluno_item_entregas e where e.aluno_item_id = aluno_itens.id)`);
}
export async function down() {}
