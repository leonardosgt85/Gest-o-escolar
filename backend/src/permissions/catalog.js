// Catálogo de permissões: chaves estáveis por funcionalidade, agrupadas por módulo.
// Cada tipo tem os valores ORDENADOS do menor para o maior acesso (índice 0 = nega).
// Para criar um módulo novo (Kanban, Administrativo...), adicione-o aqui e em `habilitacoes`.

export const TIPOS = {
  // "Nível de acesso à tela" do SAE
  tela: ['Não Acessa', 'Apenas Consulta', 'Manutenção'],
  // Binário (maioria das permissões do SAE)
  binario: ['Não', 'Sim'],
  // Inclusão
  inclusao: ['Não adiciona', 'Apenas Adiciona', 'Adiciona e Altera'],
};

export const MODULOS = [
  {
    chave: 'gerencial',
    nome: 'Gerencial',
    permissoes: [
      { chave: 'gerencial.usuarios', nome: 'Cadastro de Usuários', tipo: 'tela' },
      { chave: 'gerencial.grupos', nome: 'Grupo de Permissão', tipo: 'tela' },
      { chave: 'gerencial.habilitacoes', nome: 'Habilitações (módulos da escola)', tipo: 'tela' },
      { chave: 'gerencial.email', nome: 'Configuração de e-mail (envio)', tipo: 'tela' },
    ],
  },
  {
    chave: 'academico',
    nome: 'Gestão Acadêmica',
    permissoes: [
      { chave: 'academico.alunos', nome: 'Cadastro de Alunos', tipo: 'tela' },
      { chave: 'academico.alunos.inclusao', nome: 'Alunos: inclusão e alteração', tipo: 'inclusao' },
      { chave: 'academico.alunos.excluir', nome: 'Alunos: excluir', tipo: 'binario' },
      { chave: 'academico.alunos.importar_irmao', nome: 'Alunos: importar dados do irmão', tipo: 'binario' },
      { chave: 'academico.valores', nome: 'Valores do ano letivo (série, turno e parcelas)', tipo: 'tela' },
      { chave: 'academico.pessoas', nome: 'Cadastro de Pessoas (responsáveis)', tipo: 'tela' },
      { chave: 'academico.pessoas.excluir', nome: 'Pessoas: excluir', tipo: 'binario' },
    ],
  },
];

export const TODAS = MODULOS.flatMap((m) => m.permissoes.map((p) => ({ ...p, modulo: m.chave })));
export const POR_CHAVE = Object.fromEntries(TODAS.map((p) => [p.chave, p]));

export const NIVEIS_USUARIO = ['Administrador', 'Adm. Financeiro', 'Adm. Pedagógico', 'Usuário'];

export function indiceValor(chave, valor) {
  const p = POR_CHAVE[chave];
  if (!p) return 0;
  const i = TIPOS[p.tipo].indexOf(valor);
  return i < 0 ? 0 : i;
}

export function valorValido(chave, valor) {
  const p = POR_CHAVE[chave];
  return !!p && TIPOS[p.tipo].includes(valor);
}

// Habilitações iniciais (feature flags por módulo). Módulos futuros ficam desligados.
export const HABILITACOES_INICIAIS = [
  { chave: 'gerencial', nome: 'Gerencial', descricao: 'Usuários, grupos de permissão e habilitações', ativo: true, nucleo: true, ordem: 1 },
  { chave: 'academico', nome: 'Gestão Acadêmica', descricao: 'Alunos e pessoas (responsáveis)', ativo: true, nucleo: false, ordem: 2 },
  { chave: 'financeiro', nome: 'Financeiro', descricao: 'Em breve', ativo: false, nucleo: false, ordem: 3 },
  { chave: 'kanban', nome: 'Kanban', descricao: 'Em breve', ativo: false, nucleo: false, ordem: 4 },
  { chave: 'administrativo', nome: 'Gerenciamento Administrativo', descricao: 'Em breve', ativo: false, nucleo: false, ordem: 5 },
];
