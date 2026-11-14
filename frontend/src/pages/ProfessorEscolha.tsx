import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import Icon from '../components/Icon';

// Depois do login, o professor escolhe: lançar notas/frequência ou fazer outra coisa no sistema.
export default function ProfessorEscolha() {
  const { me } = useAuth();
  const nav = useNavigate();
  const ir = (para: string) => { sessionStorage.setItem('csm.prof.escolha', '1'); nav(para, { replace: true }); };
  return (
    <>
      <div className="page-title"><h1>Olá, {me?.nome.split(' ')[0]}</h1></div>
      <div className="card" style={{ maxWidth: 640 }}>
        <h2 className="rd-h">O que deseja fazer?</h2>
        <div className="rd-docs">
          <button type="button" className="rd-doc" autoFocus onClick={() => ir('/academico/diario')}>
            <Icon name="diario" size={24} /><b>Lançar frequência e notas</b><span>Diário de classe das suas turmas.</span>
          </button>
          <button type="button" className="rd-doc" onClick={() => ir('/')}>
            <Icon name="home" size={24} /><b>Fazer outra coisa</b><span>Ir para o início do sistema.</span>
          </button>
        </div>
      </div>
    </>
  );
}
