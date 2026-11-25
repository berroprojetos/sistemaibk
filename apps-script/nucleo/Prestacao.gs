/**
 * Prestacao.gs – Prestação de contas bimestral no SIT (TCE-PR)
 *
 * Cada lançamento entra no bimestre pela DATA DO DÉBITO na conta (se não houver, a data do pagamento).
 * Os bimestres seguem o calendário: jan–fev = 1º, mar–abr = 2º, mai–jun = 3º, jul–ago = 4º,
 * set–out = 5º, nov–dez = 6º. A lista começa no bimestre do início da vigência.
 * Quando a parcela é marcada como "Lançada no SIT", ela fica presa àquele bimestre.
 */

const PERFIS_SIT = ['ADMIN', 'PRESTACAO_CONTAS'];
// Campos novos (layout de importação do SIT – Outras Receitas, Saldo Bancário e Devolução de Saldo)
const COLS_MOV_SIT = ['rendimento_bruto', 'ir_retido', 'ressarcimento_taxas', 'recursos_proprios', 'saldo_conta_corrente', 'saldo_conta_aplicacao'];
const COLS_BIM_SIT = ['devolucao_valor', 'devolucao_data', 'devolucao_forma', 'devolucao_documento', 'devolucao_credito'];

function ymDe_(v) {
  if (!v) return '';
  if (v instanceof Date) return mesTexto_(v);
  return String(v).slice(0, 7);
}
function difMeses_(ymA, ymB) {   // quantos meses de A até B
  const a = ymA.split('-').map(Number), b = ymB.split('-').map(Number);
  return (b[0] - a[0]) * 12 + (b[1] - a[1]);
}
function ultimoDia_(ym) { const d = primeiroDia_(ym); return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function fmtData_(d) { return d ? Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd') : ''; }
function dataPagto_(x) { const pg = x.pagamento || {}; return String(pg.data_debito_conta || pg.data_pagamento || ''); }
function valorPago_(x) {
  const pg = x.pagamento || {}, nf = x.nf || {};
  return Number(pg.valor || nf.valor || x.valor_previsto || 0);
}

/** Monta o contexto do projeto: bimestres, parcelas já classificadas e registros salvos. */
function contextoSIT_(u, idProjeto) {
  exigirAcessoProjeto_(u, idProjeto);
  const p = buscar_('PROJETOS', 'id_projeto', idProjeto);
  if (!p) throw new Error('Projeto não encontrado.');

  const parcelas = carregarParcelas_(u, idProjeto).filter(x => x.status_contratacao !== 'Cancelada');
  const registros = ler_('BIMESTRES').filter(b => b.id_projeto === idProjeto);

  const pagas = parcelas.filter(x => x.pagamento && dataPagto_(x));
  // Bimestres do calendário: jan–fev = 1º, mar–abr = 2º … nov–dez = 6º (recomeça a cada ano).
  // Internamente cada bimestre tem um número corrido a partir de janeiro do ano em que o projeto começa.
  // O 1º bimestre é o do recebimento do recurso (mesmo sem despesas: tem saldo e rendimentos a prestar).
  // Sem essa data, vale o início da vigência / celebração / primeiro pagamento — o que vier antes.
  const candidatos = [ymDe_(p.data_recebimento_recurso), ymDe_(p.inicio_vigencia) || ymDe_(p.data_celebracao)].filter(Boolean);
  const inicioYM = candidatos.sort()[0] ||
    pagas.map(x => dataPagto_(x).slice(0, 7)).sort()[0] || mesTexto_(new Date());
  const baseYM = inicioYM.slice(0, 4) + '-01';
  const numDoMes = ym => Math.floor(difMeses_(baseYM, ym) / 2) + 1;
  // Registros salvos são reconhecidos pelo mês de início do período (não dependem da numeração)
  const numPorId = {}; registros.forEach(b => { if (b.periodo_inicio) numPorId[b.id_bimestre] = numDoMes(ymDe_(b.periodo_inicio)); });

  // Classifica cada parcela paga no seu bimestre e no mês (mês do débito; se a parcela foi presa
  // a outro bimestre ao ser lançada no SIT, conta no último mês daquele bimestre)
  pagas.forEach(x => {
    const fixo = x.id_bimestre && numPorId[x.id_bimestre];
    const ym = dataPagto_(x).slice(0, 7);
    x.bimestre = fixo || numDoMes(ym);
    const iniB = somaMes_(baseYM, (x.bimestre - 1) * 2);
    x.mes_sit = (ym === iniB || ym === somaMes_(iniB, 1)) ? ym : somaMes_(iniB, 1);
  });

  // Do bimestre em que o projeto começa até o fim da vigência (ou 24 meses), e pelo menos até hoje / último pagamento
  const hojeYM = mesTexto_(new Date());
  const fimYM = ymDe_(p.fim_vigencia) || somaMes_(inicioYM, 23);
  const ultimo = [fimYM, hojeYM].concat(pagas.map(x => dataPagto_(x).slice(0, 7))).sort().pop();
  const primeiro = Math.min(numDoMes(inicioYM), pagas.reduce((m, x) => Math.min(m, x.bimestre), Infinity));
  const total = Math.max(numDoMes(ultimo), pagas.reduce((m, x) => Math.max(m, x.bimestre), 0));

  const bimestres = [];
  for (let n = Math.max(1, primeiro); n <= total; n++) {
    const ini = somaMes_(baseYM, (n - 1) * 2), fim = somaMes_(ini, 1);
    bimestres.push({ numero: n, inicio: ini + '-01', fim: fmtData_(ultimoDia_(fim)), meses: [ini, fim],
                     ano: Number(ini.slice(0, 4)), ordem: (Number(ini.slice(5, 7)) + 1) / 2 });
  }
  const mensais = ler_('MOVIMENTO_MENSAL').filter(m => m.id_projeto === idProjeto);
  return { projeto: p, parcelas: parcelas, pagas: pagas, registros: registros, bimestres: bimestres, baseYM: baseYM, mensais: mensais };
}

/** Parcelas cujo pagamento era esperado no bimestre (serviço do mês anterior) e ainda não têm comprovante. */
function semPagamentoNoBimestre_(ctx, b) {
  const hojeYM = mesTexto_(new Date());
  return ctx.parcelas.filter(x => {
    if (x.pagamento && x.pagamento.id_documento_comprovante) return false;
    const mesPagto = somaMes_(x.competencia_mes, 1);
    return b.meses.indexOf(mesPagto) > -1 && mesPagto <= hojeYM;
  });
}

/**
 * Movimento financeiro MÊS A MÊS (aba MOVIMENTO_MENSAL), em cadeia:
 *   saldo inicial do mês = saldo final do mês anterior
 *   saldo final = saldo inicial + outros créditos + rendimentos − despesas do mês
 * Só o saldo inicial do PRIMEIRO mês do projeto é digitado.
 * Bimestres preenchidos antes desta versão (valores do bimestre inteiro) continuam valendo:
 * enquanto os meses não forem informados, os valores antigos entram no 2º mês do bimestre.
 */
function movimentoMensal_(ctx) {
  const num = v => (v === '' || v === null || v === undefined) ? 0 : Number(v) || 0;
  const r2 = v => Math.round(v * 100) / 100;
  const temValor = v => v !== '' && v !== null && v !== undefined;
  const res = {};
  let anterior = null, primeiroMes = true;
  ctx.bimestres.forEach((b, ib) => {
    const reg = regDoBimestre_(ctx, b) || {};
    const linhasB = b.meses.map(ym => ctx.mensais.find(m => ymDe_(m.mes) === ym || String(m.mes) === ym));
    const legado = !linhasB[0] && !linhasB[1];
    b.meses.forEach((ym, im) => {
      const lin = linhasB[im] || {};
      const desp = ctx.pagas.filter(x => x.mes_sit === ym).reduce((s, x) => s + valorPago_(x), 0);
      let ini;
      if (primeiroMes) ini = temValor(lin.saldo_inicial) ? num(lin.saldo_inicial) : (ib === 0 ? num(reg.saldo_inicial) : 0);
      else ini = anterior;
      // valores antigos (do bimestre inteiro) ficam no 2º mês até serem separados
      const cred = legado ? (im === 1 ? num(reg.creditos) : 0) : num(lin.outros_creditos);
      // Rendimento: com o valor bruto informado, líquido = bruto − IR retido; sem ele, vale o valor digitado antes (líquido)
      const temBruto = !legado && temValor(lin.rendimento_bruto);
      const bruto = temBruto ? num(lin.rendimento_bruto) : '', ir = temBruto ? num(lin.ir_retido) : (temValor(lin.ir_retido) ? num(lin.ir_retido) : '');
      const rend = legado ? (im === 1 ? num(reg.rendimentos) : 0) : temBruto ? r2(bruto - num(lin.ir_retido)) : num(lin.rendimentos);
      const ressarc = legado ? 0 : num(lin.ressarcimento_taxas), proprios = legado ? 0 : num(lin.recursos_proprios);
      // Devolução de saldo (prestação final): sai no mês da devolução (ou no 2º mês do bimestre)
      const devYM = ymDe_(reg.devolucao_data);
      const devol = num(reg.devolucao_valor) && (devYM === ym || (b.meses.indexOf(devYM) === -1 && im === 1)) ? num(reg.devolucao_valor) : 0;
      // Saldo final = saldo inicial + rendimento líquido + outros créditos − despesas (− devolução, na prestação final).
      // Ressarcimento de taxas, recursos próprios e saldos do extrato são informados só para o SIT (não entram na conta).
      const fim = r2(ini + cred + rend - desp - devol);
      res[ym] = { mes: ym, saldo_inicial: r2(ini), outros_creditos: r2(cred), rendimentos: r2(rend), despesas: r2(desp),
                  rendimento_bruto: bruto === '' ? '' : r2(bruto), ir_retido: ir === '' ? '' : r2(ir),
                  ressarcimento_taxas: r2(ressarc), recursos_proprios: r2(proprios), devolucao: r2(devol),
                  // saldo bancário do fim do mês (extrato): conta corrente e conta de aplicação, separados — vai para o SIT mês a mês
                  saldo_conta_corrente: temValor(lin.saldo_conta_corrente) ? r2(num(lin.saldo_conta_corrente)) : '',
                  saldo_conta_aplicacao: temValor(lin.saldo_conta_aplicacao) ? r2(num(lin.saldo_conta_aplicacao)) : '',
                  saldo_final: fim, primeiro_mes: primeiroMes, legado: legado && (num(reg.creditos) || num(reg.rendimentos)) ? true : false,
                  id_mov: lin.id_mov || '' };
      anterior = fim; primeiroMes = false;
    });
  });
  return res;
}

/** Totais do bimestre a partir dos meses. */
function saldosBimestres_(ctx) {
  const mov = movimentoMensal_(ctx), res = {};
  ctx.bimestres.forEach((b, i) => {
    const m1 = mov[b.meses[0]], m2 = mov[b.meses[1]];
    const r2 = v => Math.round(v * 100) / 100;
    res[b.numero] = { inicial: m1.saldo_inicial, final: m2.saldo_final, despesas: r2(m1.despesas + m2.despesas),
                      creditos: r2(m1.outros_creditos + m2.outros_creditos), rendimentos: r2(m1.rendimentos + m2.rendimentos),
                      ressarcimento: r2(m1.ressarcimento_taxas + m2.ressarcimento_taxas), recursos_proprios: r2(m1.recursos_proprios + m2.recursos_proprios),
                      devolucao: r2(m1.devolucao + m2.devolucao),
                      primeiro: i === 0, meses: [m1, m2] };
  });
  return res;
}

function regDoBimestre_(ctx, b) {
  return ctx.registros.find(r => ymDe_(r.periodo_inicio) === b.meses[0]);
}

function resumoBimestre_(ctx, b) {
  const lanc = ctx.pagas.filter(x => x.bimestre === b.numero);
  const reg = regDoBimestre_(ctx, b) || {};
  const conferidas = lanc.filter(x => idxStatus_(x.status) >= idxStatus_('Conferida')).length;
  const lancadas = lanc.filter(x => x.status === 'Lançada no SIT').length;
  const semPg = semPagamentoNoBimestre_(ctx, b).length;
  const hoje = fmtData_(new Date());
  let status = reg.status === 'Enviado ao SIT' ? 'Enviado ao SIT'
    : b.fim >= hoje ? 'Aberto'
    : (lanc.length && conferidas === lanc.length && !semPg) ? 'Pronto para envio' : 'Em conferência';
  if (!lanc.length && !semPg && status !== 'Enviado ao SIT') {
    const temConta = reg.saldo_final !== '' && reg.saldo_final !== undefined && reg.saldo_final !== null;
    status = b.inicio > hoje ? 'Futuro' : b.fim < hoje ? (temConta ? 'Pronto para envio' : 'Sem despesas') : status;
  }
  return {
    numero: b.numero, inicio: b.inicio, fim: b.fim, meses: b.meses, ano: b.ano, ordem: b.ordem,
    rotulo: b.ordem + 'º bimestre/' + b.ano,
    qtd: lanc.length, valor: lanc.reduce((s, x) => s + valorPago_(x), 0),
    conferidas: conferidas, lancadas: lancadas, sem_pagamento: semPg,
    status: status, id_bimestre: reg.id_bimestre || '',
    enviado_cit_em: reg.enviado_cit_em ? fmtData_(new Date(reg.enviado_cit_em)) : '',
    prazo_envio: reg.prazo_envio ? fmtData_(new Date(reg.prazo_envio)) : ''
  };
}

function listarBimestres_(u, d) {
  const ctx = contextoSIT_(u, d.id_projeto);
  return {
    projeto: { id_projeto: ctx.projeto.id_projeto, sigla: ctx.projeto.sigla, nome_projeto: ctx.projeto.nome_projeto,
               termo: textoDeData_(ctx.projeto.termo_fomento_cit).replace(/^'/, ''),
               // dados do termo para o SIT (identificação que vai em todo registro da importação)
               orgao: String(ctx.projeto.orgao || ''), cnpj_concedente: String(ctx.projeto.cnpj_concedente || '').replace(/^'/, ''),
               data_celebracao: ctx.projeto.data_celebracao ? fmtData_(new Date(ctx.projeto.data_celebracao)) : '' },
    bimestres: ctx.bimestres.map(b => resumoBimestre_(ctx, b)),
    projetos: projetosPermitidos_(u).map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto })),
    pode_editar: PERFIS_SIT.indexOf(u.perfil) > -1,
    pode_conferir: PERFIS_CONFERENCIA.indexOf(u.perfil) > -1,
    pode_lancar_direto: PERFIS_LANCAMENTO_DIRETO.indexOf(u.perfil) > -1
  };
}

function obterBimestre_(u, d) {
  const ctx = contextoSIT_(u, d.id_projeto);
  const n = Number(d.numero) || 1;
  const b = ctx.bimestres.find(x => x.numero === n);
  if (!b) throw new Error('Bimestre não encontrado.');
  const limpa = x => { const o = Object.assign({}, x); delete o._linha; return o; };

  const lanc = ctx.pagas.filter(x => x.bimestre === n)
    .sort((a, z) => (dataPagto_(a) + a.contratado).localeCompare(dataPagto_(z) + z.contratado));

  // Totais por rubrica: no bimestre, acumulado até ele e saldo do orçamento
  const rubs = ler_('RUBRICAS').filter(r => r.id_projeto === d.id_projeto);
  const porRub = {};
  rubs.forEach(r => { porRub[r.descricao] = { rubrica: r.descricao, codigo: r.codigo || '', orcado: Number(r.valor_total_orcado || 0), no_bimestre: 0, acumulado: 0, qtd: 0 }; });
  ctx.pagas.forEach(x => {
    if (x.bimestre > n) return;
    const k = x.rubrica || '(sem rubrica)';
    const o = porRub[k] = porRub[k] || { rubrica: k, codigo: '', orcado: 0, no_bimestre: 0, acumulado: 0, qtd: 0 };
    o.acumulado += valorPago_(x);
    if (x.bimestre === n) { o.no_bimestre += valorPago_(x); o.qtd++; }
  });
  const rubricas = Object.keys(porRub).map(k => porRub[k])
    .map(o => Object.assign(o, { saldo: o.orcado - o.acumulado }))
    .sort((a, z) => String(a.codigo).localeCompare(String(z.codigo), 'pt-BR', { numeric: true }) || a.rubrica.localeCompare(z.rubrica));

  const reg = regDoBimestre_(ctx, b) || {};
  const regLimpo = reg.id_bimestre ? limpar_(reg) : {};
  const anteriores = ctx.pagas.filter(x => x.bimestre < n).reduce((s, x) => s + valorPago_(x), 0);
  const saldos = saldosBimestres_(ctx)[n];
  const recebYM = ymDe_(ctx.projeto.data_recebimento_recurso);
  // Prestação final: bimestre do fim da vigência (ou depois dele) — só nele aparece a devolução de saldo
  const fimVigYM = ymDe_(ctx.projeto.fim_vigencia);
  const final = (!!fimVigYM && b.meses[1] >= fimVigYM) || Number(reg.devolucao_valor || 0) > 0;

  return Object.assign(resumoBimestre_(ctx, b), {
    lancamentos: lanc.map(limpa),
    sem_pagamento: semPagamentoNoBimestre_(ctx, b).map(limpa),
    rubricas: rubricas,
    registro: regLimpo,
    total_anteriores: anteriores,
    saldo_inicial_calc: saldos.inicial,
    saldo_final_calc: saldos.final,
    primeiro_bimestre: saldos.primeiro,
    meses_mov: saldos.meses,
    recurso_neste_bimestre: !!recebYM && b.meses.indexOf(recebYM) > -1,
    valor_recurso: Number(ctx.projeto.valor_total || 0),
    total_projeto: Number(ctx.projeto.valor_total || 0),
    prestacao_final: final,
    // Valores lidos dos extratos anexados (para o botão "Puxar dos extratos")
    extratos: sugestoesExtratoSIT_(u, d.id_projeto, b.meses),
    // Arquivos dos extratos anexados nesta tela (conta corrente, aplicação, BB Rende Mais), mês a mês
    extratos_anexos: anexosExtratoSIT_(d.id_projeto, b.meses),
    // Arquivos de cada pagamento para anexar no SIT (contrato, cotação, NF e comprovante) e o nome no padrão da equipe
    arquivos_sit: arquivosPagamentosSIT_(ctx, lanc)
  });
}

/** Cria (se preciso) e devolve a linha do bimestre na aba BIMESTRES. */
function registroBimestre_(u, idProjeto, numero) {
  const ctx = contextoSIT_(u, idProjeto);
  const b = ctx.bimestres.find(x => x.numero === Number(numero));
  if (!b) throw new Error('Bimestre não encontrado.');
  let reg = regDoBimestre_(ctx, b);
  if (!reg) {
    const novo = inserir_('BIMESTRES', { id_projeto: idProjeto, numero: b.ordem + 'º/' + b.ano, periodo_inicio: paraData_(b.inicio),
                                         periodo_fim: paraData_(b.fim), status: 'Aberto' });
    reg = buscar_('BIMESTRES', 'id_bimestre', novo.id_bimestre);
  }
  return { reg: reg, ctx: ctx, b: b };
}

function salvarBimestre_(u, d) {
  exigirPerfil_(u, PERFIS_SIT);
  const r = registroBimestre_(u, d.id_projeto, d.numero);
  const campos = { periodo_inicio: paraData_(r.b.inicio), periodo_fim: paraData_(r.b.fim) };
  if (d.observacoes !== undefined) campos.observacoes = String(d.observacoes || '').trim();
  const numOuVazio = v => (v === '' || v === null || v === undefined) ? '' : (paraNumero_(v) === '' ? '' : paraNumero_(v));

  // Devolução de saldo: só na prestação final
  if (d.devolucao) {
    const dv = d.devolucao, valor = numOuVazio(dv.valor);
    if (valor !== '' && valor < 0) throw new Error('O valor da devolução não pode ser negativo.');
    if (valor) {
      if (!dv.data) throw new Error('Informe a data da devolução.');
      if (!dv.documento) throw new Error('Informe o nº do documento da devolução.');
      if (['Concedente', 'Tomador'].indexOf(dv.credito) === -1) throw new Error('Informe se a devolução é para crédito do Concedente ou do Tomador.');
    }
    campos.devolucao_valor = valor || '';
    campos.devolucao_data = valor ? paraData_(dv.data) : '';
    campos.devolucao_forma = valor ? String(dv.forma || '') : '';
    campos.devolucao_documento = valor ? texto_(dv.documento) : '';
    campos.devolucao_credito = valor ? String(dv.credito) : '';
  }
  // grava antes de recalcular a cadeia (a devolução entra no saldo)
  if (d.devolucao) atualizar_('BIMESTRES', r.reg._linha, campos);

  // Valores digitados mês a mês (outros créditos e rendimentos; saldo inicial só no 1º mês do projeto)
  const primeiroMesProjeto = r.ctx.bimestres[0].meses[0];
  (d.meses || []).forEach(m => {
    if (r.b.meses.indexOf(m.mes) === -1) return;
    const dados = { outros_creditos: paraNumero_(m.outros_creditos) || 0, rendimentos: paraNumero_(m.rendimentos) || 0,
                    atualizado_em: new Date(), atualizado_por: u.id_usuario };
    // Rendimento de aplicação: bruto, IR retido e líquido (líquido = bruto − IR)
    if (m.rendimento_bruto !== undefined) {
      const bruto = numOuVazio(m.rendimento_bruto), ir = numOuVazio(m.ir_retido);
      dados.rendimento_bruto = bruto; dados.ir_retido = ir;
      if (bruto !== '') dados.rendimentos = Math.round((bruto - (ir || 0)) * 100) / 100;
    }
    if (m.ressarcimento_taxas !== undefined) dados.ressarcimento_taxas = numOuVazio(m.ressarcimento_taxas);
    if (m.recursos_proprios !== undefined) dados.recursos_proprios = numOuVazio(m.recursos_proprios);
    if (m.saldo_conta_corrente !== undefined) dados.saldo_conta_corrente = numOuVazio(m.saldo_conta_corrente);
    if (m.saldo_conta_aplicacao !== undefined) dados.saldo_conta_aplicacao = numOuVazio(m.saldo_conta_aplicacao);
    if (m.mes === primeiroMesProjeto) dados.saldo_inicial = paraNumero_(m.saldo_inicial) || 0;
    const existente = r.ctx.mensais.find(x => ymDe_(x.mes) === m.mes || String(x.mes) === m.mes);
    if (existente) atualizar_('MOVIMENTO_MENSAL', existente._linha, dados);
    else inserir_('MOVIMENTO_MENSAL', Object.assign({ id_projeto: d.id_projeto, mes: m.mes, id_bimestre: r.reg.id_bimestre }, dados));
  });

  // Recalcula a cadeia inteira e grava os valores calculados de cada mês e de cada bimestre já aberto
  gravarSaldosCalculados_(u, d.id_projeto, r.b.numero);

  if (d.enviar !== undefined) {
    if (d.enviar) {
      const lanc = r.ctx.pagas.filter(x => x.bimestre === r.b.numero);
      campos.status = 'Enviado ao SIT';
      campos.enviado_cit_em = paraData_(d.data_envio) || new Date();
      campos.enviado_por = u.id_usuario;
      campos.total_despesas = lanc.reduce((s, x) => s + valorPago_(x), 0);
    } else {
      campos.status = 'Em conferência'; campos.enviado_cit_em = ''; campos.enviado_por = '';
    }
  }
  atualizar_('BIMESTRES', r.reg._linha, campos);
  registrarAuditoria_(u.id_usuario, 'BIMESTRES', r.reg.id_bimestre, d.enviar ? 'enviar_sit' : 'salvar', null, { meses: d.meses, campos: campos });
  return true;
}

/**
 * Grava, a partir do bimestre informado, os valores calculados (saldo inicial, despesas e saldo final)
 * de cada mês já registrado e os totais de cada bimestre já aberto — prontos para a exportação ao SIT.
 */
function gravarSaldosCalculados_(u, idProjeto, aPartirDe) {
  const ctx = contextoSIT_(u, idProjeto), sal = saldosBimestres_(ctx);
  ctx.bimestres.forEach(b => {
    if (b.numero < aPartirDe) return;
    const s = sal[b.numero];
    const reg = regDoBimestre_(ctx, b);
    s.meses.forEach(m => {
      const lin = ctx.mensais.find(x => ymDe_(x.mes) === m.mes || String(x.mes) === m.mes);
      const calc = { saldo_inicial: m.saldo_inicial, despesas: m.despesas, saldo_final: m.saldo_final };
      if (lin) atualizar_('MOVIMENTO_MENSAL', lin._linha, calc);
    });
    if (reg) atualizar_('BIMESTRES', reg._linha, { saldo_inicial: s.inicial, creditos: s.creditos, rendimentos: s.rendimentos,
                                                  total_despesas: s.despesas, saldo_final: s.final });
  });
}

/** Marca (ou desmarca) parcelas conferidas como "Lançada no SIT", presas a este bimestre. */
function marcarLancadasSIT_(u, d) {
  exigirPerfil_(u, PERFIS_SIT);
  const r = registroBimestre_(u, d.id_projeto, d.numero);
  const ok = [], ignoradas = [];
  (d.ids || []).forEach(id => {
    const x = buscar_('PARCELAS', 'id_parcela', id);
    if (!x || x.id_projeto !== d.id_projeto) return ignoradas.push({ id: id, motivo: 'parcela de outro projeto' });
    if (d.desfazer) {
      if (x.status !== 'Lançada no SIT') return ignoradas.push({ id: id, motivo: 'não estava lançada' });
      atualizar_('PARCELAS', x._linha, { status: 'Conferida', id_bimestre: '' });
    } else {
      if (x.status === 'Lançada no SIT') return ignoradas.push({ id: id, motivo: 'já estava lançada' });
      if (idxStatus_(x.status) < idxStatus_('Conferida')) return ignoradas.push({ id: id, motivo: 'ainda não foi conferida' });
      atualizar_('PARCELAS', x._linha, { status: 'Lançada no SIT', id_bimestre: r.reg.id_bimestre });
    }
    registrarAuditoria_(u.id_usuario, 'PARCELAS', id, d.desfazer ? 'desfazer_lancado_sit' : 'lancado_sit', { status: x.status }, { bimestre: r.b.numero });
    ok.push(id);
  });
  return { alteradas: ok, ignoradas: ignoradas };
}
/**
 * Valores dos extratos anexados (aba Extratos) para os meses do bimestre:
 * rendimento (crédito na poupança/aplicação), IR/IOF debitado, estorno/ressarcimento de tarifas e saldos finais.
 * A tela usa só para sugerir ("Puxar dos extratos"); nada é gravado aqui.
 */
function sugestoesExtratoSIT_(u, idProjeto, meses) {
  try {
    const ext = obterExtratos_(u, { id_projeto: idProjeto });
    const r2 = v => Math.round(Number(v || 0) * 100) / 100;
    const res = {};
    (ext.meses || []).filter(m => meses.indexOf(m.mes) > -1).forEach(m => {
      const temSaldo = v => v !== '' && v !== null && v !== undefined;
      const imps = m.arquivos || {};
      res[m.mes] = {
        rendimento_bruto: r2(m.rendimentos), ir_retido: r2(m.ir_iof), ressarcimento_taxas: r2(m.estornos),
        saldo_aplicacao: temSaldo(m.saldo_poupanca) || temSaldo(m.saldo_aplicacao) ? r2(Number(m.saldo_poupanca || 0) + Number(m.saldo_aplicacao || 0)) : '',
        tem_extrato: Object.keys(imps).length > 0
      };
    });
    // Saldo final da conta corrente (vem da leitura do extrato da CC)
    ler_('IMPORTACOES_EXTRATO').filter(x => x.id_projeto === idProjeto && x.conta === 'CC').forEach(x => {
      const m = compExt_(x.competencia);
      if (res[m] && x.saldo_final !== '' && x.saldo_final !== null && x.saldo_final !== undefined) res[m].saldo_cc = r2(x.saldo_final);
    });
    // Extratos anexados pela tela Extratos (leitura do PDF guardada na aba TAXAS_EXTRATO): completa o que faltar
    try {
      const tem = v => v !== '' && v !== null && v !== undefined;
      linhasTaxasExt_(idProjeto).forEach(lin => {
        const m = ymDe_(lin.mes); if (meses.indexOf(m) === -1) return;
        const cc = jsonExt_(lin.leitura_CC) || {}, po = jsonExt_(lin.leitura_APLIC) || {}, rf = jsonExt_(lin.leitura_RENDE) || {};
        if (!cc.lido && !po.lido && !rf.lido) return;
        const r = res[m] = res[m] || {};
        if (r.tem_extrato) { if (!tem(r.saldo_cc) && cc.lido && tem(cc.saldo_final)) r.saldo_cc = r2(cc.saldo_final); return; }
        r.tem_extrato = true;
        r.rendimento_bruto = r2(Number(po.rendimento_bruto || 0) + Number(rf.rendimento_bruto || 0));
        r.ir_retido = r2(Number(po.ir_iof || 0) + Number(rf.ir_iof || 0));
        r.ressarcimento_taxas = r2(Number(cc.estornos || 0) + Number(po.estornos || 0));
        if (cc.lido && tem(cc.saldo_final)) r.saldo_cc = r2(cc.saldo_final);
        if ((po.lido && tem(po.saldo_final)) || (rf.lido && tem(rf.saldo_final))) r.saldo_aplicacao = r2(Number(po.saldo_final || 0) + Number(rf.saldo_final || 0));
      });
    } catch (e) {}
    return res;
  } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------
// Extratos bancários anexados na Prestação SIT (até 3 por mês: conta corrente, aplicação e BB Rende Mais)
// Ficam na aba DOCUMENTOS (tipo "Extrato SIT", com competencia e tipo_extrato) e na pasta "03 Extratos bancários" do projeto.
// Nome do arquivo: "Outubro/2026 558.2025 Extrato CC - Agencia 4638-8 Conta 35666-2.pdf"

const TIPOS_EXTRATO_SIT = { CC: 'Extrato CC', APLIC: 'Extrato Aplicação', RENDE: 'Extrato BB Rende Mais' };
const TIPO_DOC_EXTRATO_SIT = 'Extrato SIT';

function anexosExtratoSIT_(idProjeto, meses) {
  const res = {};
  meses.forEach(m => { res[m] = {}; });
  ler_('DOCUMENTOS').filter(x => x.id_projeto === idProjeto && x.tipo === TIPO_DOC_EXTRATO_SIT).forEach(x => {
    const m = ymDe_(x.competencia);
    if (!res[m] || !TIPOS_EXTRATO_SIT[x.tipo_extrato]) return;
    res[m][x.tipo_extrato] = { id_documento: x.id_documento, nome: x.nome_arquivo, drive_file_id: x.drive_file_id,
      url: x.url, enviado_em: x.enviado_em ? fmtData_(new Date(x.enviado_em)) : '' };
  });
  return res;
}

function nomeExtratoSIT_(p, ym, tipo, ext) {
  const termo = String(p.termo_fomento_cit || '').trim().replace(/\//g, '.');
  const agencia = textoDeData_(p.agencia).trim(), conta = textoDeData_(p.conta_corrente).trim();
  const falta = [];
  if (!termo) falta.push('termo de fomento');
  if (!agencia) falta.push('agência');
  if (!conta) falta.push('conta corrente');
  if (falta.length) throw new Error('Preencha nos dados do projeto: ' + falta.join(', ') + ' (fazem parte do nome do arquivo do extrato).');
  const mes = MESES_PT[Number(ym.slice(5, 7)) - 1];
  return mes.charAt(0).toUpperCase() + mes.slice(1) + '/' + ym.slice(0, 4) + ' ' + termo + ' ' + TIPOS_EXTRATO_SIT[tipo] +
    ' - Agencia ' + agencia + ' Conta ' + conta + ext;
}

/** Anexa (ou substitui) o extrato de um mês. O arquivo anterior do mesmo mês e tipo vai para a lixeira do Drive. */
function anexarExtratoSIT_(u, d) {
  exigirPerfil_(u, PERFIS_SIT);
  return gravarExtratoMes_(u, d);
}

/**
 * Grava o extrato do mês (usado pela Prestação SIT e pela tela Extratos — é o mesmo arquivo nas duas).
 * d.leitura (opcional): o que o navegador leu do PDF (taxas, saldo, rendimentos) — vai para a aba TAXAS_EXTRATO.
 */
function gravarExtratoMes_(u, d) {
  exigirAcessoProjeto_(u, d.id_projeto);
  const p = buscar_('PROJETOS', 'id_projeto', d.id_projeto);
  if (!p) throw new Error('Projeto não encontrado.');
  const ym = String(d.mes || '').slice(0, 7), tipo = String(d.tipo || '');
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('Mês inválido.');
  if (!TIPOS_EXTRATO_SIT[tipo]) throw new Error('Tipo de extrato inválido.');
  const a = d.arquivo;
  if (!a || !a.base64) throw new Error('Selecione o arquivo do extrato.');
  const bytes = Utilities.base64Decode(a.base64);
  if (bytes.length > LIMITE_ARQUIVO_MB * 1024 * 1024) throw new Error('Arquivo maior que ' + LIMITE_ARQUIVO_MB + ' MB.');
  const nomeOrig = String(a.nome || '');
  const ext = nomeOrig.indexOf('.') > -1 ? '.' + nomeOrig.split('.').pop().toLowerCase() : '.pdf';
  const nome = nomeExtratoSIT_(p, ym, tipo, ext);

  const pasta = subpastaProjeto_(d.id_projeto, '03 Extratos bancários');
  const file = pasta.createFile(Utilities.newBlob(bytes, a.mime || 'application/pdf', nome));

  // Substituição: tira o anterior (lixeira do Drive, recuperável por 30 dias)
  const anteriores = ler_('DOCUMENTOS').filter(x => x.id_projeto === d.id_projeto && x.tipo === TIPO_DOC_EXTRATO_SIT &&
    ymDe_(x.competencia) === ym && x.tipo_extrato === tipo);
  anteriores.forEach(x => { try { DriveApp.getFileById(x.drive_file_id).setTrashed(true); } catch (e) {} });
  if (anteriores.length) excluirLinhas_('DOCUMENTOS', anteriores.map(x => x._linha));

  const doc = inserir_('DOCUMENTOS', { id_projeto: d.id_projeto, id_contratacao: '', tipo: TIPO_DOC_EXTRATO_SIT, nome_arquivo: nome,
    nome_original: nomeOrig, drive_file_id: file.getId(), url: file.getUrl(), mime_type: a.mime || 'application/pdf',
    enviado_por: u.id_usuario, enviado_em: new Date(), competencia: ym, tipo_extrato: tipo });
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', doc.id_documento, anteriores.length ? 'substituir_extrato_sit' : 'anexar_extrato_sit',
    anteriores.length ? { arquivos: anteriores.map(x => x.nome_arquivo) } : null, { arquivo: nome, mes: ym, tipo: tipo });
  try { gravarLeituraExtrato_(u, d.id_projeto, ym, tipo, d.leitura === undefined ? null : d.leitura); } catch (e) {}
  return anexosExtratoSIT_(d.id_projeto, [ym])[ym];
}

function excluirExtratoSIT_(u, d) {
  exigirPerfil_(u, PERFIS_SIT);
  return apagarExtratoMes_(u, d);
}

function apagarExtratoMes_(u, d) {
  const x = buscar_('DOCUMENTOS', 'id_documento', d.id_documento);
  if (!x || x.tipo !== TIPO_DOC_EXTRATO_SIT) throw new Error('Extrato não encontrado.');
  exigirAcessoProjeto_(u, x.id_projeto);
  try { DriveApp.getFileById(x.drive_file_id).setTrashed(true); } catch (e) {}
  excluirLinhas_('DOCUMENTOS', [x._linha]);
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', x.id_documento, 'excluir_extrato_sit', limpar_(x), null);
  const ym = ymDe_(x.competencia);
  try { gravarLeituraExtrato_(u, x.id_projeto, ym, x.tipo_extrato, false); } catch (e) {}
  return anexosExtratoSIT_(x.id_projeto, [ym])[ym];
}

// ---------------------------------------------------------------------------
// Documentos para anexar no SIT (o navegador junta os PDFs e baixa um .zip)
// 1º pagamento da contratação: "Contrato <função> - <nome>.pdf" + "AAAAMMDD <rubrica> Cotação + NF + Comp Pagto.pdf"
// demais pagamentos:           "AAAAMMDD <rubrica> NF + Comp Pagto.pdf"
// mais de uma pessoa na mesma rubrica: entra o 1º nome ("20260806 Educador Social Ester + NF + Comp Pagto.pdf")

function primeiroNomeSIT_(f) {
  const nome = String(f.nome_completo || f.representante_nome || f.razao_social || '').replace(/^[\d.\-\/\s]+/, '').trim();
  const p = nome.split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}
function nomeCompletoSIT_(f) {
  const n = String(f.nome_completo || f.representante_nome || f.razao_social || '').replace(/^[\d.\-\/\s]+/, '').trim();
  return n.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(Da|De|Do|Das|Dos|E)\s/g, m => m.toLowerCase());
}
function limparNomeArqSIT_(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function arquivosPagamentosSIT_(ctx, lanc) {
  const docs = {}; ler_('DOCUMENTOS').forEach(x => { docs[x.id_documento] = x; });
  const ctrs = {}; ler_('CONTRATACOES').filter(c => c.id_projeto === ctx.projeto.id_projeto).forEach(c => { ctrs[c.id_contratacao] = c; });
  const forns = {}; ler_('FORNECEDORES').forEach(f => { forns[f.id_fornecedor] = f; });
  const rubs = {}; ler_('RUBRICAS').filter(r => r.id_projeto === ctx.projeto.id_projeto).forEach(r => { rubs[r.id_rubrica] = r; });
  const cots = ler_('COTACOES');
  const arq = id => { const x = docs[id]; return x && x.drive_file_id ? { id: x.drive_file_id, nome: x.nome_arquivo || '', mime: x.mime_type || '' } : null; };

  // 1º pagamento de cada contratação (pela data do pagamento, em todo o projeto)
  const primeiro = {};
  ctx.pagas.forEach(x => {
    const dtp = dataPagto_(x);
    if (!primeiro[x.id_contratacao] || dtp + x.id_parcela < primeiro[x.id_contratacao].k) primeiro[x.id_contratacao] = { k: dtp + x.id_parcela, id: x.id_parcela };
  });
  // Rubricas (pela descrição) com mais de uma pessoa contratada
  const pessoasRub = {};
  Object.keys(ctrs).forEach(k => {
    const c = ctrs[k]; if (c.status === 'Cancelada') return;
    // mesma limpeza do nome do arquivo (ex.: "Capacitador/Professor" → "capacitador professor"), senão a contagem não casa
    const desc = limparNomeArqSIT_((rubs[c.id_rubrica] || {}).descricao || c.objeto || '').toLowerCase();
    (pessoasRub[desc] = pessoasRub[desc] || {})[c.id_fornecedor] = true;
  });

  const res = {};
  lanc.forEach(x => {
    const c = ctrs[x.id_contratacao] || {}, f = forns[c.id_fornecedor] || {}, r = rubs[c.id_rubrica] || {};
    const rub = limparNomeArqSIT_(r.descricao || c.objeto || x.rubrica || 'Pagamento');
    const multi = Object.keys(pessoasRub[rub.toLowerCase()] || {}).length > 1;
    const base = rub + (multi && primeiroNomeSIT_(f) ? ' ' + primeiroNomeSIT_(f) : '');
    const ehPrimeiro = (primeiro[x.id_contratacao] || {}).id === x.id_parcela;
    const data = String((x.pagamento || {}).data_pagamento || dataPagto_(x) || '').slice(0, 10).replace(/-/g, '');   // data do pagamento
    const sufixo = ehPrimeiro ? ' Cotação + NF + Comp Pagto' : (multi ? ' + NF + Comp Pagto' : ' NF + Comp Pagto');

    // Cotação: arquivo anexado na contratação; senão, as cotações do sistema (a vencedora primeiro; assinada, se houver)
    let cotacoes = [];
    if (ehPrimeiro) {
      cotacoes = Object.keys(docs).map(k => docs[k]).filter(dd => dd.id_contratacao === x.id_contratacao && dd.tipo === 'Cotação')
        .map(dd => arq(dd.id_documento)).filter(Boolean);
      if (!cotacoes.length) {
        cotacoes = cots.filter(q => q.id_contratacao && q.id_contratacao === x.id_contratacao)
          .sort((a, z) => (z.vencedora === true) - (a.vencedora === true))
          .map(q => arq(q.id_documento_assinado) || arq(q.id_documento)).filter(Boolean);
      }
    }
    // Contrato (só no 1º pagamento; compra não tem contrato)
    let contrato = null;
    if (ehPrimeiro && c.id_doc_contrato && !ehCompra_(c)) {
      const a = arq(c.id_doc_contrato);
      if (a) {
        let nome = String(a.nome).replace(/\.[a-z0-9]+$/i, '').replace(/^Contrato\s*-\s*(?=Contrato\b)/i, '').trim();
        // nome que a equipe já deu ao contrato ("Contrato <função> - <nome>"); senão monta com a rubrica e o nome do contratado
        if (!/^Contrato\s+\S/i.test(nome) || /CTR-\d+|^Contrato\s+(assinado|minuta)/i.test(nome)) nome = 'Contrato ' + rub + ' - ' + nomeCompletoSIT_(f);
        contrato = Object.assign(a, { nome_sit: limparNomeArqSIT_(nome) + '.pdf' });
      }
    }
    res[x.id_parcela] = {
      primeiro: ehPrimeiro,
      nome: limparNomeArqSIT_(data + ' ' + base + sufixo) + '.pdf',
      contrato: contrato,
      cotacoes: cotacoes,
      nf: arq((x.nf || {}).id_documento),
      comprovante: arq((x.pagamento || {}).id_documento_comprovante),
      contratado: x.contratado || f.razao_social || ''
    };
  });
  return res;
}
