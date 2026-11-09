import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import './portal.css';

interface Estado {
  colegio: string; aluno: { nome: string }; ano: number; encerramento: string | null; serie: string | null; turno: string | null;
  financeiro: { parcelas: number | null; dia_vencimento: number | null; valor_parcela: number | null; desconto_percentual: number; valor_final: number | null; valor_final_txt: string | null };
  responsavel: ({ rotulo: string; nome: string; cpf: string | null } & Record<string, string>) | null;
  docs: { chave: string; rotulo: string; enviado: boolean; arquivo: string | null; enviado_em: string | null }[];
  assinaturas: { chave: string; titulo: string; status: string | null; link: string | null }[];
  modo_assinatura: string;
  etapas: { dados: boolean; documentos: boolean; assinatura: boolean; assinatura_enviada: boolean; parcela: boolean; efetivada: boolean };
  simulado: boolean;
}

const CAMPOS: { k: string; l: string; w?: string; ac?: string; req?: boolean; mode?: 'numeric' | 'email' | 'tel' }[] = [
  { k: 'email', l: 'E-mail', req: true, ac: 'email', mode: 'email' },
  { k: 'ddd', l: 'DDD', req: true, w: '90px', mode: 'numeric' },
  { k: 'celular', l: 'Celular', req: true, ac: 'tel-national', mode: 'tel' },
  { k: 'telefone', l: 'Telefone (opcional)', mode: 'tel' },
  { k: 'cep', l: 'CEP', ac: 'postal-code', mode: 'numeric' },
  { k: 'rua', l: 'Rua', ac: 'address-line1' },
  { k: 'numero', l: 'Número', w: '110px' },
  { k: 'complemento', l: 'Complemento' },
  { k: 'bairro', l: 'Bairro' },
  { k: 'cidade', l: 'Cidade', ac: 'address-level2' },
  { k: 'uf', l: 'UF', w: '90px' },
];

