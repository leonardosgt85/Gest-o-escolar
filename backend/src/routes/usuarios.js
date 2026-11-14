import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { can } from '../middleware/auth.js';
import { dataLimiteVencida } from '../services/accessService.js';
import { NIVEIS_USUARIO, codigoValor, normalizarPermissoes } from '../permissions/catalog.js';
import { HttpError, ehData, limpar, pick, semAcento, semAcentoSql, wrap } from '../util.js';

const router = Router();

const CAMPOS = ['nome_completo', 'email', 'nivel', 'situacao', 'grupo_id', 'cargo', 'data_limite', 'comissao_vendas', 'setor', 'foto', 'professor'];
const COLUNAS_PUBLICAS = [
  'u.id', 'u.nome_completo', 'u.email', 'u.nivel', 'u.situacao', 'u.grupo_id', 'u.cargo', 'u.data_limite',
  'u.comissao_vendas', 'u.setor', 'u.professor', 'u.outras_informacoes', 'u.permissoes_extras', 'u.ultimo_acesso',
  'g.nome as grupo_nome',
];

// Lista
router.get(
  '/',
  can('gerencial.usuarios', 1),
  wrap(async (req, res) => {
    const q = db('usuarios as u').leftJoin('grupos_permissao as g', 'g.id', 'u.grupo_id').select(COLUNAS_PUBLICAS).orderBy('u.nome_completo');
    if (req.query.somente_ativos !== 'false') q.where('u.situacao', 'Ativo');
    if (req.query.q) {
      const t = `%${semAcento(req.query.q)}%`;
      q.where((b) =>
        b.whereRaw(`${semAcentoSql('u.nome_completo')} like ?`, [t]).orWhereRaw('lower(u.email) like ?', [t]).orWhereRaw(`${semAcentoSql("coalesce(u.cargo, '')")} like ?`, [t]),
      );
    }
    res.json((await q).map((u) => ({ ...u, permissoes_extras: normalizarPermissoes(u.permissoes_extras), expirado: dataLimiteVencida(u.data_limite) })));
  }),
);

router.get(
  '/:id',
  can('gerencial.usuarios', 1),
  wrap(async (req, res) => {
    const u = await db('usuarios as u').leftJoin('grupos_permissao as g', 'g.id', 'u.grupo_id').select([...COLUNAS_PUBLICAS, 'u.foto']).where('u.id', req.params.id).first();
    if (!u) throw new HttpError(404, 'Usuário não encontrado.');
    u.permissoes_extras = normalizarPermissoes(u.permissoes_extras);
    u.disciplinas_ids = (await db('usuario_disciplinas').where({ usuario_id: u.id }).select('disciplina_id')).map((r) => r.disciplina_id);
    res.json(u);
  }),
);

function validar(dados, { criando, body }) {
  if (dados.professor === true && Array.isArray(body?.disciplinas_ids) && body.disciplinas_ids.length === 0) throw new HttpError(400, 'Marque ao menos uma disciplina para o professor.');
  if (criando || 'nome_completo' in dados) if (!dados.nome_completo) throw new HttpError(400, 'Informe o nome completo.');
  if (criando || 'email' in dados) {
    if (!dados.email || !/^\S+@\S+\.\S+$/.test(dados.email)) throw new HttpError(400, 'Informe um e-mail válido (é o login do usuário).');
  }
  if (dados.professor !== undefined && typeof dados.professor !== 'boolean') throw new HttpError(400, 'Valor inválido para "É professor".');
  if (dados.nivel && !NIVEIS_USUARIO.includes(dados.nivel)) throw new HttpError(400, 'Nível inválido.');
  if (dados.situacao && !['Ativo', 'Inativo'].includes(dados.situacao)) throw new HttpError(400, 'Situação inválida.');
  if (dados.data_limite && !ehData(dados.data_limite)) throw new HttpError(400, 'Data limite inválida.');
  if (dados.comissao_vendas != null && (Number(dados.comissao_vendas) < 0 || Number(dados.comissao_vendas) > 100)) {
    throw new HttpError(400, 'A comissão deve estar entre 0 e 100%.');
  }
}

