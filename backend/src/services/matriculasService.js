// Regras da matrícula por ano letivo: passos, documentos, assinatura (Autentique ou manual) e efetivação.
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { db } from '../db.js';
import { HttpError, formatarCpf } from '../util.js';
import { carregar, gerarArquivos, padrao, ROTULOS, telefone, dadosColegio } from './documentosService.js';
import * as autentique from './autentique.js';

export const DOCS_ALUNO = [
  ['certidao', 'Certidão de nascimento'],
  ['historico', 'Histórico escolar / declaração de transferência'],
  ['residencia', 'Comprovante de residência'],
  ['foto', 'Foto 3x4 atualizada'],
];
export const CHAVES = ['contrato', 'termo1', 'termo2'];
const ABERTOS = ['enviado', 'visualizado', 'assinado']; // assinaturas "vivas"
const STATUS_POR_PASSO = ['pre_matricula', 'pre_matricula', 'aguardando_documentos', 'aguardando_assinatura', 'aguardando_parcela'];
export const CANAIS = ['email', 'whatsapp', 'sms'];
const CAMPOS_BLOQUEIAM = ['serie', 'turno', 'responsavel_chave', 'parcelas', 'dia_vencimento', 'valor_parcela', 'desconto_percentual'];

// Rematrícula/retorno: os documentos do aluno são confirmados por UPLOAD (não por clique). Matrícula nova mantém o clique.
export const exigeUpload = (m) => m.tipo !== 'nova';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const agora = () => new Date();

export async function evento(trx, matriculaId, tipo, titulo, detalhe, usuarioId) {
  await trx('matricula_eventos').insert({ matricula_id: matriculaId, tipo, titulo, detalhe: detalhe || null, usuario_id: usuarioId || null });
}

async function obter(id, trx = db) {
  const m = await trx('matriculas').where({ id }).first();
  if (!m) throw new HttpError(404, 'Matrícula não encontrada.');
  return m;
}

/* ---------- histórico do aluno ---------- */
export async function historicoDoAluno(alunoId) {
  const aluno = await db('alunos').where({ id: alunoId }).whereNull('excluido_em').first();
  if (!aluno) throw new HttpError(404, 'Aluno não encontrado.');
  const { responsaveis } = await carregar(alunoId);
  const financ = padrao(aluno, responsaveis);
  const itens = await db('matriculas').where({ aluno_id: alunoId }).orderBy('ano', 'desc');
  const anos = await db('anos_letivos').orderBy('ano', 'desc');
  const porAno = new Map(itens.map((m) => [m.ano, m]));
  const abertos = anos.filter((a) => a.ativo && !porAno.has(a.ano)).map((a) => ({ ano: a.ano, abertura: a.abertura, encerramento: a.encerramento, tipo: itens.some((m) => m.ano < a.ano && m.status !== 'nao_renovou') ? (itens.some((m) => m.ano === a.ano - 1 && m.status !== 'nao_renovou') ? 'rematricula' : 'retorno') : tipoSemAnterior(aluno, a) }));
  return {
    aluno: {
      id: aluno.id,
      nome: aluno.nome_completo,
      nascimento: aluno.data_nascimento,
      responsavel: financ ? responsaveis[financ]?.nome : null,
      liberado: aluno.liberado_novas_matriculas !== 'Não',
    },
    matriculas: itens.map((m) => ({
      id: m.id, ano: m.ano, tipo: m.tipo, status: m.status, passo: m.passo, serie: m.serie, turno: m.turno,
      assinatura_modo: m.assinatura_modo, efetivada_em: m.efetivada_em,
    })),
    abertos,
    anos: anos.filter((a) => a.ativo).map((a) => ({ ano: a.ano, abertura: a.abertura, encerramento: a.encerramento, divulgacao_valores: a.divulgacao_valores })),
  };
}

// Sem matrícula anterior: aluno cadastrado depois da abertura do ano é "nova"; os já existentes (importados) são "rematrícula".
export const TIPOS_MATRICULA = ['nova', 'rematricula', 'retorno'];
export function tipoSemAnterior(aluno, letivo) {
  const cad = aluno.created_at ? new Date(aluno.created_at) : null;
  const ab = letivo?.abertura ? new Date(letivo.abertura) : null;
  return cad && ab && cad >= ab ? 'nova' : 'rematricula';
}

export async function iniciar(alunoId, ano, usuarioId, statusInicial, tipoEscolhido) {
  const letivo = await db('anos_letivos').where({ ano }).first();
  if (!letivo) throw new HttpError(400, 'Ano letivo não cadastrado.');
  if (!letivo.ativo && statusInicial !== 'nao_renovou') throw new HttpError(409, `A matrícula de ${ano} não está aberta.`);
  const { aluno, responsaveis } = await carregar(alunoId);
  const existente = await db('matriculas').where({ aluno_id: alunoId, ano }).first();
  if (existente) throw new HttpError(409, `O aluno já tem matrícula em ${ano}.`);
  const anterior = await db('matriculas').where({ aluno_id: alunoId }).where('ano', '<', ano).whereNotIn('status', ['nao_renovou']).orderBy('ano', 'desc').first();
  const sugerido = !anterior ? tipoSemAnterior(aluno, letivo) : anterior.ano === ano - 1 ? 'rematricula' : 'retorno';
  const tipo = TIPOS_MATRICULA.includes(tipoEscolhido) ? tipoEscolhido : sugerido;
  const chave = padrao(aluno, responsaveis);
  return db.transaction(async (trx) => {
    const [m] = await trx('matriculas')
      .insert({
        aluno_id: alunoId, ano, tipo, status: statusInicial || 'pre_matricula',
        responsavel_chave: chave, responsavel_id: chave ? responsaveis[chave].id : null,
        parcelas: letivo.parcelas, dia_vencimento: letivo.dia_vencimento, valor_parcela: null,
        desconto_percentual: Number(aluno.desconto_percentual || 0), created_by: usuarioId,
      })
      .returning('*');
    await evento(trx, m.id, statusInicial === 'nao_renovou' ? 'nao_renovou' : 'iniciada', statusInicial === 'nao_renovou' ? 'Família informou que não vai renovar' : `${tipo === 'nova' ? 'Matrícula' : 'Rematrícula'} ${ano} iniciada`, null, usuarioId);
    return m;
  });
}

