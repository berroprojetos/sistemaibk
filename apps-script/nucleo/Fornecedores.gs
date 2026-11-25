/**
 * Fornecedores.gs – base única de prestadores/fornecedores
 *
 * Duas fontes INDEPENDENTES:
 *  - menu Fornecedores = só a planilha de respostas do "Formulário de Prestação de Serviços e Fornecedores"
 *    (lida e editada direto na planilha; nada é misturado com os dados das contratações);
 *  - contratações dos projetos = dados do contratado gravados na própria contratação (aba FORNECEDORES interna).
 * Pontes permitidas (sempre por ação da pessoa, nunca automáticas):
 *  - na Nova contratação, "puxar" um cadastro do menu Fornecedores copia os dados para o formulário da contratação;
 *  - vínculo fornecedor ↔ projetos (aba FORN_VINCULOS): só uma associação; sugerida pelo CNPJ/CPF exato
 *    das contratações e ajustável à mão. Não cria contratação nem copia dados.
 *
 * Configuração (aba CONFIG): forn_planilha_id, forn_aba, forn_mapa (JSON campo -> [coluna principal, alternativa]).
 */

const PERFIS_FORNECEDORES = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO'];

/** Campos mostrados no cadastro e na Nova contratação (na ordem pedida). */
const CAMPOS_BASE_FORN = [
  ['cnpj', 'CNPJ'], ['razao_social', 'Razão social'], ['nome_fantasia', 'Nome fantasia'],
  ['nome_completo', 'Nome completo'], ['cpf', 'CPF'], ['rg', 'RG'],
  ['endereco', 'Rua'], ['numero', 'Nº'], ['complemento', 'Complemento'], ['bairro', 'Bairro'],
  ['cidade', 'Cidade'], ['uf', 'Estado'], ['representante_genero', 'Gênero'], ['email', 'E-mail'],
  ['telefone', 'Celular (WhatsApp)'], ['chave_pix', 'Chave PIX'], ['banco', 'Banco'], ['agencia', 'Agência'],
  ['conta', 'Conta com dígito']
];
/** Outros dados usados pelos modelos de contrato (aparecem no cadastro, não na tela da contratação). */
const CAMPOS_EXTRA_FORN = [
  ['cep', 'CEP'], ['nacionalidade', 'Nacionalidade'], ['estado_civil', 'Estado civil'],
  ['profissao', 'Profissão'], ['representante_cargo', 'Cargo do representante']
];
const TODOS_CAMPOS_FORN = CAMPOS_BASE_FORN.concat(CAMPOS_EXTRA_FORN);

function exigirFornecedores_(u, paraContratacao) {
  if (paraContratacao) { exigirPerfil_(u, PERFIS_CONTRATACAO); return; }
  exigirPerfil_(u, PERFIS_FORNECEDORES);
  if (!podeVerTudo_(u) && !ehPersonalizado_(u)) throw new Error('Sem permissão para a base de fornecedores.');
}

