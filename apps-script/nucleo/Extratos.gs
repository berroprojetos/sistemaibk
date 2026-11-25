/**
 * Extratos.gs – extratos bancários mensais (conta corrente e poupança/aplicação), conciliação e taxas
 *
 *  - Por projeto e mês: PDF da conta corrente, PDF da poupança e, opcional, OFX (conta corrente).
 *  - A leitura do arquivo é feita no navegador (PDF do Banco do Brasil ou OFX); aqui chegam os lançamentos já separados.
 *  - Lançamentos ficam na aba EXTRATO (um por linha). Se houver OFX da conta no mês, os lançamentos vêm dele;
 *    senão, do PDF. Trocar o arquivo preserva as ligações e categorias já feitas (pela chave data|natureza|valor|documento).
 *  - Conciliação: cada saída da conta corrente é ligada a um pagamento lançado no sistema (valor + data do débito ± 7 dias
 *    + nome do favorecido). As ligações automáticas podem ser desfeitas/refeitas à mão.
 *  - Taxas: tarifas cobradas × estornos/ressarcimentos, a partir do 1º pagamento do projeto.
 */

const CONTAS_EXT = { CC: 'Conta corrente', POUP: 'Poupança', APLIC: 'Aplicação (BB Rende Fácil / Rende Mais)' };
const CATEGORIAS_EXT = ['Pagamento', 'Tarifa bancária', 'Estorno de tarifa', 'Resgate da aplicação', 'Aplicação', 'Rendimento',
  'IR/IOF da aplicação', 'Recebimento/repasse', 'Outro débito', 'Outro crédito'];
const PERFIS_EXTRATO = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO', 'INSTITUICAO_CONTRATACAO', 'INSTITUICAO_PAGAMENTO'];

function prepararAbasExtrato_() {
  try { aba_('IMPORTACOES_EXTRATO'); aba_('EXTRATO'); } catch (e) {}
}
/** Grava várias linhas de uma vez (mais rápido que uma por uma). Devolve os objetos com ID. */
function inserirVariosExt_(nome, objs) {
  if (!objs.length) return [];
  const sh = aba_(nome);
  relaxarValidacoes_(sh);
  const chaves = {};
  objs.forEach(o => Object.keys(o).forEach(k => { chaves[k] = true; }));
  const cab = garantirColunas_(sh, Object.keys(chaves));
  invalidar_(nome);
  objs.forEach(o => { if (!o[cab[0]]) o[cab[0]] = gerarId(nome); });
  const linhas = objs.map(o => cab.map(c => (o[c] === undefined ? '' : o[c])));
  const ini = linhaLivre_(sh, linhas.length);
  sh.getRange(ini, 1, linhas.length, cab.length).clearDataValidations().setValues(linhas);
  invalidar_(nome);
  return objs;
}

/** Apaga linhas agrupando as vizinhas (deleteRows em bloco). */
function excluirLinhasExt_(nome, linhas) {
  if (!linhas.length) return;
  conferirLinhas_(nome);
  const sh = aba_(nome);
  const ord = linhas.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < ord.length) {
    let j = i;
    while (j + 1 < ord.length && ord[j + 1] === ord[j] - 1) j++;
    sh.deleteRows(ord[j], j - i + 1);
    i = j + 1;
  }
  invalidar_(nome);
}

