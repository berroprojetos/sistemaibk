/**
 * Beneficiarios.gs – Módulo BENEFICIÁRIOS (Sistema IBK)
 *
 * Ficha de inscrição/matrícula da criança ou adolescente, com ocorrências, encaminhamentos,
 * acompanhamentos e documentos, e a lista de presença por oficina ou projeto (puxa as
 * crianças vinculadas). Usa o núcleo do Gestor: ler_/inserir_/atualizar_, gerarId,
 * AUDITORIA, LIXEIRA, login e permissões por área.
 *
 * Instalação: este arquivo + Modulos.gs + as 3 alterações do núcleo (ver ALTERACOES-NUCLEO.md).
 * Depois rode "Atualizar estrutura (setup)" no menu Gestor.
 *
 * Áreas de permissão (Configurações → Usuários, Ver/Editar):
 *  - beneficiarios: ficha, vínculos, documentos (Ver = consultar; Editar = matricular, alterar, desligar)
 *  - presenca:      chamada, frequência, oficinas (Editar = fazer chamada, cadastrar oficina, registrar ocorrência)
 *  - atendimentos:  encaminhamentos, acompanhamentos, registros sigilosos e dados sensíveis (CID, renda, benefício)
 * Prefeitura: usuário com "beneficiarios" e "presenca" em Ver, sem "atendimentos".
 */

const BEN_VERSAO = '0.3.1';
const BEN_ABAS = ['BENEFICIARIOS', 'OFICINAS', 'BEN_VINCULOS', 'BEN_CHAMADAS', 'BEN_PRESENCAS',
  'BEN_OCORRENCIAS', 'BEN_ENCAMINHAMENTOS', 'BEN_ACOMPANHAMENTOS', 'BEN_CONSENTIMENTOS', 'BEN_FOTOS', 'BEN_RECESSOS'];

// ───────────────────────── definição dos campos ─────────────────────────
// tipos: id, texto, longo, data, hora, numero, bool, email, telefone, lista (f.lista), ref (f.ref), sistema

function benF_(n, r, t, extra) { return Object.assign({ n: n, r: r, t: t || 'texto' }, extra || {}); }

const BEN_CONTROLE = ['criado_em', 'criado_por', 'atualizado_em', 'atualizado_por'];

