import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../api';
import { ACESSO, useAuth } from '../auth';
import { Alert, DataTable, FormSections, Modal, Pagination, Tabs, type Section, useLimpaErro } from './ui';

export interface PessoaResumo { id: number; nome: string; cpf?: string | null; sexo?: string | null; email?: string | null; ultimo_login?: string | null; celular?: string | null; telefone?: string | null }

const endereco = (p: string): Section['fields'] => [
  { name: `${p}cep`, label: 'CEP', type: 'cep', hint: 'Preenche o endereço automaticamente' },
  { name: `${p}rua`, label: 'Rua', span: 2 },
  { name: `${p}numero`, label: 'Nº' },
  { name: `${p}complemento`, label: 'Complemento', span: 2 },
  { name: `${p}bairro`, label: 'Bairro' },
  { name: `${p}cidade`, label: 'Cidade' },
  { name: `${p}uf`, label: 'UF', type: 'uf' },
];

const DADOS: Section[] = [{
  fields: [
    { name: 'nome', label: 'Nome completo', span: 2, required: true },
    { name: 'cpf', label: 'CPF', type: 'cpf' },
    { name: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
    { name: 'sexo', label: 'Sexo', type: 'select', options: 'sexo' },
    { name: 'estado_civil', label: 'Estado civil', type: 'select', options: 'estado_civil' },
    { name: 'profissao', label: 'Profissão' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'rg', label: 'RG' },
    { name: 'rg_orgao_emissor', label: 'Órgão emissor' },
    { name: 'rg_uf', label: 'UF RG', type: 'uf' },
    { name: 'ddd', label: 'DDD', maxLength: 3 },
    { name: 'telefone', label: 'Telefone', type: 'fone' },
    { name: 'celular', label: 'Celular', type: 'fone' },
    { name: 'observacoes', label: 'Observações', type: 'textarea', span: 4 },
  ],
}];

export function PessoaFormModal({ id, readOnly, initial, onClose, onSaved }: { id?: number; readOnly?: boolean; initial?: Record<string, any>; onClose: () => void; onSaved: (id: number) => void }) {
  const [aba, setAba] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({ endereco_comercial: {}, ref_comerciais: [], ...(initial || {}) });
  const [erro, setErro] = useState('');
  useLimpaErro(erro, () => setErro(''), form);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (id) api.get(`/pessoas/${id}`).then(setForm).catch((e) => setErro(e.message));
  }, [id]);

  async function gravar() {
    setErro('');
    setSalvando(true);
    try {
      const r = id ? await api.put(`/pessoas/${id}`, form).then(() => ({ id })) : await api.post<{ id: number }>('/pessoas', form);
      onSaved(r.id);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }

  const refs: { nome?: string; telefone?: string; observacao?: string }[] = form.ref_comerciais || [];
  const setRef = (i: number, campo: string, v: string) => setForm({ ...form, ref_comerciais: refs.map((r, j) => (j === i ? { ...r, [campo]: v } : r)) });

  return (
    <Modal title={id ? `Pessoa ${id}` : 'Cadastro de Pessoa Física'} onClose={onClose} wide
      footer={<>
        <button className="btn" onClick={onClose}>Fechar</button>
        {!readOnly && <button className="btn btn-primary" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>}
      </>}>
      <Alert>{erro}</Alert>
      <Tabs tabs={['Dados', 'Endereço Residencial', 'Endereço Comercial', 'Ref. Comerciais']} active={aba} onChange={setAba} />
      {aba === 0 && <FormSections sections={DADOS} form={form} setForm={setForm} readOnly={readOnly} />}
      {aba === 1 && <FormSections sections={[{ fields: endereco('') }]} form={form} setForm={setForm} readOnly={readOnly} />}
      {aba === 2 && <FormSections sections={[{ fields: [{ name: 'endereco_comercial.empresa', label: 'Empresa', span: 2 }, { name: 'endereco_comercial.telefone', label: 'Telefone', type: 'fone', span: 2 }, ...endereco('endereco_comercial.')] }]} form={form} setForm={setForm} readOnly={readOnly} />}
      {aba === 3 && (
        <>
          {refs.map((r, i) => (
            <div className="grid" key={i} style={{ marginBottom: 10 }}>
              <div className="field span-2"><label>Nome</label><input className="input" value={r.nome || ''} readOnly={readOnly} onChange={(e) => setRef(i, 'nome', e.target.value)} /></div>
              <div className="field"><label>Telefone</label><input className="input" value={r.telefone || ''} readOnly={readOnly} onChange={(e) => setRef(i, 'telefone', e.target.value)} /></div>
              <div className="field"><label>&nbsp;</label>{!readOnly && <button className="btn btn-sm btn-red" onClick={() => setForm({ ...form, ref_comerciais: refs.filter((_, j) => j !== i) })}>Remover</button>}</div>
              <div className="field span-4"><label>Observação</label><input className="input" value={r.observacao || ''} readOnly={readOnly} onChange={(e) => setRef(i, 'observacao', e.target.value)} /></div>
            </div>
          ))}
          {!readOnly && <button className="btn" onClick={() => setForm({ ...form, ref_comerciais: [...refs, {}] })}>+ Adicionar referência</button>}
          {readOnly && refs.length === 0 && <div className="empty">Sem referências.</div>}
        </>
      )}
    </Modal>
  );
}

