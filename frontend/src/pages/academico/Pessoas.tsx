import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { PessoaFormModal, type PessoaResumo } from '../../components/PessoaModals';
import { Crumbs, Alert, DataTable, Pagination, useFlash, useConfirmar } from '../../components/ui';

export default function Pessoas() {
  const { can } = useAuth();
  const manut = can('academico.pessoas', ACESSO.manutencao);
  const podeExcluir = can('academico.pessoas.excluir', 1);
  const [filtros, setFiltros] = useState({ codigo: '', nome: '', cpf: '', email: '' });
  const [res, setRes] = useState<{ itens: PessoaResumo[]; total: number; pagina: number; por_pagina: number }>({ itens: [], total: 0, pagina: 1, por_pagina: 10 });
  const [sel, setSel] = useState<PessoaResumo | null>(null);
  const [modal, setModal] = useState<{ id?: number } | null>(null);
  const flash = useFlash();
  const [carregando, setCarregando] = useState(true);
  const conf = useConfirmar();
  const timer = useRef<number>();

  const buscar = (pagina = 1) => api.get(`/pessoas${qs({ ...filtros, pagina })}`).then(setRes).catch(flash.erro).finally(() => setCarregando(false));
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => buscar(1), 250);
    return () => window.clearTimeout(timer.current);
  }, [filtros]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir() {
    if (!sel || !(await conf.pedir({ titulo: 'Excluir pessoa', texto: <>Excluir <b>{sel.nome}</b>? Se ela estiver vinculada a algum aluno como responsável, o sistema vai recusar a exclusão.</>, confirmar: 'Excluir', perigo: true }))) return;
    try { await api.del(`/pessoas/${sel.id}`); setSel(null); flash.ok('Pessoa excluída.'); buscar(res.pagina); } catch (e) { flash.erro(e); }
  }

  const campo = (k: keyof typeof filtros, rotulo: string) => (
    <div className="field"><label>{rotulo}</label><input className="input" value={filtros[k]} onChange={(e) => setFiltros({ ...filtros, [k]: e.target.value })} /></div>
  );

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Secretaria', to: '/secretaria' }, { label: 'Responsáveis' }]} />
          <h1>Responsáveis</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      {conf.dialog}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid">{campo('codigo', 'Código')}{campo('nome', 'Nome')}{campo('cpf', 'CPF')}{campo('email', 'E-mail')}</div>
      </div>
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Novo</button>}
        <button className="btn btn-orange" disabled={!sel} onClick={() => sel && setModal({ id: sel.id })}>{manut ? 'Editar' : 'Consultar'}</button>
        {podeExcluir && <button className="btn btn-red" disabled={!sel} onClick={excluir}>Excluir</button>}
      </div>
      <DataTable
        loading={carregando}
        rows={res.itens}
        rowKey={(p) => p.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(p) => setModal({ id: p.id })}
        cols={[
          { header: 'Código', width: 90, render: (p) => p.id },
          { header: 'CPF', render: (p) => <span style={{ whiteSpace: 'nowrap' }}>{p.cpf}</span> },
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
