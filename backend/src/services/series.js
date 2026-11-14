// Séries e etapas de ensino: um único lugar para normalizar o texto da série e descobrir a etapa.
// Regra da escola: Berçário→Nível II = Educação Infantil; 1º–5º ano = Fund. I; 6º–9º ano = Fund. II; 1ª–3ª série = Ensino Médio.

export const ETAPAS = {
  infantil: 'EDUCAÇÃO INFANTIL',
  fund1: 'ENSINO FUNDAMENTAL I',
  fund2: 'ENSINO FUNDAMENTAL II',
  medio: 'ENSINO MÉDIO',
};

/** Tira espaços sobrando (inclusive no meio do texto). Não muda maiúsculas/acentos. */
export const normTxt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Chave de comparação: sem espaços sobrando, sem acento e sem diferença de maiúsculas. */
export const chaveTxt = (s) => semAcento(normTxt(s)).toLowerCase();

/** Devolve 'infantil' | 'fund1' | 'fund2' | 'medio' | null (série desconhecida). */
export function etapaChave(serie) {
  const s = chaveTxt(serie);
  if (!s) return null;
  const n = Number(/(\d+)/.exec(s)?.[1]);
  if (/medio|\bem\b/.test(s)) return 'medio';
  if (/berc|maternal|nivel|jardim|infantil|(^|\s)pre(\s|-|$)/.test(s)) return 'infantil';
  if (/\bserie\b/.test(s) && !/\bano\b/.test(s) && n >= 1 && n <= 3) return 'medio';
  if (/\bano\b/.test(s)) {
    if (n >= 1 && n <= 5) return 'fund1';
    if (n >= 6 && n <= 9) return 'fund2';
  }
  return null;
}

/** Rótulo em maiúsculas para documentos ('' quando a série não é reconhecida). */
export const etapaDe = (serie) => ETAPAS[etapaChave(serie)] || '';

/** Nome curto da etapa para frases ("Ensino Fundamental", "Ensino Médio", "Educação Infantil"). */
export function etapaGeral(serie) {
  const k = etapaChave(serie);
  if (k === 'medio') return 'Ensino Médio';
  if (k === 'infantil') return 'Educação Infantil';
  if (k === 'fund1' || k === 'fund2') return 'Ensino Fundamental';
  return '';
}

/** Dada a lista de séries já cadastradas, devolve a grafia existente que equivale a `serie` (ou a própria, normalizada). */
export function serieCanonica(serie, existentes) {
  const n = normTxt(serie);
  const k = chaveTxt(n);
  return (existentes || []).find((x) => chaveTxt(x) === k) || n;
}

const ORDEM_ETAPA = { infantil: 0, fund1: 1, fund2: 2, medio: 3 };
const ORDEM_INFANTIL = [/berc/, /mini\s*maternal/, /maternal/, /nivel\s*(i|1)\b/, /nivel\s*(ii|2)\b/];

/** Posição da série na ordem da escola (Infantil → Fund. I → Fund. II → Médio). Série desconhecida vai para o fim. */
export function ordemSerie(serie) {
  const k = etapaChave(serie);
  if (!k) return 9999;
  const s = chaveTxt(serie);
  let sub = Number(/(\d+)/.exec(s)?.[1]) || 0;
  if (k === 'infantil') { const i = ORDEM_INFANTIL.findIndex((r) => r.test(s)); sub = i < 0 ? 50 + sub : i; }
  return ORDEM_ETAPA[k] * 100 + sub;
}

/** Comparador para sort(): por série na ordem da escola; empate segue pela ordem alfabética do texto. */
export const compararSerie = (a, b) => ordemSerie(a) - ordemSerie(b) || chaveTxt(a).localeCompare(chaveTxt(b), 'pt-BR');

/** "na 1ª série", "no 2º ano", "no Maternal"... Série vazia → ''. Desconhecida → "em <série>". */
export function nestaSerie(serie) {
  const s = normTxt(serie);
  if (!s) return '';
  if (/ª/.test(s) || /^(\d+\s*)?s[eé]rie/i.test(s)) return `na ${s}`;
  if (/º/.test(s) || /^(berç|berc|mini|maternal|n[ií]vel|jardim)/i.test(s)) return `no ${s}`;
  return `em ${s}`;
}