function ymdExt_(v) { return v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') : String(v || '').slice(0, 10); }
function compExt_(v) { return v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM') : String(v || '').slice(0, 7); }
function r2e_(v) { return Math.round(Number(v || 0) * 100) / 100; }
function semAcentoExt_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

/** Categoria automática do lançamento (pode ser trocada à mão). */
function categorizarExt_(l, conta) {
  const h = semAcentoExt_(l.historico + ' ' + (l.detalhe || ''));
  const d = l.natureza === 'D';
  if (conta === 'POUP') {
    if (d && /resgate|transf.*conta|para conta/.test(h)) return 'Resgate da aplicação';
    if (!d && /rendimento|juros|remunera|correcao/.test(h)) return 'Rendimento';
    if (!d && /aplica|deposito|transf|credito/.test(h)) return 'Aplicação';
    if (d && /tarifa|tar\.|taxa|iof/.test(h)) return 'Tarifa bancária';
    return d ? 'Outro débito' : 'Outro crédito';
  }
  if (!d && /(estorno|estor|devol|ressarc|reembols|restitu)/.test(h) && /(tar|taxa|pacote|cesta)/.test(h)) return 'Estorno de tarifa';
  if (d && /tarifa|tar\.|tar |cesta|pacote de serv|pacote serv|\biof\b|taxa|encargo/.test(h)) return 'Tarifa bancária';
  if (/rende f|rende mais|bb rende/.test(h)) return d ? 'Aplicação' : 'Resgate da aplicação';
  if (!d && /resgate|da poupan/.test(h)) return 'Resgate da aplicação';
  if (d && /aplica|poupan/.test(h)) return 'Aplicação';
  if (!d && /rendimento|juros/.test(h)) return 'Rendimento';
  if (d) return 'Pagamento';
  return /transf|ted|doc|pix|deposito|recurso|repasse|ordem banc|convenio/.test(h) ? 'Recebimento/repasse' : 'Outro crédito';
}
const CATEG_SAIDA_PAGTO_ = ['Pagamento', 'Outro débito'];

function chaveExt_(l) {
  return [ymdExt_(l.data), l.natureza, r2e_(l.valor).toFixed(2), String(l.documento || '').replace(/\D/g, '')].join('|');
}

// ---------------------------------------------------------------------------
// Início do controle de taxas e meses do painel

function inicioProjetoExt_(idProjeto, pags, lancs) {
  let ini = '';
  pags.forEach(g => { const d = ymdExt_(g.data_debito_conta || g.data_pagamento); if (d && (!ini || d < ini)) ini = d; });
  lancs.forEach(l => { if (l.conta === 'CC' && l.categoria === 'Pagamento' && (!ini || ymdExt_(l.data) < ini)) ini = ymdExt_(l.data); });
  return ini;
}

function nomesPorPagamento_(idProjeto) {
  const forn = {}, ctr = {}, parc = {};
  ler_('FORNECEDORES').forEach(f => { forn[f.id_fornecedor] = f; });
  ler_('CONTRATACOES').forEach(c => { if (c.id_projeto === idProjeto) ctr[c.id_contratacao] = c; });
  ler_('PARCELAS').forEach(p => { if (p.id_projeto === idProjeto) parc[p.id_parcela] = p; });
  return { forn: forn, ctr: ctr, parc: parc };
}

function rotuloPagamento_(g, ix) {
  const p = ix.parc[g.id_parcela] || {}, c = ix.ctr[p.id_contratacao] || {}, f = ix.forn[c.id_fornecedor] || {};
  return { contratado: f.razao_social || '', representante: f.representante_nome || f.nome_completo || '',
    parcela: p.num_parcela ? p.num_parcela + (c.num_parcelas ? '/' + c.num_parcelas : '') : '', id_contratacao: c.id_contratacao || '',
    valor: r2e_(g.valor || p.valor_previsto), data: ymdExt_(g.data_debito_conta || g.data_pagamento), competencia: p.competencia ? compExt_(p.competencia) : '' };
}

// ---------------------------------------------------------------------------
// Painel do projeto

function obterExtratos_(u, d) {
  exigirAcessoProjeto_(u, d.id_projeto);
  prepararAbasExtrato_();
  const idp = d.id_projeto;
  const proj = buscar_('PROJETOS', 'id_projeto', idp) || {};
  const imps = ler_('IMPORTACOES_EXTRATO').filter(x => x.id_projeto === idp && x.competencia);
  const lancs = ler_('EXTRATO').filter(x => x.id_projeto === idp).map(x => Object.assign({}, x, { data: ymdExt_(x.data), competencia: compExt_(x.competencia) }));
  const pags = ler_('PAGAMENTOS').filter(g => g.id_projeto === idp);
  const docs = {};
  ler_('DOCUMENTOS').filter(x => x.id_projeto === idp).forEach(x => { docs[x.id_documento] = x; });
  const inicio = inicioProjetoExt_(idp, pags, lancs);

  // Meses: do início da vigência (ou 1º pagamento / 1º extrato) até o mês atual
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM');
  let primeiro = compExt_(proj.inicio_vigencia) || '';
  [inicio.slice(0, 7)].concat(imps.map(x => compExt_(x.competencia))).forEach(m => { if (m && (!primeiro || m < primeiro)) primeiro = m; });
  if (!/^\d{4}-\d{2}$/.test(primeiro) || primeiro > hoje) primeiro = hoje;
  const meses = [];
  for (let m = primeiro; m <= hoje && meses.length < 120; m = somaMes_(m, 1)) meses.push(m);
  imps.forEach(x => { const m = compExt_(x.competencia); if (meses.indexOf(m) === -1) meses.push(m); });
  meses.sort();

  const porMes = meses.map(m => {
    const arq = {};
    imps.filter(x => compExt_(x.competencia) === m).forEach(x => {
      const doc = docs[x.id_documento] || {};
      arq[x.conta + '_' + x.formato] = { id_importacao: x.id_importacao, url: doc.url || '', nome: x.nome_arquivo,
        qtd: Number(x.qtd_lancamentos || 0), erro: x.erro_leitura || '', sem_movimento: x.sem_movimento === true, enviado_em: ymdExt_(x.importado_em) };
    });
    const ls = lancs.filter(l => l.competencia === m);
    const cc = ls.filter(l => l.conta === 'CC');
    const pagsMes = pags.filter(g => ymdExt_(g.data_debito_conta || g.data_pagamento).slice(0, 7) === m);
    const soma = (arr, f) => r2e_(arr.filter(f).reduce((s, l) => s + Number(l.valor || 0), 0));
    const depoisInicio = l => inicio && l.data >= inicio;
    return {
      mes: m, arquivos: arq, tem_lancamentos: ls.length > 0,
      pagamentos: pagsMes.length, conciliados: pagsMes.filter(g => g.id_lancamento_extrato).length,
      saidas_sem_pagamento: cc.filter(l => l.natureza === 'D' && CATEG_SAIDA_PAGTO_.indexOf(l.categoria) > -1 && !l.id_pagamento && !l.observacao_conferencia).length,
      tarifas: soma(cc.concat(ls.filter(l => l.conta === 'POUP')), l => l.categoria === 'Tarifa bancária' && depoisInicio(l)),
      tarifas_antes: soma(ls, l => l.categoria === 'Tarifa bancária' && !depoisInicio(l)),
      estornos: soma(ls, l => l.categoria === 'Estorno de tarifa'),
      rendimentos: soma(ls, l => l.categoria === 'Rendimento'),
      rendimentos_poupanca: soma(ls, l => l.categoria === 'Rendimento' && l.conta === 'POUP'),
      rendimentos_aplicacao: soma(ls, l => l.categoria === 'Rendimento' && l.conta === 'APLIC'),
      ir_iof: soma(ls, l => l.categoria === 'IR/IOF da aplicação'),
      saldo_poupanca: (imps.find(x => compExt_(x.competencia) === m && x.conta === 'POUP') || {}).saldo_final,
      saldo_aplicacao: (imps.find(x => compExt_(x.competencia) === m && x.conta === 'APLIC') || {}).saldo_final
    };
  });
  const tarifas = lancs.filter(l => l.categoria === 'Tarifa bancária' || l.categoria === 'Estorno de tarifa')
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(l => ({ id_lancamento: l.id_lancamento, data: l.data, conta: l.conta, historico: l.historico, detalhe: l.detalhe || '',
      valor: r2e_(l.valor), categoria: l.categoria, conta_no_controle: l.categoria === 'Estorno de tarifa' || (inicio && l.data >= inicio) }));
  const cobradas = r2e_(tarifas.filter(t => t.categoria === 'Tarifa bancária' && t.conta_no_controle).reduce((s, t) => s + t.valor, 0));
  const devolvidas = r2e_(tarifas.filter(t => t.categoria === 'Estorno de tarifa').reduce((s, t) => s + t.valor, 0));
  return {
    projeto: { id_projeto: idp, sigla: proj.sigla || '', nome_projeto: proj.nome_projeto || '', banco: proj.banco || '',
      agencia: textoDeData_(proj.agencia), conta: textoDeData_(proj.conta_corrente || proj.conta) },
    projetos: projetosPermitidos_(u).map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto })),
    meses: porMes.reverse(),
    inicio_controle: inicio,
    taxas: { cobradas: cobradas, devolvidas: devolvidas, a_ressarcir: r2e_(cobradas - devolvidas), lista: tarifas },
    tem_aplicacao: imps.some(x => x.conta === 'APLIC'),
    conciliacao: { pagamentos: pags.length, conciliados: pags.filter(g => g.id_lancamento_extrato).length },
    pode_anexar: PERFIS_EXTRATO.indexOf(u.perfil) > -1,
    pode_conciliar: PERFIS_CONFERENCIA.indexOf(u.perfil) > -1,
    categorias: CATEGORIAS_EXT
  };
}

