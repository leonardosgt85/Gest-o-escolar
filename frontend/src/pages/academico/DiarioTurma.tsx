import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Alert, Crumbs, Tabs, useFlash } from '../../components/ui';

interface Aluno { id: number; nome_completo: string }
interface Info { turma: { id: number; serie: string; nome: string; turno: string; ano: number }; disciplina: { id: number; nome: string }; podeLancar: boolean; alunos: Aluno[] }
interface LinhaResumo { aluno_id: number; nome: string; presenca: Record<string, string>; faltas: number; pm: number | null; pb: number | null; sim: number | null; media: number | null }
interface Resumo { dias: { data: string; aulas: number; conteudo: string | null }[]; linhas: LinhaResumo[]; podeLancar: boolean }

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cuiaba' });
const somaDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const dm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const bimPadrao = () => { const m = new Date().getMonth() + 1; return m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4; }; // ajustável na tela até existir o calendário letivo
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const mediaSimples = (pm: string, pb: string, sim: string) => {
  const v = [pm, pb, sim].map((x) => x.trim().replace(',', '.')).filter((x) => x !== '' && Number.isFinite(Number(x))).map(Number);
  return v.length ? (Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10) : null;
};

export default function DiarioTurma() {
  const { turmaId, did } = useParams();
  const nav = useNavigate();
  const flash = useFlash();
  const base = `/diario/${turmaId}/${did}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [aba, setAba] = useState(0);
  const [bim, setBim] = useState(bimPadrao());
  const [data, setData] = useState(hoje());
  const [aulas, setAulas] = useState(1);
  const [conteudo, setConteudo] = useState('');
  const [faltas, setFaltas] = useState<Set<number>>(new Set());
  const [existe, setExiste] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [notas, setNotas] = useState<Record<number, { pm: string; pb: string; sim: string }>>({});
  const [sujoNotas, setSujoNotas] = useState(false);

  // a chamada só vale dentro do ano letivo da turma e nunca no futuro
  const anoT = info?.turma.ano;
  const minD = anoT ? `${anoT}-01-01` : '';
  const maxD = anoT ? (`${anoT}-12-31` < hoje() ? `${anoT}-12-31` : hoje()) : hoje();
  const naoComecou = !!anoT && minD > hoje();
  useEffect(() => { api.get<Info>(base).then((i) => { setInfo(i); const max = `${i.turma.ano}-12-31` < hoje() ? `${i.turma.ano}-12-31` : hoje(); setData((d) => (d > max ? max : d < `${i.turma.ano}-01-01` ? max : d)); }).catch(flash.erro); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sujo || sujoNotas) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sujo, sujoNotas]);

  const carregarDia = useCallback(async (d: string) => {
    try {
      const r = await api.get<{ registro: { aulas: number; bimestre: number; conteudo: string | null } | null; faltas: number[] }>(`${base}/dia?data=${d}`);
      setExiste(!!r.registro); setAulas(r.registro?.aulas ?? 1); setConteudo(r.registro?.conteudo ?? ''); setFaltas(new Set(r.faltas)); setSujo(false);
      if (r.registro) setBim(r.registro.bimestre);
    } catch (e) { flash.erro(e); }
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (info && !naoComecou && data >= minD && data <= maxD) void carregarDia(data); }, [data, carregarDia, info, naoComecou, minD, maxD]);

  const carregarResumo = useCallback(async () => {
    try {
      const r = await api.get<Resumo>(`${base}/resumo?bimestre=${bim}`);
      setResumo(r);
      setNotas(Object.fromEntries(r.linhas.map((l) => [l.aluno_id, { pm: fmt(l.pm), pb: fmt(l.pb), sim: fmt(l.sim) }])));
      setSujoNotas(false);
    } catch (e) { flash.erro(e); }
  }, [base, bim]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (aba > 0) void carregarResumo(); }, [aba, bim, carregarResumo]);

  const trocarData = (d: string) => {
    if (!d || d > maxD || d < minD) return;
    if (sujo && !window.confirm('Há marcações não salvas nesta chamada. Descartar e mudar de data?')) return;
    setData(d);
  };
  const alternar = (id: number, falta: boolean) => { setFaltas((s) => { const n = new Set(s); if (falta) n.add(id); else n.delete(id); return n; }); setSujo(true); };
  const podeLancar = !!info?.podeLancar;

  async function salvarChamada() {
    setSalvando(true);
    try {
      const r = await api.put<{ faltas: number; presentes: number }>(`${base}/dia`, { data, bimestre: bim, aulas, conteudo, faltas: [...faltas] });
      setExiste(true); setSujo(false);
      flash.ok(`Chamada de ${dm(data)} salva: ${r.presentes} presente(s), ${r.faltas} falta(s).`);
    } catch (e) { flash.erro(e); } finally { setSalvando(false); }
  }
  async function salvarNotas() {
    setSalvando(true);
    try {
      await api.put(`${base}/notas`, { bimestre: bim, notas: Object.entries(notas).map(([id, n]) => ({ aluno_id: Number(id), ...n })) });
      flash.ok('Provas salvas.'); void carregarResumo();
    } catch (e) { flash.erro(e); } finally { setSalvando(false); }
  }

  const alunos = info?.alunos || [];
  const titulo = info ? `${info.turma.serie} ${info.turma.nome} — ${info.disciplina.nome}` : 'Diário';
  const presentes = alunos.length - faltas.size;
  const tabs = useMemo(() => ['Chamada', 'Provas', 'Resumo'], []);

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Pedagógico', to: '/pedagogico' }, { label: 'Diário de Classe', to: '/academico/diario' }, { label: titulo }]} />
          <h1>{titulo}</h1>
          {info && <div className="muted">{info.turma.turno} · {info.turma.ano} · {alunos.length} aluno(s)</div>}
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      {info && alunos.length === 0 && <Alert kind="info">Esta turma ainda não tem alunos. Em Estrutura da escola › Turmas e ano letivo use “Enturmar alunos”.</Alert>}
      {info && !podeLancar && <Alert kind="info">Somente consulta: você não lança nesta disciplina.</Alert>}

      <div className="dia-barra">
        <Tabs tabs={tabs} active={aba} onChange={(i) => { if (sujo && i !== 0 && !window.confirm('Há marcações não salvas na chamada. Sair da aba mesmo assim?')) return; setAba(i); }} />
        <label className="dia-bim">Bimestre
          <select className="input" value={bim} onChange={(e) => setBim(Number(e.target.value))}>{[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º</option>)}</select>
        </label>
      </div>

      {naoComecou && <Alert kind="info">O ano letivo {anoT} ainda não começou: a chamada abre a partir de 01/01/{anoT}. Antes disso só dá para consultar.</Alert>}
      {aba === 0 && info && !naoComecou && (
        <div className="card">
          <div className="dia-data">
            <button className="btn" aria-label="Dia anterior" onClick={() => trocarData(somaDias(data, -1))}>‹</button>
            <input className="input" type="date" aria-label="Data da aula" min={minD} max={maxD} value={data} onChange={(e) => trocarData(e.target.value)} />
            <button className="btn" aria-label="Próximo dia" disabled={data >= maxD} onClick={() => trocarData(somaDias(data, 1))}>›</button>
            {data !== maxD && <button className="btn btn-sm" onClick={() => trocarData(maxD)}>{maxD === hoje() ? 'Hoje' : 'Último dia'}</button>}
            <label className="dia-aulas">Aulas no dia
              <select className="input" disabled={!podeLancar} value={aulas} onChange={(e) => { setAulas(Number(e.target.value)); setSujo(true); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
          </div>
          <p className="muted" style={{ margin: '4px 0 10px' }}>{existe ? 'Chamada já lançada neste dia; você pode corrigir.' : 'Todos começam presentes: toque em F só para quem faltou.'}</p>
          <div className="dia-resumo-chamada"><b>{presentes}</b> presente(s) · <b>{faltas.size}</b> falta(s)</div>
          <ul className="chamada" aria-label="Alunos">
            {alunos.map((a, i) => {
              const f = faltas.has(a.id);
              return (
                <li key={a.id} className={f ? 'falta' : ''}>
                  <span className="n">{i + 1}</span>
                  <span className="nome">{a.nome_completo}</span>
                  <span className="pf" role="group" aria-label={`Presença de ${a.nome_completo}`}>
                    <button type="button" aria-pressed={!f} disabled={!podeLancar} onClick={() => alternar(a.id, false)}>P</button>
                    <button type="button" className="f" aria-pressed={f} disabled={!podeLancar} onClick={() => alternar(a.id, true)}>F</button>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="cont">Conteúdo da aula (opcional)</label>
            <textarea id="cont" className="input" rows={2} maxLength={2000} disabled={!podeLancar} value={conteudo} onChange={(e) => { setConteudo(e.target.value); setSujo(true); }} />
          </div>
        </div>
      )}

      {aba === 1 && resumo && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>Provas do {bim}º bimestre. A média geral é a média simples das provas lançadas.</p>
          <div className="rd-scroll">
            <table className="rd-tab provas">
              <thead><tr><th style={{ textAlign: 'left' }}>Aluno</th><th>P.M.</th><th>P.B.</th><th>Sim.</th><th>M. Geral</th></tr></thead>
              <tbody>
                {resumo.linhas.map((l) => {
                  const n = notas[l.aluno_id] || { pm: '', pb: '', sim: '' };
                  const up = (k: 'pm' | 'pb' | 'sim', v: string) => { setNotas((x) => ({ ...x, [l.aluno_id]: { ...n, [k]: v.replace(/[^\d,.]/g, '') } })); setSujoNotas(true); };
                  return (
                    <tr key={l.aluno_id}>
                      <td style={{ textAlign: 'left' }}>{l.nome}</td>
                      {(['pm', 'pb', 'sim'] as const).map((k) => <td key={k}><input className="input nota" inputMode="decimal" aria-label={`${k.toUpperCase()} de ${l.nome}`} disabled={!podeLancar} value={n[k]} onChange={(e) => up(k, e.target.value)} /></td>)}
                      <td><b>{fmt(mediaSimples(n.pm, n.pb, n.sim))}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === 2 && resumo && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>Diário do {bim}º bimestre, como no modelo de papel. P = presente, F = falta.</p>
          {resumo.dias.length === 0 && <p className="muted">Nenhuma chamada lançada neste bimestre.</p>}
          <div className="rd-scroll">
            <table className="rd-tab resumo">
              <thead><tr><th className="sticky">Aluno</th>{resumo.dias.map((d) => <th key={d.data} title={d.conteudo || ''}>{dm(d.data)}{d.aulas > 1 ? ` (${d.aulas})` : ''}</th>)}<th>Faltas</th><th>P.M.</th><th>P.B.</th><th>Sim.</th><th>M. Geral</th></tr></thead>
              <tbody>
                {resumo.linhas.map((l, i) => (
                  <tr key={l.aluno_id}>
                    <td className="sticky" style={{ textAlign: 'left' }}>{i + 1}. {l.nome}</td>
                    {resumo.dias.map((d) => <td key={d.data} className={l.presenca[d.data] === 'F' ? 'f' : ''}>{l.presenca[d.data] || ''}</td>)}
                    <td><b>{l.faltas}</b></td><td>{fmt(l.pm)}</td><td>{fmt(l.pb)}</td><td>{fmt(l.sim)}</td><td><b>{fmt(l.media)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="footer-bar">
        <button className="btn" onClick={() => nav('/academico/diario')}>Voltar</button>
        <div className="spacer" />
        {aba === 0 && podeLancar && !naoComecou && <button className="btn btn-primary" disabled={salvando || alunos.length === 0} onClick={() => void salvarChamada()}>{salvando ? 'Salvando…' : sujo ? 'Salvar chamada' : existe ? 'Salvar chamada' : 'Confirmar chamada'}</button>}
        {aba === 1 && podeLancar && <button className="btn btn-primary" disabled={salvando || !sujoNotas} onClick={() => void salvarNotas()}>{salvando ? 'Salvando…' : 'Salvar provas'}</button>}
      </div>
    </>
  );
}
