import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import { PessoaPickerModal } from '../../components/PessoaModals';
import GerarDocumentos from '../../components/GerarDocumentos';
import { Crumbs, Alert, DataTable, Modal, Pagination, useFlash } from '../../components/ui';
import EnvioRematriculas from '../../components/EnvioRematriculas';
import Icon from '../../components/Icon';
import { fmtData, fmtDataHora, idade } from '../../lib/utils';
import { situacao } from '../../lib/matriculas';
import './matriculas.css';

export interface AlunoLinha {
  id: number; matricula: string | null; cpf: string | null; nome_completo: string; data_nascimento: string;
  ddd: string | null; telefone: string | null; celular: string | null; email: string | null;
  mat_id: number | null; mat_status: string | null; mat_passo: number | null;
}
interface Resumo { matriculado: number; andamento: number; nao_renovou: number; sem: number }
const SITUACOES: { chave: string; label: string; campo?: keyof Resumo }[] = [
  { chave: '', label: 'Todos' }, { chave: 'matriculado', label: 'Matriculados', campo: 'matriculado' }, { chave: 'andamento', label: 'Em rematrícula', campo: 'andamento' },
  { chave: 'nao_renovou', label: 'Não renovou', campo: 'nao_renovou' }, { chave: 'sem', label: 'Sem matrícula', campo: 'sem' },
];
const FILTROS_VAZIOS = { codigo: '', cpf: '', nome: '', matricula: '', cadastro_de: '', cadastro_ate: '', responsavel_id: '', responsavel_nome: '' };

