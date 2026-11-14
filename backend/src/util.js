export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const pick = (obj, campos) => {
  const out = {};
  for (const c of campos) if (obj && Object.prototype.hasOwnProperty.call(obj, c)) out[c] = obj[c];
  return out;
};

// '' vira null; textos são aparados.
export function limpar(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      const t = v.trim();
      out[k] = t === '' ? null : t;
    } else out[k] = v;
  }
  return out;
}

export function paginacao(query, padrao = 10) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const porPagina = Math.min(100, Math.max(1, parseInt(query.por_pagina, 10) || padrao));
  return { pagina, porPagina, offset: (pagina - 1) * porPagina };
}

export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function formatarCpf(cpf) {
  const d = soDigitos(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

export const ehData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Busca sem acento/caixa: aplique `semAcentoSql('coluna')` na coluna e `semAcento(termo)` no termo.
const DE = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const PARA = 'aaaaaeeeeiiiiooooouuuucn';
export const semAcentoSql = (col) => `translate(lower(${col}), '${DE}', '${PARA}')`;
export const semAcento = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[áàâãä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n');

export const emailValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || '').trim());
/** Escapa % _ \ para uso em LIKE (a busca trata esses caracteres como texto). */
export const likeSeguro = (s) => String(s ?? '').replace(/[\\%_]/g, (c) => `\\${c}`);
/** Valida e-mail (se informado), DDD numérico de 2 dígitos (se informado). */
export function validarContato(dados) {
  if (dados.email && !emailValido(dados.email)) throw new HttpError(400, 'E-mail inválido. Use o formato nome@dominio.com.');
  if (dados.ddd && !/^\d{2}$/.test(String(dados.ddd).trim())) throw new HttpError(400, 'DDD inválido: informe 2 números (ex.: 65).');
}
