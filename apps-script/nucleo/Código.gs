/**
 * GESTOR DE PROJETOS – PRESTAÇÃO DE CONTAS (SIT / TCE-PR)
 * Etapa 1: estrutura da planilha (abas, colunas, IDs, listas e validações)
 *
 * Como usar:
 * 1. Crie uma planilha nova no Google Sheets (na conta Google integrada do piloto).
 * 2. Extensões > Apps Script > cole este arquivo como Setup.gs.
 * 3. Rode a função setupSistema() uma vez e autorize.
 *    - Cria todas as abas com cabeçalho, congela a 1ª linha e aplica validações.
 *    - Cria a pasta raiz no Drive e grava o ID dela na aba CONFIG.
 * 4. Pode rodar de novo sem medo: abas que já existem não são apagadas,
 *    só ganham as colunas que estiverem faltando.
 *
 * Regras de modelagem:
 * - Todo registro tem um ID próprio (ex.: PRJ-0001). Nunca usamos nome como chave.
 * - Todo registro "filho" carrega o id_projeto -> é isso que permite filtrar
 *   por instituição no login.
 * - Valores originais do extrato nunca são editados (ver aba EXTRATO).
 */

const ESTRUTURA = {
  CONFIG: ['chave', 'valor', 'descricao'],

  LISTAS: [
    'perfil', 'tipo_despesa', 'tipo_documento_fiscal', 'forma_pagamento',
    'status_parcela', 'status_contratacao', 'status_projeto', 'status_bimestre',
    'tipo_pessoa', 'categoria_extrato', 'tipo_documento_anexo'
  ],

  // Dados da CONTRATANTE: preenchidos uma vez e puxados automaticamente nos contratos
  INSTITUICOES: [
    'id_instituicao', 'sigla', 'razao_social', 'nome_fantasia', 'cnpj',
    'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep',
    'email_contato', 'telefone',
    'representante_nome', 'representante_cpf', 'representante_rg',
    'representante_cargo', 'representante_nacionalidade', 'representante_estado_civil',
    'foro_cidade_uf',
    'pasta_drive_id', 'ativo', 'criado_em', 'criado_por',
    // v2: dados completos (mesmo formato do gestor de tarefas) + testemunhas dos contratos
    'data_inscricao', 'representante_profissao', 'representante_endereco',
    'representante_email', 'representante_telefone',
    'contador_nome', 'contador_cpf', 'contador_rg', 'contador_profissao', 'contador_crc',
    'contador_email', 'contador_telefone', 'contador_endereco',
    'testemunha1_nome', 'testemunha1_cpf', 'testemunha2_nome', 'testemunha2_cpf',
    'representante_genero'
  ],

  USUARIOS: [
    'id_usuario', 'nome', 'email', 'perfil', 'id_instituicao',
    'senha_hash', 'salt', 'deve_trocar_senha', 'whatsapp', 'callmebot_apikey',
    'ativo', 'ultimo_acesso', 'criado_em'
  ],

  PROJETOS: [
    'id_projeto', 'id_instituicao', 'sigla', 'nome_projeto',
    'num_edital', 'data_publicacao_edital', 'num_proposta',
    'termo_fomento_cit', 'data_celebracao', 'inicio_vigencia', 'fim_vigencia',
    'data_recebimento_recurso', 'valor_total',
    'banco', 'agencia', 'conta_corrente',
    'status', 'pasta_drive_id', 'observacoes', 'criado_em', 'criado_por',
    'inicio_bimestres'
  ],

  RUBRICAS: [
    'id_rubrica', 'id_projeto', 'codigo', 'descricao', 'tipo_despesa',
    'classificacao_contabil', 'unidade', 'quantidade', 'valor_unitario_max',
    'meses', 'valor_total_orcado', 'observacoes'
  ],

  // Dados do CONTRATADO: a única parte digitada na hora do contrato
  FORNECEDORES: [
    'id_fornecedor', 'tipo_pessoa', 'razao_social', 'nome_fantasia', 'cnpj_cpf',
    'rg', 'nacionalidade', 'estado_civil', 'profissao',
    'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep',
    'email', 'telefone',
    'representante_nome', 'representante_cpf', 'representante_cargo',
    'chave_pix', 'banco', 'agencia', 'conta',
    'criado_em', 'representante_genero'
  ],

  CONTRATACOES: [
    'id_contratacao', 'id_projeto', 'id_rubrica', 'id_fornecedor', 'objeto',
    'tipo_despesa', 'data_cotacao', 'data_assinatura_contrato',
    'inicio_execucao', 'fim_execucao', 'num_parcelas', 'valor_parcela',
    'valor_total_contratado', 'status', 'id_doc_contrato', 'pasta_drive_id',
    'observacoes', 'criado_em', 'criado_por',
    'carga_horaria_mensal'
  ],

  // Processo de cotação: agrupa as 3 cotações de uma mesma função/rubrica
  PROCESSOS_COTACAO: [
    'id_processo', 'id_projeto', 'id_rubrica', 'funcao', 'horas_mensais', 'dias_mes', 'meses',
    'descricao_atividades', 'data_cotacao', 'status', 'id_contratacao', 'pasta_drive_id',
    'criado_em', 'criado_por'
  ],

  COTACOES: [
    'id_cotacao', 'id_contratacao', 'id_projeto', 'razao_social', 'cnpj',
    'valor', 'data_cotacao', 'vencedora', 'id_documento',
    // v3: dados do responsável pelo orçamento e valores (processo de cotação)
    'id_processo', 'id_rubrica', 'resp_nome', 'resp_cpf', 'resp_endereco', 'resp_telefone', 'resp_email',
    'valor_hora', 'valor_unitario_mensal', 'status', 'id_documento_assinado'
  ],

  PARCELAS: [
    'id_parcela', 'id_contratacao', 'id_projeto', 'num_parcela', 'competencia',
    'valor_previsto', 'primeiro_pagamento', 'status',
    'nf_solicitada_em', 'nf_solicitada_por',
    'liberada_em', 'liberada_por', 'id_bimestre', 'observacoes'
  ],

  NOTAS_FISCAIS: [
    'id_nf', 'id_parcela', 'id_projeto', 'tipo_documento', 'numero',
    'data_emissao', 'valor', 'descricao', 'cnpj_emitente', 'razao_social_emitente',
    'id_documento', 'conferida', 'conferida_por', 'conferida_em',
    'divergencias', 'enviada_em', 'enviada_por'
  ],

  PAGAMENTOS: [
    'id_pagamento', 'id_parcela', 'id_projeto', 'forma_pagamento',
    'num_identificacao_pix', 'data_pagamento', 'data_debito_conta', 'valor',
    'id_documento_comprovante', 'id_lancamento_extrato', 'conciliado',
    'pago_por', 'registrado_em'
  ],

  IMPORTACOES_EXTRATO: [
    'id_importacao', 'id_projeto', 'nome_arquivo', 'id_documento',
    'periodo_inicio', 'periodo_fim', 'saldo_inicial', 'saldo_final',
    'qtd_lancamentos', 'importado_em', 'importado_por'
  ],

  EXTRATO: [
    'id_lancamento', 'id_projeto', 'id_importacao', 'data', 'historico',
    'documento', 'valor', 'natureza', 'saldo',
    // daqui para baixo: colunas de CONFERÊNCIA (editáveis). Acima: imutáveis.
    'categoria', 'id_pagamento', 'conciliado', 'observacao_conferencia',
    'conferido_por', 'conferido_em'
  ],

  BIMESTRES: [
    'id_bimestre', 'id_projeto', 'numero', 'periodo_inicio', 'periodo_fim',
    'prazo_envio', 'rendimentos', 'saldo_final', 'total_despesas',
    'status', 'enviado_cit_em', 'enviado_por', 'observacoes',
    'saldo_inicial', 'protocolo_sit', 'creditos'
  ],

  // Movimento financeiro mês a mês da conta do projeto (base da prestação no SIT)
  MOVIMENTO_MENSAL: [
    'id_mov', 'id_projeto', 'mes', 'id_bimestre', 'saldo_inicial', 'outros_creditos',
    'rendimentos', 'despesas', 'saldo_final', 'atualizado_em', 'atualizado_por'
  ],

  // Cópia de tudo o que foi excluído pelo sistema (para conferência/recuperação)
  LIXEIRA: ['id_lixo', 'aba', 'id_registro', 'id_projeto', 'dados_json', 'excluido_em', 'excluido_por'],

  ITENS_COMPRA: [
    'id_item', 'id_contratacao', 'id_projeto', 'ordem', 'descricao', 'unidade',
    'quantidade', 'valor_unitario', 'valor_total'
  ],

  DOCUMENTOS: [
    'id_documento', 'id_projeto', 'id_contratacao', 'tipo', 'nome_arquivo',
    'drive_file_id', 'url', 'mime_type', 'enviado_por', 'enviado_em', 'nome_original'
  ],

  // id_instituicao vazio = modelo serve para todas as instituições
  MODELOS_CONTRATO: [
    'id_modelo', 'nome', 'tipo_despesa', 'tipo_pessoa_contratado', 'id_instituicao',
    'google_doc_id', 'ativo', 'atualizado_em', 'atualizado_por',
    'tipo_modelo'   // vazio ou "Contrato" = modelo de contrato; "Cotação" = modelo de cotação
  ],

  AUDITORIA: [
    'id_log', 'data_hora', 'id_usuario', 'entidade', 'id_entidade',
    'acao', 'valor_anterior', 'valor_novo'
  ]
};

