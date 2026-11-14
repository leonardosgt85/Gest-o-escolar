// Cadastros de apoio ao diário: disciplinas, turmas e matriz curricular.
import { Router } from 'express';
import { db } from '../db.js';
import { serieNormalizada } from '../services/seriesDb.js';
import { normTxt } from '../services/series.js';
import { HttpError, likeSeguro, semAcento, semAcentoSql, wrap } from '../util.js';

const router = Router();
const nivel = (req, chave) => req.ctx.permissoes[chave] ?? 0;
const admin = (req) => req.user.nivel === 'Administrador';
// Disciplinas também são lidas/criadas a partir do cadastro de usuários (cadastro na hora).
const ler = (req, res, next) => (admin(req) || nivel(req, 'gerencial.cadastros') >= 1 || nivel(req, 'gerencial.usuarios') >= 1 ? next() : res.status(403).json({ error: 'Você não tem acesso a esta funcionalidade.' }));
const gravarDisc = (req, res, next) => (admin(req) || nivel(req, 'gerencial.cadastros') >= 2 || nivel(req, 'gerencial.usuarios') >= 2 ? next() : res.status(403).json({ error: 'Você não tem permissão para cadastrar.' }));
const gravar = (req, res, next) => (admin(req) || nivel(req, 'gerencial.cadastros') >= 2 ? next() : res.status(403).json({ error: 'Você não tem permissão para cadastrar.' }));

