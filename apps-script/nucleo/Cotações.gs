/**
 * Cotacoes.gs – processo de cotação (até 3 cotações por função/rubrica)
 *
 * Cada cotação pode ser:
 *  - GERADA pelo sistema a partir do modelo (Google Doc com campos {{...}}), para o
 *    prestador só assinar; ou
 *  - ANEXADA pronta (feita à mão ou enviada pelo fornecedor).
 * Depois: anexa-se a versão assinada, marca-se a vencedora e cria-se a contratação
 * a partir dela (os dados do responsável viram os dados do contratado).
 */

const CAMPOS_COTACAO_DESC = [
  ['funcao', 'Função / descrição do serviço'],
  ['contratante_razao_social', 'Razão social da instituição'],
  ['contratante_cnpj', 'CNPJ da instituição'],
  ['contratante_endereco_completo', 'Endereço completo da instituição'],
  ['cidade', 'Cidade da instituição'],
  ['descricao_atividades', 'Descrição das atividades'],
  ['horas', 'Horas mensais (só o número)'],
  ['dias', 'Dias trabalhados no mês (só o número)'],
  ['meses', 'Quantidade de meses'],
  ['valor_hora', 'Valor da hora (R$)'],
  ['valor_unitario_mensal', 'Valor unitário mensal (R$)'],
  ['valor_total', 'Valor total para os meses (R$)'],
  ['resp_nome', 'Responsável pelo orçamento – nome completo'],
  ['resp_cpf', 'Responsável – CPF'],
  ['resp_razao_social', 'Responsável – razão social'],
  ['resp_cnpj', 'Responsável – CNPJ'],
  ['resp_endereco', 'Responsável – endereço completo'],
  ['resp_telefone', 'Responsável – telefone'],
  ['resp_email', 'Responsável – e-mail'],
  ['data_extenso', 'Data da cotação por extenso (ex.: 3 de outubro de 2026)'],
  ['projeto_nome', 'Nome do projeto'],
  ['termo_fomento', 'Termo de fomento'],
  ['orgao', 'Órgão do termo de fomento (ex.: SEDEF/PR)']
];

function arred2_(n) { return Math.round(Number(n || 0) * 100) / 100; }

// ---------------------------------------------------------------------------
// Leitura

function listarProcessosCotacao_(u, idProjeto) {
  const rub = {};
  ler_('RUBRICAS').forEach(r => { rub[r.id_rubrica] = r; });
  const docs = {};
  ler_('DOCUMENTOS').filter(d => d.id_projeto === idProjeto).forEach(d => { docs[d.id_documento] = d; });
  const cots = ler_('COTACOES').filter(c => c.id_projeto === idProjeto && c.id_processo);

  return ler_('PROCESSOS_COTACAO').filter(p => p.id_projeto === idProjeto).map(p => {
    const o = limpar_(p);
    o.rubrica_descricao = rub[p.id_rubrica] ? rub[p.id_rubrica].descricao : '';
    o.pasta_url = p.pasta_drive_id ? 'https://drive.google.com/drive/folders/' + p.pasta_drive_id : '';
    o.cotacoes = cots.filter(c => c.id_processo === p.id_processo).map(c => {
      const x = limpar_(c);
      const g = docs[c.id_documento], a = docs[c.id_documento_assinado];
      x.doc_url = g ? g.url : '';
      x.doc_assinado_url = a ? a.url : '';
      x.rascunho_url = c.rascunho_file_id ? linkDownload_(c.rascunho_file_id) : '';
      x.pode_rascunho = c.status !== 'Recebida' && !!c.id_documento;
      return x;
    });
    return o;
  });
}

// ---------------------------------------------------------------------------
// Criação do processo (gera ou anexa as cotações)

function salvarProcessoCotacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  exigirAcessoProjeto_(u, d.id_projeto);

  const rub = buscar_('RUBRICAS', 'id_rubrica', d.id_rubrica);
  if (!rub || rub.id_projeto !== d.id_projeto) throw new Error('Selecione a rubrica.');
  const funcao = String(d.funcao || '').trim();
  if (!funcao) throw new Error('Informe a função.');
  const horas = paraNumero_(d.horas_mensais) || '';
  const meses = parseInt(d.meses, 10);
  if (!(meses > 0)) throw new Error('Informe a quantidade de meses.');

  const blocos = (d.cotacoes || []).filter(c =>
    String(c.resp_nome || '').trim() || String(c.razao_social || '').trim() || (c.arquivo && c.arquivo.base64));
  if (!blocos.length) throw new Error('Preencha pelo menos uma cotação.');
  if (blocos.length > 3) throw new Error('No máximo 3 cotações por processo.');

  const precisaModelo = blocos.some(c => !(c.arquivo && c.arquivo.base64));
  let modelo = null;
  if (precisaModelo) {
    modelo = buscar_('MODELOS_CONTRATO', 'id_modelo', d.id_modelo);
    if (!modelo || modelo.ativo !== true || modelo.tipo_modelo !== 'Cotação') {
      throw new Error('Selecione o modelo de cotação (ou anexe o arquivo pronto em cada cotação).');
    }
  }

  // Valida e calcula cada cotação antes de gravar qualquer coisa
  const preparadas = blocos.map((c, i) => {
    const n = i + 1;
    if (!String(c.resp_nome || '').trim() && !String(c.razao_social || '').trim()) {
      throw new Error('Cotação ' + n + ': informe o nome ou a razão social do responsável.');
    }
    let vHora = paraNumero_(c.valor_hora);
    let vUnit = paraNumero_(c.valor_unitario_mensal);
    if (!(vUnit > 0) && vHora > 0 && horas > 0) vUnit = arred2_(vHora * horas);
    if (!(vHora > 0) && vUnit > 0 && horas > 0) vHora = arred2_(vUnit / horas);
    if (!(vUnit > 0)) throw new Error('Cotação ' + n + ': informe o valor da hora ou o valor mensal.');
    return Object.assign({}, c, { valor_hora: vHora || '', valor_unitario_mensal: arred2_(vUnit),
                                  valor_total: arred2_(vUnit * meses) });
  });

  const dataCot = paraData_(d.data_cotacao) || new Date();
  const proc = inserir_('PROCESSOS_COTACAO', {
    id_projeto: d.id_projeto, id_rubrica: d.id_rubrica, funcao: funcao,
    horas_mensais: horas, dias_mes: paraNumero_(d.dias_mes) || '', meses: meses,
    descricao_atividades: String(d.descricao_atividades || '').trim(),
    data_cotacao: dataCot, status: 'Aguardando assinaturas', id_modelo: modelo ? modelo.id_modelo : '',
    criado_em: new Date(), criado_por: u.id_usuario
  });

  const pasta = subpastaProjeto_(d.id_projeto, '05 Cotações').createFolder(proc.id_processo + ' - ' + funcao);
  const procLido = buscar_('PROCESSOS_COTACAO', 'id_processo', proc.id_processo);
  atualizar_('PROCESSOS_COTACAO', procLido._linha, { pasta_drive_id: pasta.getId() });

  const recebidas = [];
  preparadas.forEach((c, i) => {
    let idDoc = '', status, rasc = {};
    if (c.arquivo && c.arquivo.base64) {
      idDoc = salvarArquivoEmPasta_(u, d.id_projeto, '', 'Cotação', c.arquivo, pasta).id_documento;
      status = 'Recebida';
    } else {
      const g = gerarDocCotacao_(u, modelo, procLido, c, i + 1, pasta);
      idDoc = g.id_documento;
      status = 'Gerada – aguardando assinatura';
      // Rascunho em Word (.docx) da mesma cotação – se falhar, a geração em PDF segue normalmente
      rasc.gdoc_id = g._gdoc_id;
      try { const f = gerarRascunhoDocx_(g._gdoc_id, g._nome_base, pasta); rasc.rascunho_file_id = f.getId(); }
      catch (e) { console.warn('Rascunho Word não gerado: ' + e.message); }
    }
    inserir_('COTACOES', {
      id_processo: proc.id_processo, id_projeto: d.id_projeto, id_rubrica: d.id_rubrica, id_contratacao: '',
      razao_social: String(c.razao_social || c.resp_nome).trim(),
      cnpj: texto_(c.cnpj), resp_nome: String(c.resp_nome || '').trim(), resp_cpf: texto_(c.resp_cpf),
      resp_endereco: String(c.resp_endereco || '').trim(), resp_telefone: texto_(c.resp_telefone),
      resp_email: String(c.resp_email || '').trim(),
      valor_hora: c.valor_hora, valor_unitario_mensal: c.valor_unitario_mensal, valor: c.valor_total,
      data_cotacao: dataCot, vencedora: false, id_documento: idDoc, status: status,
      gdoc_id: rasc.gdoc_id || '', rascunho_file_id: rasc.rascunho_file_id || ''
    });
    if (status === 'Recebida') recebidas.push(idDoc);
  });
  padronizarDocsPorId_(recebidas);

  registrarAuditoria_(u.id_usuario, 'PROCESSOS_COTACAO', proc.id_processo, 'criacao', null,
    { funcao: funcao, cotacoes: preparadas.length });
  return listarProcessosCotacao_(u, d.id_projeto);
}

