/**
 * Instituicoes.gs – cadastro completo das instituições
 * (dados, representante legal, contador e testemunhas dos contratos)
 *
 * Quem vê: equipe global vê todas; usuário de instituição vê só a sua.
 * Quem edita: ADMIN e PRESTACAO_CONTAS (ou usuário com permissão "Instituições: editar", só nas instituições dele).
 *
 * v2: vigência do presidente, importação do formulário de Cadastro Institucional
 *     e documentos da instituição (salvos na MESMA pasta que o formulário criou).
 */

const PERFIS_CADASTRO_INST = ['ADMIN', 'PRESTACAO_CONTAS'];

const CAMPOS_INSTITUICAO = [
  'sigla', 'razao_social', 'nome_fantasia', 'cnpj', 'email_contato', 'telefone', 'data_inscricao',
  'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'foro_cidade_uf',
  'representante_nome', 'representante_genero', 'representante_cpf', 'representante_rg', 'representante_cargo',
  'representante_profissao', 'representante_nacionalidade', 'representante_estado_civil',
  'representante_endereco', 'representante_email', 'representante_telefone',
  'representante_vigencia_de', 'representante_vigencia_ate',
  'contador_nome', 'contador_cpf', 'contador_rg', 'contador_profissao', 'contador_crc',
  'contador_email', 'contador_telefone', 'contador_endereco',
  'testemunha1_nome', 'testemunha1_cpf', 'testemunha2_nome', 'testemunha2_cpf'
];
const CAMPOS_INST_DATA = ['data_inscricao', 'representante_vigencia_de', 'representante_vigencia_ate'];
const CAMPOS_INST_TEXTO = ['cnpj', 'telefone', 'numero', 'cep', 'representante_cpf', 'representante_rg',
  'representante_telefone', 'contador_cpf', 'contador_rg', 'contador_telefone',
  'testemunha1_cpf', 'testemunha2_cpf'];

// ---------------------------------------------------------------------------
// Formulário de Cadastro Institucional (planilha de respostas)

// Planilha "Formulário Adesão de Instituição" (respostas do formulário de Cadastro Institucional).
// Para usar outra, cadastre o ID na aba CONFIG com a chave planilha_cadastro_inst_id.
const FORM_INST_PLANILHA_PADRAO = '155cW15SHgSzLmGQVnBwP75MF7Ge9Kq1eUJQb7bX3K9E';
const FORM_INST_ABA = 'Cadastros';
const FORM_INST_PASTA_RAIZ = 'Cadastro de Instituições';

/**
 * Os 9 documentos. [campo, nome usado no arquivo, nome exibido, nomes antigos do arquivo]
 * O nome do arquivo é o MESMO que o formulário usa ("<nome> - <SIGLA>.pdf"),
 * então o sistema reconhece os arquivos enviados pelo formulário e vice-versa.
 */
const DOCS_INST = [
  ['estatuto', 'Estatuto Social atualizado', 'Estatuto Social atualizado'],
  ['ata_eleicao', 'Ata de eleição e posse da diretoria atual', 'Ata de eleição e posse da diretoria atual'],
  ['relacao_diretoria', 'Relação dos membros da diretoria atual', 'Relação dos membros da diretoria atual'],
  ['end_instituicao', 'Comprovante de endereço da instituição', 'Comprovante de endereço da instituição'],
  ['rg_presidente', 'RG ou CNH do presidente', 'Documento de identificação (RG) ou (CNH) do presidente', ['RG do presidente']],
  ['end_presidente', 'Comprovante de endereço do presidente', 'Comprovante de endereço do presidente'],
  ['crc_contador', 'Comprovante de registro no CRC do contador', 'Comprovante de registro no CRC do contador responsável'],
  ['end_contador', 'Comprovante de endereço do contador', 'Comprovante de endereço do contador'],
  ['rg_contador', 'RG ou CNH do contador', 'Documento de identificação (RG) ou (CNH) do contador', ['RG do contador']]
];

// ---------------------------------------------------------------------------