const BEN_SCHEMA = {
  BENEFICIARIOS: { prefixo: 'BEN', titulo: 'Ficha de inscrição', campos: [
    benF_('id_beneficiario', 'ID', 'id'),
    benF_('id_instituicao', 'Instituição', 'sistema'),
    benF_('num_matricula', 'Nº da matrícula', 'sistema'),
    benF_('data_matricula', 'Data da matrícula', 'data', { secao: 'Matrícula' }),
    benF_('status', 'Situação', 'lista', { lista: 'status_beneficiario', secao: 'Matrícula', padrao: 'Matriculado' }),
    benF_('nome_completo', 'Nome completo', 'texto', { obrig: true, secao: 'Criança / adolescente' }),
    benF_('nome_social', 'Nome social / como gosta de ser chamada(o)', 'texto', { secao: 'Criança / adolescente' }),
    benF_('data_nascimento', 'Data de nascimento', 'data', { obrig: true, secao: 'Criança / adolescente' }),
    benF_('sexo', 'Sexo', 'lista', { lista: 'sexo', secao: 'Criança / adolescente' }),
    benF_('cor_raca', 'Cor/raça (IBGE)', 'lista', { lista: 'cor_raca', secao: 'Criança / adolescente' }),
    benF_('cpf', 'CPF', 'texto', { secao: 'Criança / adolescente' }),
    benF_('rg', 'RG', 'texto', { secao: 'Criança / adolescente' }),
    benF_('certidao_nascimento', 'Certidão de nascimento (matrícula)', 'texto', { secao: 'Criança / adolescente' }),
    benF_('nis', 'NIS', 'texto', { secao: 'Criança / adolescente' }),
    benF_('cartao_sus', 'Cartão SUS', 'texto', { secao: 'Criança / adolescente' }),
    benF_('naturalidade', 'Naturalidade (cidade/UF)', 'texto', { secao: 'Criança / adolescente' }),
    benF_('nacionalidade', 'Nacionalidade', 'texto', { secao: 'Criança / adolescente', padrao: 'Brasileira' }),
    benF_('endereco', 'Rua', 'texto', { secao: 'Endereço' }),
    benF_('numero', 'Nº', 'texto', { secao: 'Endereço' }),
    benF_('complemento', 'Complemento', 'texto', { secao: 'Endereço' }),
    benF_('bairro', 'Bairro', 'texto', { secao: 'Endereço' }),
    benF_('cidade', 'Cidade', 'texto', { secao: 'Endereço' }),
    benF_('uf', 'UF', 'texto', { secao: 'Endereço' }),
    benF_('cep', 'CEP', 'texto', { secao: 'Endereço' }),
    benF_('ponto_referencia', 'Ponto de referência', 'texto', { secao: 'Endereço' }),
    benF_('escola', 'Escola', 'texto', { secao: 'Escola' }),
    benF_('serie_ano', 'Série/ano', 'texto', { secao: 'Escola' }),
    benF_('turno_escolar', 'Turno na escola', 'lista', { lista: 'turno', secao: 'Escola' }),
    benF_('possui_deficiencia', 'Possui deficiência?', 'bool', { secao: 'Saúde' }),
    benF_('deficiencia_descricao', 'Qual deficiência / necessidade específica', 'texto', { secao: 'Saúde' }),
    benF_('cid', 'CID (se houver laudo)', 'texto', { secao: 'Saúde', sensivel: true }),
    benF_('alergias', 'Alergias', 'texto', { secao: 'Saúde' }),
    benF_('medicamentos', 'Medicamentos de uso contínuo', 'texto', { secao: 'Saúde' }),
    benF_('restricoes_alimentares', 'Restrições alimentares', 'texto', { secao: 'Saúde' }),
    benF_('contato_emergencia_nome', 'Contato de emergência – nome', 'texto', { secao: 'Saúde' }),
    benF_('contato_emergencia_telefone', 'Contato de emergência – telefone', 'telefone', { secao: 'Saúde' }),
    benF_('resp1_nome', 'Responsável 1 – nome', 'texto', { obrig: true, secao: 'Responsáveis' }),
    benF_('resp1_parentesco', 'Responsável 1 – parentesco', 'lista', { lista: 'parentesco', secao: 'Responsáveis' }),
    benF_('resp1_cpf', 'Responsável 1 – CPF', 'texto', { secao: 'Responsáveis' }),
    benF_('resp1_rg', 'Responsável 1 – RG', 'texto', { secao: 'Responsáveis' }),
    benF_('resp1_telefone', 'Responsável 1 – celular (WhatsApp)', 'telefone', { obrig: true, secao: 'Responsáveis' }),
    benF_('resp1_email', 'Responsável 1 – e-mail', 'email', { secao: 'Responsáveis' }),
    benF_('resp1_profissao', 'Responsável 1 – profissão', 'texto', { secao: 'Responsáveis' }),
    benF_('resp2_nome', 'Responsável 2 – nome', 'texto', { secao: 'Responsáveis' }),
    benF_('resp2_parentesco', 'Responsável 2 – parentesco', 'lista', { lista: 'parentesco', secao: 'Responsáveis' }),
    benF_('resp2_cpf', 'Responsável 2 – CPF', 'texto', { secao: 'Responsáveis' }),
    benF_('resp2_telefone', 'Responsável 2 – celular', 'telefone', { secao: 'Responsáveis' }),
    benF_('pessoas_autorizadas_buscar', 'Pessoas autorizadas a buscar', 'longo', { secao: 'Responsáveis' }),
    benF_('autoriza_saida_sozinho', 'Autoriza sair sozinha(o)?', 'bool', { secao: 'Responsáveis' }),
    benF_('qtd_pessoas_casa', 'Pessoas na casa', 'numero', { secao: 'Família' }),
    benF_('renda_familiar', 'Renda familiar mensal', 'lista', { lista: 'faixa_renda', secao: 'Família', sensivel: true }),
    benF_('beneficio_social', 'Benefício social (Bolsa Família, BPC…)', 'texto', { secao: 'Família', sensivel: true }),
    benF_('como_conheceu', 'Como conheceu a instituição', 'texto', { secao: 'Família' }),
    // Os consentimentos (uso de imagem, LGPD…) ficam na aba BEN_CONSENTIMENTOS, um por tipo.
    benF_('observacoes', 'Observações', 'longo', { secao: 'Observações' }),
    benF_('data_desligamento', 'Data do desligamento', 'sistema'),
    benF_('motivo_desligamento', 'Motivo do desligamento', 'sistema')
  ] },

  // ⚠ Provisória: quando o módulo Projetos (oficinas, planejamento pedagógico) existir, esta aba passa para lá.
  OFICINAS: { prefixo: 'OFI', titulo: 'Oficina', campos: [
    benF_('id_oficina', 'ID', 'id'),
    benF_('id_projeto', 'Projeto', 'ref', { ref: 'PROJETOS', obrig: true }),
    benF_('nome_oficina', 'Nome da oficina', 'texto', { obrig: true }),
    benF_('descricao', 'Descrição', 'longo'),
    benF_('educador_nome', 'Educador(a)', 'texto'),
    benF_('dias_semana', 'Dias da semana (ex.: Seg, Qua)', 'texto'),
    benF_('horario_inicio', 'Início', 'hora'),
    benF_('horario_fim', 'Fim', 'hora'),
    benF_('local', 'Local', 'texto'),
    benF_('idade_min', 'Idade mínima', 'numero'),
    benF_('idade_max', 'Idade máxima', 'numero'),
    benF_('vagas', 'Vagas', 'numero'),
    benF_('data_inicio', 'Início das atividades', 'data'),
    benF_('data_fim', 'Fim das atividades', 'data'),
    benF_('status', 'Situação', 'lista', { lista: 'status_oficina', padrao: 'Em andamento' })
  ] },

  BEN_VINCULOS: { prefixo: 'VIN', titulo: 'Vínculo', campos: [
    benF_('id_vinculo', 'ID', 'id'),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('id_projeto', 'Projeto', 'ref', { ref: 'PROJETOS', obrig: true }),
    benF_('id_oficina', 'Oficina (vazio = projeto todo)', 'ref', { ref: 'OFICINAS' }),
    benF_('data_entrada', 'Data de entrada', 'data', { obrig: true }),
    benF_('data_saida', 'Data de saída', 'data'),
    benF_('status', 'Situação', 'lista', { lista: 'status_vinculo', padrao: 'Ativo' }),
    benF_('motivo_saida', 'Motivo da saída', 'texto'),
    benF_('observacoes', 'Observações', 'longo')
  ] },

  BEN_CHAMADAS: { prefixo: 'CHA', titulo: 'Chamada', campos: [
    benF_('id_chamada', 'ID', 'id'),
    benF_('id_projeto', 'Projeto', 'ref', { ref: 'PROJETOS', obrig: true }),
    benF_('id_oficina', 'Oficina', 'ref', { ref: 'OFICINAS' }),
    benF_('data', 'Data', 'data', { obrig: true }),
    benF_('educador_nome', 'Educador(a)', 'texto'),
    benF_('atividade_realizada', 'Atividade realizada', 'longo'),
    benF_('total_presentes', 'Presentes', 'sistema'),
    benF_('total_faltas', 'Faltas', 'sistema'),
    benF_('total_justificadas', 'Faltas justificadas', 'sistema')
  ] },

  BEN_PRESENCAS: { prefixo: 'PRE', titulo: 'Presença', campos: [
    benF_('id_presenca', 'ID', 'id'),
    benF_('id_chamada', 'Chamada', 'ref', { ref: 'BEN_CHAMADAS', obrig: true }),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('id_projeto', 'Projeto', 'sistema'),
    benF_('id_oficina', 'Oficina', 'sistema'),
    benF_('data', 'Data', 'sistema'),
    benF_('situacao', 'Situação', 'lista', { lista: 'situacao_presenca', obrig: true }),
    benF_('justificativa', 'Justificativa', 'texto')
  ] },

  BEN_OCORRENCIAS: { prefixo: 'OCO', titulo: 'Ocorrência', campos: [
    benF_('id_ocorrencia', 'ID', 'id'),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('id_projeto', 'Projeto', 'ref', { ref: 'PROJETOS' }),
    benF_('id_oficina', 'Oficina', 'ref', { ref: 'OFICINAS' }),
    benF_('data', 'Data', 'data', { obrig: true }),
    benF_('tipo', 'Tipo', 'lista', { lista: 'tipo_ocorrencia', obrig: true }),
    benF_('gravidade', 'Gravidade', 'lista', { lista: 'gravidade', padrao: 'Baixa' }),
    benF_('descricao', 'O que aconteceu', 'longo', { obrig: true }),
    benF_('providencias', 'Providências tomadas', 'longo'),
    benF_('responsavel_comunicado', 'Responsável foi comunicado?', 'bool'),
    benF_('data_comunicacao', 'Data da comunicação', 'data'),
    benF_('status', 'Situação', 'lista', { lista: 'status_registro', padrao: 'Aberta' }),
    benF_('sigiloso', 'Sigiloso (só quem tem Atendimentos vê)', 'bool')
  ] },

  BEN_ENCAMINHAMENTOS: { prefixo: 'ENC', titulo: 'Encaminhamento', campos: [
    benF_('id_encaminhamento', 'ID', 'id'),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('id_ocorrencia', 'Ocorrência de origem', 'ref', { ref: 'BEN_OCORRENCIAS' }),
    benF_('data', 'Data', 'data', { obrig: true }),
    benF_('servico_destino', 'Serviço de destino', 'lista', { lista: 'servico_rede', obrig: true }),
    // ⚠ Quando o módulo Relacionamento existir, orgao_nome passa a apontar para o cadastro da rede.
    benF_('orgao_nome', 'Nome do órgão/serviço', 'texto'),
    benF_('contato_nome', 'Profissional de contato', 'texto'),
    benF_('contato_telefone', 'Telefone do contato', 'telefone'),
    benF_('motivo', 'Motivo do encaminhamento', 'longo', { obrig: true }),
    benF_('status', 'Situação', 'lista', { lista: 'status_encaminhamento', padrao: 'Enviado' }),
    benF_('data_retorno', 'Data do retorno', 'data'),
    benF_('retorno_descricao', 'Retorno recebido', 'longo')
  ] },

  BEN_ACOMPANHAMENTOS: { prefixo: 'ACP', titulo: 'Acompanhamento', campos: [
    benF_('id_acompanhamento', 'ID', 'id'),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('data', 'Data', 'data', { obrig: true }),
    benF_('tipo', 'Tipo', 'lista', { lista: 'tipo_acompanhamento', obrig: true }),
    benF_('area', 'Área', 'lista', { lista: 'area_acompanhamento' }),
    benF_('profissional', 'Profissional', 'texto'),
    benF_('descricao', 'Relato', 'longo', { obrig: true }),
    benF_('proximos_passos', 'Próximos passos', 'longo'),
    benF_('data_proximo', 'Data do próximo contato', 'data')
  ] },

  // Um registro por criança e tipo de consentimento. Os tipos vêm da lista tipo_consentimento (aba LISTAS):
  // para o IBK acrescentar um termo novo, basta incluir o nome na lista.
  BEN_CONSENTIMENTOS: { prefixo: 'CON', titulo: 'Consentimento', campos: [
    benF_('id_consentimento', 'ID', 'id'),
    benF_('id_beneficiario', 'Criança', 'ref', { ref: 'BENEFICIARIOS', obrig: true }),
    benF_('tipo', 'Consentimento', 'lista', { lista: 'tipo_consentimento', obrig: true }),
    benF_('resposta', 'Resposta', 'lista', { lista: 'resposta_consentimento', obrig: true }),
    benF_('data', 'Data', 'data', { obrig: true }),
    benF_('responsavel_nome', 'Quem assinou (responsável)', 'texto'),
    benF_('observacao', 'Observação', 'texto')
  ] },

  // Férias e recessos do projeto: as datas dentro deles saem do calendário da chamada.
  // ⚠ Provisória: quando o módulo Projetos (cronograma de execução) existir, os períodos passam a vir de lá.
  BEN_RECESSOS: { prefixo: 'REC', titulo: 'Férias / recesso', campos: [
    benF_('id_recesso', 'ID', 'id'),
    benF_('id_projeto', 'Projeto', 'ref', { ref: 'PROJETOS', obrig: true }),
    benF_('descricao', 'Descrição (ex.: Férias de julho)', 'texto', { obrig: true }),
    benF_('data_inicio', 'Início', 'data', { obrig: true }),
    benF_('data_fim', 'Fim', 'data', { obrig: true })
  ] },

  // Fotos opcionais da aula, ligadas à chamada (o planejamento pedagógico mensal vai puxar daqui).
  BEN_FOTOS: { prefixo: 'FOT', titulo: 'Foto da aula', campos: [
    benF_('id_foto', 'ID', 'id'),
    benF_('id_chamada', 'Chamada', 'ref', { ref: 'BEN_CHAMADAS', obrig: true }),
    benF_('id_projeto', 'Projeto', 'sistema'),
    benF_('id_oficina', 'Oficina', 'sistema'),
    benF_('data', 'Data da aula', 'sistema'),
    benF_('legenda', 'Legenda', 'texto'),
    benF_('nome_arquivo', 'Arquivo', 'sistema'),
    benF_('drive_file_id', 'ID no Drive', 'sistema'),
    benF_('url', 'Link', 'sistema'),
    benF_('mime_type', 'Tipo', 'sistema')
  ] }
};

const BEN_LISTAS = {
  status_beneficiario: ['Pré-inscrito', 'Lista de espera', 'Matriculado', 'Desligado', 'Transferido'],
  status_oficina: ['Planejada', 'Em andamento', 'Suspensa', 'Encerrada'],
  status_vinculo: ['Ativo', 'Lista de espera', 'Encerrado'],
  situacao_presenca: ['Presente', 'Falta', 'Falta justificada'],
  sexo: ['Feminino', 'Masculino', 'Prefere não informar'],
  cor_raca: ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não declarada'],
  turno: ['Manhã', 'Tarde', 'Noite', 'Integral'],
  parentesco: ['Mãe', 'Pai', 'Avó/Avô', 'Tia/Tio', 'Irmã/Irmão', 'Responsável legal', 'Outro'],
  faixa_renda: ['Até 1/2 salário mínimo', 'De 1/2 a 1 salário', 'De 1 a 2 salários', 'De 2 a 3 salários', 'Acima de 3 salários', 'Não informada'],
  tipo_ocorrencia: ['Comportamento', 'Conflito entre crianças', 'Saúde / acidente', 'Faltas recorrentes', 'Suspeita de violação de direitos', 'Questão familiar', 'Outro'],
  gravidade: ['Baixa', 'Média', 'Alta'],
  status_registro: ['Aberta', 'Em acompanhamento', 'Encerrada'],
  servico_rede: ['CRAS', 'CREAS', 'Conselho Tutelar', 'UBS / Saúde', 'CAPSi', 'Escola', 'Defensoria / Justiça', 'Outro'],
  status_encaminhamento: ['Enviado', 'Recebido pelo serviço', 'Em atendimento', 'Concluído', 'Sem retorno'],
  tipo_acompanhamento: ['Atendimento individual', 'Atendimento à família', 'Visita domiciliar', 'Contato com a escola', 'Reunião de equipe', 'Evolução pedagógica', 'Outro'],
  area_acompanhamento: ['Social', 'Psicológica', 'Pedagógica', 'Saúde'],
  // ⚠ Sugestão inicial; o IBK vai mandar a lista dele. A lista que vale fica em CONFIG.lista_tipo_consentimento,
  // editada pelo Admin na ficha (aba Termos e autorizações → Editar termos).
  tipo_consentimento: ['Uso de imagem e voz', 'Tratamento de dados pessoais (LGPD)', 'Passeios e atividades externas'],
  resposta_consentimento: ['Autoriza', 'Não autoriza'],
  // acrescentados à lista do núcleo
  tipo_documento_anexo: ['Ficha de inscrição assinada', 'Certidão de nascimento', 'Documento da criança (RG/CPF)', 'Documento do responsável',
    'Comprovante de residência', 'Declaração escolar', 'Cartão de vacinação', 'Laudo / relatório médico', 'Termo de uso de imagem', 'Termo LGPD']
};