export default function Alunos() {
  const { can } = useAuth();
  const nav = useNavigate();
  // filtros ficam guardados na sessão: ao abrir um aluno e voltar, a lista continua como estava
  const salvo = (() => { try { return JSON.parse(sessionStorage.getItem('csm.alunos.filtros') || 'null'); } catch { return null; } })();
  const [filtros, setFiltros] = useState<typeof FILTROS_VAZIOS>({ ...FILTROS_VAZIOS, ...(salvo?.filtros || {}) });
  const [rapido, setRapido] = useState<string>(salvo?.rapido || '');
  const [porPagina, setPorPagina] = useState<number>(salvo?.porPagina || 10);
  const [res, setRes] = useState<{ itens: AlunoLinha[]; total: number; pagina: number; ano_matricula: number | null; resumo_matricula: Resumo | null }>({ itens: [], total: 0, pagina: 1, ano_matricula: null, resumo_matricula: null });
  const [sit, setSit] = useState<string>(salvo?.sit || '');
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [pickResp, setPickResp] = useState(false);
  const [envioAluno, setEnvioAluno] = useState<AlunoLinha | null>(null);
  const flash = useFlash();
  const timer = useRef<number>();

  const buscar = (pagina = 1) => {
    const { responsavel_nome, ...f } = filtros;
    void responsavel_nome;
    return api.get(`/alunos${qs({ ...f, q: rapido, situacao_mat: sit, pagina, por_pagina: porPagina })}`).then((r) => { setRes(r); }).catch(flash.erro);
  };
  useEffect(() => { try { sessionStorage.setItem('csm.alunos.filtros', JSON.stringify({ filtros, rapido, porPagina, sit })); } catch { /* sem storage */ } }, [filtros, rapido, porPagina, sit]);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => buscar(1), 250);
    return () => window.clearTimeout(timer.current);
  }, [filtros, rapido, porPagina, sit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir(a: AlunoLinha) {
    if (!window.confirm(`Excluir o aluno "${a.nome_completo}"?`)) return;
    try { await api.del(`/alunos/${a.id}`); flash.ok('Aluno excluído.'); buscar(res.pagina); } catch (e) { flash.erro(e); }
  }

  const campo = (k: keyof typeof FILTROS_VAZIOS, rotulo: string, tipo = 'text', numerico = false) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{rotulo}</label>
      <input id={`f-${k}`} className="input" type={tipo} inputMode={numerico ? 'numeric' : undefined} value={filtros[k]} onChange={(e) => setFiltros({ ...filtros, [k]: numerico ? e.target.value.replace(/[^\d.\-]/g, '') : e.target.value })} />
    </div>
  );

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Cadastro de Alunos' }]} />
          <h1>Alunos</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid">
          {campo('codigo', 'Código', 'text', true)}
          {campo('cpf', 'CPF', 'text', true)}
          <div className="span-2">{campo('nome', 'Nome do aluno (contém)')}</div>
          {campo('matricula', 'Matrícula')}
          {campo('cadastro_de', 'Data cadastro inicial', 'date')}
          {campo('cadastro_ate', 'Data cadastro final', 'date')}
          <div className="field">
            <label>Responsável</label>
            <div className="pick-field">
              <input className="input" readOnly placeholder="Selecionar…" value={filtros.responsavel_nome} onClick={() => can('academico.pessoas') && setPickResp(true)} />
              {filtros.responsavel_id && <button className="btn" aria-label="Limpar responsável" title="Limpar responsável" onClick={() => setFiltros({ ...filtros, responsavel_id: '', responsavel_nome: '' })}>×</button>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="linklike" onClick={() => { setFiltros(FILTROS_VAZIOS); setRapido(''); }}>Limpar Filtro</button>
        </div>
      </div>

      {res.ano_matricula && (
        <div className="seg-group" role="group" aria-label={`Situação da matrícula ${res.ano_matricula}`} style={{ marginBottom: 12 }}>
          <span className="cap" style={{ marginRight: 2 }}>Situação em {res.ano_matricula}</span>
          {SITUACOES.map((x) => (
            <button key={x.chave} className={`seg${sit === x.chave ? ' on' : ''}`} aria-pressed={sit === x.chave} onClick={() => setSit(x.chave)}>
              {x.label}{x.campo && res.resumo_matricula ? <small>{res.resumo_matricula[x.campo]}</small> : null}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar">
        {can('academico.alunos.inclusao', 1) && <button className="btn btn-green" onClick={() => nav('/academico/alunos/novo')}>Novo</button>}
        <div className="spacer" />
        <label style={{ color: 'var(--muted)' }}>
          Por página{' '}
          <select className="input" style={{ width: 'auto', display: 'inline-block' }} value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}>
            {[5, 10, 25, 50].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <input className="input search" placeholder="Pesquisar…" value={rapido} onChange={(e) => setRapido(e.target.value)} />
      </div>

      <DataTable
        clickable
        rows={res.itens}
        rowKey={(a) => a.id}
        onSelect={(a) => nav(`/academico/alunos/${a.id}/matriculas`)}
        cols={[
          { header: 'Código', width: 80, render: (a) => a.id },
          { header: 'Matrícula', render: (a) => a.matricula },
          { header: 'CPF', render: (a) => a.cpf },
          { header: 'Nome', render: (a) => <button className="row-link" onClick={(e) => { e.stopPropagation(); nav(`/academico/alunos/${a.id}/matriculas`); }}>{a.nome_completo}</button> },
          { header: 'Nascimento', render: (a) => fmtData(a.data_nascimento) },
          { header: 'Telefone', render: (a) => [a.ddd, a.celular || a.telefone].filter(Boolean).join(' ') },
          ...(res.ano_matricula ? [{ header: `Matrícula ${res.ano_matricula}`, width: 190, render: (a: AlunoLinha) => {
            if (!a.mat_status) return <span className="chip mute">Sem matrícula</span>;
            const x = situacao({ ano: res.ano_matricula!, status: a.mat_status, passo: a.mat_passo });
            return <span className={`chip ${x.kind}`}>{x.label}</span>;
          } }] : []),
          { header: '', width: 190, render: (a) => (
            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn icon-btn-sm" title="Informações do aluno" aria-label={`Informações de ${a.nome_completo}`} onClick={() => setDetalhe(a.id)}><Icon name="info" size={18} /></button>
              <button className="icon-btn icon-btn-sm" title={can('academico.alunos.inclusao', 2) ? 'Editar cadastro' : 'Consultar cadastro'} aria-label={`Abrir cadastro de ${a.nome_completo}`} onClick={() => nav(`/academico/alunos/${a.id}`)}><Icon name="edit" size={18} /></button>
              {can('academico.alunos', 2) && res.ano_matricula && <button className="icon-btn icon-btn-sm" title="Enviar link de rematrícula" aria-label={`Enviar link de rematrícula de ${a.nome_completo}`} onClick={() => setEnvioAluno(a)}><Icon name="send" size={18} /></button>}
              <GerarDocumentos compacto alunoId={a.id} onOk={flash.ok} onErro={flash.erro} />
              {can('academico.alunos.excluir', 1) && <button className="icon-btn icon-btn-sm" title="Excluir aluno" aria-label={`Excluir ${a.nome_completo}`} onClick={() => void excluir(a)}><Icon name="trash" size={18} /></button>}
            </div>
          ) },
        ]}
      />
      <Pagination pagina={res.pagina} porPagina={porPagina} total={res.total} onChange={buscar} />

      {envioAluno && <EnvioRematriculas alunoId={envioAluno.id} nomeAluno={envioAluno.nome_completo} onClose={() => { setEnvioAluno(null); buscar(res.pagina); }} />}
      {detalhe && <InformacoesAluno id={detalhe} onClose={() => setDetalhe(null)} />}
      {pickResp && (
        <PessoaPickerModal titulo="Responsável" onClose={() => setPickResp(false)}
          onSelect={(p) => { setFiltros({ ...filtros, responsavel_id: String(p.id), responsavel_nome: p.nome }); setPickResp(false); }} />
      )}
    </>
  );
}

// Modal "Informações do Aluno" (somente leitura). Não exibe IDs internos.
export function InformacoesAluno({ id, onClose }: { id: number; onClose: () => void }) {
  const [a, setA] = useState<any>(null);
  const [erro, setErro] = useState('');
  const nav = useNavigate();
  useEffect(() => { api.get(`/alunos/${id}`).then(setA).catch((e) => setErro(e.message)); }, [id]);

  const resp = (titulo: string, p: any) => (
    <details className="card" open style={{ padding: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{titulo}</summary>
      {p ? (
        <dl className="kv" style={{ marginTop: 8 }}>
          <dt>Nome</dt><dd>{p.nome}</dd><dt>CPF</dt><dd>{p.cpf}</dd><dt>E-mail</dt><dd>{p.email}</dd><dt>Celular</dt><dd>{p.celular}</dd>
        </dl>
      ) : <div style={{ color: 'var(--muted)', marginTop: 6 }}>Não informado</div>}
    </details>
  );

  return (
    <Modal title="Informações do Aluno" onClose={onClose} wide footer={<>
      <button className="btn" onClick={() => nav(`/academico/alunos/${id}`)}>Abrir cadastro</button>
      <button className="btn" onClick={onClose}>Fechar</button>
    </>}>
      <Alert>{erro}</Alert>
      {a && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <div className="photo-box" style={{ width: 90, height: 110 }}>{a.foto ? <img src={a.foto} alt="" /> : 'Sem foto'}</div>
            <div>
              <h2 style={{ margin: '0 0 4px' }}>{a.nome_completo}</h2>
              <div style={{ color: 'var(--muted)' }}>Código {a.id} · {a.sexo || 'Sexo não informado'} · {idade(a.data_nascimento)}</div>
            </div>
          </div>
          <dl className="kv" style={{ marginBottom: 14 }}>
            <dt>Matrícula</dt><dd>{a.matricula}</dd>
            <dt>CPF</dt><dd>{a.cpf}</dd>
            <dt>Nascimento</dt><dd>{fmtData(a.data_nascimento)}</dd>
            <dt>E-mail</dt><dd>{a.email}</dd>
            <dt>Telefone</dt><dd>{[a.ddd, a.telefone, a.celular].filter(Boolean).join(' / ')}</dd>
            <dt>Endereço</dt><dd>{[a.rua, a.numero, a.bairro, a.cidade, a.uf].filter(Boolean).join(', ')}</dd>
            <dt>Cadastro</dt><dd>{fmtDataHora(a.created_at)}{a.criado_por ? ` por ${a.criado_por}` : ''}</dd>
          </dl>
          <div style={{ display: 'grid', gap: 8 }}>
            {resp('Pai', a.pai)}{resp('Mãe', a.mae)}{resp('Responsável Pedagógico', a.resp_pedagogico)}
          </div>
        </>
      )}
    </Modal>
  );
}
