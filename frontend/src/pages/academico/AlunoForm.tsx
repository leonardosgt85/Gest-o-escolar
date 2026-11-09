import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../../api';
import { useAuth } from '../../auth';
import PessoaCombo from '../../components/PessoaCombo';
import type { PessoaResumo } from '../../components/PessoaModals';
import GerarDocumentos from '../../components/GerarDocumentos';
import { Crumbs, Alert, DataTable, FormSections, Modal, Pagination, Tabs, useFlash, type FieldDef, type Section } from '../../components/ui';
import { fmtDataHora, idade, lerArquivoComoDataUrl } from '../../lib/utils';
import type { AlunoLinha } from './Alunos';

const ABAS = ['Dados do Aluno', 'Endereço / Contatos', 'Responsáveis', 'Documentos', 'Informações Adicionais', 'Processo seletivo', 'Observações'];

const DADOS: Section[] = [{
  fields: [
    { name: 'nome_completo', label: 'Nome Completo', span: 2, required: true },
    { name: 'nome_social', label: 'Nome Social', span: 2 },
    { name: 'cpf', label: 'CPF', type: 'cpf' },
    { name: 'data_nascimento', label: 'Data de Nascimento', type: 'date', required: true },
    { name: 'matricula', label: 'Matrícula' },
    { name: 'rga', label: 'RGA' },
    { name: 'nis', label: 'NIS' },
    { name: 'sexo', label: 'Sexo', type: 'select', options: 'sexo' },
    { name: 'estado_civil', label: 'Estado Civil', type: 'select', options: 'estado_civil' },
    { name: 'id_censo', label: 'Id.Censo' },
    { name: 'naturalidade', label: 'Naturalidade', span: 2 },
    { name: 'naturalidade_uf', label: 'UF', type: 'uf' },
    { name: 'nacionalidade', label: 'Nacionalidade' },
    { name: 'email', label: 'E-mail', type: 'email', span: 2, hint: 'Acesso ao portal do aluno' },
    { name: 'rg', label: 'RG' },
    { name: 'rg_data_expedicao', label: 'Data Expedição', type: 'date' },
    { name: 'rg_orgao_emissor', label: 'Órgão Emissor' },
    { name: 'rg_uf', label: 'UF RG', type: 'uf' },
    { name: 'cor_raca', label: 'Cor/Raça', type: 'select', options: 'cor_raca' },
    { name: 'docto_apresentado', label: 'Docto apresentado', type: 'select', options: 'docto_apresentado' },
    { name: 'outros_documentos', label: 'Outros Documentos', span: 2 },
    { name: 'necessidades_especiais', label: 'Necessidades Especiais', type: 'select', options: 'necessidades_especiais' },
    { name: 'necessidades_especiais_complemento', label: 'Complemento de Necessidades Especiais', span: 3 },
  ],
}];

const ENDERECO: Section[] = [{
  fields: [
    { name: 'cep', label: 'CEP', type: 'cep', hint: 'Preenche o endereço automaticamente' },
    { name: 'rua', label: 'Rua', span: 2 },
    { name: 'numero', label: 'Nº' },
    { name: 'complemento', label: 'Complemento', span: 2 },
    { name: 'bairro', label: 'Bairro' },
    { name: 'cidade', label: 'Cidade' },
    { name: 'uf', label: 'UF', type: 'uf' },
    { name: 'ddd', label: 'DDD', maxLength: 3 },
    { name: 'telefone', label: 'Telefone', type: 'fone' },
    { name: 'celular', label: 'Celular', type: 'fone' },
  ],
}];

const DOCUMENTOS: Section[] = [{
  title: 'Certidão de Nascimento',
  fields: [
    { name: 'certidao_livro', label: 'Livro' },
    { name: 'certidao_folha', label: 'Folha' },
    { name: 'certidao_matricula', label: 'Matrícula Cert. Nascimento', span: 2 },
    { name: 'certidao_data_registro', label: 'Data Registro', type: 'date' },
    { name: 'certidao_cartorio', label: 'Cartório', span: 3 },
  ],
}];