const BEN_TIPOS_DOC = BEN_LISTAS.tipo_documento_anexo;
const BEN_DOCS_OBRIGATORIOS = ['Ficha de inscrição assinada', 'Certidão de nascimento', 'Documento do responsável', 'Comprovante de residência']; // ⚠ suposição

// ───────────────────────── registro no núcleo ─────────────────────────

function moduloBeneficiarios_() {
  const estrutura = {}, validacoes = {}, prefixos = {};
  BEN_ABAS.forEach(aba => {
    const s = BEN_SCHEMA[aba];
    estrutura[aba] = s.campos.map(f => f.n).concat(BEN_CONTROLE);
    prefixos[aba] = s.prefixo;
    s.campos.forEach(f => { if (f.t === 'lista') (validacoes[aba] = validacoes[aba] || {})[f.n] = f.lista; });
  });
  const A = (fn, area, nivel) => ({ fn: fn, area: area, nivel: nivel || 'ver' });
  return {
    nome: 'beneficiarios',
    areas: [['beneficiarios', 'Beneficiários'], ['presenca', 'Presença'], ['atendimentos', 'Atendimentos']],
    estrutura: estrutura,
    colunasExtras: { DOCUMENTOS: ['id_beneficiario', 'validade'] },
    listas: BEN_LISTAS,
    validacoes: validacoes,
    prefixos: prefixos,
    config: [
      ['ben_pasta_drive_id', '', 'Pasta do Drive com as pastas das crianças (criada sozinha no primeiro documento)'],
      ['ben_formato_matricula', '{{ano}}-{{seq}}', 'Formato do nº de matrícula'],
      ['ben_idade_maxima', '17', 'Idade máxima na matrícula (beneficiários são crianças e adolescentes)'],
      ['ben_frequencia_minima', '0.75', 'Frequência mínima esperada (0.75 = 75%)'],
      ['ben_faltas_alerta', '3', 'Faltas seguidas que geram alerta'],
      ['lista_tipo_consentimento', JSON.stringify(BEN_LISTAS.tipo_consentimento), 'Termos e autorizações pedidos à família na matrícula (edite pela ficha → Termos)']
    ],
    acoes: {
      obterOpcoesBen:       A(benOpcoes_, 'beneficiarios|presenca'),
      listarBeneficiarios:  A(benListar_, 'beneficiarios'),
      obterBeneficiario:    A(benFicha_, 'beneficiarios'),
      salvarBeneficiario:   A(benSalvarBeneficiario_, 'beneficiarios', 'editar'),
      desligarBeneficiario: A(benDesligar_, 'beneficiarios', 'editar'),
      salvarVinculo:        A(benSalvarVinculo_, 'beneficiarios', 'editar'),
      encerrarVinculo:      A(benEncerrarVinculo_, 'beneficiarios', 'editar'),
      salvarOficina:        A(benSalvarOficina_, 'presenca', 'editar'),
      obterOficina:         A(benObterOficina_, 'presenca'),
      obterListaPresenca:   A(benListaPresenca_, 'presenca'),
      salvarChamada:        A(benSalvarChamada_, 'presenca', 'editar'),
      obterFrequencia:      A(benFrequenciaAcao_, 'presenca|beneficiarios'),
      obterListaPresencaMes:A(benListaMes_, 'presenca'),
      salvarOcorrencia:     A(benSalvarOcorrencia_, 'beneficiarios|presenca', 'editar'),
      salvarEncaminhamento: A(benSalvarAtendimento_('BEN_ENCAMINHAMENTOS'), 'atendimentos', 'editar'),
      salvarAcompanhamento: A(benSalvarAtendimento_('BEN_ACOMPANHAMENTOS'), 'atendimentos', 'editar'),
      enviarDocBeneficiario:A(benEnviarDocumento_, 'beneficiarios', 'editar'),
      salvarConsentimentos: A(benSalvarConsentimentos_, 'beneficiarios', 'editar'),
      salvarTiposConsentimento: A(benSalvarTiposConsentimento_, 'beneficiarios', 'editar'),
      obterDatasOficina:    A(benDatasOficina_, 'presenca'),
      salvarRecesso:        A(benSalvarRecesso_, 'presenca', 'editar'),
      excluirRecesso:       A(benExcluirRecesso_, 'presenca', 'editar'),
      enviarFotoAula:       A(benEnviarFoto_, 'presenca', 'editar'),
      obterFotoAula:        A(benAbrirFoto_, 'presenca|beneficiarios'),
      excluirRegistroBen:   A(benExcluir_, 'beneficiarios', 'editar')
    }
  };
}

// ───────────────────────── permissões e escopo ─────────────────────────

function benPode_(u, area, nivel) {
  const v = nivel_(u, area);
  return nivel === 'editar' ? v === 'editar' : v === 'ver' || v === 'editar';
}
function benExigir_(u, areas, nivel) {
  if (!String(areas).split('|').some(a => benPode_(u, a, nivel))) {
    const nomes = String(areas).split('|').map(a => NOMES_AREA[a] || a).join(' / ');
    throw new Error(nivel === 'editar' ? 'Você não tem permissão para alterar ' + nomes + '.' : 'Você não tem acesso a ' + nomes + '.');
  }
}
/** IBK é uma instituição só, mas o módulo respeita o acesso por instituição do núcleo (vale para outros clientes). */
function benVeCrianca_(u, b) {
  return b.id_instituicao ? podeVerInstituicao_(u, b.id_instituicao) : podeVerTudo_(u);
}
function benCrianca_(u, id) {
  const b = buscar_('BENEFICIARIOS', 'id_beneficiario', id);
  if (!b || !benVeCrianca_(u, b)) throw new Error('Criança não encontrada.');
  return b;
}
function benProjetoPermitido_(u, idProjeto) {
  exigirAcessoProjeto_(u, idProjeto);
}
/** Instituição da matrícula: a do usuário; senão, a única cadastrada (caso do IBK). */
function benInstituicaoPadrao_(u) {
  if (u.id_instituicao) return u.id_instituicao;
  const insts = ler_('INSTITUICOES').filter(i => i.ativo !== false);
  return insts.length === 1 ? insts[0].id_instituicao : '';
}

// ───────────────────────── opções para a tela ─────────────────────────

function benOpcoes_(u) {
  const sensivel = benPode_(u, 'atendimentos');
  const schema = {};
  BEN_ABAS.forEach(aba => {
    schema[aba] = BEN_SCHEMA[aba].campos.filter(f => f.t !== 'sistema' && f.t !== 'id' && (!f.sensivel || sensivel));
  });
  const listas = {};
  Object.keys(BEN_LISTAS).forEach(k => { listas[k] = LISTAS[k] || BEN_LISTAS[k]; });
  listas.tipo_documento_ben = BEN_TIPOS_DOC;
  listas.tipo_consentimento = benTiposConsentimento_();
  const projetos = projetosPermitidos_(u).map(p => ({ id: String(p.id_projeto), nome: p.sigla ? p.sigla + ' – ' + p.nome_projeto : p.nome_projeto, status: p.status }));
  const ids = projetos.map(p => p.id);
  const ativos = {};
  ler_('BEN_VINCULOS').forEach(v => { if (v.status === 'Ativo' && v.id_oficina) ativos[v.id_oficina] = (ativos[v.id_oficina] || 0) + 1; });
  const oficinas = ler_('OFICINAS').filter(o => ids.indexOf(String(o.id_projeto)) > -1)
    .map(o => ({ id: o.id_oficina, nome: o.nome_oficina, id_projeto: String(o.id_projeto), status: o.status, dias_semana: o.dias_semana,
      educador_nome: o.educador_nome, vagas: o.vagas, ativos: ativos[o.id_oficina] || 0 }));
  const recessos = ler_('BEN_RECESSOS').filter(r => ids.indexOf(String(r.id_projeto)) > -1)
    .map(r => ({ id: r.id_recesso, id_projeto: String(r.id_projeto), descricao: r.descricao, data_inicio: benIso_(r.data_inicio), data_fim: benIso_(r.data_fim) }))
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  return {
    schema: schema, listas: listas, projetos: projetos, oficinas: oficinas, recessos: recessos,
    pode: {
      ver_ficha: benPode_(u, 'beneficiarios'), editar_ficha: benPode_(u, 'beneficiarios', 'editar'),
      presenca: benPode_(u, 'presenca'), fazer_chamada: benPode_(u, 'presenca', 'editar'),
      ocorrencia: benPode_(u, 'beneficiarios', 'editar') || benPode_(u, 'presenca', 'editar'),
      atendimentos: sensivel, editar_atendimentos: benPode_(u, 'atendimentos', 'editar'), excluir: u.perfil === 'ADMIN'
    }
  };
}

