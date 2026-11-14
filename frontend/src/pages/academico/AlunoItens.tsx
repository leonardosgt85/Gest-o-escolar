import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert, Crumbs, Modal, useFlash, useConfirmar } from '../../components/ui';
import { brl } from '../../lib/matriculas';
import { fmtData } from '../../lib/utils';
import { TIPO_ITEM, type ItemCatalogo } from '../gerencial/ItensCatalogo';

interface Etapa { bimestre: number; aplica: boolean; entregue: boolean; data_entrega: string | null; justificativa: string | null; esperado: number; liberada_pelo_pagamento: boolean }
interface Pag { id: number; data: string; valor: number; forma: string; parcelas: number; observacao: string | null }
interface Item { id: number; tipo: string; descricao: string; tamanho: string | null; quantidade: number; valor_total: number; pago: number; saldo: number; status: string; por_bimestre: boolean; bimestre_inicio: number; observacao: string | null; etapas: Etapa[]; pagamentos: Pag[] }
interface Dados { aluno: { id: number; nome: string }; ano: number; matricula: { serie: string | null; turno: string | null } | null; anos: number[]; catalogo: ItemCatalogo[]; itens: Item[]; resumo: { total: number; pago: number; saldo: number } }

const FORMAS: Record<string, string> = { cartao_credito: 'Cartão de crédito', pix: 'Pix', dinheiro: 'Dinheiro', boleto: 'Boleto (exceção)', outro: 'Outro' };
const STATUS: Record<string, { t: string; c: string }> = { em_aberto: { t: 'Em aberto', c: 'off' }, parcial: { t: 'Pago parcialmente', c: 'warn' }, pago: { t: 'Pago', c: 'ok' }, isento: { t: 'Isento', c: '' } };
const moeda = (v: string) => v.replace(/[^\d,.]/g, '');

