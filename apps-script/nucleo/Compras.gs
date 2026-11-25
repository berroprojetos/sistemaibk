/**
 * Compras.gs – compra de bens (materiais, livros, uniformes, alimentação…)
 *
 * Uma compra é uma contratação do tipo "Compra de bens", com:
 *  - itens (descrição, unidade, quantidade, valor unitário) na aba ITENS_COMPRA;
 *  - pagamento à vista (1 parcela) ou parcelado;
 *  - competência = mês da compra (no Pagamentos aparece no mês seguinte, como os serviços).
 * Para compras que já foram pagas, dá para lançar na hora a NF + comprovante (arquivo único).
 */

function itensDaCompra_(idContratacao) {
  return ler_('ITENS_COMPRA').filter(i => i.id_contratacao === idContratacao)
    .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    .map(i => ({ id_item: i.id_item, descricao: i.descricao, unidade: i.unidade, quantidade: Number(i.quantidade || 0),
                 valor_unitario: Number(i.valor_unitario || 0), valor_total: Number(i.valor_total || 0) }));
}

function salvarCompra_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  exigirAcessoProjeto_(u, d.id_projeto);

  // Itens
  const itens = (d.itens || []).map((i, k) => {
    const qtd = paraNumero_(i.quantidade), vu = paraNumero_(i.valor_unitario);
    return { ordem: k + 1, descricao: String(i.descricao || '').trim(), unidade: String(i.unidade || '').trim(),
             quantidade: qtd, valor_unitario: vu, valor_total: Math.round(Number(qtd) * Number(vu) * 100) / 100 };
  }).filter(i => i.descricao || i.quantidade || i.valor_unitario);
  if (!itens.length) throw new Error('Inclua pelo menos um item na compra.');
  itens.forEach((i, k) => {
    if (!i.descricao) throw new Error('Item ' + (k + 1) + ': falta a descrição.');
    if (!(i.quantidade > 0)) throw new Error('Item ' + (k + 1) + ': quantidade inválida.');
    if (!(i.valor_unitario > 0)) throw new Error('Item ' + (k + 1) + ': valor unitário inválido.');
  });
  const total = Math.round(itens.reduce((s, i) => s + i.valor_total, 0) * 100) / 100;

  const n = Math.max(1, parseInt(d.num_parcelas, 10) || 1);
  const valorParcela = Math.round(total / n * 100) / 100;
  if (!paraData_(d.data_compra)) throw new Error('Informe a data da compra.');

  const objeto = String(d.objeto || '').trim() ||
    ('Aquisição de ' + itens.map(i => String(i.quantidade).replace('.', ',') + ' ' + (i.unidade ? i.unidade + ' de ' : '') + i.descricao).join(', '));

  // Grava como contratação (reaproveita validação de saldo da rubrica, contratado, pasta e parcelas)
  const det = salvarContratacao_(u, {
    id_contratacao: d.id_contratacao || '',
    id_projeto: d.id_projeto, id_rubrica: d.id_rubrica,
    fornecedor: d.fornecedor || {},
    objeto: objeto,
    data_cotacao: d.data_cotacao || '',
    data_assinatura_contrato: d.data_cotacao || '',          // compra: contrato = cotação
    inicio_execucao: d.data_compra, fim_execucao: d.data_compra,
    num_parcelas: n, valor_parcela: valorParcela,
    status: d.status || (d.lancamento && (d.lancamento.numero || d.lancamento.arquivo) ? 'Encerrada' : 'Em execução'),
    observacoes: d.observacoes || '',
    descricao_nf: String(d.descricao_nf || '').trim()
  });
  const id = det.contratacao.id_contratacao;
  const c = buscar_('CONTRATACOES', 'id_contratacao', id);
  const rubC = buscar_('RUBRICAS', 'id_rubrica', d.id_rubrica) || {};
  const tipoCompra = rubC.tipo_despesa && rubC.tipo_despesa !== 'Prestação de serviço' ? rubC.tipo_despesa : 'Compra de bens';
  const ajustes = { tipo_despesa: tipoCompra, eh_compra: true, valor_total_contratado: total };
  if (d.data_cotacao) ajustes.data_assinatura_contrato = paraData_(d.data_cotacao);   // compra: contrato = cotação
  atualizar_('CONTRATACOES', c._linha, ajustes);

  // Ajuste de centavos na última parcela (ex.: 100,00 em 3× = 33,33 + 33,33 + 33,34)
  const parcelas = ler_('PARCELAS').filter(p => p.id_contratacao === id).sort((a, b) => Number(a.num_parcela) - Number(b.num_parcela));
  const ultima = parcelas[parcelas.length - 1];
  const valorUltima = Math.round((total - valorParcela * (n - 1)) * 100) / 100;
  if (ultima && ultima.status === 'Prevista' && Math.abs(Number(ultima.valor_previsto) - valorUltima) > 0.001) {
    atualizar_('PARCELAS', ultima._linha, { valor_previsto: valorUltima });
  }

  // Itens: substitui os anteriores
  excluirLinhas_('ITENS_COMPRA', ler_('ITENS_COMPRA').filter(i => i.id_contratacao === id).map(i => i._linha));
  itens.forEach(i => inserir_('ITENS_COMPRA', Object.assign({ id_contratacao: id, id_projeto: d.id_projeto }, i)));

  // Compra que já foi paga: lança NF + comprovante na 1ª parcela
  let lancado = null;
  const l = d.lancamento;
  if (l && (l.numero || l.arquivo)) {
    const p1 = ler_('PARCELAS').find(p => p.id_contratacao === id && Number(p.num_parcela) === 1);
    lancado = importarLancamento_(u, {
      id_parcela: p1.id_parcela, status_final: l.status_final, arquivo: l.arquivo || null,
      nf: { numero: l.numero, data_emissao: l.data_emissao, valor: n === 1 ? total : (p1.valor_previsto || valorParcela) },
      pagamento: { data_pagamento: l.data_pagamento, forma_pagamento: l.forma_pagamento, num_identificacao_pix: l.num_identificacao_pix,
                   valor: n === 1 ? total : (p1.valor_previsto || valorParcela) }
    });
  }

  registrarAuditoria_(u.id_usuario, 'CONTRATACOES', id, d.id_contratacao ? 'editar_compra' : 'nova_compra', null, { total: total, itens: itens.length });
  const res = obterContratacao_(u, id);
  res.lancamento = lancado;
  return res;
}
