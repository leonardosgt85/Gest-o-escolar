// Séries já cadastradas (turmas e matriz): usadas para gravar sempre a mesma grafia.
import { db } from '../db.js';
import { normTxt, serieCanonica } from './series.js';

export async function seriesCadastradas() {
  const [a, b] = await Promise.all([db('turmas').distinct('serie'), db('matriz_curricular').distinct('serie')]);
  return [...new Set([...a, ...b].map((x) => x.serie))];
}

/** Série digitada → grafia já existente (sem diferença de espaços/maiúsculas/acento) ou o texto limpo. */
export async function serieNormalizada(serie) {
  const n = normTxt(serie);
  return n ? serieCanonica(n, await seriesCadastradas()) : '';
}
