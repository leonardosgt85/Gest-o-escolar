import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { Crumbs } from '../components/ui';

// Central de ajuda: temas à esquerda, conteúdo à direita. Cada tema é um arquivo em src/ajuda/*.md
// (cabeçalho: titulo, grupo, ordem, resumo). Basta criar um .md novo para um tema novo aparecer.
interface Tema { slug: string; titulo: string; grupo: string; ordem: number; resumo: string; corpo: string }

const arquivos = import.meta.glob('../ajuda/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TEMAS: Tema[] = Object.entries(arquivos).map(([caminho, bruto]) => {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(bruto);
  const meta: Record<string, string> = {};
  for (const l of (m?.[1] || '').split('\n')) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  const slug = caminho.split('/').pop()!.replace(/\.md$/, '');
  return { slug, titulo: meta.titulo || slug, grupo: meta.grupo || 'Geral', ordem: Number(meta.ordem) || 99, resumo: meta.resumo || '', corpo: m ? m[2] : bruto };
}).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR') || a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'));

function inline(t: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let ult = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(t))) {
    if (m.index > ult) out.push(t.slice(ult, m.index));
    const x = m[0];
    if (x.startsWith('**')) out.push(<strong key={k++}>{x.slice(2, -2)}</strong>);
    else if (x.startsWith('`')) out.push(<code key={k++}>{x.slice(1, -1)}</code>);
    else if (x.startsWith('[')) {
      const [, rot, url] = /\[([^\]]+)\]\(([^)]+)\)/.exec(x)!;
      out.push(url.startsWith('/') ? <Link key={k++} to={url}>{rot}</Link> : <a key={k++} href={url} target="_blank" rel="noreferrer">{rot}</a>);
    } else out.push(<em key={k++}>{x.slice(1, -1)}</em>);
    ult = m.index + x.length;
  }
  if (ult < t.length) out.push(t.slice(ult));
  return out;
}

// Markdown simples: títulos, parágrafos, listas (numerada vira passo a passo), citação (destaque), negrito, itálico, código e links.
function Markdown({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, '').split('\n');
  const blocos: ReactNode[] = [];
  let i = 0; let k = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i += 1; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { const N = (`h${h[1].length + 1}`) as 'h2' | 'h3' | 'h4'; blocos.push(<N key={k++}>{inline(h[2])}</N>); i += 1; continue; }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) { q.push(linhas[i].replace(/^>\s?/, '')); i += 1; }
      blocos.push(<div key={k++} className="ajuda-destaque"><Icon name="info" size={18} /><div>{inline(q.join(' '))}</div></div>); continue;
    }
    const num = /^(\d+)\.\s+(.*)$/.exec(l);
    const pto = /^[-*]\s+(.*)$/.exec(l);
    if (num || pto) {
      const itens: string[][] = [];
      while (i < linhas.length) {
        const a = (num ? /^\d+\.\s+(.*)$/ : /^[-*]\s+(.*)$/).exec(linhas[i]);
        if (a) { itens.push([a[1]]); i += 1; }
        else if (/^\s{2,}\S/.test(linhas[i]) && itens.length) { itens[itens.length - 1].push(linhas[i].trim()); i += 1; }
        else break;
      }
      blocos.push(num
        ? <ol key={k++} className="ajuda-passos">{itens.map((it, n) => <li key={n}><div>{it.map((p, j) => <Fragment key={j}>{j === 0 ? <b className="passo-t">{inline(p)}</b> : <span className="passo-d">{inline(p)}</span>}</Fragment>)}</div></li>)}</ol>
        : <ul key={k++}>{itens.map((it, n) => <li key={n}>{inline(it.join(' '))}</li>)}</ul>);
      continue;
    }
    const p: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,3}\s|>|\d+\.\s|[-*]\s)/.test(linhas[i])) { p.push(linhas[i]); i += 1; }
    blocos.push(<p key={k++}>{inline(p.join(' '))}</p>);
  }
  return <>{blocos}</>;
}

const useMobile = () => {
  const q = '(max-width: 900px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  return m;
};

export default function Ajuda() {
  const { slug } = useParams();
  const mobile = useMobile();
  const [busca, setBusca] = useState('');
  const tema = TEMAS.find((t) => t.slug === slug);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? TEMAS.filter((t) => `${t.titulo} ${t.resumo} ${t.corpo}`.toLowerCase().includes(q)) : TEMAS;
  }, [busca]);
  const grupos = useMemo(() => [...new Set(lista.map((t) => t.grupo))], [lista]);

  if (slug && !tema) return <Navigate to="/ajuda" replace />;
  if (!slug && !mobile && TEMAS.length) return <Navigate to={`/ajuda/${TEMAS[0].slug}`} replace />;

  const mostrarLista = !mobile || !tema;
  const mostrarArtigo = !mobile || !!tema;
  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Início', to: '/' }, { label: 'Ajuda', to: tema ? '/ajuda' : undefined }, ...(tema ? [{ label: tema.titulo }] : [])]} />
          <h1>Ajuda</h1>
        </div>
      </div>
      <div className="ajuda">
        {mostrarLista && (
          <nav className="ajuda-nav" aria-label="Temas da ajuda">
            <input className="input" type="search" placeholder="Buscar na ajuda…" aria-label="Buscar na ajuda" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {grupos.map((g) => (
              <div key={g} className="ajuda-grupo">
                <div className="ajuda-grupo-t">{g}</div>
                {lista.filter((t) => t.grupo === g).map((t) => (
                  <Link key={t.slug} to={`/ajuda/${t.slug}`} className={`ajuda-link${t.slug === slug ? ' on' : ''}`}>
                    <span>{t.titulo}</span>
                    {mobile && t.resumo && <small>{t.resumo}</small>}
                  </Link>
                ))}
              </div>
            ))}
            {lista.length === 0 && <p className="muted">Nada encontrado para “{busca}”.</p>}
          </nav>
        )}
        {mostrarArtigo && tema && (
          <article className="ajuda-art">
            {mobile && <Link to="/ajuda" className="ajuda-voltar"><Icon name="back" size={16} /> Temas</Link>}
            <Markdown texto={tema.corpo} />
          </article>
        )}
      </div>
    </>
  );
}
