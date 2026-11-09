#!/usr/bin/env python3
"""Converte os modelos .docx originais em modelos com marcadores {{campo}} (docxtemplater).
Uso: python3 scripts/preparar-modelos.py <termo1.docx> <termo2.docx> <contrato.docx>
Só é necessário se os modelos originais mudarem; os modelos preparados ficam em templates/documentos/."""
import re, sys, zipfile, shutil
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / 'templates' / 'documentos'

def esc(s): return s.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def paragrafos(x): return list(re.finditer(r'<w:p[ >].*?</w:p>', x, flags=re.S))

def texto(p): return ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, flags=re.S))

def substituir_no_paragrafo(p, antigo, novo):
    """Troca `antigo` por `novo` mesmo que o texto esteja dividido em vários runs; mantém a formatação do 1º run tocado."""
    runs = list(re.finditer(r'(<w:t(?: [^>]*)?>)(.*?)(</w:t>)', p, flags=re.S))
    junto = ''.join(m.group(2) for m in runs)
    i = junto.find(esc(antigo))
    assert i >= 0, f'não achei {antigo!r} em {texto(p)[:80]!r}'
    fim = i + len(esc(antigo))
    pos = 0; out = []; colocou = False; last = 0
    for m in runs:
        t = m.group(2); a, b = pos, pos + len(t); pos = b
        out.append(p[last:m.start()]); last = m.end()
        if b <= i or a >= fim:
            out.append(m.group(0)); continue
        antes = t[:max(0, i - a)]; depois = t[max(0, fim - a):]
        meio = esc(novo) if not colocou else ''; colocou = True
        out.append(f'<w:t xml:space="preserve">{antes}{meio}{depois}</w:t>')
    out.append(p[last:])
    return ''.join(out)


def processar(origem, destino, edit_doc, extra=None, remove_comentarios=False):
    zin = zipfile.ZipFile(origem)
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            dados = zin.read(item.filename)
            if remove_comentarios and re.match(r'word/comments', item.filename):
                continue
            if item.filename == 'word/document.xml':
                x = dados.decode('utf8'); x = edit_doc(x)
                if remove_comentarios:
                    x = re.sub(r'<w:commentRangeStart [^>]*/>|<w:commentRangeEnd [^>]*/>', '', x)
                    x = re.sub(r'<w:r\b[^>]*>(?:(?!</w:r>).)*?<w:commentReference [^>]*/>(?:(?!</w:r>).)*?</w:r>', '', x, flags=re.S)
                dados = x.encode('utf8')
            elif extra and item.filename in extra:
                dados = extra[item.filename](dados.decode('utf8')).encode('utf8')
            elif remove_comentarios and item.filename == 'word/_rels/document.xml.rels':
                x = dados.decode('utf8')
                x = re.sub(r'<Relationship [^>]*Target="comments[^"]*"[^>]*/>', '', x)
                dados = x.encode('utf8')
            elif remove_comentarios and item.filename == '[Content_Types].xml':
                x = dados.decode('utf8')
                x = re.sub(r'<Override [^>]*PartName="/word/comments[^"]*"[^>]*/>', '', x)
                dados = x.encode('utf8')
            zout.writestr(item, dados)

B = '<w:rPr><w:b/><w:bCs/></w:rPr>'
def run(t, b=False): return f'<w:r>{B if b else ""}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>'
BR = '<w:r><w:br/></w:r>'

def termo(x, canal_antigo):
    ps = paragrafos(x)
    p = ps[2]
    assert 'Aluno(a):' in texto(p.group(0))
    abre = re.match(r'<w:p[^>]*>(<w:pPr>.*?</w:pPr>)?', p.group(0), flags=re.S).group(0)
    novo = (abre + run('Aluno(a):', True) + run(' {{aluno_nome}}  ') + run('Turma:', True) + run(' {{turma}}') + BR
            + run('Responsável legal:', True) + run(' {{resp_nome}}  ') + run('CPF:', True) + run(' {{resp_cpf}}') + BR
            + run('E-mail:', True) + run(' {{resp_email}}  ') + run('Telefone:', True) + run(' {{resp_telefone}}') + '</w:p>')
    x = x[:p.start()] + novo + x[p.end():]
    for q in paragrafos(x):
        if canal_antigo in texto(q.group(0)):
            x = x[:q.start()] + substituir_no_paragrafo(q.group(0), canal_antigo, '{{canal_revogacao}}') + x[q.end():]
            break
    else:
        raise SystemExit('canal não encontrado')
    return x

