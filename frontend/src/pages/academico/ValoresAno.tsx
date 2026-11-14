import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import Icon from '../../components/Icon';
import { Alert, Crumbs, useFlash } from '../../components/ui';
import { SERIES, TURNOS, brl } from '../../lib/matriculas';
import './matriculas.css';

interface Dados {
  letivo: { ano: number; parcelas: number; dia_vencimento: number; ativo: boolean };
  itens: { id: number; serie: string; turno: string; valor_parcela: number }[];
  anos: number[];
}

// Valor da parcela por série e turno de cada ano letivo (a matrícula puxa daqui).
export default function ValoresAno() {
  const { can } = useAuth();
  const flash = useFlash();
  const podeGravar = can('academico.valores', 2);
  const [ano, setAno] = useState<number | null>(null);
  const [d, setD] = useState<Dados | null>(null);
  const [novo, setNovo] = useState({ serie: '', turno: 'Manhã', valor: '' });
  const [plano, setPlano] = useState({ parcelas: '', dia: '' });
  const [copia, setCopia] = useState({ de: '', reajuste: '0' });

  const carregar = useCallback(async (a: number | null) => {
    try {
      const anoAlvo = a ?? (await api.get<{ ano: number; ativo: boolean }[]>('/matriculas/anos-letivos')).find((x) => x.ativo)?.ano ?? new Date().getFullYear();
      const r = await api.get<Dados>(`/matriculas/precos/${anoAlvo}`);
      setAno(anoAlvo); setD(r); setPlano({ parcelas: String(r.letivo.parcelas), dia: String(r.letivo.dia_vencimento) });
    } catch (e) { flash.erro(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(null); }, [carregar]);

  const rodar = async (fn: () => Promise<Dados | void>, ok?: string) => {
    try { const r = await fn(); if (r) setD(r); if (ok) flash.ok(ok); } catch (e) { flash.erro(e); }
  };

  if (!d || ano === null) return flash.msg ? <Alert kind="error">{flash.msg.text}</Alert> : <div className="empty">Carregando…</div>;
  const outros = d.anos.filter((x) => x !== ano);

  return (
    <>
      <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Valores do ano letivo' }]} />
      <div className="page-title" style={{ marginTop: 10 }}><h1>Valores do ano letivo</h1></div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <div className="seg-group" role="group" aria-label="Ano letivo" style={{ marginBottom: 14 }}>
        <span className="cap" style={{ marginRight: 2 }}>Ano letivo</span>
        {d.anos.map((x) => <button key={x} className={`seg${x === ano ? ' on' : ''}`} aria-pressed={x === ano} onClick={() => void carregar(x)}>{x}</button>)}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="cap" style={{ marginBottom: 8 }}>Plano padrão de {ano}</div>
        <div className="f-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,200px))', alignItems: 'end' }}>
          <div><label className="f-lbl" htmlFor="p-par">Parcelas</label><input id="p-par" className="f-input" inputMode="numeric" value={plano.parcelas} disabled={!podeGravar} onChange={(e) => setPlano({ ...plano, parcelas: e.target.value })} /></div>
          <div><label className="f-lbl" htmlFor="p-dia">Vencimento (dia)</label><input id="p-dia" className="f-input" inputMode="numeric" value={plano.dia} disabled={!podeGravar} onChange={(e) => setPlano({ ...plano, dia: e.target.value })} /></div>
          {podeGravar && <div><button className="btn" onClick={() => void rodar(async () => { await api.put(`/matriculas/anos-letivos/${ano}`, { parcelas: Number(plano.parcelas), dia_vencimento: Number(plano.dia) }); }, 'Plano salvo.')}>Salvar plano</button></div>}
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>Vale para as matrículas iniciadas depois; matrículas já abertas mantêm o que foi gravado.</p>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Série</th><th style={{ width: 140 }}>Turno</th><th style={{ width: 180 }}>Valor da parcela</th><th style={{ width: 60 }} /></tr></thead>
          <tbody>
            {d.itens.length === 0 && <tr><td colSpan={4} className="empty">Nenhum valor cadastrado para {ano}.</td></tr>}
            {d.itens.map((i) => (
              <tr key={i.id}>
                <td><b>{i.serie}</b></td><td>{i.turno}</td>
                <td>
                  <input className="f-input" style={{ height: 30, maxWidth: 130 }} aria-label={`Valor de ${i.serie}, ${i.turno}`} inputMode="decimal" defaultValue={i.valor_parcela.toFixed(2).replace('.', ',')} disabled={!podeGravar}
                    onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 0 && v !== i.valor_parcela) void rodar(() => api.put<Dados>(`/matriculas/precos/${ano}`, { serie: i.serie, turno: i.turno, valor_parcela: v }), 'Valor atualizado.'); }} />
                  <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>{brl(i.valor_parcela)}</span>
                </td>
                <td>{podeGravar && <button className="icon-btn icon-btn-sm" title="Remover" aria-label={`Remover ${i.serie} ${i.turno}`} onClick={() => void rodar(() => api.del<Dados>(`/matriculas/precos/${ano}/${i.id}`), 'Removido.')}><Icon name="trash" size={18} /></button>}</td>
              </tr>
            ))}
            {podeGravar && (
              <tr>
                <td><input className="f-input" style={{ height: 32 }} list="series-val" aria-label="Série" placeholder="Série (ex.: 4º ano)" value={novo.serie} onChange={(e) => setNovo({ ...novo, serie: e.target.value })} /><datalist id="series-val">{SERIES.map((s) => <option key={s} value={s} />)}</datalist></td>
                <td><select className="f-input" style={{ height: 32 }} aria-label="Turno" value={novo.turno} onChange={(e) => setNovo({ ...novo, turno: e.target.value })}>{TURNOS.map((t) => <option key={t}>{t}</option>)}</select></td>
                <td><input className="f-input" style={{ height: 32, maxWidth: 130 }} aria-label="Valor da parcela" inputMode="decimal" placeholder="0,00" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} /></td>
                <td><button className="btn btn-sm btn-green" onClick={() => void rodar(async () => { const r = await api.put<Dados>(`/matriculas/precos/${ano}`, { serie: novo.serie, turno: novo.turno, valor_parcela: novo.valor, novo: true }); setNovo({ ...novo, valor: '' }); return r; }, 'Valor cadastrado.')}>Incluir</button></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {podeGravar && outros.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="cap" style={{ marginBottom: 8 }}>Copiar de outro ano (com reajuste)</div>
          <div className="f-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,200px))', alignItems: 'end' }}>
            <div><label className="f-lbl" htmlFor="cp-de">Copiar de</label><select id="cp-de" className="f-input" value={copia.de} onChange={(e) => setCopia({ ...copia, de: e.target.value })}><option value="">Selecione…</option>{outros.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="f-lbl" htmlFor="cp-rj">Reajuste (%)</label><input id="cp-rj" className="f-input" inputMode="decimal" value={copia.reajuste} onChange={(e) => setCopia({ ...copia, reajuste: e.target.value })} /></div>
            <div><button className="btn" disabled={!copia.de} onClick={() => void rodar(() => api.post<Dados>(`/matriculas/precos/${ano}/copiar`, { de: Number(copia.de), reajuste_percentual: Number(copia.reajuste.replace(',', '.')) }), 'Valores copiados.')}>Copiar</button></div>
          </div>
        </div>
      )}
    </>
  );
}