function normCab_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Sugere, para cada campo, até 2 colunas da planilha (principal e alternativa) pelos títulos. */
function sugerirMapa_(cabs) {
  const n = cabs.map(normCab_);
  const regras = {
    cnpj: h => /cnpj/.test(h),
    razao_social: h => /razao social/.test(h),
    nome_fantasia: h => /fantasia/.test(h),
    nome_completo: h => !/razao|fantasia|mae|pai|conjuge|banco|titular/.test(h) &&
      /nome completo|^nome$|nome do (prestador|responsavel|representante|socio)|representante legal|^nome \(/.test(h),
    cpf: h => /(^|[^a-z])cpf([^a-z]|$)/.test(h) && !/titular/.test(h),
    rg: h => /(^|[^a-z])rg([^a-z]|$)|identidade/.test(h),
    endereco: h => /^rua|logradouro|endereco/.test(h) && !/mail/.test(h),
    numero: h => /^(numero|n[ºo°.]*)$|^n[ºo°.]* ?\(|numero (do endereco|da casa|residencial|do imovel)/.test(h),
    complemento: h => /complemento/.test(h),
    bairro: h => /bairro/.test(h),
    cidade: h => /cidade|municipio/.test(h),
    uf: h => /^uf$|^estado$|^estado \(|\(uf\)|^uf /.test(h) && !/civil/.test(h),
    representante_genero: h => /genero|sexo/.test(h),
    email: h => /mail/.test(h),
    telefone: h => /celular|whats|telefone|fone/.test(h),
    chave_pix: h => /pix/.test(h),
    banco: h => /banco/.test(h) && !/agencia|conta|pix/.test(h),
    agencia: h => /agencia/.test(h),
    conta: h => /(^|[^a-z])conta([^a-z]|$)/.test(h) && !/pix|tipo de conta|agencia|mail|contato/.test(h),
    cep: h => /(^|[^a-z])cep([^a-z]|$)/.test(h),
    nacionalidade: h => /nacionalidade/.test(h),
    estado_civil: h => /estado civil/.test(h),
    profissao: h => /profiss|ocupacao/.test(h),
    representante_cargo: h => /cargo/.test(h)
  };
  const mapa = {};
  TODOS_CAMPOS_FORN.forEach(([k]) => {
    const f = regras[k], achados = [];
    n.forEach((h, i) => { if (f && f(h) && achados.length < 2) achados.push(cabs[i]); });
    // E-mail: prefere a pergunta do formulário ao e-mail coletado automaticamente pelo Google
    if (k === 'email' && achados.length === 2 && /^endereco de e-?mail$/.test(normCab_(achados[0]))) achados.reverse();
    mapa[k] = achados;
  });
  return mapa;
}

/** Mapa salvo numa versão anterior (com "cnpj_cpf"): completa com a sugestão para os campos novos. */
function atualizarMapa_(mapa, cabs) {
  if (mapa.cnpj || mapa.cpf || !cabs || !cabs.length) return mapa;
  const sug = sugerirMapa_(cabs), novo = {};
  TODOS_CAMPOS_FORN.forEach(([k]) => { novo[k] = (mapa[k] && mapa[k].length) ? mapa[k] : (sug[k] || []); });
  if (mapa.representante_nome && mapa.representante_nome.length && !(novo.nome_completo || []).length) novo.nome_completo = mapa.representante_nome;
  return novo;
}

function configBaseForn_() {
  let mapa = {};
  try { mapa = JSON.parse(config_('forn_mapa') || '{}'); } catch (e) { mapa = {}; }
  return { id: config_('forn_planilha_id'), aba: config_('forn_aba'), mapa: mapa };
}

function idDaPlanilha_(txt) {
  const s = String(txt || '').trim();
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : s;
}

function abrirBaseForn_(cfg) {
  cfg = cfg || configBaseForn_();
  if (!cfg.id) throw new Error('A planilha do formulário de fornecedores ainda não foi conectada (Fornecedores → Conectar planilha).');
  let ss;
  try { ss = SpreadsheetApp.openById(cfg.id); }
  catch (e) { throw new Error('Não consegui abrir a planilha do formulário. Confira se a conta que publicou o sistema tem acesso de edição a ela.'); }
  const sh = cfg.aba ? ss.getSheetByName(cfg.aba) : ss.getSheets()[0];
  if (!sh) throw new Error('A aba "' + cfg.aba + '" não existe mais na planilha do formulário.');
  return { ss: ss, sh: sh };
}

/** Documento só com dígitos; corrige CPF que virou número e perdeu o zero da frente. */
function docDe_(v) {
  let d = soDigitos_(v);
  if (typeof v === 'number' || /^\d+(\.0+)?$/.test(String(v))) {
    if (d.length > 0 && d.length < 11) d = d.padStart(11, '0');
    else if (d.length > 11 && d.length < 14) d = d.padStart(14, '0');
  }
  return d;
}

function formatarDoc_(d) {
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
}

/**
 * Completa os campos internos a partir dos campos do formulário:
 *  cnpj_cpf (documento do contrato) = CNPJ, ou CPF quando não há CNPJ;
 *  razao_social = razão social, ou nome completo (pessoa física);
 *  representante_nome / representante_cpf = nome completo / CPF (quando é empresa).
 * CNPJ e CPF digitados trocados de campo são corrigidos pelo número de dígitos.
 */
function normalizarFornecedor_(f) {
  const o = Object.assign({}, f);
  const veio = o.cnpj !== undefined || o.cpf !== undefined;
  if (!veio) {                                         // telas antigas (ex.: compras) mandam só cnpj_cpf
    const d = soDigitos_(o.cnpj_cpf);
    if (d.length === 14) o.cnpj = o.cnpj_cpf; else if (d.length === 11) o.cpf = o.cnpj_cpf;
  }
  let cnpj = docDe_(o.cnpj), cpf = docDe_(o.cpf);
  if (cnpj.length === 11 && !cpf) { cpf = cnpj; cnpj = ''; }
  if (cpf.length === 14 && !cnpj) { cnpj = cpf; cpf = ''; }
  if (cnpj.length === 11) cnpj = '';
  if (o.cnpj !== undefined || cnpj) o.cnpj = cnpj ? formatarDoc_(cnpj) : '';
  if (o.cpf !== undefined || cpf) o.cpf = cpf ? formatarDoc_(cpf) : '';
  if (cnpj.length === 14) o.cnpj_cpf = formatarDoc_(cnpj);
  else if (cpf.length === 11) o.cnpj_cpf = formatarDoc_(cpf);
  else o.cnpj_cpf = o.cnpj_cpf || '';
  const nome = String(o.nome_completo || '').trim(), razao = String(o.razao_social || '').trim();
  if (o.razao_social !== undefined || nome) o.razao_social = razao || nome;
  if (cnpj.length === 14) {
    if (nome) o.representante_nome = nome;
    if (cpf) o.representante_cpf = formatarDoc_(cpf);
  }
  return o;
}

/** Lê a planilha do formulário: um registro por linha nos campos do sistema + todas as colunas originais. */
function lerBaseForn_(cfg) {
  cfg = cfg || configBaseForn_();
  const b = abrirBaseForn_(cfg);
  const vals = b.sh.getDataRange().getValues();
  const cab = (vals[0] || []).map(String);
  const col = {};
  cab.forEach((h, i) => { if (h) col[h] = i; });
  cfg.mapa = atualizarMapa_(cfg.mapa, cab.filter(Boolean));
  if (vals.length < 2) return { cab: cab, linhas: [], sh: b.sh, col: col, mapa: cfg.mapa };
  const tz = Session.getScriptTimeZone();
  const txt = v => (v instanceof Date ? Utilities.formatDate(v, tz, v.getHours() || v.getMinutes() ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy')
    : String(v === null || v === undefined ? '' : v).trim());
  const valor = (row, k) => {
    for (const h of (cfg.mapa[k] || [])) {
      if (col[h] === undefined) continue;
      const raw = row[col[h]];
      const v = (k === 'cnpj' || k === 'cpf') ? docDe_(raw) : txt(raw);
      if (v) return v;
    }
    return '';
  };
  const linhas = [];
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (row.every(x => x === '' || x === null)) continue;
    const bruto = { _linha_base: r + 1 };
    TODOS_CAMPOS_FORN.forEach(([k]) => { bruto[k] = valor(row, k); });
    const o = normalizarFornecedor_(bruto);
    o._linha_base = r + 1;
    o._doc = soDigitos_(o.cnpj_cpf);
    o._docs = [soDigitos_(o.cnpj), soDigitos_(o.cpf)].filter(d => d.length === 11 || d.length === 14);
    o._respostas = cab.map((h, i) => [h, txt(row[i])]).filter(p => p[0]);      // a linha inteira do formulário
    linhas.push(o);
  }
  return { cab: cab, linhas: linhas, sh: b.sh, col: col, mapa: cfg.mapa };
}

// ---------------------------------------------------------------------------
// Conexão e mapeamento

function obterConfigBaseForn_(u) {
  exigirFornecedores_(u);
  const cfg = configBaseForn_();
  const r = { conectada: !!cfg.id, id: cfg.id, aba: cfg.aba, mapa: cfg.mapa, campos: CAMPOS_BASE_FORN, extras: CAMPOS_EXTRA_FORN,
              cabecalhos: [], abas: [], url: '' };
  if (cfg.id) {
    try {
      const b = abrirBaseForn_(cfg);
      r.url = b.ss.getUrl(); r.nome = b.ss.getName();
      r.abas = b.ss.getSheets().map(s => s.getName());
      r.cabecalhos = b.sh.getLastColumn() ? b.sh.getRange(1, 1, 1, b.sh.getLastColumn()).getValues()[0].map(String).filter(Boolean) : [];
      r.mapa = atualizarMapa_(cfg.mapa, r.cabecalhos);
    } catch (e) { r.erro = e.message; }
  }
  return r;
}

/** Conecta (ou troca) a planilha. Sem mapa salvo, sugere um automaticamente pelos títulos das colunas. */
function conectarBaseForn_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN.concat(['PRESTACAO_CONTAS']));
  const id = idDaPlanilha_(d.planilha);
  if (!id) throw new Error('Cole o link da planilha de respostas do formulário.');
  let ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { throw new Error('Não consegui abrir essa planilha. Confira o link e se a conta que publicou o sistema tem acesso de edição a ela.'); }
  const sh = d.aba ? ss.getSheetByName(d.aba) : ss.getSheets()[0];
  if (!sh) throw new Error('Aba não encontrada nessa planilha.');
  const cabs = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).filter(Boolean) : [];
  if (!cabs.length) throw new Error('A aba escolhida está vazia (sem a linha de títulos).');
  const anterior = configBaseForn_();
  const mapa = (anterior.id === id && anterior.aba === sh.getName() && Object.keys(anterior.mapa).length)
    ? atualizarMapa_(anterior.mapa, cabs) : sugerirMapa_(cabs);
  definirConfig_('forn_planilha_id', id, 'Planilha do formulário de fornecedores');
  definirConfig_('forn_aba', sh.getName(), 'Aba de respostas do formulário de fornecedores');
  definirConfig_('forn_mapa', JSON.stringify(mapa), 'Colunas do formulário de fornecedores');
  registrarAuditoria_(u.id_usuario, 'CONFIG', 'forn_planilha', 'conectar', null, { id: id, aba: sh.getName() });
  return obterConfigBaseForn_(u);
}

