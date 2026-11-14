import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Crumbs, Alert, DataTable, FormSections, Modal, Tabs, useFlash, type Section } from '../../components/ui';
import DisciplinaSelect from '../../components/DisciplinaSelect';
import PermissionEditor from '../../components/PermissionEditor';
import { fmtDataHora, lerArquivoComoDataUrl } from '../../lib/utils';

interface Usuario {
  id: number; nome_completo: string; email: string; nivel: string; situacao: string; grupo_id: number | null; grupo_nome: string | null;
  cargo: string | null; ultimo_acesso: string | null; [k: string]: any;
}

const NIVEIS = ['Administrador', 'Adm. Financeiro', 'Adm. Pedagógico', 'Usuário'];
const SIM_NAO = ['Não', 'Sim'];
const OUTRAS: [string, string][] = [
  ['exporta_excel', 'Exporta Relatórios para Excel'],
  ['acessa_ips_validos', 'Acessa apenas IPs válidos'],
  ['acessa_chat', 'Acessa chat de usuários'],
];

export default function Usuarios() {
  const { me, can } = useAuth();
  const manut = can('gerencial.usuarios', ACESSO.manutencao);
  const [lista, setLista] = useState<Usuario[]>([]);
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Usuario | null>(null);
  const [modal, setModal] = useState<{ id?: number } | null>(null);
  const flash = useFlash();
  const timer = useRef<number>();

  const carregar = () => api.get<Usuario[]>(`/usuarios${qs({ q: busca, somente_ativos: somenteAtivos ? '' : 'false' })}`).then(setLista).catch(flash.erro);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(carregar, 250);
    return () => window.clearTimeout(timer.current);
  }, [somenteAtivos, busca]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gerencial', to: '/gerencial' }, { label: 'Usuários' }]} />
          <h1>Usuários</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => setModal({})}>Novo</button>}
        <button className="btn btn-orange" disabled={!sel} onClick={() => sel && setModal({ id: sel.id })}>{manut ? 'Editar' : 'Consultar'}</button>
        <label className="switch"><input type="checkbox" checked={somenteAtivos} onChange={(e) => setSomenteAtivos(e.target.checked)} /> Somente ativos</label>
        <div className="spacer" />
        <input className="input search" placeholder="Pesquisar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <DataTable
        rows={lista}
        rowKey={(u) => u.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(u) => setModal({ id: u.id })}
        cols={[
          { header: 'Código', width: 80, render: (u) => u.id },
          { header: 'Nome completo', render: (u) => <b>{u.nome_completo}</b> },
          { header: 'E-mail (login)', render: (u) => u.email },
          { header: 'Cargo', render: (u) => u.cargo },
          { header: 'Professor', width: 90, render: (u) => (u.professor ? 'Sim' : '') },
          { header: 'Nível', render: (u) => u.nivel },
          { header: 'Situação', render: (u) => <span className={`badge ${u.situacao === 'Ativo' ? 'ok' : 'off'}`}>{u.situacao}</span> },
          { header: 'Grupo de permissão', render: (u) => u.grupo_nome },
          { header: 'Último acesso', render: (u) => fmtDataHora(u.ultimo_acesso) },
        ]}
      />
      {modal && (
        <UsuarioModal
          id={modal.id}
          readOnly={!manut}
          souAdmin={me?.nivel === 'Administrador'}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); flash.ok('Usuário gravado.'); carregar(); }}
        />
      )}
    </>
  );
}

