import ModuloHome from './pages/ModuloHome';
import { MENU } from './menu';
import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Usuarios from './pages/gerencial/Usuarios';
import GruposPermissao from './pages/gerencial/GruposPermissao';
import GrupoForm from './pages/gerencial/GrupoForm';
import Habilitacoes from './pages/gerencial/Habilitacoes';
import Alunos from './pages/academico/Alunos';
import AlunoForm from './pages/academico/AlunoForm';
import Pessoas from './pages/academico/Pessoas';
import ValoresAno from './pages/academico/ValoresAno';
import AlunoMatriculas from './pages/academico/AlunoMatriculas';
import Rematricula from './pages/portal/Rematricula';
import EmailConfig from './pages/gerencial/EmailConfig';
import MatriculaPagina from './pages/academico/MatriculaPagina';

function Protegido({ children }: { children: ReactElement }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="empty">Carregando…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

// Bloqueia a rota se o usuário não tem a permissão (o backend também valida).
function Exige({ perm, min = 1, children }: { perm: string; min?: number; children: ReactElement }) {
  const { can } = useAuth();
  if (!can(perm, min)) {
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
        {MENU.map((m) => <Route key={m.modulo} path={m.modulo} element={<ModuloHome />} />)}

        <Route path="academico/alunos" element={<Exige perm="academico.alunos"><Alunos /></Exige>} />
        <Route path="academico/alunos/novo" element={<Exige perm="academico.alunos.inclusao"><AlunoForm /></Exige>} />
        <Route path="academico/alunos/:id/matriculas" element={<Exige perm="academico.alunos"><AlunoMatriculas /></Exige>} />
        <Route path="academico/matriculas/:id" element={<Exige perm="academico.alunos"><MatriculaPagina /></Exige>} />
        <Route path="academico/alunos/:id" element={<Exige perm="academico.alunos"><AlunoForm /></Exige>} />
        <Route path="academico/valores" element={<Exige perm="academico.valores"><ValoresAno /></Exige>} />
        <Route path="academico/pessoas" element={<Exige perm="academico.pessoas"><Pessoas /></Exige>} />

        <Route path="gerencial/usuarios" element={<Exige perm="gerencial.usuarios"><Usuarios /></Exige>} />
        <Route path="gerencial/grupos" element={<Exige perm="gerencial.grupos"><GruposPermissao /></Exige>} />
        <Route path="gerencial/grupos/novo" element={<Exige perm="gerencial.grupos" min={2}><GrupoForm /></Exige>} />
        <Route path="gerencial/grupos/:id" element={<Exige perm="gerencial.grupos"><GrupoForm /></Exige>} />
        <Route path="gerencial/habilitacoes" element={<Exige perm="gerencial.habilitacoes"><Habilitacoes /></Exige>} />

        <Route path="gerencial/email" element={<Exige perm="gerencial.email"><EmailConfig /></Exige>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