function salvarMapaForn_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN.concat(['PRESTACAO_CONTAS']));
  const mapa = {};
  TODOS_CAMPOS_FORN.forEach(([k]) => { mapa[k] = (d.mapa && d.mapa[k] || []).map(String).filter(Boolean).slice(0, 2); });
  if (!mapa.cnpj.length && !mapa.cpf.length) throw new Error('Escolha a coluna do CNPJ e/ou do CPF: é por elas que o sistema reconhece cada prestador.');
  if (!mapa.razao_social.length && !mapa.nome_completo.length) throw new Error('Escolha a coluna da razão social e/ou do nome completo.');
  definirConfig_('forn_mapa', JSON.stringify(mapa), 'Colunas do formulário de fornecedores');
  return obterConfigBaseForn_(u);
}

// ---------------------------------------------------------------------------
// Vínculos fornecedor (da planilha) ↔ projetos

const CAB_VINCULOS_FORN = ['doc', 'incluir', 'excluir', 'atualizado_em', 'atualizado_por'];

/** A aba FORN_VINCULOS é criada sozinha na primeira vez (uma linha por fornecedor: projetos incluídos/excluídos à mão). */
function prepararAbaVinculos_() {
  if (typeof ESTRUTURA !== 'undefined' && !ESTRUTURA.FORN_VINCULOS) ESTRUTURA.FORN_VINCULOS = CAB_VINCULOS_FORN;
  aba_('FORN_VINCULOS');
}

