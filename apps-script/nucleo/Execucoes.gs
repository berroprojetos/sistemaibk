/**
 * Execucoes.gs – rubricas executadas "por demanda" (palestras, oficinas, apresentações…)
 *
 * Uma rubrica (ex.: Capacitador/Professor – 22 palestras) pode ter VÁRIOS prestadores, cada um com a sua
 * contratação (modalidade "Por demanda": valor por unidade, quantidade opcional, cotação, contrato e documentos próprios).
 *  - EXECUCOES: cada palestra realizada (data, prestador/contratação, quantidade, valor, descrição, comprovante).
 *  - Faturar: junta execuções ainda não faturadas de UM prestador numa parcela (competência escolhida).
 *    Essa parcela segue o fluxo normal: pedir NF, anexar NF e comprovante, conferência e Prestação SIT.
 *  - Controle compartilhado: a quantidade prevista e o orçamento são da rubrica (todos os prestadores juntos).
 * Uma execução só pode estar em uma parcela; desfazer o faturamento libera as execuções.
 */

const MODALIDADE_DEMANDA = 'Por demanda';
const CAB_EXECUCOES = ['id_execucao', 'id_projeto', 'id_rubrica', 'id_contratacao', 'data', 'quantidade', 'valor_unitario',
  'valor_total', 'descricao', 'id_documento', 'id_parcela', 'criado_em', 'criado_por', 'competencia'];

/** Competência (AAAA-MM) da execução: a informada; nas antigas, o mês da data. */
function competenciaExec_(e) {
  const c = String(e.competencia || '').match(/^\d{4}-\d{2}/);
  return c ? c[0] : ymd_(e.data).slice(0, 7);
}
/** Descrição do serviço para a nota: as descrições digitadas nas execuções (sem repetir). */
function descricaoServicoExecs_(execs) {
  const vistos = {}, out = [];
  execs.forEach(e => { const t = String(e.descricao || '').trim(); if (t && !vistos[t.toLowerCase()]) { vistos[t.toLowerCase()] = 1; out.push(t); } });
  return out.join('; ');
}

/** A aba EXECUCOES é criada sozinha na primeira vez. */
function prepararAbaExecucoes_() {
  if (typeof ESTRUTURA !== 'undefined' && !ESTRUTURA.EXECUCOES) ESTRUTURA.EXECUCOES = CAB_EXECUCOES;
  if (typeof PREFIXOS !== 'undefined' && !PREFIXOS.EXECUCOES) PREFIXOS.EXECUCOES = 'EXE';
  aba_('EXECUCOES');
}

function lerExecucoes_() {
  try { prepararAbaExecucoes_(); return ler_('EXECUCOES'); } catch (e) { return []; }
}

const r2_ = v => Math.round(Number(v || 0) * 100) / 100;

/** Valor já executado (soma das execuções) por contratação. */
function valorExecutadoPorContratacao_() {
  const m = {};
  lerExecucoes_().forEach(e => { m[e.id_contratacao] = r2_((m[e.id_contratacao] || 0) + Number(e.valor_total || 0)); });
  return m;
}

/** Quanto a contratação compromete do orçamento da rubrica. Por demanda: o maior entre o contratado e o já executado. */
function comprometidoContratacao_(c, execs) {
  const contratado = Number(c.valor_total_contratado || 0);
  if (c.modalidade !== MODALIDADE_DEMANDA) return contratado;
  return Math.max(contratado, Number((execs || {})[c.id_contratacao] || 0));
}

/** Unidades previstas na rubrica (quantidade × meses, quando a rubrica tiver meses). */
function unidadesPrevistas_(r) {
  const q = Number(r.quantidade || 0), m = Number(r.meses || 0);
  return q > 0 ? q * (m > 0 ? m : 1) : 0;
}

function ymd_(v) { return v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') : String(v || ''); }
function dmy_(v) { return v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'dd/MM/yyyy') : String(v || ''); }

// ---------------------------------------------------------------------------
// Painel: consolidado por rubrica + detalhe por prestador

