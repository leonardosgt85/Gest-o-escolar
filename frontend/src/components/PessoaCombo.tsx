import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { api, qs } from '../api';
import { ACESSO, useAuth } from '../auth';
import Icon from './Icon';
import { PessoaFormModal, type PessoaResumo } from './PessoaModals';

// Campo de pessoa dentro do formulário: digite nome ou CPF para buscar; se a pessoa
// ainda não existe, o ícone "+" abre o cadastro ali mesmo e já vincula ao salvar.
export default function PessoaCombo({ label, value, onChange, readOnly, prefill, span = 2 }: {
  label: string;
  value: PessoaResumo | null | undefined;
  onChange: (p: PessoaResumo | null) => void;
  readOnly?: boolean;
  prefill?: Record<string, any>; // dados sugeridos ao cadastrar uma pessoa nova (ex.: sexo, endereço do aluno)
  span?: 1 | 2 | 3 | 4;
}) {
  const { can } = useAuth();
  const podeBuscar = can('academico.pessoas', ACESSO.consulta);
  const podeCriar = can('academico.pessoas', ACESSO.manutencao);
  const [texto, setTexto] = useState('');
  const [itens, setItens] = useState<PessoaResumo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [modal, setModal] = useState<null | { id?: number; initial?: Record<string, any> }>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const req = useRef(0);

  useEffect(() => {
    if (value || !aberto || texto.trim().length < 2 || !podeBuscar) {
      setItens([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const id = ++req.current;
      setCarregando(true);
      const soNumeros = /^[\d.\-\s]+$/.test(texto.trim());
      try {
        const r = await api.get<{ itens: PessoaResumo[] }>(`/pessoas${qs({ [soNumeros ? 'cpf' : 'nome']: texto.trim(), por_pagina: 6 })}`);
        if (id === req.current) { setItens(r.itens); setAtivo(0); }
      } catch {
        if (id === req.current) setItens([]);
      } finally {
        if (id === req.current) setCarregando(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [texto, aberto, value, podeBuscar]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function escolher(p: PessoaResumo) {
    onChange(p);
    setTexto('');
    setAberto(false);
  }

  function cadastrar() {
    setAberto(false);
    setModal({ initial: { ...(prefill || {}), ...(texto.trim() && !/^[\d.\-\s]+$/.test(texto.trim()) ? { nome: texto.trim() } : {}), ...(/^[\d.\-\s]+$/.test(texto.trim()) && texto.trim() ? { cpf: texto.trim() } : {}) } });
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, itens.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && aberto && itens[ativo]) { e.preventDefault(); escolher(itens[ativo]); }
    else if (e.key === 'Escape') setAberto(false);
  }

  const detalhe = (p: PessoaResumo) => [p.cpf, p.celular || p.telefone, p.email].filter(Boolean).join(' · ') || 'Sem dados de contato';

  return (
    <div className={`field span-${span}`} ref={caixa}>
      <label>{label}</label>
      <div className="combo-row">
        <div className="combo">
          {value ? (
            <div className="combo-linked">
              <div className="avatar">{value.nome.slice(0, 1).toUpperCase()}</div>
              <div className="combo-linked-text">
                <b>{value.nome}</b>
                <small>{detalhe(value)}</small>
              </div>
              {!readOnly && (
                <button type="button" className="icon-btn" title="Desvincular" aria-label={`Desvincular ${label}`} onClick={() => onChange(null)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ) : (
            <input
              className="input"
              placeholder={podeBuscar ? 'Digite o nome ou CPF para buscar…' : 'Sem permissão para buscar pessoas'}
              value={texto}
              disabled={readOnly || !podeBuscar}
              onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              onKeyDown={teclas}
              autoComplete="off"
            />
          )}
          {aberto && !value && texto.trim().length >= 2 && (
            <div className="combo-list" role="listbox">
              {itens.map((p, i) => (
                <button type="button" key={p.id} role="option" aria-selected={i === ativo} className={`combo-item${i === ativo ? ' active' : ''}`} onMouseEnter={() => setAtivo(i)} onClick={() => escolher(p)}>
                  <b>{p.nome}</b>
                  <small>{detalhe(p)}</small>
                </button>
              ))}
              {carregando && <div className="combo-empty">Buscando…</div>}
              {!carregando && itens.length === 0 && (
                <div className="combo-empty">
                  Nenhuma pessoa encontrada.
                  {podeCriar && <button type="button" className="linklike" style={{ textAlign: 'left' }} onClick={cadastrar}>+ Cadastrar nova pessoa</button>}
                </div>
              )}
            </div>
          )}
        </div>
        {!readOnly && value && podeBuscar && (
          <button type="button" className="btn-icon" title="Ver / editar cadastro da pessoa" aria-label="Ver ou editar cadastro da pessoa" onClick={() => setModal({ id: value.id })}>
            <Icon name="edit" />
          </button>
        )}
        {!readOnly && !value && podeCriar && (
          <button type="button" className="btn-icon btn-icon-accent" title="Cadastrar nova pessoa" aria-label="Cadastrar nova pessoa" onClick={cadastrar}>
            <Icon name="userPlus" />
          </button>
        )}
      </div>
      {modal && (
        <PessoaFormModal
          id={modal.id}
          initial={modal.initial}
          readOnly={modal.id ? !podeCriar : false}
          onClose={() => setModal(null)}
          onSaved={async (id) => {
            setModal(null);
            try { onChange(await api.get<PessoaResumo>(`/pessoas/${id}`)); } catch { /* mantém o valor atual */ }
            setTexto('');
          }}
        />
      )}
    </div>
  );
}
