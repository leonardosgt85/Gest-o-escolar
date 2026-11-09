import { useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import { Modal } from './ui';

export const DICA_GERAR = 'Gerar documentos para assinatura manual';

interface Opcao { chave: string; rotulo: string; nome: string; cpf: string | null }

// Baixa o .zip com os termos e o contrato preenchidos com os dados do aluno e do responsável.
// Se o aluno tem mais de um responsável vinculado, pergunta quem vai assinar (padrão: o responsável financeiro).
export default function GerarDocumentos({ alunoId, compacto, onOk, onErro }: {
  alunoId: number;
  compacto?: boolean; // ícone (para a grid) em vez do botão com texto
  onOk: (texto: string) => void;
  onErro: (e: unknown) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [escolha, setEscolha] = useState<{ opcoes: Opcao[]; sel: string } | null>(null);

  async function baixar(responsavel?: string) {
    setOcupado(true);
    try {
      const q = responsavel ? `?responsavel=${encodeURIComponent(responsavel)}` : '';
      const res = await fetch(`/api/alunos/${alunoId}/documentos${q}`, { credentials: 'include' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      const info = JSON.parse(decodeURIComponent(res.headers.get('X-Documentos-Info') || '{}'));
      const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'documentos.zip';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      const avisos: string[] = info.avisos || [];
      onOk(
        `Documentos gerados${info.responsavel ? ` para assinatura de ${info.responsavel}` : ''}. ` +
          'Turma, série/turno, valores da anuidade e testemunhas ficam em branco para preencher à mão.' +
          (avisos.length ? ` Atenção: ${avisos.join(' ')}` : ''),
      );
    } catch (e) {
      onErro(e);
    } finally {
      setOcupado(false);
    }
  }

  async function iniciar() {
    if (ocupado) return;
    try {
      const r = await api.get<{ opcoes: Opcao[]; padrao: string | null }>(`/alunos/${alunoId}/documentos/responsaveis`);
      if (r.opcoes.length > 1) setEscolha({ opcoes: r.opcoes, sel: r.padrao || r.opcoes[0].chave });
      else await baixar(r.padrao || undefined);
    } catch (e) {
      onErro(e);
    }
  }

  return (
    <>
      {compacto ? (
        <button className="icon-btn icon-btn-sm" title={DICA_GERAR} aria-label={`${DICA_GERAR}: aluno ${alunoId}`} disabled={ocupado} onClick={(e) => { e.stopPropagation(); void iniciar(); }}>
          <Icon name="fileDown" size={18} />
        </button>
      ) : (
        <button className="btn" title={DICA_GERAR} aria-label={DICA_GERAR} disabled={ocupado} onClick={() => void iniciar()}>
          <Icon name="fileDown" size={16} /> {ocupado ? 'Gerando…' : 'Gerar'}
        </button>
      )}
      {escolha && (
        <Modal
          title="Quem assina os documentos?"
          onClose={() => setEscolha(null)}
          footer={<>
            <button className="btn" onClick={() => setEscolha(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => { const c = escolha.sel; setEscolha(null); void baixar(c); }}>Gerar documentos</button>
          </>}
        >
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>O aluno tem mais de um responsável cadastrado. Escolha quem consta como responsável nos termos e como contratante no contrato.</p>
          <div className="radio-list">
            {escolha.opcoes.map((o) => (
              <label key={o.chave} className={`radio-item${escolha.sel === o.chave ? ' on' : ''}`}>
                <input type="radio" name="resp-doc" checked={escolha.sel === o.chave} onChange={() => setEscolha({ ...escolha, sel: o.chave })} />
                <span><b>{o.nome}</b><small>{o.rotulo}{o.cpf ? ` · CPF ${o.cpf}` : ' · sem CPF cadastrado'}</small></span>
              </label>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