// ---------------------------------------------------------------------------
// Anexar extrato (arquivo + lançamentos lidos no navegador)

function anexarExtrato_(u, d) {
  exigirPerfil_(u, PERFIS_EXTRATO);
  exigirAcessoProjeto_(u, d.id_projeto);
  prepararAbasExtrato_();
  const conta = ['POUP', 'APLIC'].indexOf(d.conta) > -1 ? d.conta : 'CC';
  const formato = d.formato === 'OFX' ? 'OFX' : 'PDF';
  const comp = String(d.competencia || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(comp)) throw new Error('Informe o mês do extrato.');
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione o arquivo do extrato.');
  const leitura = d.leitura || {};
  const lidos = (leitura.lancamentos || []).filter(l => l && l.data && !/^saldo (anterior|do dia|atual|total|final|bruto)/i.test(String(l.historico || '').trim()));

  // Arquivo no Drive (substitui o anterior do mesmo mês/conta/formato)
  const rotConta = conta === 'CC' ? 'conta corrente' : conta === 'POUP' ? 'poupança' : 'aplicação';
  const ext = formato === 'OFX' ? '.ofx' : '.pdf';
  const nome = 'Extrato ' + rotConta + ' ' + comp + (formato === 'OFX' ? ' (OFX)' : '') + ext;
  const pasta = subpastaProjeto_(d.id_projeto, '03 Extratos bancários');
  const anterior = ler_('IMPORTACOES_EXTRATO').find(x => x.id_projeto === d.id_projeto && compExt_(x.competencia) === comp && x.conta === conta && x.formato === formato);
  const arq = Object.assign({}, d.arquivo, { nome: nome, nome_original: d.arquivo.nome,
    mime: formato === 'OFX' ? 'application/x-ofx' : (d.arquivo.mime || 'application/pdf') });
  const bytes = Utilities.base64Decode(arq.base64);
  const file = pasta.createFile(Utilities.newBlob(bytes, arq.mime, nome));
  const doc = inserir_('DOCUMENTOS', { id_projeto: d.id_projeto, id_contratacao: '', tipo: 'Extrato bancário', nome_arquivo: nome,
    nome_original: d.arquivo.nome || '', drive_file_id: file.getId(), url: file.getUrl(), mime_type: arq.mime,
    enviado_por: u.id_usuario, enviado_em: new Date() });
  const campos = { id_projeto: d.id_projeto, nome_arquivo: nome, id_documento: doc.id_documento, competencia: comp, conta: conta, formato: formato,
    periodo_inicio: comp + '-01', periodo_fim: '', saldo_inicial: leitura.saldo_anterior === '' ? '' : leitura.saldo_anterior,
    saldo_final: leitura.saldo_final === '' ? '' : leitura.saldo_final, qtd_lancamentos: lidos.length,
    erro_leitura: lidos.length || (leitura.sem_movimento && !leitura.erro) ? '' : (leitura.erro || 'Nenhum lançamento lido no arquivo'),
    sem_movimento: !lidos.length && !!leitura.sem_movimento && !leitura.erro, agencia_conta: texto_(leitura.agencia_conta || ''),
    importado_em: new Date(), importado_por: u.id_usuario };
  let idImp;
  if (anterior) {
    const docAnt = buscar_('DOCUMENTOS', 'id_documento', anterior.id_documento);
    if (docAnt) { try { DriveApp.getFileById(docAnt.drive_file_id).setTrashed(true); } catch (e) {} }
    atualizar_('IMPORTACOES_EXTRATO', anterior._linha, campos);
    idImp = anterior.id_importacao;
  } else idImp = inserir_('IMPORTACOES_EXTRATO', campos).id_importacao;

  // Lançamentos: OFX manda; PDF só vale se não houver OFX da mesma conta no mês
  const temOfx = ler_('IMPORTACOES_EXTRATO').some(x => x.id_projeto === d.id_projeto && compExt_(x.competencia) === comp && x.conta === conta && x.formato === 'OFX');
  let resumo = { lancamentos: lidos.length, usados: false };
  if ((lidos.length || campos.sem_movimento) && (formato === 'OFX' || !temOfx)) {
    substituirLancamentos_(u, d.id_projeto, comp, conta, idImp, lidos);
    resumo.usados = true;
    resumo.conciliados = conciliarProjeto_(d.id_projeto);
  }
  registrarAuditoria_(u.id_usuario, 'IMPORTACOES_EXTRATO', idImp, anterior ? 'substituir' : 'anexar', null,
    { competencia: comp, conta: conta, formato: formato, lancamentos: lidos.length });
  const r = obterExtratos_(u, { id_projeto: d.id_projeto });
  r.resumo_importacao = resumo;
  return r;
}