function lerVinculosForn_() {
  prepararAbaVinculos_();
  const m = {};
  ler_('FORN_VINCULOS').forEach(v => {
    const d = soDigitos_(v.doc);
    if (!d) return;
    const lista = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    m[d] = { linha: v._linha, incluir: lista(v.incluir), excluir: lista(v.excluir) };
  });
  return m;
}

/**
 * Projetos em que cada documento aparece como contratado (CNPJ/CPF exatamente igual, contratação não cancelada).
 * Só lê as contratações — nunca grava nada nelas.
 */
function projetosPorDocumento_() {
  const docForn = {};
  ler_('FORNECEDORES').forEach(f => { const d = soDigitos_(f.cnpj_cpf); if (d) docForn[f.id_fornecedor] = d; });
  const m = {};
  ler_('CONTRATACOES').forEach(c => {
    const d = docForn[c.id_fornecedor];
    if (!d || c.status === 'Cancelada') return;
    (m[d] = m[d] || {})[c.id_projeto] = true;
  });
  return m;
}

/** Projetos vinculados a uma linha da planilha: automáticos (pelo documento) + incluídos − excluídos à mão. */
function projetosDoFornecedor_(docs, auto, vinc) {
  const chave = docs[0];
  const autos = {};
  docs.forEach(d => { Object.keys(auto[d] || {}).forEach(p => { autos[p] = true; }); });
  const v = (chave && vinc[chave]) || { incluir: [], excluir: [] };
  const ids = {};
  Object.keys(autos).forEach(p => { if (v.excluir.indexOf(p) === -1) ids[p] = 'auto'; });
  v.incluir.forEach(p => { if (!ids[p]) ids[p] = 'manual'; });
  return { ids: ids, autos: Object.keys(autos) };
}

