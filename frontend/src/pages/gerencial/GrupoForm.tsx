import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { ACESSO, useAuth } from '../../auth';
import { Crumbs, Alert, Tabs, useFlash } from '../../components/ui';
import PermissionEditor from '../../components/PermissionEditor';

const JANELAS: [string, string][] = [['seg_sex', 'Segunda a Sexta'], ['sabado', 'Sábado'], ['domingo', 'Domingo'], ['feriado', 'Feriado']];
const VINCULOS = ['Todos', 'Apenas usuários nível avançado'];

export default function GrupoForm() {
  const { id } = useParams();
  const novo = !id;
  const nav = useNavigate();
  const { can } = useAuth();
  const readOnly = !can('gerencial.grupos', ACESSO.manutencao);
  const [aba, setAba] = useState(0);
  const [nome, setNome] = useState('');
  const [vinculo, setVinculo] = useState('Todos');
  const [horarios, setHorarios] = useState<Record<string, { de: string; ate: string }>>({});
  const [permissoes, setPermissoes] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const flash = useFlash();

  useEffect(() => {
    if (novo) return;
    api.get(`/grupos/${id}`).then((g) => {
      setNome(g.nome); setVinculo(g.vinculo_perfil); setHorarios(g.horarios || {}); setPermissoes(g.permissoes || {});
    }).catch(flash.erro);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function gravar() {
    setSalvando(true);
    try {
      const corpo = { nome, vinculo_perfil: vinculo, horarios, permissoes };
      if (novo) { const r = await api.post('/grupos', corpo); nav(`/gerencial/grupos/${r.id}`, { replace: true }); }
      else await api.put(`/grupos/${id}`, corpo);
      flash.ok('Grupo gravado.');
    } catch (e) { flash.erro(e); } finally { setSalvando(false); }
  }

  const setJanela = (k: string, campo: 'de' | 'ate', v: string) => setHorarios({ ...horarios, [k]: { de: horarios[k]?.de || '', ate: horarios[k]?.ate || '', [campo]: v } });

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gerencial', to: '/gerencial' }, { label: 'Grupos de Permissão', to: '/gerencial/grupos' }, { label: 'Grupo' }]} />
          <h1>{novo ? 'Novo grupo' : readOnly ? 'Consultar grupo' : 'Editar grupo'}</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="card">
        <div className="grid">
          <div className="field span-2">
            <label>Nome do grupo *</label>
            <input className="input" value={nome} readOnly={readOnly} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="field span-2">
            <label>Vincular o grupo ao perfil de usuários</label>
            <select className="input" value={vinculo} disabled={readOnly} onChange={(e) => setVinculo(e.target.value)}>
              {VINCULOS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="card">
        <Tabs tabs={['Permissões', 'Horários de acesso']} active={aba} onChange={setAba} />
        {aba === 0 && <PermissionEditor valores={permissoes} onChange={setPermissoes} readOnly={readOnly} />}
        {aba === 1 && (
          <>
            <Alert kind="info">Horário de Brasília. Campo em branco = liberado. Administradores não são limitados por horário. O horário de feriado ainda não é verificado (não há calendário).</Alert>
            {JANELAS.map(([k, rotulo]) => (
              <div className="perm-row perm-row-time" key={k}>
                <div>{rotulo}: entre</div>
                <input className="input" type="time" value={horarios[k]?.de || ''} disabled={readOnly} onChange={(e) => setJanela(k, 'de', e.target.value)} />
                <input className="input" type="time" value={horarios[k]?.ate || ''} disabled={readOnly} onChange={(e) => setJanela(k, 'ate', e.target.value)} />
              </div>
            ))}
          </>
        )}
      </div>
      <div className="footer-bar">
        <button className="btn" onClick={() => nav('/gerencial/grupos')}>Voltar</button>
        <div className="spacer" />
        {!readOnly && <button className="btn btn-primary" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>}
      </div>
    </>
  );
}