const ADICIONAIS: Section[] = [{
  fields: [
    { name: 'escola_origem', label: 'Escola de Origem', span: 2 },
    { name: 'cert_reservista', label: 'Cert. Reservista' },
    { name: 'como_conheceu', label: 'Como tomou conhecimento do curso', type: 'select', options: 'como_conheceu', span: 2, hint: 'Alimenta o CRM' },
    { name: 'como_conheceu_outros', label: 'Outros (descreva)', span: 2 },
    { name: 'titulo_eleitor', label: 'Título Eleitor' },
    { name: 'titulo_zona', label: 'Zona' },
    { name: 'titulo_secao', label: 'Seção' },
    { name: 'cnh', label: 'CNH' },
    { name: 'cnh_categoria', label: 'Categoria', maxLength: 5 },
    { name: 'renach', label: 'RENACH' },
    { name: 'sit_ocupacional', label: 'Sit. Ocupacional', type: 'select', options: 'sit_ocupacional' },
    { name: 'liberado_novas_matriculas', label: 'Liberado para novas matrículas', type: 'select', options: 'liberado_novas_matriculas' },
    { name: 'desconto_percentual', label: 'Gerar Financeiro com X% de desconto', type: 'number', hint: 'Para novas matrículas e rematrículas' },
    { name: 'tipo_sanguineo', label: 'Tipo sanguíneo', type: 'select', options: 'tipo_sanguineo' },
    { name: 'profissao', label: 'Profissão' },
    { name: 'religiao', label: 'Religião', type: 'select', options: 'religiao' },
  ],
}];

const bloco = (p: string, titulo: string): Section => ({
  title: titulo,
  fields: [
    { name: `${p}.nome_escola`, label: 'Nome da Escola', span: 2 },
    { name: `${p}.ano`, label: 'Ano' },
    { name: `${p}.cidade`, label: 'Cidade' },
    { name: `${p}.uf`, label: 'UF', type: 'uf' },
    { name: `${p}.situacao`, label: 'Situação', type: 'select', options: ['Incompleto', 'Cursando', 'Concluído'] },
    { name: `${p}.data_conclusao`, label: 'Data conclusão', type: 'date' },
    { name: `${p}.data_emissao`, label: 'Data Emissão', type: 'date' },
    { name: `${p}.n_certificado`, label: 'Nº Certificado' },
    { name: `${p}.folha`, label: 'Folha' },
    { name: `${p}.livro`, label: 'Livro' },
    { name: `${p}.data`, label: 'Data', type: 'date' },
  ],
});
const PROCESSO: Section[] = [
  bloco('processo_seletivo.ens_fundamental', 'Término Ens. Fundamental'),
  bloco('processo_seletivo.ens_medio', 'Término Ens. Médio'),
  bloco('processo_seletivo.ens_medio_tecnico', 'Término Ens. Médio Técnico'),
  {
    title: 'Término Ens. Superior',
    fields: [
      { name: 'processo_seletivo.ens_superior.colacao_grau', label: 'Colação de Grau', type: 'date' },
      { name: 'processo_seletivo.ens_superior.data', label: 'Data', type: 'date' },
      { name: 'processo_seletivo.ens_superior.diploma_de', label: 'Diploma de', span: 2 },
      { name: 'processo_seletivo.ens_superior.n_registro', label: 'Nº Registro' },
      { name: 'processo_seletivo.ens_superior.livro', label: 'Livro' },
      { name: 'processo_seletivo.ens_superior.folha', label: 'Folha' },
      { name: 'processo_seletivo.ens_superior.local', label: 'Local' },
    ],
  },
  {
    title: 'Processo seletivo',
    fields: [
      { name: 'processo_seletivo.selecao.nome', label: 'Nome', span: 2 },
      { name: 'processo_seletivo.selecao.data', label: 'Data', type: 'date' },
      { name: 'processo_seletivo.selecao.ies_origem', label: 'IES Origem / Entidade Certificadora', span: 2 },
      { name: 'processo_seletivo.selecao.classificacao', label: 'Classificação' },
      { name: 'processo_seletivo.selecao.pontuacao', label: 'Pontuação' },
      { name: 'processo_seletivo.selecao.componentes_prova', label: 'Componentes da prova', span: 2 },
      { name: 'processo_seletivo.selecao.ano_semestre', label: 'Ano/Semestre' },
      {
        name: 'processo_seletivo.selecao.tipo_ingresso', label: 'Tipo Ingresso', type: 'select', span: 2,
        options: ['Vestibular tradicional', 'Vestibular simplificado', 'Vestibular online', 'Enem', 'Transferência', 'Portador de diploma'],
      },
    ],
  },
];
const OBSERVACOES: Section[] = [{ fields: [{ name: 'observacoes', label: 'Observações', type: 'textarea', span: 4 }] }];

const COPIAR_DO_IRMAO = ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'ddd', 'telefone', 'tipo_resp_pedag', 'tipo_resp_financ', 'pai_id', 'mae_id', 'resp_pedagogico_id', 'pai', 'mae', 'resp_pedagogico'];

type Form = Record<string, any>;