const txt = (v) => String(v ?? '').trim();
const inteiro = (v, rot, { min = 0, max = 100000 } = {}) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${rot}: informe um número inteiro válido.`);
  return n;
};

/* ---------- disciplinas ---------- */
router.get('/disciplinas', ler, wrap(async (req, res) => {
  const q = db('disciplinas as d')
    .select('d.*', db.raw('(select count(*) from usuario_disciplinas ud where ud.disciplina_id = d.id)::int as professores'), db.raw("coalesce((select array_agg(u.nome_completo order by lower(u.nome_completo)) from usuario_disciplinas ud join usuarios u on u.id = ud.usuario_id where ud.disciplina_id = d.id), '{}') as professores_nomes"), db.raw('(select count(*) from matriz_curricular m where m.disciplina_id = d.id)::int as usos_matriz'))
    .orderBy('d.nome');
  if (req.query.somente_ativos === 'true') q.where('d.ativo', true);
  if (req.query.q) q.whereRaw(`${semAcentoSql('d.nome')} like ?`, [`%${likeSeguro(semAcento(req.query.q))}%`]);
  res.json(await q);
}));

async function validarDisciplina(b, idAtual) {
  const nome = txt(b.nome);
  if (!nome) throw new HttpError(400, 'Informe o nome da disciplina.');
  if (nome.length > 100) throw new HttpError(400, 'Nome muito longo (máximo 100 letras).');
  const dup = await db('disciplinas').whereRaw('lower(nome) = lower(?)', [nome]).modify((q) => idAtual && q.whereNot({ id: idAtual })).first();
  if (dup) throw new HttpError(409, `Já existe a disciplina "${dup.nome}".`);
  return { nome, sigla: txt(b.sigla).slice(0, 20) || null };
}

router.post('/disciplinas', gravarDisc, wrap(async (req, res) => {
  const d = await validarDisciplina(req.body);
  const [nova] = await db('disciplinas').insert(d).returning('*');
  res.status(201).json(nova);
}));

router.put('/disciplinas/:id', gravar, wrap(async (req, res) => {
  const atual = await db('disciplinas').where({ id: req.params.id }).first();
  if (!atual) throw new HttpError(404, 'Disciplina não encontrada.');
  const d = await validarDisciplina(req.body, atual.id);
  if (req.body.ativo !== undefined) d.ativo = !!req.body.ativo;
  await db('disciplinas').where({ id: atual.id }).update({ ...d, updated_at: db.fn.now() });
  res.json({ ok: true });
}));

router.delete('/disciplinas/:id', gravar, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const prof = await db('usuario_disciplinas').where({ disciplina_id: id }).count('* as n').first();
  const mat = await db('matriz_curricular').where({ disciplina_id: id }).count('* as n').first();
  if (Number(prof.n) || Number(mat.n)) throw new HttpError(409, 'Esta disciplina já está em uso (professores ou matriz curricular). Inative-a em vez de excluir.');
  if (!(await db('disciplinas').where({ id }).del())) throw new HttpError(404, 'Disciplina não encontrada.');
  res.json({ ok: true });
}));

/* ---------- séries (de turmas e matriz) ---------- */
router.get('/series', ler, wrap(async (req, res) => {
  const a = [];
  const b = await db('turmas').distinct('serie');
  const c = await db('matriz_curricular').distinct('serie');
  const todas = [...new Set([...a, ...b, ...c].map((x) => x.serie))].sort((x, y) => x.localeCompare(y, 'pt-BR', { numeric: true }));
  res.json(todas);
}));

/* ---------- turmas ---------- */
const ocupacao = async (turmaId, exceto) => {
  const q = db('matriculas').where({ turma_id: turmaId, status: 'ativa' });
  if (exceto) q.whereNot({ id: exceto });
  return Number((await q.count('* as n').first()).n);
};
const msgCheia = (t) => `A turma ${t.serie} ${t.nome} (${t.turno}) está cheia (limite de ${t.limite_alunos} alunos). Crie outra turma da série ${t.serie} em Turmas e ano letivo.`;
const TURNOS = ['Manhã', 'Tarde', 'Integral'];
router.get('/turmas', ler, wrap(async (req, res) => {
  const q = db('turmas as t')
    .select('t.*', db.raw("(select count(*) from matriculas m where m.turma_id = t.id and m.status = 'ativa')::int as alunos"))
    .orderBy([{ column: 't.ano', order: 'desc' }, 't.serie', 't.nome', 't.turno']);
  if (req.query.ano) q.where('t.ano', Number(req.query.ano));
  res.json(await q);
}));

function validarTurma(b) {
  const ano = inteiro(b.ano, 'Ano', { min: 2000, max: 2100 });
  const serie = txt(b.serie);
  const nome = txt(b.nome);
  if (!ano) throw new HttpError(400, 'Informe o ano letivo.');
  if (!serie) throw new HttpError(400, 'Informe a série.');
  if (!nome) throw new HttpError(400, 'Informe o nome da turma (ex.: A).');
  if (!TURNOS.includes(b.turno)) throw new HttpError(400, 'Turno inválido.');
  const bruto = b.valor_parcela === null || b.valor_parcela === undefined ? '' : (String(b.valor_parcela).includes(',') ? String(b.valor_parcela).replace(/\./g, '') : String(b.valor_parcela)).trim().replace(',', '.');
  const valor = bruto === '' ? null : Number(bruto);
  if (valor !== null && !(valor >= 0)) throw new HttpError(400, 'Valor da parcela inválido.');
  const lim = b.limite_alunos === null || b.limite_alunos === undefined || String(b.limite_alunos).trim() === '' ? null : Number(b.limite_alunos);
  if (lim !== null && !(Number.isInteger(lim) && lim >= 1 && lim <= 500)) throw new HttpError(400, 'Limite de alunos inválido (use um número inteiro de 1 a 500 ou deixe vazio para sem limite).');
  return { ano, serie, nome: nome.slice(0, 20), turno: b.turno, valor_parcela: valor === null ? null : Math.round(valor * 100) / 100, limite_alunos: lim };
}
// série canônica + nome sem espaços sobrando; recusa duplicata que só difere por maiúsculas/espaços
async function prepararTurma(b, idAtual) {
  const d = validarTurma(b);
  d.serie = await serieNormalizada(d.serie);
  d.nome = normTxt(d.nome).slice(0, 20);
  const dup = await db('turmas').where({ ano: d.ano, turno: d.turno })
    .whereRaw('lower(btrim(serie)) = lower(?)', [d.serie]).whereRaw('lower(btrim(nome)) = lower(?)', [d.nome])
    .modify((q) => idAtual && q.whereNot({ id: idAtual })).first();
  if (dup) throw new HttpError(409, `Já existe a turma ${dup.serie} ${dup.nome} (${dup.turno}) em ${d.ano}.`);
  return d;
}
const erroDup = (e) => { if (e.code === '23505') throw new HttpError(409, 'Já existe uma turma com este ano, série, nome e turno.'); throw e; };

// copia as turmas (sem alunos) de outro ano, aplicando reajuste no valor da parcela
router.post('/turmas/copiar-ano', gravar, wrap(async (req, res) => {
  const de = Number(req.body.de), para = Number(req.body.para);
  if (!de || !para || de === para) throw new HttpError(400, 'Escolha um ano de origem diferente do destino.');
  const f = 1 + (Number(String(req.body.reajuste_percentual ?? 0).replace(',', '.')) || 0) / 100;
  const origem = await db('turmas').where({ ano: de, ativo: true });
  if (!origem.length) throw new HttpError(409, `O ano ${de} não tem turmas ativas.`);
  let criadas = 0;
  for (const o of origem) {
    const ja = await db('turmas').where({ ano: para, serie: o.serie, nome: o.nome, turno: o.turno }).first();
    if (ja) continue;
    const v = o.valor_parcela == null ? null : Math.round(Number(o.valor_parcela) * f * 100) / 100;
    await db('turmas').insert({ ano: para, serie: o.serie, nome: o.nome, turno: o.turno, ativo: true, valor_parcela: v, limite_alunos: o.limite_alunos });
    criadas += 1;
  }
  res.json({ criadas, existentes: origem.length - criadas });
}));

router.post('/turmas', gravar, wrap(async (req, res) => {
  const d = await prepararTurma(req.body);
  const [nova] = await db('turmas').insert(d).returning('*').catch(erroDup);
  res.status(201).json(nova);
}));
router.put('/turmas/:id', gravar, wrap(async (req, res) => {
  const d = await prepararTurma(req.body, Number(req.params.id));
  if (req.body.ativo !== undefined) d.ativo = !!req.body.ativo;
  if (d.limite_alunos) {
    const ocup = await ocupacao(req.params.id);
    if (ocup > d.limite_alunos) throw new HttpError(409, `A turma já tem ${ocup} alunos. O limite não pode ser menor que isso.`);
  }
  const n = await db('turmas').where({ id: req.params.id }).update(d).catch(erroDup);
  if (!n) throw new HttpError(404, 'Turma não encontrada.');
  res.json({ ok: true });
}));
router.delete('/turmas/:id', gravar, wrap(async (req, res) => {
  const u = await db('matriculas').where({ turma_id: req.params.id }).count('* as n').first();
  if (Number(u.n)) throw new HttpError(409, 'Há alunos nesta turma. Inative-a em vez de excluir.');
  if (!(await db('turmas').where({ id: req.params.id }).del())) throw new HttpError(404, 'Turma não encontrada.');
  res.json({ ok: true });
}));

/* ---------- enturmação (aluno → turma) ---------- */
const TURNO_ALIAS = { matutino: 'manhã', manha: 'manhã', vespertino: 'tarde' };
const turnoNorm = (t) => { const k = txt(t).toLowerCase(); return TURNO_ALIAS[k] || k; };
const mesmaSerie = (a, b) => txt(a).toLowerCase() === txt(b).toLowerCase();

async function matriculasSemTurma(ano) {
  const mats = await db('matriculas as m').join('alunos as a', 'a.id', 'm.aluno_id')
    .where({ 'm.ano': ano, 'm.status': 'ativa' }).whereNull('m.turma_id')
    .select('m.id as matricula_id', 'a.nome_completo as aluno', 'm.serie', 'm.turno').orderByRaw('lower(a.nome_completo)');
  const turmas = await db('turmas').where({ ano, ativo: true }).orderBy(['serie', 'nome'])
    .select('*', db.raw("(select count(*) from matriculas x where x.turma_id = turmas.id and x.status = 'ativa')::int as ocupadas"));
  return mats.map((m) => ({ ...m, candidatas: turmas.filter((t) => mesmaSerie(t.serie, m.serie)).map((t) => ({ id: t.id, nome: `${t.serie} ${t.nome} — ${t.turno}`, turno: t.turno, cheia: !!t.limite_alunos && t.ocupadas >= t.limite_alunos })), unica: turmas.filter((t) => mesmaSerie(t.serie, m.serie) && turnoNorm(t.turno) === turnoNorm(m.turno)) }));
}
router.get('/enturmacao', ler, wrap(async (req, res) => {
  const ano = inteiro(req.query.ano, 'Ano', { min: 2000, max: 2100 }) || new Date().getFullYear();
  res.json((await matriculasSemTurma(ano)).map(({ unica, ...m }) => m));
}));
// Coloca cada aluno matriculado (ativa) na turma de mesma série e turno, quando só existe uma; o resto fica para escolha manual.
router.post('/enturmacao/automatica', gravar, wrap(async (req, res) => {
  const ano = inteiro(req.body.ano, 'Ano', { min: 2000, max: 2100 });
  let enturmados = 0;
  const cheias = new Map();
  for (const m of await matriculasSemTurma(ano)) {
    if (m.unica.length !== 1) continue;
    const t = m.unica[0];
    if (t.limite_alunos && (await ocupacao(t.id)) >= t.limite_alunos) { cheias.set(t.id, msgCheia(t)); continue; }
    await db('matriculas').where({ id: m.matricula_id }).update({ turma_id: t.id }); enturmados += 1;
  }
  const restantes = (await matriculasSemTurma(ano)).map(({ unica, ...m }) => m);
  res.json({ enturmados, restantes, avisos: [...cheias.values()] });
}));
router.put('/enturmacao/:matriculaId', gravar, wrap(async (req, res) => {
  const turmaId = req.body.turma_id === null || req.body.turma_id === '' ? null : inteiro(req.body.turma_id, 'Turma');
  const m = await db('matriculas').where({ id: req.params.matriculaId }).first();
  if (!m) throw new HttpError(404, 'Matrícula não encontrada.');
  const turma = turmaId ? await db('turmas').where({ id: turmaId, ano: m.ano }).first() : null;
  if (turmaId && !turma) throw new HttpError(400, 'A turma precisa ser do mesmo ano da matrícula.');
  if (turma?.limite_alunos && m.turma_id !== turma.id && (await ocupacao(turma.id, m.id)) >= turma.limite_alunos) throw new HttpError(409, msgCheia(turma));
  await db('matriculas').where({ id: m.id }).update({ turma_id: turmaId });
  res.json({ ok: true });
}));

/* ---------- matriz curricular ---------- */
router.get('/matriz', ler, wrap(async (req, res) => {
  const ano = inteiro(req.query.ano, 'Ano');
  const q = db('matriz_curricular as m').join('disciplinas as d', 'd.id', 'm.disciplina_id')
    .select('m.*', 'd.nome as disciplina_nome', 'd.sigla as disciplina_sigla').orderBy(['m.serie', 'd.nome']);
  if (ano) q.where('m.ano', ano);
  if (req.query.serie) q.where('m.serie', txt(req.query.serie));
  res.json(await q);
}));

router.put('/matriz', gravar, wrap(async (req, res) => {
  const b = req.body;
  const ano = inteiro(b.ano, 'Ano', { min: 2000, max: 2100 });
  const serie = await serieNormalizada(b.serie);
  if (!ano || !serie) throw new HttpError(400, 'Informe ano e série.');
  const disciplina_id = inteiro(b.disciplina_id, 'Disciplina');
  const disc = disciplina_id ? await db('disciplinas').where({ id: disciplina_id }).first() : null;
  if (!disc) throw new HttpError(400, 'Escolha a disciplina.');
  if (b.novo) { // "Adicionar" nunca sobrescreve: se já existe, orienta a editar
    const ja = await db('matriz_curricular').where({ ano, disciplina_id }).whereRaw('lower(btrim(serie)) = lower(?)', [serie]).first();
    if (ja) throw new HttpError(409, `${disc.nome} já está na matriz de ${serie} em ${ano}. Edite a linha existente em vez de adicionar de novo.`);
  }
  const dias = [...new Set((Array.isArray(b.dias_semana) ? b.dias_semana : []).map(Number))].filter((n) => n >= 1 && n <= 6).sort();
  const dados = {
    ano, serie, disciplina_id,
    carga_horaria: inteiro(b.carga_horaria, 'Carga horária', { max: 5000 }),
    aulas_semana: inteiro(b.aulas_semana, 'Aulas por semana', { max: 40 }),
    dias_semana: JSON.stringify(dias),
  };
  await db('matriz_curricular').insert(dados).onConflict(['ano', 'serie', 'disciplina_id']).merge();
  res.json({ ok: true });
}));

router.delete('/matriz/:id', gravar, wrap(async (req, res) => {
  if (!(await db('matriz_curricular').where({ id: req.params.id }).del())) throw new HttpError(404, 'Item não encontrado.');
  res.json({ ok: true });
}));

// Copia a matriz de um ano para outro (a proposta da escola muda todo ano; ajusta-se depois).
router.post('/matriz/copiar', gravar, wrap(async (req, res) => {
  const de = inteiro(req.body.de, 'Ano de origem', { min: 2000, max: 2100 });
  const para = inteiro(req.body.para, 'Ano de destino', { min: 2000, max: 2100 });
  if (!de || !para || de === para) throw new HttpError(400, 'Informe anos de origem e destino diferentes.');
  const itens = await db('matriz_curricular').where({ ano: de });
  if (!itens.length) throw new HttpError(404, `Não há matriz cadastrada em ${de}.`);
  let copiados = 0;
  for (const i of itens) {
    const r = await db('matriz_curricular')
      .insert({ ano: para, serie: i.serie, disciplina_id: i.disciplina_id, carga_horaria: i.carga_horaria, aulas_semana: i.aulas_semana, dias_semana: JSON.stringify(i.dias_semana) })
      .onConflict(['ano', 'serie', 'disciplina_id']).ignore().returning('id');
    copiados += r.length;
  }
  res.json({ copiados, ignorados: itens.length - copiados });
}));

export default router;
