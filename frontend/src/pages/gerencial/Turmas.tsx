import { useEffect, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Alert, Crumbs, DataTable, Modal, useFlash, useConfirmar, useLimpaErro } from '../../components/ui';

type Flash = ReturnType<typeof useFlash>;

interface Turma { id: number; ano: number; serie: string; nome: string; turno: string; ativo: boolean; alunos: number; valor_parcela: number | string | null; limite_alunos: number | null }
const brl = (v: number | string | null) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const TURNOS = ['Manhã', 'Tarde', 'Integral'];
const anoAtual = new Date().getFullYear();

export default function Turmas() {
  const { can } = useAuth();
  const manut = can('gerencial.cadastros', ACESSO.manutencao);
  const [ano, setAno] = useState(String(anoAtual));
  const [lista, setLista] = useState<Turma[]>([]);
  const [sel, setSel] = useState<Turma | null>(null);
  const [modal, setModal] = useState<{ t?: Turma } | null>(null);
  const [entur, setEntur] = useState(false);
  const flash = useFlash();
  const [carregando, setCarregando] = useState(true);
  const conf = useConfirmar();
  const carregar = () => api.get<Turma[]>(`/cadastros/turmas${qs({ ano })}`).then(setLista).catch(flash.erro).finally(() => setCarregando(false));
  useEffect(() => { void carregar(); }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(t: Turma) {
    if (!(await conf.pedir({ titulo: 'Excluir turma', texto: t.alunos > 0 ? <>A turma <b>{t.serie} {t.nome} ({t.turno})</b> tem <b>{t.alunos} aluno(s)</b> e não pode ser excluída. Inative-a em vez de excluir.</> : <>Excluir a turma <b>{t.serie} {t.nome} ({t.turno})</b>? Essa ação não pode ser desfeita.</>, confirmar: 'Excluir', perigo: true }))) return;
    try { await api.del(`/cadastros/turmas/${t.id}`); flash.ok('Turma excluída.'); setSel(null); void carregar(); } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Estrutura da escola', to: '/estrutura' }, { label: 'Turmas e ano letivo' }]} />
          <h1>Turmas e ano letivo</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      {conf.dialog}
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Nova</button>}
        <button className="btn btn-orange" disabled={!sel || !manut} onClick={() => sel && setModal({ t: sel })}>Editar</button>
        {manut && <button className="btn" disabled={!sel} onClick={() => sel && void excluir(sel)}>Excluir</button>}
        {manut && <button className="btn" onClick={() => setEntur(true)}>Enturmar alunos</button>}
        <label className="switch">Ano letivo <input className="input" style={{ width: 90, marginLeft: 6 }} type="number" min={2000} max={2100} value={ano} onChange={(e) => setAno(e.target.value)} /></label>
      </div>
      {lista.filter((t) => t.ativo && t.limite_alunos && t.alunos >= t.limite_alunos).map((t) => (
        <Alert key={t.id} kind="info">Turma {t.serie} {t.nome} ({t.turno}) está cheia ({t.alunos}/{t.limite_alunos}). Crie outra turma da série {t.serie} para novos alunos.</Alert>
      ))}
      {manut && <PlanoAno ano={ano} onCopiado={() => void carregar()} onMsg={flash} />}
      <DataTable
        loading={carregando}
        cartoes
        rows={lista}
        rowKey={(t) => t.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(t) => manut && setModal({ t })}
        empty="Nenhuma turma neste ano. Use “Nova” para cadastrar."
        cols={[
          { header: 'Série', render: (t) => <b>{t.serie}</b> },
          { header: 'Turma', width: 90, render: (t) => t.nome },
          { header: 'Turno', width: 110, render: (t) => t.turno },
          { header: 'Parcela', width: 120, render: (t) => (Number(t.valor_parcela) > 0 ? brl(t.valor_parcela) : <span className="badge warn">Sem valor</span>) },
          { header: 'Alunos', width: 130, render: (t) => (t.limite_alunos ? <>{t.alunos}/{t.limite_alunos} {t.alunos >= t.limite_alunos && <span className="badge warn">Cheia</span>}</> : t.alunos) },
          { header: 'Situação', width: 100, render: (t) => <span className={`badge ${t.ativo ? 'ok' : 'off'}`}>{t.ativo ? 'Ativa' : 'Inativa'}</span> },
        ]}
      />
      {entur && <EnturmarModal ano={ano} onClose={() => { setEntur(false); void carregar(); }} />}
      {modal && <TurmaModal turma={modal.t} anoPadrao={ano} onClose={() => setModal(null)} onSaved={() => { setModal(null); flash.ok('Turma gravada.'); void carregar(); }} />}
    </>
  );
}

