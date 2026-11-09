import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { Alert, Modal } from './ui';
import { TURNOS, quando } from '../lib/matriculas';

interface Linha { aluno_id: number; nome: string; situacao: 'apto' | 'fora'; motivo?: string; responsavel?: string; email?: string; serie?: string | null; turno?: string | null; tem_matricula?: boolean; ja_enviado?: string | null }
interface Previa { ano: number; email_configurado: boolean; series: string[]; precos: { serie: string; turno: string }[]; linhas: Linha[] }
interface Res { aluno_id: number; ok: boolean; erro?: string; email?: string }
type Sel = { marcado: boolean; serie: string; turno: string };

const LOTE = 10;

export default function EnvioRematriculas({ onClose, alunoId, nomeAluno }: { onClose: () => void; alunoId?: number; nomeAluno?: string }) {
  const [p, setP] = useState<Previa | null>(null);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState<Record<number, Sel>>({});
  const [fase, setFase] = useState<'lista' | 'confirmar' | 'enviando' | 'fim'>('lista');
  const [feitos, setFeitos] = useState(0);
  const [res, setRes] = useState<Res[]>([]);
  const [verFora, setVerFora] = useState(false);

  useEffect(() => {
    api.get<Previa>(`/matriculas/rematricula-massa/previa${alunoId ? `?aluno_id=${alunoId}` : ''}`).then((r) => {
      setP(r);
      const ok = (s: string | null | undefined, t: string | null | undefined) => !!s && !!t && r.precos.some((x) => x.serie.toLowerCase() === s.toLowerCase() && x.turno === t);
      setSel(Object.fromEntries(r.linhas.filter((l) => l.situacao === 'apto').map((l) => [l.aluno_id, { marcado: ok(l.serie, l.turno) && (!l.ja_enviado || !!alunoId), serie: l.serie || '', turno: l.turno || '' }])));
    }).catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  const aptos = useMemo(() => p?.linhas.filter((l) => l.situacao === 'apto') ?? [], [p]);
  const fora = useMemo(() => p?.linhas.filter((l) => l.situacao === 'fora') ?? [], [p]);
  const tem = (s: string, t: string) => !!p?.precos.some((x) => x.serie.toLowerCase() === s.toLowerCase() && x.turno === t);
  const turnosDe = (s: string) => TURNOS.filter((t) => tem(s, t));
  const escolhidos = aptos.filter((l) => sel[l.aluno_id]?.marcado && tem(sel[l.aluno_id].serie, sel[l.aluno_id].turno));
  const nomeDe = (id: number) => p?.linhas.find((l) => l.aluno_id === id)?.nome || `#${id}`;

  function set(id: number, parte: Partial<Sel>) {
    setSel((s) => {
      const novo = { ...s[id], ...parte };
      if ('serie' in parte && !tem(novo.serie, novo.turno)) novo.turno = turnosDe(novo.serie)[0] || '';
      novo.marcado = parte.marcado ?? (novo.marcado && tem(novo.serie, novo.turno));
      return { ...s, [id]: novo };
    });
  }

  async function enviar() {
    setFase('enviando'); setFeitos(0); setRes([]);
    const itens = escolhidos.map((l) => ({ aluno_id: l.aluno_id, serie: sel[l.aluno_id].serie, turno: sel[l.aluno_id].turno }));
    for (let i = 0; i < itens.length; i += LOTE) {
      const lote = itens.slice(i, i + LOTE);
      try {
        const r = await api.post<Res[]>('/matriculas/rematricula-massa/enviar', { ano: p!.ano, itens: lote });
        setRes((x) => [...x, ...r]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setRes((x) => [...x, ...lote.map((it) => ({ aluno_id: it.aluno_id, ok: false, erro: msg }))]);
      }
      setFeitos(Math.min(i + LOTE, itens.length));
    }
    setFase('fim');
  }

  const enviados = res.filter((r) => r.ok).length;
  const falhas = res.filter((r) => !r.ok);
  const rodape = fase === 'lista'
    ? <><button className="btn" onClick={onClose}>Fechar</button><button className="btn btn-accent" disabled={!escolhidos.length || !p?.email_configurado} onClick={() => setFase('confirmar')}><Icon name="send" size={15} /> Revisar envio ({escolhidos.length})</button></>
    : fase === 'confirmar'
      ? <><button className="btn" onClick={() => setFase('lista')}>Voltar</button><button className="btn btn-accent" onClick={() => void enviar()}><Icon name="send" size={15} /> Enviar {escolhidos.length} e-mail{escolhidos.length === 1 ? '' : 's'} agora</button></>
      : fase === 'fim' ? <button className="btn btn-primary" onClick={onClose}>Fechar</button> : null;

  return (
    <Modal wide title={alunoId ? `Link de rematrícula${p ? ` ${p.ano}` : ''} — ${nomeAluno || 'aluno'}` : p ? `Links de rematrícula ${p.ano}` : 'Links de rematrícula'} onClose={() => fase !== 'enviando' && onClose()} footer={rodape}>
      {erro && <Alert kind="error">{erro}</Alert>}
      {!p && !erro && <p>Carregando alunos…</p>}
      {p && fase === 'lista' && (
        <>
          <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13 }}>Cada responsável financeiro recebe um e-mail com o link para conferir os dados, enviar os documentos e assinar. Confira a série e o turno de {p.ano} de cada aluno.</p>
          {!p.email_configurado && <Alert kind="error">O envio de e-mail ainda não foi configurado. Vá em Gerencial → E-mail.</Alert>}
          {p.series.length === 0 && <Alert kind="info">Nenhum valor cadastrado para {p.ano}. Cadastre em “Valores do ano letivo” para liberar o envio.</Alert>}
          {aptos.length === 0 ? <div className="empty">Nenhum aluno elegível.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="Marcar todos" checked={escolhidos.length > 0 && escolhidos.length === aptos.filter((l) => tem(sel[l.aluno_id].serie, sel[l.aluno_id].turno)).length}
                  onChange={(e) => setSel((s) => Object.fromEntries(Object.entries(s).map(([id, v]) => [id, { ...v, marcado: e.target.checked && tem(v.serie, v.turno) }])))} /></th><th>Aluno</th><th>Responsável / e-mail</th><th>Série</th><th>Turno</th><th /></tr></thead>
                <tbody>
                  {aptos.map((l) => {
                    const s = sel[l.aluno_id]; const pronto = !!s && tem(s.serie, s.turno);
                    return (
                      <tr key={l.aluno_id}>
                        <td><input type="checkbox" aria-label={`Enviar para ${l.nome}`} checked={!!s?.marcado} disabled={!pronto} onChange={(e) => set(l.aluno_id, { marcado: e.target.checked })} /></td>
                        <td>{l.nome}</td>
                        <td>{l.responsavel}<br /><small style={{ color: 'var(--muted)' }}>{l.email}</small></td>
                        <td><select className="f-input" style={{ height: 32 }} aria-label="Série" value={s?.serie || ''} onChange={(e) => set(l.aluno_id, { serie: e.target.value })}><option value="">—</option>{p.series.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                        <td><select className="f-input" style={{ height: 32 }} aria-label="Turno" value={s?.turno || ''} onChange={(e) => set(l.aluno_id, { turno: e.target.value })}><option value="">—</option>{(s?.serie ? turnosDe(s.serie) : []).map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                        <td>{l.ja_enviado ? <span className="chip info">Enviado {quando(l.ja_enviado)}</span> : !pronto ? <span className="chip warn">Defina série/turno</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {fora.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button className="lk" onClick={() => setVerFora(!verFora)}>{verFora ? 'Ocultar' : 'Ver'} {fora.length} aluno{fora.length === 1 ? '' : 's'} fora do envio</button>
              {verFora && <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>{fora.map((l) => <li key={l.aluno_id}><b>{l.nome}</b> — {l.motivo}</li>)}</ul>}
            </div>
          )}
        </>
      )}
      {p && fase === 'confirmar' && (
        <div className="alert info" role="alert">
          Você vai enviar <b>{escolhidos.length}</b> e-mail{escolhidos.length === 1 ? '' : 's'} com o link de rematrícula {p.ano} aos responsáveis. Para quem ainda não tem matrícula {p.ano}, ela será criada agora. Os e-mails saem de imediato e não podem ser desfeitos (cada link pode ser cancelado depois, na matrícula).
          {escolhidos.some((l) => l.ja_enviado) && <><br /><b>{escolhidos.filter((l) => l.ja_enviado).length}</b> já receberam antes e receberão de novo.</>}
        </div>
      )}
      {p && fase === 'enviando' && (
        <div role="status">
          <p>Enviando… {feitos} de {escolhidos.length}</p>
          <div style={{ height: 8, background: 'var(--tint)', borderRadius: 6 }}><div style={{ height: 8, width: `${(feitos / Math.max(1, escolhidos.length)) * 100}%`, background: 'var(--primary)', borderRadius: 6, transition: 'width .2s' }} /></div>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Não feche esta janela até terminar.</p>
        </div>
      )}
      {p && fase === 'fim' && (
        <>
          <div className={`alert ${falhas.length ? 'info' : 'ok'}`} role="status"><b>{enviados}</b> e-mail{enviados === 1 ? '' : 's'} enviado{enviados === 1 ? '' : 's'}{falhas.length > 0 && <>, <b>{falhas.length}</b> com falha</>}.</div>
          {falhas.length > 0 && <ul style={{ fontSize: 13 }}>{falhas.map((f) => <li key={f.aluno_id}><b>{nomeDe(f.aluno_id)}</b> — {f.erro}</li>)}</ul>}
        </>
      )}
    </Modal>
  );
}
