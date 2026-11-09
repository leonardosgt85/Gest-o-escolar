import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { PessoaFormModal, type PessoaResumo } from '../../components/PessoaModals';
import { Crumbs, Alert, DataTable, Pagination, useFlash } from '../../components/ui';

export default function Pessoas() {
  const { can } = useAuth();
  const manut = can('academico.pessoas', ACESSO.manutencao);
  const podeExcluir = can('academico.pessoas.excluir', 1);
  const [filtros, setFiltros] = useState({ codigo: '', nome: '', cpf: '', email: '' });
  const [res, setRes] = useState<{ itens: PessoaResumo[]; total: number; pagina: number; por_pagina: number }>({ itens: [], total: 0, pagina: 1, por_pagina: 10 });
  const [sel, setSel] = useState<PessoaResumo | null>(null);
  const [modal, setModal] = useState<{ id?: number } | null>(null);
  const flash = useFlash();
  const timer = useRef<number>();

  const buscar = (pagina = 1) => api.get(`/pessoas${qs({ ...filtros, pagina })}`).then(setRes).catch(flash.erro);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => buscar(1), 250);
    return () => window.clearTimeout(timer.current);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir() {
    if (!sel || !window.confirm(`Excluir ${sel.nome}?`)) return;
    try { await api.del(`/pessoas/${sel.id}`); setSel(null); flash.ok('Pessoa excluída.'); buscar(res.pagina); } catch (e) { flash.erro(e); }
  }

  const campo = (k: keyof typeof filtros, rotulo: string) => (
    <div className="field"><label>{rotulo}</label><input className="input" value={filtros[k]} onChange={(e) => setFiltros({ ...filtros, [k]: e.target.value })} /></div>
  );

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Pessoas (responsáveis)' }]} />
          <h1>Pessoas (responsáveis)</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid">{campo('codigo', 'Código')}{campo('nome', 'Nome')}{campo('cpf', 'CPF')}{campo('email', 'E-mail')}</div>
      </div>
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Novo</button>}
        <button className="btn btn-orange" disabled={!sel} onClick={() => sel && setModal({ id: sel.id })}>{manut ? 'Editar' : 'Consultar'}</button>
        {podeExcluir && <button className="btn btn-red" disabled={!sel} onClick={excluir}>Excluir</button>}
      </div>
      <DataTable
        rows={res.itens}
        rowKey={(p) => p.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(p) => setModal({ id: p.id })}
        cols={[
          { header: 'Código', width: 90, render: (p) => p.id },
          { header: 'CPF', render: (p) => p.cpf },
          { header: 'Nome', render: (p) => <b>{p.nome}</b> },
          { header: 'Sexo', render: (p) => p.sexo },
          { header: 'E-mail', render: (p) => p.email },
          { header: 'Celular', render: (p) => p.celular },
        ]}
      />
      <Pagination pagina={res.pagina} porPagina={res.por_pagina} total={res.total} onChange={buscar} />
      {modal && (
        <PessoaFormModal id={modal.id} readOnly={!manut} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); flash.ok('Pessoa gravada.'); buscar(res.pagina); }} />
      )}
    </>
  );
}