/** Salva um arquivo enviado numa pasta específica e registra em DOCUMENTOS. */
function salvarArquivoEmPasta_(u, idProjeto, idContratacao, tipo, arquivo, pasta) {
  const bytes = Utilities.base64Decode(arquivo.base64);
  if (bytes.length > LIMITE_ARQUIVO_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_ARQUIVO_MB + ' MB.');
  const nome = tipo + ' - ' + arquivo.nome;
  const file = pasta.createFile(Utilities.newBlob(bytes, arquivo.mime || 'application/octet-stream', nome));
  return inserir_('DOCUMENTOS', {
    id_projeto: idProjeto, id_contratacao: idContratacao || '', tipo: tipo, nome_arquivo: nome,
    nome_original: arquivo.nome_original || arquivo.nome || '', drive_file_id: file.getId(), url: file.getUrl(), mime_type: arquivo.mime || '',
    enviado_por: u.id_usuario, enviado_em: new Date()
  });
}

function gerarDocCotacao_(u, modelo, proc, c, n, pasta) {
  const p = buscar_('PROJETOS', 'id_projeto', proc.id_projeto) || {};
  const i = buscar_('INSTITUICOES', 'id_instituicao', p.id_instituicao) || {};
  const fmtNum = v => (v === '' || v === null || v === undefined) ? '' : String(v).replace('.', ',');

  const campos = {
    funcao: proc.funcao,
    contratante_razao_social: String(i.razao_social || ''),
    contratante_cnpj: String(i.cnpj || ''),
    contratante_endereco_completo: enderecoCompleto_(i),
    cidade: String(i.cidade || ''),
    descricao_atividades: String(proc.descricao_atividades || ''),
    horas: fmtNum(proc.horas_mensais),
    dias: fmtNum(proc.dias_mes),
    meses: String(proc.meses),
    valor_hora: c.valor_hora ? brl_(c.valor_hora) : '',
    valor_unitario_mensal: brl_(c.valor_unitario_mensal),
    valor_total: brl_(c.valor_total),
    resp_nome: String(c.resp_nome || ''),
    resp_cpf: String(c.resp_cpf || ''),
    resp_razao_social: String(c.razao_social || ''),
    resp_cnpj: String(c.cnpj || ''),
    resp_endereco: String(c.resp_endereco || ''),
    resp_telefone: String(c.resp_telefone || ''),
    resp_email: String(c.resp_email || ''),
    data_extenso: dataExtenso_(proc.data_cotacao instanceof Date ? proc.data_cotacao : new Date()),
    projeto_nome: String(p.nome_projeto || ''),
    termo_fomento: String(p.termo_fomento_cit || ''),
    orgao: String(p.orgao || '')
  };

  const nomeBase = 'Cotação ' + n + ' - ' + proc.funcao + ' - ' + (c.razao_social || c.resp_nome);
  const copia = DriveApp.getFileById(modelo.google_doc_id).makeCopy(nomeBase, pasta);
  const doc = DocumentApp.openById(copia.getId());
  const partes = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(x => x);
  Object.keys(campos).forEach(k => partes.forEach(el => substituirCampo_(el, k, campos[k])));
  if (campos.orgao) partes.forEach(el => substituirLiteral_(el, ORGAO_ANTIGO_RX, campos.orgao));
  doc.saveAndClose();

  const pdf = pasta.createFile(copia.getAs('application/pdf').setName(nomeBase + ' (para assinatura).pdf'));
  if (!u) return { pdf: pdf, copia: copia, nomeBase: nomeBase };     // regeração: quem chama atualiza o registro
  const reg = inserir_('DOCUMENTOS', {
    id_projeto: proc.id_projeto, id_contratacao: '', tipo: 'Cotação',
    nome_arquivo: nomeBase + ' (para assinatura).pdf', drive_file_id: pdf.getId(), url: pdf.getUrl(),
    mime_type: 'application/pdf', enviado_por: u.id_usuario, enviado_em: new Date()
  });
  reg._gdoc_id = copia.getId();
  reg._nome_base = nomeBase;
  return reg;
}