/** Exclui uma matrícula que começou e não terminou (nada de efetivada/encerrada nem com documento já assinado). */
export async function excluir(id, usuarioId) {
  const m = await obter(id);
  if (!['pre_matricula', 'aguardando_documentos', 'aguardando_assinatura', 'aguardando_parcela'].includes(m.status)) {
    throw new HttpError(409, 'Só é possível excluir matrícula em andamento (não efetivada).');
  }
  const assin = await db('assinaturas').where({ matricula_id: id }).whereIn('status', ABERTOS);
  if (assin.some((a) => a.status === 'assinado')) throw new HttpError(409, 'Há documento já assinado nesta matrícula; ela não pode ser excluída.');
  if (assin.length) throw new HttpError(409, 'Os documentos já foram enviados para assinatura. Cancele o envio antes de excluir a matrícula.');
  await db('matriculas').where({ id }).del(); // eventos, documentos e assinaturas saem em cascata
  console.log(`[matricula] ${id} (aluno ${m.aluno_id}, ${m.ano}, ${m.status}) excluída pelo usuário ${usuarioId}`);
}

export async function reabrir(matriculaId, usuarioId) {
  const m = await obter(matriculaId);
  if (m.status !== 'nao_renovou') throw new HttpError(409, 'Só é possível reabrir matrículas marcadas como "não renovou".');
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id: m.id }).update({ status: 'pre_matricula', updated_at: agora() });
    await evento(trx, m.id, 'reaberta', 'Matrícula reaberta', null, usuarioId);
  });
}

/* ---------- estado completo (fluxo + linha do tempo) ---------- */
function resumoAssinaturas(linhas) {
  const ultima = new Map();
  for (const l of linhas) ultima.set(l.chave, l); // ordenado por id: fica a mais recente de cada documento
  return CHAVES.map((c) => ultima.get(c)).filter(Boolean);
}