function listarInstituicoesCompleto_(u) {
  const projetos = ler_('PROJETOS');
  return ler_('INSTITUICOES')
    .filter(i => podeVerInstituicao_(u, i.id_instituicao))
    .map(i => {
      const o = limpar_(i);
      o.projetos = projetos.filter(p => p.id_instituicao === i.id_instituicao)
        .map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto,
                     termo_fomento_cit: p.termo_fomento_cit, status: p.status }));
      return o;
    });
}

/**
 * idInst: instituição que vai ser alterada ('' = cadastrar uma nova; null = só conferir a permissão).
 * Usuário com permissões por funcionalidade: precisa de "Instituições: editar" (conferido na Api.gs),
 * só mexe nas instituições a que tem acesso e só cadastra nova se tiver acesso a todas.
 */
function exigirCadastroInst_(u, idInst) {
  if (ehPersonalizado_(u)) {
    if (nivel_(u, 'instituicoes') !== 'editar') throw new Error('Você não tem permissão para editar instituições.');
    if (idInst === null || idInst === undefined) return;
    if (idInst ? !podeVerInstituicao_(u, idInst) : !podeVerTudo_(u)) {
      throw new Error(idInst ? 'Você não tem acesso a esta instituição.' : 'Só quem tem acesso a todas as instituições pode cadastrar uma nova.');
    }
    return;
  }
  exigirPerfil_(u, PERFIS_CADASTRO_INST);
  if (!podeVerTudo_(u)) throw new Error('Seu perfil não permite editar instituições.');
}

function salvarInstituicao_(u, d) {
  exigirCadastroInst_(u, d.id_instituicao || '');

  const campos = {};
  CAMPOS_INSTITUICAO.forEach(c => {
    if (d[c] === undefined) return;
    if (CAMPOS_INST_DATA.indexOf(c) > -1) campos[c] = paraData_(d[c]);
    else campos[c] = CAMPOS_INST_TEXTO.indexOf(c) > -1 ? texto_(d[c]) : String(d[c]).trim();
  });
  if (campos.uf) campos.uf = campos.uf.toUpperCase();

  if (!campos.razao_social) throw new Error('Informe a razão social.');
  if (!campos.sigla) throw new Error('Informe a sigla.');
  if (soDigitos_(campos.cnpj).length !== 14) throw new Error('CNPJ inválido.');
  if (campos.representante_vigencia_de && campos.representante_vigencia_ate &&
      campos.representante_vigencia_ate < campos.representante_vigencia_de) {
    throw new Error('A vigência do presidente termina antes de começar. Confira as datas.');
  }

  // Importado do formulário: liga a instituição à pasta de documentos que o formulário criou
  if (d.pasta_documentos_id) {
    try {
      const p = DriveApp.getFolderById(String(d.pasta_documentos_id));
      if (!p.isTrashed()) campos.pasta_documentos_id = p.getId();
    } catch (e) { /* sem acesso à pasta: segue sem ligar */ }
  }

  const outra = ler_('INSTITUICOES').find(i => soDigitos_(i.cnpj) === soDigitos_(campos.cnpj) &&
    i.id_instituicao !== d.id_instituicao);
  if (outra) throw new Error('Já existe instituição com este CNPJ (' + outra.id_instituicao + ').');

  let id = d.id_instituicao;
  if (id) {
    const atual = buscar_('INSTITUICOES', 'id_instituicao', id);
    if (!atual) throw new Error('Instituição não encontrada.');
    atualizar_('INSTITUICOES', atual._linha, campos);
    registrarAuditoria_(u.id_usuario, 'INSTITUICOES', id, 'edicao', limpar_(atual), campos);
  } else {
    campos.ativo = true;
    campos.criado_em = new Date();
    campos.criado_por = u.id_usuario;
    id = inserir_('INSTITUICOES', campos).id_instituicao;
    registrarAuditoria_(u.id_usuario, 'INSTITUICOES', id, 'criacao', null, campos);
  }
  return listarInstituicoesCompleto_(u);
}

// ---------------------------------------------------------------------------
// Leitura da planilha do formulário

let FORM_INST_MEMO_ = null;

function planilhaFormInst_() {
  const id = String(config_('planilha_cadastro_inst_id') || FORM_INST_PLANILHA_PADRAO).trim();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('O sistema não conseguiu abrir a planilha do formulário de Cadastro Institucional. ' +
      'Compartilhe a planilha (como Editor) com a conta do sistema: ' + Session.getEffectiveUser().getEmail() + '.');
  }
}

