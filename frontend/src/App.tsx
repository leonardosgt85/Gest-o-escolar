import ModuloHome from './pages/ModuloHome';
import { MENU } from './menu';
import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import NaoEncontrada from './pages/NaoEncontrada';
import Usuarios from './pages/gerencial/Usuarios';
import GruposPermissao from './pages/gerencial/GruposPermissao';
import GrupoForm from './pages/gerencial/GrupoForm';
import Habilitacoes from './pages/gerencial/Habilitacoes';
import Alunos from './pages/academico/Alunos';
import AlunoForm from './pages/academico/AlunoForm';
import Pessoas from './pages/academico/Pessoas';
import AlunoMatriculas from './pages/academico/AlunoMatriculas';
import Rematricula from './pages/portal/Rematricula';
import EmailConfig from './pages/gerencial/EmailConfig';
import Cadastros from './pages/gerencial/Cadastros';
import Disciplinas from './pages/gerencial/Disciplinas';
import Turmas from './pages/gerencial/Turmas';
import MatrizCurricular from './pages/gerencial/MatrizCurricular';
import Diario from './pages/academico/Diario';
import DiarioTurma from './pages/academico/DiarioTurma';
import Ajuda from './pages/Ajuda';
import AlunoItens from './pages/academico/AlunoItens';
import ItensCatalogo from './pages/gerencial/ItensCatalogo';
import ProfessorEscolha from './pages/ProfessorEscolha';
import Relatorios from './pages/academico/Relatorios';
import RelatorioDocumentos from './pages/academico/RelatorioDocumentos';
import AlunoRelatorio from './pages/academico/AlunoRelatorio';
import RelatorioDiarioMensal from './pages/academico/RelatorioDiarioMensal';
import MatriculaPagina from './pages/academico/MatriculaPagina';

function Protegido({ children }: { children: ReactElement }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="empty">Carregando…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

// Bloqueia a rota se o usuário não tem a permissão (o backend também valida).
function Exige({ perm, alt, min = 1, children }: { perm: string; alt?: string; min?: number; children: ReactElement }) {
  const { can } = useAuth();
  if (!can(perm, min) && !(alt && can(alt, min))) {
    return (
      <div className="alert error">
        Você não tem acesso a esta funcionalidade (módulo não habilitado ou permissão insuficiente).
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/rematricula/:token" element={<Rematricula />} />
      <Route element={<Protegido><Layout /></Protegido>}>
        <Route index element={<Home />} />
        {MENU.map((m) => <Route key={m.id} path={m.id} element={<ModuloHome />} />)}
        <Route path="academico" element={<Navigate to="/secretaria" replace />} />
        <Route path="gerencial" element={<Navigate to="/administracao" replace />} />

        <Route path="professor" element={<ProfessorEscolha />} />
        <Route path="ajuda" element={<Ajuda />} />
        <Route path="ajuda/:slug" element={<Ajuda />} />
        <Route path="academico/diario" element={<Exige perm="academico.diario"><Diario /></Exige>} />
        <Route path="academico/diario/:turmaId/:did" element={<Exige perm="academico.diario"><DiarioTurma /></Exige>} />
        <Route path="academico/relatorios" element={<Exige perm="academico.alunos" alt="academico.diario"><Relatorios /></Exige>} />
        <Route path="academico/relatorios/aluno" element={<Exige perm="academico.alunos"><AlunoRelatorio /></Exige>} />
        <Route path="academico/relatorios/diario-mensal" element={<Exige perm="academico.diario"><RelatorioDiarioMensal /></Exige>} />
        <Route path="academico/relatorios/documentos" element={<Exige perm="academico.alunos"><RelatorioDocumentos /></Exige>} />
        <Route path="academico/alunos" element={<Exige perm="academico.alunos"><Alunos /></Exige>} />
        <Route path="academico/alunos/novo" element={<Exige perm="academico.alunos.inclusao"><AlunoForm /></Exige>} />
        <Route path="academico/alunos/:id/itens" element={<Exige perm="academico.itens"><AlunoItens /></Exige>} />
        <Route path="academico/alunos/:id/matriculas" element={<Exige perm="academico.alunos"><AlunoMatriculas /></Exige>} />
        <Route path="academico/matriculas/:id" element={<Exige perm="academico.alunos"><MatriculaPagina /></Exige>} />
        <Route path="academico/alunos/:id" element={<Exige perm="academico.alunos"><AlunoForm /></Exige>} />
        <Route path="academico/pessoas" element={<Exige perm="academico.pessoas"><Pessoas /></Exige>} />

        <Route path="gerencial/usuarios" element={<Exige perm="gerencial.usuarios"><Usuarios /></Exige>} />
        <Route path="gerencial/grupos" element={<Exige perm="gerencial.grupos"><GruposPermissao /></Exige>} />
        <Route path="gerencial/grupos/novo" element={<Exige perm="gerencial.grupos" min={2}><GrupoForm /></Exige>} />
        <Route path="gerencial/grupos/:id" element={<Exige perm="gerencial.grupos"><GrupoForm /></Exige>} />
        <Route path="gerencial/habilitacoes" element={<Exige perm="gerencial.habilitacoes"><Habilitacoes /></Exige>} />

        <Route path="gerencial/cadastros" element={<Exige perm="gerencial.cadastros"><Cadastros /></Exige>} />
        <Route path="gerencial/cadastros/itens" element={<Exige perm="gerencial.cadastros"><ItensCatalogo /></Exige>} />
        <Route path="gerencial/cadastros/disciplinas" element={<Exige perm="gerencial.cadastros"><Disciplinas /></Exige>} />
        <Route path="gerencial/cadastros/turmas" element={<Exige perm="gerencial.cadastros"><Turmas /></Exige>} />
        <Route path="gerencial/cadastros/matriz" element={<Exige perm="gerencial.cadastros"><MatrizCurricular /></Exige>} />
        <Route path="gerencial/email" element={<Exige perm="gerencial.email"><EmailConfig /></Exige>} />

        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