export async function estado(id) {
  const m = await obter(id);
  const [aluno, letivo, docs, assin, evs] = await Promise.all([
    db('alunos').where({ id: m.aluno_id }).first(),
    db('anos_letivos').where({ ano: m.ano }).first(),
    db('matricula_documentos').where({ matricula_id: id }).select('id', 'chave', 'versao', 'nome', 'arquivo', 'mime', 'sha256', 'created_at').orderBy('id'),
    db('assinaturas').where({ matricula_id: id }).orderBy('id'),
    db('matricula_eventos as e').leftJoin('usuarios as u', 'u.id', 'e.usuario_id').where('e.matricula_id', id).orderBy([{ column: 'e.ocorrido_em' }, { column: 'e.id' }]).select('e.*', 'u.nome_completo as usuario'),
  ]);
  const { responsaveis } = await carregar(m.aluno_id);
  const opcoes = Object.entries(responsaveis).filter(([, p]) => p).map(([chave, p]) => ({
    chave, rotulo: ROTULOS[chave], nome: p.nome, cpf: formatarCpf(p.cpf), email: p.email || null, celular: telefone(p) || null,
  }));

  // contatos do cadastro (aluno + responsáveis) para escolher o destino do link
  const emails = []; const celulares = [];
  const addE = (valor, rotulo, nome) => { const v = (valor || '').trim(); if (v && !emails.some((x) => x.valor.toLowerCase() === v.toLowerCase())) emails.push({ valor: v, rotulo, nome }); };
  const addC = (ddd, num, rotulo, nome) => { const e164 = autentique.telefoneE164(ddd, num); if (e164 && !celulares.some((x) => x.e164 === e164)) celulares.push({ e164, valor: telefone({ ddd, celular: num }), rotulo, nome }); };
  for (const o of opcoes) addE(o.email, o.rotulo, o.nome);
  addE(aluno.email, 'Aluno', aluno.nome_completo);
  for (const [chave, p] of Object.entries(responsaveis)) if (p) addC(p.ddd, p.celular || p.telefone, ROTULOS[chave], p.nome);
  addC(aluno.ddd, aluno.celular || aluno.telefone, 'Aluno', aluno.nome_completo);

  const vivas = assin.filter((a) => ABERTOS.includes(a.status) && a.provedor !== 'manual');
  const atuais = resumoAssinaturas(assin.filter((a) => (m.assinatura_modo === 'manual') === (a.provedor === 'manual')));
  const autentiqueCompleto = CHAVES.every((c) => assin.filter((a) => a.chave === c && a.provedor !== 'manual').some((a) => a.status === 'assinado'));
  const anexos = Object.fromEntries(CHAVES.map((c) => [c, docs.filter((d) => d.chave === c && d.versao === 'assinado_manual').pop() || null]));
  const manualAnexado = CHAVES.every((c) => anexos[c]);
  const manualCompleto = manualAnexado && !!m.conferido_em;
  const assinado = m.assinatura_modo === 'manual' ? manualCompleto : autentiqueCompleto;
  const upload = exigeUpload(m);
  const anexosAluno = Object.fromEntries(DOCS_ALUNO.map(([k]) => [k, docs.filter((d) => d.chave === k && d.versao === 'anexo').pop() || null]));
  const okDoc = (k) => (upload ? !!anexosAluno[k] : !!m.docs_entregues?.[k]);
  const entregues = DOCS_ALUNO.filter(([k]) => okDoc(k)).length;
  const efetivada = m.status === 'ativa';

  // documentos associados a cada tipo de evento (para os links da linha do tempo)
  const docsDoEvento = (tipo) => {
    const vers = { documentos_gerados: ['gerado'], assinatura_enviada: ['enviado'], assinatura_concluida: ['assinado_autentique'], assinatura_manual_conferida: ['assinado_manual'] }[tipo];
    return vers ? docs.filter((d) => vers.includes(d.versao)).map((d) => ({ id: d.id, nome: d.nome, versao: d.versao })) : [];
  };

  return {
    matricula: (({ portal_token_hash: _h, portal_token_enc: _e, ...resto }) => ({ ...resto, desconto_percentual: Number(resto.desconto_percentual) }))(m),
    exige_upload: upload,
    portal: {
      ativo: !!m.portal_token_hash && (!m.portal_expira_em || new Date(m.portal_expira_em) > new Date()),
      expira_em: m.portal_expira_em, enviado_em: m.portal_enviado_em, enviado_para: m.portal_enviado_para,
      acesso_em: m.portal_acesso_em, dados_confirmados_em: m.dados_confirmados_em,
    },
    aluno: { id: aluno.id, nome: aluno.nome_completo, nascimento: aluno.data_nascimento, liberado: aluno.liberado_novas_matriculas !== 'Não' },
    letivo,
    precos: await db('precos_serie').where({ ano: m.ano }).select('serie', 'turno', 'valor_parcela').orderBy(['serie', 'turno']),
    opcoes,
    contatos: { emails, celulares },
    docs_aluno: DOCS_ALUNO.map(([chave, rotulo]) => ({ chave, rotulo, ok: okDoc(chave), arquivo: anexosAluno[chave] ? { id: anexosAluno[chave].id, nome: anexosAluno[chave].arquivo, mime: anexosAluno[chave].mime, enviado_em: anexosAluno[chave].created_at } : null })),
    documentos: docs,
    assinaturas: atuais.map((a) => ({
      id: a.id, chave: a.chave, status: a.status, provedor: a.provedor, canal: a.canal, link: a.link,
      enviado_em: a.enviado_em, visualizado_em: a.visualizado_em, assinado_em: a.assinado_em,
      signatario_nome: a.signatario_nome, signatario_contato: a.signatario_contato,
    })),
    anexos: Object.fromEntries(CHAVES.map((c) => [c, anexos[c] ? { id: anexos[c].id, arquivo: anexos[c].arquivo } : null])),
    eventos: evs.map((e) => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, detalhe: e.detalhe, ocorrido_em: e.ocorrido_em, usuario: e.usuario, documentos: docsDoEvento(e.tipo) })),
    checks: {
      assinado, enviado: vivas.length > 0, manual_anexado: manualAnexado, manual_conferido: !!m.conferido_em,
      docs_entregues: entregues, docs_total: DOCS_ALUNO.length, parcela: !!m.parcela1_confirmada_em,
      pode_efetivar: !efetivada && assinado && entregues === DOCS_ALUNO.length && !!m.parcela1_confirmada_em,
    },
    driver: autentique.modo(),
  };
}

/* ---------- valores por série e turno ---------- */
async function precoDe(ano, serie, turno) {
  const p = await db('precos_serie').where({ ano, turno }).whereRaw('lower(serie) = lower(?)', [serie]).first();
  return p ? Number(p.valor_parcela) : null;
}
export async function listarPrecos(ano) {
  const letivo = await db('anos_letivos').where({ ano }).first();
  if (!letivo) throw new HttpError(404, 'Ano letivo não encontrado.');
  const itens = await db('precos_serie').where({ ano }).orderBy(['serie', 'turno']);
  return { letivo, itens: itens.map((i) => ({ ...i, valor_parcela: Number(i.valor_parcela) })), anos: (await db('anos_letivos').orderBy('ano', 'desc')).map((a) => a.ano) };
}
export async function salvarPreco(ano, { serie, turno, valor_parcela }, { criar = false } = {}) {
  const s = String(serie || '').trim();
  const v = Number(String(valor_parcela).replace(',', '.'));
  if (!s) throw new HttpError(400, 'Informe a série.');
  if (!['Manhã', 'Tarde', 'Integral'].includes(turno)) throw new HttpError(400, 'Turno inválido.');
  if (!(v > 0)) throw new HttpError(400, 'Informe um valor de parcela maior que zero.');
  const ja = await db('precos_serie').where({ ano, turno }).whereRaw('lower(serie) = lower(?)', [s]).first();
  if (ja && criar) throw new HttpError(409, `Já existe valor para ${ja.serie} (${turno}) em ${ano}: R$ ${Number(ja.valor_parcela).toFixed(2).replace('.', ',')}. Edite o valor na própria linha.`);
  if (ja) await db('precos_serie').where({ id: ja.id }).update({ valor_parcela: Math.round(v * 100) / 100, updated_at: agora() });
  else await db('precos_serie').insert({ ano, serie: s, turno, valor_parcela: Math.round(v * 100) / 100 });
}
export async function copiarPrecos(de, para, reajuste) {
  if (!de || de === para) throw new HttpError(400, 'Escolha outro ano de origem.');
  const origem = await db('precos_serie').where({ ano: de });
  if (!origem.length) throw new HttpError(409, `O ano ${de} não tem valores cadastrados.`);
  const f = 1 + (Number(reajuste) || 0) / 100;
  for (const o of origem) await salvarPreco(para, { serie: o.serie, turno: o.turno, valor_parcela: Math.round(Number(o.valor_parcela) * f * 100) / 100 });
}