/** Salva os projetos marcados para um fornecedor da planilha. Não mexe em contratações nem nos dados do fornecedor. */
function salvarVinculosForn_(u, d) {
  exigirFornecedores_(u);
  const docs = (d.docs || [d.doc]).map(soDigitos_).filter(x => x.length === 11 || x.length === 14);
  if (!docs.length) throw new Error('Este cadastro da planilha não tem CNPJ ou CPF válido — corrija a planilha antes de vincular projetos.');
  const validos = {};
  ler_('PROJETOS').forEach(p => { validos[p.id_projeto] = true; });
  const marcados = (d.projetos || []).filter(id => validos[id]);
  const auto = projetosPorDocumento_();
  const autos = {};
  docs.forEach(x => { Object.keys(auto[x] || {}).forEach(p => { autos[p] = true; }); });
  const incluir = marcados.filter(p => !autos[p]);
  const excluir = Object.keys(autos).filter(p => marcados.indexOf(p) === -1);
  const vinc = lerVinculosForn_();
  const campos = { doc: "'" + docs[0], incluir: incluir.join(', '), excluir: excluir.join(', '),
                   atualizado_em: new Date(), atualizado_por: u.id_usuario };
  if (vinc[docs[0]]) atualizar_('FORN_VINCULOS', vinc[docs[0]].linha, campos);
  else inserir_('FORN_VINCULOS', campos);
  registrarAuditoria_(u.id_usuario, 'FORN_VINCULOS', docs[0], 'vincular_projetos', null, { projetos: marcados });
  return { doc: docs[0], projetos: marcados };
}

// ---------------------------------------------------------------------------
// Lista do menu Fornecedores (só a planilha)

function listarFornecedoresBase_(u, d) {
  const paraContratacao = !!(d && d.para_contratacao);
  exigirFornecedores_(u, paraContratacao);
  const cfg = configBaseForn_();
  let base = { linhas: [] }, erroBase = '';
  if (cfg.id) { try { base = lerBaseForn_(cfg); } catch (e) { erroBase = e.message; } }

  let projetos = [], auto = {}, vinc = {}, porId = {};
  if (!paraContratacao) {
    const inst = {};
    ler_('INSTITUICOES').forEach(i => { inst[i.id_instituicao] = i.sigla || i.razao_social; });
    projetos = ler_('PROJETOS').map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla || p.nome_projeto, nome: p.nome_projeto || '',
                                            instituicao: inst[p.id_instituicao] || '' }));
    projetos.forEach(p => { porId[p.id_projeto] = p; });
    auto = projetosPorDocumento_();
    vinc = lerVinculosForn_();
  }

  const vistos = {}, lista = [];
  base.linhas.forEach(l => {
    const chave = l._doc || ('linha:' + l._linha_base);
    if (vistos[chave]) return;                          // linha repetida na planilha: vale a primeira
    vistos[chave] = true;
    const dados = {};
    TODOS_CAMPOS_FORN.forEach(([c]) => { dados[c] = l[c] || ''; });
    const item = { chave: chave, dados: dados, linha_planilha: l._linha_base, doc_contrato: l.cnpj_cpf || '',
                   docs: [l._doc].concat(l._docs || []).filter((x, i, a) => x && a.indexOf(x) === i),
                   doc_invalido: !(l._doc && (l._doc.length === 11 || l._doc.length === 14)) };
    if (!paraContratacao) {
      const pr = item.doc_invalido ? { ids: {}, autos: [] } : projetosDoFornecedor_(item.docs, auto, vinc);
      item.projetos = Object.keys(pr.ids).filter(id => porId[id]).map(id => Object.assign({ origem: pr.ids[id] }, porId[id]));
      item.projetos_auto = pr.autos;
      item.respostas = l._respostas;
    }
    lista.push(item);
  });
  const nomeOrd = x => String(x.dados.razao_social || x.dados.nome_completo || '').replace(/^[\d.\s]+/, '');
  lista.sort((a, b) => nomeOrd(a).localeCompare(nomeOrd(b), 'pt-BR'));
  return { conectada: !!cfg.id, erro_base: erroBase, lista: lista, projetos: projetos,
           campos: CAMPOS_BASE_FORN, extras: CAMPOS_EXTRA_FORN };
}