// Material didático, uniformes e outros itens do aluno: compra, pagamento e entrega por bimestre, tudo na mesma tela.
export default function AlunoItens() {
  const alunoId = Number(useParams().id);
  const { can } = useAuth();
  const grav = can('academico.itens', 2);
  const fin = can('academico.itens.pagamento', 1);
  const liberar = can('academico.itens.liberar', 1);
  const flash = useFlash();
  const conf = useConfirmar();
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [d, setD] = useState<Dados | null>(null);
  const [novo, setNovo] = useState(false);
  const [pagar, setPagar] = useState<Item | null>(null);
  const [lib, setLib] = useState<{ item: Item; bim: number; msg: string } | null>(null);

  const carregar = useCallback(() => api.get<Dados>(`/itens/aluno/${alunoId}?ano=${ano}`).then(setD).catch(flash.erro), [alunoId, ano]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(); }, [carregar]);

  async function entregar(item: Item, bim: number, entregue: boolean, justificativa?: string) {
    try { await api.put(`/itens/${item.id}/entregas/${bim}`, { entregue, justificativa }); setLib(null); void carregar(); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (entregue && liberar && /justificativa/i.test(msg)) setLib({ item, bim, msg }); else flash.erro(e);
    }
  }
  async function entregarTudo(i: Item) {
    try { const r = await api.post<{ entregues: number }>(`/itens/${i.id}/entregar-liberadas`); flash.ok(`${r.entregues} entrega(s) marcada(s).`); void carregar(); } catch (e) { flash.erro(e); }
  }
  async function estornar(p: Pag) {
    if (!(await conf.pedir({ titulo: 'Estornar pagamento', texto: <>Estornar o pagamento de <b>{brl(p.valor)}</b>? O pagamento é removido, o saldo do item volta a ficar em aberto e o estorno fica registrado no histórico do item.</>, confirmar: 'Estornar', perigo: true }))) return;
    try { await api.del(`/itens/pagamentos/${p.id}`); flash.ok('Pagamento estornado.'); void carregar(); } catch (e) { flash.erro(e); }
  }
  async function cancelar(i: Item) {
    if (!(await conf.pedir({ titulo: 'Cancelar item', texto: <>Cancelar <b>{i.descricao}</b>? Ele sai da lista do aluno. Só é possível cancelar se não houver pagamentos nem entregas lançados.</>, confirmar: 'Cancelar item', cancelar: 'Voltar', perigo: true }))) return;
    try { await api.del(`/itens/${i.id}`); flash.ok('Item cancelado.'); void carregar(); } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title"><div>
        <Crumbs items={[{ label: 'Secretaria', to: '/secretaria' }, { label: 'Alunos', to: '/academico/alunos' }, { label: d?.aluno.nome || 'Aluno', to: `/academico/alunos/${alunoId}/matriculas` }, { label: 'Material e uniformes' }]} />
        <h1>Material e uniformes</h1>
        {d && <div className="muted">{d.aluno.nome}{d.matricula?.serie ? ` · ${d.matricula.serie}${d.matricula.turno ? ` · ${d.matricula.turno}` : ''}` : ' · sem matrícula neste ano'}</div>}
      </div></div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      {conf.dialog}
      <div className="toolbar">
        {grav && <button className="btn btn-green" onClick={() => setNovo(true)}>+ Item</button>}
        <label className="switch">Ano letivo <input className="input" style={{ width: 90, marginLeft: 6 }} type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} /></label>
      </div>
      {d && (
        <>
          <div className="itens-resumo">
            <div><small>Total</small><b>{brl(d.resumo.total)}</b></div>
            <div><small>Pago</small><b>{brl(d.resumo.pago)}</b></div>
            <div className={d.resumo.saldo > 0 ? 'devedor' : ''}><small>Saldo</small><b>{brl(d.resumo.saldo)}</b></div>
          </div>
          {d.itens.length === 0 && <div className="empty">Nenhum item em {d.ano}. Use “+ Item” para registrar o material didático ou um uniforme.</div>}
          {d.itens.map((i) => {
            const st = STATUS[i.status];
            return (
              <section key={i.id} className="item-card">
                <header>
                  <div><h3>{i.descricao}{i.tamanho ? ` · ${i.tamanho}` : ''}{i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}</h3><small className="muted">{TIPO_ITEM[i.tipo]}{i.por_bimestre && i.bimestre_inicio > 1 ? ` · a partir do ${i.bimestre_inicio}º bimestre` : ''}</small></div>
                  <span className={`badge ${st.c}`}>{st.t}</span>
                </header>
                <div className="item-valores"><span>Valor <b>{brl(i.valor_total)}</b></span><span>Pago <b>{brl(i.pago)}</b></span><span>Saldo <b>{brl(i.saldo)}</b></span></div>

                <div className="etapas">
                  {i.etapas.map((e) => {
                    const rot = i.por_bimestre ? `${e.bimestre}º bimestre` : 'Entrega';
                    const falta = Math.max(0, e.esperado - i.pago);
                    return (
                      <label key={e.bimestre} className={`etapa${e.entregue ? ' ok' : ''}${!e.aplica ? ' na' : ''}`}>
                        <input type="checkbox" checked={e.entregue} disabled={!grav || !e.aplica} onChange={(ev) => void entregar(i, e.bimestre, ev.target.checked)} />
                        <span><b>{rot}</b>
                          <small>{!e.aplica ? 'Não se aplica' : e.entregue ? `Entregue${e.data_entrega ? ` em ${fmtData(e.data_entrega)}` : ''}${e.justificativa ? ' (liberado)' : ''}` : e.liberada_pelo_pagamento ? 'Pronto para entregar' : `Falta pagar ${brl(falta)}`}</small></span>
                      </label>
                    );
                  })}
                </div>

                {i.pagamentos.length > 0 && (
                  <ul className="pags">{i.pagamentos.map((p) => (
                    <li key={p.id}><span>{fmtData(p.data)} · {FORMAS[p.forma]}{p.forma === 'cartao_credito' && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}</span><b>{brl(p.valor)}</b>{fin && grav && <button className="lk" onClick={() => void estornar(p)}>Estornar</button>}</li>
                  ))}</ul>
                )}
                {grav && i.etapas.filter((e) => e.aplica && !e.entregue && e.liberada_pelo_pagamento).length > 1 && (
                  <div className="item-acoes"><button className="btn btn-green" onClick={() => void entregarTudo(i)}>Entregar tudo que está liberado</button></div>
                )}
                {fin && grav && (
                  <div className="item-acoes">
                    {i.saldo > 0 && <button className="btn" onClick={() => setPagar(i)}>+ Pagamento</button>}
                    <button className="btn" onClick={() => void cancelar(i)}>Cancelar item</button>
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
      {novo && d && <NovoItem d={d} fin={fin} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); flash.ok('Item registrado.'); void carregar(); }} />}
      {pagar && <PagamentoModal item={pagar} onClose={() => setPagar(null)} onSaved={() => { setPagar(null); flash.ok('Pagamento lançado.'); void carregar(); }} />}
      {lib && <JustificativaModal msg={lib.msg} onClose={() => setLib(null)} onOk={(j) => void entregar(lib.item, lib.bim, true, j)} />}
    </>
  );
}

function NovoItem({ d, fin, onClose, onSaved }: { d: Dados; fin: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ catalogo_id: d.catalogo[0] ? String(d.catalogo[0].id) : '', tipo: 'uniforme', descricao: '', tamanho: '', quantidade: '1', valor_total: '', bimestre_inicio: '1', pagar: false, pg_valor: '', pg_forma: 'cartao_credito', pg_parcelas: '1', pg_obs: '' });
  const [erro, setErro] = useState('');
  const cat = d.catalogo.find((c) => String(c.id) === f.catalogo_id);
  const livre = !f.catalogo_id;
  const porBim = cat ? cat.por_bimestre : f.tipo === 'material';
  const valorCalc = cat ? cat.valor * (Number(f.quantidade) || 0) : null;
  async function gravar() {
    setErro('');
    const qtd = Number(f.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) { setErro('Quantidade inválida: informe um número inteiro de 1 a 99.'); return; }
    const corpo: Record<string, unknown> = { ano: d.ano, catalogo_id: f.catalogo_id ? Number(f.catalogo_id) : undefined, tipo: f.tipo, descricao: f.descricao, tamanho: f.tamanho, quantidade: qtd, bimestre_inicio: Number(f.bimestre_inicio) };
    if (livre || (fin && f.valor_total)) corpo.valor_total = f.valor_total;
    if (f.pagar && fin) corpo.pagamento = { valor: f.pg_valor || (valorCalc !== null ? String(valorCalc) : f.valor_total), forma: f.pg_forma, parcelas: Number(f.pg_parcelas) || 1, observacao: f.pg_obs };
    try { await api.post(`/itens/aluno/${d.aluno.id}`, corpo); onSaved(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal title="Novo item" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void gravar()}>Registrar</button></>}>
      <Alert>{erro}</Alert>
      <div className="grid">
        <div className="field span-4"><label htmlFor="n-cat">Item</label>
          <select id="n-cat" className="input" value={f.catalogo_id} onChange={(e) => setF({ ...f, catalogo_id: e.target.value })}>
            {d.catalogo.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.serie ? ` — ${c.serie}` : ''} ({c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</option>)}
            <option value="">Outro (informar manualmente)</option>
          </select></div>
        {livre && <>
          <div className="field span-2"><label htmlFor="n-tipo">Tipo</label><select id="n-tipo" className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPO_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field span-2"><label htmlFor="n-desc">Descrição</label><input id="n-desc" className="input" placeholder="Ex.: Camiseta" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        </>}
        <div className="field"><label htmlFor="n-tam">Tamanho</label><input id="n-tam" className="input" maxLength={20} placeholder="Opcional" value={f.tamanho} onChange={(e) => setF({ ...f, tamanho: e.target.value })} /></div>
        <div className="field"><label htmlFor="n-qtd">Quantidade</label><input id="n-qtd" className="input" inputMode="numeric" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value.replace(/\D/g, '') })} /></div>
        {(livre || fin) && <div className="field span-2"><label htmlFor="n-val">{livre ? 'Valor total (R$)' : 'Alterar valor (R$)'}</label><input id="n-val" className="input" inputMode="decimal" placeholder={valorCalc !== null ? valorCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'} disabled={livre && !fin} value={f.valor_total} onChange={(e) => setF({ ...f, valor_total: moeda(e.target.value) })} />{livre && !fin && <small className="muted">Só o financeiro informa valores.</small>}</div>}
        {porBim && <div className="field span-4"><label htmlFor="n-bim">Começa a receber a partir do</label><select id="n-bim" className="input" value={f.bimestre_inicio} onChange={(e) => setF({ ...f, bimestre_inicio: e.target.value })}>{[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º bimestre{b > 1 ? ' (compra no meio do ano)' : ''}</option>)}</select></div>}
        {fin && <div className="field span-4"><label className="switch"><input type="checkbox" checked={f.pagar} onChange={(e) => setF({ ...f, pagar: e.target.checked })} /> Lançar pagamento agora</label></div>}
        {fin && f.pagar && <>
          <div className="field span-2"><label htmlFor="n-pv">Valor pago (R$)</label><input id="n-pv" className="input" inputMode="decimal" placeholder={valorCalc !== null ? valorCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Total'} value={f.pg_valor} onChange={(e) => setF({ ...f, pg_valor: moeda(e.target.value) })} /></div>
          <div className="field"><label htmlFor="n-pf">Forma</label><select id="n-pf" className="input" value={f.pg_forma} onChange={(e) => setF({ ...f, pg_forma: e.target.value })}>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {f.pg_forma === 'cartao_credito' && <div className="field"><label htmlFor="n-pp">Parcelas</label><input id="n-pp" className="input" inputMode="numeric" value={f.pg_parcelas} onChange={(e) => setF({ ...f, pg_parcelas: e.target.value.replace(/\D/g, '') })} /></div>}
          {f.pg_forma === 'boleto' && <div className="field span-4"><label htmlFor="n-po">Justificativa do boleto</label><input id="n-po" className="input" value={f.pg_obs} onChange={(e) => setF({ ...f, pg_obs: e.target.value })} /></div>}
        </>}
      </div>
    </Modal>
  );
}

function PagamentoModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ valor: String(item.saldo).replace('.', ','), forma: 'cartao_credito', parcelas: '1', data: new Date().toISOString().slice(0, 10), observacao: '' });
  const [erro, setErro] = useState('');
  async function gravar() { setErro(''); try { await api.post(`/itens/${item.id}/pagamentos`, { ...f, parcelas: Number(f.parcelas) || 1 }); onSaved(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } }
  return (
    <Modal title={`Pagamento — ${item.descricao}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void gravar()}>Lançar</button></>}>
      <Alert>{erro}</Alert>
      <p style={{ marginTop: 0 }}>Saldo atual: <b>{brl(item.saldo)}</b></p>
      <div className="grid">
        <div className="field span-2"><label htmlFor="p-v">Valor (R$)</label><input id="p-v" className="input" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: moeda(e.target.value) })} /></div>
        <div className="field span-2"><label htmlFor="p-d">Data</label><input id="p-d" className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
        <div className="field span-2"><label htmlFor="p-f">Forma</label><select id="p-f" className="input" value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value })}>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {f.forma === 'cartao_credito' && <div className="field"><label htmlFor="p-p">Parcelas</label><input id="p-p" className="input" inputMode="numeric" value={f.parcelas} onChange={(e) => setF({ ...f, parcelas: e.target.value.replace(/\D/g, '') })} /></div>}
        <div className="field span-4"><label htmlFor="p-o">{f.forma === 'boleto' ? 'Justificativa do boleto' : 'Observação'}</label><input id="p-o" className="input" value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></div>
      </div>
    </Modal>
  );
}

function JustificativaModal({ msg, onClose, onOk }: { msg: string; onClose: () => void; onOk: (j: string) => void }) {
  const [j, setJ] = useState('');
  return (
    <Modal title="Liberar entrega sem pagamento" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={j.trim().length < 5} onClick={() => onOk(j)}>Liberar entrega</button></>}>
      <Alert kind="info">{msg}</Alert>
      <div className="field"><label htmlFor="j-t">Justificativa (fica registrada)</label><input id="j-t" className="input" value={j} onChange={(e) => setJ(e.target.value)} /></div>
    </Modal>
  );
}
