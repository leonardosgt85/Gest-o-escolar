// Menu modular da sidebar. Para adicionar um módulo (Kanban, Administrativo...):
//  1) registre-o em backend/src/permissions/catalog.js (MODULOS) e em HABILITACOES_INICIAIS;
//  2) adicione um bloco aqui com `modulo` igual à chave da habilitação;
//  3) crie as páginas em src/pages/<modulo>/ e as rotas em App.tsx.
// O módulo vira um item pai na barra lateral (abre um submenu) e ganha uma página-hub em /<modulo>
// com um card por opção. Itens `breve: true` aparecem só no hub, desabilitados, até serem construídos.
import type { IconName } from './components/Icon';

export interface MenuItem {
  label: string;
  descricao: string; // texto do card no hub do módulo
  icone: IconName;
  to: string;
  perm: string; // permissão mínima (consulta) para o item aparecer
  permAlt?: string; // permissão alternativa: basta uma das duas
  oculto?: boolean; // existe (rota e permissão ativas), mas não aparece no menu nem no hub
  breve?: boolean; // ainda não implementado: só aparece no hub, como "Em breve"
}
export interface MenuModule {
  id: string; // identifica o grupo no menu e na URL do hub (/<id>)
  modulo: string; // habilitação do módulo (liga/desliga); vários grupos podem usar o mesmo
  rotas?: string[]; // telas fora do menu que pertencem a este grupo (para destacar o grupo certo)
  label: string;
  descricao: string;
  icone: IconName;
  items: MenuItem[];
}

export const MENU: MenuModule[] = [
  {
    id: 'secretaria',
    modulo: 'academico',
    label: 'Secretaria',
    descricao: 'Alunos, matrículas, rematrículas e documentos',
    icone: 'alunos',
    rotas: ['/academico/matriculas', '/academico/pessoas', '/academico/relatorios'],
    items: [
      { label: 'Alunos', descricao: 'Ficha completa do aluno: dados, endereço, responsáveis, documentos, matrículas e processo seletivo.', icone: 'alunos', to: '/academico/alunos', perm: 'academico.alunos' },
      { label: 'Documentos do aluno', descricao: 'Atestados de escolaridade e conclusão e histórico escolar, gerados com os dados de cada aluno.', icone: 'fileDown', to: '/academico/relatorios/documentos', perm: 'academico.alunos' },
      { label: 'Responsáveis', descricao: 'Pais, mães e responsáveis reutilizáveis entre vários alunos.', icone: 'pessoas', to: '/academico/pessoas', perm: 'academico.pessoas', oculto: true },
      { label: 'Dashboard', descricao: 'Indicadores e visão geral da secretaria.', icone: 'dashboard', to: '/academico/dashboard', perm: 'academico.alunos', breve: true },
    ],
  },
  {
    id: 'pedagogico',
    modulo: 'academico',
    label: 'Pedagógico',
    descricao: 'Diário de classe: chamada, provas e relatório mensal',
    icone: 'diario',
    items: [
      { label: 'Diário de Classe', descricao: 'Chamada e provas por turma (sala) e disciplina, lançadas pelo professor.', icone: 'diario', to: '/academico/diario', perm: 'academico.diario' },
      { label: 'Diário mensal (PDF)', descricao: 'Chamada do mês, notas do bimestre e conteúdo ministrado, por turma e disciplina, para imprimir.', icone: 'relatorios', to: '/academico/relatorios/diario-mensal', perm: 'academico.diario' },
    ],
  },
  {
    id: 'estrutura',
    modulo: 'gerencial',
    label: 'Estrutura da escola',
    descricao: 'Ano letivo, turmas, matriz curricular e disciplinas',
    icone: 'cadastros',
    rotas: ['/gerencial/cadastros'],
    items: [
      { label: 'Turmas e ano letivo', descricao: 'Abrir o ano e a matrícula, turmas por série e turno com o valor da parcela, e enturmação dos alunos.', icone: 'grupos', to: '/gerencial/cadastros/turmas', perm: 'gerencial.cadastros' },
      { label: 'Matriz curricular', descricao: 'Disciplinas de cada série, carga horária e dias da semana das aulas.', icone: 'diario', to: '/gerencial/cadastros/matriz', perm: 'gerencial.cadastros' },
      { label: 'Disciplinas e professores', descricao: 'Componentes curriculares da escola e os professores de cada um.', icone: 'cadastros', to: '/gerencial/cadastros/disciplinas', perm: 'gerencial.cadastros' },
    ],
  },
  {
    id: 'administracao',
    modulo: 'gerencial',
    label: 'Administração',
    descricao: 'Usuários, perfis de acesso, módulos e e-mail',
    icone: 'gerencial',
    items: [
      { label: 'Usuários', descricao: 'Contas de acesso, perfil e permissões extras de cada usuário.', icone: 'usuarios', to: '/gerencial/usuarios', perm: 'gerencial.usuarios' },
      { label: 'Perfis de acesso', descricao: 'Perfis (grupos de permissão), horários permitidos e níveis por tela.', icone: 'grupos', to: '/gerencial/grupos', perm: 'gerencial.grupos' },
      { label: 'Módulos', descricao: 'Liga e desliga módulos do sistema (habilitações).', icone: 'habilitacoes', to: '/gerencial/habilitacoes', perm: 'gerencial.habilitacoes' },
      { label: 'E-mail', descricao: 'Servidor de envio dos e-mails do sistema (links de rematrícula).', icone: 'send', to: '/gerencial/email', perm: 'gerencial.email' },
    ],
  },
];

/** Módulos visíveis ao usuário: habilitados e com ao menos um item real permitido. */
export function modulosVisiveis(moduloAtivo: (m: string) => boolean, can: (perm: string, min?: number) => boolean) {
  return MENU.filter((m) => moduloAtivo(m.modulo))
    .map((m) => ({
      ...m,
      items: m.items.filter((i) => !i.breve && !i.oculto && (can(i.perm, 1) || (!!i.permAlt && can(i.permAlt, 1)))),
      proximos: m.items.filter((i) => i.breve && can(i.perm, 1)),
    }))
    .filter((m) => m.items.length > 0);
}
