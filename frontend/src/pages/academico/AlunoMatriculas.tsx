import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import Icon from '../../components/Icon';
import { Alert, Crumbs, Modal, useFlash } from '../../components/ui';
import { fmtData } from '../../lib/utils';
import { TIPOS, situacao, emAndamento, type MatriculaResumo } from '../../lib/matriculas';
import { InformacoesAluno } from './Alunos';
import './matriculas.css';

interface Historico {
  aluno: { id: number; nome: string; nascimento: string; responsavel: string | null; liberado: boolean };
  matriculas: MatriculaResumo[];
  abertos: { ano: number; abertura: string | null; encerramento: string | null; tipo: string }[];
  anos: { ano: number; abertura: string | null; encerramento: string | null; divulgacao_valores: string | null }[];
}

const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// Histórico de matrículas do aluno: uma linha por ano letivo; o ano com matrícula aberta fica em destaque.
export default function AlunoMatriculas() {
  const { id } = useParams();
  const alunoId = Number(id);
  const nav = useNavigate();
  const { can } = useAuth();
  const flash = useFlash();
  const [h, setH] = useState<Historico | null>(null);
  const [ver, setVer] = useState(false);
  const podeGravar = can('academico.alunos', 2);

  const carregar = useCallback(() => api.get<Historico>(`/matriculas/aluno/${alunoId}`).then(setH).catch(flash.erro), [alunoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void carregar(); }, [carregar]);

  async function iniciar(ano: number) {
    try { const r = await api.post<{ id: number }>(`/matriculas/aluno/${alunoId}`, { ano }); nav(`/academico/matriculas/${r.id}`); } catch (e) { flash.erro(e); }
  }
  const [confirmaNR, setConfirmaNR] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState<MatriculaResumo | null>(null);
  async function excluir(m: MatriculaResumo) {
    setExcluindo(null);
    try { await api.del(`/matriculas/${m.id}`); flash.ok(`Matrícula ${m.ano} excluída.`); void carregar(); } catch (e) { flash.erro(e); }
  }
  async function naoRenovou(ano: number) {
    setConfirmaNR(null);
    try { await api.post(`/matriculas/aluno/${alunoId}`, { ano, status: 'nao_renovou' }); flash.ok('Registrado: não renovou.'); void carregar(); } catch (e) { flash.erro(e); }
  }
  async function reabrir(m: MatriculaResumo) {
    try { await api.post(`/matriculas/${m.id}/reabrir`); nav(`/academico/matriculas/${m.id}`); } catch (e) { flash.erro(e); }
  }

  if (!h) return <>{flash.msg ? <Alert kind="error">{flash.msg.text}</Alert> : <div className="empty">Carregando…</div>}</>;
  const a = h.aluno;
  const aviso = h.anos[0];

  return (
    <>
      <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Cadastro de Alunos', to: '/academico/alunos' }, { label: a.nome }]} />
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <div className="mat-head" style={{ marginTop: 10 }}>
        <div className="mat-avatar" aria-hidden="true">{iniciais(a.nome)}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1>{a.nome}</h1>
          <div className="sub">Código {a.id} · Nascimento {fmtData(a.nascimento)}{a.responsavel ? ` · Responsável financeiro: ${a.responsavel}` : ''}</div>
        </div>
        <button className="btn" onClick={() => setVer(true)}><Icon name="info" size={16} /> Informações</button>
        <button className="btn" onClick={() => nav(`/academico/alunos/${a.id}`)}><Icon name="edit" size={16} /> Abrir cadastro</button>
      </div>

      <h2 className="mat-h2">Matrículas</h2>
      <p className="mat-sub">Uma matrícula por ano letivo. Abra um ano para ver a linha do tempo ou continuar a matrícula.</p>

      <div className="mat-grid">
        <div className="inner">
          <div className="mat-row cab"><span>Ano</span><span>Tipo</span><span>Série / turno</span><span>Situação</span><span>Assinatura</span><span /></div>

          {h.abertos.map((o) => (
            <div key={`a${o.ano}`} className="mat-row link destaque">
              <span className="ano">{o.ano}</span>
              <span>{TIPOS[o.tipo] || 'Rematrícula'}</span>
              <button className="stretch" disabled={!podeGravar} onClick={() => void iniciar(o.ano)}>Matrícula aberta</button>
              <span><span className="chip info">Não iniciada</span></span>
              <span style={{ color: 'var(--muted)' }}>—</span>
              <span className="acao">
                {podeGravar && <button className="lk" style={{ fontWeight: 500, fontSize: 12 }} onClick={() => setConfirmaNR(o.ano)}>Não renovou</button>}
                <button className="lk" style={{ fontWeight: 700 }} disabled={!podeGravar} onClick={() => void iniciar(o.ano)}>Iniciar ›</button>
              </span>
            </div>
          ))}

          {h.matriculas.map((m) => {
            const x = situacao(m);
            const aberta = emAndamento(m.status);
            return (
              <div key={m.id} className={`mat-row link${aberta ? ' destaque' : ''}`}>
                <span className="ano">{m.ano}</span>
                <span>{TIPOS[m.tipo] || m.tipo}</span>
                <button className="stretch" onClick={() => nav(`/academico/matriculas/${m.id}`)}>{m.serie ? `${m.serie}${m.turno ? ` · ${m.turno}` : ''}` : '—'}</button>
                <span><span className={`chip ${x.kind}`}>{x.label}</span></span>
                <span style={{ color: 'var(--muted)' }}>{m.status === 'ativa' ? (m.assinatura_modo === 'manual' ? 'Manual' : 'Autentique') : 'Pendente'}</span>
                <span className="acao">
                  {aberta && podeGravar && <button className="lk" style={{ fontWeight: 500, fontSize: 12, color: 'var(--danger, #b3261e)' }} onClick={() => setExcluindo(m)}>Excluir</button>}
                  {m.status === 'nao_renovou' && podeGravar && <button className="lk" style={{ fontWeight: 500, fontSize: 12 }} onClick={() => void reabrir(m)}>Reabrir</button>}
                  <button className="lk" style={{ fontWeight: 700 }} onClick={() => nav(`/academico/matriculas/${m.id}`)}>{aberta ? (m.passo > 1 ? 'Continuar ›' : 'Iniciar ›') : 'Ver ›'}</button>
                </span>
              </div>
            );
          })}
          {!h.abertos.length && !h.matriculas.length && <div className="empty">Nenhuma matrícula registrada e nenhum ano letivo aberto.</div>}
        </div>
      </div>

      {aviso && (aviso.abertura || aviso.encerramento) && (
        <div className="mat-note">
          <Icon name="info" size={16} />
          <span>
            Matrícula {aviso.ano} aberta{aviso.abertura ? ` de ${fmtData(aviso.abertura)}` : ''}{aviso.encerramento ? ` a ${fmtData(aviso.encerramento)}` : ''}.
            {aviso.divulgacao_valores ? ` Valores e vagas divulgados em ${fmtData(aviso.divulgacao_valores)}.` : ''}
          </span>
        </div>
      )}
      {!a.liberado && <div className="banner-warn" style={{ marginTop: 10 }}><Icon name="info" size={16} /><span>Este aluno está marcado como <b>não liberado para novas matrículas</b> no cadastro. A decisão de matricular é da secretaria.</span></div>}

      {ver && <InformacoesAluno id={a.id} onClose={() => setVer(false)} />}
      {excluindo && (
        <Modal title="Excluir matrícula" onClose={() => setExcluindo(null)}
          footer={<><button className="btn" onClick={() => setExcluindo(null)}>Cancelar</button><button className="btn btn-danger" onClick={() => void excluir(excluindo)}>Excluir matrícula</button></>}>
          <p>Excluir a matrícula de {excluindo.ano}, que ainda não foi concluída? Os dados lançados, os documentos anexados e o link da família serão apagados. Esta ação não pode ser desfeita.</p>
        </Modal>
      )}
      {confirmaNR !== null && (
        <Modal title="Não vai renovar" onClose={() => setConfirmaNR(null)}
          footer={<><button className="btn" onClick={() => setConfirmaNR(null)}>Cancelar</button><button className="btn btn-accent" onClick={() => void naoRenovou(confirmaNR)}>Registrar</button></>}>
          <p>Registrar que a família não vai renovar a matrícula de {confirmaNR}? Você pode reabrir depois.</p>
        </Modal>
      )}
    </>
  );
}
