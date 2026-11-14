import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Crumbs, Alert, DataTable, Modal, useFlash } from '../../components/ui';
import { fmtDataHora } from '../../lib/utils';

interface Grupo { id: number; nome: string; vinculo_perfil: string; qtd_usuarios: number }
interface UsuarioResumo { id: number; nome_completo: string; email: string; nivel: string; situacao: string; ultimo_acesso: string | null }

export default function GruposPermissao() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [sel, setSel] = useState<Grupo | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioResumo[] | null>(null);
  const flash = useFlash();
  const manut = can('gerencial.grupos', ACESSO.manutencao);

  const carregar = () => api.get<Grupo[]>('/grupos').then(setGrupos).catch(flash.erro);
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function excluir() {
    if (!sel || !window.confirm(`Excluir o grupo "${sel.nome}"?`)) return;
    try { await api.del(`/grupos/${sel.id}`); setSel(null); flash.ok('Grupo excluído.'); carregar(); } catch (e) { flash.erro(e); }
  }
  async function duplicar() {
    if (!sel) return;
    try {
      const r = await api.post<{ id: number; nome: string }>(`/grupos/${sel.id}/duplicar`);
      flash.ok(`Grupo "${r.nome}" criado.`);
      nav(`/gerencial/grupos/${r.id}`);
    } catch (e) { flash.erro(e); }
  }
  async function verUsuarios(g: Grupo) {
    try { setUsuarios(await api.get(`/grupos/${g.id}/usuarios`)); setSel(g); } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Administração', to: '/administracao' }, { label: 'Perfis de acesso' }]} />
          <h1>Perfis de acesso</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="toolbar">
        {manut && <button className="btn btn-green" onClick={() => nav('/gerencial/grupos/novo')}>Novo</button>}
        <button className="btn btn-orange" disabled={!sel} onClick={() => sel && nav(`/gerencial/grupos/${sel.id}`)}>{manut ? 'Editar' : 'Consultar'}</button>
        {manut && <button className="btn btn-red" disabled={!sel} onClick={excluir}>Excluir</button>}
        {manut && <button className="btn" disabled={!sel} onClick={duplicar}>Duplicar Permissão</button>}
        <div className="spacer" />
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
      </div>
      <DataTable
        rows={grupos}
        rowKey={(g) => g.id}
        selectedKey={sel?.id}
        onSelect={setSel}
        onOpen={(g) => nav(`/gerencial/grupos/${g.id}`)}
        cols={[
          { header: 'Código', width: 90, render: (g) => g.id },
          { header: 'Nome', render: (g) => <b>{g.nome}</b> },
          { header: 'Perfil de usuários', render: (g) => g.vinculo_perfil },
          { header: 'Usuários', width: 110, render: (g) => g.qtd_usuarios },
          { header: 'Ações', width: 150, render: (g) => (
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); verUsuarios(g); }}>Ver usuários</button>
          ) },
        ]}
      />
      {usuarios && sel && (
        <Modal title={`Usuários do grupo ${sel.nome}`} onClose={() => setUsuarios(null)} wide
          footer={<button className="btn" onClick={() => setUsuarios(null)}>Fechar</button>}>
          <DataTable
            rows={usuarios}
            rowKey={(u) => u.id}
            empty="Nenhum usuário neste grupo."
            cols={[
              { header: 'Código', render: (u) => u.id },
              { header: 'Nome', render: (u) => u.nome_completo },
              { header: 'E-mail', render: (u) => u.email },
              { header: 'Nível', render: (u) => u.nivel },
              { header: 'Situação', render: (u) => <span className={`badge ${u.situacao === 'Ativo' ? 'ok' : 'off'}`}>{u.situacao}</span> },
              { header: 'Último acesso', render: (u) => fmtDataHora(u.ultimo_acesso) },
            ]}
          />
        </Modal>
      )}
    </>
  );
}