def contrato_doc(x):
    trocas = [
        ('[NOME DO ALUNO]', '{{aluno_nome}}'), ('[DATA DE NASCIMENTO]', '{{aluno_nascimento}}'),
        ('[SÉRIE] — [TURNO]', '{{serie_turno}}'), ('[RESPONSÁVEL FINANCEIRO] — CPF [CPF DO RESPONSÁVEL]', '{{resp_nome}} — CPF {{resp_cpf}}'),
        ('[RESPONSÁVEL FINANCEIRO]', '{{resp_nome}}'), ('[CPF DO RESPONSÁVEL]', '{{resp_cpf}}'),
        ('[RG] / [ÓRGÃO EMISSOR]', '{{resp_rg_orgao}}'), ('[ENDEREÇO COMPLETO]', '{{resp_endereco}}'),
        ('[TELEFONE] / [E-MAIL]', '{{resp_contato}}'), ('[VALOR DA ANUIDADE]', '{{valor_anuidade}}'),
        ('[Nº DE PARCELAS]', '{{parcelas}}'), ('[VALOR DA PARCELA]', '{{valor_parcela}}'),
        ('[DIA DE VENCIMENTO]', '{{dia_vencimento}}'), ('[HORÁRIO DE TÉRMINO DO INTEGRAL]', '{{horario_integral}}'),
        ('[DATA]', '{{data_extenso}}'),
        ('[NOME DA TESTEMUNHA 1] — CPF: [CPF]', '{{testemunha1_nome}} — CPF: {{testemunha1_cpf}}'),
        ('[NOME DA TESTEMUNHA 2] — CPF: [CPF]', '{{testemunha2_nome}} — CPF: {{testemunha2_cpf}}'),
    ]
    for antigo, novo in trocas:
        feito = False
        for q in paragrafos(x):
            if esc(antigo) in ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', q.group(0), flags=re.S)):
                x = x[:q.start()] + substituir_no_paragrafo(q.group(0), antigo, novo) + x[q.end():]
                feito = True
                break  # reprocessa a lista a cada troca
        # um mesmo texto pode aparecer em mais de um parágrafo (ex.: resp. financeiro): repete até acabar
        while feito:
            feito = False
            for q in paragrafos(x):
                if esc(antigo) in ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>', q.group(0), flags=re.S)):
                    x = x[:q.start()] + substituir_no_paragrafo(q.group(0), antigo, novo) + x[q.end():]
                    feito = True; break
    assert '[' not in re.sub(r'<[^>]+>', '', x).replace('[ ]', ''), 'sobrou colchete no contrato'
    return x

def rodape(x):
    ps = [q for q in paragrafos(x) if 'MINUTA' in texto(q.group(0))]
    assert ps, 'rodapé não encontrado'
    q = ps[0]
    return x[:q.start()] + substituir_no_paragrafo(q.group(0), 'MINUTA — documento em elaboração. Sujeito a revisão jurídica. Não assinado.', '{{rodape_contrato}}') + x[q.end():]

if __name__ == '__main__':
    t1, t2, ct = sys.argv[1:4]
    SAIDA.mkdir(parents=True, exist_ok=True)
    processar(t1, SAIDA / 'termo1_whatsapp.docx', lambda x: termo(x, '[INSERIR CANAL DE COMUNICAÇÃO]'), remove_comentarios=True)
    processar(t2, SAIDA / 'termo2_redes_sociais.docx', lambda x: termo(x, '[INSERIR CANAL]'))
    processar(ct, SAIDA / 'contrato_2027.docx', contrato_doc, extra={'word/footer1.xml': rodape})
    print('ok ->', SAIDA)