export default function AlunoForm() {
  const { id } = useParams();
  const novo = !id;
  const nav = useNavigate();
  const { can } = useAuth();
  const readOnly = novo ? !can('academico.alunos.inclusao', 1) : !can('academico.alunos.inclusao', 2);
  const [aba, setAba] = useState(0);
  const [form, setForm] = useState<Form>({ nacionalidade: 'Brasileira', liberado_novas_matriculas: 'Sim', processo_seletivo: {} });
  const [salvando, setSalvando] = useState(false);
  const [irmao, setIrmao] = useState(false);
  const flash = useFlash();
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (novo) return;
    api.get(`/alunos/${id}`).then((a) => setForm({ ...a, processo_seletivo: a.processo_seletivo || {} })).catch(flash.erro);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gravar() {
    setSalvando(true);
    flash.clear();
    try {
      const corpo = { ...form };
      for (const k of ['pai', 'mae', 'resp_pedagogico', 'criado_por', 'alterado_por']) delete corpo[k];
      if (novo) {
        const r = await api.post<{ id: number }>('/alunos', corpo);
        nav(`/academico/alunos/${r.id}`, { replace: true });
      } else {
        await api.put(`/alunos/${id}`, corpo);
        const a = await api.get(`/alunos/${id}`);
        setForm({ ...a, processo_seletivo: a.processo_seletivo || {} });
      }
      flash.ok('Aluno gravado com sucesso.');
      window.scrollTo({ top: 0 });
    } catch (e) { flash.erro(e); window.scrollTo({ top: 0 }); } finally { setSalvando(false); }
  }

  function vincular(campo: 'pai' | 'mae' | 'resp_pedagogico', p: PessoaResumo | null) {
    setForm((f: Form) => ({ ...f, [`${campo}_id`]: p?.id ?? null, [campo]: p }));
  }

  async function importarIrmao(a: AlunoLinha) {
    try {
      const completo = await api.get(`/alunos/${a.id}`);
      const novoForm = { ...form };
      for (const k of COPIAR_DO_IRMAO) novoForm[k] = completo[k];
      setForm(novoForm);
      setIrmao(false);
      flash.ok(`Responsáveis e endereço copiados de ${a.nome_completo}. Revise e grave.`);
    } catch (e) { flash.erro(e); }
  }

  const ultimoLogin = [form.pai, form.mae, form.resp_pedagogico].map((p) => p?.ultimo_login).filter(Boolean).sort().slice(-1)[0];

  // Sugestões para cadastrar um responsável novo sem digitar tudo: mesmo endereço do aluno.
  const enderecoAluno = Object.fromEntries(['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'ddd', 'telefone'].map((k) => [k, form[k] ?? '']).filter(([, v]) => v !== ''));

  const respFields: FieldDef[] = [
    { name: 'tipo_resp_pedag', label: 'Tipo Resp. Pedag', type: 'select', options: 'tipo_resp_pedag', span: 2 },
    { name: 'tipo_resp_financ', label: 'Tipo Resp. Financ', type: 'select', options: 'tipo_resp_financ', span: 2, hint: 'O responsável financeiro definitivo é definido por matrícula (módulo futuro).' },
  ];

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Cadastro de Alunos', to: '/academico/alunos' }, { label: novo ? 'Novo aluno' : 'Aluno' }]} />
          <h1>Cadastro de Alunos {!novo && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· Código {id}</span>}</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}

      <div className="card">
        <Tabs tabs={ABAS} active={aba} onChange={setAba} />
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            {aba === 0 && (
              <>
                <div className="grid" style={{ marginBottom: 12 }}>
                  <div className="field"><label>Código</label><input className="input" readOnly value={novo ? '0' : id} /></div>
                  <div className="field"><label>Idade</label><input className="input" readOnly value={idade(form.data_nascimento)} /></div>
                </div>
                <FormSections sections={DADOS} form={form} setForm={setForm} readOnly={readOnly} />
              </>
            )}
            {aba === 1 && <FormSections sections={ENDERECO} form={form} setForm={setForm} readOnly={readOnly} />}
            {aba === 2 && (
              <>
                <Alert kind="info">Digite o nome ou o CPF para buscar o responsável. Se ele ainda não estiver cadastrado, use o ícone amarelo ao lado do campo para cadastrar agora, sem sair desta tela.</Alert>
                <div className="grid">
                  <PessoaCombo label="Pai" value={form.pai} onChange={(p) => vincular('pai', p)} readOnly={readOnly} prefill={{ sexo: 'Masculino', ...enderecoAluno }} />
                  <PessoaCombo label="Mãe" value={form.mae} onChange={(p) => vincular('mae', p)} readOnly={readOnly} prefill={{ sexo: 'Feminino', ...enderecoAluno }} />
                  <PessoaCombo label="Resp. Pedagógico" value={form.resp_pedagogico} onChange={(p) => vincular('resp_pedagogico', p)} readOnly={readOnly} prefill={enderecoAluno} />
                </div>
                <div style={{ height: 12 }} />
                <FormSections sections={[{ fields: respFields }]} form={form} setForm={setForm} readOnly={readOnly} />
                <div className="grid" style={{ marginTop: 12 }}>
                  <div className="field span-2"><label>Último login do responsável</label><input className="input" readOnly value={ultimoLogin ? fmtDataHora(ultimoLogin) : ''} /></div>
                </div>
              </>
            )}
            {aba === 3 && (
              <>
                {!novo && (
                  <div className="docs-panel">
                    <div className="docs-panel-text">
                      <b>Documentos para assinatura</b>
                      <span>Gera, de uma vez, o Termo de grupo de WhatsApp, o Termo de redes sociais e o Contrato 2027 com os dados do aluno e do responsável.</span>
                    </div>
                    <GerarDocumentos alunoId={Number(id)} onOk={flash.ok} onErro={flash.erro} />
                  </div>
                )}
                <FormSections sections={DOCUMENTOS} form={form} setForm={setForm} readOnly={readOnly} />
              </>
            )}
            {aba === 4 && <FormSections sections={ADICIONAIS} form={form} setForm={setForm} readOnly={readOnly} />}
            {aba === 5 && <FormSections sections={PROCESSO} form={form} setForm={setForm} readOnly={readOnly} />}
            {aba === 6 && <FormSections sections={OBSERVACOES} form={form} setForm={setForm} readOnly={readOnly} />}
          </div>
          <div>
            <div className="photo-box">{form.foto ? <img src={form.foto} alt="Foto do aluno" /> : 'Sem foto'}</div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => arquivo.current?.click()}>Inserir Fotos</button>
                {form.foto && <button className="btn btn-sm" onClick={() => setForm({ ...form, foto: null })}>Excluir Foto</button>}
                <input ref={arquivo} type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) try { setForm({ ...form, foto: await lerArquivoComoDataUrl(f) }); } catch (er) { flash.erro(er); }
                  e.target.value = '';
                }} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="footer-bar">
        <button className="btn" onClick={() => nav('/academico/alunos')}>Voltar</button>
        {!readOnly && <button className="btn btn-primary" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>}
        {!novo && <GerarDocumentos alunoId={Number(id)} onOk={(m) => { flash.ok(m); window.scrollTo({ top: 0 }); }} onErro={(e) => { flash.erro(e); window.scrollTo({ top: 0 }); }} />}
        {!readOnly && can('academico.alunos.importar_irmao', 1) && <button className="linklike" onClick={() => setIrmao(true)}>Importar dados do Irmão</button>}
        <div className="spacer" />
        {!novo && form.created_at && (
          <span className="audit">
            Cadastrado em {fmtDataHora(form.created_at)}{form.criado_por ? ` por ${form.criado_por}` : ''}
            {form.updated_at && form.updated_at !== form.created_at ? ` / Alterado em ${fmtDataHora(form.updated_at)}${form.alterado_por ? ` por ${form.alterado_por}` : ''}` : ''}
          </span>
        )}
        <button className="btn footer-extra" disabled={!id} title={id ? 'Histórico de matrículas do aluno' : 'Grave o aluno para ver as matrículas'} onClick={() => nav(`/academico/alunos/${id}/matriculas`)}>Matrículas</button>
        <button className="btn footer-extra" disabled title="Disponível quando o módulo Financeiro for implantado">Financeiro</button>
      </div>

      {irmao && <IrmaoModal onClose={() => setIrmao(false)} onSelect={importarIrmao} ignorarId={id ? Number(id) : undefined} />}
    </>
  );
}

