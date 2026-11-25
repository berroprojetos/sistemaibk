/**
 * Modulos.gs – registro dos módulos vendidos à parte (Sistema IBK)
 *
 * Cada módulo é um arquivo .gs que declara uma função modulo<Nome>_() devolvendo:
 *   { nome, areas: [[chave, rótulo]], estrutura: {ABA: [colunas]}, colunasExtras: {ABA_DO_NUCLEO: [colunas]},
 *     listas: {lista: [valores]}, validacoes: {ABA: {coluna: lista}}, prefixos: {ABA: 'PRE'},
 *     config: [[chave, valor, descricao]], acoes: {acao: {fn, area, nivel}} }
 *
 * Para vender um módulo: inclua o arquivo dele no projeto e acrescente a função na lista abaixo.
 * Sem o arquivo, o módulo simplesmente não existe (typeof … !== 'function').
 */

function modulosInstalados_() {
  const m = [];
  if (typeof moduloBeneficiarios_ === 'function') m.push(moduloBeneficiarios_());
  return m;
}

let MODULOS_REGISTRADOS_ = null;

/** Junta as abas, listas, prefixos, áreas e ações dos módulos às do núcleo. Roda uma vez por execução. */
function registrarModulos_() {
  if (MODULOS_REGISTRADOS_) return MODULOS_REGISTRADOS_;
  const acoes = {};
  modulosInstalados_().forEach(mod => {
    Object.keys(mod.estrutura || {}).forEach(aba => { ESTRUTURA[aba] = mod.estrutura[aba]; });
    Object.keys(mod.colunasExtras || {}).forEach(aba => {
      (mod.colunasExtras[aba] || []).forEach(c => { if (ESTRUTURA[aba] && ESTRUTURA[aba].indexOf(c) === -1) ESTRUTURA[aba].push(c); });
    });
    Object.keys(mod.listas || {}).forEach(nome => {
      if (ESTRUTURA.LISTAS.indexOf(nome) === -1) ESTRUTURA.LISTAS.push(nome);
      const atual = LISTAS[nome] || (LISTAS[nome] = []);
      mod.listas[nome].forEach(v => { if (atual.indexOf(v) === -1) atual.push(v); });
    });
    Object.keys(mod.validacoes || {}).forEach(aba => { VALIDACOES[aba] = Object.assign(VALIDACOES[aba] || {}, mod.validacoes[aba]); });
    Object.assign(PREFIXOS, mod.prefixos || {});
    (mod.config || []).forEach(c => { if (!CONFIG_INICIAL.some(x => x[0] === c[0])) CONFIG_INICIAL.push(c); });
    (mod.areas || []).forEach(a => {
      if (AREAS_PERMISSAO.indexOf(a[0]) === -1) AREAS_PERMISSAO.push(a[0]);
      NOMES_AREA[a[0]] = a[1];
    });
    Object.keys(mod.acoes || {}).forEach(k => { acoes[k] = mod.acoes[k]; });
  });
  MODULOS_REGISTRADOS_ = { acoes: acoes };
  return MODULOS_REGISTRADOS_;
}

/** Ação de algum módulo (ou null). */
function acaoModulo_(acao) {
  return registrarModulos_().acoes[acao] || null;
}

/** Regra de permissão da ação de módulo no formato do ACOES_AREA: [área(s), nível]. */
function regraModulo_(acao) {
  const a = acaoModulo_(acao);
  return a ? [a.area, a.nivel] : null;
}
