import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { MENU, modulosVisiveis } from '../menu';
import Icon from './Icon';

const CHAVE_COLAPSADO = 'csm.sidebar.colapsado';
const MOBILE = '(max-width: 900px)';
const lerColapsado = () => {
  try { return localStorage.getItem(CHAVE_COLAPSADO) === '1'; } catch { return false; }
};

export default function Layout() {
  const { me, logout, can, moduloAtivo } = useAuth();
  const { pathname } = useLocation();
  const [colapsado, setColapsado] = useState(lerColapsado);
  const [gaveta, setGaveta] = useState(false); // menu aberto no celular
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const h = () => setMobile(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // Só aparecem módulos habilitados com ao menos um item permitido.
  const modulos = modulosVisiveis(moduloAtivo, can);
  // grupo da página atual: o do item (ou rota) de caminho mais específico; o hub /<id> também conta
  const moduloDoCaminho = (() => {
    let melhor: { id: string; n: number } | null = null;
    for (const m of modulos) {
      const caminhos = [`/${m.id}`, ...m.items.map((i) => i.to), ...(m.rotas || []), ...(MENU.find((x) => x.id === m.id)?.items.map((i) => i.to) || [])];
      for (const c of caminhos) if ((pathname === c || pathname.startsWith(`${c}/`)) && (!melhor || c.length > melhor.n)) melhor = { id: m.id, n: c.length };
    }
    return melhor?.id;
  })();

  // Submenu (acordeão): o módulo da página atual abre sozinho; clicar no módulo abre/fecha o submenu.
  const [aberto, setAberto] = useState<string | null>(moduloDoCaminho ?? null);
  // Barra recolhida: o submenu aparece como um painel flutuante ao lado do ícone.
  const [flutuante, setFlutuante] = useState<{ modulo: string; top: number } | null>(null);
  const flutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (moduloDoCaminho) setAberto(moduloDoCaminho);
    setFlutuante(null);
    setGaveta(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!flutuante) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (!flutRef.current?.contains(alvo) && !alvo.closest('.nav-module-btn')) setFlutuante(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFlutuante(null);
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc); };
  }, [flutuante]);

  const recolhidoDesktop = colapsado && !mobile;
  function clicarModulo(m: string, el: HTMLElement) {
    if (recolhidoDesktop) {
      const top = el.getBoundingClientRect().top;
      setFlutuante((f) => (f?.modulo === m ? null : { modulo: m, top }));
    } else {
      setAberto((a) => (a === m ? null : m));
    }
  }

  function alternarMenu() {
    // No celular abre/fecha a gaveta; no desktop recolhe/expande a barra lateral.
    if (mobile) {
      setGaveta((g) => !g);
      return;
    }
    const novo = !colapsado;
    setColapsado(novo);
    try { localStorage.setItem(CHAVE_COLAPSADO, novo ? '1' : '0'); } catch { /* ignora */ }
  }

  return (
    <div className={`shell${colapsado ? ' collapsed' : ''}`}>
      <aside className={`sidebar${gaveta ? ' open' : ''}`} aria-label="Menu principal">
        <div className="sidebar-brand">
          <Link to="/" aria-label="Colégio São Mateus — início">
            <img className="brand-full" src="/logo-csm.jpg" alt="Colégio São Mateus" />
            <img className="brand-mark" src="/logo-csm-mark.jpg" alt="CSM" />
          </Link>
          <button
            className="sidebar-toggle"
            onClick={alternarMenu}
            title={mobile ? 'Fechar menu' : colapsado ? 'Expandir menu' : 'Recolher menu'}
            aria-label={mobile ? 'Fechar menu' : colapsado ? 'Expandir menu' : 'Recolher menu'}
          >
            <Icon name={mobile ? 'close' : colapsado ? 'expand' : 'collapse'} size={18} />
          </button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} title="Início">
            <Icon name="home" />
            <span className="nav-label">Início</span>
          </NavLink>
          {modulos.map((m) => {
            const ativo = moduloDoCaminho === m.id;
            const expandido = !recolhidoDesktop && aberto === m.id;
            return (
              <div key={m.id} className={`nav-module${expandido ? ' open' : ''}${ativo ? ' has-active' : ''}`}>
                <button
                  className="nav-module-btn"
                  onClick={(e) => clicarModulo(m.id, e.currentTarget)}
                  aria-expanded={recolhidoDesktop ? flutuante?.modulo === m.id : expandido}
                  aria-controls={`submenu-${m.id}`}
                  title={m.label}
                >
                  <Icon name={m.icone} />
                  <span className="nav-label">{m.label}</span>
                  <span className="chev"><Icon name="chevron" size={14} /></span>
                </button>
                <div className="nav-items" id={`submenu-${m.id}`}>
                  <div className="nav-items-inner">
                    {m.items.map((i) => (
                      <NavLink key={i.to} to={i.to} tabIndex={expandido ? 0 : -1} className={({ isActive }) => `nav-sub${isActive ? ' active' : ''}`}>
                        {i.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      {flutuante && (() => {
        const m = modulos.find((x) => x.id === flutuante.modulo);
        if (!m) return null;
        return (
          <div className="flyout" ref={flutRef} style={{ top: Math.max(8, flutuante.top) }} role="menu" aria-label={m.label}>
            <Link to={`/${m.id}`} className="flyout-title">{m.label}</Link>
            {m.items.map((i) => (
              <NavLink key={i.to} to={i.to} role="menuitem" className={({ isActive }) => `nav-sub${isActive ? ' active' : ''}`}>{i.label}</NavLink>
            ))}
          </div>
        );
      })()}
      {gaveta && <div className="sidebar-backdrop" onClick={() => setGaveta(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar-menu" onClick={() => setGaveta(true)} title="Abrir menu" aria-label="Abrir menu">
            <Icon name="menu" />
          </button>
          <Link to="/" className="topbar-logo" aria-label="Início"><img src="/logo-csm-mark.jpg" alt="CSM" /></Link>
          <div className="topbar-spacer" />
          <Link to="/ajuda" className="icon-btn" title="Ajuda" aria-label="Ajuda"><Icon name="help" /></Link>
          <div className="user-chip">
            <div className="user-text">
              <b>{me?.nome}</b>
              <span>{me?.nivel}{me?.grupo ? ` · ${me.grupo.nome}` : ''}</span>
            </div>
            <div className="avatar">{me?.foto ? <img src={me.foto} alt="" /> : (me?.nome || '?').slice(0, 1).toUpperCase()}</div>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair">
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
