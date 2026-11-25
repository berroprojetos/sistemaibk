/**
 * Dados.gs – acesso às abas da planilha (leitura, inserção, atualização)
 * Toda leitura devolve objetos { coluna: valor } + _linha (nº da linha na aba).
 */

const CAMPOS_SENSIVEIS = ['senha_hash', 'salt', 'callmebot_apikey'];

// ---------------------------------------------------------------------------
// Desempenho
// 1) Memória da execução: cada aba é lida no máximo uma vez por chamada do sistema.
// 2) Cache entre chamadas (CacheService): o conteúdo da aba fica guardado com um "número de versão".
//    Toda gravação muda a versão da aba no fim da chamada (depois de gravar de fato), então
//    ninguém lê dado velho do cache. Edições feitas à mão na planilha também mudam a versão (onEdit),
//    e o cache expira sozinho em 10 minutos por segurança.
// 3) Antes de alterar/apagar uma linha usando dados que vieram do cache, confere se as linhas
//    da planilha ainda são as mesmas (proteção contra linhas inseridas/apagadas à mão).

const MEMO_ = {}, ABAS_ = {}, SUJAS_ = {}, CONFERIDAS_ = {};
let PLANILHA_ = null, PROPS_ = null, TUDO_SUJO_ = false;
const CACHE_TTL_ = 600;                       // segundos
const ABAS_SEM_CACHE_ = ['AUDITORIA', 'USUARIOS', 'LIXEIRA'];

function props_() {
  if (!PROPS_) PROPS_ = PropertiesService.getScriptProperties().getProperties();
  return PROPS_;
}
function versaoAba_(nome) {
  const p = props_();
  return (p.ver_global || '0') + '.' + (p['ver_' + nome] || '0');
}

/** Marca a aba como alterada: some da memória e terá nova versão no fim da chamada. */
let EM_REQUISICAO_ = false;                   // true dentro do doPost (o sistema web)
function invalidar_(nome) {
  if (nome) { delete MEMO_[nome]; SUJAS_[nome] = true; }
  else { Object.keys(MEMO_).forEach(k => delete MEMO_[k]); TUDO_SUJO_ = true; }
  // Rodando pelo menu da planilha/editor: muda a versão na hora (não há "fim de requisição")
  if (!EM_REQUISICAO_) finalizarGravacoes_();
}

/** Chamado no fim de cada requisição: grava de fato e muda a versão das abas alteradas. */
function finalizarGravacoes_() {
  const nomes = Object.keys(SUJAS_);
  if (!nomes.length && !TUDO_SUJO_) return;
  SpreadsheetApp.flush();
  const novo = {}, carimbo = String(Date.now()) + Math.floor(Math.random() * 1000);
  nomes.forEach(n => { novo['ver_' + n] = carimbo; });
  if (TUDO_SUJO_) novo.ver_global = carimbo;
  PropertiesService.getScriptProperties().setProperties(novo);
  Object.keys(novo).forEach(k => { if (PROPS_) PROPS_[k] = novo[k]; });
  nomes.forEach(n => delete SUJAS_[n]);
  TUDO_SUJO_ = false;
}

function codificar_(m) {
  return JSON.stringify({ cab: m.cab, val: m.val.map(l => l.map(v => Object.prototype.toString.call(v) === '[object Date]' ? { $d: v.getTime() } : v)) });
}
function decodificar_(txt) {
  const m = JSON.parse(txt);
  m.val = m.val.map(l => l.map(v => (v && typeof v === 'object' && v.$d !== undefined) ? new Date(v.$d) : v));
  return m;
}
function lerCacheAba_(nome) {
  try {
    const cache = CacheService.getScriptCache(), k = 'aba_' + nome + '_' + versaoAba_(nome);
    const n = Number(cache.get(k + '_n'));
    if (!n) return null;
    const chaves = []; for (let i = 0; i < n; i++) chaves.push(k + '_' + i);
    const partes = cache.getAll(chaves);
    let txt = '';
    for (let i = 0; i < n; i++) { if (partes[chaves[i]] === undefined) return null; txt += partes[chaves[i]]; }
    const m = decodificar_(txt);
    m.doCache = true;
    return m;
  } catch (e) { return null; }
}
function gravarCacheAba_(nome, m) {
  try {
    const txt = codificar_(m), k = 'aba_' + nome + '_' + versaoAba_(nome), TAM = 90000, obj = {};
    const n = Math.ceil(txt.length / TAM) || 1;
    if (n > 50) return;                                   // aba grande demais para o cache: lê sempre da planilha
    for (let i = 0; i < n; i++) obj[k + '_' + i] = txt.substr(i * TAM, TAM);
    obj[k + '_n'] = String(n);
    CacheService.getScriptCache().putAll(obj, CACHE_TTL_);
  } catch (e) {}
}

