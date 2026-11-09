// Campos graváveis (espelham as colunas das migrations e as abas do SAE).

export const PESSOA_CAMPOS = [
  'nome', 'cpf', 'rg', 'rg_orgao_emissor', 'rg_uf', 'data_nascimento', 'sexo', 'estado_civil', 'profissao', 'email',
  'ddd', 'telefone', 'celular', 'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'observacoes',
];
export const PESSOA_JSON = ['endereco_comercial', 'ref_comerciais'];
export const PESSOA_DATAS = ['data_nascimento'];

export const ALUNO_CAMPOS = [
  // 1. Dados do Aluno
  'nome_completo', 'nome_social', 'cpf', 'data_nascimento', 'matricula', 'rga', 'nis', 'sexo', 'estado_civil',
  'naturalidade', 'naturalidade_uf', 'nacionalidade', 'id_censo', 'email', 'rg', 'rg_data_expedicao',
  'rg_orgao_emissor', 'rg_uf', 'cor_raca', 'docto_apresentado', 'outros_documentos', 'necessidades_especiais',
  'necessidades_especiais_complemento',
  // 2. Endereço / Contatos
  'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'ddd', 'telefone', 'celular',
  // 3. Responsáveis
  'pai_id', 'mae_id', 'resp_pedagogico_id', 'tipo_resp_pedag', 'tipo_resp_financ',
  // 4. Documentos
  'certidao_livro', 'certidao_folha', 'certidao_matricula', 'certidao_data_registro', 'certidao_cartorio',
  // 5. Informações adicionais
  'escola_origem', 'cert_reservista', 'como_conheceu', 'como_conheceu_outros', 'titulo_eleitor', 'titulo_zona',
  'titulo_secao', 'cnh', 'cnh_categoria', 'renach', 'sit_ocupacional', 'liberado_novas_matriculas',
  'desconto_percentual', 'tipo_sanguineo', 'profissao', 'religiao',
  // 7. Observações + foto
  'observacoes', 'foto',
];
export const ALUNO_JSON = ['processo_seletivo'];
export const ALUNO_DATAS = ['data_nascimento', 'rg_data_expedicao', 'certidao_data_registro'];

// Opções dos selects, exatamente como no SAE (a API valida; o frontend usa as mesmas listas).
export const OPCOES = {
  sexo: ['Masculino', 'Feminino'],
  estado_civil: ['Casado(a)', 'Solteiro(a)', 'Desquitado(a)', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)', 'Marital', 'União Estável', 'Falecido(a)'],
  cor_raca: ['Amarela', 'Branca', 'Indígena', 'Parda', 'Preta', 'Não Declarada'],
  docto_apresentado: ['Auto Declaração', 'Declarado Responsável', 'Outros'],
  necessidades_especiais: ['Mental', 'Visual', 'Auditiva', 'Física', 'Múltiplas Deficiências', 'Alta Habilidade', 'CID 10', 'Nenhuma', 'Não Informado', 'Outras'],
  tipo_resp_pedag: ['Nenhum', 'Pai', 'Mãe', 'Avô', 'Avó', 'Tio', 'Tia', 'Irmão', 'Irmã', 'Primo', 'Prima', 'Amigo(a)', 'Outros'],
  tipo_resp_financ: ['Pai', 'Mãe', 'Outros'],
  como_conheceu: ['Não Informado', 'Indicação de amigos ou familiares', 'Redes sociais', 'Propagandas', 'Internet', 'Aluno ou ex-aluno', 'Indicação de professor', 'Outras'],
  sit_ocupacional: ['Não Informado', 'Empregado', 'Desempregado', 'Autônomo', 'Prof. Liberal', 'Estudante'],
  liberado_novas_matriculas: ['Não', 'Sim'],
  tipo_sanguineo: ['Não Informado', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  religiao: ['Ateu', 'Budista', 'Candomblé', 'Católico', 'Espírita', 'Evangélico', 'Judeu', 'Outros', 'Umbanda'],
};