// ---------------------------------------------------------------------------
// Rascunho em Word (.docx): exporta o mesmo Google Doc que gerou o PDF (mesmo texto e formatação)

function linkDownload_(id) { return 'https://drive.google.com/uc?export=download&id=' + id; }

function gerarRascunhoDocx_(gdocId, nomeBase, pasta) {
  const resp = UrlFetchApp.fetch('https://docs.google.com/document/d/' + gdocId + '/export?format=docx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('Falha ao exportar para Word (código ' + resp.getResponseCode() + ').');
  const blob = resp.getBlob().setName(nomeBase + ' (rascunho).docx')
    .setContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return pasta.createFile(blob);
}

/** Gera (ou recria) o rascunho Word de uma cotação já gerada – usado nas cotações antigas. */
function gerarRascunhoCotacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = cotacaoDoProcesso_(u, d.id_cotacao);
  if (c.status === 'Recebida') throw new Error('Esta cotação foi anexada pronta; não há modelo para gerar o Word.');
  if (c.rascunho_file_id) {
    try { if (!DriveApp.getFileById(c.rascunho_file_id).isTrashed()) return listarProcessosCotacao_(u, c.id_projeto); } catch (e) {}
  }
  const proc = buscar_('PROCESSOS_COTACAO', 'id_processo', c.id_processo) || {};
  if (!proc.pasta_drive_id) throw new Error('Pasta do processo de cotação não encontrada no Drive.');
  const pasta = DriveApp.getFolderById(proc.pasta_drive_id);
  let gdocId = c.gdoc_id, nomeBase = '';
  if (gdocId) { try { const f = DriveApp.getFileById(gdocId); if (f.isTrashed()) gdocId = ''; else nomeBase = f.getName(); } catch (e) { gdocId = ''; } }
  if (!gdocId) {
    // Cotações antigas: procura o Google Doc gerado na pasta do processo ("Cotação N - função - nome")
    const fim = ' - ' + String(c.razao_social || c.resp_nome || '').trim();
    const it = pasta.getFilesByType(MimeType.GOOGLE_DOCS);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed() && /^Cotação \d+ - /.test(f.getName()) && f.getName().slice(-fim.length) === fim) { gdocId = f.getId(); nomeBase = f.getName(); break; }
    }
  }
  if (!gdocId) throw new Error('Não encontrei o documento editável desta cotação na pasta do Drive. Gere a cotação de novo para ter o Word.');
  const arq = gerarRascunhoDocx_(gdocId, nomeBase, pasta);
  atualizar_('COTACOES', c._linha, { gdoc_id: gdocId, rascunho_file_id: arq.getId() });
  registrarAuditoria_(u.id_usuario, 'COTACOES', c.id_cotacao, 'rascunho_word', null, { arquivo: arq.getId() });
  return listarProcessosCotacao_(u, c.id_projeto);
}