/** Valores das listas (coluna = nome da lista na aba LISTAS). */
const LISTAS = {
  perfil: ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO', 'INSTITUICAO_CONTRATACAO', 'INSTITUICAO_PAGAMENTO'],
  tipo_despesa: ['Prestação de serviço', 'Compra de bens', 'Ativo imobilizado'],
  tipo_documento_fiscal: ['Nota fiscal', 'Guia', 'Recibo', 'Outro'],
  forma_pagamento: ['PIX', 'Transferência'],
  status_parcela: [
    'Prevista', 'NF solicitada', 'NF recebida', 'NF conferida',
    'Liberada para pagamento', 'Paga', 'Conciliada', 'Conferida', 'Lançada no SIT'
  ],
  status_contratacao: ['Em cotação', 'Contrato em elaboração', 'Contrato assinado', 'Em execução', 'Encerrada', 'Cancelada'],
  status_projeto: ['Em implantação', 'Em execução', 'Encerrado', 'Suspenso'],
  status_bimestre: ['Aberto', 'Em conferência', 'Pronto para envio', 'Enviado ao SIT'],
  tipo_pessoa: ['Pessoa jurídica', 'Pessoa física'],
  categoria_extrato: ['Pagamento de despesa', 'Rendimento', 'Crédito do repasse', 'Tarifa bancária', 'Estorno', 'Devolução', 'Outro'],
  tipo_documento_anexo: [
    'Contrato', 'Minuta de contrato', 'Cotação', 'Nota fiscal', 'Comprovante de pagamento',
    'Extrato bancário', 'PDF unificado SIT', 'Termo de fomento', 'Plano de trabalho', 'Outro'
  ]
};

