import { useEffect, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Alert, Crumbs, DataTable, Modal, useFlash, useConfirmar, useLimpaErro } from '../../components/ui';
import { brl } from '../../lib/matriculas';

export interface ItemCatalogo { id: number; ano: number; tipo: string; nome: string; serie: string | null; valor: number; por_bimestre: boolean; ativo: boolean }
export const TIPO_ITEM: Record<string, string> = { material: 'Material didático', uniforme: 'Uniforme', outro: 'Outro' };
const anoAtual = new Date().getFullYear();

// Catálogo de itens vendidos ao aluno (material didático, uniformes...): preço por ano e série, cadastrado uma vez.
export default function ItensCatalogo() {
  const { can } = useAuth();
  const manut = can('gerencial.cadastros', ACESSO.manutencao);
  const [ano, setAno] = useState(String(anoAtual));
  const [lista, setLista] = useState<ItemCatalogo[]>([]);
  const [sel, setSel] = useState<ItemCatalogo | null>(null);
  const [modal, setModal] = useState<{ i?: ItemCatalogo } | null>(null);
  const [copiar, setCopiar] = useState(false);
  const flash = useFlash();
  const [carregando, setCarregando] = useState(true);
  const conf = useConfirmar();
  const carregar = () => api.get<ItemCatalogo[]>(`/itens/catalogo${qs({ ano })}`).then((r) => { setLista(r); setSel(null); }).catch(flash.erro).finally(() => setCarregando(false));
  useEffect(() => { void carregar(); }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(i: ItemCatalogo) {
    if (!(await conf.pedir({ titulo: 'Excluir item do catálogo', texto: <>Excluir <b>{i.nome}</b> do catálogo de {i.ano}? Se algum aluno já tiver este item, o sistema vai pedir para inativá-lo em vez de excluir.</>, confirmar: 'Excluir', perigo: true }))) return;
    try { await api.del(`/itens/catalogo/${i.id}`); flash.ok('Item excluído.'); void carregar(); } catch (e) { flash.erro(e); }
  }
  return (
    <>
      <div className="page-title"><div>
        <Crumbs items={[{ label: 'Estrutura da escola', to: '/estrutura' }, { label: 'Material e uniformes' }]} />
        <h1>Material e uniformes</h1>
      </div></div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      {conf.dialog}
      <p className="muted" style={{ marginTop: 0 }}>Cadastre aqui o que a escola vende e o valor por série. Na ficha do aluno, o item já entra com este valor. O material é entregue por bimestre, conforme o pagamento.</p>
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Novo item</button>}
        <button className="btn btn-orange" disabled={!sel || !manut} onClick={() => sel && setModal({ i: sel })}>Editar</button>
        {manut && <button className="btn" disabled={!sel} onClick={() => sel && void excluir(sel)}>Excluir</button>}
        {manut && <button className="btn" onClick={() => setCopiar(true)}>Copiar de outro ano</button>}
        <label className="switch">Ano letivo <input className="input" style={{ width: 90, marginLeft: 6 }} type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} /></label>
      </div>
      <DataTable loading={carregando} cartoes rows={lista} rowKey={(i) => i.id} selectedKey={sel?.id} onSelect={setSel} onOpen={(i) => manut && setModal({ i })} empty="Nenhum item neste ano. Use “Novo item”."
        cols={[
          { header: 'Item', render: (i) => <b>{i.nome}</b> },
          { header: 'Tipo', width: 150, render: (i) => TIPO_ITEM[i.tipo] },
          { header: 'Série', width: 130, render: (i) => i.serie || 'Todas' },
          { header: 'Valor', width: 120, render: (i) => brl(i.valor) },
          { header: 'Entrega', width: 130, render: (i) => (i.por_bimestre ? 'Por bimestre' : 'Única') },
          { header: 'Situação', width: 100, render: (i) => <span className={`badge ${i.ativo ? 'ok' : 'off'}`}>{i.ativo ? 'Ativo' : 'Inativo'}</span> },
        ]} />
      {modal && <ItemModal item={modal.i} ano={ano} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('Item gravado.'); void carregar(); }} />}
      {copiar && <CopiarModal para={ano} onClose={() => setCopiar(false)} onDone={(m) => { setCopiar(false); flash.ok(m); void carregar(); }} />}
    </>
  );
}

function ItemModal({ item, ano, onClose, onSaved }: { item?: ItemCatalogo; ano: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ano: item?.ano ?? Number(ano), tipo: item?.tipo ?? 'material', nome: item?.nome ?? '', serie: item?.serie ?? '', valor: item ? String(item.valor).replace('.', ',') : '', ativo: item?.ativo ?? true });
  const [series, setSeries] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  useLimpaErro(erro, () => setErro(''), f);
  useEffect(() => { api.get<string[]>('/cadastros/series').then(setSeries).catch(() => {}); }, []);
  async function gravar() {
    setErro('');
    try { if (item) await api.put(`/itens/catalogo/${item.id}`, f); else await api.post('/itens/catalogo', f); onSaved(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal title={item ? 'Editar item' : 'Novo item'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void gravar()}>Gravar</button></>}>
      <Alert>{erro}</Alert>
      <div className="grid">
        <div className="field span-2"><label htmlFor="i-tipo">Tipo</label>
          <select id="i-tipo" className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPO_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="i-ano">Ano letivo</label><input id="i-ano" className="input" type="number" value={f.ano} onChange={(e) => setF({ ...f, ano: Number(e.target.value) })} /></div>
        <div className="field span-4"><label htmlFor="i-nome">Nome</label><input id="i-nome" className="input" placeholder="Ex.: Material didático 2026, Camiseta" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div className="field span-2"><label htmlFor="i-serie">Série</label><input id="i-serie" className="input" list="i-series" placeholder="Todas as séries" value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} /><datalist id="i-series">{series.map((s) => <option key={s} value={s} />)}</datalist></div>
        <div className="field span-2"><label htmlFor="i-valor">Valor (R$)</label><input id="i-valor" className="input" inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value.replace(/[^\d,.]/g, '') })} /></div>
        <div className="field span-4"><small className="muted">{f.tipo === 'material' ? 'Material didático: entrega por bimestre (1º ao 4º), liberada conforme o pagamento.' : 'Entrega única, liberada com o pagamento total.'}</small></div>
        {item && <div className="field span-4"><label className="switch"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Item ativo</label></div>}
      </div>
    </Modal>
  );
}

function CopiarModal({ para, onClose, onDone }: { para: string; onClose: () => void; onDone: (m: string) => void }) {
  const [de, setDe] = useState(String(Number(para) - 1));
  const [rj, setRj] = useState('0');
  const [erro, setErro] = useState('');
  async function copiar() {
    setErro('');
    try { const r = await api.post<{ criados: number; existentes: number }>('/itens/catalogo/copiar-ano', { de: Number(de), para: Number(para), reajuste_percentual: rj }); onDone(`${r.criados} item(ns) copiados para ${para}${r.existentes ? ` (${r.existentes} já existiam)` : ''}.`); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal title={`Copiar itens para ${para}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void copiar()}>Copiar</button></>}>
      <Alert>{erro}</Alert>
      <div className="grid">
        <div className="field span-2"><label htmlFor="c-de">Copiar do ano</label><input id="c-de" className="input" type="number" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="field span-2"><label htmlFor="c-rj">Reajuste (%)</label><input id="c-rj" className="input" inputMode="decimal" value={rj} onChange={(e) => setRj(e.target.value.replace(/[^\d,.]/g, ''))} /></div>
      </div>
    </Modal>
  );
}