/** Troca os lançamentos de um mês/conta mantendo categorias manuais, ligações e observações (pela chave). */
function substituirLancamentos_(u, idProjeto, comp, conta, idImp, lidos) {
  const antigos = ler_('EXTRATO').filter(x => x.id_projeto === idProjeto && compExt_(x.competencia) === comp && x.conta === conta);
  const guard = {};
  antigos.forEach(x => { (guard[x.chave] = guard[x.chave] || []).push(x); });
  const novos = [], cont = {};
  lidos.forEach(l => {
    const base = chaveExt_(l);
    cont[base] = (cont[base] || 0) + 1;
    const chave = base + '|' + cont[base];
    const velho = (guard[chave] || []).shift();
    const categoriaAuto = conta === 'APLIC' && CATEGORIAS_EXT.indexOf(l.categoria) > -1 ? l.categoria : categorizarExt_(l, conta);
    novos.push({ velho: velho, obj: {
      id_projeto: idProjeto, id_importacao: idImp, competencia: comp, conta: conta, data: l.data, data_base: l.data_base || '',
      historico: String(l.historico || '').trim(), detalhe: String(l.detalhe || '').trim(), documento: texto_(l.documento || ''),
      valor: r2e_(l.valor), natureza: l.natureza === 'D' ? 'D' : 'C', saldo: '', chave: chave,
      categoria: velho && velho.categoria_manual === true ? velho.categoria : categoriaAuto,
      categoria_manual: !!(velho && velho.categoria_manual === true),
      id_pagamento: velho ? (velho.id_pagamento || '') : '', conciliado: velho ? (velho.conciliado || '') : '',
      observacao_conferencia: velho ? (velho.observacao_conferencia || '') : '',
      conferido_por: velho ? (velho.conferido_por || '') : '', conferido_em: velho ? (velho.conferido_em || '') : ''
    } });
  });
  // Remove os antigos e grava os novos de uma vez
  const idsAntigos = {};
  antigos.forEach(x => { idsAntigos[x.id_lancamento] = true; });
  if (antigos.length) excluirLinhasExt_('EXTRATO', antigos.map(x => x._linha));
  const novoIdPorVelho = {};
  inserirVariosExt_('EXTRATO', novos.map(n => n.obj));
  novos.forEach(n => { if (n.velho) novoIdPorVelho[n.velho.id_lancamento] = n.obj.id_lancamento; });
  // Pagamentos que apontavam para lançamentos antigos
  ler_('PAGAMENTOS').filter(g => g.id_projeto === idProjeto && idsAntigos[g.id_lancamento_extrato]).forEach(g => {
    const novo = novoIdPorVelho[g.id_lancamento_extrato] || '';
    atualizar_('PAGAMENTOS', g._linha, { id_lancamento_extrato: novo, conciliado: !!novo });
  });
}

function excluirExtrato_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  prepararAbasExtrato_();
  const imp = buscar_('IMPORTACOES_EXTRATO', 'id_importacao', d.id_importacao);
  if (!imp) throw new Error('Extrato não encontrado.');
  exigirAcessoProjeto_(u, imp.id_projeto);
  const comp = compExt_(imp.competencia);
  const doc = buscar_('DOCUMENTOS', 'id_documento', imp.id_documento);
  if (doc) { try { DriveApp.getFileById(doc.drive_file_id).setTrashed(true); } catch (e) {} excluirLinhas_('DOCUMENTOS', [doc._linha]); }
  excluirLinhas_('IMPORTACOES_EXTRATO', [buscar_('IMPORTACOES_EXTRATO', 'id_importacao', d.id_importacao)._linha]);
  // Lançamentos: se este arquivo era a fonte, refaz a partir do outro formato (se houver) ou apaga
  const lancs = ler_('EXTRATO').filter(x => x.id_importacao === imp.id_importacao);
  if (lancs.length) {
    const ids = {};
    lancs.forEach(x => { ids[x.id_lancamento] = true; });
    ler_('PAGAMENTOS').filter(g => ids[g.id_lancamento_extrato]).forEach(g => atualizar_('PAGAMENTOS', g._linha, { id_lancamento_extrato: '', conciliado: false }));
    excluirLinhasExt_('EXTRATO', ler_('EXTRATO').filter(x => ids[x.id_lancamento]).map(x => x._linha));
  }
  registrarAuditoria_(u.id_usuario, 'IMPORTACOES_EXTRATO', imp.id_importacao, 'exclusao', limpar_(imp), null);
  const r = obterExtratos_(u, { id_projeto: imp.id_projeto });
  r.aviso = lancs.length && ler_('IMPORTACOES_EXTRATO').some(x => x.id_projeto === imp.id_projeto && compExt_(x.competencia) === comp && x.conta === imp.conta)
    ? 'Os lançamentos deste mês saíram junto. Anexe o arquivo de novo (PDF ou OFX) para ler outra vez.' : '';
  return r;
}

// ---------------------------------------------------------------------------
// Conciliação automática

function tokensNome_(s) {
  const fora = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, ltda: 1, me: 1, mei: 1, eireli: 1, sa: 1, epp: 1, pix: 1, enviado: 1, ted: 1, doc: 1, transf: 1 };
  return semAcentoExt_(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !fora[t]);
}
function diasEntre_(a, b) { return Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000); }