function obterExecucoes_(u, d) {
  exigirAcessoProjeto_(u, d.id_projeto);
  const idProj = d.id_projeto;
  const rubricas = ler_('RUBRICAS').filter(r => r.id_projeto === idProj);
  const ctrs = ler_('CONTRATACOES').filter(c => c.id_projeto === idProj && c.status !== 'Cancelada');
  const forn = {};
  ler_('FORNECEDORES').forEach(f => { forn[f.id_fornecedor] = f; });
  const execs = lerExecucoes_().filter(e => e.id_projeto === idProj);
  const parcelas = {};
  ler_('PARCELAS').forEach(p => { if (p.id_projeto === idProj) parcelas[p.id_parcela] = p; });
  const nfPorParc = {}, pgPorParc = {};
  ler_('NOTAS_FISCAIS').forEach(n => { if (parcelas[n.id_parcela]) nfPorParc[n.id_parcela] = n; });
  ler_('PAGAMENTOS').forEach(g => { if (parcelas[g.id_parcela]) pgPorParc[g.id_parcela] = g; });
  const execPorCtr = valorExecutadoPorContratacao_();

  const comDemanda = {};
  ctrs.forEach(c => { if (c.modalidade === MODALIDADE_DEMANDA) comDemanda[c.id_rubrica] = true; });

  const res = rubricas.filter(r => comDemanda[r.id_rubrica]).map(r => {
    const cs = ctrs.filter(c => c.id_rubrica === r.id_rubrica);
    const prestadores = cs.filter(c => c.modalidade === MODALIDADE_DEMANDA).map(c => {
      const f = forn[c.id_fornecedor] || {};
      const ex = execs.filter(e => e.id_contratacao === c.id_contratacao).sort((a, b) => (competenciaExec_(a) + ymd_(a.data)).localeCompare(competenciaExec_(b) + ymd_(b.data)));
      const parcs = Object.keys(parcelas).map(k => parcelas[k]).filter(p => p.id_contratacao === c.id_contratacao)
        .sort((a, b) => Number(a.num_parcela) - Number(b.num_parcela));
      const faturado = r2_(parcs.reduce((s, p) => s + Number(p.valor_previsto || 0), 0));
      const nfs = r2_(parcs.reduce((s, p) => s + Number((nfPorParc[p.id_parcela] || {}).valor || 0), 0));
      const pago = r2_(parcs.reduce((s, p) => s + Number((pgPorParc[p.id_parcela] || {}).valor || 0), 0));
      return {
        id_contratacao: c.id_contratacao, prestador: f.razao_social || '', documento: f.cnpj_cpf || '', status: c.status,
        unidade: c.unidade_execucao || 'palestra', valor_unitario: Number(c.valor_unitario || c.valor_parcela || 0),
        quantidade_contratada: Number(c.quantidade_contratada || 0) || '', valor_contratado: Number(c.valor_total_contratado || 0),
        inicio: ymd_(c.inicio_execucao), fim: ymd_(c.fim_execucao),
        qtd_executada: ex.reduce((s, e) => s + Number(e.quantidade || 0), 0),
        valor_executado: r2_(ex.reduce((s, e) => s + Number(e.valor_total || 0), 0)),
        faturado: faturado, nf: nfs, pago: pago,
        execucoes: ex.map(e => ({ id_execucao: e.id_execucao, data: ymd_(e.data), competencia: competenciaExec_(e), quantidade: Number(e.quantidade || 0),
          valor_unitario: Number(e.valor_unitario || 0), valor_total: Number(e.valor_total || 0), descricao: e.descricao || '',
          id_documento: e.id_documento || '', id_parcela: e.id_parcela || '',
          parcela: e.id_parcela && parcelas[e.id_parcela] ? { num: parcelas[e.id_parcela].num_parcela,
            competencia: ymd_(parcelas[e.id_parcela].competencia).slice(0, 7), status: parcelas[e.id_parcela].status } : null })),
        faturamentos: parcs.map(p => ({ id_parcela: p.id_parcela, num_parcela: p.num_parcela, competencia: ymd_(p.competencia).slice(0, 7),
          valor: Number(p.valor_previsto || 0), status: p.status, resumo: p.observacoes || '',
          tem_nf: !!nfPorParc[p.id_parcela], pago: Number((pgPorParc[p.id_parcela] || {}).valor || 0) }))
      };
    });
    const fixos = cs.filter(c => c.modalidade !== MODALIDADE_DEMANDA);
    const prevista = unidadesPrevistas_(r);
    const qtdExec = prestadores.reduce((s, p) => s + p.qtd_executada, 0);
    const orcado = Number(r.valor_total_orcado || 0);
    const comprometido = r2_(cs.reduce((s, c) => s + comprometidoContratacao_(c, execPorCtr), 0));
    return {
      id_rubrica: r.id_rubrica, codigo: r.codigo || '', descricao: r.descricao, unidade: r.unidade || '',
      qtd_prevista: prevista, qtd_executada: qtdExec, qtd_restante: prevista ? prevista - qtdExec : '',
      orcado: orcado,
      contratado: r2_(cs.reduce((s, c) => s + Number(c.valor_total_contratado || 0), 0)),
      executado: r2_(prestadores.reduce((s, p) => s + p.valor_executado, 0) + fixos.reduce((s, c) => s + Number(c.valor_total_contratado || 0), 0)),
      faturado: r2_(prestadores.reduce((s, p) => s + p.faturado, 0)),
      nf: r2_(prestadores.reduce((s, p) => s + p.nf, 0)),
      pago: r2_(prestadores.reduce((s, p) => s + p.pago, 0)),
      comprometido: comprometido, saldo: r2_(orcado - comprometido),
      contratos_fixos: fixos.length, prestadores: prestadores
    };
  });
  return {
    rubricas: res,
    pode_registrar: PERFIS_CONTRATACAO.indexOf(u.perfil) > -1,
    pode_faturar: PERFIS_CONFERENCIA.concat(['INSTITUICAO_CONTRATACAO']).indexOf(u.perfil) > -1
  };
}

