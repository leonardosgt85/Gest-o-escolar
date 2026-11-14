// Diário de classe por turma (sala) × disciplina: chamada, provas (P.M., P.B., Simulado) e média geral simples.
import { db } from '../db.js';
import { HttpError } from '../util.js';

const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cuiaba' });

// Escopo do usuário: professor lança só nas suas disciplinas; Manutenção (coordenação/secretaria) lança em tudo; Consulta só vê.
function escopo(ctx) {
  const admin = ctx.usuario.nivel === 'Administrador';
  const nivel = ctx.permissoes['academico.diario'] ?? 0;
  return { admin, prof: !!ctx.usuario.professor, tudo: admin || nivel >= 2, ver: admin || nivel >= 1 || !!ctx.usuario.professor, uid: ctx.usuario.id };
}

export async function minhasTurmas(ctx, ano) {
  const e = escopo(ctx);
  if (!e.ver) throw new HttpError(403, 'Você não tem acesso ao diário.');
  const q = db('turmas as t')
    .join('matriz_curricular as m', (j) => j.on('m.ano', 't.ano').andOn('m.serie', 't.serie'))
    .join('disciplinas as d', 'd.id', 'm.disciplina_id')
    .where({ 't.ano': ano, 't.ativo': true, 'd.ativo': true })
    .select('t.id as turma_id', 't.serie', 't.nome', 't.turno', 'd.id as disciplina_id', 'd.nome as disciplina',
      db.raw("(select count(*) from matriculas mt where mt.turma_id = t.id and mt.status = 'ativa')::int as alunos"),
      db.raw('(select max(a.data) from diario_aulas a where a.turma_id = t.id and a.disciplina_id = d.id) as ultima_aula'))
    .orderBy(['t.serie', 't.nome', 't.turno', 'd.nome']);
  if (!e.tudo && e.prof) {
    q.whereExists(db('usuario_disciplinas as ud').whereRaw('ud.disciplina_id = d.id').where('ud.usuario_id', e.uid));
  }
  return q;
}

async function contexto(ctx, turmaId, disciplinaId, { lancar = false } = {}) {
  const e = escopo(ctx);
  const turma = await db('turmas').where({ id: turmaId }).first();
  const disc = await db('disciplinas').where({ id: disciplinaId }).first();
  if (!turma || !disc) throw new HttpError(404, 'Turma ou disciplina não encontrada.');
  const matriz = await db('matriz_curricular').where({ ano: turma.ano, serie: turma.serie, disciplina_id: disc.id }).first();
  if (!matriz) throw new HttpError(404, 'Esta disciplina não está na matriz da série desta turma.');
  const dono = e.prof && !!(await db('usuario_disciplinas').where({ usuario_id: e.uid, disciplina_id: disc.id }).first());
  const pode = e.tudo || dono;
  if (!pode && !(e.ver && !lancar)) throw new HttpError(403, lancar ? 'Você só pode lançar nas suas disciplinas.' : 'Você não tem acesso a esta disciplina.');
  if (lancar && !pode) throw new HttpError(403, 'Você só pode lançar nas suas disciplinas.');
  return { turma, disc, matriz, podeLancar: pode, uid: e.uid };
}

const alunosDaTurma = (turma) => db('matriculas as m').join('alunos as a', 'a.id', 'm.aluno_id')
  .where({ 'm.turma_id': turma.id, 'm.status': 'ativa' }).select('a.id', 'a.nome_completo').orderByRaw('lower(a.nome_completo)');