/** Liga saídas da conta corrente aos pagamentos lançados. Retorna quantas ligações novas fez. */
function conciliarProjeto_(idProjeto) {
  const ix = nomesPorPagamento_(idProjeto);
  const lancs = ler_('EXTRATO').filter(l => l.id_projeto === idProjeto && l.conta === 'CC' && l.natureza === 'D' &&
    CATEG_SAIDA_PAGTO_.indexOf(l.categoria) > -1 && !l.id_pagamento);
  const pags = ler_('PAGAMENTOS').filter(g => g.id_projeto === idProjeto && !g.id_lancamento_extrato && (g.data_debito_conta || g.data_pagamento));
  const pares = [];
  lancs.forEach(l => {
    const dl = ymdExt_(l.data), tl = tokensNome_(l.detalhe + ' ' + l.historico);
    pags.forEach(g => {
      const r = rotuloPagamento_(g, ix);
      if (Math.abs(r2e_(l.valor) - r.valor) > 0.009) return;
      const dias = diasEntre_(dl, r.data);
      if (dias > 7) return;
      const tn = tokensNome_(r.contratado + ' ' + r.representante);
      const nome = tl.filter(t => tn.indexOf(t) > -1).length;
      pares.push({ l: l, g: g, dias: dias, nome: nome });
    });
  });
  // candidatos por lado (para decidir quando não há nome que desempate)
  const nL = {}, nG = {};
  pares.forEach(p => { nL[p.l.id_lancamento] = (nL[p.l.id_lancamento] || 0) + 1; nG[p.g.id_pagamento] = (nG[p.g.id_pagamento] || 0) + 1; });
  pares.sort((a, b) => b.nome - a.nome || a.dias - b.dias);
  const usadosL = {}, usadosG = {};
  let feitas = 0;
  pares.forEach(p => {
    if (usadosL[p.l.id_lancamento] || usadosG[p.g.id_pagamento]) return;
    const unico = nL[p.l.id_lancamento] === 1 && nG[p.g.id_pagamento] === 1;
    if (!(p.nome > 0 || unico)) return;
    usadosL[p.l.id_lancamento] = usadosG[p.g.id_pagamento] = true;
    atualizar_('EXTRATO', p.l._linha, { id_pagamento: p.g.id_pagamento, conciliado: 'auto', categoria: 'Pagamento' });
    atualizar_('PAGAMENTOS', p.g._linha, { id_lancamento_extrato: p.l.id_lancamento, conciliado: true });
    feitas++;
  });
  return feitas;
}

// ---------------------------------------------------------------------------
// Tela de conciliação do mês

function obterConciliacao_(u, d) {
  exigirAcessoProjeto_(u, d.id_projeto);
  prepararAbasExtrato_();
  const idp = d.id_projeto, comp = String(d.competencia || '').slice(0, 7);
  const ix = nomesPorPagamento_(idp);
  const pags = ler_('PAGAMENTOS').filter(g => g.id_projeto === idp);
  const pagPorId = {};
  pags.forEach(g => { pagPorId[g.id_pagamento] = g; });
  const lancs = ler_('EXTRATO').filter(l => l.id_projeto === idp && compExt_(l.competencia) === comp)
    .sort((a, b) => (a.conta + ymdExt_(a.data)).localeCompare(b.conta + ymdExt_(b.data)));
  const lancPorId = {};
  ler_('EXTRATO').filter(l => l.id_projeto === idp).forEach(l => { lancPorId[l.id_lancamento] = l; });
  const desc = g => { const r = rotuloPagamento_(g, ix); return Object.assign({ id_pagamento: g.id_pagamento, id_parcela: g.id_parcela }, r); };
  return {
    competencia: comp,
    lancamentos: lancs.map(l => ({ id_lancamento: l.id_lancamento, conta: l.conta, data: ymdExt_(l.data), historico: l.historico, detalhe: l.detalhe || '',
      documento: String(l.documento || ''), valor: r2e_(l.valor), natureza: l.natureza, categoria: l.categoria, categoria_manual: l.categoria_manual === true,
      conciliado: l.conciliado || '', observacao: l.observacao_conferencia || '',
      pagamentos: String(l.id_pagamento || '').split(',').filter(Boolean).map(id => pagPorId[id] ? desc(pagPorId[id]) : { id_pagamento: id, contratado: '(pagamento excluído)' }) })),
    pagamentos_mes: pags.filter(g => ymdExt_(g.data_debito_conta || g.data_pagamento).slice(0, 7) === comp).map(g => {
      const l = lancPorId[g.id_lancamento_extrato];
      return Object.assign(desc(g), { lancamento: l ? { data: ymdExt_(l.data), historico: l.historico, detalhe: l.detalhe || '', competencia: compExt_(l.competencia) } : null });
    }),
    livres: pags.filter(g => !g.id_lancamento_extrato).map(desc).sort((a, b) => a.data.localeCompare(b.data)),
    // Parcelas que ainda não têm pagamento registrado no sistema (dá para registrar a partir da saída do extrato)
    abertas: (() => {
      const comPag = {};
      pags.forEach(g => { comPag[g.id_parcela] = true; });
      const ctrOk = {};
      ler_('CONTRATACOES').forEach(c => { if (c.id_projeto === idp && c.status !== 'Cancelada') ctrOk[c.id_contratacao] = c; });
      return ler_('PARCELAS').filter(p => p.id_projeto === idp && ctrOk[p.id_contratacao] && !comPag[p.id_parcela])
        .map(p => { const c = ctrOk[p.id_contratacao], f = ix.forn[c.id_fornecedor] || {};
          return { id_parcela: p.id_parcela, contratado: f.razao_social || '', parcela: p.num_parcela + (c.num_parcelas ? '/' + c.num_parcelas : ''),
            valor: r2e_(p.valor_previsto), competencia: compExt_(p.competencia), status: p.status }; })
        .sort((a, b) => a.competencia.localeCompare(b.competencia));
    })(),
    pode_conciliar: PERFIS_CONFERENCIA.indexOf(u.perfil) > -1,
    categorias: CATEGORIAS_EXT
  };
}

function lancamentoComAcesso_(u, id) {
  const l = buscar_('EXTRATO', 'id_lancamento', id);
  if (!l) throw new Error('Lançamento não encontrado.');
  exigirAcessoProjeto_(u, l.id_projeto);
  return l;
}