// ───────────────────────── beneficiários ─────────────────────────

function benListar_(u, d) {
  benExigir_(u, 'beneficiarios');
  d = d || {};
  const txt = benSemAcento_(d.texto).toLowerCase();
  let noProjeto = null;
  if (d.id_projeto) {
    noProjeto = {};
    ler_('BEN_VINCULOS').forEach(v => { if (String(v.id_projeto) === String(d.id_projeto) && v.status !== 'Encerrado') noProjeto[v.id_beneficiario] = true; });
  }
  return ler_('BENEFICIARIOS')
    .filter(b => benVeCrianca_(u, b))
    .filter(b => !d.status || b.status === d.status)
    .filter(b => !noProjeto || noProjeto[b.id_beneficiario])
    .filter(b => !txt || benSemAcento_([b.nome_completo, b.nome_social, b.num_matricula, b.resp1_nome, b.cpf].join(' ')).toLowerCase().indexOf(txt) > -1)
    .map(b => ({ id_beneficiario: b.id_beneficiario, num_matricula: b.num_matricula, nome: b.nome_social || b.nome_completo,
      idade: benIdade_(b.data_nascimento), status: b.status, responsavel: b.resp1_nome, telefone: b.resp1_telefone }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

function benSalvarBeneficiario_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const id = d.id_beneficiario;
  const atual = id ? benCrianca_(u, id) : null;
  const campos = benValidar_('BENEFICIARIOS', d, u, !!atual);

  const nasc = benData_(campos.data_nascimento || (atual && atual.data_nascimento));
  const idadeMax = Number(config_('ben_idade_maxima') || 17);
  const dataRef = benData_(campos.data_matricula || (atual && atual.data_matricula)) || benHoje_();
  if (!atual && nasc && benIdade_(nasc, dataRef) > idadeMax) {
    throw new Error('Na data da matrícula a pessoa tem ' + benIdade_(nasc, dataRef) + ' anos. O módulo atende crianças e adolescentes (até ' + idadeMax + ' anos).');
  }

  const todos = ler_('BENEFICIARIOS');
  const nome = benSemAcento_(campos.nome_completo || (atual && atual.nome_completo)).toLowerCase();
  const cpf = benDigitos_(campos.cpf !== undefined ? campos.cpf : (atual && atual.cpf));
  const dup = todos.find(b => b.id_beneficiario !== id && ((cpf && benDigitos_(b.cpf) === cpf) ||
    (benSemAcento_(b.nome_completo).toLowerCase() === nome && benIso_(b.data_nascimento) === benIso_(nasc))));
  if (dup) throw new Error('Já existe uma ficha para esta criança: ' + dup.nome_completo + ' (matrícula ' + dup.num_matricula + ').');

  if (atual) {
    benAtualizarComAuditoria_(u, 'BENEFICIARIOS', atual, campos);
  } else {
    if (!campos.data_matricula) campos.data_matricula = benHoje_();
    if (!campos.status) campos.status = 'Matriculado';
    campos.id_instituicao = benInstituicaoPadrao_(u);
    campos.num_matricula = benNovaMatricula_(todos, campos.data_matricula);
    campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
    const novo = inserir_('BENEFICIARIOS', campos);
    registrarAuditoria_(u.id_usuario, 'BENEFICIARIOS', novo.id_beneficiario, 'cadastro', null, { matricula: novo.num_matricula, nome: novo.nome_completo });
    return benFicha_(u, { id_beneficiario: novo.id_beneficiario });
  }
  return benFicha_(u, { id_beneficiario: id });
}

function benNovaMatricula_(todos, dataMatricula) {
  const ano = String((benData_(dataMatricula) || benHoje_()).getFullYear());
  const formato = String(config_('ben_formato_matricula') || '{{ano}}-{{seq}}');
  let max = 0;
  todos.forEach(b => {
    const dm = benData_(b.data_matricula);
    if (!dm || String(dm.getFullYear()) !== ano) return;
    const m = /(\d+)\D*$/.exec(String(b.num_matricula));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return formato.replace('{{ano}}', ano).replace('{{seq}}', String(max + 1).padStart(4, '0'));
}

function benDesligar_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const b = benCrianca_(u, d.id_beneficiario);
  if (!String(d.motivo || '').trim()) throw new Error('Informe o motivo do desligamento.');
  const dt = benData_(d.data) || benHoje_();
  ler_('BEN_VINCULOS').filter(v => v.id_beneficiario === b.id_beneficiario && v.status !== 'Encerrado')
    .forEach(v => benAtualizarComAuditoria_(u, 'BEN_VINCULOS', v, { status: 'Encerrado', data_saida: dt, motivo_saida: d.motivo }));
  benAtualizarComAuditoria_(u, 'BENEFICIARIOS', b, { status: d.status === 'Transferido' ? 'Transferido' : 'Desligado', data_desligamento: dt, motivo_desligamento: d.motivo });
  return benFicha_(u, { id_beneficiario: b.id_beneficiario });
}

// ───────────────────────── vínculos e oficinas ─────────────────────────

function benSalvarVinculo_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const b = benCrianca_(u, d.id_beneficiario);
  let of = null;
  if (d.id_oficina) {
    of = buscar_('OFICINAS', 'id_oficina', d.id_oficina);
    if (!of) throw new Error('Oficina não encontrada.');
    d = Object.assign({}, d, { id_projeto: String(of.id_projeto) });   // a oficina manda no projeto
  }
  const campos = benValidar_('BEN_VINCULOS', d, u, false);
  benProjetoPermitido_(u, campos.id_projeto);
  const vinculos = ler_('BEN_VINCULOS');
  const rep = vinculos.find(v => v.id_beneficiario === b.id_beneficiario && v.status !== 'Encerrado' &&
    String(v.id_projeto) === String(campos.id_projeto) && String(v.id_oficina || '') === String(campos.id_oficina || ''));
  if (rep) throw new Error('A criança já está vinculada a este projeto/oficina.');

  campos.status = campos.status || 'Ativo';
  const avisos = [];
  if (of && campos.status === 'Ativo') {
    const vagas = Number(of.vagas) || 0;
    const ocupadas = vinculos.filter(v => v.id_oficina === of.id_oficina && v.status === 'Ativo').length;
    if (vagas && ocupadas >= vagas) { campos.status = 'Lista de espera'; avisos.push('Oficina sem vaga (' + ocupadas + '/' + vagas + '): a criança entrou na lista de espera.'); }
    const idade = benIdade_(b.data_nascimento, campos.data_entrada);
    if ((of.idade_min !== '' && idade < Number(of.idade_min)) || (of.idade_max !== '' && idade > Number(of.idade_max))) {
      avisos.push('A criança tem ' + idade + ' anos e a faixa da oficina é ' + of.idade_min + '–' + of.idade_max + '.');
    }
  }
  campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
  const novo = inserir_('BEN_VINCULOS', campos);
  registrarAuditoria_(u.id_usuario, 'BEN_VINCULOS', novo.id_vinculo, 'cadastro', null, { crianca: b.id_beneficiario, projeto: campos.id_projeto, oficina: campos.id_oficina || '' });
  const r = benFicha_(u, { id_beneficiario: b.id_beneficiario });
  r.aviso = avisos.join(' ');
  return r;
}

function benEncerrarVinculo_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const v = buscar_('BEN_VINCULOS', 'id_vinculo', d.id_vinculo);
  if (!v) throw new Error('Vínculo não encontrado.');
  benCrianca_(u, v.id_beneficiario);
  benAtualizarComAuditoria_(u, 'BEN_VINCULOS', v, { status: 'Encerrado', data_saida: benData_(d.data) || benHoje_(), motivo_saida: d.motivo || '' });
  return benFicha_(u, { id_beneficiario: v.id_beneficiario });
}

function benSalvarOficina_(u, d) {
  benExigir_(u, 'presenca', 'editar');
  const atual = d.id_oficina ? buscar_('OFICINAS', 'id_oficina', d.id_oficina) : null;
  if (d.id_oficina && !atual) throw new Error('Oficina não encontrada.');
  const campos = benValidar_('OFICINAS', d, u, !!atual);
  benProjetoPermitido_(u, campos.id_projeto || atual.id_projeto);
  if (atual) benAtualizarComAuditoria_(u, 'OFICINAS', atual, campos);
  else {
    campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
    const novo = inserir_('OFICINAS', campos);
    registrarAuditoria_(u.id_usuario, 'OFICINAS', novo.id_oficina, 'cadastro', null, { nome: novo.nome_oficina });
  }
  return benOpcoes_(u);
}

function benObterOficina_(u, d) {
  benExigir_(u, 'presenca');
  const o = buscar_('OFICINAS', 'id_oficina', d.id_oficina);
  if (!o) throw new Error('Oficina não encontrada.');
  benProjetoPermitido_(u, o.id_projeto);
  return benLimpo_(o);
}

// ───────────────────────── lista de presença ─────────────────────────

function benAlvo_(u, d) {
  if (d.id_oficina) {
    const of = buscar_('OFICINAS', 'id_oficina', d.id_oficina);
    if (!of) throw new Error('Oficina não encontrada.');
    benProjetoPermitido_(u, of.id_projeto);
    return { id_projeto: String(of.id_projeto), id_oficina: of.id_oficina, oficina: of, titulo: of.nome_oficina };
  }
  if (d.id_projeto) {
    benProjetoPermitido_(u, d.id_projeto);
    const p = buscar_('PROJETOS', 'id_projeto', d.id_projeto) || {};
    return { id_projeto: String(d.id_projeto), id_oficina: '', titulo: p.sigla || p.nome_projeto || String(d.id_projeto) };
  }
  throw new Error('Escolha uma oficina ou um projeto.');
}

/** Crianças com vínculo válido em algum dia entre de e ate (oficina: as da oficina + as do projeto todo). */
function benVinculadas_(alvo, de, ate) {
  const ids = {};
  ler_('BEN_VINCULOS').forEach(v => {
    if (v.status === 'Lista de espera' || String(v.id_projeto) !== alvo.id_projeto) return;
    if (alvo.id_oficina && v.id_oficina && v.id_oficina !== alvo.id_oficina) return;
    const ent = benData_(v.data_entrada), sai = benData_(v.data_saida);
    if (v.status === 'Encerrado' && !sai) return;
    if (ent && ent > ate) return;
    if (sai && sai < de) return;
    ids[v.id_beneficiario] = true;
  });
  return Object.keys(ids);
}

function benChamadaDoDia_(alvo, data) {
  return ler_('BEN_CHAMADAS').find(c => String(c.id_projeto) === alvo.id_projeto &&
    String(c.id_oficina || '') === String(alvo.id_oficina || '') && benIso_(c.data) === benIso_(data)) || null;
}

function benListaPresenca_(u, d) {
  benExigir_(u, 'presenca');
  const alvo = benAlvo_(u, d), data = benData_(d.data) || benHoje_();
  const bens = {}; ler_('BENEFICIARIOS').forEach(b => { bens[b.id_beneficiario] = b; });
  const chamada = benChamadaDoDia_(alvo, data);
  const marcadas = {};
  if (chamada) ler_('BEN_PRESENCAS').filter(p => p.id_chamada === chamada.id_chamada).forEach(p => { marcadas[p.id_beneficiario] = p; });
  const ids = benVinculadas_(alvo, data, data);
  Object.keys(marcadas).forEach(id => { if (ids.indexOf(id) === -1) ids.push(id); });
  const criancas = ids.filter(id => bens[id]).map(id => {
    const b = bens[id], p = marcadas[id];
    return { id_beneficiario: id, nome: b.nome_social || b.nome_completo, idade: benIdade_(b.data_nascimento, data),
      alerta_saude: [b.alergias, b.restricoes_alimentares].filter(String).join(' · '),
      situacao: p ? p.situacao : '', justificativa: p ? p.justificativa : '' };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const imagem = benRespostas_(BEN_TIPO_IMAGEM);
  criancas.forEach(c => { c.autoriza_imagem = imagem[c.id_beneficiario] === 'Autoriza'; });
  const fotos = chamada ? ler_('BEN_FOTOS').filter(f => f.id_chamada === chamada.id_chamada)
    .map(f => ({ id_foto: f.id_foto, legenda: f.legenda, nome_arquivo: f.nome_arquivo })) : [];
  return { data: benIso_(data), id_projeto: alvo.id_projeto, id_oficina: alvo.id_oficina, titulo: alvo.titulo,
    educador_nome: chamada ? chamada.educador_nome : (alvo.oficina ? alvo.oficina.educador_nome : ''),
    chamada: chamada ? benLimpo_(chamada) : null, criancas: criancas, fotos: fotos,
    sem_autorizacao_imagem: criancas.filter(c => !c.autoriza_imagem).map(c => c.nome),
    prevista: alvo.oficina ? benDiasDaOficina_(alvo.oficina.dias_semana, data, data).length > 0 && !benRecessoDe_(alvo.id_projeto)(benIso_(data)) : null,
    recesso: benRecessoDe_(alvo.id_projeto)(benIso_(data)) || '' };
}

function benSalvarChamada_(u, d) {
  benExigir_(u, 'presenca', 'editar');
  const alvo = benAlvo_(u, d), data = benData_(d.data);
  if (!data) throw new Error('Informe a data da chamada.');
  if (data > benHoje_()) throw new Error('Não dá para lançar chamada em data futura.');
  const itens = (d.itens || []).filter(i => i.situacao);
  if (!itens.length) throw new Error('Marque a presença de pelo menos uma criança.');
  itens.forEach(i => { if (BEN_LISTAS.situacao_presenca.indexOf(i.situacao) === -1) throw new Error('Situação inválida: ' + i.situacao); });

  const cab = { id_projeto: alvo.id_projeto, id_oficina: alvo.id_oficina || '', data: data };
  if (d.educador_nome !== undefined) cab.educador_nome = d.educador_nome;
  if (d.atividade_realizada !== undefined) cab.atividade_realizada = d.atividade_realizada;
  let chamada = benChamadaDoDia_(alvo, data);
  if (chamada) atualizar_('BEN_CHAMADAS', chamada._linha, Object.assign({ atualizado_em: new Date(), atualizado_por: u.id_usuario }, cab));
  else { cab.criado_em = new Date(); cab.criado_por = u.id_usuario; chamada = inserir_('BEN_CHAMADAS', cab); }
  const idCh = chamada.id_chamada;

  // Presenças: atualiza quem já tinha linha; o resto entra num lote só.
  const atuais = {};
  ler_('BEN_PRESENCAS').filter(p => p.id_chamada === idCh).forEach(p => { atuais[p.id_beneficiario] = p; });
  const novas = [], agora = new Date();
  itens.forEach(i => {
    const p = atuais[i.id_beneficiario];
    if (p) {
      if (p.situacao !== i.situacao || String(p.justificativa) !== String(i.justificativa || '')) {
        atualizar_('BEN_PRESENCAS', p._linha, { situacao: i.situacao, justificativa: i.justificativa || '', atualizado_em: agora, atualizado_por: u.id_usuario });
      }
      p.situacao = i.situacao;
      return;
    }
    const o = { id_presenca: gerarId('BEN_PRESENCAS'), id_chamada: idCh, id_beneficiario: i.id_beneficiario, id_projeto: cab.id_projeto,
      id_oficina: cab.id_oficina, data: data, situacao: i.situacao, justificativa: i.justificativa || '', criado_em: agora, criado_por: u.id_usuario };
    atuais[i.id_beneficiario] = o;
    novas.push(o);
  });
  if (novas.length) {
    const sh = aba_('BEN_PRESENCAS');
    const col = garantirColunas_(sh, ESTRUTURA.BEN_PRESENCAS);
    sh.getRange(linhaLivre_(sh, novas.length), 1, novas.length, col.length).setValues(novas.map(o => col.map(c => o[c] === undefined ? '' : o[c])));
    invalidar_('BEN_PRESENCAS');
  }
  const totais = { Presente: 0, Falta: 0, 'Falta justificada': 0 };
  Object.keys(atuais).forEach(k => { if (atuais[k].situacao in totais) totais[atuais[k].situacao]++; });
  const linhaCh = buscar_('BEN_CHAMADAS', 'id_chamada', idCh)._linha;
  atualizar_('BEN_CHAMADAS', linhaCh, { total_presentes: totais.Presente, total_faltas: totais.Falta, total_justificadas: totais['Falta justificada'] });
  registrarAuditoria_(u.id_usuario, 'BEN_CHAMADAS', idCh, 'presenca', null,
    { data: benIso_(data), marcadas: itens.length, presentes: totais.Presente, faltas: totais.Falta, justificadas: totais['Falta justificada'] });
  return benListaPresenca_(u, { id_oficina: alvo.id_oficina, id_projeto: alvo.id_projeto, data: benIso_(data) });
}

// ───────────────────────── frequência ─────────────────────────

/**
 * Frequência = presenças ÷ chamadas da criança. ⚠ Falta justificada conta como ausência (confirmar com o edital).
 */
function benFrequencia_(f) {
  const de = benData_(f.de), ate = benData_(f.ate);
  const minima = Number(config_('ben_frequencia_minima')) || 0.75;
  const limite = Number(config_('ben_faltas_alerta')) || 3;
  const bens = {}; ler_('BENEFICIARIOS').forEach(b => { bens[b.id_beneficiario] = b; });
  const por = {};
  ler_('BEN_PRESENCAS').forEach(p => {
    if (f.id_oficina && p.id_oficina !== f.id_oficina) return;
    if (f.id_projeto && String(p.id_projeto) !== String(f.id_projeto)) return;
    if (f.id_beneficiario && p.id_beneficiario !== f.id_beneficiario) return;
    if (f.projetos && f.projetos.indexOf(String(p.id_projeto)) === -1) return;
    const dt = benData_(p.data);
    if ((de && dt < de) || (ate && dt > ate)) return;
    (por[p.id_beneficiario] = por[p.id_beneficiario] || []).push({ d: dt, s: p.situacao });
  });
  return Object.keys(por).map(id => {
    const regs = por[id].sort((a, b) => a.d - b.d);
    const r = { id_beneficiario: id, nome: bens[id] ? (bens[id].nome_social || bens[id].nome_completo) : id,
      chamadas: regs.length, presentes: 0, faltas: 0, justificadas: 0, faltas_seguidas: 0 };
    regs.forEach(x => { if (x.s === 'Presente') r.presentes++; else if (x.s === 'Falta') r.faltas++; else if (x.s === 'Falta justificada') r.justificadas++; });
    for (let i = regs.length - 1; i >= 0 && regs[i].s === 'Falta'; i--) r.faltas_seguidas++;
    r.frequencia = r.chamadas ? Math.round(r.presentes / r.chamadas * 1000) / 1000 : null;
    r.evasao = r.faltas_seguidas >= limite;   // alerta de evasão (padrão 3 faltas seguidas, CONFIG.ben_faltas_alerta)
    r.alerta = (r.frequencia !== null && r.frequencia < minima) || r.evasao;
    return r;
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function benFrequenciaAcao_(u, d) {
  benExigir_(u, 'presenca|beneficiarios');
  const alvo = benAlvo_(u, d);
  return benFrequencia_({ id_oficina: alvo.id_oficina, id_projeto: alvo.id_projeto, de: d.de, ate: d.ate });
}

/** Dados da lista de presença do mês (a tela monta a grade para imprimir/salvar em PDF). */
function benListaMes_(u, d) {
  benExigir_(u, 'presenca');
  const alvo = benAlvo_(u, d);
  const ano = Number(d.ano), mes = Number(d.mes);
  const ini = new Date(ano, mes - 1, 1), fim = new Date(ano, mes, 0);
  const chamadas = ler_('BEN_CHAMADAS').filter(c => {
    const dt = benData_(c.data);
    return String(c.id_projeto) === alvo.id_projeto && String(c.id_oficina || '') === String(alvo.id_oficina || '') && dt >= ini && dt <= fim;
  });
  let dias = chamadas.map(c => benIso_(c.data));
  if (!dias.length && alvo.oficina) { const rec = benRecessoDe_(alvo.id_projeto); dias = benDiasDaOficina_(alvo.oficina.dias_semana, ini, fim).filter(x => !rec(x)); }
  dias = dias.filter((x, i) => dias.indexOf(x) === i).sort();
  const idsCh = chamadas.map(c => c.id_chamada), marc = {};
  ler_('BEN_PRESENCAS').forEach(p => { if (idsCh.indexOf(p.id_chamada) > -1) marc[p.id_beneficiario + '|' + benIso_(p.data)] = p.situacao; });
  const bens = {}; ler_('BENEFICIARIOS').forEach(b => { bens[b.id_beneficiario] = b; });
  const ids = benVinculadas_(alvo, ini, fim);
  Object.keys(marc).forEach(k => { const id = k.split('|')[0]; if (ids.indexOf(id) === -1) ids.push(id); });
  const p = buscar_('PROJETOS', 'id_projeto', alvo.id_projeto) || {};
  return {
    ano: ano, mes: mes, dias: dias,
    projeto: { nome: p.nome_projeto || alvo.id_projeto, termo: p.termo_fomento_cit || '' },
    oficina: alvo.oficina ? { nome: alvo.oficina.nome_oficina, educador: alvo.oficina.educador_nome, dias_semana: alvo.oficina.dias_semana } : null,
    criancas: ids.filter(id => bens[id]).map(id => ({ nome: bens[id].nome_completo, marcas: dias.map(dd => marc[id + '|' + dd] || '') }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  };
}

function benDiasDaOficina_(texto, ini, fim) {
  const mapa = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 }, alvo = [];
  (benSemAcento_(texto).toLowerCase().match(/[a-z]{3}/g) || []).forEach(m => { if (m in mapa && alvo.indexOf(mapa[m]) === -1) alvo.push(mapa[m]); });
  const out = [];
  for (let dt = new Date(ini); dt <= fim; dt.setDate(dt.getDate() + 1)) if (alvo.indexOf(dt.getDay()) > -1) out.push(benIso_(dt));
  return out;
}

// ───────────────────────── ficha completa ─────────────────────────

function benFicha_(u, d) {
  benExigir_(u, 'beneficiarios');
  const b = benCrianca_(u, d.id_beneficiario);
  const sensivel = benPode_(u, 'atendimentos');
  const ficha = benLimpo_(b);
  if (!sensivel) BEN_SCHEMA.BENEFICIARIOS.campos.forEach(f => { if (f.sensivel) delete ficha[f.n]; });
  ficha.idade = benIdade_(b.data_nascimento);

  const projetos = {}; ler_('PROJETOS').forEach(p => { projetos[String(p.id_projeto)] = p.sigla || p.nome_projeto; });
  const oficinas = {}; ler_('OFICINAS').forEach(o => { oficinas[o.id_oficina] = o.nome_oficina; });
  const id = b.id_beneficiario;
  const porData = (x, y) => String(y.data).localeCompare(String(x.data));
  const doBen = aba => ler_(aba).filter(r => r.id_beneficiario === id).map(benLimpo_).sort(porData);

  const ocorrencias = doBen('BEN_OCORRENCIAS').filter(o => sensivel || o.sigiloso !== true);
  const docs = ler_('DOCUMENTOS').filter(x => x.id_beneficiario === id).map(x => {
    const o = benLimpo_(x); const val = benData_(x.validade);
    o.vencido = !!(val && val < benHoje_());
    return o;
  });
  return {
    ficha: ficha,
    vinculos: ler_('BEN_VINCULOS').filter(v => v.id_beneficiario === id).map(v => Object.assign(benLimpo_(v), {
      projeto_nome: projetos[String(v.id_projeto)] || v.id_projeto, oficina_nome: v.id_oficina ? (oficinas[v.id_oficina] || v.id_oficina) : '(projeto todo)' })),
    frequencia: benFrequencia_({ id_beneficiario: id })[0] || null,
    ocorrencias: ocorrencias,
    encaminhamentos: sensivel ? doBen('BEN_ENCAMINHAMENTOS') : [],
    acompanhamentos: sensivel ? doBen('BEN_ACOMPANHAMENTOS') : [],
    documentos: docs,
    consentimentos: benConsentimentosDe_(id),
    pendencias: benPendencias_(b, docs, ocorrencias)
  };
}

function benPendencias_(b, docs, ocorrencias) {
  const p = [];
  const tipos = docs.filter(x => !x.vencido).map(x => x.tipo);
  BEN_DOCS_OBRIGATORIOS.forEach(t => { if (tipos.indexOf(t) === -1) p.push('Falta documento: ' + t); });
  docs.filter(x => x.vencido).forEach(x => p.push('Documento vencido: ' + x.tipo + ' (' + benBr_(x.validade) + ')'));
  benConsentimentosDe_(b.id_beneficiario).filter(c => !c.resposta).forEach(c => p.push('Falta consentimento: ' + c.tipo));
  const fr = benFrequencia_({ id_beneficiario: b.id_beneficiario })[0];
  const limite = Number(config_('ben_faltas_alerta')) || 3;
  if (fr && fr.faltas_seguidas >= limite && b.status !== 'Desligado' && b.status !== 'Transferido')
    p.push('Alerta de evasão: ' + fr.faltas_seguidas + ' faltas seguidas');
  ocorrencias.filter(o => o.status !== 'Encerrada' && o.gravidade === 'Alta').forEach(o => p.push('Ocorrência grave em aberto (' + benBr_(o.data) + ')'));
  return p;
}

// ───────────────────────── registros da ficha ─────────────────────────

function benSalvarOcorrencia_(u, d) {
  benExigir_(u, 'beneficiarios|presenca', 'editar');
  if (d.sigiloso === true && !benPode_(u, 'atendimentos', 'editar')) throw new Error('Só quem edita Atendimentos marca um registro como sigiloso.');
  benSalvarRegistro_(u, 'BEN_OCORRENCIAS', d);
  return benPode_(u, 'beneficiarios') ? benFicha_(u, { id_beneficiario: d.id_beneficiario }) : { ok: true };
}

function benSalvarAtendimento_(aba) {
  return function (u, d) {
    benExigir_(u, 'atendimentos', 'editar');
    benSalvarRegistro_(u, aba, d);
    return benFicha_(u, { id_beneficiario: d.id_beneficiario });
  };
}

function benSalvarRegistro_(u, aba, d) {
  const chave = BEN_SCHEMA[aba].campos[0].n;
  const b = benCrianca_(u, d.id_beneficiario);
  const atual = d[chave] ? buscar_(aba, chave, d[chave]) : null;
  if (d[chave] && (!atual || atual.id_beneficiario !== b.id_beneficiario)) throw new Error('Registro não encontrado.');
  if (atual && atual.sigiloso === true && !benPode_(u, 'atendimentos', 'editar')) throw new Error('Registro sigiloso.');
  const campos = benValidar_(aba, d, u, !!atual);
  campos.id_beneficiario = b.id_beneficiario;
  if (atual) return benAtualizarComAuditoria_(u, aba, atual, campos);
  campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
  const novo = inserir_(aba, campos);
  registrarAuditoria_(u.id_usuario, aba, novo[chave], 'cadastro', null, { crianca: b.id_beneficiario, data: benIso_(campos.data), tipo: campos.tipo || campos.servico_destino || '' });
  return novo;
}

// ───────────────────────── documentos ─────────────────────────

function benPastaCrianca_(b) {
  let raizId = config_('ben_pasta_drive_id');
  if (!raizId) {
    const pai = config_('pasta_raiz_drive_id') ? DriveApp.getFolderById(config_('pasta_raiz_drive_id')) : DriveApp.getRootFolder();
    raizId = pai.createFolder('Beneficiários (dados pessoais – acesso restrito)').getId();
    definirConfig_('ben_pasta_drive_id', raizId, 'Pasta do Drive com as pastas das crianças');
  }
  const raiz = DriveApp.getFolderById(raizId), nome = b.id_beneficiario + ' – ' + b.nome_completo;
  const it = raiz.getFoldersByName(nome);
  return it.hasNext() ? it.next() : raiz.createFolder(nome);
}

function benEnviarDocumento_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const b = benCrianca_(u, d.id_beneficiario);
  if (BEN_TIPOS_DOC.indexOf(d.tipo) === -1) throw new Error('Escolha o tipo do documento.');
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione um arquivo.');
  const bytes = Utilities.base64Decode(d.arquivo.base64);
  if (bytes.length > LIMITE_ARQUIVO_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_ARQUIVO_MB + ' MB.');
  const ext = (/(\.[A-Za-z0-9]{1,5})$/.exec(d.arquivo.nome || '') || ['', ''])[1].toLowerCase();
  const nome = d.tipo + ' - ' + b.nome_completo + ext;
  const file = benPastaCrianca_(b).createFile(Utilities.newBlob(bytes, d.arquivo.mime || 'application/octet-stream', nome));
  const doc = inserir_('DOCUMENTOS', {
    id_projeto: '', id_contratacao: '', id_beneficiario: b.id_beneficiario, tipo: d.tipo, nome_arquivo: nome,
    nome_original: d.arquivo.nome || '', drive_file_id: file.getId(), url: file.getUrl(), mime_type: d.arquivo.mime || '',
    enviado_por: u.id_usuario, enviado_em: new Date(), validade: benData_(d.validade) || ''
  });
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', doc.id_documento, 'upload', null, { crianca: b.id_beneficiario, tipo: d.tipo });
  return benFicha_(u, { id_beneficiario: b.id_beneficiario });
}

/** Chamado por baixarArquivo_ (núcleo) quando o arquivo é documento de criança. */
function benExigirDocumento_(u, doc) {
  benExigir_(u, 'beneficiarios');
  benCrianca_(u, doc.id_beneficiario);
}

// ───────────────────────── exclusão (só ADMIN, vai para a LIXEIRA) ─────────────────────────

function benExcluir_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const aba = d.aba;
  const permitidas = ['BEN_OCORRENCIAS', 'BEN_ENCAMINHAMENTOS', 'BEN_ACOMPANHAMENTOS', 'BEN_VINCULOS', 'BEN_CHAMADAS', 'OFICINAS', 'BENEFICIARIOS', 'BEN_FOTOS'];
  if (permitidas.indexOf(aba) === -1) throw new Error('Exclusão não permitida nesta aba.');
  const chave = BEN_SCHEMA[aba].campos[0].n;
  const r = buscar_(aba, chave, d.id);
  if (!r) throw new Error('Registro não encontrado.');
  if (aba === 'BENEFICIARIOS') {
    const ligados = ['BEN_VINCULOS', 'BEN_PRESENCAS', 'BEN_OCORRENCIAS', 'BEN_ENCAMINHAMENTOS', 'BEN_ACOMPANHAMENTOS', 'BEN_CONSENTIMENTOS']
      .filter(a => ler_(a).some(x => x.id_beneficiario === d.id));
    if (ligados.length) throw new Error('A criança tem histórico no sistema. Use "Desligar" em vez de excluir.');
  }
  if (aba === 'OFICINAS' && ler_('BEN_VINCULOS').some(v => v.id_oficina === d.id)) throw new Error('A oficina tem crianças vinculadas. Mude a situação para Encerrada.');
  if (aba === 'BEN_CHAMADAS') {
    if (ler_('BEN_FOTOS').some(f => f.id_chamada === d.id)) throw new Error('A chamada tem fotos. Exclua as fotos primeiro.');
    const pres = ler_('BEN_PRESENCAS').filter(p => p.id_chamada === d.id);
    guardarNaLixeira_(u, 'BEN_PRESENCAS', pres, r.id_projeto);
    conferirLinhas_('BEN_PRESENCAS');
    pres.map(p => p._linha).sort((a, b) => b - a).forEach(l => aba_('BEN_PRESENCAS').deleteRow(l));
    invalidar_('BEN_PRESENCAS');
  }
  guardarNaLixeira_(u, aba, [r], r.id_projeto || '');
  conferirLinhas_(aba); aba_(aba).deleteRow(r._linha); invalidar_(aba);
  registrarAuditoria_(u.id_usuario, aba, d.id, 'exclusao', benLimpo_(r), null);
  if (aba === 'BEN_FOTOS') { try { DriveApp.getFileById(r.drive_file_id).setTrashed(true); } catch (e) { console.warn('Drive: ' + e.message); } }
  return r.id_beneficiario ? benFicha_(u, { id_beneficiario: r.id_beneficiario }) : true;
}

// ───────────────────────── consentimentos da família ─────────────────────────

const BEN_TIPO_IMAGEM = 'Uso de imagem e voz';

/** Tipos de termo: CONFIG.lista_tipo_consentimento (JSON, editado pela tela, como as listas de Configurações do núcleo). */
function benTiposConsentimento_() {
  let v = null;
  try { v = JSON.parse(config_('lista_tipo_consentimento') || 'null'); } catch (e) { v = null; }
  return Array.isArray(v) && v.length ? v.map(String).filter(String) : BEN_LISTAS.tipo_consentimento.slice();
}

function benSalvarTiposConsentimento_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const tipos = (d.tipos || []).map(x => String(x || '').trim()).filter((x, i, a) => x && a.indexOf(x) === i);
  if (!tipos.length) throw new Error('Informe pelo menos um termo.');
  definirConfig_('lista_tipo_consentimento', JSON.stringify(tipos), 'Termos e autorizações pedidos à família na matrícula');
  registrarAuditoria_(u.id_usuario, 'CONFIG', 'lista_tipo_consentimento', 'edicao', null, { tipos: tipos.join(' | ') });
  return benOpcoes_(u);
}

/** {id_beneficiario: resposta} de um tipo de consentimento. */
function benRespostas_(tipo) {
  const r = {};
  ler_('BEN_CONSENTIMENTOS').forEach(c => { if (c.tipo === tipo) r[c.id_beneficiario] = c.resposta; });
  return r;
}

/** Um item por tipo da lista (respondido ou não), mais algum tipo antigo que saiu da lista mas já tem resposta. */
function benConsentimentosDe_(id) {
  const regs = {}; ler_('BEN_CONSENTIMENTOS').forEach(c => { if (c.id_beneficiario === id) regs[c.tipo] = c; });
  const tipos = benTiposConsentimento_();
  Object.keys(regs).forEach(t => { if (tipos.indexOf(t) === -1) tipos.push(t); });
  return tipos.map(t => {
    const c = regs[t];
    return c ? { tipo: t, id_consentimento: c.id_consentimento, resposta: c.resposta, data: benIso_(c.data),
      responsavel_nome: c.responsavel_nome, observacao: c.observacao } : { tipo: t, resposta: '' };
  });
}

/** d = { id_beneficiario, itens: [{tipo, resposta, data, responsavel_nome, observacao}] } (um por tipo; regrava o que já existe). */
function benSalvarConsentimentos_(u, d) {
  benExigir_(u, 'beneficiarios', 'editar');
  const b = benCrianca_(u, d.id_beneficiario);
  const tipos = benTiposConsentimento_();
  const atuais = {}; ler_('BEN_CONSENTIMENTOS').forEach(c => { if (c.id_beneficiario === b.id_beneficiario) atuais[c.tipo] = c; });
  (d.itens || []).filter(i => i && i.resposta).forEach(i => {
    if (tipos.indexOf(i.tipo) === -1 && !atuais[i.tipo]) throw new Error('Consentimento desconhecido: ' + i.tipo);
    if (BEN_LISTAS.resposta_consentimento.indexOf(i.resposta) === -1) throw new Error('Resposta inválida: ' + i.resposta);
    const campos = { id_beneficiario: b.id_beneficiario, tipo: i.tipo, resposta: i.resposta, data: benData_(i.data) || benHoje_(),
      responsavel_nome: String(i.responsavel_nome || '').trim(), observacao: String(i.observacao || '').trim() };
    const atual = atuais[i.tipo];
    if (atual) benAtualizarComAuditoria_(u, 'BEN_CONSENTIMENTOS', atual, campos);
    else {
      campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
      const novo = inserir_('BEN_CONSENTIMENTOS', campos);
      registrarAuditoria_(u.id_usuario, 'BEN_CONSENTIMENTOS', novo.id_consentimento, 'cadastro', null, { crianca: b.id_beneficiario, tipo: i.tipo, resposta: i.resposta });
    }
  });
  return benFicha_(u, { id_beneficiario: b.id_beneficiario });
}

// ───────────────────────── datas da oficina (calendário da chamada) ─────────────────────────

/**
 * Todas as datas da oficina, pelos dias da semana, do início ao fim das atividades
 * (sem datas na oficina, usa a vigência do projeto). As datas são calculadas na hora, não ficam gravadas:
 * se a oficina mudar de dia, o calendário muda junto. Chamadas fora da agenda (aula extra) também aparecem.
 */
function benDatasOficina_(u, d) {
  benExigir_(u, 'presenca');
  const alvo = benAlvo_(u, { id_oficina: d.id_oficina });
  const o = alvo.oficina, p = buscar_('PROJETOS', 'id_projeto', alvo.id_projeto) || {};
  const ini = benData_(o.data_inicio) || benData_(p.inicio_vigencia), fim = benData_(o.data_fim) || benData_(p.fim_vigencia);
  const hoje = benIso_(benHoje_());
  const chamadas = {};
  ler_('BEN_CHAMADAS').forEach(c => { if (c.id_oficina === o.id_oficina) chamadas[benIso_(c.data)] = c; });
  const fotos = {}; ler_('BEN_FOTOS').forEach(f => { if (f.id_oficina === o.id_oficina) fotos[f.id_chamada] = (fotos[f.id_chamada] || 0) + 1; });
  const recesso = benRecessoDe_(alvo.id_projeto);
  const previstas = ini && fim ? benDiasDaOficina_(o.dias_semana, ini, fim).filter(x => !recesso(x)) : [];
  const todas = previstas.concat(Object.keys(chamadas).filter(x => previstas.indexOf(x) === -1)).sort();
  const datas = todas.map(x => {
    const c = chamadas[x];
    return { data: x, prevista: previstas.indexOf(x) > -1, recesso: recesso(x) || '',
      situacao: c ? 'feita' : (x > hoje ? 'futura' : 'pendente'),
      presentes: c ? Number(c.total_presentes) || 0 : null, faltas: c ? (Number(c.total_faltas) || 0) + (Number(c.total_justificadas) || 0) : null,
      fotos: c ? fotos[c.id_chamada] || 0 : 0 };
  });
  const aviso = !String(o.dias_semana || '').trim() ? 'A oficina não tem dias da semana cadastrados.'
    : !(ini && fim) ? 'Faltam as datas de início e fim (na oficina ou na vigência do projeto).' : '';
  return { id_oficina: o.id_oficina, id_projeto: alvo.id_projeto, titulo: o.nome_oficina, dias_semana: o.dias_semana,
    inicio: benIso_(ini), fim: benIso_(fim), hoje: hoje, aviso: aviso, datas: datas,
    resumo: { previstas: previstas.length, feitas: datas.filter(x => x.situacao === 'feita').length,
      pendentes: datas.filter(x => x.situacao === 'pendente').length },
    recessos: ler_('BEN_RECESSOS').filter(r => String(r.id_projeto) === alvo.id_projeto)
      .map(r => ({ descricao: r.descricao, data_inicio: benIso_(r.data_inicio), data_fim: benIso_(r.data_fim) })) };
}

// ───────────────────────── fotos da aula ─────────────────────────

const BEN_FOTO_MB = 8;

/** d = { id_oficina | id_projeto, data, arquivo: {nome, mime, base64}, legenda }. A chamada do dia precisa estar salva. */
function benEnviarFoto_(u, d) {
  benExigir_(u, 'presenca', 'editar');
  const alvo = benAlvo_(u, d), data = benData_(d.data);
  const chamada = data && benChamadaDoDia_(alvo, data);
  if (!chamada) throw new Error('Salve a chamada antes de enviar fotos.');
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione uma foto.');
  if (!/^image\//.test(d.arquivo.mime || '')) throw new Error('Envie uma imagem (JPG ou PNG).');
  const bytes = Utilities.base64Decode(d.arquivo.base64);
  if (bytes.length > BEN_FOTO_MB * 1024 * 1024) throw new Error('Foto maior que ' + BEN_FOTO_MB + ' MB.');
  const n = ler_('BEN_FOTOS').filter(f => f.id_chamada === chamada.id_chamada).length + 1;
  const ext = /png/.test(d.arquivo.mime) ? '.png' : '.jpg';
  const nome = benIso_(data) + ' - ' + benSemBarra_(alvo.titulo) + ' - ' + String(n).padStart(2, '0') + ext;
  const pasta = subpastaProjeto_(alvo.id_projeto, 'Fotos das oficinas');
  const file = pasta.createFile(Utilities.newBlob(bytes, d.arquivo.mime, nome));
  const foto = inserir_('BEN_FOTOS', {
    id_chamada: chamada.id_chamada, id_projeto: alvo.id_projeto, id_oficina: alvo.id_oficina || '', data: data,
    legenda: String(d.legenda || '').trim(), nome_arquivo: nome, drive_file_id: file.getId(), url: file.getUrl(), mime_type: d.arquivo.mime,
    criado_em: new Date(), criado_por: u.id_usuario
  });
  registrarAuditoria_(u.id_usuario, 'BEN_FOTOS', foto.id_foto, 'upload', null, { chamada: chamada.id_chamada, data: benIso_(data) });
  return benListaPresenca_(u, { id_oficina: alvo.id_oficina, id_projeto: alvo.id_projeto, data: benIso_(data) });
}

/** Abre a foto pelo sistema (como o baixarArquivo do núcleo), só para quem tem acesso ao projeto. */
function benAbrirFoto_(u, d) {
  benExigir_(u, 'presenca|beneficiarios');
  const f = buscar_('BEN_FOTOS', 'id_foto', d.id_foto);
  if (!f) throw new Error('Foto não encontrada.');
  benProjetoPermitido_(u, f.id_projeto);
  const blob = DriveApp.getFileById(f.drive_file_id).getBlob();
  return { nome: f.nome_arquivo, mime: blob.getContentType() || f.mime_type, base64: Utilities.base64Encode(blob.getBytes()) };
}

// ───────────────────────── férias e recessos ─────────────────────────

/** Função data ISO → descrição do recesso (ou '') para um projeto. */
function benRecessoDe_(idProjeto) {
  const regs = ler_('BEN_RECESSOS').filter(r => String(r.id_projeto) === String(idProjeto))
    .map(r => ({ d: r.descricao, i: benIso_(r.data_inicio), f: benIso_(r.data_fim) }));
  return iso => { const r = regs.find(x => iso >= x.i && iso <= x.f); return r ? r.d : ''; };
}

function benSalvarRecesso_(u, d) {
  benExigir_(u, 'presenca', 'editar');
  const atual = d.id_recesso ? buscar_('BEN_RECESSOS', 'id_recesso', d.id_recesso) : null;
  if (d.id_recesso && !atual) throw new Error('Período não encontrado.');
  const campos = benValidar_('BEN_RECESSOS', d, u, !!atual);
  benProjetoPermitido_(u, campos.id_projeto || atual.id_projeto);
  const ini = campos.data_inicio || benData_(atual.data_inicio), fim = campos.data_fim || benData_(atual.data_fim);
  if (ini > fim) throw new Error('O fim do período vem antes do início.');
  if (atual) benAtualizarComAuditoria_(u, 'BEN_RECESSOS', atual, campos);
  else {
    campos.criado_em = new Date(); campos.criado_por = u.id_usuario;
    const novo = inserir_('BEN_RECESSOS', campos);
    registrarAuditoria_(u.id_usuario, 'BEN_RECESSOS', novo.id_recesso, 'cadastro', null, { descricao: novo.descricao, de: benIso_(ini), ate: benIso_(fim) });
  }
  return benOpcoes_(u);
}

function benExcluirRecesso_(u, d) {
  benExigir_(u, 'presenca', 'editar');
  const r = buscar_('BEN_RECESSOS', 'id_recesso', d.id_recesso);
  if (!r) throw new Error('Período não encontrado.');
  benProjetoPermitido_(u, r.id_projeto);
  guardarNaLixeira_(u, 'BEN_RECESSOS', [r], r.id_projeto);
  conferirLinhas_('BEN_RECESSOS'); aba_('BEN_RECESSOS').deleteRow(r._linha); invalidar_('BEN_RECESSOS');
  registrarAuditoria_(u.id_usuario, 'BEN_RECESSOS', r.id_recesso, 'exclusao', benLimpo_(r), null);
  return benOpcoes_(u);
}

function benSemBarra_(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60); }

// ───────────────────────── validação e utilitários ─────────────────────────

/** Mantém só os campos editáveis, converte tipos e confere obrigatórios e listas. */
function benValidar_(aba, d, u, edicao) {
  const out = {}, erros = [];
  const sensivel = benPode_(u, 'atendimentos', 'editar');
  BEN_SCHEMA[aba].campos.forEach(f => {
    if (f.t === 'sistema' || f.t === 'id') return;
    if (f.sensivel && !sensivel) return;                       // quem não edita atendimentos não grava dado sensível
    if (!(f.n in d)) {
      if (!edicao && f.padrao !== undefined) out[f.n] = f.padrao;
      if (!edicao && f.obrig) erros.push(f.r);
      return;
    }
    let v = d[f.n];
    if (typeof v === 'string') v = v.trim();
    if (f.t === 'data') { const dt = benData_(v); if (v && !dt) erros.push(f.r + ' (data inválida)'); v = dt || ''; }
    else if (f.t === 'bool') v = v === true || v === 'true' || v === 'on';
    else if (f.t === 'numero') { try { v = paraNumero_(v); } catch (e) { erros.push(f.r + ' (número inválido)'); v = ''; } }
    else if (f.t === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) erros.push(f.r + ' (e-mail inválido)');
    else if (f.t === 'lista' && v && (LISTAS[f.lista] || BEN_LISTAS[f.lista] || []).indexOf(v) === -1) erros.push(f.r + ' (opção "' + v + '" não existe)');
    if (f.obrig && (v === '' || v === null || v === undefined)) erros.push(f.r);
    out[f.n] = v === null || v === undefined ? '' : v;
  });
  if (erros.length) throw new Error('Confira: ' + erros.join(', ') + '.');
  return out;
}

/** Atualiza só o que mudou e grava o antes/depois na AUDITORIA. */
function benAtualizarComAuditoria_(u, aba, atual, campos) {
  const antes = {}, depois = {};
  Object.keys(campos).forEach(k => {
    const a = benNorm_(atual[k]), b = benNorm_(campos[k]);
    if (a !== b) { antes[k] = a; depois[k] = b; }
  });
  if (!Object.keys(depois).length) return atual;
  const grava = {}; Object.keys(depois).forEach(k => { grava[k] = campos[k]; });
  grava.atualizado_em = new Date(); grava.atualizado_por = u.id_usuario;
  atualizar_(aba, atual._linha, grava);
  registrarAuditoria_(u.id_usuario, aba, atual[BEN_SCHEMA[aba].campos[0].n], 'edicao', antes, depois);
  return Object.assign(atual, grava);
}

function benNorm_(v) {
  if (v instanceof Date) return v.getFullYear() < 1901 ? String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0') : benIso_(v);
  return v === undefined || v === null ? '' : String(v);
}
function benHoje_() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function benData_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).trim(); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s))) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}
function benIso_(v) {
  const d = benData_(v);
  return d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';
}
function benBr_(v) { const s = benIso_(v); return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
function benIdade_(nasc, em) {
  const n = benData_(nasc), r = benData_(em) || benHoje_();
  if (!n) return '';
  let i = r.getFullYear() - n.getFullYear();
  if (r.getMonth() < n.getMonth() || (r.getMonth() === n.getMonth() && r.getDate() < n.getDate())) i--;
  return i;
}
/** limpar_ do núcleo + horas (oficina) em HH:mm. */
function benLimpo_(o) {
  const r = limpar_(o);
  Object.keys(o).forEach(k => {
    const v = o[k];
    if (v instanceof Date && v.getFullYear() < 1901) r[k] = String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
  });
  return r;
}
function benDigitos_(s) { return String(s || '').replace(/\D/g, ''); }
function benSemAcento_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
