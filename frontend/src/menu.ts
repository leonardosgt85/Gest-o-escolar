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
  oculto?: boolean; // existe (rota e permissão ativas), mas não aparece no menu nem no hub
  breve?: boolean; // ainda não implementado: só aparece no hub, como "Em breve"
}
export interface MenuModule {
  modulo: string;
  label: string;
  descricao: string;
  icone: IconName;
  items: MenuItem[];
}

export const MENU: MenuModule[] = [
  {
    modulo: 'academico',
    label: 'Gestão Acadêmica',
    descricao: 'Alunos, responsáveis, relatórios e indicadores',
    icone: 'academico',
    items: [
      { label: 'Cadastro de Alunos', descricao: 'Ficha completa do aluno: dados, endereço, responsáveis, documentos e processo seletivo.', icone: 'alunos', to: '/academico/alunos', perm: 'academico.alunos' },
      { label: 'Valores do ano letivo', descricao: 'Valor da parcela por série e turno, número de parcelas e vencimento de cada ano.', icone: 'tag', to: '/academico/valores', perm: 'academico.valores' },
      { label: 'Pessoas (responsáveis)', descricao: 'Pais, mães e responsáveis reutilizáveis entre vários alunos.', icone: 'pessoas', to: '/academico/pessoas', perm: 'academico.pessoas', oculto: true },
      { label: 'Relatórios', descricao: 'Listagens e relatórios acadêmicos.', icone: 'relatorios', to: '/academico/relatorios', perm: 'academico.alunos' },
      { label: 'Dashboard', descricao: 'Indicadores e visão geral da secretaria.', icone: 'dashboard', to: '/academico/dashboard', perm: 'academico.alunos', breve: true },
    ],
  },
  {
    modulo: 'gerencial',
    label: 'Gerencial',
    descricao: 'Usuários, grupos de permissão e habilitações',
    icone: 'gerencial',
    items: [
      { label: 'Usuários', descricao: 'Contas de acesso, grupo e permissões extras de cada usuário.', icone: 'usuarios', to: '/gerencial/usuarios', perm: 'gerencial.usuarios' },
      { label: 'Grupos de Permissão', descricao: 'Perfis de acesso, horários permitidos e níveis por tela.', icone: 'grupos', to: '/gerencial/grupos', perm: 'gerencial.grupos' },
      { label: 'Habilitações', descricao: 'Liga e desliga módulos do sistema.', icone: 'habilitacoes', to: '/gerencial/habilitacoes', perm: 'gerencial.habilitacoes' },
      { label: 'E-mail', descricao: 'Servidor de envio dos e-mails do sistema (links de rematrícula).', icone: 'send', to: '/gerencial/email', perm: 'gerencial.email' },
    ],
  },
  // Exemplo de módulo futuro (aparece quando a habilitação for ativada e houver itens):
  // { modulo: 'kanban', label: 'Kanban', descricao: '...', icone: 'gerencial', items: [{ label: 'Quadros', descricao: '...', icone: 'gerencial', to: '/kanban/quadros', perm: 'kanban.quadros' }] },
];

/** Módulos visíveis ao usuário: habilitados e com ao menos um item real permitido. */
export function modulosVisiveis(moduloAtivo: (m: string) => boolean, can: (perm: string, min?: number) => boolean) {
  return MENU.filter((m) => moduloAtivo(m.modulo))
    .map((m) => ({
      ...m,
      items: m.items.filter((i) => !i.breve && !i.oculto && can(i.perm, 1)),
      proximos: m.items.filter((i) => i.breve && can(i.perm, 1)),
    }))
    .filter((m) => m.items.length > 0);
}
