/**
 * Nomes.gs – padrão de nomes dos arquivos no Google Drive
 *
 *  Nota fiscal ............ Nota Fiscal - Rubrica - Representante legal - Nº da NF
 *  Comprovante ............ Comprovante Pagto - Rubrica - Representante legal - Nº da NF - Nº de identificação (extrato)
 *  NF + comprovante juntos  Nota Fiscal e Comprovante Pagto - Rubrica - Representante legal - Nº da NF - Nº de identificação
 *  Contrato ............... Contrato - Rubrica - Representante legal
 *  Cotação ................ Cotação - Rubrica - Representante legal (de quem cotou)
 *  Demais documentos ...... SIGLA - Tipo - nome original            (projeto)
 *                           SIGLA - CTR-0000 - Tipo - nome original (contratação)
 *  Minuta de contrato gerada e cotação gerada pelo sistema: mantêm o nome que já recebem.
 *
 * O nome é recalculado sempre que os dados mudam (nº da NF, nº de identificação, rubrica, contratado…).
 * Partes ainda sem dado (ex.: nº de identificação antes da conferência) ficam de fora até serem preenchidas.
 */

function limparParteNome_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/[\\\/:*?"<>|\r\n\t]+/g, '-').replace(/\s+/g, ' ').replace(/^[\s\-–]+|[\s\-–]+$/g, '').trim();
}

function montarNome_(partes) {
  return partes.map(limparParteNome_).filter(Boolean).join(' - ').slice(0, 180).trim();
}

