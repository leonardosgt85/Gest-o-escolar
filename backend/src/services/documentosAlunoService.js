// Documentos do aluno (Gestão Acadêmica › Relatórios › Documentos do aluno):
// Atestado de Conclusão, Atestado de Escolaridade (.docx a partir dos modelos) e Histórico Escolar (PDF).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { etapaDe, etapaGeral, nestaSerie } from './series.js';
import { db } from '../db.js';
import { HttpError } from '../util.js';
import { carregar } from './documentosService.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'documentos');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const TIPOS = {
  conclusao: { nome: 'Atestado de Conclusão', arquivo: 'atestado_conclusao.docx' },
  escolaridade: { nome: 'Atestado de Escolaridade', arquivo: 'atestado_escolaridade.docx' },
  historico: { nome: 'Histórico Escolar do Ensino Fundamental' },
};

const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Cuiaba' });
function extenso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso));
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
}
function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
const maiusc = (s) => txt(s).toLocaleUpperCase('pt-BR');
const dataIso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : txt(v).slice(0, 10));

const TURNOS = { manhã: 'MATUTINO', manha: 'MATUTINO', matutino: 'MATUTINO', tarde: 'VESPERTINO', vespertino: 'VESPERTINO', integral: 'INTEGRAL' };

/* ---------- dados sugeridos para a tela ---------- */
export async function sugestoes(alunoId) {
  const { aluno, responsaveis } = await carregar(alunoId);
  const mats = await db('matriculas').where({ aluno_id: alunoId }).orderBy([{ column: 'ano', order: 'desc' }, { column: 'id', order: 'desc' }]);
  const mat = mats.find((m) => m.status === 'ativa') || mats[0] || null;
  const pai = txt(responsaveis.pai?.nome);
  const mae = txt(responsaveis.mae?.nome);
  const financ = { Pai: 'pai', 'Mãe': 'mae', Outros: 'resp_pedagogico' }[aluno.tipo_resp_financ];
  const resp = txt((financ && responsaveis[financ]?.nome) || mae || pai || responsaveis.resp_pedagogico?.nome);
  const nat = [txt(aluno.naturalidade), txt(aluno.naturalidade_uf)].filter(Boolean).join('/');
  const ano = mat?.ano || new Date().getFullYear();
  const serie = txt(mat?.serie);
  const base = {
    nome: maiusc(aluno.nome_completo),
    nascimento: dataIso(aluno.data_nascimento),
    naturalidade: nat,
    nacionalidade: maiusc(aluno.nacionalidade) || 'BRASILEIRA',
    sexo: aluno.sexo || '',
    pai: maiusc(pai),
    mae: maiusc(mae),
    data: hojeIso(),
  };
  return {
    aluno: { id: aluno.id, nome: aluno.nome_completo, matricula: aluno.matricula || '' },
    matricula: mat ? { ano: mat.ano, serie, turno: mat.turno, status: mat.status } : null,
    avisos: {
      conclusao: mat && mat.status !== 'concluida' ? `A matrícula ${mat.ano} ainda não foi concluída (situação: ${mat.status === 'ativa' ? 'em curso' : mat.status}). O atestado de conclusão só vale depois do fim do ano letivo.` : '',
    },
    conclusao: { ...base, serie_concluida: serie ? `${serie}${etapaGeral(serie) ? ` do ${etapaGeral(serie)}` : ''}` : '', ano_letivo: String(ano - (mat?.status === 'ativa' ? 0 : 0)) },
    escolaridade: {
      nome: base.nome,
      matricula_num: txt(aluno.matricula),
      serie: maiusc(serie),
      etapa: etapaDe(serie),
      ano_letivo: String(ano),
      turno: TURNOS[txt(mat?.turno).toLowerCase()] || '',
      responsavel: maiusc(resp),
      data: hojeIso(),
    },
    historico: {
      ...base,
      obs: '',
      etapa_titulo: (etapaGeral(serie) || 'Ensino Fundamental').toUpperCase(),
      secretario: 'Sérgio Araújo Fleury',
      diretora: 'Valmeria Victor Fleury',
    },
  };
}

