import { db } from '../db.js';
import { config } from '../config.js';
import { buscarSessao, encerrarSessao } from '../services/sessionService.js';
import { calcularPermissoes, dentroDoHorario, dataLimiteVencida } from '../services/accessService.js';

export async function carregarContexto(usuarioId) {
  const usuario = await db('usuarios').where({ id: usuarioId }).first();
  if (!usuario) return null;
  const grupo = usuario.grupo_id ? await db('grupos_permissao').where({ id: usuario.grupo_id }).first() : null;
  const linhas = usuario.grupo_id ? await db('grupo_permissoes').where({ grupo_id: usuario.grupo_id }) : [];
  const grupoPerms = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  const modulos = await db('habilitacoes').where({ ativo: true }).select('chave');
  const modulosAtivos = new Set(modulos.map((m) => m.chave));
  const permissoes = calcularPermissoes({ usuario, grupoPerms, extras: usuario.permissoes_extras, modulosAtivos });
  // professor entra no Diário de Classe sem depender do grupo (lança só nas disciplinas dele)
  if (usuario.professor && modulosAtivos.has('academico')) permissoes['academico.diario'] = Math.max(permissoes['academico.diario'] ?? 0, 1);
  return { usuario, grupo, permissoes, modulosAtivos };
}

// Motivo de bloqueio de acesso (ou null se liberado).
export function motivoBloqueio({ usuario, grupo }) {
  if (usuario.situacao !== 'Ativo') return 'Usuário inativo.';
  if (dataLimiteVencida(usuario.data_limite)) return 'O prazo de utilização do seu acesso expirou.';
  if (usuario.nivel !== 'Administrador' && grupo && !dentroDoHorario(grupo.horarios)) {
    return 'Acesso fora do horário permitido para o seu grupo.';
  }
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    const sessao = await buscarSessao(token);
    if (!sessao) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    const ctx = await carregarContexto(sessao.usuario_id);
    const bloqueio = ctx && motivoBloqueio(ctx);
    if (!ctx || bloqueio) {
      await encerrarSessao(token);
      return res.status(401).json({ error: bloqueio || 'Sessão inválida.' });
    }
    req.ctx = ctx;
    req.user = ctx.usuario;
    next();
  } catch (e) {
    next(e);
  }
}

// Exige permissão `chave` com índice >= min (ex.: tela: 1 = Apenas Consulta, 2 = Manutenção).
export const can = (chave, min = 1) => (req, res, next) => {
  if ((req.ctx.permissoes[chave] ?? 0) >= min) return next();
  res.status(403).json({ error: 'Você não tem acesso a esta funcionalidade.' });
};

export const requireAdmin = (req, res, next) => {
  if (req.user.nivel === 'Administrador') return next();
  res.status(403).json({ error: 'Apenas administradores podem executar esta ação.' });
};
