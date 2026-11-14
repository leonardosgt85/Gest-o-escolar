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
      { chave: 'gerencial.cadastros', nome: 'Cadastros (disciplinas, turmas e matriz curricular)', tipo: 'tela' },
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
      { chave: 'academico.diario', nome: 'Diário de Classe (Consulta = vê todas as turmas; Manutenção = lança em todas). Professores lançam nas suas disciplinas sem precisar desta permissão', tipo: 'tela' },
      { chave: 'academico.valores', nome: 'Plano de parcelas do ano letivo (nº de parcelas e vencimento)', tipo: 'tela' },
      { chave: 'academico.itens', nome: 'Material didático e uniformes do aluno (Consulta = vê; Manutenção = registra itens e marca entregas)', tipo: 'tela' },
      { chave: 'academico.itens.pagamento', nome: 'Material e uniformes: lançar/estornar pagamentos e definir valores (financeiro)', tipo: 'binario' },
      { chave: 'academico.itens.liberar', nome: 'Material e uniformes: liberar entrega sem o pagamento (com justificativa)', tipo: 'binario' },
      { chave: 'academico.pessoas', nome: 'Cadastro de Pessoas (responsáveis)', tipo: 'tela' },
      { chave: 'academico.pessoas.excluir', nome: 'Pessoas: excluir', tipo: 'binario' },
    ],
  },
];

export const TODAS = MODULOS.flatMap((m) => m.permissoes.map((p) => ({ ...p, modulo: m.chave })));
export const POR_CHAVE = Object.fromEntries(TODAS.map((p) => [p.chave, p]));

export const NIVEIS_USUARIO = ['Administrador', 'Adm. Financeiro', 'Adm. Pedagógico', 'Usuário'];

/**
 * Código de um valor de permissão = posição dele na lista do tipo (0 = nega).
 * Aceita o código (2 ou "2") e também o rótulo antigo ("Manutenção"), para ler dados gravados antes da conversão.
 * Devolve null quando o valor não existe para essa permissão.
 */
export function codigoValor(chave, valor) {
  const p = POR_CHAVE[chave];
  if (!p) return null;
  const lista = TIPOS[p.tipo];
  if (typeof valor === 'number' || (typeof valor === 'string' && /^\d+$/.test(valor.trim()))) {
    const n = Number(valor);
    return Number.isInteger(n) && n >= 0 && n < lista.length ? n : null;
  }
  const i = lista.indexOf(valor);
  return i < 0 ? null : i;
}

export const indiceValor = (chave, valor) => codigoValor(chave, valor) ?? 0;

export const valorValido = (chave, valor) => codigoValor(chave, valor) !== null;

/** { chave: rótulo | código } → { chave: código }, descartando o que não existe no catálogo. */
export function normalizarPermissoes(obj) {
  const out = {};
  for (const [chave, valor] of Object.entries(obj || {})) {
    const c = codigoValor(chave, valor);
    if (c !== null) out[chave] = c;
  }
  return out;
}