/* ---------- edição dos dados ---------- */
export async function atualizar(id, body, usuarioId) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada: os dados não podem mais ser alterados.');
  if (m.status === 'nao_renovou') throw new HttpError(409, 'Reabra a matrícula antes de editar.');
  const up = {};
  const txtv = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
  if ('serie' in body) up.serie = txtv(body.serie);
  if ('turno' in body) {
    if (body.turno && !['Manhã', 'Tarde', 'Integral'].includes(body.turno)) throw new HttpError(400, 'Turno inválido.');
    up.turno = txtv(body.turno);
  }
  if ('tipo' in body) {
    if (!TIPOS_MATRICULA.includes(body.tipo)) throw new HttpError(400, 'Tipo de matrícula inválido.');
    if (body.tipo !== m.tipo) {
      const rotulo = { nova: 'Nova', rematricula: 'Rematrícula', retorno: 'Retorno' };
      up.tipo = body.tipo;
      await evento(db, id, 'tipo_alterado', 'Tipo da matrícula alterado', `${rotulo[m.tipo]} → ${rotulo[body.tipo]}`, usuarioId);
    }
  }
  if ('origem' in body) up.origem = txtv(body.origem);
  if ('parcelas' in body) {
    const n = Number(body.parcelas);
    if (!Number.isInteger(n) || n < 1 || n > 24) throw new HttpError(400, 'Parcelas deve ser um número entre 1 e 24.');
    up.parcelas = n;
  }
  if ('dia_vencimento' in body) {
    const n = Number(body.dia_vencimento);
    if (!Number.isInteger(n) || n < 1 || n > 28) throw new HttpError(400, 'Dia de vencimento deve ficar entre 1 e 28.');
    up.dia_vencimento = n;
  }
  if ('desconto_motivo' in body) up.desconto_motivo = txtv(body.desconto_motivo)?.slice(0, 160) || null;
  if ('desconto_percentual' in body) {
    const n = Number(body.desconto_percentual);
    if (Number.isNaN(n) || n < 0 || n > 100) throw new HttpError(400, 'O desconto deve estar entre 0 e 100%.');
    up.desconto_percentual = n;
  }
  if ('docs_entregues' in body) {
    if (exigeUpload(m)) throw new HttpError(409, 'Na rematrícula os documentos do aluno são confirmados por envio do arquivo (upload).');
    const d = {};
    for (const [k] of DOCS_ALUNO) d[k] = !!body.docs_entregues?.[k];
    up.docs_entregues = JSON.stringify(d);
  }
  if ('responsavel_chave' in body) {
    const { responsaveis } = await carregar(m.aluno_id);
    const p = responsaveis[body.responsavel_chave];
    if (!p) throw new HttpError(400, 'Responsável inválido para este aluno.');
    up.responsavel_chave = body.responsavel_chave;
    up.responsavel_id = p.id;
  }
  if ('assinatura_modo' in body) {
    if (!['autentique', 'manual'].includes(body.assinatura_modo)) throw new HttpError(400, 'Modo de assinatura inválido.');
    up.assinatura_modo = body.assinatura_modo;
  }
  if ('canal' in body) {
    if (body.canal && !CANAIS.includes(body.canal)) throw new HttpError(400, 'Canal inválido.');
    up.canal = body.canal || null;
  }
  if ('passo' in body) {
    const n = Number(body.passo);
    if (!Number.isInteger(n) || n < 1 || n > Math.min(5, m.passo_max)) throw new HttpError(400, 'Passo indisponível.');
    up.passo = n;
  }
  if (CAMPOS_BLOQUEIAM.some((c) => c in up)) {
    const vivo = await db('assinaturas').where({ matricula_id: id }).whereIn('status', ABERTOS).first();
    if (vivo) throw new HttpError(409, 'Os documentos já foram enviados para assinatura. Cancele o envio antes de alterar série, turno, responsável ou condições.');
  }
  if (!Object.keys(up).length) return;
  if ('serie' in up || 'turno' in up) {
    // o valor da parcela vem da tabela "Valores do ano letivo" (série + turno)
    const serie = 'serie' in up ? up.serie : m.serie;
    const turno = 'turno' in up ? up.turno : m.turno;
    up.valor_parcela = serie && turno ? await precoDe(m.ano, serie, turno) : null;
  }
  await db('matriculas').where({ id }).update({ ...up, updated_at: agora() });
}

