import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api';
import Icon, { type IconName } from '../../components/Icon';
import { Alert, Crumbs, useFlash } from '../../components/ui';
import { baixar, brl } from '../../lib/matriculas';
import { fmtData } from '../../lib/utils';

interface Linha { disciplina: string; pm: number | null; pb: number | null; sim: number | null; media: number | null; faltas: number }
interface Item { id: number; descricao: string; tamanho: string | null; quantidade: number; valor_total: number; pago: number; saldo: number; status: string; por_bimestre: boolean; etapas: { bimestre: number; aplica: boolean; entregue: boolean; data_entrega: string | null; liberada_pelo_pagamento: boolean; esperado: number }[]; pagamentos: { id: number; data: string; valor: number; forma: string; parcelas: number }[] }
interface DocAss { id: number; matricula_id: number; chave: string; rotulo: string; arquivo: string; versao: string; quando: string | null }
interface Dados {
  aluno: { id: number; nome: string; nascimento: string | null }; ano: number; anos: number[];
  matricula: { statusRotulo: string; status: string; serie: string | null; turno: string | null; turma: string | null } | null;
  permissoes: { notas: boolean; material: boolean };
  matriculas: { ano: number; tipo: string; serie: string | null; turno: string | null; status: string; statusRotulo: string; assinatura: string; docs: DocAss[] }[];
  assinados: DocAss[];
  responsaveis: { nome: string; papel: string; fone: string | null; email: string | null }[];
  documentos: { chave: string; rotulo: string; ok: boolean; arquivo: { id: number; matricula_id: number; nome: string } | null }[];
  notas: { bimestres: { bimestre: number; linhas: Linha[]; mediaGeral: number | null }[]; bimestreAtual: number } | null;
  frequencia: { disciplinas: { disciplina: string; dadas: number; faltas: number }[]; dadas: number; faltas: number; presenca: number | null } | null;
  material: { itens: Item[]; resumo: { total: number; pago: number; saldo: number } } | null;
  pendencias: { tipo: string; texto: string; bloco: string }[];
  tempo: { quando: string; texto: string }[];
}
interface AlunoLinha { id: number; nome_completo: string; matricula?: string }
const FORMAS: Record<string, string> = { cartao_credito: 'Cartão de crédito', pix: 'Pix', dinheiro: 'Dinheiro', boleto: 'Boleto', outro: 'Outro' };
const STATUS: Record<string, { t: string; c: string }> = { em_aberto: { t: 'Em aberto', c: 'bad' }, parcial: { t: 'Pago parcialmente', c: 'warn' }, pago: { t: 'Pago', c: 'ok' }, isento: { t: 'Isento', c: 'mute' } };
const nota = (v: number | null) => (v === null || v === undefined ? '—' : String(v).replace('.', ','));
const idade = (n: string | null) => { if (!n) return ''; const d = new Date(n); const h = new Date(); let a = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a -= 1; return `${a} anos`; };

function Bloco({ id, aberto, onToggle, icone, titulo, chips, pdf, children }: { id: string; aberto: boolean; onToggle: () => void; icone: IconName; titulo: string; chips: ReactNode; pdf?: { rotulo: string; fn: () => void }; children: ReactNode }) {
  return (
    <section className="ar-bloco" id={`bloco-${id}`}>
      <div className="ar-bloco-cab">
        <button type="button" className="ar-toggle" aria-expanded={aberto} onClick={onToggle}>
          <span className="ar-ico"><Icon name={icone} size={20} /></span>
          <span className="ar-tit"><b>{titulo}</b><span className="ar-chips">{chips}</span></span>
          <span className={`ar-chev${aberto ? ' on' : ''}`} aria-hidden="true"><Icon name="chevronDown" size={20} /></span>
        </button>
        {pdf && <button type="button" className="ar-pdf" aria-label={`Exportar ${pdf.rotulo} em PDF`} onClick={pdf.fn}><Icon name="fileDown" size={16} /> PDF</button>}
      </div>
      {aberto && <div className="ar-corpo">{children}</div>}
    </section>
  );
}
const Chip = ({ k = 'mute', children }: { k?: string; children: ReactNode }) => <span className={`ar-chip ${k}`}>{children}</span>;

