import { useEffect, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Alert, Crumbs, DataTable, useFlash } from '../../components/ui';
import { DisciplinaModal, type Disciplina } from '../../components/DisciplinaSelect';

export default function Disciplinas() {
  const { can } = useAuth();
  const manut = can('gerencial.cadastros', ACESSO.manutencao);
  const [lista, setLista] = useState<Disciplina[]>([]);
  const [busca, setBusca] = useState('');
  const [somenteAtivas, setSomenteAtivas] = useState(true);
  const [sel, setSel] = useState<Disciplina | null>(null);
  const [modal, setModal] = useState<{ d?: Disciplina } | null>(null);
  const flash = useFlash();

  const carregar = () => api.get<Disciplina[]>(`/cadastros/disciplinas${qs({ q: busca, somente_ativos: somenteAtivas })}`).then(setLista).catch(flash.erro);
  useEffect(() => { const t = window.setTimeout(carregar, 250); return () => window.clearTimeout(t); }, [busca, somenteAtivas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(d: Disciplina) {
    if (!window.confirm(`Excluir a disciplina "${d.nome}"?`)) return;
    try { await api.del(`/cadastros/disciplinas/${d.id}`); flash.ok('Disciplina excluída.'); setSel(null); void carregar(); } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gerencial', to: '/gerencial' }, { label: 'Cadastros', to: '/gerencial/cadastros' }, { label: 'Disciplinas' }]} />
          <h1>Disciplinas</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Nova</button>}
        <button className="btn btn-orange" disabled={!sel || !manut} onClick={() => sel && setModal({ d: sel })}>Editar</button>
        {manut && <button className="btn" disabled={!sel} onClick={() => sel && void excluir(sel)}>Excluir</button>}
        <label className="switch"><input type="checkbox" checked={somenteAtivas} onChange={(e) => setSomenteAtivas(e.target.checked)} /> Somente ativas</label>
        <div className="spacer" />
        <input className="input search" placeholder="Pesquisar…" aria-label="Pesquisar disciplina" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <DataTable
        cartoes
        rows={lista}
        rowKey={(d) => d.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(d) => manut && setModal({ d })}
        cols={[
          { header: 'Disciplina', render: (d) => <b>{d.nome}</b> },
          { header: 'Sigla', width: 90, render: (d) => d.sigla },
          { header: 'Professores', width: 110, render: (d) => d.professores },
          { header: 'Séries na matriz', width: 130, render: (d) => d.usos_matriz },
          { header: 'Situação', width: 100, render: (d) => <span className={`badge ${d.ativo ? 'ok' : 'off'}`}>{d.ativo ? 'Ativa' : 'Inativa'}</span> },
        ]}
      />
      {modal && <DisciplinaModal disciplina={modal.d} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('Disciplina gravada.'); void carregar(); }} />}
    </>
  );
}
