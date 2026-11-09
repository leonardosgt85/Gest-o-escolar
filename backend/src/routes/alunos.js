import { Router } from 'express';
import { db } from '../db.js';
import { can } from '../middleware/auth.js';
import { ALUNO_CAMPOS, ALUNO_DATAS, ALUNO_JSON, OPCOES } from '../fields.js';
import { gerarDocumentos, opcoesResponsaveis } from '../services/documentosService.js';
import { HttpError, cpfValido, ehData, formatarCpf, limpar, paginacao, pick, semAcento, semAcentoSql, soDigitos, wrap } from '../util.js';

const router = Router();

const LISTA = [
  'a.id', 'a.matricula', 'a.cpf', 'a.nome_completo', 'a.data_nascimento', 'a.telefone', 'a.celular', 'a.ddd', 'a.email',
  'a.created_at', 'm.id as mat_id', 'm.status as mat_status', 'm.passo as mat_passo',
];

const SITUACOES = {
  matriculado: (q) => q.where('m.status', 'ativa'),
  andamento: (q) => q.whereIn('m.status', ['pre_matricula', 'aguardando_documentos', 'aguardando_assinatura', 'aguardando_parcela']),
  nao_renovou: (q) => q.where('m.status', 'nao_renovou'),
  sem: (q) => q.whereNull('m.id'),
};

function filtros(q, query) {
  q.whereNull('a.excluido_em');
  if (query.q) {
    const t = `%${semAcento(query.q)}%`;
    q.where((b) =>
      b
        .whereRaw(`${semAcentoSql('a.nome_completo')} like ?`, [t])
        .orWhereRaw("coalesce(a.matricula,'') like ?", [t])
        .orWhereRaw("coalesce(a.cpf,'') like ?", [t])
        .orWhereRaw('cast(a.id as text) like ?', [t]),
    );
  }
  if (query.codigo) q.where('a.id', Number(query.codigo) || 0);
  if (query.nome) q.whereRaw(`${semAcentoSql('a.nome_completo')} like ?`, [`%${semAcento(query.nome)}%`]);
  if (query.matricula) q.whereRaw("coalesce(a.matricula,'') like ?", [`%${query.matricula}%`]);
  if (query.cpf) q.whereRaw("regexp_replace(coalesce(a.cpf,''), '\\D', '', 'g') like ?", [`%${soDigitos(query.cpf)}%`]);
  if (query.responsavel_id) {
    const id = Number(query.responsavel_id);
    q.where((b) => b.where('a.pai_id', id).orWhere('a.mae_id', id).orWhere('a.resp_pedagogico_id', id));
  }
  if (query.usuario_id) q.where('a.created_by', Number(query.usuario_id));
  if (query.cadastro_de) q.where('a.created_at', '>=', `${query.cadastro_de} 00:00:00`);
  if (query.cadastro_ate) q.where('a.created_at', '<=', `${query.cadastro_ate} 23:59:59`);
}

router.get(
  '/',
  can('academico.alunos', 1),
  wrap(async (req, res) => {
    const { pagina, porPagina, offset } = paginacao(req.query);
    // matrícula do ano letivo aberto (rematrícula): aparece como coluna e filtro na grid
    const alvo = (await db('anos_letivos').where({ ativo: true }).max('ano as ano').first())?.ano || 0;
    const juntar = (q) => q.leftJoin('matriculas as m', function () { this.on('m.aluno_id', 'a.id').andOnVal('m.ano', '=', alvo); });
    const base = juntar(db('alunos as a'));
    filtros(base, req.query);
    if (SITUACOES[req.query.situacao_mat]) SITUACOES[req.query.situacao_mat](base);
    const resumoQ = juntar(db('alunos as a')).whereNull('a.excluido_em')
      .select(db.raw("count(*) filter (where m.status = 'ativa')::int as matriculado"),
        db.raw("count(*) filter (where m.status in ('pre_matricula','aguardando_documentos','aguardando_assinatura','aguardando_parcela'))::int as andamento"),
        db.raw("count(*) filter (where m.status = 'nao_renovou')::int as nao_renovou"),
        db.raw('count(*) filter (where m.id is null)::int as sem')).first();
    const total = Number((await base.clone().count('a.id as n').first()).n);
    const itens = await base.clone().select(LISTA).orderBy('a.nome_completo').limit(porPagina).offset(offset);
    res.json({ itens, total, pagina, por_pagina: porPagina, ano_matricula: alvo || null, resumo_matricula: alvo ? await resumoQ : null });
  }),
);

async function pessoaResumo(id) {
  if (!id) return null;
  return (await db('pessoas').where({ id }).select('id', 'nome', 'cpf', 'sexo', 'email', 'celular', 'telefone', 'ultimo_login').first()) || null;
}