// Relatório do aluno: vida escolar completa em blocos que abrem e fecham, com PDF ao lado de cada um.
export default function AlunoRelatorio() {
  const [sp, setSp] = useSearchParams();
  const alunoId = Number(sp.get('aluno')) || 0;
  const ano = Number(sp.get('ano')) || new Date().getFullYear();
  const flash = useFlash();
  const [d, setD] = useState<Dados | null>(null);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<AlunoLinha[]>([]);
  const [foco, setFoco] = useState(false);
  const [aberto, setAberto] = useState<Record<string, boolean>>({ notas: true, material: true });
  const [bim, setBim] = useState(0);
  const timer = useRef<number>();

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (busca.trim().length < 2) { setLista([]); return; }
    timer.current = window.setTimeout(() => { api.get(`/alunos${qs({ q: busca.trim(), por_pagina: 8 })}`).then((r) => setLista(r.itens)).catch(flash.erro); }, 300);
    return () => window.clearTimeout(timer.current);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!alunoId) { setD(null); return; }
    api.get<Dados>(`/relatorios/aluno/${alunoId}${qs({ ano })}`).then((r) => { setD(r); setBim(r.notas?.bimestreAtual || 1); }).catch((e) => { flash.erro(e); setD(null); });
  }, [alunoId, ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = (a: AlunoLinha) => { setSp({ aluno: String(a.id), ano: String(ano) }); setBusca(''); setLista([]); setFoco(false); };
  const alt = (k: string) => setAberto((o) => ({ ...o, [k]: !o[k] }));
  const todos = (v: boolean) => setAberto(Object.fromEntries(['matricula', 'notas', 'freq', 'mens', 'material', 'docs', 'resp', 'tempo'].map((k) => [k, v])));
  const pdf = (tipo: string) => window.open(`/api/relatorios/aluno/${alunoId}/pdf${qs({ ano, tipo })}`, '_blank');
  const ver = (bloco: string) => { const k = ({ matricula: 'matricula', material: 'material', documentos: 'docs' } as Record<string, string>)[bloco] || bloco; setAberto((o) => ({ ...o, [k]: true })); setTimeout(() => document.getElementById(`bloco-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };

  const emitir = (tipo: string) => baixar(`/api/relatorios/aluno/${alunoId}/documento${qs({ tipo })}`).catch(flash.erro);
  const b = d?.notas?.bimestres.find((x) => x.bimestre === bim);
  const atual = d?.notas?.bimestres.find((x) => x.bimestre === d.notas?.bimestreAtual);
  const docsPend = d?.documentos.filter((x) => !x.ok).length ?? 0;

  return (
    <>
      <div className="page-title"><div>
        <Crumbs items={[{ label: 'Secretaria', to: '/secretaria' }, { label: 'Relatórios', to: '/academico/relatorios' }, { label: 'Relatório do aluno' }]} />
        <h1>Relatório do aluno</h1>
      </div></div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <p className="muted" style={{ marginTop: 0 }}>Escolha o aluno e veja toda a vida escolar em um só lugar. Abra cada bloco e exporte o PDF ao lado.</p>

      <div className="ar-busca">
        <div className="ar-busca-campo">
          <label htmlFor="ar-q">Aluno</label>
          <input id="ar-q" className="input" type="search" autoComplete="off" placeholder={d ? d.aluno.nome : 'Digite o nome, a matrícula ou o CPF do aluno'} value={busca} onFocus={() => setFoco(true)} onChange={(e) => setBusca(e.target.value)} />
          {foco && lista.length > 0 && (
            <ul className="ar-lista">{lista.map((a) => <li key={a.id}><button type="button" onClick={() => escolher(a)}>{a.nome_completo}{a.matricula ? <small> · {a.matricula}</small> : null}</button></li>)}</ul>
          )}
        </div>
        <div className="ar-busca-ano">
          <label htmlFor="ar-ano">Ano letivo</label>
          <select id="ar-ano" className="input" value={ano} disabled={!alunoId} onChange={(e) => setSp({ aluno: String(alunoId), ano: e.target.value })}>
            {(d?.anos || [ano]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-primary" disabled={!d} onClick={() => pdf('completo')}><Icon name="fileDown" size={16} /> Relatório completo em PDF</button>
      </div>

      {!d && !alunoId && <div className="empty">Busque um aluno acima para ver o relatório.</div>}
      {d && (
        <>
          <div className="ar-card">
            <div className="ar-avatar" aria-hidden="true">{d.aluno.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</div>
            <div className="ar-card-info">
              <h2>{d.aluno.nome}</h2>
              <div className="muted">{d.matricula ? `${d.matricula.serie || 'sem série'}${d.matricula.turma ? ` ${d.matricula.turma}` : ''} · ${d.matricula.turno || 'sem turno'} · Matrícula ${d.matricula.statusRotulo.toLowerCase()}` : `Sem matrícula em ${d.ano}`} · Código {d.aluno.id}{d.aluno.nascimento ? ` · Nascimento ${fmtData(d.aluno.nascimento)} (${idade(d.aluno.nascimento)})` : ''}</div>
              <div className="ar-links"><Link to={`/academico/alunos/${d.aluno.id}/matriculas`}>Matrículas</Link> · <Link to={`/academico/alunos/${d.aluno.id}`}>Cadastro</Link></div>
            </div>
            <div className="ar-kpis">
              {d.frequencia && <div className={`ar-kpi ${d.frequencia.presenca !== null && d.frequencia.presenca < 75 ? 'bad' : 'ok'}`}><small>Presença</small><b>{d.frequencia.presenca === null ? '—' : `${nota(d.frequencia.presenca)}%`}</b></div>}
              {atual && <div className={`ar-kpi ${atual.mediaGeral !== null && atual.mediaGeral < 6 ? 'bad' : 'ok'}`}><small>Média ({atual.bimestre}º bim.)</small><b>{nota(atual.mediaGeral)}</b></div>}
              {d.material && <div className={`ar-kpi ${d.material.resumo.saldo > 0 ? 'warn' : 'ok'}`}><small>Material e uniformes</small><b>{d.material.resumo.saldo > 0 ? `${brl(d.material.resumo.saldo)} em aberto` : 'Em dia'}</b></div>}
              <div className={`ar-kpi ${docsPend ? 'warn' : 'ok'}`}><small>Documentos</small><b>{docsPend ? `${docsPend} pendente(s)` : 'Completos'}</b></div>
            </div>
          </div>

          {d.pendencias.length > 0 && (
            <div className="ar-pend">
              <b>Pendências do aluno ({d.pendencias.length})</b>
              {d.pendencias.map((p, i) => (
                <div key={i}><span className="ar-chip warn">{p.tipo}</span><span className="ar-pend-t">{p.texto}</span><button type="button" className="btn" onClick={() => ver(p.bloco)}>Ver detalhes</button></div>
              ))}
            </div>
          )}

          <div className="ar-tudo"><button type="button" className="lk" onClick={() => todos(true)}>Expandir tudo</button><button type="button" className="lk" onClick={() => todos(false)}>Recolher tudo</button></div>

          <Bloco id="matricula" aberto={!!aberto.matricula} onToggle={() => alt('matricula')} icone="fileDown" titulo="Matrícula e histórico" chips={<>{d.matricula && <Chip k={d.matricula.status === 'ativa' ? 'ok' : 'warn'}>Matrícula {d.ano}: {d.matricula.statusRotulo}</Chip>}</>} pdf={{ rotulo: 'ficha do aluno', fn: () => pdf('matricula') }}>
            <div className="ar-tabela"><table><thead><tr><th>Ano</th><th>Tipo</th><th>Série / turno</th><th>Situação</th><th>Contrato e termos</th></tr></thead><tbody>
              {d.matriculas.map((m) => <tr key={m.ano}><td><b>{m.ano}</b></td><td>{m.tipo}</td><td>{m.serie || '—'}{m.turno ? ` · ${m.turno}` : ''}</td><td><Chip k={m.status === 'ativa' ? 'ok' : 'mute'}>{m.statusRotulo}</Chip></td><td>{m.docs.length ? m.docs.map((x) => <a key={x.id} className="ar-dl" href={`/api/matriculas/${x.matricula_id}/documentos/${x.id}/download`}>{x.chave === 'contrato' ? 'Contrato' : x.chave === 'termo1' ? 'Termo 1' : 'Termo 2'}</a>) : m.assinatura}</td></tr>)}
              {!d.matriculas.length && <tr><td colSpan={5} className="muted">Nenhuma matrícula registrada.</td></tr>}
            </tbody></table></div>
          </Bloco>

          {d.permissoes.notas && (
            <Bloco id="notas" aberto={!!aberto.notas} onToggle={() => alt('notas')} icone="relatorios" titulo="Notas e desempenho" chips={<>{atual ? <Chip k={atual.mediaGeral !== null && atual.mediaGeral < 6 ? 'bad' : 'ok'}>Média geral {nota(atual.mediaGeral)}</Chip> : <Chip>Sem notas lançadas</Chip>}</>} pdf={{ rotulo: 'boletim', fn: () => pdf('boletim') }}>
              {!d.notas ? <p className="muted">O aluno ainda não está enturmado em {d.ano}.</p> : (
                <>
                  <div className="ar-pills">{d.notas.bimestres.map((x) => <button key={x.bimestre} type="button" aria-pressed={bim === x.bimestre} className={bim === x.bimestre ? 'on' : ''} onClick={() => setBim(x.bimestre)}>{x.bimestre}º bimestre</button>)}</div>
                  {b && b.linhas.length ? (
                    <div className="ar-tabela"><table><thead><tr><th>Disciplina</th><th>P.M.</th><th>P.B.</th><th>Simulado</th><th>Média</th><th>Faltas</th></tr></thead><tbody>
                      {b.linhas.map((l) => <tr key={l.disciplina}><td><b>{l.disciplina}</b></td><td>{nota(l.pm)}</td><td>{nota(l.pb)}</td><td>{nota(l.sim)}</td><td><Chip k={l.media !== null && l.media < 6 ? 'bad' : 'ok'}>{nota(l.media)}</Chip></td><td>{l.faltas}</td></tr>)}
                    </tbody></table></div>
                  ) : <p className="muted">Nenhuma nota lançada neste bimestre.</p>}
                  <p className="muted" style={{ fontSize: 13 }}>Média = média simples de P.M., P.B. e Simulado lançados. O boletim em PDF traz todos os bimestres.</p>
                </>
              )}
            </Bloco>
          )}

          {d.permissoes.notas && (
            <Bloco id="freq" aberto={!!aberto.freq} onToggle={() => alt('freq')} icone="diario" titulo="Frequência" chips={d.frequencia ? <><Chip k={d.frequencia.presenca !== null && d.frequencia.presenca < 75 ? 'bad' : 'ok'}>{d.frequencia.presenca === null ? 'Sem aulas' : `${nota(d.frequencia.presenca)}% de presença`}</Chip><Chip>{d.frequencia.faltas} falta(s)</Chip></> : <Chip>Sem turma</Chip>} pdf={{ rotulo: 'frequência', fn: () => pdf('boletim') }}>
              {!d.frequencia ? <p className="muted">O aluno ainda não está enturmado em {d.ano}.</p> : (
                <div className="ar-barras">
                  {d.frequencia.disciplinas.map((f) => <div key={f.disciplina}><span>{f.disciplina}</span><span className="ar-barra"><i style={{ width: `${f.dadas ? Math.min(100, (f.faltas / f.dadas) * 100 * 4) : 0}%` }} /></span><b>{f.faltas} falta(s) em {f.dadas} aula(s)</b></div>)}
                  {!d.frequencia.disciplinas.length && <p className="muted">Nenhuma aula registrada ainda.</p>}
                </div>
              )}
            </Bloco>
          )}

          <Bloco id="mens" aberto={!!aberto.mens} onToggle={() => alt('mens')} icone="info" titulo="Mensalidades" chips={<Chip>Em breve</Chip>}>
            <p className="muted" style={{ margin: 0 }}>As mensalidades são cobradas pela securitizadora. Este quadro será preenchido quando a integração estiver ativa, com as parcelas pagas, vencidas e a vencer.</p>
          </Bloco>

          {d.material && (
            <Bloco id="material" aberto={!!aberto.material} onToggle={() => alt('material')} icone="cadastros" titulo="Material didático e uniformes" chips={<>{d.material.resumo.saldo > 0 ? <Chip k="warn">Saldo {brl(d.material.resumo.saldo)}</Chip> : d.material.itens.length ? <Chip k="ok">Em dia</Chip> : <Chip>Nenhum item</Chip>}</>} pdf={{ rotulo: 'extrato de material', fn: () => pdf('material') }}>
              <div className="ar-tres"><div><small>Valor</small><b>{brl(d.material.resumo.total)}</b></div><div><small>Pago</small><b>{brl(d.material.resumo.pago)}</b></div><div className={d.material.resumo.saldo > 0 ? 'warn' : ''}><small>Saldo</small><b>{brl(d.material.resumo.saldo)}</b></div></div>
              {d.material.itens.map((i) => (
                <div key={i.id} className="ar-item">
                  <div className="ar-item-cab"><b>{i.descricao}{i.tamanho ? ` · ${i.tamanho}` : ''}{i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}</b><Chip k={STATUS[i.status].c}>{STATUS[i.status].t}</Chip><span>{brl(i.pago)} de {brl(i.valor_total)}</span></div>
                  <div className="ar-etapas">{i.etapas.map((e) => <div key={e.bimestre} className={e.entregue ? 'ok' : !e.aplica ? 'na' : e.liberada_pelo_pagamento ? '' : 'warn'}><b>{i.por_bimestre ? `${e.bimestre}º bimestre` : 'Entrega'}</b><small>{!e.aplica ? 'Não se aplica' : e.entregue ? `Entregue${e.data_entrega ? ` em ${fmtData(e.data_entrega)}` : ''}` : e.liberada_pelo_pagamento ? 'Pronto para entregar' : `Falta pagar ${brl(Math.max(0, e.esperado - i.pago))}`}</small></div>)}</div>
                  {i.pagamentos.map((p) => <div key={p.id} className="ar-pag"><span>{fmtData(p.data)} · {FORMAS[p.forma]}{p.forma === 'cartao_credito' && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}</span><b>{brl(p.valor)}</b></div>)}
                </div>
              ))}
              {!d.material.itens.length && <p className="muted">Nenhum item registrado em {d.ano}.</p>}
            </Bloco>
          )}

          <Bloco id="docs" aberto={!!aberto.docs} onToggle={() => alt('docs')} icone="fileDown" titulo="Documentos" chips={<>{docsPend ? <Chip k="warn">{docsPend} pendente(s)</Chip> : <Chip k="ok">Completos</Chip>}</>}>
            <div className="ar-dois">
              <div>
                <div className="ar-sub">Contrato e termos assinados — {d.ano}</div>
                {d.assinados.map((x) => <div key={x.id} className="ar-pag"><span><b>{x.rotulo}</b><small className="muted" style={{ display: 'block' }}>{x.versao}{x.quando ? ` · ${fmtData(x.quando)}` : ''}</small></span><a className="ar-pdf" href={`/api/matriculas/${x.matricula_id}/documentos/${x.id}/download`}><Icon name="fileDown" size={16} /> Baixar</a></div>)}
                {!d.assinados.length && <p className="muted">Nenhum documento assinado em {d.ano} (a assinatura ainda não foi concluída).</p>}
                <div className="ar-sub" style={{ marginTop: 18 }}>Emitir agora</div>
                <div className="ar-pag"><span><b>Atestado de escolaridade</b><small className="muted" style={{ display: 'block' }}>Aluno matriculado e frequente (Word)</small></span><button type="button" className="ar-pdf" disabled={!d.matricula} onClick={() => void emitir('escolaridade')}><Icon name="fileDown" size={16} /> Gerar</button></div>
                <div className="ar-pag"><span><b>Atestado de conclusão</b><small className="muted" style={{ display: 'block' }}>Conclusão da série/etapa (Word)</small></span><button type="button" className="ar-pdf" disabled={!d.matricula} onClick={() => void emitir('conclusao')}><Icon name="fileDown" size={16} /> Gerar</button></div>
                <div className="ar-pag"><span><b>Histórico escolar</b><small className="muted" style={{ display: 'block' }}>Exige o preenchimento das notas de cada ano</small></span><Link className="ar-pdf" to={`/academico/relatorios/documentos?aluno=${d.aluno.id}`}>Preencher</Link></div>
              </div>
              <div><div className="ar-sub">Documentos do aluno</div>{d.documentos.map((x) => <div key={x.chave} className="ar-pag"><span><b>{x.rotulo}</b>{x.arquivo && <small className="muted" style={{ display: 'block' }}>{x.arquivo.nome}</small>}</span>{x.arquivo ? <a className="ar-pdf" href={`/api/matriculas/${x.arquivo.matricula_id}/documentos/${x.arquivo.id}/download`}><Icon name="fileDown" size={16} /> Baixar</a> : <Chip k={x.ok ? 'ok' : 'warn'}>{x.ok ? 'Entregue (sem arquivo)' : 'Pendente'}</Chip>}</div>)}{!d.documentos.length && <p className="muted">Sem matrícula em {d.ano}.</p>}</div>
            </div>
          </Bloco>

          <Bloco id="resp" aberto={!!aberto.resp} onToggle={() => alt('resp')} icone="pessoas" titulo="Responsáveis e contatos" chips={<Chip>{d.responsaveis.length} responsável(is)</Chip>}>
            <div className="ar-resp">{d.responsaveis.map((r, i) => <div key={i}><b>{r.nome}</b><small>{r.papel}</small><div>{r.fone}</div><div>{r.email}</div></div>)}{!d.responsaveis.length && <p className="muted">Nenhum responsável cadastrado.</p>}</div>
          </Bloco>

          <Bloco id="tempo" aberto={!!aberto.tempo} onToggle={() => alt('tempo')} icone="info" titulo="Linha do tempo" chips={<Chip>Últimos registros</Chip>}>
            {d.tempo.map((t, i) => <div key={i} className="ar-pag"><span className="ar-data">{fmtData(t.quando)}</span><span style={{ flex: 1 }}>{t.texto}</span></div>)}
            {!d.tempo.length && <p className="muted">Nenhum registro.</p>}
          </Bloco>
        </>
      )}
    </>
  );
}
