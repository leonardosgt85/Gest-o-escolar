import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Modal } from './ui';

export interface Disciplina { id: number; nome: string; sigla: string | null; ativo: boolean; professores?: number; professores_nomes?: string[]; usos_matriz?: number }

/** Cadastro/edição de disciplina em modal. Usado na tela de Disciplinas e "na hora", dentro de outros formulários. */
export function DisciplinaModal({ disciplina, onClose, onSaved }: { disciplina?: Disciplina; onClose: () => void; onSaved: (d: Disciplina) => void }) {
  const [nome, setNome] = useState(disciplina?.nome || '');
  const [sigla, setSigla] = useState(disciplina?.sigla || '');
  const [ativo, setAtivo] = useState(disciplina?.ativo ?? true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  async function gravar() {
    setErro(''); setSalvando(true);
    try {
      if (disciplina) { await api.put(`/cadastros/disciplinas/${disciplina.id}`, { nome, sigla, ativo }); onSaved({ ...disciplina, nome: nome.trim(), sigla: sigla.trim() || null, ativo }); }
      else onSaved(await api.post<Disciplina>('/cadastros/disciplinas', { nome, sigla }));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }
  return (
    <Modal title={disciplina ? 'Editar disciplina' : 'Nova disciplina'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={salvando} onClick={() => void gravar()}>{salvando ? 'Gravando…' : 'Gravar'}</button></>}>
      <Alert>{erro}</Alert>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
        <div className="field span-3"><label htmlFor="disc-nome">Nome da disciplina</label><input id="disc-nome" className="input" autoFocus maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div className="field"><label htmlFor="disc-sigla">Sigla (opcional)</label><input id="disc-sigla" className="input" maxLength={20} value={sigla} onChange={(e) => setSigla(e.target.value)} /></div>
        {disciplina && <div className="field span-4"><label className="switch"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativa (aparece nas listas de escolha)</label></div>}
      </form>
    </Modal>
  );
}

/** Escolha de disciplina(s) com "+ Nova disciplina": cadastra na hora e já seleciona, sem sair da tela. */
export default function DisciplinaSelect({ value, onChange, multiple, readOnly, podeCriar = true, rotulo = 'Disciplinas' }: {
  value: number[]; onChange: (v: number[] | ((anterior: number[]) => number[])) => void; multiple?: boolean; readOnly?: boolean; podeCriar?: boolean; rotulo?: string;
}) {
  const [lista, setLista] = useState<Disciplina[]>([]);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { api.get<Disciplina[]>('/cadastros/disciplinas').then(setLista).catch((e) => setErro(e.message)); }, []);
  const visiveis = lista.filter((d) => d.ativo || value.includes(d.id));
  const alternar = (id: number) => {
    if (readOnly) return;
    if (!multiple) return onChange([id]);
    onChange((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  return (
    <div role="group" aria-label={rotulo}>
      <Alert>{erro}</Alert>
      <div className="chips">
        {visiveis.map((d) => <button key={d.id} type="button" className="chip" aria-pressed={value.includes(d.id)} disabled={readOnly} onClick={() => alternar(d.id)}>{d.nome}</button>)}
        {visiveis.length === 0 && <span className="muted">Nenhuma disciplina cadastrada.</span>}
        {!readOnly && podeCriar && <button type="button" className="chip novo" onClick={() => setNovo(true)}>+ Nova disciplina</button>}
      </div>
      {novo && (
        <DisciplinaModal onClose={() => setNovo(false)} onSaved={(d) => { setLista((l) => [...l, d].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))); onChange(multiple ? (prev) => (prev.includes(d.id) ? prev : [...prev, d.id]) : [d.id]); setNovo(false); }} />
      )}
    </div>
  );
}