/** Liga um lançamento a um ou mais pagamentos (ex.: um PIX que pagou duas parcelas). ids vazio = desfazer. */
function ligarLancamento_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  const l = lancamentoComAcesso_(u, d.id_lancamento);
  const ids = (d.ids_pagamento || []).filter(Boolean);
  // Parcela ainda sem pagamento no sistema: registra o pagamento com a data e o valor do extrato
  (d.ids_parcela || []).filter(Boolean).forEach((idParc, i, arr) => {
    const p = buscar_('PARCELAS', 'id_parcela', idParc);
    if (!p || p.id_projeto !== l.id_projeto) throw new Error('Parcela não encontrada neste projeto.');
    if (ler_('PAGAMENTOS').some(g => g.id_parcela === idParc)) throw new Error('Esta parcela já tem pagamento registrado. Atualize a tela.');
    const dataL = paraData_(ymdExt_(l.data));
    const novo = inserir_('PAGAMENTOS', { id_parcela: idParc, id_projeto: l.id_projeto,
      forma_pagamento: /pix/i.test(l.historico) ? 'PIX' : /\bted\b/i.test(l.historico) ? 'TED' : /\bdoc\b/i.test(l.historico) ? 'DOC'
        : /boleto|cobran|t[íi]tulo/i.test(l.historico) ? 'Boleto' : /transf/i.test(l.historico) ? 'Transferência' : 'PIX',
      data_pagamento: dataL, data_debito_conta: dataL, valor: arr.length === 1 ? r2e_(l.valor) : r2e_(p.valor_previsto),
      pago_por: u.id_usuario, registrado_em: new Date() });
    if (idxStatus_(p.status) < idxStatus_('Paga')) atualizar_('PARCELAS', p._linha, { status: 'Paga' });
    registrarAuditoria_(u.id_usuario, 'PAGAMENTOS', idParc, 'registrar_pelo_extrato', null, { lancamento: l.id_lancamento, valor: l.valor });
    ids.push(novo.id_pagamento);
  });
  // desfaz as ligações atuais
  String(l.id_pagamento || '').split(',').filter(Boolean).forEach(id => {
    const g = buscar_('PAGAMENTOS', 'id_pagamento', id);
    if (g && g.id_lancamento_extrato === l.id_lancamento) atualizar_('PAGAMENTOS', g._linha, { id_lancamento_extrato: '', conciliado: false });
  });
  ids.forEach(id => {
    const g = buscar_('PAGAMENTOS', 'id_pagamento', id);
    if (!g || g.id_projeto !== l.id_projeto) throw new Error('Pagamento não encontrado neste projeto.');
    if (g.id_lancamento_extrato && g.id_lancamento_extrato !== l.id_lancamento) {
      const outro = buscar_('EXTRATO', 'id_lancamento', g.id_lancamento_extrato);
      if (outro) atualizar_('EXTRATO', outro._linha, { id_pagamento: String(outro.id_pagamento || '').split(',').filter(x => x && x !== id).join(','), conciliado: '' });
    }
    atualizar_('PAGAMENTOS', buscar_('PAGAMENTOS', 'id_pagamento', id)._linha, { id_lancamento_extrato: l.id_lancamento, conciliado: true });
  });
  const campos = { id_pagamento: ids.join(','), conciliado: ids.length ? 'manual' : '', conferido_por: u.id_usuario, conferido_em: new Date() };
  if (ids.length) { campos.categoria = 'Pagamento'; }
  atualizar_('EXTRATO', buscar_('EXTRATO', 'id_lancamento', l.id_lancamento)._linha, campos);
  registrarAuditoria_(u.id_usuario, 'EXTRATO', l.id_lancamento, ids.length ? 'conciliar' : 'desconciliar', { id_pagamento: l.id_pagamento }, { id_pagamento: ids.join(',') });
  return obterConciliacao_(u, { id_projeto: l.id_projeto, competencia: compExt_(l.competencia) });
}

/** Troca a categoria e/ou a observação (justificativa) de um lançamento. */
function classificarLancamento_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  const l = lancamentoComAcesso_(u, d.id_lancamento);
  const campos = { conferido_por: u.id_usuario, conferido_em: new Date() };
  if (d.categoria !== undefined) {
    if (CATEGORIAS_EXT.indexOf(d.categoria) === -1) throw new Error('Categoria inválida.');
    campos.categoria = d.categoria; campos.categoria_manual = true;
    if (d.categoria !== 'Pagamento' && l.id_pagamento) {
      String(l.id_pagamento).split(',').filter(Boolean).forEach(id => {
        const g = buscar_('PAGAMENTOS', 'id_pagamento', id);
        if (g && g.id_lancamento_extrato === l.id_lancamento) atualizar_('PAGAMENTOS', g._linha, { id_lancamento_extrato: '', conciliado: false });
      });
      campos.id_pagamento = ''; campos.conciliado = '';
    }
  }
  if (d.observacao !== undefined) campos.observacao_conferencia = String(d.observacao || '').trim();
  atualizar_('EXTRATO', l._linha, campos);
  registrarAuditoria_(u.id_usuario, 'EXTRATO', l.id_lancamento, 'classificar', { categoria: l.categoria, observacao: l.observacao_conferencia }, campos);
  return obterConciliacao_(u, { id_projeto: l.id_projeto, competencia: compExt_(l.competencia) });
}

function conciliarAgora_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  exigirAcessoProjeto_(u, d.id_projeto);
  prepararAbasExtrato_();
  const n = conciliarProjeto_(d.id_projeto);
  const r = d.competencia ? obterConciliacao_(u, d) : obterExtratos_(u, d);
  r.novas = n;
  return r;
}

// ===========================================================================
// Extratos do mês (tela reformulada): cada instituição anexa, por mês, o PDF da conta corrente, da poupança
// e do BB Rende Fácil (opcional). É o mesmo arquivo da Prestação SIT (aba DOCUMENTOS, tipo "Extrato SIT"),
// então aparece sozinho no bimestre correspondente, com o nome padrão.
// O navegador lê o PDF e manda as taxas cobradas (tarifa Pix, cesta, pacote…), estornos, saldo e rendimentos;
// isso fica na aba TAXAS_EXTRATO (uma linha por projeto e mês). As taxas ressarcidas são informadas à mão.