// ---------------------------------------------------------------------------
// Depois de gerar: assinada, vencedora, exclusão

function cotacaoDoProcesso_(u, idCotacao) {
  const c = buscar_('COTACOES', 'id_cotacao', idCotacao);
  if (!c || !c.id_processo) throw new Error('Cotação não encontrada.');
  exigirAcessoProjeto_(u, c.id_projeto);
  return c;
}

function anexarCotacaoAssinada_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = cotacaoDoProcesso_(u, d.id_cotacao);
  const proc = buscar_('PROCESSOS_COTACAO', 'id_processo', c.id_processo);
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione o arquivo assinado.');
  const pasta = proc.pasta_drive_id ? DriveApp.getFolderById(proc.pasta_drive_id) : subpastaProjeto_(c.id_projeto, '05 Cotações');
  const doc = salvarArquivoEmPasta_(u, c.id_projeto, c.id_contratacao, 'Cotação', d.arquivo, pasta);
  atualizar_('COTACOES', c._linha, { id_documento_assinado: doc.id_documento, status: 'Assinada' });
  padronizarDocsPorId_([doc.id_documento]);

  const todas = ler_('COTACOES').filter(x => x.id_processo === c.id_processo);
  if (proc.status === 'Aguardando assinaturas' && todas.every(x => x.status === 'Assinada' || x.status === 'Recebida')) {
    atualizar_('PROCESSOS_COTACAO', proc._linha, { status: 'Concluído' });
  }
  registrarAuditoria_(u.id_usuario, 'COTACOES', c.id_cotacao, 'assinada', null, { doc: doc.id_documento });
  return listarProcessosCotacao_(u, c.id_projeto);
}

function marcarCotacaoVencedora_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = cotacaoDoProcesso_(u, d.id_cotacao);
  ler_('COTACOES').filter(x => x.id_processo === c.id_processo).forEach(x =>
    atualizar_('COTACOES', x._linha, { vencedora: x.id_cotacao === c.id_cotacao }));
  registrarAuditoria_(u.id_usuario, 'COTACOES', c.id_cotacao, 'vencedora');
  return listarProcessosCotacao_(u, c.id_projeto);
}

function excluirProcessoCotacao_(u, idProcesso) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const p = buscar_('PROCESSOS_COTACAO', 'id_processo', idProcesso);
  if (!p) throw new Error('Processo não encontrado.');
  exigirAcessoProjeto_(u, p.id_projeto);
  if (p.id_contratacao) throw new Error('Este processo já virou contratação e não pode ser excluído.');

  const cots = ler_('COTACOES').filter(x => x.id_processo === idProcesso);
  const idsDocs = [];
  cots.forEach(x => { if (x.id_documento) idsDocs.push(x.id_documento); if (x.id_documento_assinado) idsDocs.push(x.id_documento_assinado); });
  excluirLinhas_('COTACOES', cots.map(x => x._linha));
  excluirLinhas_('DOCUMENTOS', ler_('DOCUMENTOS').filter(x => idsDocs.indexOf(x.id_documento) > -1).map(x => x._linha));
  if (p.pasta_drive_id) { try { DriveApp.getFolderById(p.pasta_drive_id).setTrashed(true); } catch (e) {} }
  const linhaProc = buscar_('PROCESSOS_COTACAO', 'id_processo', idProcesso)._linha;
  conferirLinhas_('PROCESSOS_COTACAO');
  aba_('PROCESSOS_COTACAO').deleteRow(linhaProc);
  invalidar_('PROCESSOS_COTACAO');
  registrarAuditoria_(u.id_usuario, 'PROCESSOS_COTACAO', idProcesso, 'exclusao', limpar_(p), null);
  return listarProcessosCotacao_(u, p.id_projeto);
}

