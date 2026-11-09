import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import Icon from '../../components/Icon';
import { Alert, Crumbs, Modal, useFlash } from '../../components/ui';
import {
  CANAIS, NOMES_DOC, ORIGENS, SERIES, STATUS_ASSINATURA, TURNOS, baixar, brl, enviarArquivo, enviarPdf, quando, valorFinal, type Estado,
} from '../../lib/matriculas';
import './matriculas.css';

const TITULOS = ['Pré-matrícula', 'Responsável e condições', 'Documentos', 'Assinatura', 'Efetivação'];
const CHAVES = ['contrato', 'termo1', 'termo2'];

function Seg({ itens, valor, onChange, rotulo, desabilitado }: { itens: { chave: string; label: string }[]; valor: string | null; onChange: (v: string) => void; rotulo: string; desabilitado?: boolean }) {
  return (
    <div className="seg-group" role="group" aria-label={rotulo}>
      {itens.map((i) => <button key={i.chave} type="button" className={`seg${valor === i.chave ? ' on' : ''}`} aria-pressed={valor === i.chave} disabled={desabilitado} onClick={() => onChange(i.chave)}>{i.label}</button>)}
    </div>
  );
}
const Check = () => <Icon name="check" size={12} />;

export default function MatriculaFluxo({ e, setE, onConcluir }: { e: Estado; setE: (e: Estado) => void; onConcluir: () => void }) {
  const m = e.matricula;
  const { can } = useAuth();
  const podeGravar = can('academico.alunos', 2);
  const flash = useFlash();
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({ serie: m.serie || '', desconto: String(m.desconto_percentual ?? 0), motivo: m.desconto_motivo || '' });
  const [envio, setEnvio] = useState<{ destino: string; erro: string; ok: string } | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [linkEnvio, setLinkEnvio] = useState<{ destino: string; erro: string; ok: string } | null>(null);
  const arquivos = useRef<Record<string, HTMLInputElement | null>>({});
  const efetivada = m.status === 'ativa';
  const passo = efetivada ? 5 : m.passo;
  const travado = e.checks.enviado && m.assinatura_modo === 'autentique'; // dados contratuais bloqueados depois do envio
  const url = `/matriculas/${m.id}`;
  const resp = e.opcoes.find((o) => o.chave === m.responsavel_chave) || null;
  const vf = valorFinal({ valor_parcela: m.valor_parcela, desconto_percentual: Number(f.desconto) || 0 });
  const series = [...new Set(e.precos.map((p) => p.serie))];
  const prontoLink = !!(m.serie && m.turno && m.responsavel_chave && m.valor_parcela != null);
  const semValor = !!m.serie && !!m.turno && !(Number(m.valor_parcela) > 0);

  async function exec<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setOcupado(true);
    try { const r = await fn(); if (ok) flash.ok(ok); return r; } catch (er) { flash.erro(er); return undefined; } finally { setOcupado(false); }
  }
  const salvar = async (patch: Record<string, unknown>) => { setE(await api.patch<Estado>(url, patch)); };

  // grava no servidor o que foi digitado e ainda não foi salvo
  async function flush() {
    const patch: Record<string, unknown> = {};
    if (f.serie !== (m.serie || '')) patch.serie = f.serie;
    if (f.desconto !== String(m.desconto_percentual ?? 0) && f.desconto !== '') patch.desconto_percentual = Number(String(f.desconto).replace(',', '.'));
    if (f.motivo !== (m.desconto_motivo || '')) patch.desconto_motivo = f.motivo;
    if (Object.keys(patch).length && !travado) await salvar(patch);
  }

  // atualização automática enquanto aguarda a assinatura no Autentique
  useEffect(() => {
    if (passo !== 4 || m.assinatura_modo !== 'autentique' || !e.checks.enviado || e.checks.assinado) return;
    const t = window.setInterval(() => { api.post<Estado>(`${url}/assinatura/atualizar`).then((r) => { setE(r); if (r.checks.assinado) flash.ok('Assinatura concluída! Contrato e termos assinados.'); }).catch(() => {}); }, 15000);
    return () => window.clearInterval(t);
  }, [passo, m.assinatura_modo, e.checks.enviado, e.checks.assinado]); // eslint-disable-line react-hooks/exhaustive-deps

  const irPara = (n: number) => exec(async () => { await flush(); await salvar({ passo: n }); });
  const continuar = () => exec(async () => {
    await flush();
    if (passo === 5) { setE(await api.post<Estado>(`${url}/efetivar`)); flash.ok(`Matrícula ${m.ano} efetivada.`); return; }
    setE(await api.post<Estado>(`${url}/avancar`));
  });

  const historias = [
    `A família confirmou que ${e.aluno.nome.split(' ')[0]} continua no CSM em ${m.ano}? Registre a intenção e reserve a vaga.`,
    `Quem assina em nome da família e em que condições o plano de ${m.ano} será contratado?`,
    'Confira o que a escola precisa receber e veja os documentos que serão assinados.',
    m.assinatura_modo === 'manual' ? 'Gere os documentos, colha a assinatura à mão e anexe a digitalização.' : 'Envie o link: o responsável assina no próprio celular e tudo fica registrado.',
    'Última conferência antes de efetivar: assinatura, documentos e primeira parcela.',
  ];

  /* ---------- passos ---------- */
  const passo1 = (
    <>
      <div className="f-grid">
        <div>
          <label className="f-lbl" htmlFor="serie">Série em {m.ano}</label>
          {series.length > 0 ? (
            <select id="serie" className="f-input" value={f.serie} disabled={travado || !podeGravar} onChange={(ev) => { setF({ ...f, serie: ev.target.value }); void exec(() => salvar({ serie: ev.target.value })); }}>
              <option value="">Selecione…</option>
              {series.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : (
            <input id="serie" className="f-input" list="series" value={f.serie} disabled={travado || !podeGravar} onChange={(ev) => setF({ ...f, serie: ev.target.value })} onBlur={() => void flush().catch(flash.erro)} placeholder="Ex.: 4º ano" />
          )}
          <datalist id="series">{SERIES.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
      </div>
      {series.length === 0 && <div className="banner-warn"><Icon name="info" size={16} /><span>Nenhum valor cadastrado para {m.ano}. Cadastre a série, o turno e o valor em <Link to="/academico/valores">Valores do ano letivo</Link>.</span></div>}
      {semValor && <div className="banner-warn"><Icon name="info" size={16} /><span>Não há valor cadastrado para {m.serie} ({m.turno}) em {m.ano}. <Link to="/academico/valores">Cadastrar em Valores do ano letivo</Link>.</span></div>}
      <div><div className="f-lbl">Turno</div><Seg rotulo="Turno" itens={TURNOS.map((t) => ({ chave: t, label: t }))} valor={m.turno} desabilitado={travado || !podeGravar} onChange={(v) => void exec(() => salvar({ turno: v }))} /></div>
      <div><div className="f-lbl">Como a família confirmou</div><Seg rotulo="Origem da confirmação" itens={ORIGENS.map((t) => ({ chave: t, label: t }))} valor={m.origem} desabilitado={!podeGravar} onChange={(v) => void exec(() => salvar({ origem: v }))} /></div>
      <div className="stack" style={{ maxWidth: 780 }}>
        <div className={`okline${e.aluno.liberado ? '' : ' bad'}`}><Icon name={e.aluno.liberado ? 'check' : 'info'} size={15} />{e.aluno.liberado ? 'Aluno liberado para novas matrículas' : 'Aluno marcado como não liberado para novas matrículas (decisão da secretaria)'}</div>
        {e.letivo.divulgacao_valores && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Valores e vagas divulgados em {e.letivo.divulgacao_valores.split('-').reverse().join('/')} (Lei 9.870/1999: mínimo de 45 dias antes do fim da matrícula).</div>}
      </div>
    </>
  );

  const passo2 = (
    <>
      <div>
        <div className="f-lbl">Quem assina em nome da família</div>
        {e.opcoes.length === 0 && <div className="banner-warn"><Icon name="info" size={16} /><span>O aluno não tem responsável vinculado. Vincule pai, mãe ou responsável no <Link to={`/academico/alunos/${e.aluno.id}`}>cadastro do aluno</Link>.</span></div>}
        <div className="opt-grid">
          {e.opcoes.map((o) => (
            <button key={o.chave} type="button" className={`opt${m.responsavel_chave === o.chave ? ' on' : ''}`} disabled={travado || !podeGravar} onClick={() => void exec(() => salvar({ responsavel_chave: o.chave }))}>
              <span className="radio" aria-hidden="true" />
              <span style={{ flex: 1, minWidth: 0 }}><b>{o.nome}</b><small>{o.rotulo} · {o.cpf ? `CPF ${o.cpf}` : 'sem CPF'} · {o.celular || 'sem celular'} · {o.email || 'sem e-mail'}</small></span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="f-lbl">Condições do plano {m.ano}</div>
        <div className="f-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <div><div className="f-lbl" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Série · turno</div><div className="f-ro">{[m.serie, m.turno].filter(Boolean).join(' · ') || '—'}</div></div>
          <div><div className="f-lbl" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Parcelas × vencimento</div><div className="f-ro">{m.parcelas}× · dia {m.dia_vencimento}</div></div>
          <div><div className="f-lbl" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Valor da parcela (tabela)</div><div className="f-ro">{brl(m.valor_parcela)}</div></div>
          <div>
            <label className="f-lbl" htmlFor="c-desconto" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Desconto deste aluno (%)</label>
            <input id="c-desconto" className="f-input" inputMode="decimal" value={f.desconto} disabled={travado || !podeGravar} onChange={(ev) => setF({ ...f, desconto: ev.target.value })} onBlur={() => void flush().catch(flash.erro)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="f-lbl" htmlFor="c-motivo" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>Motivo do desconto (opcional)</label>
            <input id="c-motivo" className="f-input" placeholder="Ex.: irmãos, bolsa, convênio" maxLength={160} value={f.motivo} disabled={travado || !podeGravar} onChange={(ev) => setF({ ...f, motivo: ev.target.value })} onBlur={() => void flush().catch(flash.erro)} />
          </div>
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          {vf != null && m.parcelas ? <>Parcela com desconto: <b>{brl(vf)}</b> · anuidade: <b>{brl(Math.round(vf * m.parcelas * 100) / 100)}</b>. </> : null}
          O valor vem de <Link to="/academico/valores">Valores do ano letivo</Link> e fica gravado nesta matrícula e no contrato; mudar a tabela depois não altera quem já contratou.
        </p>
      </div>
    </>
  );

  const passo3 = (
    <div className="cols">
      <div>
        <div className="f-lbl">Documentos do aluno {e.exige_upload ? 'enviados' : 'entregues'}</div>
        {e.exige_upload ? (
          <>
            <div className="stack">
              {e.docs_aluno.map((d) => (
                <div key={d.chave} className="row-card" style={{ flexWrap: 'wrap' }}>
                  <span className={`chip ${d.ok ? 'ok' : 'warn'}`}>{d.ok ? 'Recebido' : 'Pendente'}</span>
                  <span className="grow">{d.rotulo}{d.arquivo && <small style={{ display: 'block', color: 'var(--muted)', fontSize: 12 }}>{d.arquivo.nome} · {quando(d.arquivo.enviado_em)}</small>}</span>
                  <input ref={(el) => { arquivos.current[`doc-${d.chave}`] = el; }} type="file" accept="application/pdf,image/*" hidden onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ''; if (file) void exec(async () => setE(await enviarArquivo(`/api${url}/anexos/${d.chave}?arquivo=${encodeURIComponent(file.name)}`, file)), `${d.rotulo} enviado.`); }} />
                  {d.arquivo && <a className="btn btn-sm" href={`/api${url}/documentos/${d.arquivo.id}/download`} target="_blank" rel="noreferrer">Ver</a>}
                  <button className="btn btn-sm" disabled={ocupado || !podeGravar || efetivada} onClick={() => arquivos.current[`doc-${d.chave}`]?.click()}><Icon name="upload" size={14} /> {d.ok ? 'Trocar' : 'Enviar'}</button>
                  {d.ok && !efetivada && <button className="lk" style={{ fontSize: 12 }} disabled={ocupado || !podeGravar} onClick={() => void exec(async () => setE(await api.del<Estado>(`${url}/anexos/${d.chave}`)))}>Remover</button>}
                </div>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>Na rematrícula cada documento só vale com o arquivo anexado (PDF ou foto, até 10 MB). A família pode enviar pelo link abaixo.</p>
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <div className="f-lbl">Link para a família</div>
              {!prontoLink && <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 12.5 }}>Defina série, turno, responsável e valores (passos 1 e 2) para liberar o link.</p>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className={`chip ${e.portal.enviado_em ? 'ok' : 'mute'}`}>{e.portal.enviado_em ? `Enviado ${quando(e.portal.enviado_em)}` : 'Link não enviado'}</span>
                {e.portal.acesso_em && <span className="chip info">Aberto {quando(e.portal.acesso_em)}</span>}
                {e.portal.dados_confirmados_em && <span className="chip ok">Dados confirmados</span>}
                <span className={`chip ${e.checks.docs_entregues === e.checks.docs_total ? 'ok' : 'warn'}`}>Documentos {e.checks.docs_entregues}/{e.checks.docs_total}</span>
              </div>
              {e.portal.enviado_para && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--muted)' }}>Último envio para {e.portal.enviado_para}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-accent" disabled={ocupado || !podeGravar || !prontoLink || efetivada} onClick={() => setLinkEnvio({ destino: e.contatos.emails.find((c) => c.valor === resp?.email)?.valor || e.contatos.emails[0]?.valor || '', erro: '', ok: '' })}><Icon name="send" size={15} /> Enviar link por e-mail</button>
                <button className="btn" disabled={ocupado || !podeGravar || !prontoLink || efetivada} onClick={() => void exec(async () => { const r = await api.get<{ url: string }>(`${url}/portal/link`); await navigator.clipboard?.writeText(r.url); setE(await api.get<Estado>(url)); }, 'Link copiado. Envie à família por WhatsApp ou onde preferir.')}><Icon name="link" size={15} /> Copiar link</button>
                {e.portal.ativo && !efetivada && <button className="btn btn-danger" disabled={ocupado || !podeGravar} onClick={() => void exec(async () => setE(await api.del<Estado>(`${url}/portal`)), 'Link cancelado: o endereço enviado deixou de funcionar.')}>Cancelar link</button>}
              </div>
            </div>
          </>
        ) : (
          <div className="stack">
            {e.docs_aluno.map((d) => (
              <button key={d.chave} type="button" className={`opt${d.ok ? ' on' : ''}`} aria-pressed={d.ok} disabled={!podeGravar} onClick={() => void exec(() => salvar({ docs_entregues: Object.fromEntries(e.docs_aluno.map((x) => [x.chave, x.chave === d.chave ? !x.ok : x.ok])) }))}>
                <span className="box" aria-hidden="true">{d.ok && <Check />}</span><span style={{ flex: 1 }}>{d.rotulo}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="f-lbl">Documentos para assinatura</div>
        <div className="stack">
          {CHAVES.map((c) => <div key={c} className="row-card"><Icon name="fileDown" size={16} /><span className="grow">{NOMES_DOC[c]}</span></div>)}
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>Gerados com os dados desta matrícula e do responsável escolhido.</p>
        <button className="btn" style={{ marginTop: 8 }} disabled={ocupado} onClick={() => void exec(async () => { const r = await baixar(`/api${url}/documentos.zip`); setE(await api.get<Estado>(url)); flash.ok(`Documentos gerados${r.info.responsavel ? ` para ${r.info.responsavel}` : ''}.`); })}>
          <Icon name="fileDown" size={16} /> Baixar para conferir (.zip)
        </button>
      </div>
    </div>
  );



  async function enviarLinkEmail() {
    if (!linkEnvio?.destino) return;
    setOcupado(true); setLinkEnvio({ ...linkEnvio, erro: '' });
    try {
      setE(await api.post<Estado>(`${url}/portal/enviar`, { email: linkEnvio.destino }));
      setLinkEnvio({ ...linkEnvio, erro: '', ok: linkEnvio.destino });
    } catch (er) {
      setLinkEnvio({ ...linkEnvio, erro: er instanceof Error ? er.message : 'Não foi possível enviar o e-mail.', ok: '' });
    } finally { setOcupado(false); }
  }
  const modalLink = linkEnvio && (
    <Modal title={linkEnvio.ok ? 'Link enviado' : 'Enviar link da rematrícula'} onClose={() => !ocupado && setLinkEnvio(null)}
      footer={linkEnvio.ok
        ? <button className="btn btn-primary" onClick={() => setLinkEnvio(null)}>Fechar</button>
        : <><button className="btn" disabled={ocupado} onClick={() => setLinkEnvio(null)}>Cancelar</button><button className="btn btn-accent" disabled={ocupado || !linkEnvio.destino} onClick={() => void enviarLinkEmail()}><Icon name="send" size={15} /> {ocupado ? 'Enviando…' : 'Enviar agora'}</button></>}>
      {linkEnvio.ok ? (
        <div className="alert ok" role="status"><b>E-mail enviado com sucesso!</b><br />O link da rematrícula foi enviado para <b>{linkEnvio.ok}</b>. A família confere os dados, envia os documentos e assina. Você acompanha tudo aqui e na linha do tempo.</div>
      ) : (
        <>
          {linkEnvio.erro && <div className="alert error" role="alert">{linkEnvio.erro}</div>}
          <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13 }}>Escolha o e-mail que vai receber o link (cadastro do aluno e dos responsáveis).</p>
          {e.contatos.emails.length === 0 && <div className="alert info">Nenhum e-mail cadastrado. Cadastre no aluno/responsável ou use “Copiar link”.</div>}
          <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Destino do link">
            {e.contatos.emails.map((c) => (
              <label key={c.valor} className="row-card" style={{ cursor: 'pointer', borderColor: linkEnvio.destino === c.valor ? 'var(--primary)' : undefined }}>
                <input type="radio" name="destino-link" checked={linkEnvio.destino === c.valor} onChange={() => setLinkEnvio({ ...linkEnvio, destino: c.valor })} />
                <span className="grow"><b>{c.valor}</b><br /><small style={{ color: 'var(--muted)' }}>{c.rotulo} · {c.nome}</small></span>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );

  const canalAtual = m.canal || 'email';
  const opcoesEnvio = canalAtual === 'email'
    ? e.contatos.emails.map((c) => ({ valor: c.valor, titulo: c.valor, sub: `${c.rotulo} · ${c.nome}` }))
    : e.contatos.celulares.map((c) => ({ valor: c.e164, titulo: c.valor, sub: `${c.rotulo} · ${c.nome}` }));
  async function confirmarEnvio() {
    if (!envio || !envio.destino) return;
    setOcupado(true); setEnvio({ ...envio, erro: '' });
    try {
      await flush();
      setE(await api.post<Estado>(`${url}/assinatura/enviar`, { canal: canalAtual, destino: envio.destino }));
      const rot = opcoesEnvio.find((o) => o.valor === envio.destino)?.titulo || envio.destino;
      setEnvio({ ...envio, erro: '', ok: rot });
    } catch (er) {
      api.get<Estado>(url).then(setE).catch(() => {}); // se algo já foi criado no provedor, a tela mostra o estado real (e o botão Cancelar)
      setEnvio({ ...envio, erro: er instanceof Error ? er.message : 'Não foi possível enviar. Tente novamente.', ok: '' });
    } finally { setOcupado(false); }
  }
  const modalEnvio = envio && (
    <Modal
      title={envio.ok ? 'Envio concluído' : 'Enviar para assinatura'}
      onClose={() => !ocupado && setEnvio(null)}
      footer={envio.ok
        ? <button className="btn btn-primary" onClick={() => setEnvio(null)}>Fechar</button>
        : <><button className="btn" disabled={ocupado} onClick={() => setEnvio(null)}>Cancelar</button><button className="btn btn-accent" disabled={ocupado || !envio.destino} onClick={() => void confirmarEnvio()}><Icon name="send" size={15} /> {ocupado ? 'Enviando…' : 'Enviar agora'}</button></>}
    >
      {envio.ok ? (
        <div className="alert ok" role="status"><b>Documentos enviados com sucesso!</b><br />O link para assinar o contrato e os termos foi enviado para <b>{envio.ok}</b>. Quando o responsável assinar, a confirmação aparece aqui e na linha do tempo.</div>
      ) : (
        <>
          {envio.erro && <div className="alert error" role="alert">{envio.erro}</div>}
          <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 13 }}>Escolha {canalAtual === 'email' ? 'o e-mail' : 'o celular'} que vai receber o link de assinatura (cadastro do aluno e dos responsáveis).</p>
          {opcoesEnvio.length === 0 && <div className="alert info">Nenhum {canalAtual === 'email' ? 'e-mail' : 'celular com DDD'} cadastrado. Cadastre no aluno/responsável ou escolha outro canal.</div>}
          <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Destino do link">
            {opcoesEnvio.map((o) => (
              <label key={o.valor} className="row-card" style={{ cursor: 'pointer', borderColor: envio.destino === o.valor ? 'var(--primary)' : undefined }}>
                <input type="radio" name="destino" checked={envio.destino === o.valor} onChange={() => setEnvio({ ...envio, destino: o.valor })} />
                <span className="grow"><b>{o.titulo}</b><br /><small style={{ color: 'var(--muted)' }}>{o.sub}</small></span>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );


  const NOMES: Record<string, string> = { contrato: 'Contrato', termo1: 'Termo 1', termo2: 'Termo 2' };
  async function consultarStatus() {
    const r = await exec(async () => { const n = await api.post<Estado>(`${url}/assinatura/atualizar`); setE(n); return n; });
    if (!r) return;
    const vivas = r.assinaturas.filter((a) => a.status !== 'cancelado');
    flash.ok(vivas.length ? vivas.map((a) => `${NOMES[a.chave] || a.chave}: ${STATUS_ASSINATURA[a.status]?.label || a.status}`).join(' · ') : 'Nenhum documento em andamento.');
  }
  async function confirmarCancelamento() {
    setCancelando(false);
    await exec(async () => setE(await api.post<Estado>(`${url}/assinatura/cancelar`)), 'Envio cancelado. Os documentos foram apagados do provedor; você já pode enviar de novo.');
  }
  const modalCancelar = cancelando && (
    <Modal title="Cancelar envio para assinatura" onClose={() => setCancelando(false)}
      footer={<><button className="btn" onClick={() => setCancelando(false)}>Voltar</button><button className="btn btn-danger" onClick={() => void confirmarCancelamento()}><Icon name="trash" size={15} /> Cancelar envio</button></>}>
      <p style={{ margin: 0 }}>Os documentos serão apagados do provedor de assinatura e o link enviado deixa de funcionar. Depois será preciso enviar de novo.</p>
    </Modal>
  );

  const porChave = Object.fromEntries(e.assinaturas.map((a) => [a.chave, a]));
  const assinadosDocs = e.documentos.filter((d) => d.versao === 'assinado_autentique');
  const passo4Auto = (
    <div className="cols">
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="f-lbl">Signatário</div>
          <div className="row-card" style={{ padding: '10px 12px', gap: 12 }}>
            <span className="mat-avatar" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--tint)', color: 'var(--primary)' }} aria-hidden="true">{resp ? resp.nome[0] : '?'}</span>
            <span className="grow"><b>{resp?.nome || 'Defina o responsável no passo 2'}</b><br /><small style={{ color: 'var(--muted)' }}>{resp ? `${resp.email || 'sem e-mail'} · ${resp.celular || 'sem celular'}` : ''}</small></span>
          </div>
        </div>
        <div>
          <div className="f-lbl">Enviar link por</div>
          <Seg rotulo="Canal de envio" itens={CANAIS.map((c) => ({ chave: c.chave, label: c.label }))} valor={m.canal || 'email'} desabilitado={travado || !podeGravar} onChange={(v) => void exec(() => salvar({ canal: v }))} />
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12 }}>O responsável abre o link, confirma a identidade e assina no celular, sem login. {e.driver === 'simulado' ? 'Modo simulado: nada é enviado de verdade.' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!e.checks.enviado && <button className="btn btn-accent" disabled={ocupado || !podeGravar || !resp} onClick={() => setEnvio({ destino: (m.canal || 'email') === 'email' ? (resp?.email || e.contatos.emails[0]?.valor || '') : (e.contatos.celulares[0]?.e164 || ''), erro: '', ok: '' })}><Icon name="send" size={15} /> Enviar para assinatura</button>}
          {e.checks.enviado && <button className="btn" disabled={ocupado} onClick={() => void consultarStatus()}><Icon name="refresh" size={15} /> Consultar status</button>}
          {e.checks.enviado && !e.checks.assinado && <button className="btn btn-danger" disabled={ocupado || !podeGravar} onClick={() => setCancelando(true)}><Icon name="trash" size={15} /> Cancelar envio</button>}
          {e.checks.enviado && !e.checks.assinado && <button className="lk" style={{ fontWeight: 500, fontSize: 12 }} disabled={ocupado} onClick={() => void exec(async () => { await api.post(`${url}/assinatura/reenviar`); }, 'Link reenviado.')}>Reenviar link</button>}
        </div>
        {!e.checks.enviado && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Prefere imprimir e colher a assinatura à mão? <button className="lk" disabled={ocupado || !podeGravar} onClick={() => void exec(() => salvar({ assinatura_modo: 'manual' }))}>Usar assinatura manual</button></p>}
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <div className="f-lbl">Andamento no Autentique</div>
        {CHAVES.map((c) => {
          const a = porChave[c]; const st = a ? STATUS_ASSINATURA[a.status] : null;
          return (
            <div key={c} className="row-card">
              <span className="grow">{NOMES_DOC[c]}{a?.assinado_em ? <small style={{ display: 'block', color: 'var(--muted)' }}>Assinado em {quando(a.assinado_em)}</small> : null}</span>
              {a && a.status !== 'assinado' && a.status !== 'cancelado' && <button className="lk" style={{ fontSize: 12 }} onClick={() => void exec(async () => { const r = await api.get<{ link: string }>(`${url}/assinatura/${a.id}/link`); await navigator.clipboard?.writeText(r.link); }, 'Link copiado.')}>Copiar link</button>}
              <span className={`chip ${st ? st.kind : 'mute'}`}>{st ? st.label : 'Aguardando envio'}</span>
            </div>
          );
        })}
        {e.checks.assinado && (
          <div className="banner-ok"><Icon name="check" size={16} /><span>Os três documentos foram assinados. {assinadosDocs.length > 0 && assinadosDocs.map((d) => <a key={d.id} className="lk" style={{ marginRight: 8 }} href={`/api${url}/documentos/${d.id}/download`} download>{NOMES_DOC[d.chave] || d.chave}</a>)}</span></div>
        )}
        {e.driver === 'simulado' && e.checks.enviado && !e.checks.assinado && (
          <div className="sim-box">
            <div className="cap" style={{ marginBottom: 7 }}>Somente em desenvolvimento · simular retorno do Autentique</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => void exec(async () => setE(await api.post<Estado>(`${url}/assinatura/simular`, { acao: 'visualizou' })))}>Responsável abriu o link</button>
              <button className="btn btn-sm" onClick={() => void exec(async () => setE(await api.post<Estado>(`${url}/assinatura/simular`, { acao: 'assinou' })))}>Responsável assinou</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const Num = ({ n, ok }: { n: number; ok: boolean }) => <span className={`num${ok ? ' ok' : ''}`} aria-hidden="true">{ok ? <Check /> : n}</span>;
  const passo4Manual = (
    <div className="stack" style={{ gap: 14, maxWidth: 780 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Num n={1} ok={e.documentos.some((d) => d.versao === 'gerado')} />
        <div style={{ flex: 1 }}>
          <b>Gerar e imprimir os documentos</b>
          <div style={{ color: 'var(--muted)', fontSize: 12.5, margin: '2px 0 8px' }}>Um único arquivo .zip com o contrato e os dois termos, já preenchidos para o responsável assinar.</div>
          <button className="btn btn-accent" title="Gerar documentos para assinatura manual" disabled={ocupado} onClick={() => void exec(async () => { const r = await baixar(`/api${url}/documentos.zip`); setE(await api.get<Estado>(url)); flash.ok(`Documentos gerados${r.info.responsavel ? ` para assinatura de ${r.info.responsavel}` : ''}.`); })}><Icon name="fileDown" size={15} /> Gerar documentos</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Num n={2} ok={e.checks.manual_anexado} />
        <div style={{ flex: 1 }}>
          <b>Anexar a digitalização assinada (PDF)</b>
          <div className="stack" style={{ marginTop: 8 }}>
            {CHAVES.map((c) => (
              <div key={c} className="row-card">
                <span className="grow">{NOMES_DOC[c]}</span>
                {e.anexos[c] && <span style={{ color: '#0f6a3b', fontSize: 12, fontWeight: 600 }}>{e.anexos[c]!.arquivo}</span>}
                <input ref={(el) => { arquivos.current[c] = el; }} type="file" accept="application/pdf" hidden onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ''; if (file) void exec(async () => setE(await enviarPdf(`/api${url}/assinatura/manual/anexar?chave=${c}&arquivo=${encodeURIComponent(file.name)}`, file))); }} />
                <button className="btn btn-sm" disabled={ocupado || !podeGravar} onClick={() => arquivos.current[c]?.click()}><Icon name="upload" size={14} /> {e.anexos[c] ? 'Trocar' : 'Anexar PDF'}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Num n={3} ok={e.checks.manual_conferido} />
        <div style={{ flex: 1 }}>
          <b>Conferência da secretaria</b>
          <button type="button" className={`opt${e.checks.manual_conferido ? ' on' : ''}`} style={{ marginTop: 8, maxWidth: 420 }} aria-pressed={e.checks.manual_conferido} disabled={!e.checks.manual_anexado || ocupado || !podeGravar} onClick={() => void exec(async () => setE(await api.post<Estado>(`${url}/assinatura/manual/conferir`, { ok: !e.checks.manual_conferido })))}>
            <span className="box" aria-hidden="true">{e.checks.manual_conferido && <Check />}</span><span>Conferi assinaturas e rubricas</span>
          </button>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}><button className="lk" disabled={ocupado} onClick={() => void exec(() => salvar({ assinatura_modo: 'autentique' }))}>Voltar para a assinatura digital (Autentique)</button></p>
    </div>
  );

  const linhas: { t: string; det: string; ok: boolean; acao?: string; fn?: () => void }[] = [
    { t: 'Contrato e termos assinados', det: e.checks.assinado ? (m.assinatura_modo === 'manual' ? 'Assinatura manual conferida pela secretaria' : 'Assinados no Autentique') : 'Falta concluir a assinatura', ok: e.checks.assinado, acao: 'Ir para assinatura', fn: () => void irPara(4) },
    { t: 'Documentos do aluno entregues', det: `${e.checks.docs_entregues} de ${e.checks.docs_total} conferidos`, ok: e.checks.docs_entregues === e.checks.docs_total, acao: 'Conferir', fn: () => void irPara(3) },
    { t: 'Primeira parcela paga', det: e.checks.parcela ? `Confirmada em ${quando(m.parcela1_confirmada_em)}` : 'Confirmação manual (o módulo financeiro ainda não existe)', ok: e.checks.parcela, acao: e.checks.parcela ? 'Desfazer' : 'Confirmar pagamento', fn: () => void exec(async () => setE(await api.post<Estado>(`${url}/parcela`, { confirmada: !e.checks.parcela }))) },
  ];
  const passo5 = (
    <div className="stack" style={{ gap: 8, maxWidth: 780 }}>
      {linhas.map((l) => (
        <div key={l.t} className="check-line">
          <span className={`dot${l.ok ? ' ok' : ''}`} aria-hidden="true">{l.ok && <Check />}</span>
          <span style={{ flex: 1 }}><b style={{ display: 'block' }}>{l.t}</b><small style={{ color: 'var(--muted)' }}>{l.det}</small></span>
          {l.acao && (!l.ok || l.t.startsWith('Primeira')) && <button className="btn btn-sm" disabled={ocupado || !podeGravar} onClick={l.fn}>{l.acao}</button>}
        </div>
      ))}
    </div>
  );
  const sucesso = (
    <div className="success">
      <div className="ic" aria-hidden="true"><Icon name="check" size={22} /></div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Matrícula {m.ano} efetivada.</div>
      <div style={{ color: '#3b4577' }}>{e.aluno.nome} está matriculado(a){m.serie ? ` no ${m.serie}` : ''}. O contrato assinado e os termos ficam guardados na linha do tempo desta matrícula.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={onConcluir}>Ver linha do tempo</button>
        <Link className="btn" to={`/academico/alunos/${e.aluno.id}/matriculas`}>Voltar às matrículas</Link>
      </div>
    </div>
  );

  const corpos: ReactNode[] = [passo1, passo2, passo3, m.assinatura_modo === 'manual' ? passo4Manual : passo4Auto, passo5];
  const dicas = ['', '', e.exige_upload ? 'Os documentos precisam do arquivo anexado (pela família ou pela secretaria) para efetivar.' : 'Os documentos não bloqueiam o avanço, mas a matrícula só é efetivada com todos entregues.', e.checks.assinado ? 'Assinatura concluída.' : 'Aguardando a assinatura para continuar.', e.checks.pode_efetivar ? 'Tudo certo para efetivar.' : 'Resolva as pendências acima para efetivar.'];
  const bloqueia = !podeGravar || ocupado || (passo === 4 && !e.checks.assinado) || (passo === 5 && !e.checks.pode_efetivar);

  return (
    <>
      {modalEnvio}
      {modalLink}
      {modalCancelar}
      <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Cadastro de Alunos', to: '/academico/alunos' }, { label: e.aluno.nome, to: `/academico/alunos/${e.aluno.id}/matriculas` }, { label: `${m.tipo === 'nova' ? 'Matrícula' : 'Rematrícula'} ${m.ano}` }]} />
      <div className="mat-top" style={{ marginTop: 10 }}>
        <Link className="btn" to={`/academico/alunos/${e.aluno.id}/matriculas`}><Icon name="back" size={14} /> Matrículas</Link>
        <h1>{m.tipo === 'nova' ? 'Matrícula' : 'Rematrícula'} {m.ano}</h1>
        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{e.aluno.nome}</span>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={onConcluir}>Linha do tempo</button>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <ol className="stepper" aria-label="Passos da matrícula">
        {TITULOS.map((t, i) => {
          const n = i + 1; const done = efetivada || n < passo; const cur = !efetivada && n === passo;
          return (
            <li key={t}>
              <button type="button" className={`stp${done ? ' done' : ''}${cur ? ' cur' : ''}`} aria-current={cur ? 'step' : undefined} disabled={efetivada || n > m.passo_max || ocupado} onClick={() => void irPara(n)}>
                <span className="bol">{done ? <Check /> : n}</span><span>{t}</span>
              </button>
              {n < 5 && <span className="linha" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <section className="flow-card">
        <div className="flow-head">
          <div className="cap">{efetivada ? 'Concluído' : `Passo ${passo} de 5`}</div>
          <h2>{efetivada ? 'Matrícula efetivada' : TITULOS[passo - 1]}</h2>
          <p>{efetivada ? (m.tipo === 'nova' ? 'A matrícula' : 'A rematrícula') + ' foi concluída com sucesso.' : historias[passo - 1]}</p>
        </div>
        <div className="flow-body">{efetivada ? sucesso : corpos[passo - 1]}</div>
        {!efetivada && (
          <div className="flow-foot">
            <button className="btn" disabled={passo === 1 || ocupado} onClick={() => void irPara(passo - 1)}>Voltar</button>
            <span className="dica">{dicas[passo - 1]}</span>
            <button className="btn btn-primary" disabled={bloqueia} onClick={() => void continuar()}>{passo === 5 ? `Efetivar matrícula ${m.ano}` : 'Continuar'}</button>
          </div>
        )}
      </section>
    </>
  );
}