/** Linhas da aba "Cadastros", já com o link da pasta de documentos. Lida uma vez por chamada. */
function linhasFormInst_() {
  if (FORM_INST_MEMO_) return FORM_INST_MEMO_;
  const sh = abaFormInst_(planilhaFormInst_());
  if (sh.getLastRow() < 2) return (FORM_INST_MEMO_ = []);
  const rg = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn());
  const vals = rg.getDisplayValues();
  const cab = vals.shift().map(String);
  const colPasta = cab.indexOf('Pasta dos documentos');
  const links = colPasta > -1
    ? sh.getRange(2, colPasta + 1, vals.length, 1).getRichTextValues().map(r => r[0] ? (r[0].getLinkUrl() || '') : '')
    : [];
  FORM_INST_MEMO_ = vals.map((l, i) => {
    const o = { _linha: i + 2 };
    // Célula com erro (ex.: #ERROR! num telefone) conta como vazia: não vai para o cadastro
    cab.forEach((c, j) => { if (c) { const v = String(l[j] || '').trim(); o[c] = /^#[A-Z\/0!?]+[!?A]?$/.test(v) ? '' : v; } });
    o._pasta_id = idPastaDeUrl_(links[i] || o['Pasta dos documentos'] || '');
    return o;
  }).filter(o => o['CNPJ'] || o['Instituição']);
  return FORM_INST_MEMO_;
}

/**
 * Aba das respostas: "Cadastros" ou, se tiver outro nome, a aba cujo cabeçalho
 * tem as colunas do formulário (CNPJ, Sigla, Instituição / Pasta dos documentos).
 */
function abaFormInst_(ss) {
  const pelaNome = ss.getSheetByName(FORM_INST_ABA);
  if (pelaNome) return pelaNome;
  const abas = ss.getSheets();
  const achada = abas.find(sh => {
    if (sh.getLastColumn() < 1) return false;
    const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(c => String(c).trim());
    return cab.indexOf('CNPJ') > -1 && cab.indexOf('Sigla') > -1 &&
      (cab.indexOf('Pasta dos documentos') > -1 || cab.indexOf('Instituição') > -1);
  });
  if (achada) return achada;
  throw new Error('Não encontrei as respostas do formulário na planilha "' + ss.getName() + '". Abas que existem nela: ' +
    abas.map(sh => '"' + sh.getName() + '"').join(', ') + '. Confira se o link da planilha é o da planilha de respostas do ' +
    'Cadastro Institucional (a que tem as colunas Instituição, Sigla, CNPJ…).');
}

function idPastaDeUrl_(url) {
  const m = String(url || '').match(/folders\/([-\w]{10,})/) || String(url || '').match(/[?&]id=([-\w]{10,})/);
  return m ? m[1] : '';
}

/** dd/mm/aaaa → aaaa-mm-dd (formato do campo de data) */
function isoDeBr_(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

/** Converte um envio do formulário nos campos do cadastro do sistema. */
function camposDoEnvio_(o) {
  const v = function () {
    for (let k = 0; k < arguments.length; k++) if (o[arguments[k]]) return o[arguments[k]];
    return '';
  };
  const end = p => enderecoCompleto_({ endereco: v(p + ' - Rua'), numero: v(p + ' - Nº'), complemento: v(p + ' - Complemento'),
    bairro: v(p + ' - Bairro'), cidade: v(p + ' - Cidade'), uf: v(p + ' - UF'), cep: v(p + ' - CEP') });
  return {
    razao_social: v('Instituição'), sigla: v('Sigla'), cnpj: v('CNPJ'),
    email_contato: v('E-mail institucional'), telefone: v('Telefone institucional'),
    endereco: v('Instituição - Rua'), numero: v('Instituição - Nº'), complemento: v('Instituição - Complemento'),
    bairro: v('Instituição - Bairro'), cidade: v('Instituição - Cidade'), uf: v('Instituição - UF'), cep: v('Instituição - CEP'),
    representante_nome: v('Representante - Nome'), representante_cpf: v('Representante - CPF'),
    representante_rg: v('Representante - RG ou CNH', 'Representante - RG'),
    representante_profissao: v('Representante - Profissão'), representante_email: v('Representante - E-mail'),
    representante_telefone: v('Representante - Telefone'), representante_endereco: end('Representante'),
    representante_vigencia_de: isoDeBr_(v('Vigência do Presidente - De')),
    representante_vigencia_ate: isoDeBr_(v('Vigência do Presidente - Até')),
    contador_nome: v('Contador - Nome'), contador_cpf: v('Contador - CPF'),
    contador_rg: v('Contador - RG ou CNH', 'Contador - RG'), contador_profissao: v('Contador - Profissão'),
    contador_crc: v('Contador - CRC'), contador_email: v('Contador - E-mail'), contador_telefone: v('Contador - Telefone'),
    contador_endereco: end('Contador')
  };
}

/** Envios do formulário, do mais recente para o mais antigo (para "Importar do formulário"). */
function listarEnviosFormInst_(u) {
  exigirCadastroInst_(u);
  const cadastradas = {};
  ler_('INSTITUICOES').forEach(i => { cadastradas[soDigitos_(i.cnpj)] = i.id_instituicao; });
  return linhasFormInst_().map(o => {
    const campos = camposDoEnvio_(o);
    return {
      linha: o._linha,
      enviado_em: o['Data/Hora do envio'] || '',
      sigla: campos.sigla, razao_social: campos.razao_social, cnpj: campos.cnpj,
      ja_cadastrada: cadastradas[soDigitos_(campos.cnpj)] || '',
      pasta_id: o._pasta_id,
      campos: campos
    };
  }).reverse();
}

// ---------------------------------------------------------------------------
// Pasta e documentos da instituição

function limparNomeInst_(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function pastaAtiva_(id) {
  if (!id) return null;
  try { const p = DriveApp.getFolderById(String(id)); return p.isTrashed() ? null : p; } catch (e) { return null; }
}

/** Pasta "Cadastro de Instituições" (a mesma do formulário). Com criar = false, não cria nada. */
function pastaRaizCadastroInst_(criar) {
  let p = pastaAtiva_(config_('pasta_cadastro_inst_id'));
  if (p) return p;
  // 1) a pasta-mãe das pastas criadas pelo formulário
  try {
    const comPasta = linhasFormInst_().find(o => pastaAtiva_(o._pasta_id));
    if (comPasta) {
      const pais = DriveApp.getFolderById(comPasta._pasta_id).getParents();
      if (pais.hasNext()) p = pais.next();
    }
  } catch (e) {}
  // 2) pelo nome; 3) cria
  if (!p) {
    const it = DriveApp.getFoldersByName(FORM_INST_PASTA_RAIZ);
    while (it.hasNext() && !p) { const x = it.next(); if (!x.isTrashed()) p = x; }
  }
  if (!p && !criar) return null;
  if (!p) p = DriveApp.createFolder(FORM_INST_PASTA_RAIZ);
  definirConfig_('pasta_cadastro_inst_id', p.getId(), 'Pasta "Cadastro de Instituições" (documentos do formulário e do cadastro)');
  return p;
}

/**
 * Pasta de documentos da instituição. Ordem de procura (para nunca duplicar pasta):
 *  1. a que já está ligada ao cadastro;
 *  2. a pasta do envio mais recente do formulário com o mesmo CNPJ;
 *  3. uma pasta "SIGLA - Razão social" já existente em Cadastro de Instituições;
 *  4. (só se criar = true) cria essa pasta.
 * A pasta encontrada fica ligada ao cadastro (coluna pasta_documentos_id).
 */
function pastaDocsInst_(inst, criar) {
  let p = pastaAtiva_(inst.pasta_documentos_id);
  if (p) return p;
  try {
    const doc = soDigitos_(inst.cnpj);
    const envios = linhasFormInst_().filter(o => soDigitos_(o['CNPJ']) === doc && o._pasta_id);
    for (let k = envios.length - 1; k >= 0 && !p; k--) p = pastaAtiva_(envios[k]._pasta_id);
  } catch (e) {}
  const nome = limparNomeInst_((inst.sigla || '') + ' - ' + (inst.razao_social || '')) || inst.id_instituicao;
  const raiz = p ? null : pastaRaizCadastroInst_(criar);
  if (raiz) {
    const it = raiz.getFoldersByName(nome);
    while (it.hasNext() && !p) { const x = it.next(); if (!x.isTrashed()) p = x; }
    if (!p && criar) p = raiz.createFolder(nome);
  }
  if (p) atualizar_('INSTITUICOES', inst._linha, { pasta_documentos_id: p.getId() });
  return p;
}

function prefixosDoc_(def) {
  return [def[1]].concat(def[3] || []).map(n => n + ' - ');
}

/** Documentos encontrados na pasta (pelo nome do arquivo). Se houver mais de um, vale o mais recente. */
function docsDaPasta_(pasta) {
  const res = {};
  if (!pasta) return res;
  const arquivos = [];
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed()) arquivos.push(f);
  }
  DOCS_INST.forEach(def => {
    const pref = prefixosDoc_(def);
    const achados = arquivos.filter(f => pref.some(p => f.getName().indexOf(p) === 0))
      .sort((a, b) => b.getLastUpdated().getTime() - a.getLastUpdated().getTime());
    if (achados.length) {
      const f = achados[0];
      res[def[0]] = { id: f.getId(), url: f.getUrl(), nome: f.getName(),
                      atualizado_em: Utilities.formatDate(f.getLastUpdated(), 'America/Sao_Paulo', 'dd/MM/yyyy') };
    }
  });
  return res;
}

function resumoDocsInst_(inst, pasta) {
  return {
    pasta_url: pasta ? pasta.getUrl() : '',
    docs: docsDaPasta_(pasta),
    lista: DOCS_INST.map(def => ({ campo: def[0], titulo: def[2] }))
  };
}

/** Documentos de todas as instituições visíveis (carregado depois da lista, para a tela abrir rápido). */
function listarDocsInstituicoes_(u) {
  const res = {};
  ler_('INSTITUICOES')
    .filter(i => podeVerInstituicao_(u, i.id_instituicao))
    .forEach(i => {
      try { res[i.id_instituicao] = resumoDocsInst_(i, pastaDocsInst_(i, false)); }
      catch (e) { res[i.id_instituicao] = { erro: e.message, docs: {}, lista: DOCS_INST.map(def => ({ campo: def[0], titulo: def[2] })) }; }
    });
  return res;
}

/** Envia ou substitui um dos 9 documentos, na pasta da instituição (a mesma do formulário). */
function enviarDocInstituicao_(u, d) {
  exigirCadastroInst_(u, d.id_instituicao || '-');
  const inst = buscar_('INSTITUICOES', 'id_instituicao', d.id_instituicao);
  if (!inst) throw new Error('Instituição não encontrada.');
  const def = DOCS_INST.find(x => x[0] === d.campo);
  if (!def) throw new Error('Documento inválido.');
  const a = d.arquivo;
  if (!a || !a.base64) throw new Error('Selecione o arquivo.');
  const bytes = Utilities.base64Decode(a.base64);
  if (bytes.length > LIMITE_ARQUIVO_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_ARQUIVO_MB + ' MB.');

  const pasta = pastaDocsInst_(inst, true);

  // Substituição: o arquivo anterior vai para a lixeira do Drive (dá para recuperar por 30 dias)
  const pref = prefixosDoc_(def), substituidos = [];
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!f.isTrashed() && pref.some(p => f.getName().indexOf(p) === 0)) { substituidos.push(f.getName()); f.setTrashed(true); }
  }

  const nomeOrig = String(a.nome || '');
  const ext = nomeOrig.indexOf('.') > -1 ? '.' + nomeOrig.split('.').pop().toLowerCase() : '';
  const nome = def[1] + ' - ' + (limparNomeInst_(inst.sigla) || inst.id_instituicao) + ext;
  const novo = pasta.createFile(Utilities.newBlob(bytes, a.mime || 'application/octet-stream', nome));

  registrarAuditoria_(u.id_usuario, 'INSTITUICOES', inst.id_instituicao, substituidos.length ? 'substituir_documento' : 'enviar_documento',
    substituidos.length ? { arquivos: substituidos } : null, { documento: def[2], arquivo: nome, drive_file_id: novo.getId() });
  return resumoDocsInst_(inst, pasta);
}