/** Validações: aba -> { coluna: lista } */
const VALIDACOES = {
  USUARIOS: { perfil: 'perfil' },
  PROJETOS: { status: 'status_projeto' },
  RUBRICAS: { tipo_despesa: 'tipo_despesa' },
  CONTRATACOES: { tipo_despesa: 'tipo_despesa', status: 'status_contratacao' },
  PARCELAS: { status: 'status_parcela' },
  NOTAS_FISCAIS: { tipo_documento: 'tipo_documento_fiscal' },
  PAGAMENTOS: { forma_pagamento: 'forma_pagamento' },
  EXTRATO: { categoria: 'categoria_extrato' },
  BIMESTRES: { status: 'status_bimestre' },
  DOCUMENTOS: { tipo: 'tipo_documento_anexo' },
  FORNECEDORES: { tipo_pessoa: 'tipo_pessoa' },
  MODELOS_CONTRATO: { tipo_despesa: 'tipo_despesa', tipo_pessoa_contratado: 'tipo_pessoa' }
};

/** Prefixo de ID por aba. */
const PREFIXOS = {
  INSTITUICOES: 'INS', USUARIOS: 'USR', PROJETOS: 'PRJ', RUBRICAS: 'RUB',
  FORNECEDORES: 'FOR', CONTRATACOES: 'CTR', COTACOES: 'COT', PROCESSOS_COTACAO: 'PCO', PARCELAS: 'PAR',
  NOTAS_FISCAIS: 'NF', PAGAMENTOS: 'PAG', IMPORTACOES_EXTRATO: 'IMP',
  EXTRATO: 'EXT', BIMESTRES: 'BIM', DOCUMENTOS: 'DOC', MODELOS_CONTRATO: 'MOD',
  AUDITORIA: 'LOG', ITENS_COMPRA: 'ITM', MOVIMENTO_MENSAL: 'MOV'
};

