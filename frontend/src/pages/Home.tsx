import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import { modulosVisiveis } from '../menu';

export default function Home() {
  const { me, can, moduloAtivo } = useAuth();
  const modulos = modulosVisiveis(moduloAtivo, can);
  return (
    <>
      <div className="page-title">
        <h1>Olá, {me?.nome.split(' ')[0]}</h1>
      </div>
      {modulos.length === 0 && <div className="card empty">Você ainda não tem acesso a nenhum módulo. Fale com o administrador.</div>}
      <div className="module-cards">
        {modulos.map((m) => (
          <Link key={m.modulo} to={`/${m.modulo}`} className="module-card">
            <span className="module-card-icon"><Icon name={m.icone} size={22} /></span>
            <h3>{m.label}</h3>
            <p>{m.descricao}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