// ---------------------------------------------------------------------------
// Registrar / editar / excluir execução

/** Confere os limites da rubrica (quantidade prevista e orçamento) e da contratação (quantidade contratada). */
function conferirLimitesExecucao_(c, qtdNova, valorNovo, ignorarId) {
  const r = buscar_('RUBRICAS', 'id_rubrica', c.id_rubrica) || {};
  const execs = lerExecucoes_().filter(e => e.id_execucao !== ignorarId);
  const daRubrica = execs.filter(e => e.id_rubrica === c.id_rubrica);
  const prevista = unidadesPrevistas_(r);
  const qtdRub = daRubrica.reduce((s, e) => s + Number(e.quantidade || 0), 0);
  const un = c.unidade_execucao || 'palestra';
  if (prevista && qtdRub + qtdNova > prevista) {
    throw new Error('Ultrapassa a quantidade prevista na rubrica "' + (r.descricao || '') + '": previstas ' + prevista +
      ', já registradas ' + qtdRub + ' (todos os prestadores), restam ' + Math.max(0, prevista - qtdRub) + '.');
  }
  const qc = Number(c.quantidade_contratada || 0);
  if (qc) {
    const qtdCtr = execs.filter(e => e.id_contratacao === c.id_contratacao).reduce((s, e) => s + Number(e.quantidade || 0), 0);
    if (qtdCtr + qtdNova > qc) {
      throw new Error('Ultrapassa a quantidade contratada com este prestador: ' + qc + ' ' + un + '(s), já registradas ' + qtdCtr +
        '. Faça um aditivo na contratação (aumente a quantidade) se for o caso.');
    }
  }
  // Orçamento: contratos mensais + por demanda (maior entre contratado e executado), com a nova execução
  const porCtr = {};
  execs.forEach(e => { porCtr[e.id_contratacao] = r2_((porCtr[e.id_contratacao] || 0) + Number(e.valor_total || 0)); });
  porCtr[c.id_contratacao] = r2_((porCtr[c.id_contratacao] || 0) + valorNovo);
  const comprometido = ler_('CONTRATACOES').filter(x => x.id_rubrica === c.id_rubrica && x.status !== 'Cancelada')
    .reduce((s, x) => s + comprometidoContratacao_(x, porCtr), 0);
  const orcado = Number(r.valor_total_orcado || 0);
  if (orcado && comprometido > orcado + 0.009) {
    throw new Error('Ultrapassa o orçamento da rubrica "' + (r.descricao || '') + '": orçado ' + brl_(orcado) +
      ', comprometido com esta execução ' + brl_(comprometido) + '.');
  }
}

