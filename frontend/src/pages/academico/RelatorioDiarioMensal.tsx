import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../../api';
import { Alert, Crumbs, useFlash } from '../../components/ui';

interface Linha { turma_id: number; serie: string; nome: string; turno: string; disciplina_id: number; disciplina: string }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Diário de classe mensal em PDF (A4 paisagem): chamada do mês + notas do bimestre + conteúdo ministrado.
export default function RelatorioDiarioMensal() {
  const hoje = new Date();
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [mes, setMes] = useState(String(hoje.getMonth() + 1));
  const [lista, setLista] = useState<Linha[]>([]);
  const [turma, setTurma] = useState('');
  const [disc, setDisc] = useState('');
  const [gerando, setGerando] = useState(false);
  const flash = useFlash();
  useEffect(() => { setTurma(''); setDisc(''); api.get<Linha[]>(`/diario/minhas${qs({ ano })}`).then(setLista).catch(flash.erro); }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const turmas = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of lista) if (!m.has(l.turma_id)) m.set(l.turma_id, `${l.serie} ${l.nome} — ${l.turno}`);
    return [...m.entries()];
  }, [lista]);
  const discs = useMemo(() => lista.filter((l) => String(l.turma_id) === turma), [lista, turma]);

  async function gerar() {
    setGerando(true);
    try {
      const res = await fetch(`/api/relatorios/diario-mensal${qs({ turma_id: turma, disciplina_id: disc, ano, mes })}`, { credentials: 'include' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Não foi possível gerar o PDF.'); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { flash.erro(e); } finally { setGerando(false); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Relatórios', to: '/academico/relatorios' }, { label: 'Diário de classe mensal' }]} />
          <h1>Diário de classe mensal</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field"><label htmlFor="rd-ano">Ano</label><input id="rd-ano" className="input" style={{ width: 90 }} type="number" value={ano} onChange={(e) => setAno(e.target.value)} /></div>
          <div className="field"><label htmlFor="rd-mes">Mês</label>
            <select id="rd-mes" className="input" value={mes} onChange={(e) => setMes(e.target.value)}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div className="field"><label htmlFor="rd-turma">Turma</label>
            <select id="rd-turma" className="input" value={turma} onChange={(e) => { setTurma(e.target.value); setDisc(''); }}><option value="">Selecione…</option>{turmas.map(([id, t]) => <option key={id} value={id}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="rd-disc">Disciplina</label>
            <select id="rd-disc" className="input" disabled={!turma} value={disc} onChange={(e) => setDisc(e.target.value)}><option value="">Selecione…</option>{discs.map((d) => <option key={d.disciplina_id} value={d.disciplina_id}>{d.disciplina}</option>)}</select></div>
          <button className="btn btn-primary" disabled={!turma || !disc || gerando} onClick={() => void gerar()}>{gerando ? 'Gerando…' : 'Gerar PDF'}</button>
        </div>
        <p className="muted" style={{ margin: '10px 0 0' }}>Folha A4 paisagem: dias do mês com presença (•) e faltas (F), faltas do mês, P.M., P.B., Simulado e M. Geral do bimestre, e uma página com o conteúdo ministrado de cada aula.</p>
      </div>
    </>
  );
}