function UsuarioModal({ id, readOnly, souAdmin, onClose, onSaved }: { id?: number; readOnly: boolean; souAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [aba, setAba] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({ nivel: 'Usuário', situacao: 'Ativo', outras_informacoes: {}, permissoes_extras: {} });
  const { can } = useAuth();
  const [grupos, setGrupos] = useState<{ id: number; nome: string }[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/grupos').then(setGrupos).catch(() => {});
    if (id) api.get(`/usuarios/${id}`).then((u) => setForm({ ...u, data_limite: u.data_limite || '', disciplinas_ids: u.disciplinas_ids || [] })).catch((e) => setErro(e.message));
  }, [id]);

  const dados: Section[] = [{
    fields: [
      { name: 'nome_completo', label: 'Nome completo', span: 2, required: true },
      { name: 'nivel', label: 'Nível', type: 'select', options: souAdmin ? NIVEIS : NIVEIS.filter((n) => n !== 'Administrador') },
      { name: 'situacao', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], hint: 'Usuários não são excluídos, apenas inativados.' },
      { name: 'email', label: 'E-mail / Login', type: 'email', span: 2, required: true },
      { name: 'senha', label: id ? 'Nova senha (deixe em branco para manter)' : 'Senha', type: 'password', span: 2, required: !id, hint: 'Mínimo de 6 caracteres.' },
      { name: 'cargo', label: 'Cargo', span: 2 },
      { name: 'setor', label: 'Setor', span: 2 },
      { name: 'data_limite', label: 'Data limite para utilização', type: 'date', hint: 'O acesso expira nesta data.' },
      { name: 'comissao_vendas', label: '% Comissão s/ vendas de cursos', type: 'number' },
    ],
  }];

  async function gravar() {
    setErro('');
    setSalvando(true);
    try {
      const corpo = { ...form };
      if (!corpo.senha) delete corpo.senha;
      if (id) await api.put(`/usuarios/${id}`, corpo);
      else await api.post('/usuarios', corpo);
      onSaved();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }

  const outras = form.outras_informacoes || {};

  return (
    <Modal title={id ? `Usuário ${id}` : 'Novo usuário'} onClose={onClose} wide
      footer={<>
        <button className="btn" onClick={onClose}>Fechar</button>
        {!readOnly && <button className="btn btn-primary" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>}
      </>}>
      <Alert>{erro}</Alert>
      <Tabs tabs={['Dados cadastrais', 'Outras Informações', 'Permissões extras']} active={aba} onChange={setAba} />
      {aba === 0 && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <FormSections sections={dados} form={form} setForm={setForm} readOnly={readOnly} />
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="field span-2">
                <label>Grupo de Permissão</label>
                <div className="pick-field">
                  <select className="input" disabled={readOnly} value={form.grupo_id ?? ''} onChange={(e) => setForm({ ...form, grupo_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Selecionar</option>
                    {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </div>
              </div>
              <div className="field span-4">
                <label id="lbl-prof">É professor?</label>
                <div className="radio-row" role="radiogroup" aria-labelledby="lbl-prof">
                  {[['Não', false], ['Sim', true]].map(([r, v]) => (
                    <label key={String(r)}><input type="radio" name="professor" disabled={readOnly} checked={!!form.professor === v} onChange={() => setForm({ ...form, professor: v, disciplinas_ids: v ? form.disciplinas_ids || [] : [] })} /> {r}</label>
                  ))}
                </div>
              </div>
              {form.professor && (
                <div className="field span-4">
                  <label>Disciplinas que leciona</label>
                  <DisciplinaSelect multiple value={form.disciplinas_ids || []} onChange={(v) => setForm({ ...form, disciplinas_ids: v })} readOnly={readOnly} podeCriar={can('gerencial.usuarios', ACESSO.manutencao) || can('gerencial.cadastros', ACESSO.manutencao)} />
                  <small className="muted">O professor enxerga essas disciplinas em todas as turmas. Uma disciplina pode ter vários professores.</small>
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="photo-box">{form.foto ? <img src={form.foto} alt="" /> : 'Sem foto'}</div>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => arquivo.current?.click()}>Inserir Fotos</button>
                {form.foto && <button className="btn btn-sm" onClick={() => setForm({ ...form, foto: null })}>Excluir</button>}
                <input ref={arquivo} type="file" accept="image/*" hidden onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) try { setForm({ ...form, foto: await lerArquivoComoDataUrl(f, 320) }); } catch (er) { setErro((er as Error).message); }
                  e.target.value = '';
                }} />
              </div>
            )}
          </div>
        </div>
      )}
      {aba === 1 && (
        <div className="grid">
          {OUTRAS.map(([k, rotulo]) => (
            <div className="field span-2" key={k}>
              <label>{rotulo}</label>
              <select className="input" disabled={readOnly} value={outras[k] || 'Não'} onChange={(e) => setForm({ ...form, outras_informacoes: { ...outras, [k]: e.target.value } })}>
                {SIM_NAO.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div className="span-4"><Alert kind="info">Estes indicadores são guardados no cadastro; a restrição por IP e a exportação para Excel ainda não são aplicadas pelo sistema.</Alert></div>
        </div>
      )}
      {aba === 2 && (
        <>
          <Alert kind="info">Permissões extras são somadas às do grupo (vale a mais permissiva). Em branco = usa só o grupo.</Alert>
          <PermissionEditor valores={form.permissoes_extras || {}} onChange={(v) => setForm({ ...form, permissoes_extras: v })} readOnly={readOnly} vazioLabel="— Usar o grupo —" />
        </>
      )}
    </Modal>
  );
}