// ---------------------------------------------------------------------------
// Gravação na planilha do formulário

/** Grava (atualiza ou cria) a linha do prestador na planilha. Só mexe nas colunas mapeadas e nunca apaga um valor. */
function gravarNaBaseForn_(f, base, cfg) {
  const n = normalizarFornecedor_(f);
  n.razao_social = String(f.razao_social || '').trim();     // pessoa física: a coluna "Razão social" fica vazia
  const docs = [soDigitos_(n.cnpj), soDigitos_(n.cpf), soDigitos_(n.cnpj_cpf)].filter(Boolean);
  const sh = base.sh, col = base.col || {}, mapa = base.mapa || cfg.mapa;
  const existente = base.linhas.find(l => docs.indexOf(l._doc) > -1 || (l._docs || []).some(d => docs.indexOf(d) > -1));
  const largura = Math.max(sh.getLastColumn(), base.cab.length);
  const usadas = {};                                   // mesma coluna mapeada em 2 campos (ex.: "CPF ou CNPJ"): grava o 1º
  if (existente) {
    TODOS_CAMPOS_FORN.forEach(([k]) => {
      const h = (mapa[k] || [])[0];
      if (!h || col[h] === undefined || usadas[h] || n[k] === undefined) return;
      const novo = String(n[k] || '').trim();
      if (novo === '') return;
      usadas[h] = true;
      if (novo === String(existente[k] || '').trim()) return;
      sh.getRange(existente._linha_base, col[h] + 1).setNumberFormat('@').setValue(novo);
    });
    return 'atualizado';
  }
  const linha = new Array(largura).fill('');
  const carimbo = base.cab.findIndex(h => /carimbo|timestamp|data\/hora/.test(normCab_(h)));
  if (carimbo > -1) linha[carimbo] = new Date();
  TODOS_CAMPOS_FORN.forEach(([k]) => {
    const h = (mapa[k] || [])[0];
    if (!h || col[h] === undefined || usadas[h] || n[k] === undefined || String(n[k]).trim() === '') return;
    usadas[h] = true;
    linha[col[h]] = String(n[k]).trim();
  });
  const r = linhaLivre_(sh, 1);
  const formatos = linha.map((v, i) => (i === carimbo ? 'dd/MM/yyyy HH:mm:ss' : '@'));
  sh.getRange(r, 1, 1, largura).setNumberFormats([formatos]).setValues([linha]);
  base.linhas.push(Object.assign({ _linha_base: r, _doc: soDigitos_(n.cnpj_cpf), _docs: docs }, n));
  return 'criado';
}

/** Cadastro/edição manual pelo menu Fornecedores: grava SÓ na planilha do formulário (não mexe nas contratações). */
function salvarFornecedorBase_(u, d) {
  exigirFornecedores_(u);
  const cfg = configBaseForn_();
  if (!cfg.id) throw new Error('Conecte a planilha do formulário antes de cadastrar fornecedores.');
  const f = {};
  TODOS_CAMPOS_FORN.forEach(([k]) => { if (d[k] !== undefined) f[k] = d[k]; });
  const n = normalizarFornecedor_(f);
  const doc = soDigitos_(n.cnpj_cpf);
  if (!(doc.length === 11 || doc.length === 14)) throw new Error('Informe um CNPJ ou um CPF válido.');
  if (!n.razao_social) throw new Error('Informe a razão social ou o nome completo.');
  const resultado = gravarNaBaseForn_(f, lerBaseForn_(cfg), cfg);
  registrarAuditoria_(u.id_usuario, 'FORNECEDORES_PLANILHA', doc, 'salvar', null, { planilha: resultado });
  return { doc: doc, planilha: resultado };
}