function data(v, ano) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) || Number.isNaN(Date.parse(v))) throw new HttpError(400, 'Data inválida.');
  if (v > hojeIso()) throw new HttpError(400, 'Não é possível lançar chamada de data futura.');
  if (ano && Number(v.slice(0, 4)) !== Number(ano)) throw new HttpError(400, `A data precisa estar dentro do ano letivo ${ano} desta turma.`);
  return v;
}
const bim = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new HttpError(400, 'Bimestre inválido (1 a 4).');
  return n;
};
const nota = (v, rot) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10) throw new HttpError(400, `${rot}: informe uma nota de 0 a 10.`);
  return Math.round(n * 10) / 10;
};
export const media = (pm, pb, sim) => {
  const v = [pm, pb, sim].filter((x) => x !== null && x !== undefined).map(Number);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

export async function abrir(ctx, turmaId, disciplinaId) {
  const c = await contexto(ctx, turmaId, disciplinaId);
  return { turma: turmaPublica(c.turma), disciplina: c.disc, podeLancar: c.podeLancar, diasAula: (c.matriz.dias_semana || []).map(Number), alunos: await alunosDaTurma(c.turma) };
}

export async function dia(ctx, turmaId, disciplinaId, dataIso) {
  const c = await contexto(ctx, turmaId, disciplinaId);
  const registro = await db('diario_aulas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id, data: data(dataIso, c.turma.ano) }).first();
  const faltas = registro ? (await db('diario_frequencia').where({ aula_id: registro.id, status: 'F' }).pluck('aluno_id')) : [];
  return { registro: registro ? { aulas: registro.aulas, bimestre: registro.bimestre, conteudo: registro.conteudo } : null, faltas };
}

export async function salvarDia(ctx, turmaId, disciplinaId, b) {
  const c = await contexto(ctx, turmaId, disciplinaId, { lancar: true });
  const d = data(b.data, c.turma.ano);
  const aulas = Number(b.aulas ?? 1);
  if (!Number.isInteger(aulas) || aulas < 1 || aulas > 10) throw new HttpError(400, 'Nº de aulas inválido (1 a 10).');
  const alunos = (await alunosDaTurma(c.turma)).map((a) => a.id);
  const faltas = new Set((Array.isArray(b.faltas) ? b.faltas : []).map(Number));
  for (const f of faltas) if (!alunos.includes(f)) throw new HttpError(400, 'Aluno que não pertence à turma na lista de faltas.');
  await db.transaction(async (trx) => {
    const [reg] = await trx('diario_aulas').insert({ turma_id: c.turma.id, disciplina_id: c.disc.id, data: d, bimestre: bim(b.bimestre), aulas, conteudo: String(b.conteudo || '').trim().slice(0, 2000) || null, registrado_por: c.uid })
      .onConflict(['turma_id', 'disciplina_id', 'data']).merge({ bimestre: bim(b.bimestre), aulas, conteudo: String(b.conteudo || '').trim().slice(0, 2000) || null, registrado_por: c.uid, updated_at: trx.fn.now() }).returning('id');
    await trx('diario_frequencia').where({ aula_id: reg.id }).del();
    if (alunos.length) await trx('diario_frequencia').insert(alunos.map((id) => ({ aula_id: reg.id, aluno_id: id, status: faltas.has(id) ? 'F' : 'P' })));
  });
  return { ok: true, faltas: faltas.size, presentes: alunos.length - faltas.size };
}

/** Exclui a chamada de um dia (lançada por engano): apaga o registro da aula e as presenças/faltas dele. */
export async function excluirDia(ctx, turmaId, disciplinaId, dataIso) {
  const c = await contexto(ctx, turmaId, disciplinaId, { lancar: true });
  const d = data(dataIso, c.turma.ano);
  const reg = await db('diario_aulas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id, data: d }).first();
  if (!reg) throw new HttpError(404, 'Não há chamada lançada neste dia.');
  await db.transaction(async (trx) => {
    await trx('diario_frequencia').where({ aula_id: reg.id }).del();
    await trx('diario_aulas').where({ id: reg.id }).del();
  });
  return { ok: true };
}

export async function salvarNotas(ctx, turmaId, disciplinaId, b) {
  const c = await contexto(ctx, turmaId, disciplinaId, { lancar: true });
  const bimestre = bim(b.bimestre);
  const lista = await alunosDaTurma(c.turma);
  const alunos = lista.map((a) => a.id);
  const nomes = new Map(lista.map((a) => [a.id, a.nome_completo]));
  const linhas = (Array.isArray(b.notas) ? b.notas : []).map((n) => {
    const aluno_id = Number(n.aluno_id);
    if (!alunos.includes(aluno_id)) throw new HttpError(400, 'Aluno que não pertence à turma.');
    const de = nomes.get(aluno_id);
    return { aluno_id, pm: nota(n.pm, `P.M. de ${de}`), pb: nota(n.pb, `P.B. de ${de}`), sim: nota(n.sim, `Simulado de ${de}`) };
  });
  await db.transaction(async (trx) => {
    for (const l of linhas) {
      const chave = { turma_id: c.turma.id, disciplina_id: c.disc.id, bimestre, aluno_id: l.aluno_id };
      if (l.pm === null && l.pb === null && l.sim === null) { await trx('diario_notas').where(chave).del(); continue; }
      await trx('diario_notas').insert({ ...chave, pm: l.pm, pb: l.pb, sim: l.sim, lancado_por: c.uid }).onConflict(['turma_id', 'disciplina_id', 'bimestre', 'aluno_id']).merge({ pm: l.pm, pb: l.pb, sim: l.sim, lancado_por: c.uid, updated_at: trx.fn.now() });
    }
  });
  return { ok: true };
}

// Visão do diário (como o modelo de papel): alunos × dias, faltas, P.M., P.B., Simulado e média geral.
// A turma que sai nas telas do diário não leva dado financeiro (valor da parcela) nem o limite de alunos.
const turmaPublica = (t) => ({ id: t.id, ano: t.ano, serie: t.serie, nome: t.nome, turno: t.turno });

export async function resumo(ctx, turmaId, disciplinaId, bimestre) {
  const c = await contexto(ctx, turmaId, disciplinaId);
  const b = bim(bimestre);
  const alunos = await alunosDaTurma(c.turma);
  const aulas = await db('diario_aulas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id, bimestre: b }).orderBy('data');
  const freq = aulas.length ? await db('diario_frequencia').whereIn('aula_id', aulas.map((a) => a.id)) : [];
  const porAula = Object.fromEntries(aulas.map((a) => [a.id, a]));
  const notas = await db('diario_notas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id, bimestre: b });
  const mapaNotas = Object.fromEntries(notas.map((n) => [n.aluno_id, n]));
  const dias = aulas.map((a) => ({ data: String(a.data instanceof Date ? a.data.toISOString() : a.data).slice(0, 10), aulas: a.aulas, conteudo: a.conteudo }));
  const linhas = alunos.map((a) => {
    const presenca = {};
    let faltas = 0;
    for (const f of freq.filter((x) => x.aluno_id === a.id)) {
      const au = porAula[f.aula_id];
      presenca[String(au.data instanceof Date ? au.data.toISOString() : au.data).slice(0, 10)] = f.status;
      if (f.status === 'F') faltas += au.aulas;
    }
    const n = mapaNotas[a.id] || {};
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    return { aluno_id: a.id, nome: a.nome_completo, presenca, faltas, pm: num(n.pm), pb: num(n.pb), sim: num(n.sim), media: media(num(n.pm), num(n.pb), num(n.sim)) };
  });
  return { turma: turmaPublica(c.turma), disciplina: c.disc, bimestre: b, podeLancar: c.podeLancar, dias, linhas };
}

/* ---------- relatório: diário de classe mensal ---------- */
const iso = (v) => String(v instanceof Date ? v.toLocaleDateString('en-CA') : v).slice(0, 10);

export async function dadosMensais(ctx, turmaId, disciplinaId, ano, mes) {
  const a = Number(ano), m = Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) throw new HttpError(400, 'Ano inválido.');
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new HttpError(400, 'Mês inválido.');
  const c = await contexto(ctx, turmaId, disciplinaId);
  const ini = `${a}-${String(m).padStart(2, '0')}-01`;
  const dias = new Date(a, m, 0).getDate();
  const fim = `${a}-${String(m).padStart(2, '0')}-${String(dias).padStart(2, '0')}`;
  const alunos = await alunosDaTurma(c.turma);
  const aulas = (await db('diario_aulas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id }).whereBetween('data', [ini, fim]).orderBy('data'))
    .map((x) => ({ ...x, dia: Number(iso(x.data).slice(8, 10)) }));
  const freq = aulas.length ? await db('diario_frequencia').whereIn('aula_id', aulas.map((x) => x.id)) : [];
  // bimestre do mês: o que mais aparece nas aulas lançadas (senão, pelo mês)
  const cont = {};
  for (const x of aulas) cont[x.bimestre] = (cont[x.bimestre] || 0) + 1;
  const doMes = Object.entries(cont).sort((p, q) => q[1] - p[1])[0]?.[0];
  const bimestre = Number(doMes) || (m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4);
  const notas = await db('diario_notas').where({ turma_id: c.turma.id, disciplina_id: c.disc.id, bimestre });
  const porAluno = Object.fromEntries(notas.map((n) => [n.aluno_id, n]));
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const porId = Object.fromEntries(aulas.map((x) => [x.id, x]));
  const linhas = alunos.map((al) => {
    const marcas = {};
    let faltas = 0;
    for (const f of freq.filter((x) => x.aluno_id === al.id)) {
      const au = porId[f.aula_id];
      marcas[au.dia] = f.status;
      if (f.status === 'F') faltas += au.aulas;
    }
    const n = porAluno[al.id] || {};
    return { nome: al.nome_completo, marcas, faltas, pm: num(n.pm), pb: num(n.pb), sim: num(n.sim), media: media(num(n.pm), num(n.pb), num(n.sim)) };
  });
  const professores = await db('usuarios as u').join('usuario_disciplinas as ud', 'ud.usuario_id', 'u.id')
    .where({ 'ud.disciplina_id': c.disc.id, 'u.professor': true, 'u.situacao': 'Ativo' }).orderBy('u.nome_completo').pluck('u.nome_completo');
  return {
    turma: turmaPublica(c.turma), disciplina: c.disc, ano: a, mes: m, diasNoMes: dias, bimestre, professores,
    aulas: aulas.map((x) => ({ dia: x.dia, data: iso(x.data), aulas: x.aulas, conteudo: x.conteudo })),
    linhas,
  };
}
