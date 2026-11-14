import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../../api';
import { useSearchParams } from 'react-router-dom';
import { Alert, Crumbs, useFlash } from '../../components/ui';
import Icon from '../../components/Icon';

type Tipo = 'conclusao' | 'escolaridade' | 'historico';
type D = Record<string, any>;
interface AlunoLinha { id: number; nome_completo: string; matricula: string | null; data_nascimento: string | null }
interface Sug { aluno: { id: number; nome: string; matricula: string }; matricula: { ano: number; serie: string; turno: string; status: string } | null; conclusao: D; escolaridade: D; historico: D; disciplinas: string[]; avisos?: { conclusao?: string } }

const DOCS: { chave: Tipo; titulo: string; texto: string; formato: string }[] = [
  { chave: 'escolaridade', titulo: 'Atestado de Escolaridade', texto: 'Declara que o aluno está matriculado e frequenta as aulas.', formato: 'Word (.docx)' },
  { chave: 'conclusao', titulo: 'Atestado de Conclusão', texto: 'Declara que o aluno concluiu a série/etapa no ano letivo.', formato: 'Word (.docx)' },
  { chave: 'historico', titulo: 'Histórico Escolar', texto: 'Ensino Fundamental, com notas e carga horária de cada ano.', formato: 'PDF' },
];
const PASSOS = ['Aluno', 'Documento', 'Dados', 'Pronto'];
const ANOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const vazioAnos = () => ANOS.map(() => ({ nota: '', ch: '' }));

function Campo({ rot, children, largo }: { rot: string; children: React.ReactNode; largo?: boolean }) {
  return <label className="rd-campo" style={largo ? { gridColumn: '1 / -1' } : undefined}><span className="f-lbl">{rot}</span>{children}</label>;
}