async function chama<T>(token: string, metodo: string, caminho = '', corpo?: BodyInit, tipo?: string): Promise<T> {
  const res = await fetch(`/api/portal/${encodeURIComponent(token)}${caminho}`, {
    method: metodo, headers: tipo ? { 'Content-Type': tipo } : undefined, body: corpo,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data as T;
}

const dataBr = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '');

export default function Rematricula() {
  const { token = '' } = useParams();
  const [e, setE] = useState<Estado | null>(null);
  const [fatal, setFatal] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const carregar = useCallback(async (atualizar = false) => {
    try {
      const r = await chama<Estado>(token, 'GET', atualizar ? '?atualizar=1' : '');
      setE(r);
      return r;
    } catch (er) { setFatal(er instanceof Error ? er.message : 'Link inválido.'); return null; }
  }, [token]);

  useEffect(() => { void carregar().then((r) => { if (r?.responsavel) setForm(Object.fromEntries(CAMPOS.map((c) => [c.k, r.responsavel![c.k] || '']))); }); }, [carregar]);

  // Enquanto aguarda a assinatura, confere periodicamente.
  useEffect(() => {
    if (!e || !e.etapas.assinatura_enviada || e.etapas.assinatura) return;
    const t = setInterval(() => void carregar(true), 15000);
    return () => clearInterval(t);
  }, [e, carregar]);

  async function acao(fn: () => Promise<Estado>, msg?: string) {
    setOcupado(true); setErro(''); setAviso('');
    try { setE(await fn()); if (msg) setAviso(msg); }
    catch (er) { setErro(er instanceof Error ? er.message : 'Algo deu errado. Tente novamente.'); }
    finally { setOcupado(false); }
  }

  if (fatal) return <main className="pt-wrap"><div className="pt-card pt-fatal"><h1>Link indisponível</h1><p>{fatal}</p><p>Procure a secretaria da escola para receber um novo link.</p></div></main>;
  if (!e) return <main className="pt-wrap"><div className="pt-card">Carregando…</div></main>;

  const { etapas } = e;
  const docsOk = e.docs.filter((d) => d.enviado).length;
  const passoAtual = etapas.efetivada ? 5 : !etapas.dados ? 1 : !etapas.documentos ? 2 : !etapas.assinatura ? 3 : 4;
  const fin = e.financeiro;

  return (
    <main className="pt-wrap">
      <header className="pt-head">
        <div className="pt-brand">{e.colegio}</div>
        <h1>Rematrícula {e.ano}</h1>
        <p>Aluno(a): <b>{e.aluno.nome}</b></p>
      </header>

      <ol className="pt-steps" aria-label="Etapas">
        {['Dados', 'Documentos', 'Assinatura', 'Pagamento'].map((n, i) => {
          const feito = [etapas.dados, etapas.documentos, etapas.assinatura, etapas.parcela][i];
          return <li key={n} className={feito ? 'ok' : passoAtual === i + 1 ? 'on' : ''}><span>{feito ? '✓' : i + 1}</span>{n}</li>;
        })}
      </ol>

      {erro && <div className="pt-alert err" role="alert">{erro}</div>}
      {aviso && <div className="pt-alert ok" role="status">{aviso}</div>}

      {etapas.efetivada && <div className="pt-alert ok"><b>Rematrícula concluída!</b> Obrigado. Em caso de dúvidas, fale com a secretaria.</div>}

      <section className="pt-card">
        <h2>Resumo</h2>
        <dl className="pt-dl">
          <dt>Série</dt><dd>{e.serie || '—'}</dd>
          <dt>Turno</dt><dd>{e.turno || '—'}</dd>
          <dt>Parcelas</dt><dd>{fin.parcelas ? `${fin.parcelas}x de ${fin.valor_final_txt}` : '—'}</dd>
          {fin.desconto_percentual > 0 && <><dt>Desconto</dt><dd>{fin.desconto_percentual}%</dd></>}
          <dt>Vencimento</dt><dd>{fin.dia_vencimento ? `todo dia ${fin.dia_vencimento}` : '—'}</dd>
        </dl>
      </section>

      <section className="pt-card">
        <h2>1. Seus dados {etapas.dados && <span className="pt-tag">confirmados</span>}</h2>
        {e.responsavel ? (
          <form onSubmit={(ev) => { ev.preventDefault(); void acao(async () => { await chama(token, 'PUT', '/dados', JSON.stringify(form), 'application/json'); return carregar() as Promise<Estado>; }, 'Dados confirmados. Obrigado!'); }}>
            <p className="pt-muted">{e.responsavel.rotulo}: <b>{e.responsavel.nome}</b>{e.responsavel.cpf && <> · CPF {e.responsavel.cpf}</>}. Confira e corrija o que for preciso.</p>
            <div className="pt-grid">
              {CAMPOS.map((c) => (
                <label key={c.k} className="pt-f" style={c.w ? { maxWidth: c.w } : undefined}>
                  <span>{c.l}{c.req && ' *'}</span>
                  <input value={form[c.k] || ''} required={c.req} autoComplete={c.ac} inputMode={c.mode} disabled={ocupado || etapas.efetivada}
                    onChange={(ev) => setForm({ ...form, [c.k]: ev.target.value })} />
                </label>
              ))}
            </div>
            <button className="pt-btn" disabled={ocupado || etapas.efetivada}>{etapas.dados ? 'Atualizar dados' : 'Confirmar meus dados'}</button>
          </form>
        ) : <p>Responsável não definido. Procure a secretaria.</p>}
      </section>

      <section className="pt-card">
        <h2>2. Documentos do aluno <span className="pt-tag">{docsOk}/{e.docs.length}</span></h2>
        <p className="pt-muted">Envie uma foto nítida ou PDF de cada documento (até 10 MB).</p>
        {e.docs.map((d) => (
          <div key={d.chave} className="pt-doc">
            <span className={`pt-dot ${d.enviado ? 'ok' : ''}`} aria-hidden="true" />
            <span className="pt-grow">{d.rotulo}{d.enviado && <small>{d.arquivo} · {dataBr(d.enviado_em)}</small>}</span>
            <input ref={(el) => { inputs.current[d.chave] = el; }} type="file" accept="application/pdf,image/*" hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0]; ev.target.value = '';
                if (!f) return;
                if (f.size > 10 * 1024 * 1024) { setErro('Arquivo muito grande (máximo 10 MB).'); return; }
                void acao(async () => { await chama(token, 'POST', `/documentos/${d.chave}?arquivo=${encodeURIComponent(f.name)}`, f, f.type || 'application/octet-stream'); return carregar() as Promise<Estado>; }, `${d.rotulo} enviado.`);
              }} />
            <button className="pt-btn sm" disabled={ocupado || etapas.efetivada} onClick={() => inputs.current[d.chave]?.click()}>{d.enviado ? 'Trocar' : 'Enviar'}</button>
          </div>
        ))}
      </section>

      <section className="pt-card">
        <h2>3. Assinatura {etapas.assinatura && <span className="pt-tag">concluída</span>}</h2>
        {!etapas.assinatura_enviada ? (
          <>
            <p className="pt-muted">Depois de confirmar os dados e enviar os documentos, você assina o contrato e os termos pelo celular ou computador. O link de assinatura também chega ao seu e-mail.</p>
            <button className="pt-btn" disabled={ocupado || !etapas.dados || !etapas.documentos || etapas.efetivada}
              onClick={() => void acao(async () => { await chama(token, 'POST', '/assinar'); return carregar() as Promise<Estado>; }, 'Pronto! Enviamos os documentos para o seu e-mail. Assine pelos botões abaixo.')}>
              Receber documentos para assinar
            </button>
            {(!etapas.dados || !etapas.documentos) && <p className="pt-muted">Conclua as etapas 1 e 2 para liberar.</p>}
          </>
        ) : (
          <>
            {e.assinaturas.map((a) => (
              <div key={a.chave} className="pt-doc">
                <span className={`pt-dot ${a.status === 'assinado' ? 'ok' : ''}`} aria-hidden="true" />
                <span className="pt-grow">{a.titulo}<small>{a.status === 'assinado' ? 'Assinado' : 'Aguardando assinatura'}</small></span>
                {a.link && <a className="pt-btn sm" href={a.link} target="_blank" rel="noreferrer">Assinar</a>}
              </div>
            ))}
            {!etapas.assinatura && <button className="pt-btn ghost" disabled={ocupado} onClick={() => void acao(async () => (await carregar(true)) as Estado, 'Situação atualizada.')}>Já assinei — atualizar</button>}
          </>
        )}
      </section>

      <section className="pt-card">
        <h2>4. Pagamento {etapas.parcela && <span className="pt-tag">confirmado</span>}</h2>
        <p className="pt-muted">{etapas.parcela ? 'A escola confirmou o pagamento da 1ª parcela.' : 'Pague a 1ª parcela conforme combinado com a escola. A secretaria confirma o pagamento e conclui a rematrícula.'}</p>
      </section>

      <footer className="pt-foot">Dúvidas? Fale com a secretaria de {e.colegio}.</footer>
    </main>
  );
}