function TurmaModal({ turma, anoPadrao, onClose, onSaved }: { turma?: Turma; anoPadrao: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ano: turma?.ano ?? Number(anoPadrao), serie: turma?.serie ?? '', nome: turma?.nome ?? '', turno: turma?.turno ?? 'Manhã', ativo: turma?.ativo ?? true, limite_alunos: turma?.limite_alunos != null ? String(turma.limite_alunos) : '', valor_parcela: turma?.valor_parcela != null ? String(turma.valor_parcela).replace('.', ',') : '' });
  const [series, setSeries] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  useLimpaErro(erro, () => setErro(''), f);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.get<string[]>('/cadastros/series').then(setSeries).catch(() => {}); }, []);
  async function gravar() {
    setErro(''); setSalvando(true);
    try { if (turma) await api.put(`/cadastros/turmas/${turma.id}`, f); else await api.post('/cadastros/turmas', f); onSaved(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }
  return (
    <Modal title={turma ? 'Editar turma' : 'Nova turma'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={salvando} onClick={() => void gravar()}>{salvando ? 'Gravando…' : 'Gravar'}</button></>}>
      <Alert>{erro}</Alert>
      <div className="grid">
        <div className="field"><label htmlFor="t-ano">Ano letivo</label><input id="t-ano" className="input" type="number" value={f.ano} onChange={(e) => setF({ ...f, ano: Number(e.target.value) })} /></div>
        <div className="field span-3"><label htmlFor="t-serie">Série</label>
          <input id="t-serie" className="input" list="t-series" placeholder="Ex.: 8º Ano" value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} />
          <datalist id="t-series">{series.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="field"><label htmlFor="t-nome">Turma</label><input id="t-nome" className="input" maxLength={20} placeholder="A" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div className="field span-2"><label htmlFor="t-turno">Turno</label>
          <select id="t-turno" className="input" value={f.turno} onChange={(e) => setF({ ...f, turno: e.target.value })}>{TURNOS.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="field span-2"><label htmlFor="t-valor">Valor da parcela (R$)</label><input id="t-valor" className="input" inputMode="decimal" placeholder="0,00" value={f.valor_parcela} onChange={(e) => setF({ ...f, valor_parcela: e.target.value.replace(/[^\d,.]/g, '') })} /></div>
        <div className="field span-2"><label htmlFor="t-lim">Limite de alunos</label><input id="t-lim" className="input" inputMode="numeric" placeholder="Sem limite" value={f.limite_alunos} onChange={(e) => setF({ ...f, limite_alunos: e.target.value.replace(/\D/g, '') })} /><small className="muted">Ao lotar, a turma bloqueia novas enturmações e avisa para criar outra da mesma série.</small></div>
        {turma && <div className="field span-4"><label className="switch"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Turma ativa</label></div>}
      </div>
    </Modal>
  );
}

interface SemTurma { matricula_id: number; aluno: string; serie: string | null; turno: string | null; candidatas: { id: number; nome: string; cheia?: boolean }[] }

function EnturmarModal({ ano, onClose }: { ano: string; onClose: () => void }) {
  const [lista, setLista] = useState<SemTurma[] | null>(null);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const carregar = () => api.get<SemTurma[]>(`/cadastros/enturmacao?ano=${ano}`).then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { void carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function automatica() {
    setErro('');
    try { const r = await api.post<{ enturmados: number; restantes: SemTurma[]; avisos: string[] }>('/cadastros/enturmacao/automatica', { ano: Number(ano) }); setMsg(`${r.enturmados} aluno(s) enturmados automaticamente (mesma série e turno).`); setAvisos(r.avisos || []); setLista(r.restantes); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  async function escolher(m: SemTurma, turmaId: string) {
    if (!turmaId) return;
    try { await api.put(`/cadastros/enturmacao/${m.matricula_id}`, { turma_id: Number(turmaId) }); setLista((l) => (l || []).filter((x) => x.matricula_id !== m.matricula_id)); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal wide title={`Enturmar alunos — ${ano}`} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}>
      <Alert>{erro}</Alert>
      {msg && <Alert kind="ok">{msg}</Alert>}
      {avisos.map((a) => <Alert key={a} kind="info">{a}</Alert>)}
      <p style={{ marginTop: 0 }}>Considera os alunos com matrícula efetivada em {ano} que ainda não estão em nenhuma turma. A automática coloca cada um na turma de mesma série e turno; o que sobrar você escolhe abaixo.</p>
      <button className="btn btn-green" onClick={() => void automatica()}>Enturmar automaticamente</button>
      {lista && lista.length === 0 && <p className="muted">Nenhum aluno sem turma.</p>}
      {lista && lista.length > 0 && (
        <ul className="chamada" style={{ marginTop: 12 }}>
          {lista.map((m) => (
            <li key={m.matricula_id}>
              <span className="nome">{m.aluno}<br /><small className="muted">{m.serie || 'sem série'} · {m.turno || 'sem turno'}</small>{m.candidatas.length > 0 && m.candidatas.every((c) => c.cheia) && <small className="err-txt" style={{ display: 'block', color: '#b45309' }}>Todas as turmas de {m.serie} estão cheias. Crie outra turma.</small>}</span>
              <select className="input" style={{ maxWidth: 220 }} aria-label={`Turma de ${m.aluno}`} value="" onChange={(e) => void escolher(m, e.target.value)}>
                <option value="">Escolher turma…</option>
                {m.candidatas.map((c) => <option key={c.id} value={c.id} disabled={c.cheia}>{c.nome}{c.cheia ? ' — CHEIA' : ''}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

interface Letivo { ano: number; ativo: boolean; abertura: string | null; encerramento: string | null; divulgacao_valores: string | null; parcelas: number; dia_vencimento: number }
const dia10 = (v: string | null) => (v ? v.slice(0, 10) : '');

// Ano letivo: matrícula aberta, datas, plano de parcelas e cópia das turmas e valores de outro ano.
function PlanoAno({ ano, onCopiado, onMsg }: { ano: string; onCopiado: () => void; onMsg: Flash }) {
  const { can } = useAuth();
  const podePlano = can('academico.valores', ACESSO.manutencao);
  const [anos, setAnos] = useState<Letivo[] | null>(null);
  const [f, setF] = useState({ ativo: false, abertura: '', encerramento: '', divulgacao: '', parcelas: '', dia: '' });
  const [copia, setCopia] = useState({ de: '', reajuste: '0' });
  const [aberto, setAberto] = useState(false);
  const letivo = anos?.find((a) => String(a.ano) === ano);
  useEffect(() => { if (anos && !letivo) setAberto(true); }, [anos, letivo]);
  const recarregar = () => api.get<Letivo[]>('/matriculas/anos-letivos').then(setAnos).catch(() => setAnos([]));
  useEffect(() => { void recarregar(); }, []);
  useEffect(() => {
    if (letivo) setF({ ativo: letivo.ativo, abertura: dia10(letivo.abertura), encerramento: dia10(letivo.encerramento), divulgacao: dia10(letivo.divulgacao_valores), parcelas: String(letivo.parcelas), dia: String(letivo.dia_vencimento) });
  }, [letivo]);
  async function criar() {
    try { await api.post('/matriculas/anos-letivos', { ano: Number(ano) }); onMsg.ok(`Ano letivo ${ano} criado. Defina as datas e abra a matrícula.`); await recarregar(); } catch (e) { onMsg.erro(e); }
  }
  async function salvar() {
    try {
      await api.put(`/matriculas/anos-letivos/${ano}`, { ativo: f.ativo, abertura: f.abertura || null, encerramento: f.encerramento || null, divulgacao_valores: f.divulgacao || null, parcelas: Number(f.parcelas), dia_vencimento: Number(f.dia) });
      onMsg.ok(`Ano letivo ${ano} salvo.`); await recarregar();
    } catch (e) { onMsg.erro(e); }
  }
  async function copiar() {
    try {
      const r = await api.post<{ criadas: number; existentes: number }>('/cadastros/turmas/copiar-ano', { de: Number(copia.de), para: Number(ano), reajuste_percentual: copia.reajuste });
      onMsg.ok(`${r.criadas} turma(s) copiada(s) de ${copia.de}${r.existentes ? `; ${r.existentes} já existiam` : ''}.`); onCopiado();
    } catch (e) { onMsg.erro(e); }
  }
  const campo = (id: string, rot: string, el: React.ReactNode) => <div className="field"><label htmlFor={id}>{rot}</label>{el}</div>;
  return (
    <details className="card" style={{ marginBottom: 12 }} open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
        Ano letivo {ano} {letivo && <span className={`badge ${letivo.ativo ? 'ok' : 'off'}`} style={{ marginLeft: 8 }}>{letivo.ativo ? 'Matrícula aberta' : 'Matrícula fechada'}</span>}
        {anos && !letivo && <span className="badge warn" style={{ marginLeft: 8 }}>Ano não criado</span>}
      </summary>
      {podePlano && anos && !letivo && (
        <div style={{ marginTop: 10 }}><p className="muted" style={{ margin: '0 0 8px' }}>O ano {ano} ainda não existe como ano letivo; sem ele não dá para abrir matrículas.</p><button className="btn btn-green" onClick={() => void criar()}>Criar ano letivo {ano}</button></div>
      )}
      {podePlano && letivo && (
        <>
          <label className="switch" style={{ margin: '10px 0' }}><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Matrícula aberta (libera iniciar matrículas e enviar rematrícula)</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {campo('al-ab', 'Abertura', <input id="al-ab" className="input" type="date" value={f.abertura} onChange={(e) => setF({ ...f, abertura: e.target.value })} />)}
            {campo('al-en', 'Encerramento', <input id="al-en" className="input" type="date" value={f.encerramento} onChange={(e) => setF({ ...f, encerramento: e.target.value })} />)}
            {campo('al-dv', 'Divulgação dos valores', <input id="al-dv" className="input" type="date" value={f.divulgacao} onChange={(e) => setF({ ...f, divulgacao: e.target.value })} />)}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
            {campo('pl-par', 'Parcelas', <input id="pl-par" className="input" style={{ width: 90 }} inputMode="numeric" value={f.parcelas} onChange={(e) => setF({ ...f, parcelas: e.target.value })} />)}
            {campo('pl-dia', 'Vencimento (dia)', <input id="pl-dia" className="input" style={{ width: 90 }} inputMode="numeric" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />)}
            <button className="btn btn-primary" onClick={() => void salvar()}>Salvar ano letivo</button>
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Parcelas e vencimento valem para as matrículas iniciadas depois. A lei pede divulgar valores e vagas com 45 dias de antecedência.</p>
        </>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {campo('cp-de', 'Copiar turmas de', <input id="cp-de" className="input" style={{ width: 110 }} type="number" placeholder="Ano" value={copia.de} onChange={(e) => setCopia({ ...copia, de: e.target.value })} />)}
        {campo('cp-rj', 'Reajuste do valor (%)', <input id="cp-rj" className="input" style={{ width: 110 }} inputMode="decimal" value={copia.reajuste} onChange={(e) => setCopia({ ...copia, reajuste: e.target.value })} />)}
        <button className="btn" disabled={!copia.de} onClick={() => void copiar()}>Copiar turmas e valores</button>
      </div>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>A cópia não leva alunos nem repete turmas que já existem.</p>
    </details>
  );
}