function salvarExecucao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  prepararAbaExecucoes_();
  const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!c || c.modalidade !== MODALIDADE_DEMANDA) throw new Error('Escolha um prestador com contratação por demanda.');
  exigirAcessoProjeto_(u, c.id_projeto);
  if (c.status === 'Cancelada') throw new Error('Esta contratação está cancelada.');
  // Competência (mês/ano do serviço). Compatível com chamadas antigas que mandavam a data.
  const mc = String(d.competencia || '').match(/^(\d{4})-(\d{2})/) || String(ymd_(paraData_(d.data) || '')).match(/^(\d{4})-(\d{2})/);
  if (!mc) throw new Error('Informe a competência (mês/ano) da ' + (c.unidade_execucao || 'palestra') + '.');
  const competencia = mc[1] + '-' + mc[2];
  const data = new Date(+mc[1], +mc[2] - 1, 1);
  const qtd = Number(String(d.quantidade || '1').replace(',', '.'));
  if (!(qtd > 0)) throw new Error('Quantidade inválida.');
  const vu = paraNumero_(d.valor_unitario) || Number(c.valor_unitario || c.valor_parcela || 0);
  if (!(vu > 0)) throw new Error('Informe o valor unitário.');
  const total = r2_(qtd * vu);

  const atual = d.id_execucao ? buscar_('EXECUCOES', 'id_execucao', d.id_execucao) : null;
  if (d.id_execucao && !atual) throw new Error('Execução não encontrada.');
  if (atual && atual.id_parcela) throw new Error('Esta execução já foi faturada. Desfaça o faturamento para alterar.');
  conferirLimitesExecucao_(c, qtd, total, atual ? atual.id_execucao : '');

  let idDoc = atual ? atual.id_documento : '';
  if (d.arquivo && d.arquivo.base64) {
    idDoc = salvarArquivo_(u, c.id_projeto, c.id_contratacao, 'Outro',
      Object.assign({}, d.arquivo, { nome: 'Comprovante de execução ' + competencia + ' - ' + d.arquivo.nome })).id_documento;
  }
  const campos = { id_projeto: c.id_projeto, id_rubrica: c.id_rubrica, id_contratacao: c.id_contratacao, data: data, competencia: competencia,
    quantidade: qtd, valor_unitario: vu, valor_total: total, descricao: String(d.descricao || '').trim(), id_documento: idDoc };
  let idNova = '';
  if (atual) atualizar_('EXECUCOES', atual._linha, campos);
  else idNova = inserir_('EXECUCOES', Object.assign(campos, { id_parcela: '', criado_em: new Date(), criado_por: u.id_usuario })).id_execucao;
  registrarAuditoria_(u.id_usuario, 'EXECUCOES', atual ? atual.id_execucao : idNova, atual ? 'edicao' : 'registro', atual ? limpar_(atual) : null, campos);
  // Opcional: já gera a solicitação de NF/pagamento só com esta palestra (competência = a da execução)
  if (idNova && (d.faturar || d.faturar_competencia)) {
    return faturarExecucoes_(u, { id_contratacao: c.id_contratacao, ids: [idNova], competencia: competencia, enviar_email: d.enviar_email });
  }
  return obterExecucoes_(u, { id_projeto: c.id_projeto });
}

function excluirExecucao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  prepararAbaExecucoes_();
  const e = buscar_('EXECUCOES', 'id_execucao', d.id_execucao);
  if (!e) throw new Error('Execução não encontrada.');
  exigirAcessoProjeto_(u, e.id_projeto);
  if (e.id_parcela) throw new Error('Esta execução já foi faturada. Desfaça o faturamento antes de excluir.');
  conferirLinhas_('EXECUCOES');
  aba_('EXECUCOES').deleteRow(e._linha);
  invalidar_('EXECUCOES');
  registrarAuditoria_(u.id_usuario, 'EXECUCOES', e.id_execucao, 'exclusao', limpar_(e), null);
  return obterExecucoes_(u, { id_projeto: e.id_projeto });
}

// ---------------------------------------------------------------------------
// Faturamento: execuções de UM prestador → uma parcela (pedido de NF / pagamento)

function faturarExecucoes_(u, d) {
  const parc = faturarCore_(u, d);
  const r = obterExecucoes_(u, { id_projeto: parc.id_projeto });
  r.id_parcela_criada = parc.id_parcela;
  // Opcional: envia já o pedido de NF, com o mesmo modelo de e-mail do "Pedir notas fiscais" de Pagamentos
  if (d.enviar_email) {
    try {
      const s = solicitarNFs_(u, { ids: [parc.id_parcela], mes: somaMes_(competenciaDe_(parc), 1) });
      r.email = { enviados: s.enviados.length, falhas: s.falhas };
    } catch (e) { r.email = { enviados: 0, falhas: [{ motivo: e.message }] }; }
  }
  return r;
}

