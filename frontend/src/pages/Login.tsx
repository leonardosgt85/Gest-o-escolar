import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert } from '../components/ui';

export default function Login() {
  const { me, login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (me) return <Navigate to="/" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero" aria-hidden="true">
        <div className="login-logo">
          <img src="/logo-csm.jpg" alt="" />
        </div>
        <p className="login-eyebrow">Cuiabá · MT · Desde 1980</p>
        <h2 className="login-slogan">
          Cultivando valores,
          <span>formando gerações</span>
        </h2>
        <div className="login-pill">Tradição, acolhimento e educação</div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={enviar}>
          <div className="mobile-logo">
            <img src="/logo-csm.jpg" alt="Colégio São Mateus" />
          </div>
          <h1>Acesse o sistema</h1>
          <p className="lead">Entre com seu e-mail e senha para continuar.</p>
          <Alert>{erro}</Alert>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div className="pass-wrap">
              <input id="senha" className="input" type={mostrar ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button type="button" className="pass-toggle" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}>
                {mostrar ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <button className="btn btn-accent btn-login" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="lead" style={{ marginTop: 18, fontSize: 12 }}>Esqueceu a senha? Procure a secretaria ou o administrador do sistema.</p>
        </form>
        <div className="login-foot">Colégio São Mateus · Cuiabá – MT</div>
      </section>
    </div>
  );
}
