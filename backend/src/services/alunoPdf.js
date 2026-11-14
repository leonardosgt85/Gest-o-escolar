// PDFs do relatório do aluno (A4 retrato): boletim, extrato de material/uniformes e relatório completo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'documentos');
const W = 595.28, H = 841.89, M = 40;
const azul = rgb(0.06, 0.11, 0.42), cinza = rgb(0.93, 0.94, 0.97), texto = rgb(0.08, 0.1, 0.23), mudo = rgb(0.35, 0.38, 0.5), vermelho = rgb(0.7, 0.1, 0.1);
const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const nota = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const dt = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const FORMAS = { cartao_credito: 'Cartão de crédito', pix: 'Pix', dinheiro: 'Dinheiro', boleto: 'Boleto', outro: 'Outro' };
const STATUS_ITEM = { em_aberto: 'Em aberto', parcial: 'Pago parcialmente', pago: 'Pago', isento: 'Isento' };

export async function gerar(d, secoes, titulo) {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(DIR, 'logo_csm.png'))); } catch { /* sem logo */ }
  const limpa = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/[^ -~¡-ÿ–—•]/g, '').trim();
  const corta = (s, w, size, f = reg) => { let t = limpa(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -1); return t; };
  let page, y, nPag = 0;
  const nova = () => {
    page = pdf.addPage([W, H]); nPag += 1; y = H - M;
    if (logo) page.drawImage(logo, { x: M, y: H - M - 36, width: 54, height: 36 });
    page.drawText('Colégio São Mateus', { x: M + 64, y: H - M - 14, size: 13, font: bold, color: azul });
    page.drawText(limpa(titulo), { x: M + 64, y: H - M - 30, size: 10, font: reg, color: mudo });
    const gerado = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
    page.drawText(gerado, { x: W - M - reg.widthOfTextAtSize(gerado, 8), y: H - M - 14, size: 8, font: reg, color: mudo });
    y = H - M - 56;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 1, color: azul });
    y -= 10;
  };
  const garante = (h) => { if (y - h < M + 20) nova(); };
  nova();

  const linhaAluno = [d.aluno.nome, d.matricula ? `${d.matricula.serie || ''}${d.matricula.turma ? ` ${d.matricula.turma}` : ''} · ${d.matricula.turno || ''}` : 'Sem matrícula no ano', `Ano letivo ${d.ano}`].filter(Boolean).join('  ·  ');
  page.drawText(corta(linhaAluno, W - 2 * M, 11, bold), { x: M, y, size: 11, font: bold, color: texto });
  y -= 24;

  const h2 = (t) => { garante(60); page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 20, color: cinza }); page.drawText(limpa(t), { x: M + 8, y: y + 2, size: 11, font: bold, color: azul }); y -= 26; };
  const tabela = (cols, linhas, { corCol } = {}) => {
    const tot = cols.reduce((s, c) => s + c.w, 0), esc = (W - 2 * M) / tot;
    const cab = () => { let x = M; for (const c of cols) { page.drawText(corta(c.t, c.w * esc - 6, 8, bold), { x: x + 3, y, size: 8, font: bold, color: mudo }); x += c.w * esc; } y -= 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: mudo }); y -= 12; };
    garante(40); cab();
    for (const l of linhas) {
      if (y < M + 30) { nova(); cab(); }
      let x = M;
      cols.forEach((c, i) => { const v = l[i]; const f = c.b ? bold : reg; page.drawText(corta(v, c.w * esc - 6, 9, f), { x: x + 3, y, size: 9, font: f, color: corCol?.(i, l) || texto }); x += c.w * esc; });
      y -= 3; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.3, color: cinza }); y -= 11;
    }
    y -= 8;
  };
  const kv = (rotulo, valor) => { garante(16); page.drawText(`${limpa(rotulo)}:`, { x: M, y, size: 9, font: bold, color: mudo }); page.drawText(corta(valor, W - 2 * M - 110, 9), { x: M + 110, y, size: 9, font: reg, color: texto }); y -= 14; };
  const vazio = (t) => { garante(20); page.drawText(limpa(t), { x: M, y, size: 9, font: reg, color: mudo }); y -= 18; };

  for (const s of secoes) {
    if (s === 'matricula') {
      h2('Matrícula e histórico');
      tabela([{ t: 'ANO', w: 1, b: 1 }, { t: 'TIPO', w: 2 }, { t: 'SÉRIE / TURNO', w: 3 }, { t: 'SITUAÇÃO', w: 2 }, { t: 'CONTRATO', w: 3 }], d.matriculas.map((m) => [m.ano, m.tipo, `${m.serie || '—'}${m.turno ? ` · ${m.turno}` : ''}`, m.statusRotulo, m.assinatura]));
    }
    if (s === 'notas') {
      h2(`Notas e desempenho — ${d.ano}`);
      if (!d.notas) vazio('Sem turma ou sem permissão para ver notas.');
      else for (const b of d.notas.bimestres.filter((x) => x.linhas.length)) {
        garante(60); page.drawText(`${b.bimestre}º bimestre${b.mediaGeral !== null ? `  ·  média geral ${nota(b.mediaGeral)}` : ''}`, { x: M, y, size: 10, font: bold, color: texto }); y -= 14;
        tabela([{ t: 'DISCIPLINA', w: 5, b: 1 }, { t: 'P.M.', w: 1 }, { t: 'P.B.', w: 1 }, { t: 'SIMULADO', w: 1.4 }, { t: 'MÉDIA', w: 1.2, b: 1 }, { t: 'FALTAS', w: 1.2 }], b.linhas.map((l) => [l.disciplina, nota(l.pm), nota(l.pb), nota(l.sim), nota(l.media), l.faltas]), { corCol: (i, l) => (i === 4 && l[4] !== '' && Number(String(l[4]).replace(',', '.')) < 6 ? vermelho : null) });
      }
      if (d.notas && !d.notas.bimestres.some((x) => x.linhas.length)) vazio('Nenhuma nota lançada neste ano.');
    }
    if (s === 'frequencia') {
      h2('Frequência');
      if (!d.frequencia) vazio('Sem turma ou sem permissão para ver a frequência.');
      else {
        kv('Aulas dadas', String(d.frequencia.dadas)); kv('Faltas', String(d.frequencia.faltas)); kv('Presença', d.frequencia.presenca === null ? '—' : `${nota(d.frequencia.presenca)}%`); y -= 4;
        tabela([{ t: 'DISCIPLINA', w: 5, b: 1 }, { t: 'AULAS DADAS', w: 2 }, { t: 'FALTAS', w: 2 }], d.frequencia.disciplinas.map((x) => [x.disciplina, x.dadas, x.faltas]));
      }
    }
    if (s === 'material') {
      h2('Material didático e uniformes');
      if (!d.material) vazio('Sem permissão para ver material e uniformes.');
      else if (!d.material.itens.length) vazio('Nenhum item registrado neste ano.');
      else {
        kv('Total', brl(d.material.resumo.total)); kv('Pago', brl(d.material.resumo.pago)); kv('Saldo', brl(d.material.resumo.saldo)); y -= 6;
        for (const i of d.material.itens) {
          garante(70);
          page.drawText(corta(`${i.descricao}${i.tamanho ? ` · ${i.tamanho}` : ''}${i.quantidade > 1 ? ` · ${i.quantidade} un.` : ''}`, W - 2 * M - 130, 10, bold), { x: M, y, size: 10, font: bold, color: texto });
          const st = `${STATUS_ITEM[i.status]} — ${brl(i.pago)} de ${brl(i.valor_total)}`; page.drawText(st, { x: W - M - reg.widthOfTextAtSize(st, 9), y, size: 9, font: reg, color: texto }); y -= 14;
          const ent = i.etapas.map((e) => `${i.por_bimestre ? `${e.bimestre}º bim.` : 'Entrega'}: ${!e.aplica ? 'não se aplica' : e.entregue ? `entregue${e.data_entrega ? ` em ${dt(e.data_entrega)}` : ''}` : 'pendente'}`).join('   ');
          page.drawText(corta(ent, W - 2 * M, 8.5), { x: M, y, size: 8.5, font: reg, color: mudo }); y -= 14;
          if (i.pagamentos.length) tabela([{ t: 'DATA', w: 2 }, { t: 'FORMA', w: 4 }, { t: 'VALOR', w: 2, b: 1 }], i.pagamentos.map((p) => [dt(p.data), `${FORMAS[p.forma] || p.forma}${p.forma === 'cartao_credito' && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}`, brl(p.valor)]));
          else y -= 6;
        }
      }
    }
    if (s === 'documentos') {
      h2('Documentos entregues à secretaria');
      if (!d.documentos.length) vazio('Sem matrícula neste ano.');
      else tabela([{ t: 'DOCUMENTO', w: 6, b: 1 }, { t: 'SITUAÇÃO', w: 2 }], d.documentos.map((x) => [x.rotulo, x.ok ? 'Entregue' : 'Pendente']), { corCol: (i, l) => (i === 1 && l[1] === 'Pendente' ? vermelho : null) });
    }
    if (s === 'responsaveis') {
      h2('Responsáveis e contatos');
      if (!d.responsaveis.length) vazio('Nenhum responsável cadastrado.');
      else tabela([{ t: 'NOME', w: 4, b: 1 }, { t: 'VÍNCULO', w: 3 }, { t: 'TELEFONE', w: 3 }, { t: 'E-MAIL', w: 4 }], d.responsaveis.map((r) => [r.nome, r.papel, r.fone || '', r.email || '']));
    }
  }
  const n = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => { const t = `Página ${i + 1} de ${n}`; p.drawText(t, { x: W - M - reg.widthOfTextAtSize(t, 8), y: 20, size: 8, font: reg, color: mudo }); });
  return Buffer.from(await pdf.save());
}
