import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../../api';
import { Alert, Crumbs, useFlash } from '../../components/ui';

interface Linha { turma_id: number; serie: string; nome: string; turno: string; disciplina_id: number; disciplina: string; alunos: number; ultima_aula: string | null }
const dataBr = (v: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '—');

export default function Diario() {
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [lista, setLista] = useState<Linha[]>([]);
  const [filtro, setFiltro] = useState('');
  const [carregado, setCarregado] = useState(false);
  const flash = useFlash();
  useEffect(() => { setCarregado(false); api.get<Linha[]>(`/diario/minhas${qs({ ano })}`).then((l) => { setLista(l); setCarregado(true); }).catch(flash.erro); }, [ano]); // eslint-disable-line react-hooks/exhaustive-deps

  const turmas = useMemo(() => {
    const m = new Map<number, { chave: string; titulo: string; turno: string; alunos: number; itens: Linha[] }>();
    for (const l of lista) {
      if (filtro && !`${l.serie} ${l.nome} ${l.disciplina}`.toLowerCase().includes(filtro.toLowerCase())) continue;
      if (!m.has(l.turma_id)) m.set(l.turma_id, { chave: String(l.turma_id), titulo: `${l.serie} ${l.nome}`, turno: l.turno, alunos: l.alunos, itens: [] });
      m.get(l.turma_id)!.itens.push(l);
    }
    return [...m.values()];
  }, [lista, filtro]);

  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Diário de Classe' }]} />
          <h1>Diário de Classe</h1>
        </div>
      </div>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className="toolbar">
        <input className="input search" placeholder="Filtrar por turma ou disciplina…" aria-label="Filtrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <label className="switch">Ano <input className="input" style={{ width: 90, marginLeft: 6 }} type="number" value={ano} onChange={(e) => setAno(e.target.value)} /></label>
      </div>
      {carregado && turmas.length === 0 && <div className="card empty">Nenhuma turma/disciplina disponível para você em {ano}. {''}Verifique no cadastro do usuário as disciplinas que você leciona e se a disciplina está na matriz da série.</div>}
      {turmas.map((t) => (
        <div key={t.chave} className="card dia-turma">
          <h3 className="rd-h" style={{ marginBottom: 2 }}>{t.titulo} <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {t.turno} · {t.alunos} aluno(s)</span></h3>
          <div className="chips" style={{ marginTop: 10 }}>
            {t.itens.map((i) => (
              <Link key={i.disciplina_id} className="chip" to={`/academico/diario/${i.turma_id}/${i.disciplina_id}`} title={`Última chamada: ${dataBr(i.ultima_aula)}`}>{i.disciplina}</Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
