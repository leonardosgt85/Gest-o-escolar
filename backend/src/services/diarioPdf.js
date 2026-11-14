// PDF do Diário de Classe mensal (A4 paisagem): chamada do mês + provas do bimestre + conteúdo ministrado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'documentos');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const W = 841.89, H = 595.28, M = 24;
const azul = rgb(0.1, 0.2, 0.55), preto = rgb(0, 0, 0), cinza = rgb(0.9, 0.9, 0.9), vermelho = rgb(0.75, 0.1, 0.1);

export async function gerarPdf(d) {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(DIR, 'logo_csm.png'))); } catch { /* sem logo */ }
  const limpa = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/[^ -~¡-ÿ–—•]/g, '').trim();
  const nota = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const corta = (s, w, size, f = reg) => { let t = limpa(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -1); return t; };
  const quebra = (s, w, size) => {
    const out = []; let linha = '';
    for (const p of limpa(s).split(' ')) {
      const t = linha ? `${linha} ${p}` : p;
      if (reg.widthOfTextAtSize(t, size) <= w) linha = t; else { if (linha) out.push(linha); linha = p; }
    }
    if (linha) out.push(linha);
    return out.length ? out : [''];
  };

  const turmaTxt = `${d.turma.serie} ${d.turma.nome}`;
  const titulo2 = `Série: ${limpa(d.turma.serie)}  ·  Turma: ${limpa(d.turma.nome)}  ·  Turno: ${limpa(d.turma.turno)}  ·  ${MESES[d.mes - 1]}/${d.ano}  ·  ${d.bimestre}º Bimestre`;
  const titulo3 = `Componente Curricular: ${limpa(d.disciplina.nome)}  ·  Professor(a): ${limpa(d.professores.join(', ')) || '________________________'}`;

  let page;
  const cabecalho = (continuacao) => {
    page = pdf.addPage([W, H]);
    if (logo) page.drawImage(logo, { x: M, y: H - M - 38, width: 56, height: 38 });
    const c = (t, y, size, f) => { const s = limpa(t); page.drawText(s, { x: (W - f.widthOfTextAtSize(s, size)) / 2, y, size, font: f, color: preto }); };
    c('Diário de Classe — Mensal', H - M - 14, 15, bold);
    c(titulo2, H - M - 29, 8.5, bold);
    c(titulo3, H - M - 41, 8.5, bold);
    if (continuacao) page.drawText('(continuação)', { x: W - M - 60, y: H - M - 10, size: 7, font: reg, color: preto });
    return H - M - 54;
  };
  const rodape = () => {
    const hoje = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });
    page.drawText(limpa(`${turmaTxt} · ${d.disciplina.nome} · emitido em ${hoje}`), { x: M, y: 12, size: 6.5, font: reg, color: rgb(0.4, 0.4, 0.4) });
  };
  const celula = (x, y, w, h, texto, { f = reg, size = 7, fill, align = 'center', cor = preto } = {}) => {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: preto, borderWidth: 0.4, color: fill });
    const s = corta(texto, w - 3, size, f);
    if (!s) return;
    const tw = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'left' ? x + 2 : x + (w - tw) / 2, y: y + (h - size) / 2 + 1, size, font: f, color: cor });
  };

  /* ---------- 1) chamada do mês ---------- */
  const N = d.diasNoMes;
  const wNum = 18, wNome = 170, wFal = 34, wNota = 30, wMg = 38;
  const wDia = (W - 2 * M - wNum - wNome - wFal - 3 * wNota - wMg) / N;
  const hL = 12, hH = 11;
  const xNome = M + wNum, xDia = xNome + wNome, xFal = xDia + wDia * N;
  const colDia = (i) => xDia + wDia * i;
  const fimSemana = (dia) => { const w = new Date(d.ano, d.mes - 1, dia).getDay(); return w === 0 || w === 6; };

  const cabTabela = (y) => {
    celula(M, y - 2 * hH, wNum, 2 * hH, 'Nº', { f: bold });
    celula(xNome, y - 2 * hH, wNome, 2 * hH, 'NOME DO ALUNO', { f: bold, fill: cinza });
    for (let i = 0; i < N; i += 1) {
      const dia = i + 1;
      celula(colDia(i), y - hH, wDia, hH, String(dia), { f: bold, size: 6.5, fill: fimSemana(dia) ? cinza : undefined });
      celula(colDia(i), y - 2 * hH, wDia, hH, SEM[new Date(d.ano, d.mes - 1, dia).getDay()], { size: 6, fill: fimSemana(dia) ? cinza : undefined });
    }
    celula(colDia(0), y, wDia * N, hH, 'ANOTAÇÕES DA FREQUÊNCIA DAS AULAS', { f: bold, size: 6.5, fill: cinza });
    [['FALTAS', wFal], ['P.M.', wNota], ['P.B.', wNota], ['Sim.', wNota], ['M. Geral', wMg]].reduce((x, [t, w]) => { celula(x, y - 2 * hH, w, 2 * hH, t, { f: bold, fill: cinza }); return x + w; }, xFal);
    return y - 2 * hH;
  };

  let y = cabecalho(false);
  y = cabTabela(y);
  const minimo = d.linhas.length < 25 ? 25 : d.linhas.length; // folha com linhas em branco, como o modelo de papel
  for (let i = 0; i < minimo; i += 1) {
    if (y - hL < 70) { rodape(); y = cabTabela(cabecalho(true)); }
    const l = d.linhas[i];
    y -= hL;
    celula(M, y, wNum, hL, l ? String(i + 1) : '', { size: 6.5 });
    celula(xNome, y, wNome, hL, l?.nome ?? '', { align: 'left', size: 7 });
    for (let k = 0; k < N; k += 1) {
      const dia = k + 1, mk = l?.marcas[dia];
      celula(colDia(k), y, wDia, hL, mk === 'F' ? 'F' : mk === 'P' ? '•' : '', { f: mk === 'F' ? bold : reg, size: mk === 'F' ? 7 : 8, fill: fimSemana(dia) ? rgb(0.95, 0.95, 0.95) : undefined, cor: mk === 'F' ? vermelho : preto });
    }
    celula(xFal, y, wFal, hL, l ? String(l.faltas) : '', { f: bold });
    celula(xFal + wFal, y, wNota, hL, l ? nota(l.pm) : '');
    celula(xFal + wFal + wNota, y, wNota, hL, l ? nota(l.pb) : '');
    celula(xFal + wFal + 2 * wNota, y, wNota, hL, l ? nota(l.sim) : '');
    celula(xFal + wFal + 3 * wNota, y, wMg, hL, l ? nota(l.media) : '', { f: bold });
  }
  // linha de aulas dadas no dia
  if (y - hL < 50) { rodape(); y = cabTabela(cabecalho(true)); }
  y -= hL;
  celula(M, y, wNum + wNome, hL, 'AULAS DADAS NO DIA', { f: bold, align: 'left', fill: cinza, size: 6.5 });
  const porDia = Object.fromEntries(d.aulas.map((a) => [a.dia, a.aulas]));
  for (let k = 0; k < N; k += 1) celula(colDia(k), y, wDia, hL, porDia[k + 1] ? String(porDia[k + 1]) : '', { size: 6.5, fill: fimSemana(k + 1) ? rgb(0.95, 0.95, 0.95) : undefined });
  const totalAulas = d.aulas.reduce((s, a) => s + a.aulas, 0);
  celula(xFal, y, wFal + 3 * wNota + wMg, hL, `Total no mês: ${totalAulas}`, { f: bold, size: 6.5, fill: cinza });
  page.drawText('•  presente      F  falta (conta pelo nº de aulas do dia)      P.M./P.B./Sim. e M. Geral = notas do bimestre (média simples)', { x: M, y: y - 11, size: 6.5, font: reg, color: preto });
  rodape();

  /* ---------- 2) conteúdo ministrado ---------- */
  const wData = 70, wAul = 40, wCont = W - 2 * M - wData - wAul;
  const cabConteudo = (cont) => {
    let yy = cabecalho(cont);
    page.drawText('CONTEÚDO MINISTRADO', { x: M, y: yy - 4, size: 9, font: bold, color: azul });
    yy -= 12;
    celula(M, yy - 14, wData, 14, 'DATA', { f: bold, fill: cinza });
    celula(M + wData, yy - 14, wAul, 14, 'AULAS', { f: bold, fill: cinza });
    celula(M + wData + wAul, yy - 14, wCont, 14, 'CONTEÚDO / ATIVIDADE', { f: bold, fill: cinza });
    return yy - 14;
  };
  y = cabConteudo(false);
  if (!d.aulas.length) { celula(M, y - 16, W - 2 * M, 16, 'Nenhuma aula lançada neste mês.', { align: 'left' }); y -= 16; }
  for (const a of d.aulas) {
    const linhas = quebra(a.conteudo || '—', wCont - 6, 8);
    const h = Math.max(15, linhas.length * 10 + 5);
    if (y - h < 60) { rodape(); y = cabConteudo(true); }
    y -= h;
    const dt = new Date(`${a.data}T12:00:00`);
    celula(M, y, wData, h, `${a.data.slice(8, 10)}/${a.data.slice(5, 7)} (${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dt.getDay()]})`);
    celula(M + wData, y, wAul, h, String(a.aulas));
    page.drawRectangle({ x: M + wData + wAul, y, width: wCont, height: h, borderColor: preto, borderWidth: 0.4 });
    linhas.forEach((t, i) => page.drawText(t, { x: M + wData + wAul + 3, y: y + h - 11 - i * 10, size: 8, font: reg, color: preto }));
  }
  if (y - 70 < 40) { rodape(); y = cabConteudo(true); }
  y -= 12;
  page.drawText(`Total: ${d.aulas.length} dia(s) com aula · ${totalAulas} aula(s) no mês.`, { x: M, y, size: 8, font: bold, color: preto });
  y -= 44;
  for (const [i, t] of ['Professor(a)', 'Coordenação pedagógica'].entries()) {
    const x = M + i * 330;
    page.drawLine({ start: { x, y }, end: { x: x + 260, y }, thickness: 0.5, color: preto });
    page.drawText(t, { x: x + (260 - reg.widthOfTextAtSize(t, 8)) / 2, y: y - 10, size: 8, font: reg, color: preto });
  }
  rodape();
  return Buffer.from(await pdf.save());
}
