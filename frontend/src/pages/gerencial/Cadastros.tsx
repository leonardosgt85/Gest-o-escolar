import { Link } from 'react-router-dom';
import Icon, { type IconName } from '../../components/Icon';
import { Crumbs } from '../../components/ui';

const ITENS: { to: string; titulo: string; descricao: string; icone: IconName }[] = [
  { to: '/gerencial/cadastros/disciplinas', titulo: 'Disciplinas', descricao: 'Componentes curriculares da escola e os professores de cada um.', icone: 'cadastros' },
  { to: '/gerencial/cadastros/turmas', titulo: 'Turmas', descricao: 'Turmas por ano letivo, série e turno.', icone: 'grupos' },
  { to: '/gerencial/cadastros/matriz', titulo: 'Matriz curricular', descricao: 'Disciplinas de cada série, carga horária e dias da semana das aulas.', icone: 'diario' },
];

export default function Cadastros() {
  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Estrutura da escola' }]} />
          <h1>Cadastros</h1>
        </div>
      </div>
      <div className="module-cards">
        {ITENS.map((i) => (
          <Link key={i.to} to={i.to} className="module-card">
            <span className="module-card-icon"><Icon name={i.icone} size={22} /></span>
            <h3>{i.titulo}</h3>
            <p>{i.descricao}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