export async function avancar(id, usuarioId) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  const e = await estado(id);
  const de = m.passo;
  if (de === 1) {
    if (!m.serie || !m.turno) throw new HttpError(400, 'Informe a série e o turno de 2027 antes de continuar.'.replace('2027', String(m.ano)));
  }
  if (de === 2) {
    if (!m.responsavel_id) throw new HttpError(400, 'Escolha quem assina em nome da família.');
    if (!(Number(m.valor_parcela) > 0)) throw new HttpError(400, `Não há valor cadastrado para ${m.serie} (${m.turno}) em ${m.ano}. Cadastre em "Valores do ano letivo".`);
    if (!m.parcelas || !m.dia_vencimento) throw new HttpError(400, 'Preencha parcelas e vencimento.');
  }
  if (de === 4 && !e.checks.assinado) throw new HttpError(409, 'A assinatura ainda não foi concluída.');
  if (de >= 5) throw new HttpError(400, 'Use "Efetivar matrícula" no último passo.');
  const resp = e.opcoes.find((o) => o.chave === m.responsavel_chave);
  await db.transaction(async (trx) => {
    const novo = de + 1;
    await trx('matriculas').where({ id }).update({ passo: novo, passo_max: Math.max(m.passo_max, novo), status: STATUS_POR_PASSO[novo - 1], updated_at: agora() });
    if (m.passo_max <= de) {
      if (de === 1) await evento(trx, id, 'pre_matricula', 'Pré-matrícula registrada', `${m.serie} · ${m.turno}${m.origem ? ` · confirmada por: ${m.origem}` : ''}.`, usuarioId);
      if (de === 2) await evento(trx, id, 'responsavel_condicoes', 'Responsável e condições definidos', `Contratante: ${resp?.nome} (${resp?.rotulo}) · ${m.parcelas} parcelas · vencimento dia ${m.dia_vencimento}${Number(m.desconto_percentual) ? ` · desconto de ${Number(m.desconto_percentual)}%${m.desconto_motivo ? ` (${m.desconto_motivo})` : ''}` : ''}.`, usuarioId);
      if (de === 3) await evento(trx, id, 'documentos_entregues', 'Documentos do aluno conferidos', `${e.checks.docs_entregues} de ${e.checks.docs_total} documentos entregues.`, usuarioId);
    }
  });
}

/* ---------- documentos ---------- */
async function armazenar(trx, matriculaId, itens, usuarioId) {
  for (const it of itens) {
    await trx('matricula_documentos').insert({
      matricula_id: matriculaId, chave: it.chave, versao: it.versao, nome: it.nome, arquivo: it.arquivo, mime: it.mime,
      conteudo: it.buffer, sha256: sha(it.buffer), created_by: usuarioId || null,
    });
  }
}
/* ---------- documentos do aluno por upload (rematrícula) ---------- */
const LIMITE_ANEXO = 10 * 1024 * 1024;
function tipoPorConteudo(b) {
  if (b.length > 12 && b.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function anexarDocumentoAluno(id, chave, buffer, nomeOriginal, { usuarioId = null, origem = 'secretaria' } = {}) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  if (!exigeUpload(m)) throw new HttpError(409, 'Nesta matrícula (nova) os documentos são conferidos por clique.');
  const rotulo = DOCS_ALUNO.find(([k]) => k === chave)?.[1];
  if (!rotulo) throw new HttpError(400, 'Documento inválido.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, 'Arquivo vazio.');
  if (buffer.length > LIMITE_ANEXO) throw new HttpError(413, 'Arquivo muito grande (máximo 10 MB).');
  const tipo = tipoPorConteudo(buffer);
  if (!tipo) throw new HttpError(400, 'Envie um arquivo PDF, JPG, PNG ou WEBP.');
  const base = String(nomeOriginal || '').replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || chave;
  await db.transaction(async (trx) => {
    await trx('matricula_documentos').where({ matricula_id: id, chave, versao: 'anexo' }).del();
    await armazenar(trx, id, [{ chave, versao: 'anexo', nome: rotulo, arquivo: `${chave}-${base}.${tipo.ext}`, mime: tipo.mime, buffer }], usuarioId);
    const de = { ...(m.docs_entregues || {}), [chave]: true };
    await trx('matriculas').where({ id }).update({ docs_entregues: JSON.stringify(de), updated_at: agora() });
    await evento(trx, id, 'documento_anexado', `${rotulo} recebido`, origem === 'familia' ? 'Enviado pela família pelo link da rematrícula.' : 'Enviado pela secretaria.', usuarioId);
    if (DOCS_ALUNO.every(([k]) => de[k])) await evento(trx, id, 'documentos_entregues', 'Documentos do aluno recebidos', `${DOCS_ALUNO.length} de ${DOCS_ALUNO.length} documentos enviados.`, usuarioId);
  });
}

export async function removerAnexoAluno(id, chave, usuarioId) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  if (!DOCS_ALUNO.some(([k]) => k === chave)) throw new HttpError(400, 'Documento inválido.');
  await db.transaction(async (trx) => {
    await trx('matricula_documentos').where({ matricula_id: id, chave, versao: 'anexo' }).del();
    await trx('matriculas').where({ id }).update({ docs_entregues: JSON.stringify({ ...(m.docs_entregues || {}), [chave]: false }), updated_at: agora() });
    await evento(trx, id, 'documento_removido', `${DOCS_ALUNO.find(([k]) => k === chave)[1]} removido`, null, usuarioId);
  });
}

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Gera os três documentos com os dados da matrícula e guarda a versão "gerado" (substitui a anterior).
export async function gerarDocumentosMatricula(id, usuarioId, { logar } = {}) {
  const m = await obter(id);
  const g = await gerarArquivos(m.aluno_id, m.responsavel_chave, m);
  await db.transaction(async (trx) => {
    await trx('matricula_documentos').where({ matricula_id: id, versao: 'gerado' }).del();
    await armazenar(trx, id, g.arquivos.map((a) => ({ chave: a.chave, versao: 'gerado', nome: a.nome, arquivo: a.arquivo, mime: MIME_DOCX, buffer: a.buffer })), usuarioId);
    if (logar) await trx('matricula_eventos').where({ matricula_id: id, tipo: 'documentos_gerados' }).del(); // mantém só a geração mais recente
    if (logar) await evento(trx, id, 'documentos_gerados', 'Documentos gerados', 'Contrato, Termo 1 (WhatsApp) e Termo 2 (redes sociais).', usuarioId);
  });
  return g;
}

export async function zipDosDocumentos(id, usuarioId) {
  const g = await gerarDocumentosMatricula(id, usuarioId, { logar: true });
  const zip = new PizZip();
  for (const a of g.arquivos) zip.file(a.arquivo, a.buffer);
  const aviso = [];
  if (!g.resp) aviso.push('O aluno não tem responsável vinculado.');
  return { buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }), nome: `Documentos ${(await obter(id)).ano} - ${g.nomeAluno}.zip`, responsavel: g.resp ? `${g.resp.nome} (${ROTULOS[g.chave]})` : null, avisos: aviso };
}