function IrmaoModal({ onClose, onSelect, ignorarId }: { onClose: () => void; onSelect: (a: AlunoLinha) => void; ignorarId?: number }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ itens: AlunoLinha[]; total: number; pagina: number }>({ itens: [], total: 0, pagina: 1 });
  const [sel, setSel] = useState<AlunoLinha | null>(null);
  const buscar = (pagina = 1) => api.get(`/alunos${qs({ q, pagina, por_pagina: 8 })}`).then(setRes).catch(() => {});
  useEffect(() => { const t = setTimeout(() => buscar(1), 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="Importar dados do Irmão" onClose={onClose} wide
      footer={<><button className="btn btn-primary" disabled={!sel} onClick={() => sel && onSelect(sel)}>Copiar responsáveis e endereço</button><button className="btn" onClick={onClose}>Fechar</button></>}>
      <input className="input" placeholder="Pesquisar aluno por nome, código, matrícula ou CPF…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <DataTable
        rows={res.itens.filter((a) => a.id !== ignorarId)}
        rowKey={(a) => a.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        cols={[{ header: 'Código', render: (a) => a.id }, { header: 'Nome', render: (a) => <b>{a.nome_completo}</b> }, { header: 'Matrícula', render: (a) => a.matricula }, { header: 'CPF', render: (a) => a.cpf }]}
      />
      <Pagination pagina={res.pagina} porPagina={8} total={res.total} onChange={buscar} />
    </Modal>
  );
}