// Documentos para assinatura manual (termos + contrato), preenchidos com os dados do aluno e do responsável.
router.get(
  '/:id/documentos/responsaveis',
  can('academico.alunos', 1),
  wrap(async (req, res) => res.json(await opcoesResponsaveis(Number(req.params.id)))),
);
router.get(
  '/:id/documentos',
  can('academico.alunos', 1),
  wrap(async (req, res) => {
    const r = await gerarDocumentos(Number(req.params.id), req.query.responsavel);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${r.nomeArquivo}"`,
      'X-Documentos-Info': encodeURIComponent(JSON.stringify({ responsavel: r.responsavel, avisos: r.avisos })),
      'Access-Control-Expose-Headers': 'X-Documentos-Info, Content-Disposition',
      'Cache-Control': 'no-store',
    });
    res.send(r.buffer);
  }),
);

router.get(
  '/:id',
  can('academico.alunos', 1),
  wrap(async (req, res) => {
    const a = await db('alunos as a')
      .leftJoin('usuarios as uc', 'uc.id', 'a.created_by')
      .leftJoin('usuarios as ua', 'ua.id', 'a.updated_by')
      .where('a.id', req.params.id)
      .whereNull('a.excluido_em')
      .select('a.*', 'uc.nome_completo as criado_por', 'ua.nome_completo as alterado_por')
      .first();
    if (!a) throw new HttpError(404, 'Aluno não encontrado.');
    const [pai, mae, resp] = await Promise.all([pessoaResumo(a.pai_id), pessoaResumo(a.mae_id), pessoaResumo(a.resp_pedagogico_id)]);
    res.json({ ...a, pai, mae, resp_pedagogico: resp });
  }),
);

async function preparar(body, ignorarId) {
  const dados = limpar(pick(body, ALUNO_CAMPOS));
  if (!dados.nome_completo) throw new HttpError(400, 'Informe o nome completo do aluno.');
  if (!dados.data_nascimento) throw new HttpError(400, 'Informe a data de nascimento.');
  for (const c of ALUNO_DATAS) if (dados[c] && !ehData(dados[c])) throw new HttpError(400, `Data inválida: ${c}.`);
  if (dados.data_nascimento > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'A data de nascimento não pode ser futura.');
  for (const [campo, valores] of Object.entries(OPCOES)) {
    if (dados[campo] && !valores.includes(dados[campo])) throw new HttpError(400, `Valor inválido para ${campo}.`);
  }
  if (dados.desconto_percentual != null) {
    const n = Number(dados.desconto_percentual);
    if (Number.isNaN(n) || n < 0 || n > 100) throw new HttpError(400, 'O desconto deve estar entre 0 e 100%.');
    dados.desconto_percentual = n;
  }
  if (dados.cpf) {
    if (!cpfValido(dados.cpf)) throw new HttpError(400, 'CPF inválido.');
    dados.cpf = formatarCpf(dados.cpf);
    const q = db('alunos').where({ cpf: dados.cpf }).whereNull('excluido_em');
    if (ignorarId) q.whereNot({ id: ignorarId });
    if (await q.first()) throw new HttpError(409, 'Já existe um aluno cadastrado com este CPF.');
  }
  for (const campo of ['pai_id', 'mae_id', 'resp_pedagogico_id']) {
    if (dados[campo] != null) {
      dados[campo] = Number(dados[campo]);
      if (!(await db('pessoas').where({ id: dados[campo] }).first())) throw new HttpError(400, 'Responsável vinculado não encontrado.');
    }
  }
  for (const j of ALUNO_JSON) if (j in body) dados[j] = JSON.stringify(body[j] ?? {});
  return dados;
}

router.post(
  '/',
  can('academico.alunos.inclusao', 1),
  wrap(async (req, res) => {
    const dados = await preparar(req.body);
    const [novo] = await db('alunos').insert({ ...dados, created_by: req.user.id, updated_by: req.user.id }).returning('id');
    res.status(201).json({ id: novo.id });
  }),
);

router.put(
  '/:id',
  can('academico.alunos.inclusao', 2),
  wrap(async (req, res) => {
    const atual = await db('alunos').where({ id: req.params.id }).whereNull('excluido_em').first();
    if (!atual) throw new HttpError(404, 'Aluno não encontrado.');
    const dados = await preparar(req.body, atual.id);
    await db('alunos').where({ id: atual.id }).update({ ...dados, updated_by: req.user.id, updated_at: db.fn.now() });
    res.json({ ok: true });
  }),
);

// Exclusão lógica (a regra real do SAE ainda não foi levantada — NC-13).
router.delete(
  '/:id',
  can('academico.alunos.excluir', 1),
  wrap(async (req, res) => {
    const n = await db('alunos').where({ id: req.params.id }).whereNull('excluido_em').update({ excluido_em: db.fn.now(), updated_by: req.user.id });
    if (!n) throw new HttpError(404, 'Aluno não encontrado.');
    res.json({ ok: true });
  }),
);

export default router;