/** Chamado ao salvar uma contratação criada a partir da cotação vencedora. */
function vincularProcessoAContratacao_(idProcesso, idContratacao) {
  const p = buscar_('PROCESSOS_COTACAO', 'id_processo', idProcesso);
  if (!p) return;
  atualizar_('PROCESSOS_COTACAO', p._linha, { id_contratacao: idContratacao, status: 'Contratado' });
  ler_('COTACOES').filter(x => x.id_processo === idProcesso)
    .forEach(x => atualizar_('COTACOES', x._linha, { id_contratacao: idContratacao }));
  const docs = ler_('COTACOES').filter(x => x.id_processo === idProcesso)
    .reduce((a, x) => a.concat([x.id_documento, x.id_documento_assinado].filter(String)), []);
  ler_('DOCUMENTOS').filter(x => docs.indexOf(x.id_documento) > -1)
    .forEach(x => atualizar_('DOCUMENTOS', x._linha, { id_contratacao: idContratacao }));
}

// ---------------------------------------------------------------------------
// Menu: cadastrar modelo de cotação

function cadastrarModeloCotacaoUI() {
  const ui = SpreadsheetApp.getUi();
  try {
    const url = perguntar_(ui, 'Cadastrar modelo de cotação',
      'Cole o link do Google Doc do modelo de cotação.\n(Se estiver em Word: abra no Drive > Arquivo > Salvar como Documentos Google.)');
    const doc = validarModeloDoc_(url);
    const m = [doc.id];
    const nome = perguntar_(ui, 'Cadastrar modelo de cotação', 'Nome do modelo (ex.: Cotação de prestação de serviço):') || 'Modelo de cotação';
    const inst = perguntar_(ui, 'Cadastrar modelo de cotação',
      'ID da instituição, se o modelo for exclusivo de uma (ex.: INS-0001).\nDeixe em branco para servir para todas.').toUpperCase();
    if (inst && !buscar_('INSTITUICOES', 'id_instituicao', inst)) return ui.alert('Instituição não encontrada.');
    const novo = inserir_('MODELOS_CONTRATO', {
      nome: nome, tipo_despesa: '', tipo_pessoa_contratado: '', id_instituicao: inst,
      google_doc_id: m[0], ativo: true, atualizado_em: new Date(), tipo_modelo: 'Cotação'
    });
    ui.alert('Modelo de cotação cadastrado: ' + novo.id_modelo);
  } catch (e) {
    if (e.message !== 'CANCELADO') ui.alert('Erro: ' + e.message);
  }
}

/** Rode UMA VEZ no editor (▶ Executar) para o Google pedir a permissão de "serviço externo" usada no rascunho Word. */
function autorizarRascunhoWord() {
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('Permissão concedida ✓ – agora publique uma nova versão.');
}


// ---------------------------------------------------------------------------
// Editar um processo já gerado e gerar os documentos de novo

/** Move um arquivo do Drive para a lixeira sem interromper (se já não existir, ignora). */
function lixeiraDrive_(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }

/** Gera de novo o PDF (versão final) e o Word (rascunho) de uma cotação, com os dados atuais da planilha. */
function regerarDocsCotacao_(u, proc, c, n, modelo, pasta) {
  const dados = Object.assign({}, c, { valor_total: c.valor });
  const r = gerarDocCotacao_(null, modelo, proc, dados, n, pasta);
  const docAntigo = c.id_documento ? buscar_('DOCUMENTOS', 'id_documento', c.id_documento) : null;
  let idDoc = c.id_documento;
  const campos = { nome_arquivo: r.nomeBase + ' (para assinatura).pdf', drive_file_id: r.pdf.getId(), url: r.pdf.getUrl(),
    mime_type: 'application/pdf', enviado_por: u.id_usuario, enviado_em: new Date() };
  if (docAntigo) {
    lixeiraDrive_(docAntigo.drive_file_id);
    atualizar_('DOCUMENTOS', docAntigo._linha, campos);
  } else {
    idDoc = inserir_('DOCUMENTOS', Object.assign({ id_projeto: proc.id_projeto, id_contratacao: proc.id_contratacao || '', tipo: 'Cotação' }, campos)).id_documento;
  }
  lixeiraDrive_(c.gdoc_id); lixeiraDrive_(c.rascunho_file_id);
  const novos = { id_documento: idDoc, gdoc_id: r.copia.getId(), rascunho_file_id: '' };
  try { novos.rascunho_file_id = gerarRascunhoDocx_(r.copia.getId(), r.nomeBase, pasta).getId(); }
  catch (e) { console.warn('Rascunho Word não gerado: ' + e.message); }
  atualizar_('COTACOES', buscar_('COTACOES', 'id_cotacao', c.id_cotacao)._linha, novos);
}

function modeloCotacao_(idModelo) {
  const m = buscar_('MODELOS_CONTRATO', 'id_modelo', idModelo);
  if (!m || m.ativo !== true || m.tipo_modelo !== 'Cotação') throw new Error('Selecione o modelo de cotação para gerar os documentos de novo.');
  return m;
}

/**
 * Edita os dados do processo (função, horas, dias, meses, data, descrição) e de cada cotação.
 * d.regerar = true → gera de novo PDF e Word das cotações geradas pelo sistema que ainda não foram assinadas.
 */
function editarProcessoCotacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const proc = buscar_('PROCESSOS_COTACAO', 'id_processo', d.id_processo);
  if (!proc) throw new Error('Processo não encontrado.');
  exigirAcessoProjeto_(u, proc.id_projeto);
  const funcao = String(d.funcao || '').trim();
  if (!funcao) throw new Error('Informe a função.');
  const horas = paraNumero_(d.horas_mensais) || '';
  const meses = parseInt(d.meses, 10);
  if (!(meses > 0)) throw new Error('Informe a quantidade de meses.');

  const cots = ler_('COTACOES').filter(x => x.id_processo === proc.id_processo);
  const porId = {};
  (d.cotacoes || []).forEach(c => { porId[c.id_cotacao] = c; });
  // Valida tudo antes de gravar
  const novas = cots.map((atual, i) => {
    const c = porId[atual.id_cotacao] || {};
    const n = i + 1;
    const pega = k => (c[k] === undefined ? atual[k] : c[k]);
    const nome = String(pega('resp_nome') || '').trim(), razao = String(pega('razao_social') || '').trim();
    if (!nome && !razao) throw new Error('Cotação ' + n + ': informe o nome ou a razão social do responsável.');
    let vHora = paraNumero_(pega('valor_hora'));
    let vUnit = paraNumero_(pega('valor_unitario_mensal'));
    if (!(vUnit > 0) && vHora > 0 && horas > 0) vUnit = arred2_(vHora * horas);
    if (!(vHora > 0) && vUnit > 0 && horas > 0) vHora = arred2_(vUnit / horas);
    if (!(vUnit > 0)) throw new Error('Cotação ' + n + ': informe o valor da hora ou o valor mensal.');
    return { atual: atual, n: n, campos: {
      razao_social: razao || nome, cnpj: texto_(pega('cnpj')), resp_nome: nome, resp_cpf: texto_(pega('resp_cpf')),
      resp_endereco: String(pega('resp_endereco') || '').trim(), resp_telefone: texto_(pega('resp_telefone')),
      resp_email: String(pega('resp_email') || '').trim(),
      valor_hora: vHora || '', valor_unitario_mensal: arred2_(vUnit), valor: arred2_(vUnit * meses)
    } };
  });

  const campoProc = { funcao: funcao, horas_mensais: horas, dias_mes: paraNumero_(d.dias_mes) || '', meses: meses,
    descricao_atividades: String(d.descricao_atividades || '').trim(),
    data_cotacao: paraData_(d.data_cotacao) || proc.data_cotacao };
  if (d.id_modelo) campoProc.id_modelo = d.id_modelo;
  atualizar_('PROCESSOS_COTACAO', proc._linha, campoProc);
  novas.forEach(x => atualizar_('COTACOES', x.atual._linha, x.campos));
  registrarAuditoria_(u.id_usuario, 'PROCESSOS_COTACAO', proc.id_processo, 'edicao', limpar_(proc),
    { processo: campoProc, cotacoes: novas.map(x => x.campos) });

  const resumo = { regeradas: 0, mantidas: [] };
  if (d.regerar) {
    const regerar = novas.filter(x => x.atual.status !== 'Recebida' && x.atual.status !== 'Assinada');
    novas.forEach(x => { if (regerar.indexOf(x) === -1) resumo.mantidas.push('Cotação ' + x.n + ' (' + x.atual.status.toLowerCase() + ')'); });
    if (regerar.length) {
      const modelo = modeloCotacao_(d.id_modelo || proc.id_modelo);
      const procNovo = buscar_('PROCESSOS_COTACAO', 'id_processo', proc.id_processo);
      const pasta = procNovo.pasta_drive_id ? DriveApp.getFolderById(procNovo.pasta_drive_id) : subpastaProjeto_(proc.id_projeto, '05 Cotações');
      regerar.forEach(x => {
        regerarDocsCotacao_(u, procNovo, buscar_('COTACOES', 'id_cotacao', x.atual.id_cotacao), x.n, modelo, pasta);
        resumo.regeradas++;
      });
      registrarAuditoria_(u.id_usuario, 'PROCESSOS_COTACAO', proc.id_processo, 'regerar_documentos', null, resumo);
    }
  }
  const lista = listarProcessosCotacao_(u, proc.id_projeto);
  return { processos: lista, resumo: resumo };
}