// Modal "Vincular / Consultar": filtros Código, Nome, CPF, E-mail; botões Novo, Selecionar, Fechar.
export function PessoaPickerModal({ titulo, onSelect, onClose }: { titulo: string; onSelect: (p: PessoaResumo) => void; onClose: () => void }) {
  const { can } = useAuth();
  const [filtros, setFiltros] = useState({ codigo: '', nome: '', cpf: '', email: '' });
  const [res, setRes] = useState<{ itens: PessoaResumo[]; total: number; pagina: number; por_pagina: number }>({ itens: [], total: 0, pagina: 1, por_pagina: 8 });
  const [sel, setSel] = useState<PessoaResumo | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState('');
  const timer = useRef<number>();

  const buscar = (pagina = 1) => api.get(`/pessoas${qs({ ...filtros, pagina, por_pagina: 8 })}`).then(setRes).catch((e) => setErro(e.message));
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => buscar(1), 250);
    return () => window.clearTimeout(timer.current);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = (k: keyof typeof filtros, rotulo: string) => (
    <div className="field"><label>{rotulo}</label><input className="input" value={filtros[k]} onChange={(e) => setFiltros({ ...filtros, [k]: e.target.value })} /></div>
  );

  return (
    <>
      <Modal title={`Vincular / Consultar — ${titulo}`} onClose={onClose} wide
        footer={<>
          {can('academico.pessoas', ACESSO.manutencao) && <button className="btn btn-green" onClick={() => setNovo(true)}>Novo</button>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={!sel} onClick={() => sel && onSelect(sel)}>Selecionar</button>
          <button className="btn" onClick={onClose}>Fechar</button>
        </>}>
        <Alert>{erro}</Alert>
        <div className="grid" style={{ marginBottom: 12 }}>{f('codigo', 'Código')}{f('nome', 'Nome')}{f('cpf', 'CPF')}{f('email', 'E-mail')}</div>
        <DataTable
          rows={res.itens}
          rowKey={(p) => p.id}
          selectedKey={sel?.id}
          onSelect={setSel}
          onOpen={onSelect}
          cols={[
            { header: 'Código', render: (p) => p.id },
            { header: 'CPF', render: (p) => p.cpf },
            { header: 'Nome', render: (p) => <b>{p.nome}</b> },
            { header: 'Sexo', render: (p) => p.sexo },
            { header: 'E-mail', render: (p) => p.email },
          ]}
        />
        <Pagination pagina={res.pagina} porPagina={res.por_pagina} total={res.total} onChange={buscar} />
      </Modal>
      {novo && <PessoaFormModal onClose={() => setNovo(false)} onSaved={async (id) => { setNovo(false); const p = await api.get<PessoaResumo>(`/pessoas/${id}`); onSelect(p); }} />}
    </>
  );
}