export async function baixarDocumento(matriculaId, docId) {
  const d = await db('matricula_documentos').where({ id: docId, matricula_id: matriculaId }).first();
  if (!d) throw new HttpError(404, 'Documento não encontrado.');
  return d;
}

/* ---------- assinatura digital (Autentique) ---------- */
export async function enviarParaAssinatura(id, canal, usuarioId, destino) {
  if (!CANAIS.includes(canal)) throw new HttpError(400, 'Escolha o canal de envio (e-mail, WhatsApp ou SMS).');
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  if (m.assinatura_modo !== 'autentique') throw new HttpError(409, 'Esta matrícula está no modo de assinatura manual.');
  if (await db('assinaturas').where({ matricula_id: id }).whereNot({ provedor: 'manual' }).whereIn('status', ABERTOS).first()) {
    throw new HttpError(409, 'Os documentos já foram enviados. Use "Reenviar link" ou cancele o envio.');
  }
  const { responsaveis } = await carregar(m.aluno_id);
  const resp = responsaveis[m.responsavel_chave];
  if (!resp) throw new HttpError(400, 'Defina o responsável que vai assinar (passo 2).');
  const { contatos } = await estado(id);
  const signatario = { nome: resp.nome, cpf: resp.cpf, email: resp.email, telefone: autentique.telefoneE164(resp.ddd, resp.celular) };
  if (destino) { // destino escolhido na janela de envio: precisa ser um contato do cadastro
    if (canal === 'email') {
      const c = contatos.emails.find((x) => x.valor.toLowerCase() === String(destino).trim().toLowerCase());
      if (!c) throw new HttpError(400, 'Esse e-mail não consta no cadastro do aluno/responsáveis.');
      signatario.email = c.valor;
    } else {
      const c = contatos.celulares.find((x) => x.e164 === destino);
      if (!c) throw new HttpError(400, 'Esse celular não consta no cadastro do aluno/responsáveis.');
      signatario.telefone = c.e164;
    }
  }
  if (canal === 'email' && !signatario.email) throw new HttpError(400, 'Escolha um e-mail para enviar o link.');
  if (canal !== 'email' && !signatario.telefone) throw new HttpError(400, 'Escolha um celular (com DDD) para enviar o link, ou use o envio por e-mail.');
  const colegio = dadosColegio();
  const extras = colegio.signatario_escola?.email ? [{ nome: colegio.signatario_escola.nome, email: colegio.signatario_escola.email }] : [];

  const g = await gerarDocumentosMatricula(id, usuarioId);
  const enviados = [];
  try {
    for (const a of g.arquivos) {
      const base = a.arquivo.replace(/\.docx$/, '');
      const conv = await autentique.converterParaPdf(a.buffer, base);
      const todos = [signatario, ...extras];
      const { arquivo: pdf, posicoes } = autentique.modo() === 'simulado' ? { arquivo: conv, posicoes: null } : await autentique.prepararParaAssinatura(conv, { titulo: a.titulo || base, signatarios: todos });
      const r = await autentique.enviarDocumento({ nome: base, arquivo: pdf, signatarios: todos, canal, posicoes, verificar: a.chave === 'contrato' || process.env.AUTENTIQUE_VERIFICAR_TERMOS === 'true' });
      enviados.push({ a, pdf, r });
    }
  } catch (e) {
    // o que já foi criado no provedor é registrado para não ficar "órfão"
    if (enviados.length) await registrarEnvio(id, m, enviados, canal, signatario, usuarioId, true);
    throw e instanceof HttpError ? new HttpError(e.status, `${e.message}${enviados.length ? ` (${enviados.length} de ${g.arquivos.length} documentos já tinham sido criados; use "Atualizar" ou cancele o envio.)` : ''}`) : e;
  }
  await registrarEnvio(id, m, enviados, canal, signatario, usuarioId, false);
}

async function registrarEnvio(id, m, enviados, canal, signatario, usuarioId, parcial) {
  const driver = autentique.modo();
  await db.transaction(async (trx) => {
    for (const { a, pdf, r } of enviados) {
      const minha = r.assinaturas[0];
      await trx('assinaturas').insert({
        matricula_id: id, chave: a.chave, provedor: driver, status: 'enviado', canal,
        documento_externo_id: r.documentoId, assinatura_externa_id: minha?.publicId || null, link: minha?.link || null,
        signatario_nome: signatario.nome, signatario_contato: canal === 'email' ? signatario.email : signatario.telefone,
      });
      await armazenar(trx, id, [{ chave: a.chave, versao: 'enviado', nome: a.nome, arquivo: pdf.arquivo, mime: pdf.mime, buffer: pdf.buffer }], usuarioId);
    }
    if (!parcial) {
      await trx('matriculas').where({ id }).update({ canal, status: 'aguardando_assinatura', updated_at: agora() });
      const via = { email: 'e-mail', whatsapp: 'WhatsApp', sms: 'SMS' }[canal];
      await evento(trx, id, 'assinatura_enviada', 'Documentos enviados para assinatura', `Link enviado por ${via} para ${signatario.nome} — ${canal === 'email' ? signatario.email : signatario.telefone} (${driver === 'autentique' ? 'Autentique' : 'modo simulado'}).`, usuarioId);
    }
  });
}

