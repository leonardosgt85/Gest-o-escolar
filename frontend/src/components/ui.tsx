import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buscarCep, getPath, maskCep, maskCpf, maskFone, setPath, UFS, useOpcoes } from '../lib/utils';

/* ---------- Breadcrumb (cada nível com link volta para aquele nível) ---------- */
export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Você está em">
      {items.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="crumb-sep"> › </span>}
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <span>{title}</span>
          <button onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t, i) => (
        <button key={t} role="tab" className={`tab${i === active ? ' active' : ''}`} onClick={() => onChange(i)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/* ---------- Alert ---------- */
export function Alert({ kind = 'error', children, onClose }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode; onClose?: () => void }) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}`} role="alert">
      {children}
      {onClose && (
        <button className="linklike" style={{ float: 'right' }} onClick={onClose}>
          fechar
        </button>
      )}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ pagina, porPagina, total, onChange }: { pagina: number; porPagina: number; total: number; onChange: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const inicio = Math.max(1, Math.min(pagina - 2, paginas - 4));
  const nums = Array.from({ length: Math.min(5, paginas) }, (_, i) => inicio + i);
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <div className="pagination">
      <span>
        {de}–{ate} de {total} registro{total === 1 ? '' : 's'}
      </span>
      <div className="pages">
        <button disabled={pagina <= 1} onClick={() => onChange(pagina - 1)}>‹</button>
        {nums.map((n) => (
          <button key={n} className={n === pagina ? 'current' : ''} onClick={() => onChange(n)}>{n}</button>
        ))}
        <button disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)}>›</button>
      </div>
    </div>
  );
}

/* ---------- DataTable ---------- */
export interface Col<T> {
  header: string;
  render: (row: T) => ReactNode;
  width?: string | number;
}
export function DataTable<T>({ cols, rows, rowKey, selectedKey, onSelect, onOpen, clickable, empty = 'Nenhum registro encontrado.' }: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string | number;
  selectedKey?: string | number | null;
  onSelect?: (r: T) => void;
  onOpen?: (r: T) => void;
  clickable?: boolean; // linha inteira clicável (cursor de mão)
  empty?: string;
}) {
  return (
    <div className="table-wrap">
      <table className={`data${clickable ? ' clickable' : ''}`}>
        <thead>
          <tr>{cols.map((c) => <th key={c.header} style={{ width: c.width }}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="empty">{empty}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={rowKey(r)} className={selectedKey === rowKey(r) ? 'selected' : ''} onClick={() => onSelect?.(r)} onDoubleClick={() => onOpen?.(r)}>
              {cols.map((c) => <td key={c.header}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Formulário declarativo ---------- */
export interface FieldDef {
  name: string; // caminho com ponto para JSON aninhado (ex.: processo_seletivo.ens_medio.ano)
  label: string;
  type?: 'text' | 'date' | 'select' | 'number' | 'textarea' | 'cpf' | 'cep' | 'fone' | 'email' | 'uf' | 'password';
  options?: string[] | string; // lista fixa ou chave em /api/opcoes
  span?: 1 | 2 | 3 | 4;
  hint?: string;
  readOnly?: boolean;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
}

export type FormState = Record<string, any>;

export function Field({ def, value, onChange, opcoes }: { def: FieldDef; value: any; onChange: (v: any) => void; opcoes: Record<string, string[]> }) {
  const t = def.type || 'text';
  const lista = t === 'uf' ? UFS : typeof def.options === 'string' ? opcoes[def.options] || [] : def.options || [];
  const v = value ?? '';
  let input: ReactNode;
  if (t === 'select' || t === 'uf') {
    input = (
      <select className="input" value={v} disabled={def.readOnly} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecionar</option>
        {lista.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (t === 'textarea') {
    input = <textarea className="input" value={v} readOnly={def.readOnly} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const mask = t === 'cpf' ? maskCpf : t === 'cep' ? maskCep : t === 'fone' ? maskFone : null;
    input = (
      <input
        className="input"
        type={t === 'date' ? 'date' : t === 'number' ? 'number' : t === 'password' ? 'password' : t === 'email' ? 'email' : 'text'}
        step={t === 'number' ? '0.01' : undefined}
        value={v}
        readOnly={def.readOnly}
        maxLength={def.maxLength}
        placeholder={def.placeholder}
        autoComplete={t === 'password' ? 'new-password' : 'off'}
        onChange={(e) => onChange(mask ? mask(e.target.value) : e.target.value)}
      />
    );
  }
  return (
    <div className={`field span-${def.span || 1}`}>
      <label>{def.label}{def.required ? ' *' : ''}</label>
      {input}
      {def.hint && <div className="hint">{def.hint}</div>}
    </div>
  );
}

export interface Section {
  title?: string;
  fields: FieldDef[];
}

export function FormSections({ sections, form, setForm, readOnly }: { sections: Section[]; form: FormState; setForm: (f: FormState) => void; readOnly?: boolean }) {
  const opcoes = useOpcoes();
  const set = (name: string, v: any) => setForm(setPath(form, name, v));

  async function aoSairDoCep(def: FieldDef) {
    // Preenche rua/bairro/cidade/UF a partir do CEP (prefixo = nome do campo sem "cep").
    const prefixo = def.name.slice(0, -3);
    const r = await buscarCep(getPath(form, def.name));
    if (!r) return;
    let f = form;
    f = setPath(f, `${prefixo}rua`, getPath(f, `${prefixo}rua`) || r.rua);
    f = setPath(f, `${prefixo}bairro`, getPath(f, `${prefixo}bairro`) || r.bairro);
    f = setPath(f, `${prefixo}cidade`, getPath(f, `${prefixo}cidade`) || r.cidade);
    f = setPath(f, `${prefixo}uf`, getPath(f, `${prefixo}uf`) || r.uf);
    setForm(f);
  }

  return (
    <div className="grid">
      {sections.map((s, i) => (
        <FragmentSection key={i} title={s.title}>
          {s.fields.map((def) => (
            <div key={def.name} className={`span-${def.span || 1}`} onBlur={def.type === 'cep' && !readOnly ? () => aoSairDoCep(def) : undefined} style={{ display: 'contents' }}>
              <Field def={{ ...def, readOnly: readOnly || def.readOnly }} value={getPath(form, def.name)} onChange={(v) => set(def.name, v)} opcoes={opcoes} />
            </div>
          ))}
        </FragmentSection>
      ))}
    </div>
  );
}

function FragmentSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <>
      {title && <div className="section-title">{title}</div>}
      {children}
    </>
  );
}

/* ---------- Hook de confirmação simples ---------- */
export function useFlash() {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  useEffect(() => {
    if (msg?.kind === 'ok') {
      const t = setTimeout(() => setMsg(null), Math.max(4000, msg.text.length * 70)); // mensagens longas ficam mais tempo
      return () => clearTimeout(t);
    }
  }, [msg]);
  return { msg, ok: (text: string) => setMsg({ kind: 'ok', text }), erro: (e: unknown) => setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) }), clear: () => setMsg(null) };
}