const CONFIG_INICIAL = [
  ['nome_sistema', 'Gestor de Projetos – Prestação de Contas', 'Nome exibido no sistema'],
  ['pasta_raiz_drive_id', '', 'Preenchido automaticamente pelo setup'],
  ['pasta_modelos_drive_id', '', 'Pasta dos modelos de contrato (Google Docs)'],
  ['meses_por_bimestre', '2', 'Periodicidade da prestação de contas'],
  ['dias_prazo_bimestre', '', 'Dias após o fim do bimestre para envio ao SIT (preencher conforme edital)'],
  ['versao_estrutura', '1', 'Controle de versão do modelo de dados']
];

// ---------------------------------------------------------------------------

function setupSistema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  registrarModulos_();   // abas, listas e validações dos módulos instalados (Modulos.gs)

  Object.keys(ESTRUTURA).forEach(nome => criarOuAtualizarAba_(ss, nome, ESTRUTURA[nome]));
  preencherListas_(ss);
  preencherConfig_(ss);
  aplicarValidacoes_(ss);
  criarPastaRaiz_(ss);

  const padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && padrao.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(padrao);

  SpreadsheetApp.getUi().alert('Estrutura criada/atualizada com sucesso.');
}

function criarOuAtualizarAba_(ss, nome, colunas) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);

  const ultimaCol = sh.getLastColumn();
  const existentes = ultimaCol > 0
    ? sh.getRange(1, 1, 1, ultimaCol).getValues()[0].filter(String)
    : [];
  const faltando = colunas.filter(c => existentes.indexOf(c) === -1);

  if (existentes.length === 0) {
    sh.getRange(1, 1, 1, colunas.length).setValues([colunas]); invalidar_();
  } else if (faltando.length) {
    sh.getRange(1, existentes.length + 1, 1, faltando.length).setValues([faltando]); invalidar_();
  }

  const total = sh.getLastColumn();
  sh.getRange(1, 1, 1, total)
    .setFontWeight('bold')
    .setBackground('#1f3b57')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, total);
}

function preencherListas_(ss) {
  const sh = ss.getSheetByName('LISTAS');
  const nomes = ESTRUTURA.LISTAS;
  const maxLen = Math.max.apply(null, nomes.map(n => LISTAS[n].length));
  const linhas = [];
  for (let i = 0; i < maxLen; i++) {
    linhas.push(nomes.map(n => LISTAS[n][i] || ''));
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, nomes.length).clearContent();
  sh.getRange(2, 1, linhas.length, nomes.length).setValues(linhas); invalidar_();
}