// Disciplinas do professor (várias por professor; a mesma disciplina pode ter vários professores).
async function salvarDisciplinas(usuarioId, body, professor) {
  if (!Array.isArray(body.disciplinas_ids) && professor !== false) return;
  const ids = professor === false ? [] : [...new Set(body.disciplinas_ids.map(Number).filter(Number.isInteger))];
  if (ids.length) {
    const ok = await db('disciplinas').whereIn('id', ids).pluck('id');
    if (ok.length !== ids.length) throw new HttpError(400, 'Disciplina inválida na lista.');
  }
  await db('usuario_disciplinas').where({ usuario_id: usuarioId }).del();
  if (ids.length) await db('usuario_disciplinas').insert(ids.map((d) => ({ usuario_id: usuarioId, disciplina_id: d })));
}

function extras(body) {
  const out = {};
  for (const [k, v] of Object.entries(body.permissoes_extras || {})) { const c = codigoValor(k, v); if (c !== null) out[k] = c; } // guarda o código, não o rótulo
  return out;
}

// Somente administradores concedem o nível Administrador.
function checarNivel(req, dados) {
  if (dados.nivel === 'Administrador' && req.user.nivel !== 'Administrador') {
    throw new HttpError(403, 'Apenas administradores podem conceder o nível Administrador.');
  }
}

router.post(
  '/',
  can('gerencial.usuarios', 2),
  wrap(async (req, res) => {
    const dados = limpar(pick(req.body, CAMPOS));
    validar(dados, { criando: true, body: req.body });
    checarNivel(req, dados);
    const senha = String(req.body.senha || '');
    if (senha.length < 6) throw new HttpError(400, 'A senha deve ter ao menos 6 caracteres.');
    dados.email = dados.email.toLowerCase();
    if (await db('usuarios').whereRaw('lower(email) = ?', [dados.email]).first()) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
    const [novo] = await db('usuarios')
      .insert({
        ...dados,
        senha_hash: await bcrypt.hash(senha, 10),
        outras_informacoes: JSON.stringify(req.body.outras_informacoes || {}),
        permissoes_extras: JSON.stringify(extras(req.body)),
      })
      .returning('id');
    await salvarDisciplinas(novo.id, req.body, dados.professor === false ? false : undefined);
    res.status(201).json({ id: novo.id });
  }),
);

router.put(
  '/:id',
  can('gerencial.usuarios', 2),
  wrap(async (req, res) => {
    const atual = await db('usuarios').where({ id: req.params.id }).first();
    if (!atual) throw new HttpError(404, 'Usuário não encontrado.');
    const dados = limpar(pick(req.body, CAMPOS));
    validar(dados, { criando: false, body: req.body });
    checarNivel(req, dados);
    if (atual.nivel === 'Administrador' && req.user.nivel !== 'Administrador') {
      throw new HttpError(403, 'Apenas administradores podem alterar outro administrador.');
    }
    if (dados.email) {
      dados.email = dados.email.toLowerCase();
      const dup = await db('usuarios').whereRaw('lower(email) = ?', [dados.email]).whereNot({ id: atual.id }).first();
      if (dup) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
    }
    // não permite que o único administrador ativo se rebaixe/inative
    if (Number(req.params.id) === req.user.id && (dados.situacao === 'Inativo' || (dados.nivel && dados.nivel !== 'Administrador' && atual.nivel === 'Administrador'))) {
      const outros = await db('usuarios').where({ nivel: 'Administrador', situacao: 'Ativo' }).whereNot({ id: atual.id }).count('id as n').first();
      if (Number(outros.n) === 0) throw new HttpError(400, 'Este é o único administrador ativo; não é possível inativá-lo ou rebaixá-lo.');
    }
    const upd = { ...dados, updated_at: db.fn.now() };
    if (req.body.outras_informacoes) upd.outras_informacoes = JSON.stringify(req.body.outras_informacoes);
    if (req.body.permissoes_extras) upd.permissoes_extras = JSON.stringify(extras(req.body));
    if (req.body.senha) {
      if (String(req.body.senha).length < 6) throw new HttpError(400, 'A senha deve ter ao menos 6 caracteres.');
      upd.senha_hash = await bcrypt.hash(String(req.body.senha), 10);
    }
    await db('usuarios').where({ id: atual.id }).update(upd);
    await salvarDisciplinas(atual.id, req.body, 'professor' in dados && !dados.professor ? false : undefined);
    // inativar derruba as sessões abertas
    if (dados.situacao === 'Inativo') await db('sessoes').where({ usuario_id: atual.id }).del();
    res.json({ ok: true });
  }),
);

export default router;
