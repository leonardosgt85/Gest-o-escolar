// Envio em massa dos links de rematrícula (e-mail) aos responsáveis dos alunos cadastrados.
// A prévia mostra quem recebe e quem fica de fora (com o motivo); o envio é feito em lotes pelo frontend.
import { db } from '../db.js';
import { precosDoAno } from './precosService.js';
import { HttpError } from '../util.js';
import { carregar, padrao, ROTULOS } from './documentosService.js';
import * as mat from './matriculasService.js';
import * as portal from './portalService.js';
import * as email from './emailService.js';

const ENCERRADAS = ['ativa', 'cancelada', 'transferida', 'concluida', 'nao_renovou'];

async function anoAlvo(ano) {
  const letivo = ano ? await db('anos_letivos').where({ ano }).first() : await db('anos_letivos').where({ ativo: true }).orderBy('ano', 'desc').first();
  if (!letivo) throw new HttpError(400, 'Nenhum ano letivo aberto. Cadastre/abra o ano letivo.');
  if (!letivo.ativo) throw new HttpError(409, `A matrícula de ${letivo.ano} não está aberta.`);
  return letivo;
}

// sugestão: mesma turma do ano anterior avança para a série seguinte; só vale se houver preço cadastrado
const SERIES = ['Berçário', 'Maternal I', 'Maternal II', 'Pré I', 'Pré II', '1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano', '1ª série EM', '2ª série EM', '3ª série EM'];
function sugerir(anterior, precos) {
  if (!anterior?.serie) return { serie: null, turno: anterior?.turno || null };
  const i = SERIES.findIndex((s) => s.toLowerCase() === anterior.serie.toLowerCase());
  const serie = i >= 0 && i < SERIES.length - 1 ? SERIES[i + 1] : null;
  const turno = anterior.turno;
  const ok = serie && turno && precos.some((p) => p.serie.toLowerCase() === serie.toLowerCase() && p.turno === turno);
  return { serie: ok ? serie : null, turno: turno || null };
}

export async function previa(anoReq, alunoId) {
  const letivo = await anoAlvo(anoReq);
  const ano = letivo.ano;
  const [alunos, precos, existentes, anteriores, cfg] = await Promise.all([
    db('alunos').whereNull('excluido_em').modify((q) => { if (alunoId) q.where({ id: alunoId }); }).orderBy('nome_completo').select('id', 'nome_completo', 'liberado_novas_matriculas'),
    precosDoAno(ano),
    db('matriculas').where({ ano }).select('aluno_id', 'id', 'status', 'tipo', 'serie', 'turno', 'portal_enviado_em', 'portal_enviado_para'),
    db('matriculas').where('ano', '<', ano).whereNot('status', 'nao_renovou').orderBy('ano', 'desc').select('aluno_id', 'ano', 'serie', 'turno'),
    email.configurado(),
  ]);
  const exPor = new Map(existentes.map((x) => [x.aluno_id, x]));
  const antPor = new Map();
  for (const a of anteriores) if (!antPor.has(a.aluno_id)) antPor.set(a.aluno_id, a);

  const linhas = [];
  for (const al of alunos) {
    const ex = exPor.get(al.id);
    const base = { aluno_id: al.id, nome: al.nome_completo };
    if (ex && ENCERRADAS.includes(ex.status)) { linhas.push({ ...base, situacao: 'fora', motivo: ex.status === 'ativa' ? 'Rematrícula já concluída' : ex.status === 'nao_renovou' ? 'Família informou que não vai renovar' : 'Matrícula encerrada' }); continue; }
    if (al.liberado_novas_matriculas === 'Não') { linhas.push({ ...base, situacao: 'fora', motivo: 'Bloqueado para novas matrículas' }); continue; }

    const { aluno, responsaveis } = await carregar(al.id);
    const chave = padrao(aluno, responsaveis);
    const resp = chave ? responsaveis[chave] : null;
    if (!resp) { linhas.push({ ...base, situacao: 'fora', motivo: 'Sem responsável cadastrado' }); continue; }
    if (!resp.email) { linhas.push({ ...base, situacao: 'fora', motivo: `Sem e-mail do responsável (${resp.nome})` }); continue; }

    const ant = antPor.get(al.id);
    const sug = ex?.serie && ex?.turno ? { serie: ex.serie, turno: ex.turno } : sugerir(ant, precos);
    linhas.push({
      ...base, situacao: 'apto', responsavel: `${resp.nome} (${ROTULOS[chave]})`, email: resp.email,
      serie: sug.serie, turno: sug.turno, tem_matricula: !!ex, ja_enviado: ex?.portal_enviado_em || null,
    });
  }
  return {
    ano, email_configurado: cfg,
    series: [...new Set(precos.map((p) => p.serie))], precos: precos.map((p) => ({ serie: p.serie, turno: p.turno })),
    linhas,
  };
}

/** Envia um lote. itens: [{ aluno_id, serie, turno }]. Cada item é independente: erro de um não derruba os outros. */
export async function enviarLote(ano, itens, usuarioId) {
  const letivo = await anoAlvo(ano);
  if (!(await email.configurado())) throw new HttpError(409, 'O envio de e-mail ainda não foi configurado. Vá em Gerencial → E-mail.');
  if (!Array.isArray(itens) || itens.length === 0 || itens.length > 25) throw new HttpError(400, 'Lote inválido (1 a 25 alunos).');
  const resultados = [];
  for (const it of itens) {
    const alunoId = Number(it.aluno_id);
    try {
      const { aluno, responsaveis } = await carregar(alunoId);
      if (aluno.liberado_novas_matriculas === 'Não') throw new HttpError(409, 'Bloqueado para novas matrículas.');
      const chave = padrao(aluno, responsaveis);
      const destino = chave ? responsaveis[chave]?.email : null;
      if (!destino) throw new HttpError(400, 'Sem e-mail do responsável.');
      let m = await db('matriculas').where({ aluno_id: alunoId, ano: letivo.ano }).first();
      if (m && ENCERRADAS.includes(m.status)) throw new HttpError(409, 'Matrícula já encerrada.');
      if (!m) m = await mat.iniciar(alunoId, letivo.ano, usuarioId, undefined, 'rematricula'); // envio do link = rematrícula
      else if (m.tipo === 'nova') { await mat.atualizar(m.id, { tipo: 'rematricula' }, usuarioId); m.tipo = 'rematricula'; }
      if (it.serie && it.turno && (m.serie !== it.serie || m.turno !== it.turno)) await mat.atualizar(m.id, { serie: it.serie, turno: it.turno }, usuarioId);
      await portal.enviarLinkPorEmail(m.id, destino, usuarioId);
      resultados.push({ aluno_id: alunoId, ok: true, email: destino });
    } catch (e) {
      resultados.push({ aluno_id: alunoId, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}
