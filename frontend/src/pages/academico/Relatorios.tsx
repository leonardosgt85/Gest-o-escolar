import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { Crumbs } from '../../components/ui';

// Hub dos relatórios acadêmicos: um card por relatório. Novos relatórios entram nesta lista.
const RELATORIOS = [
  { to: '/academico/relatorios/documentos', titulo: 'Documentos do aluno', descricao: 'Documentos gerados automaticamente com os dados de cada aluno, a partir de modelos da escola.', icone: 'fileDown' as const },
];

export default function Relatorios() {
  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Gestão Acadêmica', to: '/academico' }, { label: 'Relatórios' }]} />
          <h1>Relatórios</h1>
        </div>
      </div>
      <div className="module-cards">
        {RELATORIOS.map((r) => (
          <Link key={r.to} to={r.to} className="module-card">
            <span className="module-card-icon"><Icon name={r.icone} size={22} /></span>
            <h3>{r.titulo}</h3>
            <p>{r.descricao}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