/** Gera de novo os documentos de UMA cotação (com os dados atuais). */
function regerarCotacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = cotacaoDoProcesso_(u, d.id_cotacao);
  if (c.status === 'Recebida') throw new Error('Esta cotação foi anexada pronta; não há modelo para gerar de novo.');
  if (c.status === 'Assinada' && !d.confirmar_assinada) throw new Error('Esta cotação já está assinada.');
  const proc = buscar_('PROCESSOS_COTACAO', 'id_processo', c.id_processo);
  const modelo = modeloCotacao_(d.id_modelo || proc.id_modelo);
  const todas = ler_('COTACOES').filter(x => x.id_processo === c.id_processo);
  const n = todas.findIndex(x => x.id_cotacao === c.id_cotacao) + 1;
  const pasta = proc.pasta_drive_id ? DriveApp.getFolderById(proc.pasta_drive_id) : subpastaProjeto_(c.id_projeto, '05 Cotações');
  regerarDocsCotacao_(u, proc, c, n, modelo, pasta);
  if (c.status === 'Assinada') {
    // O PDF novo precisa ser assinado de novo (a versão assinada antiga continua guardada)
    atualizar_('COTACOES', buscar_('COTACOES', 'id_cotacao', c.id_cotacao)._linha, { status: 'Gerada – aguardando assinatura', id_documento_assinado: '' });
    if (proc.status === 'Concluído') atualizar_('PROCESSOS_COTACAO', proc._linha, { status: 'Aguardando assinaturas' });
  }
  registrarAuditoria_(u.id_usuario, 'COTACOES', c.id_cotacao, 'regerar_documento', null, { assinada_antes: c.status === 'Assinada', doc_assinado_antigo: c.id_documento_assinado || '' });
  return listarProcessosCotacao_(u, c.id_projeto);
}
