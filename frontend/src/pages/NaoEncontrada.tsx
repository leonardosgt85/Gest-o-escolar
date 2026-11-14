import { Link } from 'react-router-dom';

export default function NaoEncontrada() {
  return (
    <>
      <div className="page-title"><h1>Página não encontrada</h1></div>
      <div className="card empty">
        O endereço acessado não existe ou foi alterado.<br />
        <Link className="btn btn-primary" style={{ marginTop: 14, display: 'inline-flex' }} to="/">Ir para o início</Link>
      </div>
    </>
  );
}