function faturarCore_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA.concat(['INSTITUICAO_CONTRATACAO']));
  prepararAbaExecucoes_();
  const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!c || c.modalidade !== MODALIDADE_DEMANDA) throw new Error('Escolha um prestador com contratação por demanda.');
  exigirAcessoProjeto_(u, c.id_projeto);
  const ids = d.ids || [];
  if (!ids.length) throw new Error('Marque as execuções que entram nesta nota.');
  const execs = ler_('EXECUCOES').filter(e => ids.indexOf(e.id_execucao) > -1);
  if (execs.length !== ids.length) throw new Error('Alguma execução marcada não foi encontrada. Atualize a tela.');
  execs.forEach(e => {
    if (e.id_contratacao !== c.id_contratacao) throw new Error('Todas as execuções da nota precisam ser do mesmo prestador.');
    if (e.id_parcela) throw new Error('A execução de ' + mesTitulo_(competenciaExec_(e)) + ' já está em outra solicitação de faturamento/pagamento.');
  });
  execs.sort((a, b) => (competenciaExec_(a) + ymd_(a.data)).localeCompare(competenciaExec_(b) + ymd_(b.data)));
  const m = String(d.competencia || '').match(/^(\d{4})-(\d{2})/) || competenciaExec_(execs[execs.length - 1]).match(/^(\d{4})-(\d{2})/);
  const comp = new Date(+m[1], +m[2] - 1, 1);
  const existentes = ler_('PARCELAS').filter(p => p.id_contratacao === c.id_contratacao);
  const num = existentes.reduce((mx, p) => Math.max(mx, Number(p.num_parcela) || 0), 0) + 1;
  const qtd = execs.reduce((s, e) => s + Number(e.quantidade || 0), 0);
  const un = c.unidade_execucao || 'palestra';
  const meses = [];
  execs.forEach(e => { const t = mesTitulo_(competenciaExec_(e)); if (meses.indexOf(t) === -1) meses.push(t); });
  const resumo = qtd + ' ' + un + (qtd === 1 ? '' : 's') + ' realizada' + (qtd === 1 ? '' : 's') + ' em ' + meses.join(', ');
  const descServ = descricaoServicoExecs_(execs);
  const parc = inserir_('PARCELAS', {
    id_parcela: gerarId('PARCELAS'), id_contratacao: c.id_contratacao, id_projeto: c.id_projeto, num_parcela: num,
    competencia: comp, valor_previsto: r2_(execs.reduce((s, e) => s + Number(e.valor_total || 0), 0)),
    primeiro_pagamento: !existentes.length, status: 'Prevista', observacoes: resumo, descricao_servico: descServ
  });
  execs.forEach(e => atualizar_('EXECUCOES', e._linha, { id_parcela: parc.id_parcela }));
  atualizar_('CONTRATACOES', c._linha, { num_parcelas: existentes.length + 1 });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', parc.id_parcela, 'faturar_execucoes', null, { execucoes: ids, resumo: resumo });
  return parc;
}

/** Desfaz um faturamento que ainda não tem NF nem pagamento: apaga a parcela e libera as execuções. */
function desfazerFaturamento_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA.concat(['INSTITUICAO_CONTRATACAO']));
  prepararAbaExecucoes_();
  const p = buscar_('PARCELAS', 'id_parcela', d.id_parcela);
  if (!p) throw new Error('Parcela não encontrada.');
  exigirAcessoProjeto_(u, p.id_projeto);
  const c = buscar_('CONTRATACOES', 'id_contratacao', p.id_contratacao) || {};
  if (c.modalidade !== MODALIDADE_DEMANDA) throw new Error('Só dá para desfazer faturamento de contratação por demanda.');
  if (ler_('NOTAS_FISCAIS').some(n => n.id_parcela === p.id_parcela) || ler_('PAGAMENTOS').some(g => g.id_parcela === p.id_parcela) ||
      ['Prevista', 'NF solicitada'].indexOf(p.status) === -1) {
    throw new Error('Esta solicitação já tem nota fiscal ou pagamento. Exclua o lançamento na parcela antes de desfazer.');
  }
  ler_('EXECUCOES').filter(e => e.id_parcela === p.id_parcela).forEach(e => atualizar_('EXECUCOES', e._linha, { id_parcela: '' }));
  conferirLinhas_('PARCELAS');
  aba_('PARCELAS').deleteRow(buscar_('PARCELAS', 'id_parcela', p.id_parcela)._linha);
  invalidar_('PARCELAS');
  const resto = ler_('PARCELAS').filter(x => x.id_contratacao === c.id_contratacao).length;
  atualizar_('CONTRATACOES', buscar_('CONTRATACOES', 'id_contratacao', c.id_contratacao)._linha, { num_parcelas: resto });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', p.id_parcela, 'desfazer_faturamento', limpar_(p), null);
  return obterExecucoes_(u, { id_projeto: p.id_projeto });
}
