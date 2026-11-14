import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { Crumbs } from '../components/ui';
import { modulosVisiveis } from '../menu';
import EnvioRematriculas from '../components/EnvioRematriculas';

// Página inicial de um módulo (/<modulo>): um card por opção, mais as que ainda vão chegar.
export default function ModuloHome() {
  const { can, moduloAtivo } = useAuth();
  const { pathname } = useLocation();
  const [envio, setEnvio] = useState(false);
  const m = modulosVisiveis(moduloAtivo, can).find((x) => `/${x.id}` === pathname.replace(/\/$/, ''));
  if (!m) return <Navigate to="/" replace />;
  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Início', to: '/' }, { label: m.label }]} />
          <h1>{m.label}</h1>
        </div>
        {m.id === 'secretaria' && can('academico.alunos', 2) && (
          <button className="btn btn-sm" onClick={() => setEnvio(true)} title="Enviar por e-mail o link de rematrícula aos responsáveis"><Icon name="send" size={14} /> Enviar links de rematrícula</button>
        )}
      </div>
      <div className="module-cards">
        {m.items.map((i) => (
          <Link key={i.to} to={i.to} className="module-card">
            <span className="module-card-icon"><Icon name={i.icone} size={22} /></span>
            <h3>{i.label}</h3>
            <p>{i.descricao}</p>
          </Link>
        ))}
        {m.proximos.map((i) => (
          <div key={i.to} className="module-card soon" aria-disabled="true">
            <span className="module-card-icon"><Icon name={i.icone} size={22} /></span>
            <h3>{i.label} <span className="badge-soon">Em breve</span></h3>
            <p>{i.descricao}</p>
          </div>
        ))}
      </div>
      {envio && <EnvioRematriculas onClose={() => setEnvio(false)} />}
    </>
  );
}
