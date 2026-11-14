/** "na 1ª série", "no 2º ano", "no Maternal"; série vazia → ''; desconhecida → "em <série>". */
export function nestaSerie(serie?: string | null): string {
  const s = (serie ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/ª/.test(s) || /^(\d+\s*)?s[eé]rie/i.test(s)) return `na ${s}`;
  if (/º/.test(s) || /^(berç|berc|mini|maternal|n[ií]vel|jardim)/i.test(s)) return `no ${s}`;
  return `em ${s}`;
}