/* ---------- atestados (.docx) ---------- */
function runs(rpr, partes) {
  const normal = rpr.replace(/<w:b\/>|<w:bCs\/>/g, '');
  const negrito = normal.includes('<w:rPr>') ? normal.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>') : '<w:rPr><w:b/><w:bCs/></w:rPr>';
  return partes
    .filter((p) => p.t !== '')
    .map((p) => `<w:r>${p.b ? negrito : normal}<w:t xml:space="preserve">${esc(p.t)}</w:t></w:r>`)
    .join('');
}
// Troca o conteúdo do parágrafo que começa com `inicio`, mantendo propriedades de parágrafo e fonte.
function trocar(xml, inicio, partes, ultimo = false, corpo = false) {
  let achou = false;
  const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    if (achou) return p;
    const texto = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
    if (!texto.replace(/&amp;/g, '&').trimStart().startsWith(inicio)) return p;
    achou = true;
    let ppr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] || '';
    if (corpo) {
      ppr = ppr.replace(/<w:jc [^>]*\/>/, '').replace(/<w:ind [^>]*\/>/, '');
      ppr = ppr.replace(/(<w:spacing [^>]*\/>)?(?=<w:rPr>|<\/w:pPr>)/, (m) => `${m}<w:ind w:firstLine="1417"/><w:jc w:val="both"/>`);
    }
    if (ultimo) ppr = ppr.replace(/<w:jc [^>]*\/>/, '<w:jc w:val="right"/>').replace(/<w:ind [^>]*\/>/, '<w:ind w:end="424"/>');
    const abre = /^<w:p[^>]*>/.exec(p)[0];
    const rprs = [...p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map((m) => /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(m[0])?.[0] || '');
    const rpr = ultimo ? rprs[1] || rprs[rprs.length - 1] || '' : rprs.find((r) => r && !/<w:b\/>/.test(r)) || rprs[0] || '';
    return `${abre}${ppr}${runs(rpr, partes)}</w:p>`;
  });
  if (!achou) throw new HttpError(500, `Modelo do documento mudou: parágrafo "${inicio}" não encontrado.`);
  return out;
}
function docx(arquivo, edicoes) {
  const zip = new PizZip(fs.readFileSync(path.join(DIR, arquivo)));
  let xml = zip.file('word/document.xml').asText();
  for (const [inicio, partes, ultimo, corpo] of edicoes) xml = trocar(xml, inicio, partes, ultimo, corpo);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
const exige = (d, campos) => {
  const falta = campos.filter(([k]) => !txt(d[k])).map(([, r]) => r);
  if (falta.length) throw new HttpError(400, `Preencha: ${falta.join(', ')}.`);
};

function atestadoConclusao(d) {
  exige(d, [['nome', 'nome do aluno'], ['nascimento', 'data de nascimento'], ['serie_concluida', 'série concluída'], ['ano_letivo', 'ano letivo'], ['data', 'data']]);
  const filho = /^f/i.test(txt(d.sexo)) ? 'filha' : 'filho';
  const pais = [txt(d.pai), txt(d.mae)].filter(Boolean);
  const filiacao = pais.length ? `, ${filho} de ` : '';
  const p1 = [
    { t: 'Declaramos, para os devidos fins e direitos, que ' },
    { t: maiusc(d.nome), b: true },
    { t: `${txt(d.naturalidade) ? `, natural de ${txt(d.naturalidade)}` : ''}, nascido em ${extenso(d.nascimento)}${filiacao}` },
  ];
  pais.forEach((p, i) => { if (i) p1.push({ t: ' e ' }); p1.push({ t: maiusc(p), b: true }); });
  p1.push({ t: `, foi aluno regularmente matriculado neste estabelecimento de ensino, concluindo ${/^(\d+\s*)?º|^(berç|berc|mini|maternal|n[ií]vel|jardim)/i.test(txt(d.serie_concluida)) ? 'o' : 'a'} ${txt(d.serie_concluida)} no ano letivo de ${txt(d.ano_letivo)}. ` });
  const p2 = [{ t: 'Declaramos que a emissão do Histórico Escolar e do Certificado de Conclusão encontra-se em fase de registro.' }];
  return docx(TIPOS.conclusao.arquivo, [
    ['ATESTADO DE ESCOLARIDADE', [{ t: 'ATESTADO DE CONCLUSÃO', b: true }]],
    ['Declaramos para os devidos fins', p1, false, true],
    ['O (a) referido', p2, false, true],
    ['Por ser verdade', [{ t: 'Por ser expressão da verdade, firmamos a presente, em duas vias de igual teor, sem rasuras.' }], false, true],
    ['Cuiabá', [{ t: `Cuiabá – MT, ${extenso(d.data)}.` }]],
  ]);
}

function atestadoEscolaridade(d) {
  exige(d, [['nome', 'nome do aluno'], ['serie', 'série/ano'], ['ano_letivo', 'ano letivo'], ['turno', 'período'], ['responsavel', 'representante legal'], ['data', 'data']]);
  const p1 = [
    { t: 'Declaramos para os devidos fins que o (a) aluno (a) ' },
    { t: maiusc(d.nome), b: true },
    { t: ` está devidamente matriculado (a) nesta instituição de ensino,${txt(d.matricula_num) ? ` matrícula Nº ${txt(d.matricula_num)}` : ''} ${nestaSerie(d.serie).split(' ')[0] || 'no'} ${maiusc(d.serie)}${txt(d.etapa) ? ` do ${maiusc(d.etapa)}` : ''} no Ano Letivo de ${txt(d.ano_letivo)}.` },
  ];
  const p2 = [
    { t: 'O (a) referido (a) aluno (a) frequenta regularmente as aulas no período ' },
    { t: maiusc(d.turno), b: true },
    { t: ', tendo como seu representante legal o (a) Sr. ' },
    { t: maiusc(d.responsavel), b: true },
    { t: '.' },
  ];
  return docx(TIPOS.escolaridade.arquivo, [
    ['Declaramos para os devidos fins', p1, false, true],
    ['O (a) referido', p2, false, true],
    ['Por ser verdade', [{ t: 'Por ser verdade assino o presente.' }], false, true],
    ['Cuiabá', [{ t: `Cuiabá – MT, ${extenso(d.data)}.` }]],
  ]);
}

/* ---------- histórico escolar (PDF) ---------- */
export const DISCIPLINAS_PADRAO = [
  'CIÊNCIAS', 'EDUCAÇÃO ARTÍSTICA', 'MUSICALIZAÇÃO', 'EDUCAÇÃO FÍSICA', 'ENSINO RELIGIOSO', 'ENS. POR ATIVIDADE', 'GEOGRAFIA',
  'HISTÓRIA', 'INGLÊS', 'ESPANHOL', 'LÍNGUA PORTUGUESA', 'MATEMÁTICA', 'EDUCAÇÃO FINANCEIRA',
];

async function historicoPdf(d) {
  exige(d, [['nome', 'nome do aluno'], ['data', 'data']]);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const preto = rgb(0, 0, 0);
  const cinza = rgb(0.85, 0.85, 0.85);
  const H = 841.89;
  const L = 28;
  const W = 539;
  const limpa = (s) => String(s ?? '').replace(/[^ -ÿ–—]/g, '');
  const centro = (t, x, y, w, size = 7, f = reg) => {
    const s = limpa(t);
    const tw = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: x + (w - tw) / 2, y, size, font: f, color: preto });
  };
  const caixa = (x, y, w, h, fill) => page.drawRectangle({ x, y, width: w, height: h, borderColor: preto, borderWidth: 0.6, color: fill });
  let y = H - 28;

  // cabeçalho
  try {
    const logo = await pdf.embedPng(fs.readFileSync(path.join(DIR, 'logo_csm.png')));
    page.drawImage(logo, { x: L, y: y - 62, width: 88, height: 62 });
  } catch { /* sem logo */ }
  const cab = [
    ['CSM–Colégio São Mateus Ltda.', bold, 13],
    ['Av. Itália Nº 16 e 17 – Jardim Tropical 78065-158 – Cuiabá/MT', reg, 8],
    ['CNPJ: 00.817.900/0001-26', bold, 8],
    ['Ato de Credenciamento: 323/2008 D.O.: 20/07/2008', reg, 8],
    ['Ato de Nova Autorização: Processo 395/2024 D.O.: 13/05/2024.', reg, 8],
  ];
  let cy = y - 12;
  for (const [t, f, s] of cab) { page.drawText(limpa(t), { x: 130, y: cy, size: s, font: f }); cy -= s + 4.5; }
  y -= 82;
  centro(`HISTÓRICO ESCOLAR DO ${txt(d.etapa_titulo) || 'ENSINO FUNDAMENTAL'}`, L, y - 10, W, 14, bold);
  y -= 22;

  // identificação
  const bloco = (rot, val, x, yy, w, h = 24) => {
    caixa(x, yy - h, w, h);
    centro(rot, x, yy - 8, w, 6);
    centro(val, x, yy - 19, w, 8.5, bold);
  };
  bloco('Nome do (a) Aluno (a)', maiusc(d.nome), L, y, W);
  y -= 24;
  bloco('Data de Nascimento', dataBr(d.nascimento), L, y, W / 3);
  bloco('Naturalidade', maiusc(d.naturalidade), L + W / 3, y, W / 3);
  bloco('Nacionalidade', maiusc(d.nacionalidade), L + (2 * W) / 3, y, W / 3);
  y -= 24;
  bloco('Nome do Pai', maiusc(d.pai), L, y, W / 2);
  bloco('Nome da Mãe', maiusc(d.mae), L + W / 2, y, W / 2);
  y -= 30;

  // notas
  const cD = 95;
  const cA = (W - cD) / 9;
  const hh = 12;
  caixa(L, y - 24, cD, 24, cinza);
  centro('DISCIPLINA', L, y - 15, cD, 7, bold);
  for (let a = 0; a < 9; a++) {
    const x = L + cD + a * cA;
    caixa(x, y - 12, cA, 12, cinza);
    centro(`${a + 1}º ANO`, x, y - 9, cA, 6.5, bold);
    caixa(x, y - 24, cA / 2, 12, cinza);
    caixa(x + cA / 2, y - 24, cA / 2, 12, cinza);
    centro('NOTA', x, y - 21, cA / 2, 5.5, bold);
    centro('CH', x + cA / 2, y - 21, cA / 2, 5.5, bold);
  }
  y -= 24;
  const discs = (Array.isArray(d.disciplinas) ? d.disciplinas : []).filter((r) => txt(r?.nome));
  const rh = 14.5;
  for (const r of discs) {
    caixa(L, y - rh, cD, rh);
    page.drawText(limpa(maiusc(r.nome)), { x: L + 3, y: y - 10, size: 6.8, font: reg });
    for (let a = 0; a < 9; a++) {
      const x = L + cD + a * cA;
      const c = r.anos?.[a] || {};
      caixa(x, y - rh, cA / 2, rh);
      caixa(x + cA / 2, y - rh, cA / 2, rh);
      centro(txt(c.nota), x, y - 10, cA / 2, 6.5);
      centro(txt(c.ch), x + cA / 2, y - 10, cA / 2, 6.5);
    }
    y -= rh;
  }
  const linhaAnos = (rot, vals, altura, size = 7) => {
    caixa(L, y - altura, cD, altura, cinza);
    page.drawText(limpa(rot), { x: L + 3, y: y - altura / 2 - 2.5, size: 5.8, font: bold });
    for (let a = 0; a < 9; a++) {
      const x = L + cD + a * cA;
      caixa(x, y - altura, cA, altura);
      centro(txt(vals?.[a]), x, y - altura / 2 - 2.5, cA, size, bold);
    }
    y -= altura;
  };
  linhaAnos('CARGA HORÁRIA TOTAL', d.ch_total, 18, 7.5);
  linhaAnos('RESULTADO FINAL', (d.resultado || []).map((v) => maiusc(v)), 18, 5.8);
  y -= 22;

  // série / estabelecimento
  const cols = [40, 36, 250, 120, 93];
  const rot = ['SÉRIE / ANO', 'ANO', 'ESTABELECIMENTO DE ENSINO', 'CIDADE', 'SITUAÇÃO'];
  let x = L;
  rot.forEach((r, i) => { caixa(x, y - 13, cols[i], 13, cinza); centro(r, x, y - 9.5, cols[i], 6.5, bold); x += cols[i]; });
  y -= 13;
  for (let a = 0; a < 9; a++) {
    const t = d.trajetoria?.[a] || {};
    const v = [`${a + 1}º ANO`, txt(t.ano), maiusc(t.estabelecimento), maiusc(t.cidade), maiusc(t.situacao)];
    x = L;
    v.forEach((s, i) => { caixa(x, y - 13, cols[i], 13); centro(s, x, y - 9.5, cols[i], 6.5); x += cols[i]; });
    y -= 13;
  }
  y -= 10;

  // OBS + legenda
  caixa(L, y - 18, W, 18);
  const obs = `OBS: ${txt(d.obs)}`;
  page.drawText(limpa(obs).slice(0, 150), { x: L + 4, y: y - 12, size: 6.5, font: bold });
  y -= 18;
  caixa(L, y - 30, W, 30);
  const leg1 = 'LEGENDA:   CH - Carga horária     APR – Aprovado     REP – Reprovado     APP – Aprovado com Progressão Parcial     PP – Progressão Parcial';
  const leg2 = 'PPAP – Progressão Parcial com apoio Pedagógico     PS – Progressão Simples     R – Relatório     APD – Avaliação através de Parecer Descritivo';
  centro(leg1, L, y - 11, W, 5.8, bold);
  centro(leg2, L, y - 22, W, 5.8, bold);
  y -= 40;
  const dt = `Cuiabá/MT, ${extenso(d.data).replace(/ de (\w)/, (m, c) => ` de ${c.toUpperCase()}`)}.`;
  page.drawText(limpa(dt), { x: L + W - reg.widthOfTextAtSize(limpa(dt), 7), y, size: 7, font: reg });
  y -= 70;
  const assin = (nome, cargo, cx) => {
    page.drawLine({ start: { x: cx - 80, y }, end: { x: cx + 80, y }, thickness: 0.6, color: preto });
    centro(nome, cx - 80, y - 10, 160, 8.5);
    centro(cargo, cx - 80, y - 20, 160, 8);
  };
  assin(txt(d.secretario) || 'Sérgio Araújo Fleury', 'Secretário Escolar', L + 110);
  assin(txt(d.diretora) || 'Valmeria Victor Fleury', 'Diretora', L + W - 110);
  return Buffer.from(await pdf.save());
}

const slug = (s) => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'aluno';

export async function gerar(tipo, dados) {
  const t = TIPOS[tipo];
  if (!t) throw new HttpError(400, 'Tipo de documento inválido.');
  const d = dados && typeof dados === 'object' ? dados : {};
  let buffer;
  let ext;
  let mime;
  if (tipo === 'conclusao') { buffer = atestadoConclusao(d); ext = 'docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
  else if (tipo === 'escolaridade') { buffer = atestadoEscolaridade(d); ext = 'docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
  else { buffer = await historicoPdf(d); ext = 'pdf'; mime = 'application/pdf'; }
  return { buffer, mime, nome: `${t.nome.split(' do Ensino')[0].replace(/ /g, '_')}_${slug(d.nome)}.${ext}` };
}