async function aplicarRetorno(trx, linha, { visualizadoEm, assinadoEm, recusadoEm }) {
  const up = {};
  if (recusadoEm && linha.status !== 'recusado') { up.status = 'recusado'; }
  else if (assinadoEm && linha.status !== 'assinado') { up.status = 'assinado'; up.assinado_em = assinadoEm; up.visualizado_em = linha.visualizado_em || visualizadoEm || assinadoEm; }
  else if (visualizadoEm && linha.status === 'enviado') { up.status = 'visualizado'; up.visualizado_em = visualizadoEm; }
  if (Object.keys(up).length) await trx('assinaturas').where({ id: linha.id }).update({ ...up, updated_at: agora() });
  return up.status || null;
}

// Consulta o Autentique e atualiza os status; quando todos assinam, guarda os PDFs assinados e registra o evento.
export async function sincronizar(id, usuarioId) {
  const linhas = await db('assinaturas').where({ matricula_id: id, provedor: 'autentique' }).whereIn('status', ['enviado', 'visualizado', 'assinado']).orderBy('id');
  for (const l of linhas) {
    let d;
    try {
      d = await autentique.consultarDocumento(l.documento_externo_id);
    } catch (e) {
      throw e;
    }
    if (!d) continue;
    const minha = d.assinaturas.find((s) => s.publicId === l.assinatura_externa_id) || d.assinaturas.find((s) => s.acao === 'SIGN');
    if (minha) await db.transaction((trx) => aplicarRetorno(trx, l, { visualizadoEm: minha.visualizadoEm, assinadoEm: minha.assinadoEm, recusadoEm: minha.recusadoEm }));
    const atual = await db('assinaturas').where({ id: l.id }).first();
    if (atual.status === 'assinado' && d.arquivoAssinado) {
      const ja = await db('matricula_documentos').where({ matricula_id: id, chave: l.chave, versao: 'assinado_autentique' }).first();
      if (!ja) {
        const buf = await autentique.baixarArquivo(d.arquivoAssinado);
        const enviado = await db('matricula_documentos').where({ matricula_id: id, chave: l.chave, versao: 'enviado' }).orderBy('id', 'desc').first();
        await db.transaction((trx) => armazenar(trx, id, [{ chave: l.chave, versao: 'assinado_autentique', nome: `${enviado?.nome || l.chave} (assinado)`, arquivo: `${(enviado?.arquivo || l.chave).replace(/\.(pdf|docx)$/i, '')} - assinado.pdf`, mime: 'application/pdf', buffer: buf }], usuarioId));
      }
    }
  }
  await verificarConclusao(id, usuarioId);
}

export async function verificarConclusao(id, usuarioId) {
  const e = await estado(id);
  if (e.matricula.assinatura_modo === 'autentique' && e.checks.assinado) {
    const ja = await db('matricula_eventos').where({ matricula_id: id, tipo: 'assinatura_concluida' }).first();
    if (!ja) {
      const ass = e.assinaturas.find((a) => a.chave === 'contrato');
      await evento(db, id, 'assinatura_concluida', 'Assinatura concluída', `${ass?.signatario_nome || 'Responsável'} assinou os 3 documentos (contrato e termos)${ass?.signatario_contato ? ` · link enviado para ${ass.signatario_contato}` : ''} · ${e.driver === 'autentique' ? 'Autentique' : 'modo simulado'}.`, usuarioId);
    }
  }
}

export async function reenviarLink(id) {
  const linhas = await db('assinaturas').where({ matricula_id: id, provedor: 'autentique' }).whereIn('status', ['enviado', 'visualizado']);
  if (!linhas.length) throw new HttpError(409, 'Não há documentos pendentes de assinatura.');
  await autentique.reenviar(linhas.map((l) => l.assinatura_externa_id).filter(Boolean));
}

export async function linkDaAssinatura(assinaturaId, matriculaId) {
  const l = await db('assinaturas').where({ id: assinaturaId, matricula_id: matriculaId }).first();
  if (!l) throw new HttpError(404, 'Assinatura não encontrada.');
  let link = l.link;
  if (!link && l.assinatura_externa_id) {
    link = await autentique.criarLink(l.assinatura_externa_id);
    if (link) await db('assinaturas').where({ id: l.id }).update({ link });
  }
  if (!link) throw new HttpError(409, 'Link indisponível.');
  return link;
}

export async function cancelarEnvio(id, usuarioId) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  const linhas = await db('assinaturas').where({ matricula_id: id }).whereNot({ provedor: 'manual' }).whereIn('status', ABERTOS);
  if (!linhas.length) throw new HttpError(409, 'Não há envio ativo para cancelar.');
  const falhas = [];
  for (const l of linhas) {
    try { if (l.documento_externo_id) await autentique.excluirDocumento(l.documento_externo_id); } catch (e) { falhas.push(e.message); }
  }
  await db.transaction(async (trx) => {
    await trx('assinaturas').whereIn('id', linhas.map((l) => l.id)).update({ status: 'cancelado', updated_at: agora() });
    await trx('matricula_documentos').where({ matricula_id: id }).whereIn('versao', ['assinado_autentique']).del();
    await trx('matricula_eventos').where({ matricula_id: id, tipo: 'assinatura_concluida' }).del();
    await evento(trx, id, 'assinatura_cancelada', 'Envio para assinatura cancelado', falhas.length ? 'Atenção: não foi possível apagar todos os documentos no Autentique; confira no painel deles.' : null, usuarioId);
  });
}