export default function RelatorioDocumentos() {
  const flash = useFlash();
  const [passo, setPasso] = useState(1);
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<AlunoLinha[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [sug, setSug] = useState<Sug | null>(null);
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [d, setD] = useState<D>({});
  const [ocupado, setOcupado] = useState(false);
  const [gerado, setGerado] = useState<string | null>(null);
  const timer = useRef<number>();
  const [sp] = useSearchParams();

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (busca.trim().length < 2) { setLista([]); setBuscou(false); return; }
    timer.current = window.setTimeout(() => {
      api.get(`/alunos${qs({ q: busca.trim(), por_pagina: 8 })}`).then((r) => { setLista(r.itens); setBuscou(true); }).catch(flash.erro);
    }, 300);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  async function escolherAluno(a: AlunoLinha) {
    try {
      setSug(await api.get<Sug>(`/relatorios/documentos/aluno/${a.id}`));
      setTipo(null); setGerado(null); setPasso(2);
    } catch (e) { flash.erro(e); }
  }

  // Vindo do Relatório do aluno (?aluno=ID): já abre com o aluno escolhido.
  useEffect(() => { const id = Number(sp.get('aluno')); if (id) void escolherAluno({ id } as AlunoLinha); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function escolherTipo(t: Tipo) {
    if (!sug) return;
    setTipo(t); setGerado(null);
    if (t === 'historico') {
      setD({
        ...sug.historico,
        disciplinas: sug.disciplinas.map((nome) => ({ nome, anos: vazioAnos() })),
        ch_total: ANOS.map(() => ''),
        resultado: ANOS.map(() => ''),
        trajetoria: ANOS.map(() => ({ ano: '', estabelecimento: '', cidade: '', situacao: '' })),
      });
    } else setD({ ...sug[t] });
    setPasso(3);
  }

  const set = (k: string, v: any) => setD((x) => ({ ...x, [k]: v }));
  const setArr = (k: string, i: number, v: any) => setD((x) => ({ ...x, [k]: x[k].map((o: any, j: number) => (j === i ? v : o)) }));

  async function gerar() {
    if (!tipo) return;
    setOcupado(true);
    try {
      const res = await fetch('/api/relatorios/documentos/gerar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, dados: d }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'documento';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setGerado(nome); setPasso(4);
    } catch (e) { flash.erro(e); } finally { setOcupado(false); }
  }

  const doc = DOCS.find((x) => x.chave === tipo);
  const txt = (k: string, largo?: boolean, rot?: string, tipoInput = 'text') => (
    <Campo rot={rot || k} largo={largo}><input className="input" type={tipoInput} value={d[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></Campo>
  );

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Secretaria', to: '/secretaria' }, { label: 'Documentos do aluno' }]} />
          <h1>Documentos do aluno</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <ol className="rd-passos" aria-label="Etapas">
        {PASSOS.map((p, i) => (
          <li key={p} className={passo === i + 1 ? 'on' : passo > i + 1 ? 'ok' : ''} aria-current={passo === i + 1 ? 'step' : undefined}>
            <span>{passo > i + 1 ? <Icon name="check" size={12} /> : i + 1}</span>{p}
          </li>
        ))}
      </ol>

      {passo === 1 && (
        <div className="card">
          <h2 className="rd-h">Para qual aluno?</h2>
          <input className="input" autoFocus placeholder="Digite o nome, a matrícula ou o CPF do aluno" aria-label="Buscar aluno" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="rd-lista" role="list">
            {lista.map((a) => (
              <button key={a.id} type="button" role="listitem" className="rd-item" onClick={() => void escolherAluno(a)}>
                <b>{a.nome_completo}</b>
                <small>{a.matricula ? `Matrícula ${a.matricula}` : 'Sem nº de matrícula'}</small>
              </button>
            ))}
            {buscou && lista.length === 0 && <p className="muted">Nenhum aluno encontrado.</p>}
          </div>
        </div>
      )}

      {passo >= 2 && sug && (
        <div className="rd-aluno">
          <div><small>Aluno</small><b>{sug.aluno.nome}</b>{sug.matricula && <span> · {sug.matricula.serie || 'sem série'} · {sug.matricula.ano}</span>}</div>
          <button className="btn btn-sm" onClick={() => { setPasso(1); setSug(null); setTipo(null); }}>Trocar aluno</button>
        </div>
      )}

      {passo === 2 && sug && (
        <div className="card">
          <h2 className="rd-h">Qual documento?</h2>
          <div className="rd-docs">
            {DOCS.map((x) => (
              <button key={x.chave} type="button" className="rd-doc" onClick={() => escolherTipo(x.chave)}>
                <Icon name="fileDown" size={22} />
                <b>{x.titulo}</b>
                <span>{x.texto}</span>
                <small>{x.formato}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {passo === 3 && tipo && sug && (
        <div className="card">
          <h2 className="rd-h">{doc?.titulo}</h2>
          <p className="muted" style={{ marginTop: 0 }}>Os dados vieram do cadastro. Confira e corrija o que precisar: só este documento muda, o cadastro não.</p>

          {tipo === 'conclusao' && sug.avisos?.conclusao && <Alert kind="info">{sug.avisos.conclusao}</Alert>}

          {tipo === 'escolaridade' && (
            <div className="rd-grid">
              {txt('nome', true, 'Nome do aluno')}
              {txt('matricula_num', false, 'Matrícula nº')}
              {txt('serie', false, 'Série / ano (ex.: 8º ANO)')}
              {txt('etapa', false, 'Etapa (ex.: ENSINO FUNDAMENTAL II)')}
              {txt('ano_letivo', false, 'Ano letivo')}
              {txt('turno', false, 'Período (MATUTINO, VESPERTINO…)')}
              {txt('responsavel', true, 'Representante legal')}
              {txt('data', false, 'Data do documento', 'date')}
            </div>
          )}

          {tipo === 'conclusao' && (
            <div className="rd-grid">
              {txt('nome', true, 'Nome do aluno')}
              {txt('naturalidade', false, 'Naturalidade (ex.: Cuiabá/MT)')}
              {txt('nascimento', false, 'Data de nascimento', 'date')}
              {txt('pai', false, 'Pai')}
              {txt('mae', false, 'Mãe')}
              {txt('serie_concluida', false, 'Série concluída (ex.: 3ª série do Ensino Médio)')}
              {txt('ano_letivo', false, 'Ano letivo')}
              {txt('data', false, 'Data do documento', 'date')}
            </div>
          )}

          {tipo === 'historico' && (
            <>
              <div className="rd-grid">
                {txt('nome', true, 'Nome do aluno')}
                {txt('nascimento', false, 'Data de nascimento', 'date')}
                {txt('naturalidade', false, 'Naturalidade')}
                {txt('nacionalidade', false, 'Nacionalidade')}
                {txt('pai', false, 'Pai')}
                {txt('mae', false, 'Mãe')}
              </div>

              <h3 className="rd-h2">Notas e carga horária</h3>
              <p className="muted" style={{ margin: '0 0 8px' }}>Digite por enquanto; depois isso virá do módulo de notas. Deixe em branco o que não se aplica.</p>
              <div className="rd-scroll">
                <table className="rd-tab">
                  <thead>
                    <tr><th rowSpan={2}>Disciplina</th>{ANOS.map((a) => <th key={a} colSpan={2}>{a}º ANO</th>)}<th rowSpan={2} aria-label="Remover" /></tr>
                    <tr>{ANOS.map((a) => <><th key={`n${a}`}>Nota</th><th key={`c${a}`}>CH</th></>)}</tr>
                  </thead>
                  <tbody>
                    {d.disciplinas.map((r: any, i: number) => (
                      <tr key={i}>
                        <td><input className="input rd-nome" aria-label="Disciplina" value={r.nome} onChange={(e) => setArr('disciplinas', i, { ...r, nome: e.target.value })} /></td>
                        {r.anos.map((c: any, a: number) => (
                          <>
                            <td key={`n${a}`}><input className="input rd-cel" aria-label={`${r.nome} ${a + 1}º ano nota`} value={c.nota} onChange={(e) => setArr('disciplinas', i, { ...r, anos: r.anos.map((o: any, j: number) => (j === a ? { ...o, nota: e.target.value } : o)) })} /></td>
                            <td key={`c${a}`}><input className="input rd-cel" aria-label={`${r.nome} ${a + 1}º ano carga horária`} value={c.ch} onChange={(e) => setArr('disciplinas', i, { ...r, anos: r.anos.map((o: any, j: number) => (j === a ? { ...o, ch: e.target.value } : o)) })} /></td>
                          </>
                        ))}
                        <td><button type="button" className="btn btn-sm" aria-label={`Remover ${r.nome}`} onClick={() => set('disciplinas', d.disciplinas.filter((_: any, j: number) => j !== i))}>×</button></td>
                      </tr>
                    ))}
                    <tr className="rd-tot">
                      <td>Carga horária total</td>
                      {ANOS.map((a, i) => <td key={a} colSpan={2}><input className="input rd-cel" aria-label={`Carga horária total ${a}º ano`} value={d.ch_total[i]} onChange={(e) => setArr('ch_total', i, e.target.value)} /></td>)}
                      <td />
                    </tr>
                    <tr className="rd-tot">
                      <td>Resultado final</td>
                      {ANOS.map((a, i) => <td key={a} colSpan={2}><input className="input rd-cel" placeholder="APROVADO" aria-label={`Resultado final ${a}º ano`} value={d.resultado[i]} onChange={(e) => setArr('resultado', i, e.target.value)} /></td>)}
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => set('disciplinas', [...d.disciplinas, { nome: '', anos: vazioAnos() }])}>+ Disciplina</button>

              <h3 className="rd-h2">Onde estudou cada ano</h3>
              <div className="rd-scroll">
                <table className="rd-tab">
                  <thead><tr><th>Série</th><th>Ano</th><th>Estabelecimento de ensino</th><th>Cidade</th><th>Situação</th></tr></thead>
                  <tbody>
                    {ANOS.map((a, i) => {
                      const t = d.trajetoria[i];
                      const up = (k: string, v: string) => setArr('trajetoria', i, { ...t, [k]: v });
                      return (
                        <tr key={a}>
                          <td>{a}º ANO</td>
                          <td><input className="input" style={{ width: 70 }} aria-label={`Ano letivo do ${a}º ano`} value={t.ano} onChange={(e) => up('ano', e.target.value)} /></td>
                          <td><input className="input" aria-label={`Estabelecimento do ${a}º ano`} value={t.estabelecimento} onChange={(e) => up('estabelecimento', e.target.value)} /></td>
                          <td><input className="input" aria-label={`Cidade do ${a}º ano`} value={t.cidade} onChange={(e) => up('cidade', e.target.value)} /></td>
                          <td><input className="input" style={{ width: 120 }} aria-label={`Situação do ${a}º ano`} value={t.situacao} onChange={(e) => up('situacao', e.target.value)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rd-grid" style={{ marginTop: 14 }}>
                {txt('obs', true, 'Observação (OBS)')}
                {txt('data', false, 'Data do documento', 'date')}
                {txt('secretario', false, 'Secretário escolar')}
                {txt('diretora', false, 'Diretor(a)')}
              </div>
            </>
          )}

          <div className="rd-acoes">
            <button className="btn" onClick={() => setPasso(2)}>Voltar</button>
            <button className="btn btn-primary" disabled={ocupado} onClick={() => void gerar()}><Icon name="fileDown" size={15} /> {ocupado ? 'Gerando…' : `Gerar ${doc?.formato.includes('PDF') ? 'PDF' : 'documento'}`}</button>
          </div>
        </div>
      )}

      {passo === 4 && (
        <div className="card rd-pronto">
          <div className="banner-ok"><Icon name="check" size={16} /><span><b>{doc?.titulo}</b> gerado: {gerado}</span></div>
          <p className="muted">O arquivo foi baixado no seu computador.</p>
          <div className="rd-acoes">
            <button className="btn" onClick={() => setPasso(3)}>Ajustar e gerar de novo</button>
            <button className="btn" onClick={() => { setTipo(null); setPasso(2); }}>Outro documento deste aluno</button>
            <button className="btn btn-primary" onClick={() => { setSug(null); setTipo(null); setBusca(''); setLista([]); setPasso(1); }}>Outro aluno</button>
          </div>
        </div>
      )}
    </>
  );
}
