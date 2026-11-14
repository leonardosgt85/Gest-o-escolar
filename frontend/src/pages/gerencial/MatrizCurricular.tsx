import { useEffect, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Alert, Crumbs, DataTable, Modal, useFlash } from '../../components/ui';
import DisciplinaSelect from '../../components/DisciplinaSelect';

interface Item { id: number; ano: number; serie: string; disciplina_id: number; disciplina_nome: string; carga_horaria: number | null; aulas_semana: number | null; dias_semana: number[] }
const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb']] as const;
const nomeDias = (d: number[]) => DIAS.filter(([n]) => d.includes(n)).map(([, r]) => r).join(', ') || '—';
const anoAtual = new Date().getFullYear();

export default function MatrizCurricular() {
  const { can } = useAuth();
  const manut = can('gerencial.cadastros', ACESSO.manutencao);
  const [ano, setAno] = useState(String(anoAtual));
  const [serie, setSerie] = useState('');
  const [series, setSeries] = useState<string[]>([]);
  const [lista, setLista] = useState<Item[]>([]);
  const [sel, setSel] = useState<Item | null>(null);
  const [modal, setModal] = useState<{ i?: Item } | null>(null);
  const [copiar, setCopiar] = useState(false);
  const flash = useFlash();

  const carregar = () => api.get<Item[]>(`/cadastros/matriz${qs({ ano, serie })}`).then(setLista).catch(flash.erro);
  useEffect(() => { void carregar(); }, [ano, serie]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get<string[]>('/cadastros/series').then(setSeries).catch(() => {}); }, [lista.length]);

  async function remover(i: Item) {
    if (!window.confirm(`Remover ${i.disciplina_nome} da ${i.serie}?`)) return;
    try { await api.del(`/cadastros/matriz/${i.id}`); flash.ok('Removida da matriz.'); setSel(null); void carregar(); } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Estrutura da escola', to: '/estrutura' }, { label: 'Matriz curricular' }]} />
          <h1>Matriz curricular</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Adicionar disciplina</button>}
        <button className="btn btn-orange" disabled={!sel || !manut} onClick={() => sel && setModal({ i: sel })}>Editar</button>
        {manut && <button className="btn" disabled={!sel} onClick={() => sel && void remover(sel)}>Remover</button>}
        {manut && <button className="btn" onClick={() => setCopiar(true)}>Copiar de outro ano</button>}
        <label className="switch">Ano <input className="input" style={{ width: 90, marginLeft: 6 }} type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} /></label>
        <select className="input" style={{ maxWidth: 200 }} aria-label="Série" value={serie} onChange={(e) => setSerie(e.target.value)}>
          <option value="">Todas as séries</option>
          {series.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <DataTable
        cartoes
        rows={lista}
        rowKey={(i) => i.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(i) => manut && setModal({ i })}
        empty="Nenhuma disciplina na matriz deste ano. Use “Adicionar disciplina” ou “Copiar de outro ano”."
        cols={[
          { header: 'Série', render: (i) => i.serie },
          { header: 'Disciplina', render: (i) => <b>{i.disciplina_nome}</b> },
          { header: 'Carga horária', width: 120, render: (i) => i.carga_horaria ?? '—' },
          { header: 'Aulas/semana', width: 120, render: (i) => i.aulas_semana ?? '—' },
          { header: 'Dias das aulas', render: (i) => nomeDias(i.dias_semana) },
        ]}
      />
      {modal && <ItemModal item={modal.i} ano={ano} serieInicial={serie} series={series} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('Matriz gravada.'); void carregar(); }} />}
      {copiar && <CopiarModal para={ano} onClose={() => setCopiar(false)} onOk={(m) => { setCopiar(false); flash.ok(m); void carregar(); }} />}
    </>
  );
}

function ItemModal({ item, ano, serieInicial, series, onClose, onSaved }: { item?: Item; ano: string; serieInicial: string; series: string[]; onClose: () => void; onSaved: () => void }) {
  const [serie, setSerie] = useState(item?.serie ?? serieInicial);
  const [disc, setDisc] = useState<number[]>(item ? [item.disciplina_id] : []);
  const [ch, setCh] = useState(String(item?.carga_horaria ?? ''));
  const [aulas, setAulas] = useState(String(item?.aulas_semana ?? ''));
  const [dias, setDias] = useState<number[]>(item?.dias_semana ?? []);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function gravar() {
    setErro(''); setSalvando(true);
    try { await api.put('/cadastros/matriz', { ano: Number(ano), serie, disciplina_id: disc[0], carga_horaria: ch, aulas_semana: aulas, dias_semana: dias }); onSaved(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }
  return (
    <Modal title={item ? `Editar na matriz ${ano}` : `Adicionar à matriz ${ano}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={salvando} onClick={() => void gravar()}>{salvando ? 'Gravando…' : 'Gravar'}</button></>}>
      <Alert>{erro}</Alert>
      <div className="grid">
        <div className="field span-4"><label htmlFor="m-serie">Série</label>
          <input id="m-serie" className="input" list="m-series" placeholder="Ex.: 8º Ano" disabled={!!item} value={serie} onChange={(e) => setSerie(e.target.value)} />
          <datalist id="m-series">{series.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="field span-4"><label>Disciplina</label>{item ? <b>{item.disciplina_nome}</b> : <DisciplinaSelect value={disc} onChange={setDisc} rotulo="Disciplina" />}</div>
        <div className="field span-2"><label htmlFor="m-ch">Carga horária anual (horas)</label><input id="m-ch" className="input" inputMode="numeric" value={ch} onChange={(e) => setCh(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="field span-2"><label htmlFor="m-aulas">Aulas por semana</label><input id="m-aulas" className="input" inputMode="numeric" value={aulas} onChange={(e) => setAulas(e.target.value.replace(/\D/g, ''))} /></div>
        <div className="field span-4"><label>Dias da semana das aulas</label>
          <div className="dias" role="group" aria-label="Dias da semana">
            {DIAS.map(([n, r]) => <button key={n} type="button" className="chip" aria-pressed={dias.includes(n)} onClick={() => setDias(dias.includes(n) ? dias.filter((x) => x !== n) : [...dias, n])}>{r}</button>)}
          </div>
          <small className="muted">Esses dias geram as colunas do diário de classe. Pode ficar em branco por enquanto.</small>
        </div>
      </div>
    </Modal>
  );
}

function CopiarModal({ para, onClose, onOk }: { para: string; onClose: () => void; onOk: (msg: string) => void }) {
  const [de, setDe] = useState(String(Number(para) - 1));
  const [erro, setErro] = useState('');
  async function copiar() {
    setErro('');
    try { const r = await api.post<{ copiados: number; ignorados: number }>('/cadastros/matriz/copiar', { de: Number(de), para: Number(para) }); onOk(`${r.copiados} disciplina(s) copiadas${r.ignorados ? `; ${r.ignorados} já existiam` : ''}.`); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal title={`Copiar matriz para ${para}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void copiar()}>Copiar</button></>}>
      <Alert>{erro}</Alert>
      <div className="field"><label htmlFor="c-de">Copiar do ano</label><input id="c-de" className="input" type="number" value={de} onChange={(e) => setDe(e.target.value)} /></div>
      <p className="muted">O que já existe em {para} não é alterado. Depois da cópia, ajuste o que mudou na proposta do ano.</p>
    </Modal>
  );
}
