// Carga inicial (idempotente): habilitações, grupos de permissão e usuário administrador.
// Rodar: npx knex seed:run   (ou npm run seed)
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { HABILITACOES_INICIAIS, MODULOS, TIPOS } from '../src/permissions/catalog.js';

function permissoesGrupo(nivel) {
  // nivel: 'total' | 'consulta' | 'secretaria'
  const out = {};
  for (const m of MODULOS) {
    for (const p of m.permissoes) {
      const valores = TIPOS[p.tipo];
      if (nivel === 'total') out[p.chave] = valores.at(-1);
      else if (nivel === 'consulta') out[p.chave] = p.tipo === 'tela' ? 'Apenas Consulta' : valores[0];
      else if (nivel === 'secretaria') {
        if (m.chave === 'gerencial') out[p.chave] = valores[0];
        else if (p.chave.endsWith('.excluir')) out[p.chave] = 'Não';
        else out[p.chave] = valores.at(-1);
      }
    }
  }
  return out;
}

export async function seed(knex) {
  for (const h of HABILITACOES_INICIAIS) {
    const existe = await knex('habilitacoes').where({ chave: h.chave }).first();
    if (!existe) await knex('habilitacoes').insert(h);
    else await knex('habilitacoes').where({ chave: h.chave }).update({ nome: h.nome, descricao: h.descricao, nucleo: h.nucleo, ordem: h.ordem });
  }

  const grupos = [['Direção', 'total'], ['Coordenação', 'total'], ['Secretaria', 'secretaria'], ['Consultor', 'consulta']];
  for (const [nome, nivel] of grupos) {
    if (await knex('grupos_permissao').whereRaw('lower(nome) = ?', [nome.toLowerCase()]).first()) continue;
    const [g] = await knex('grupos_permissao').insert({ nome, horarios: JSON.stringify({}) }).returning('id');
    await knex('grupo_permissoes').insert(Object.entries(permissoesGrupo(nivel)).map(([chave, valor]) => ({ grupo_id: g.id, chave, valor })));
  }

  const { adminEmail, adminPassword } = config.seed;
  if (!(await knex('usuarios').whereRaw('lower(email) = ?', [adminEmail.toLowerCase()]).first())) {
    const direcao = await knex('grupos_permissao').where({ nome: 'Direção' }).first();
    await knex('usuarios').insert({
      nome_completo: 'Administrador',
      email: adminEmail.toLowerCase(),
      senha_hash: await bcrypt.hash(adminPassword, 10),
      nivel: 'Administrador',
      grupo_id: direcao?.id,
      cargo: 'Administrador do sistema',
    });
    console.log(`Administrador criado: ${adminEmail} / ${adminPassword}  (troque a senha após o primeiro acesso)`);
  }
}