/**
 * Antes de alterar ou apagar uma linha com base em dados do cache, confere se a coluna de IDs
 * da planilha ainda é a mesma. Se alguém inseriu/apagou linhas à mão, para sem gravar nada.
 */
function conferirLinhas_(nome) {
  const m = MEMO_[nome];
  if (!m || !m.doCache || CONFERIDAS_[nome]) return;
  CONFERIDAS_[nome] = true;
  const sh = aba_(nome), n = m.val.length;
  if (!n) return;
  const ids = sh.getLastRow() >= 2 ? sh.getRange(2, 1, Math.min(n, sh.getLastRow() - 1), 1).getValues() : [];
  const igual = ids.length === n && ids.every((r, i) => String(r[0]) === String(m.val[i][0]));
  if (!igual) {
    invalidar_(nome);
    finalizarGravacoes_();
    throw new Error('A planilha foi alterada diretamente enquanto você trabalhava. Nada foi gravado — tente de novo.');
  }
}

function aba_(nome) {
  if (ABAS_[nome]) return ABAS_[nome];
  const ss = PLANILHA_ || (PLANILHA_ = SpreadsheetApp.getActiveSpreadsheet());
  let sh = ss.getSheetByName(nome);
  if (!sh && typeof ESTRUTURA !== 'undefined' && ESTRUTURA[nome]) {
    // Aba nova de uma atualização: cria sozinha com o cabeçalho
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]])
      .setFontWeight('bold').setBackground('#1f3b57').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  if (!sh) throw new Error('Aba não encontrada: ' + nome);
  ABAS_[nome] = sh;
  return sh;
}