function extensaoDe_(nome, mime) {
  const m = String(nome || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return '.' + m[1].toLowerCase();
  const porMime = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx' };
  return porMime[mime] || '';
}

/** Nome do representante legal: PJ → representante; PF (ou sem representante) → o próprio nome. */
function representanteDe_(f) {
  f = f || {};
  return String(f.representante_nome || '').trim() || String(f.razao_social || '').trim();
}

/** Índices usados para descobrir a que cada documento pertence (montados uma vez por requisição). */
function indicesNomes_() {
  const ix = { nf: {}, pg: {}, cot: {}, ctr: {}, rub: {}, forn: {}, parc: {}, nfParc: {}, pgParc: {}, proj: {}, ctrDoc: {}, proc: {} };
  ler_('RUBRICAS').forEach(r => { ix.rub[r.id_rubrica] = r; });
  ler_('FORNECEDORES').forEach(f => { ix.forn[f.id_fornecedor] = f; });
  ler_('CONTRATACOES').forEach(c => { ix.ctr[c.id_contratacao] = c; if (c.id_doc_contrato) ix.ctrDoc[c.id_doc_contrato] = c; });
  ler_('PARCELAS').forEach(p => { ix.parc[p.id_parcela] = p; });
  ler_('PROJETOS').forEach(p => { ix.proj[p.id_projeto] = p; });
  ler_('PROCESSOS_COTACAO').forEach(p => { ix.proc[p.id_processo] = p; });
  ler_('NOTAS_FISCAIS').forEach(n => { if (n.id_documento) ix.nf[n.id_documento] = n; if (n.id_parcela) ix.nfParc[n.id_parcela] = n; });
  ler_('PAGAMENTOS').forEach(g => { if (g.id_documento_comprovante) ix.pg[g.id_documento_comprovante] = g; if (g.id_parcela) ix.pgParc[g.id_parcela] = g; });
  ler_('COTACOES').forEach(c => { if (c.id_documento) ix.cot[c.id_documento] = c; if (c.id_documento_assinado) ix.cot[c.id_documento_assinado] = c; });
  return ix;
}

/** Nome padrão (sem extensão) de um documento, ou '' quando ele deve manter o nome atual. */
function nomePadraoDoc_(doc, ix) {
  const atual = String(doc.nome_arquivo || '');
  // Gerados pelo sistema: mantêm o nome
  if (/^Minuta contrato /.test(atual) || /\(para assinatura\)/.test(atual)) return '';

  const daParcela = idParcela => {
    const p = ix.parc[idParcela] || {}, c = ix.ctr[p.id_contratacao] || {};
    return { rub: (ix.rub[c.id_rubrica] || {}).descricao, rep: representanteDe_(ix.forn[c.id_fornecedor]),
             nf: ix.nfParc[idParcela] || {}, pg: ix.pgParc[idParcela] || {} };
  };

  const nf = ix.nf[doc.id_documento], pg = ix.pg[doc.id_documento];
  if (nf || pg) {
    const x = daParcela((nf || pg).id_parcela);
    const numNF = (nf || x.nf).numero, ident = (pg || x.pg).num_identificacao_pix;
    if (nf && pg) return montarNome_(['Nota Fiscal e Comprovante Pagto', x.rub, x.rep, numNF, ident]);
    if (nf) return montarNome_(['Nota Fiscal', x.rub, x.rep, numNF]);
    return montarNome_(['Comprovante Pagto', x.rub, x.rep, numNF, ident]);
  }

  const cot = ix.cot[doc.id_documento];
  if (cot) {
    const c = ix.ctr[cot.id_contratacao] || {}, proc = ix.proc[cot.id_processo] || {};
    const rub = (ix.rub[cot.id_rubrica] || ix.rub[c.id_rubrica] || ix.rub[proc.id_rubrica] || {}).descricao || proc.funcao;
    return montarNome_(['Cotação', rub, String(cot.resp_nome || '').trim() || cot.razao_social]);
  }

  const c = ix.ctr[doc.id_contratacao];
  if (c && (doc.tipo === 'Contrato' || ix.ctrDoc[doc.id_documento])) {
    return montarNome_(['Contrato', (ix.rub[c.id_rubrica] || {}).descricao, representanteDe_(ix.forn[c.id_fornecedor])]);
  }
  if (c && doc.tipo === 'Cotação') {
    return montarNome_(['Cotação', (ix.rub[c.id_rubrica] || {}).descricao, representanteDe_(ix.forn[c.id_fornecedor])]);
  }
  // NF/comprovante solto (lançamento excluído): não mexe
  if (doc.tipo === 'Nota fiscal' || doc.tipo === 'Comprovante de pagamento') return '';

  // Demais documentos: SIGLA - [CTR] - Tipo - nome original
  const proj = ix.proj[doc.id_projeto] || {};
  const sigla = proj.sigla || proj.nome_projeto || '';
  let original = String(doc.nome_original || '').trim();
  if (!original) {
    original = atual.replace(/\.[a-z0-9]{2,5}$/i, '');
    if (sigla && original.indexOf(limparParteNome_(sigla) + ' - ') === 0) return '';     // já está no padrão
    if (doc.tipo && original.indexOf(doc.tipo + ' - ') === 0) original = original.slice(doc.tipo.length + 3);
  }
  original = original.replace(/\.[a-z0-9]{2,5}$/i, '');
  if (doc.tipo && original.indexOf(doc.tipo + ' - ') === 0) original = original.slice(doc.tipo.length + 3);
  return montarNome_([sigla, doc.id_contratacao || '', doc.tipo, original]);
}

/** Renomeia um documento no Drive (e na planilha) se o nome dele não estiver no padrão. Nunca interrompe a gravação. */
function padronizarDoc_(doc, ix) {
  try {
    if (!doc || !doc.drive_file_id) return 'ignorado';
    const base = nomePadraoDoc_(doc, ix || indicesNomes_());
    if (!base) return 'ignorado';
    const novo = base + extensaoDe_(doc.nome_arquivo, doc.mime_type);
    if (novo === doc.nome_arquivo) return 'igual';
    DriveApp.getFileById(doc.drive_file_id).setName(novo);
    const campos = { nome_arquivo: novo };
    if (!doc.nome_original) campos.nome_original = String(doc.nome_arquivo || '');
    atualizar_('DOCUMENTOS', doc._linha, campos);
    return 'renomeado';
  } catch (e) {
    console.warn('Não foi possível renomear ' + (doc && doc.id_documento) + ': ' + e.message);
    return 'erro';
  }
}

function padronizarDocsPorId_(ids) {
  const quer = {};
  (ids || []).filter(Boolean).forEach(id => { quer[id] = true; });
  if (!Object.keys(quer).length) return;
  const ix = indicesNomes_();
  ler_('DOCUMENTOS').filter(d => quer[d.id_documento]).forEach(d => padronizarDoc_(d, ix));
}

/** Documentos (NF e comprovante) ligados a uma parcela. */
function padronizarDocsParcela_(idParcela) {
  const ids = [];
  ler_('NOTAS_FISCAIS').forEach(n => { if (n.id_parcela === idParcela) ids.push(n.id_documento); });
  ler_('PAGAMENTOS').forEach(g => { if (g.id_parcela === idParcela) ids.push(g.id_documento_comprovante); });
  padronizarDocsPorId_(ids);
}

/** Todos os documentos de uma contratação (contrato, cotações, NFs e comprovantes das parcelas). */
function padronizarDocsContratacao_(idContratacao) {
  const parcelas = {};
  ler_('PARCELAS').forEach(p => { if (p.id_contratacao === idContratacao) parcelas[p.id_parcela] = true; });
  const ids = ler_('DOCUMENTOS').filter(d => d.id_contratacao === idContratacao).map(d => d.id_documento);
  ler_('NOTAS_FISCAIS').forEach(n => { if (parcelas[n.id_parcela]) ids.push(n.id_documento); });
  ler_('PAGAMENTOS').forEach(g => { if (parcelas[g.id_parcela]) ids.push(g.id_documento_comprovante); });
  ler_('COTACOES').forEach(c => { if (c.id_contratacao === idContratacao) ids.push(c.id_documento, c.id_documento_assinado); });
  padronizarDocsPorId_(ids);
}

/** Ação da tela: renomeia no padrão todos os arquivos de um projeto (os que já estão no Drive). */
function padronizarNomesArquivos_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const inicio = Date.now(), ix = indicesNomes_();
  const docs = ler_('DOCUMENTOS').filter(x => x.id_projeto === d.id_projeto);
  const r = { total: docs.length, renomeados: 0, ja_no_padrao: 0, mantidos: 0, erros: 0, restantes: 0 };
  for (let i = 0; i < docs.length; i++) {
    if (Date.now() - inicio > 4.5 * 60 * 1000) { r.restantes = docs.length - i; break; }   // limite de tempo do Apps Script
    const s = padronizarDoc_(docs[i], ix);
    if (s === 'renomeado') r.renomeados++;
    else if (s === 'igual') r.ja_no_padrao++;
    else if (s === 'erro') r.erros++;
    else r.mantidos++;
  }
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', d.id_projeto, 'padronizar_nomes', null, r);
  return r;
}