const ABA_TAXAS_EXT = 'TAXAS_EXTRATO';
const COLS_TAXAS_EXT = ['id_taxa', 'id_projeto', 'mes', 'leitura_CC', 'leitura_APLIC', 'leitura_RENDE',
  'taxas_ajuste', 'taxas_ressarcidas', 'observacoes', 'atualizado_em', 'atualizado_por'];

/** Cria a aba TAXAS_EXTRATO (com cabeçalho) na primeira vez e registra o prefixo do ID (TAX-0001). */
function garantirAbaTaxas_() {
  if (typeof PREFIXOS !== 'undefined' && !PREFIXOS[ABA_TAXAS_EXT]) PREFIXOS[ABA_TAXAS_EXT] = 'TAX';
  if (typeof ESTRUTURA !== 'undefined' && !ESTRUTURA[ABA_TAXAS_EXT]) ESTRUTURA[ABA_TAXAS_EXT] = COLS_TAXAS_EXT;
  return aba_(ABA_TAXAS_EXT);
}
const TIPOS_EXTRATO_MES = ['CC', 'APLIC', 'RENDE'];          // conta corrente · poupança · BB Rende Fácil

function linhasTaxasExt_(idp) {
  try { return ler_(ABA_TAXAS_EXT).filter(x => x.id_projeto === idp); } catch (e) { return []; }
}
function jsonExt_(v) { if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
function numOuVazioExt_(v) { return v === '' || v === null || v === undefined ? '' : r2e_(paraNumero_(v)); }

/** Grava (ou apaga, com leitura === false) o que foi lido do extrato de um tipo no mês. leitura null = arquivo sem leitura. */
function gravarLeituraExtrato_(u, idp, ym, tipo, leitura) {
  if (TIPOS_EXTRATO_MES.indexOf(tipo) === -1) return;
  garantirAbaTaxas_();
  const atual = linhasTaxasExt_(idp).find(x => ymDe_(x.mes) === ym);
  let valor = '';
  if (leitura) {
    const l = leitura, linhas = (l.linhas || []).slice(0, 200).map(x => ({ data: String(x.data || '').slice(0, 10),
      historico: String(x.historico || '').slice(0, 120), valor: r2e_(x.valor) }));
    valor = JSON.stringify({ lido: !!l.lido, erro: String(l.erro || '').slice(0, 200),
      taxas: l.lido ? r2e_(l.taxas) : '', linhas: linhas,
      estornos: r2e_(l.estornos), saldo_final: numOuVazioExt_(l.saldo_final),
      rendimento_bruto: numOuVazioExt_(l.rendimento_bruto), ir_iof: numOuVazioExt_(l.ir_iof),
      comp_lida: String(l.competencia || '').slice(0, 7), conta_lida: String(l.conta || '').slice(0, 5),
      lido_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd') });
  } else if (leitura === null) {
    valor = JSON.stringify({ lido: false, pendente: true, erro: 'Ainda não lido.' });
  }
  const campos = {}; campos['leitura_' + tipo] = valor;
  campos.atualizado_em = new Date(); campos.atualizado_por = u.id_usuario;
  if (atual) atualizar_(ABA_TAXAS_EXT, atual._linha, campos);
  else if (valor) inserir_(ABA_TAXAS_EXT, Object.assign({ id_projeto: idp, mes: ym }, campos));
}

function obterExtratosMes_(u, d) {
  const projetos = projetosPermitidos_(u).map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto }));
  const idp = d.id_projeto || (projetos[0] || {}).id_projeto;
  if (!idp) return { projetos: projetos, meses: [] };
  exigirAcessoProjeto_(u, idp);
  const proj = buscar_('PROJETOS', 'id_projeto', idp) || {};
  const linhas = linhasTaxasExt_(idp);
  const docs = ler_('DOCUMENTOS').filter(x => x.id_projeto === idp && x.tipo === TIPO_DOC_EXTRATO_SIT);

  // Meses: do início da vigência (ou do 1º extrato anexado) até o mês atual
  const hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM');
  let primeiro = compExt_(proj.inicio_vigencia) || '';
  docs.map(x => ymDe_(x.competencia)).concat(linhas.map(x => ymDe_(x.mes))).forEach(m => { if (/^\d{4}-\d{2}$/.test(m) && (!primeiro || m < primeiro)) primeiro = m; });
  if (!/^\d{4}-\d{2}$/.test(primeiro) || primeiro > hoje) primeiro = hoje;
  const lista = [];
  for (let m = primeiro; m <= hoje && lista.length < 120; m = somaMes_(m, 1)) lista.push(m);
  const anexos = anexosExtratoSIT_(idp, lista);

  let cobradas = 0, ressarcidas = 0, pendentes = 0, semLeitura = 0, aLerTotal = 0;
  const meses = lista.map(m => {
    const lin = linhas.find(x => ymDe_(x.mes) === m) || {};
    const lei = {}; TIPOS_EXTRATO_MES.forEach(t => { const j = jsonExt_(lin['leitura_' + t]); if (j && (anexos[m] || {})[t]) lei[t] = j; });
    const lidas = r2e_(TIPOS_EXTRATO_MES.reduce((s, t) => s + (lei[t] && lei[t].lido ? Number(lei[t].taxas || 0) : 0), 0));
    const ajuste = lin.taxas_ajuste === '' || lin.taxas_ajuste === undefined || lin.taxas_ajuste === null ? '' : r2e_(lin.taxas_ajuste);
    const taxas = ajuste === '' ? lidas : ajuste;
    const ress = r2e_(lin.taxas_ressarcidas || 0);
    const a = anexos[m] || {};
    const temObrig = !!(a.CC || a.APLIC);
    // a_ler: anexado antes da leitura existir (ou sem leitura) — o navegador lê sozinho ao abrir a tela
    const aLer = TIPOS_EXTRATO_MES.filter(t => a[t] && (!lei[t] || lei[t].pendente));
    const naoLidos = TIPOS_EXTRATO_MES.filter(t => a[t] && lei[t] && !lei[t].lido && !lei[t].pendente);
    const contaEsp = { CC: 'CC', APLIC: 'POUP', RENDE: 'APLIC' };
    const alertas = {};
    TIPOS_EXTRATO_MES.forEach(t => {
      const j = lei[t]; if (!j || !j.lido) return;
      const al = [];
      if (j.comp_lida && j.comp_lida !== m) al.push('o PDF parece ser de ' + j.comp_lida.slice(5, 7) + '/' + j.comp_lida.slice(0, 4));
      if (j.conta_lida && j.conta_lida !== contaEsp[t]) al.push('o PDF parece ser de ' + ({ CC: 'conta corrente', POUP: 'poupança', APLIC: 'Rende Fácil' }[j.conta_lida] || j.conta_lida));
      if (al.length) alertas[t] = al.join(' e ');
    });
    if (!temObrig && m < hoje) pendentes++;
    if (naoLidos.length && ajuste === '') semLeitura++;
    aLerTotal += aLer.length;
    cobradas += taxas; ressarcidas += ress;
    return {
      mes: m, em_andamento: m === hoje, anexos: a, leituras: lei, nao_lidos: naoLidos, a_ler: aLer, alertas: alertas,
      taxas_lidas: lidas, taxas_ajuste: ajuste, taxas: r2e_(taxas), taxas_ressarcidas: ress,
      estornos_lidos: r2e_(TIPOS_EXTRATO_MES.reduce((s, t) => s + (lei[t] ? Number(lei[t].estornos || 0) : 0), 0)),
      observacoes: lin.observacoes || '',
      linhas_taxa: TIPOS_EXTRATO_MES.reduce((arr, t) => arr.concat(((lei[t] || {}).linhas || []).map(x => Object.assign({ conta: t }, x))), [])
    };
  });
  return {
    projeto: { id_projeto: idp, sigla: proj.sigla || '', nome_projeto: proj.nome_projeto || '', banco: proj.banco || '',
      agencia: textoDeData_(proj.agencia), conta: textoDeData_(proj.conta_corrente), termo: proj.termo_fomento_cit || '' },
    projetos: projetos,
    meses: meses.reverse(),
    totais: { cobradas: r2e_(cobradas), ressarcidas: r2e_(ressarcidas), a_ressarcir: r2e_(cobradas - ressarcidas), pendentes: pendentes, sem_leitura: semLeitura, a_ler: aLerTotal },
    pode_editar: PERFIS_EXTRATO.indexOf(u.perfil) > -1
  };
}

