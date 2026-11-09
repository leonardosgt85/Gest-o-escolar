import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Crumbs } from '../../components/ui';
import { TIPOS, brl, quando, situacao, valorFinal, type Estado } from '../../lib/matriculas';
import './matriculas.css';

// Linha do tempo da matrícula (finalizada ou em curso): eventos, datas e links para os documentos.
export default function MatriculaTimeline({ e, onContinuar }: { e: Estado; onContinuar?: () => void }) {
  const m = e.matricula;
  const x = situacao(m);
  const contratante = e.opcoes.find((o) => o.chave === m.responsavel_chave);
  const vf = valorFinal(m);
  const contrato = [...e.documentos].reverse().find((d) => d.chave === 'contrato' && d.versao.startsWith('assinado')) || [...e.documentos].reverse().find((d) => d.chave === 'contrato');
  const resumo: [string, string][] = [
    ['Matrícula nº', `${m.ano}/${e.aluno.id}`],
    ['Tipo', TIPOS[m.tipo] || m.tipo],
    ['Série · turno', [m.serie, m.turno].filter(Boolean).join(' · ') || '—'],
    ['Contratante', contratante ? `${contratante.nome} (${contratante.rotulo})` : '—'],
    ['Plano', m.parcelas && vf != null ? `${m.parcelas} × ${brl(vf)} · dia ${m.dia_vencimento}${m.desconto_percentual ? ` (desc. ${m.desconto_percentual}%)` : ''}` : '—'],
    ['Assinatura', m.assinatura_modo === 'manual' ? 'Manual (digitalizada)' : e.driver === 'simulado' ? 'Autentique (simulada)' : 'Autentique'],
  ];
  const ult = e.eventos[e.eventos.length - 1];

  return (
    <>
      <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Cadastro de Alunos', to: '/academico/alunos' }, { label: e.aluno.nome, to: `/academico/alunos/${e.aluno.id}/matriculas` }, { label: `Matrícula ${m.ano}` }]} />
      <div className="mat-top" style={{ marginTop: 10 }}>
        <Link className="btn" to={`/academico/alunos/${e.aluno.id}/matriculas`}><Icon name="back" size={14} /> Matrículas</Link>
        <h1>Matrícula {m.ano}</h1>
        <span className={`chip ${x.kind}`}>{x.label}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{e.aluno.nome}</span>
        <div style={{ flex: 1 }} />
        {onContinuar && <button className="btn btn-primary" onClick={onContinuar}>Continuar rematrícula</button>}
      </div>

      <div className="tl-layout">
        <section className="tl-main" aria-label="Linha do tempo">
          <div className="cap">Linha do tempo</div>
          <div className="tl">
            {e.eventos.map((ev) => (
              <div key={ev.id} className={`tl-item${ev.tipo === 'efetivada' || ev.tipo === 'assinatura_concluida' ? ' fim' : ''}`}>
                <div><span className="t">{ev.titulo}</span><span className="d">{quando(ev.ocorrido_em)}{ev.usuario ? ` · ${ev.usuario}` : ''}</span></div>
                {ev.detalhe && <div className="det">{ev.detalhe}</div>}
                {ev.documentos.length > 0 && (
                  <div className="tl-docs">
                    {ev.documentos.map((d) => (
                      <a key={d.id} className="btn btn-sm" href={`/api/matriculas/${m.id}/documentos/${d.id}/download`} download>
                        <Icon name="fileDown" size={14} /> {d.nome}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!e.eventos.length && <div style={{ color: 'var(--muted)' }}>Sem eventos registrados.</div>}
          </div>
        </section>
        <aside className="tl-side">
          <div className="cap">Resumo</div>
          {resumo.map(([k, v]) => <div key={k} className="kv-row"><span>{k}</span><span>{v}</span></div>)}
          {m.efetivada_em && <div className="kv-row"><span>Efetivada em</span><span>{quando(m.efetivada_em)}</span></div>}
          {ult && !m.efetivada_em && <div className="kv-row"><span>Último evento</span><span>{quando(ult.ocorrido_em)}</span></div>}
          {contrato && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: 'var(--muted)' }}>Hash do contrato (SHA-256)</span>
              <code style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{contrato.sha256}</code>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
