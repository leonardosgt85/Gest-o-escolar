import { fmtDataHora } from './utils';

export type Kind = 'ok' | 'warn' | 'info' | 'mute' | 'danger';

export interface MatriculaResumo {
  id: number; ano: number; tipo: string; status: string; passo: number; serie: string | null; turno: string | null;
  assinatura_modo: 'autentique' | 'manual'; efetivada_em: string | null;
}

export const EM_ANDAMENTO = ['pre_matricula', 'aguardando_documentos', 'aguardando_assinatura', 'aguardando_parcela'];
export const emAndamento = (status: string) => EM_ANDAMENTO.includes(status);

// Rótulo e cor da situação (matrícula efetivada vira "Em curso"/"Encerrada" conforme o ano).
export function situacao(m: { ano: number; status: string; passo?: number | null }): { label: string; kind: Kind } {
  const anoAtual = new Date().getFullYear();
  switch (m.status) {
    case 'ativa': return m.ano < anoAtual ? { label: 'Encerrada', kind: 'mute' } : m.ano === anoAtual ? { label: 'Em curso', kind: 'info' } : { label: 'Matriculado', kind: 'ok' };
    case 'nao_renovou': return { label: 'Não renovou', kind: 'mute' };
    case 'transferida': return { label: 'Transferida', kind: 'danger' };
    case 'cancelada': return { label: 'Cancelada', kind: 'danger' };
    case 'concluida': return { label: 'Concluída', kind: 'mute' };
    default: return { label: `Em andamento${m.passo ? ` · passo ${m.passo} de 5` : ''}`, kind: 'warn' };
  }
}

export const TIPOS: Record<string, string> = { nova: 'Nova', rematricula: 'Rematrícula', retorno: 'Retorno' };
export const CANAIS: { chave: 'email' | 'whatsapp' | 'sms'; label: string }[] = [
  { chave: 'email', label: 'E-mail' }, { chave: 'whatsapp', label: 'WhatsApp' }, { chave: 'sms', label: 'SMS' },
];
export const NOMES_DOC: Record<string, string> = { contrato: 'Contrato', termo1: 'Termo 1 — Grupo de WhatsApp', termo2: 'Termo 2 — Redes sociais' };
export const SERIES = ['Berçário', 'Maternal I', 'Maternal II', 'Pré I', 'Pré II', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série EM', '2ª série EM', '3ª série EM'];
export const ORIGENS = ['Link da rematrícula', 'Secretaria', 'Presencial'];
export const TURNOS = ['Manhã', 'Tarde', 'Integral'];
export const STATUS_ASSINATURA: Record<string, { label: string; kind: Kind }> = {
  enviado: { label: 'Enviado', kind: 'info' }, visualizado: { label: 'Visualizado', kind: 'warn' }, assinado: { label: 'Assinado', kind: 'ok' },
  recusado: { label: 'Recusado', kind: 'danger' }, cancelado: { label: 'Cancelado', kind: 'mute' },
};

export const brl = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const quando = (v?: string | null) => (v ? fmtDataHora(v) : '');

// Baixa um arquivo da API respeitando o cookie de sessão; devolve o cabeçalho X-Documentos-Info (se houver).
export async function baixar(url: string): Promise<{ info: { responsavel?: string; avisos?: string[] } }> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
  const info = JSON.parse(decodeURIComponent(res.headers.get('X-Documentos-Info') || '{}'));
  const nome = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = nome ? decodeURIComponent(nome) : 'arquivo';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { info };
}

export async function enviarPdf(url: string, arquivo: File) {
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/pdf' }, body: arquivo });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

/** Envia um arquivo (PDF ou imagem) como corpo bruto. Usado pela secretaria e pelo portal da família. */
export async function enviarArquivo(url: string, arquivo: File) {
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 10 MB).');
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': arquivo.type || 'application/octet-stream' }, body: arquivo });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

export interface Estado {
  matricula: {
    id: number; aluno_id: number; ano: number; tipo: string; status: string; passo: number; passo_max: number; serie: string | null; turno: string | null;
    origem: string | null; responsavel_chave: string | null; parcelas: number | null; dia_vencimento: number | null; valor_parcela: number | null;
    desconto_percentual: number; desconto_motivo: string | null; assinatura_modo: 'autentique' | 'manual'; canal: 'email' | 'whatsapp' | 'sms' | null;
    conferido_em: string | null; parcela1_confirmada_em: string | null; efetivada_em: string | null;
  };
  aluno: { id: number; nome: string; nascimento: string; liberado: boolean };
  letivo: { ano: number; abertura: string | null; encerramento: string | null; divulgacao_valores: string | null };
  precos: { serie: string; turno: string; valor_parcela: number }[];
  turmas_disponiveis: { serie: string; turno: string }[];
  contatos: { emails: { valor: string; rotulo: string; nome: string }[]; celulares: { e164: string; valor: string; rotulo: string; nome: string }[] };
  opcoes: { chave: string; chaves: string[]; rotulo: string; nome: string; cpf: string | null; email: string | null; celular: string | null }[];
  docs_aluno: { chave: string; rotulo: string; ok: boolean; arquivo: { id: number; nome: string; mime: string; enviado_em: string } | null }[];
  exige_upload: boolean;
  portal: { ativo: boolean; expira_em: string | null; enviado_em: string | null; enviado_para: string | null; acesso_em: string | null; dados_confirmados_em: string | null };
  documentos: { id: number; chave: string; versao: string; nome: string; arquivo: string; sha256: string; created_at: string }[];
  assinaturas: { id: number; chave: string; status: string; provedor: string; canal: string | null; link: string | null; enviado_em: string | null; visualizado_em: string | null; assinado_em: string | null; signatario_nome: string | null; signatario_contato: string | null }[];
  anexos: Record<string, { id: number; arquivo: string } | null>;
  eventos: { id: number; tipo: string; titulo: string; detalhe: string | null; ocorrido_em: string; usuario: string | null; documentos: { id: number; nome: string; versao: string }[] }[];
  checks: { assinado: boolean; enviado: boolean; manual_anexado: boolean; manual_conferido: boolean; docs_entregues: number; docs_total: number; parcela: boolean; pode_efetivar: boolean };
  driver: 'autentique' | 'simulado';
}

export const valorFinal = (m: { valor_parcela: number | null; desconto_percentual: number }) =>
  m.valor_parcela == null ? null : Math.round(Number(m.valor_parcela) * (1 - Number(m.desconto_percentual || 0) / 100) * 100) / 100;