function preencherConfig_(ss) {
  const sh = ss.getSheetByName('CONFIG');
  const atuais = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0])
    : [];
  const novas = CONFIG_INICIAL.filter(l => atuais.indexOf(l[0]) === -1);
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, 3).setValues(novas); invalidar_();
}

function aplicarValidacoes_(ss) {
  const listas = ss.getSheetByName('LISTAS');
  Object.keys(VALIDACOES).forEach(aba => {
    const sh = ss.getSheetByName(aba);
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    Object.keys(VALIDACOES[aba]).forEach(coluna => {
      const idxCol = cab.indexOf(coluna) + 1;
      const idxLista = ESTRUTURA.LISTAS.indexOf(VALIDACOES[aba][coluna]) + 1;
      if (!idxCol || !idxLista) return;
      const qtd = LISTAS[VALIDACOES[aba][coluna]].length;
      const regra = SpreadsheetApp.newDataValidation()
        .requireValueInRange(listas.getRange(2, idxLista, qtd, 1), true)
        .setAllowInvalid(true)   // só avisa; o sistema já valida antes de gravar
        .build();
      sh.getRange(2, idxCol, sh.getMaxRows() - 1, 1).setDataValidation(regra);
    });
  });
}

function criarPastaRaiz_(ss) {
  const sh = ss.getSheetByName('CONFIG');
  const dados = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const linhaRaiz = dados.findIndex(r => r[0] === 'pasta_raiz_drive_id');
  const linhaModelos = dados.findIndex(r => r[0] === 'pasta_modelos_drive_id');

  let raizId = dados[linhaRaiz][1];
  if (!raizId) {
    const raiz = DriveApp.createFolder('Gestor de Projetos – Prestação de Contas');
    raizId = raiz.getId();
    sh.getRange(linhaRaiz + 2, 2).setValue(raizId);
  }
  if (!dados[linhaModelos][1]) {
    const modelos = DriveApp.getFolderById(raizId).createFolder('_Modelos de contrato');
    sh.getRange(linhaModelos + 2, 2).setValue(modelos.getId());
  }
}

// ---------------------------------------------------------------------------
// Utilitário de ID (usado pelo backend nas próximas etapas)

/** Maior número de ID já usado na coluna A da aba (ex.: CTR-0006 → 6). */
function maiorIdNaAba_(aba) {
  // Usa a leitura já feita (memória/cache da aba) em vez de ler a coluna de novo
  const prefixo = PREFIXOS[aba] + '-';
  let regs;
  try { regs = ler_(aba); } catch (e) { return 0; }
  const col = MEMO_[aba] && MEMO_[aba].cab[0];
  if (!col) return 0;
  return regs.reduce((m, r) => {
    const v = String(r[col] || '');
    return v.indexOf(prefixo) === 0 ? Math.max(m, Number(v.slice(prefixo.length)) || 0) : m;
  }, 0);
}

const ULTIMO_ID_EXECUCAO_ = {};   // evita reler a planilha a cada ID dentro da mesma execução

/**
 * Próximo ID da aba. Usa o MAIOR entre o contador interno e o maior ID que já existe
 * na planilha — assim um ID digitado à mão ou uma cópia da planilha nunca gera repetição.
 */
function gerarId(aba) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const chave = 'seq_' + aba;
    let base = Number(props.getProperty(chave) || 0);
    if (ULTIMO_ID_EXECUCAO_[aba] === undefined) base = Math.max(base, maiorIdNaAba_(aba));
    else base = Math.max(base, ULTIMO_ID_EXECUCAO_[aba]);
    const prox = base + 1;
    props.setProperty(chave, String(prox));
    ULTIMO_ID_EXECUCAO_[aba] = prox;
    return PREFIXOS[aba] + '-' + String(prox).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}
