import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Alert, Crumbs, useFlash } from '../../components/ui';

interface Prov { chave: string; nome: string; gratis: string; host: string; port: number; secure: boolean; passos: string[] }
interface Cfg { configurado: boolean; provedor: string; host: string; port: number; secure: boolean; user: string; senha_definida: boolean; remetente_nome: string; remetente_email: string; provedores: Prov[] }

export default function EmailConfig() {
  const { can } = useAuth();
  const editar = can('gerencial.email', 2);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [f, setF] = useState({ provedor: 'brevo', host: '', port: 587, secure: false, user: '', senha: '', remetente_nome: '', remetente_email: '' });
  const [teste, setTeste] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const flash = useFlash();

  function aplicar(c: Cfg) {
    setCfg(c);
    setF({ provedor: c.provedor, host: c.host, port: c.port, secure: c.secure, user: c.user, senha: '', remetente_nome: c.remetente_nome, remetente_email: c.remetente_email });
  }
  useEffect(() => { api.get<Cfg>('/configuracoes/email').then(aplicar).catch(flash.erro); /* eslint-disable-next-line */ }, []);

  if (!cfg) return <div className="empty">Carregando…</div>;
  const prov = cfg.provedores.find((p) => p.chave === f.provedor);

  function escolher(p: Prov) {
    setF({ ...f, provedor: p.chave, host: p.host || f.host, port: p.port, secure: p.secure });
  }
  async function run(fn: () => Promise<void>, ok: string) {
    setOcupado(true); flash.clear();
    try { await fn(); flash.ok(ok); } catch (e) { flash.erro(e); } finally { setOcupado(false); }
  }

  return (
    <>
      <Crumbs items={[{ label: 'Gerencial', to: '/gerencial' }, { label: 'E-mail' }]} />
      <h1 className="page-title">Envio de e-mail</h1>
      {flash.msg && <Alert kind={flash.msg.kind} onClose={flash.clear}>{flash.msg.text}</Alert>}
      <div className={`alert ${cfg.configurado ? 'ok' : 'info'}`}>{cfg.configurado ? 'E-mail configurado.' : 'E-mail ainda não configurado. Escolha um provedor abaixo.'}</div>

      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <div className="f-lbl">1. Escolha o provedor</div>
        <div className="stack" style={{ gap: 8 }}>
          {cfg.provedores.map((p) => (
            <button key={p.chave} type="button" className={`opt${f.provedor === p.chave ? ' on' : ''}`} disabled={!editar} onClick={() => escolher(p)}>
              <span style={{ flex: 1, textAlign: 'left' }}><b>{p.nome}</b>{p.gratis && <small style={{ display: 'block', color: 'var(--muted)' }}>{p.gratis}</small>}</span>
            </button>
          ))}
        </div>
        {prov && <ol style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 13, color: 'var(--muted)' }}>{prov.passos.map((s) => <li key={s}>{s}</li>)}</ol>}
      </div>

      <div className="card" style={{ padding: 16, marginTop: 12 }}>
        <div className="f-lbl">2. Dados de acesso</div>
        <div className="f-grid">
          <label>Servidor (host)<input className="f-input" value={f.host} disabled={!editar} onChange={(e) => setF({ ...f, host: e.target.value })} /></label>
          <label>Porta<input className="f-input" type="number" value={f.port} disabled={!editar} onChange={(e) => setF({ ...f, port: Number(e.target.value) })} /></label>
          <label>Usuário<input className="f-input" value={f.user} disabled={!editar} autoComplete="off" onChange={(e) => setF({ ...f, user: e.target.value })} /></label>
          <label>Senha / chave{cfg.senha_definida && ' (deixe em branco para manter)'}<input className="f-input" type="password" value={f.senha} disabled={!editar} autoComplete="new-password" onChange={(e) => setF({ ...f, senha: e.target.value })} /></label>
          <label>Nome do remetente<input className="f-input" value={f.remetente_nome} disabled={!editar} placeholder="Colégio São Mateus" onChange={(e) => setF({ ...f, remetente_nome: e.target.value })} /></label>
          <label>E-mail do remetente<input className="f-input" type="email" value={f.remetente_email} disabled={!editar} onChange={(e) => setF({ ...f, remetente_email: e.target.value })} /></label>
        </div>
        <label style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 13 }}><input type="checkbox" checked={f.secure} disabled={!editar} onChange={(e) => setF({ ...f, secure: e.target.checked })} /> Conexão segura direta (SSL, porta 465)</label>
        {editar && <div style={{ marginTop: 12 }}><button className="btn btn-accent" disabled={ocupado} onClick={() => void run(async () => aplicar(await api.put<Cfg>('/configuracoes/email', f)), 'Configuração salva.')}>Salvar</button></div>}
      </div>

      {editar && cfg.configurado && (
        <div className="card" style={{ padding: 16, marginTop: 12 }}>
          <div className="f-lbl">3. Enviar e-mail de teste</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="f-input" style={{ flex: 1, minWidth: 220 }} type="email" placeholder="seu@email.com" value={teste} onChange={(e) => setTeste(e.target.value)} />
            <button className="btn" disabled={ocupado || !teste} onClick={() => void run(async () => { await api.post('/configuracoes/email/testar', { para: teste }); }, `E-mail de teste enviado para ${teste}.`)}>Enviar teste</button>
          </div>
        </div>
      )}
    </>
  );
}
