import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useAuth } from '../../auth';
import { Crumbs } from '../../components/ui';

// Hub dos relatórios acadêmicos: um card por relatório. Novos relatórios entram nesta lista.
const RELATORIOS = [
  { to: '/academico/relatorios/documentos', titulo: 'Documentos do aluno', descricao: 'Documentos gerados automaticamente com os dados de cada aluno, a partir de modelos da escola.', icone: 'fileDown' as const, perm: 'academico.alunos' },
  { to: '/academico/relatorios/diario-mensal', titulo: 'Diário de classe mensal', descricao: 'Chamada do mês, notas do bimestre e conteúdo ministrado, por turma e disciplina, em PDF para imprimir.', icone: 'diario' as const, perm: 'academico.diario' },
];

export default function Relatorios() {
  const { can } = useAuth();
  return (
    <>
      <div className="page-title">
        <div>
          <Crumbs items={[{ label: 'Secretaria', to: '/secretaria' }, { label: 'Relatórios' }]} />
          <h1>Relatórios</h1>
        </div>
      </div>
      <div className="module-cards">
        {RELATORIOS.filter((r) => can(r.perm, 1)).map((r) => (
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