function cabecalho_(sh) {
  const m = MEMO_[sh.getName()];
  if (m && m.cab.length) return m.cab.slice();
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function ler_(nome) {
  let m = MEMO_[nome];
  if (!m) {
    const usaCache = ABAS_SEM_CACHE_.indexOf(nome) === -1 && !SUJAS_[nome] && !TUDO_SUJO_;
    m = usaCache ? lerCacheAba_(nome) : null;
    if (!m) {
      const sh = aba_(nome);
      if (sh.getLastRow() < 2) m = { cab: [], val: [] };
      else {
        const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
        m = { cab: v.shift(), val: v };
      }
      if (usaCache) gravarCacheAba_(nome, m);
    }
    MEMO_[nome] = m;
  }
  const cab = m.cab;
  return m.val
    .map((linha, i) => {
      const o = { _linha: i + 2 };
      cab.forEach((c, j) => { if (c) o[c] = linha[j]; });
      return o;
    })
    .filter(o => o[cab[0]] !== '' && o[cab[0]] !== null);
}

function buscar_(nome, coluna, valor) {
  return ler_(nome).find(o => String(o[coluna]).trim() === String(valor).trim()) || null;
}

/**
 * Garante que todas as colunas usadas existem no cabeçalho da aba.
 * Se faltar alguma (ex.: setup não foi rodado depois de uma atualização),
 * ela é criada no fim, em vez de o dado ser descartado em silêncio.
 */
function garantirColunas_(sh, nomes) {
  let cab = cabecalho_(sh);
  const faltando = nomes.filter(n => n && n.charAt(0) !== '_' && cab.indexOf(n) === -1);
  if (faltando.length) {
    invalidar_(sh.getName());
    // A aba pode não ter colunas sobrando: cria as que faltam antes de escrever os títulos novos
    const precisa = cab.length + faltando.length - sh.getMaxColumns();
    if (precisa > 0) sh.insertColumnsAfter(sh.getMaxColumns(), precisa);
    sh.getRange(1, cab.length + 1, 1, faltando.length).setValues([faltando])
      .setFontWeight('bold').setBackground('#1f3b57').setFontColor('#ffffff');
    cab = cabecalho_(sh);
  }
  return cab;
}

/**
 * Primeira linha livre para gravar n linhas de uma vez. Se a aba não tiver linhas sobrando,
 * cria as que faltam (senão o Google acusa "coordenadas fora das dimensões da página").
 */
function linhaLivre_(sh, n) {
  const ini = sh.getLastRow() + 1;
  const falta = ini + (n || 1) - 1 - sh.getMaxRows();
  if (falta > 0) sh.insertRowsAfter(sh.getMaxRows(), falta);
  return ini;
}

function ehErroValidacao_(e) {
  return /valida/i.test(String(e && e.message));
}

/**
 * Listas suspensas antigas da planilha rejeitam valores novos (ex.: status "Conferida").
 * O Google só acusa o erro depois, ao gravar de fato, por isso o try/catch não basta.
 * Aqui, uma vez por aba em cada execução, as regras que REJEITAM passam a só AVISAR
 * (a lista suspensa continua aparecendo na planilha).
 */
const ABAS_VALIDACAO_OK_ = {};
function relaxarValidacoes_(sh) {
  const nome = sh.getName();
  if (ABAS_VALIDACAO_OK_[nome]) return;
  ABAS_VALIDACAO_OK_[nome] = true;
  // Basta fazer uma vez por aba (fica anotado nas propriedades do script)
  const chave = 'validacao_ok_' + nome;
  if (props_()[chave]) return;
  const props = PropertiesService.getScriptProperties();
  const linhas = sh.getMaxRows() - 1, cols = sh.getMaxColumns();
  if (linhas < 1 || cols < 1) return;
  const rg = sh.getRange(2, 1, linhas, cols);
  const regras = rg.getDataValidations();
  let mudou = false;
  const novas = regras.map(l => l.map(r => {
    if (r && !r.getAllowInvalid()) { mudou = true; return r.copy().setAllowInvalid(true).build(); }
    return r;
  }));
  if (mudou) rg.setDataValidations(novas);
  props.setProperty(chave, '1');
}

function inserir_(nome, obj) {
  const sh = aba_(nome);
  relaxarValidacoes_(sh);
  const cab = garantirColunas_(sh, Object.keys(obj));
  invalidar_(nome);
  if (!obj[cab[0]]) obj[cab[0]] = gerarId(nome);
  const linha = cab.map(c => (obj[c] === undefined ? '' : obj[c]));
  try {
    sh.appendRow(linha);
  } catch (e) {
    if (!ehErroValidacao_(e)) throw e;
    // Lista suspensa desatualizada na planilha: grava sem a regra nesta linha
    const n = linhaLivre_(sh, 1);
    sh.getRange(n, 1, 1, cab.length).clearDataValidations().setValues([linha]);
  }
  invalidar_(nome);      // a leitura feita para gerar o ID já não tem a linha nova
  return obj;
}

function atualizar_(nome, linha, campos) {
  conferirLinhas_(nome);
  const sh = aba_(nome);
  relaxarValidacoes_(sh);
  const cab = garantirColunas_(sh, Object.keys(campos));
  invalidar_(nome);
  // Colunas vizinhas são gravadas juntas (menos chamadas à planilha)
  const cols = Object.keys(campos).map(c => ({ col: cab.indexOf(c) + 1, v: campos[c] })).filter(x => x.col > 0)
    .sort((a, b) => a.col - b.col);
  const blocos = [];
  cols.forEach(x => {
    const ult = blocos[blocos.length - 1];
    if (ult && ult.ini + ult.vals.length === x.col) ult.vals.push(x.v);
    else blocos.push({ ini: x.col, vals: [x.v] });
  });
  blocos.forEach(b => {
    const rg = sh.getRange(linha, b.ini, 1, b.vals.length);
    try {
      rg.setValues([b.vals]);
    } catch (e) {
      if (!ehErroValidacao_(e)) throw e;
      // Lista suspensa desatualizada (ex.: status novo): tira a regra só destas células e grava
      rg.clearDataValidations().setValues([b.vals]);
    }
  });
}

/** Remove campos sensíveis e converte datas para texto antes de enviar ao navegador. */
function limpar_(obj) {
  const o = {};
  Object.keys(obj).forEach(k => {
    if (k === '_linha' || CAMPOS_SENSIVEIS.indexOf(k) > -1) return;
    const v = obj[k];
    o[k] = v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') : v;
  });
  return o;
}

function registrarAuditoria_(idUsuario, entidade, idEntidade, acao, anterior, novo) {
  // ID do registro de auditoria sem trava nem leitura da aba (que cresce sem parar)
  inserir_('AUDITORIA', {
    id_log: 'LOG-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1e6),
    data_hora: new Date(),
    id_usuario: idUsuario || '',
    entidade: entidade,
    id_entidade: idEntidade || '',
    acao: acao,
    valor_anterior: anterior ? JSON.stringify(anterior) : '',
    valor_novo: novo ? JSON.stringify(novo) : ''
  });
}
