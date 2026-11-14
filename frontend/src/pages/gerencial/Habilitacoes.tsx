import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { MENU } from '../../menu';
import { Crumbs, Alert, DataTable, useFlash } from '../../components/ui';

interface Hab { chave: string; nome: string; descricao: string | null; ativo: boolean; nucleo: boolean }

export default function Habilitacoes() {
  const { me, can } = useAuth();
  const [itens, setItens] = useState<Hab[]>([]);
  const flash = useFlash();
  const editavel = can('gerencial.habilitacoes', ACESSO.manutencao) && me?.nivel === 'Administrador';

  const carregar = () => api.get<Hab[]>('/habilitacoes').then(setItens).catch(flash.erro);
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function alternar(h: Hab) {
    try {
      await api.patch(`/habilitacoes/${h.chave}`, { ativo: !h.ativo });
      flash.ok(`Módulo "${h.nome}" ${!h.ativo ? 'habilitado' : 'desabilitado'}. Peça aos usuários para entrarem novamente para atualizar o menu.`);
      carregar();
    } catch (e) { flash.erro(e); }
  }

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gerencial', to: '/gerencial' }, { label: 'Habilitações' }]} />
          <h1>Habilitações</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <Alert kind="info">
        Habilitações definem quais módulos a escola utiliza. O acesso efetivo de cada usuário é a habilitação do módulo ∩ o grupo de permissão ∩ as permissões extras do usuário.
        {!editavel && ' Somente administradores podem alterar.'}
      </Alert>
      <DataTable
        rows={itens}
        rowKey={(h) => h.chave}
        cols={[
          { header: 'Módulo', render: (h) => <b>{h.nome}</b> },
          { header: 'Descrição', render: (h) => h.descricao },
          { header: 'Situação', render: (h) => <span className={`badge ${h.ativo ? 'ok' : 'off'}`}>{h.ativo ? 'Habilitado' : 'Desabilitado'}</span> },
          {
            header: '',
            width: 140,
            render: (h) => h.nucleo ? <span className="badge">Essencial</span> : (
              <button className="btn btn-sm" disabled={!editavel || (!h.ativo && !MENU.some((m) => m.modulo === h.chave))} title={!h.ativo && !MENU.some((m) => m.modulo === h.chave) ? 'Módulo em breve: ainda não disponível' : undefined} onClick={(e) => { e.stopPropagation(); alternar(h); }}>
                {h.ativo ? 'Desabilitar' : 'Habilitar'}
              </button>
            ),
          },
        ]}
      />
    </>
  );
}
