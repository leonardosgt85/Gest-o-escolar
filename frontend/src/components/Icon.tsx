// Ícones de traço (estilo "line"), sem dependências. Use <Icon name="home" />.
const PATHS = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6',
  academico: 'M22 10 12 5 2 10l10 5 10-5zM6 12.5v4.5c3 2.2 9 2.2 12 0v-4.5',
  alunos: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pessoas: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  gerencial: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  usuarios: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 11l2 2 4-4',
  grupos: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  habilitacoes: 'M16 5H8a7 7 0 0 0 0 14h8a7 7 0 0 0 0-14zM16 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 17h.01',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  userPlus: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  cadastros: 'M4 4h16v16H4zM4 9h16M9 9v11',
  diario: 'M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM9 7h6M9 11h6M9 15h3',
  relatorios: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  dashboard: 'M3 3h8v9H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 14h8v7H3z',
  fileDown: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  check: 'M5 12l5 5 9-10',
  back: 'M15 6l-6 6 6 6',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  collapse: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expand: 'M13 17l5-5-5-5M6 17l5-5-5-5',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
