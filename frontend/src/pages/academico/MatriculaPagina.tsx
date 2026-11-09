import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api';
import { Alert, useFlash } from '../../components/ui';
import { emAndamento, type Estado } from '../../lib/matriculas';
import MatriculaFluxo from './MatriculaFluxo';
import MatriculaTimeline from './MatriculaTimeline';
import './matriculas.css';

// Matrícula em andamento → fluxo passo a passo; efetivada/encerrada → linha do tempo.
export default function MatriculaPagina() {
  const { id } = useParams();
  const [e, setE] = useState<Estado | null>(null);
  const [fluxo, setFluxo] = useState<boolean | null>(null);
  const flash = useFlash();

  const carregar = useCallback(() => api.get<Estado>(`/matriculas/${id}`).then((r) => { setE(r); setFluxo((f) => f ?? emAndamento(r.matricula.status)); }).catch(flash.erro), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFluxo(null); void carregar(); }, [carregar]);

  if (!e || fluxo === null) return flash.msg ? <Alert kind="error">{flash.msg.text}</Alert> : <div className="empty">Carregando…</div>;
  return fluxo
    ? <MatriculaFluxo e={e} setE={setE} onConcluir={() => setFluxo(false)} />
    : <MatriculaTimeline e={e} onContinuar={emAndamento(e.matricula.status) ? () => setFluxo(true) : undefined} />;
}