function anexarExtratoMes_(u, d) {
  exigirPerfil_(u, PERFIS_EXTRATO);
  if (TIPOS_EXTRATO_MES.indexOf(String(d.tipo || '')) === -1) throw new Error('Tipo de extrato inválido.');
  gravarExtratoMes_(u, d);
  return obterExtratosMes_(u, { id_projeto: d.id_projeto });
}

function excluirExtratoMes_(u, d) {
  exigirPerfil_(u, PERFIS_EXTRATO);
  const x = buscar_('DOCUMENTOS', 'id_documento', d.id_documento);
  if (!x || x.tipo !== TIPO_DOC_EXTRATO_SIT) throw new Error('Extrato não encontrado.');
  apagarExtratoMes_(u, d);
  return obterExtratosMes_(u, { id_projeto: x.id_projeto });
}

/** Taxas ressarcidas, ajuste manual das taxas cobradas (quando a leitura não pegou) e observação do mês. */
function salvarTaxasMes_(u, d) {
  exigirPerfil_(u, PERFIS_EXTRATO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const ym = String(d.mes || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('Mês inválido.');
  garantirAbaTaxas_();
  const campos = { atualizado_em: new Date(), atualizado_por: u.id_usuario };
  if (d.taxas_ressarcidas !== undefined) campos.taxas_ressarcidas = numOuVazioExt_(d.taxas_ressarcidas);
  if (d.taxas_ajuste !== undefined) campos.taxas_ajuste = numOuVazioExt_(d.taxas_ajuste);
  if (d.observacoes !== undefined) campos.observacoes = String(d.observacoes || '').slice(0, 500);
  const atual = linhasTaxasExt_(d.id_projeto).find(x => ymDe_(x.mes) === ym);
  if (atual) atualizar_(ABA_TAXAS_EXT, atual._linha, campos);
  else inserir_(ABA_TAXAS_EXT, Object.assign({ id_projeto: d.id_projeto, mes: ym }, campos));
  registrarAuditoria_(u.id_usuario, ABA_TAXAS_EXT, d.id_projeto + '|' + ym, 'taxas_mes', null, campos);
  return obterExtratosMes_(u, { id_projeto: d.id_projeto });
}

/** Grava a leitura feita no navegador de um extrato que já estava anexado (ex.: anexado pela Prestação SIT). */
function salvarLeituraExtrato_(u, d) {
  exigirPerfil_(u, PERFIS_EXTRATO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const ym = String(d.mes || '').slice(0, 7), tipo = String(d.tipo || '');
  if (!/^\d{4}-\d{2}$/.test(ym) || TIPOS_EXTRATO_MES.indexOf(tipo) === -1) throw new Error('Mês ou tipo de extrato inválido.');
  const tem = ler_('DOCUMENTOS').some(x => x.id_projeto === d.id_projeto && x.tipo === TIPO_DOC_EXTRATO_SIT && ymDe_(x.competencia) === ym && x.tipo_extrato === tipo);
  if (!tem) throw new Error('Extrato não encontrado.');
  gravarLeituraExtrato_(u, d.id_projeto, ym, tipo, d.leitura || { lido: false, erro: 'Não consegui ler o PDF.' });
  return obterExtratosMes_(u, { id_projeto: d.id_projeto });
}
