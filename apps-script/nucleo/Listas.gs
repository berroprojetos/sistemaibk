/**
 * Listas.gs – listas editáveis em Configurações
 *  - Tipos de despesa (rubricas): Prestação de serviço, Compra de bens, Compra de consumo, Ativo imobilizado…
 *  - Classificações contábeis do SIT (aparecem para escolher no cadastro da rubrica)
 *  - Rubricas: descrições que aparecem para escolher no campo "Descrição rubrica" do Orçamento
 * Guardadas na aba CONFIG como JSON (chaves lista_tipo_despesa, lista_classificacao_contabil e lista_rubrica).
 */

const LISTAS_PADRAO_CFG = {
  tipo_despesa: ['Prestação de serviço', 'Compra de bens', 'Compra de consumo', 'Ativo imobilizado'],
  classificacao_contabil: [],
  rubrica: []
};

function listaConfig_(nome) {
  let v = null;
  try { v = JSON.parse(config_('lista_' + nome) || 'null'); } catch (e) { v = null; }
  return Array.isArray(v) && v.length ? v : LISTAS_PADRAO_CFG[nome].slice();
}

function listasConfig_() {
  return { tipo_despesa: listaConfig_('tipo_despesa'), classificacao_contabil: listaConfig_('classificacao_contabil'), rubrica: listaConfig_('rubrica') };
}

function obterListas_(u) {
  return listasConfig_();
}

function salvarListas_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const limpa = a => (a || []).map(x => String(x || '').trim()).filter((x, i, arr) => x && arr.indexOf(x) === i);
  const tipos = limpa(d.tipo_despesa), classes = limpa(d.classificacao_contabil);
  if (!tipos.length) throw new Error('Cadastre pelo menos um tipo de despesa.');
  definirConfig_('lista_tipo_despesa', JSON.stringify(tipos), 'Tipos de despesa das rubricas');
  definirConfig_('lista_classificacao_contabil', JSON.stringify(classes), 'Classificações contábeis do SIT');
  if (Array.isArray(d.rubrica)) definirConfig_('lista_rubrica', JSON.stringify(limpa(d.rubrica)), 'Rubricas (descrições para escolher no Orçamento)');
  registrarAuditoria_(u.id_usuario, 'CONFIG', 'listas', 'edicao', null, { tipos: tipos.length, classificacoes: classes.length });
  return listasConfig_();
}

/** Compra (bens, consumo, ativo…) × prestação de serviço. Compras do módulo de compras têm eh_compra. */
function ehCompra_(c) {
  if (!c) return false;
  if (c.eh_compra === true || String(c.eh_compra).toUpperCase() === 'TRUE') return true;
  return /^compra/i.test(String(c.tipo_despesa || ''));
}