// Somente no modo simulado (desenvolvimento): imita o retorno do Autentique.
export async function simular(id, acao, usuarioId) {
  if (autentique.modo() !== 'simulado') throw new HttpError(403, 'Simulação disponível apenas sem token do Autentique.');
  const linhas = await db('assinaturas').where({ matricula_id: id, provedor: 'simulado' }).whereIn('status', ['enviado', 'visualizado']);
  if (!linhas.length) throw new HttpError(409, 'Não há documentos pendentes.');
  await db.transaction(async (trx) => {
    for (const l of linhas) {
      if (acao === 'visualizou') await aplicarRetorno(trx, l, { visualizadoEm: agora() });
      if (acao === 'assinou') {
        await aplicarRetorno(trx, l, { visualizadoEm: agora(), assinadoEm: agora() });
        const enviado = await trx('matricula_documentos').where({ matricula_id: id, chave: l.chave, versao: 'enviado' }).orderBy('id', 'desc').first();
        if (enviado) await armazenar(trx, id, [{ chave: l.chave, versao: 'assinado_autentique', nome: `${enviado.nome} (assinado - simulado)`, arquivo: enviado.arquivo.replace(/(\.\w+)$/, ' - assinado-simulado$1'), mime: enviado.mime, buffer: enviado.conteudo }], usuarioId);
      }
    }
  });
  await verificarConclusao(id, usuarioId);
}

// Webhook: descobre as matrículas pelos ids de documento citados e sincroniza (a consulta à API é a fonte da verdade).
export async function processarWebhook(payload) {
  const obj = payload?.data?.object || payload?.object || {};
  const cand = [obj.id, obj.document?.id, obj.document_id, obj.document, payload?.data?.document_id].filter((x) => typeof x === 'string');
  if (!cand.length) return 0;
  const linhas = await db('assinaturas').whereIn('documento_externo_id', cand).select('matricula_id').distinct();
  for (const l of linhas) await sincronizar(l.matricula_id, null);
  return linhas.length;
}

/* ---------- assinatura manual ---------- */
export async function anexarAssinado(id, chave, arquivoNome, buffer, usuarioId) {
  if (!CHAVES.includes(chave)) throw new HttpError(400, 'Documento inválido.');
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  if (m.assinatura_modo !== 'manual') throw new HttpError(409, 'Esta matrícula está no modo de assinatura digital.');
  if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Envie um arquivo PDF.');
  const base = (await db('matricula_documentos').where({ matricula_id: id, chave, versao: 'gerado' }).first())?.nome || chave;
  await db.transaction(async (trx) => {
    await trx('matricula_documentos').where({ matricula_id: id, chave, versao: 'assinado_manual' }).del();
    await armazenar(trx, id, [{ chave, versao: 'assinado_manual', nome: `${base} (assinado)`, arquivo: String(arquivoNome || `${chave}-assinado.pdf`).slice(0, 190), mime: 'application/pdf', buffer }], usuarioId);
    await trx('assinaturas').where({ matricula_id: id, chave, provedor: 'manual' }).del();
    await trx('assinaturas').insert({ matricula_id: id, chave, provedor: 'manual', status: 'assinado', assinado_em: agora() });
    await trx('matriculas').where({ id }).update({ conferido_em: null, conferido_por: null, updated_at: agora() });
  });
}

export async function conferirManual(id, ok, usuarioId) {
  const e = await estado(id);
  if (e.matricula.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  if (ok && !e.checks.manual_anexado) throw new HttpError(409, 'Anexe a digitalização dos três documentos assinados antes de conferir.');
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id }).update({ conferido_em: ok ? agora() : null, conferido_por: ok ? usuarioId : null, updated_at: agora() });
    await trx('matricula_eventos').where({ matricula_id: id, tipo: 'assinatura_manual_conferida' }).del();
    if (ok) await evento(trx, id, 'assinatura_manual_conferida', 'Assinatura manual conferida', 'Digitalização anexada e conferida pela secretaria.', usuarioId);
  });
}

/* ---------- efetivação ---------- */
export async function confirmarParcela(id, ok, usuarioId) {
  const m = await obter(id);
  if (m.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id }).update({ parcela1_confirmada_em: ok ? agora() : null, parcela1_confirmada_por: ok ? usuarioId : null, updated_at: agora() });
    await trx('matricula_eventos').where({ matricula_id: id, tipo: 'parcela_confirmada' }).del();
    if (ok) await evento(trx, id, 'parcela_confirmada', '1ª parcela confirmada', 'Confirmação feita pela secretaria.', usuarioId);
  });
}

export async function efetivar(id, usuarioId) {
  const e = await estado(id);
  if (e.matricula.status === 'ativa') throw new HttpError(409, 'Matrícula já efetivada.');
  const f = [];
  if (!e.checks.assinado) f.push('assinatura do contrato e dos termos');
  if (e.checks.docs_entregues < e.checks.docs_total) f.push('documentos do aluno');
  if (!e.checks.parcela) f.push('confirmação da 1ª parcela');
  if (f.length) throw new HttpError(409, `Falta concluir: ${f.join(', ')}.`);
  await db.transaction(async (trx) => {
    await trx('matriculas').where({ id }).update({ status: 'ativa', passo: 5, passo_max: 5, efetivada_em: agora(), efetivada_por: usuarioId, updated_at: agora() });
    await trx('matricula_eventos').insert({ matricula_id: id, tipo: 'efetivada', titulo: 'Matrícula efetivada', detalhe: 'Contrato assinado, documentos entregues e 1ª parcela confirmada.', usuario_id: usuarioId });
  });
}
