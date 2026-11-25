/**
 * Pagamentos.gs – ciclo mensal de pagamentos
 *
 * Mês de pagamento M  →  paga os serviços prestados em M-1 (competência).
 * Etapas (cada uma pode ser feita por uma pessoa diferente):
 *   1. Pedir NF por e-mail ............ equipe de gestão         → "NF solicitada"
 *   2. Anexar a NF (só o arquivo) ..... quem recebe as notas     → "NF recebida"
 *   3. Liberar o lote ................. gestão ou instituição    → "Liberada para pagamento"
 *   4. Anexar o comprovante ........... quem paga (instituição)  → "Paga"
 *   5. Conferir e preencher dados SIT . prestação de contas      → "Conferida"
 * Arquivos ficam na pasta do mês: Projeto/06 Pagamentos/AAAA-MM ...
 */

const PERFIS_LANCAMENTO_DIRETO = ['ADMIN', 'PRESTACAO_CONTAS'];
const PERFIS_CONFERENCIA = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO'];
const ORDEM_STATUS = ['Prevista', 'NF solicitada', 'NF recebida', 'NF conferida', 'Liberada para pagamento',
  'Paga', 'Conciliada', 'Conferida', 'Lançada no SIT'];

const EMAIL_NF_PADRAO = {
  assunto: 'Nota Fiscal – Projeto "{{projeto_nome}}" – {{mes_referencia}}',
  corpo: [
    '{{prezado_a}} {{nome}},',
    '',
    'Conforme previsto no contrato de prestação de serviços referente ao Projeto **“{{projeto_nome}}”**, vinculado ao ' +
      '**Termo de Fomento nº {{termo_fomento}} – {{orgao}}**, solicitamos o envio da **Nota Fiscal referente aos serviços ' +
      'prestados no mês de {{mes_referencia}}**.',
    '',
    '**Tomador do Serviço:** {{instituicao}}',
    '**CNPJ:** {{instituicao_cnpj}}',
    '',
    'A Nota Fiscal deverá conter:',
    '- Descrição: {{descricao_nf}};',
    '- Referência ao **Termo de Fomento nº {{termo_fomento}} – {{orgao}}**;',
    '- Projeto: **{{projeto_nome}}**;',
    '- **Período de execução dos serviços** correspondente ao mês de **{{mes_referencia}}**.',
    '- Valor: **{{valor}}**',
    '',
    'Após o recebimento da NF e conferência da documentação, daremos andamento ao processo de pagamento conforme previsto. ' +
      '**Gentileza enviar a NF até o {{dia_util_nf}} dia útil do mês ({{prazo}}), para que o pagamento seja realizado até o 5º dia útil do mês, no caso, {{vencimento}}.**',
    '',
    'Ficamos no aguardo.',
    '',
    'Atenciosamente,',
    '{{assinatura}}'
  ].join('\n'),
  assinatura: 'Equipe de Projetos – {{instituicao_sigla}}',
  dia_util: '3'
};

// ---------------------------------------------------------------------------
// Datas: meses e dias úteis

const MESES_TITULO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro',
  'Outubro', 'Novembro', 'Dezembro'];

function mesTexto_(d) { return Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM'); }
function primeiroDia_(ym) { const p = String(ym).split('-').map(Number); return new Date(p[0], p[1] - 1, 1); }
function somaMes_(ym, n) { const d = primeiroDia_(ym); return mesTexto_(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
function mesExtenso_(ym) { const d = primeiroDia_(ym); return MESES_PT[d.getMonth()] + '/' + d.getFullYear(); }
function mesTitulo_(ym) { const d = primeiroDia_(ym); return MESES_TITULO[d.getMonth()] + '/' + d.getFullYear(); }
function idxStatus_(s) { const i = ORDEM_STATUS.indexOf(s); return i < 0 ? 0 : i; }
function competenciaDe_(x) { return x.competencia instanceof Date ? mesTexto_(x.competencia) : String(x.competencia).slice(0, 7); }

function pascoa_(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** Feriados nacionais (Carnaval e Corpus Christi são ponto facultativo e contam como dia útil). */
function feriados_(ano) {
  const p = pascoa_(ano);
  const lista = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]]
    .map(([m, d]) => new Date(ano, m - 1, d));
  lista.push(new Date(p.getFullYear(), p.getMonth(), p.getDate() - 2)); // Sexta-feira Santa
  return lista.map(d => d.toDateString());
}

/** N-ésimo dia útil do mês (AAAA-MM). */
function diaUtil_(ym, n) {
  const d = primeiroDia_(ym), fer = feriados_(d.getFullYear());
  let conta = 0;
  while (true) {
    const fds = d.getDay() === 0 || d.getDay() === 6;
    if (!fds && fer.indexOf(d.toDateString()) === -1 && ++conta === n) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
}

// ---------------------------------------------------------------------------
// Configuração do e-mail

function definirConfig_(chave, valor, descricao) {
  const c = ler_('CONFIG').find(x => x.chave === chave);
  if (c) atualizar_('CONFIG', c._linha, { valor: valor });
  else aba_('CONFIG').appendRow([chave, valor, descricao || '']);
  invalidar_('CONFIG');
}

// Frase antiga do prazo (modelos salvos antes de 15/11/2026): troca uma vez pela nova e passa o prazo da NF para o 3º dia útil
const FRASE_PRAZO_ANTIGA_RX = /Gentileza enviar a NF até o \{\{\s*\w*\s*\}\}º? ?dia útil do mês, no caso, \{\{\s*prazo\s*\}\}\.|Gentileza enviar a NF até o \d+º dia útil do mês, no caso, \{\{\s*prazo\s*\}\}\./;
const FRASE_PRAZO_NOVA = 'Gentileza enviar a NF até o {{dia_util_nf}} dia útil do mês ({{prazo}}), para que o pagamento seja realizado até o 5º dia útil do mês, no caso, {{vencimento}}.';

/** Formas de pagamento aceitas no lançamento (inclui as antigas para não invalidar registros). */
const FORMAS_PAGAMENTO = ['PIX', 'TED', 'DOC', 'Boleto', 'Transferência'];

function modeloEmailNF_() {
  const salvo = config_('email_nf_corpo');
  if (salvo && FRASE_PRAZO_ANTIGA_RX.test(salvo)) {
    try {
      definirConfig_('email_nf_corpo', salvo.replace(FRASE_PRAZO_ANTIGA_RX, FRASE_PRAZO_NOVA));
      definirConfig_('email_nf_dia_util', '3', 'Prazo da NF: n-ésimo dia útil do mês');
    } catch (e) {}
  }
  return {
    assunto: config_('email_nf_assunto') || EMAIL_NF_PADRAO.assunto,
    corpo: config_('email_nf_corpo') || EMAIL_NF_PADRAO.corpo,
    assinatura: config_('email_nf_assinatura') || EMAIL_NF_PADRAO.assinatura,
    dia_util: String(config_('email_nf_dia_util') || EMAIL_NF_PADRAO.dia_util)
  };
}

function preencher_(texto, campos) {
  return String(texto).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (campos[k] !== undefined ? campos[k] : m));
}

/** Texto com **negrito** e linhas "- item" → HTML do e-mail (valores já vêm escapados). */
function textoParaHtml_(texto) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const neg = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const linhas = String(texto).split('\n');
  const html = [];
  let lista = [];
  const fechaLista = () => { if (lista.length) { html.push('<ul style="margin:6px 0 10px">' + lista.join('') + '</ul>'); lista = []; } };
  linhas.forEach(l => {
    if (/^\s*-\s+/.test(l)) { lista.push('<li style="margin:4px 0">' + neg(l.replace(/^\s*-\s+/, '')) + '</li>'); return; }
    fechaLista();
    html.push(l.trim() ? '<div>' + neg(l) + '</div>' : '<div><br></div>');
  });
  fechaLista();
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">' + html.join('') + '</div>';
}

function textoSemMarcas_(texto) { return String(texto).replace(/\*\*/g, '').replace(/^\s*-\s+/gm, '• '); }

const CONECTORES_NOME = ['de', 'da', 'do', 'das', 'dos', 'e'];
function nomeCurto_(nome) {
  const partes = String(nome || '').replace(/^[\d.\-\/\s]+/, '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));
  if (!partes.length) return '';
  return partes[1] && CONECTORES_NOME.indexOf(partes[1].toLowerCase()) === -1 && partes.length > 2
    ? partes[0] + ' ' + partes[1] : partes[0];
}

// ---------------------------------------------------------------------------
// Leitura

function carregarParcelas_(u, filtroProjeto) {
  const projetos = {};
  projetosPermitidos_(u).forEach(p => { if (!filtroProjeto || p.id_projeto === filtroProjeto) projetos[p.id_projeto] = p; });
  const insts = {}; ler_('INSTITUICOES').forEach(i => { insts[i.id_instituicao] = i; });
  const ctrs = {}; ler_('CONTRATACOES').forEach(c => { ctrs[c.id_contratacao] = c; });
  const forns = {}; ler_('FORNECEDORES').forEach(f => { forns[f.id_fornecedor] = f; });
  const rubs = {}; ler_('RUBRICAS').forEach(r => { rubs[r.id_rubrica] = r; });
  const docs = {}; ler_('DOCUMENTOS').forEach(d => { docs[d.id_documento] = d; });
  const cotVenc = {}; ler_('COTACOES').forEach(q => { if (q.vencedora === true && q.id_contratacao && q.data_cotacao) cotVenc[q.id_contratacao] = q.data_cotacao; });
  const dt = v => v instanceof Date ? Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd') : String(v || '');
  // Se houver mais de uma NF/pagamento na mesma parcela, mostra o PRIMEIRO (o mesmo que a gravação altera)
  // e marca a duplicidade para aparecer como aviso.
  const nfs = {}, nfsQtd = {}; ler_('NOTAS_FISCAIS').forEach(n => { nfsQtd[n.id_parcela] = (nfsQtd[n.id_parcela] || 0) + 1; if (!nfs[n.id_parcela]) nfs[n.id_parcela] = n; });
  const pags = {}, pagsQtd = {}; ler_('PAGAMENTOS').forEach(p => { pagsQtd[p.id_parcela] = (pagsQtd[p.id_parcela] || 0) + 1; if (!pags[p.id_parcela]) pags[p.id_parcela] = p; });

  return ler_('PARCELAS').filter(x => projetos[x.id_projeto]).map(x => {
    const c = ctrs[x.id_contratacao] || {}, f = forns[c.id_fornecedor] || {}, p = projetos[x.id_projeto] || {};
    const i = insts[p.id_instituicao] || {}, r = rubs[c.id_rubrica] || {};
    const nf = nfs[x.id_parcela], pg = pags[x.id_parcela];
    const o = limpar_(x);
    o._linha = x._linha;
    o.competencia_mes = competenciaDe_(x);
    // Vencimento: 5º dia útil do mês de pagamento (mês seguinte ao dos serviços)
    o.vencimento = vencimentoDe_(o.competencia_mes);
    o.pausada = parcelaPausada_(x);
    o.pausa_motivo = x.pausa_motivo || '';
    o.projeto_sigla = p.sigla || p.id_projeto;
    o.projeto_nome = p.nome_projeto || '';
    o.termo_fomento = p.termo_fomento_cit || '';
    o.orgao = String(p.orgao || '').trim();
    o.instituicao_sigla = i.sigla || '';
    o.instituicao_nome = i.razao_social || '';
    o.instituicao_cnpj = i.cnpj || '';
    o.instituicao_email = i.email_contato || '';
    o.contratado = f.razao_social || '';
    o.contratado_cnpj = f.cnpj_cpf || '';
    // Até 2 e-mails (o 2º recebe junto, como destinatário): "a@x.com, b@y.com"
    o.contratado_email = [f.email, f.email_2].join(' ').split(/[;,\s]+/).map(e => e.trim().toLowerCase())
      .filter((e, i, a) => /@/.test(e) && a.indexOf(e) === i).join(', ');
    o.contratado_representante = f.representante_nome || '';
    o.contratado_pix = String(f.chave_pix || '').trim();
    o.contratado_banco = String(f.banco || '').trim();
    o.contratado_agencia = String(f.agencia || '').trim();
    o.contratado_conta = String(f.conta || '').trim();
    o.contratado_genero = f.representante_genero || '';
    o.objeto = c.objeto || '';
    o.descricao_nf_ctr = c.descricao_nf || '';
    o.modalidade = c.modalidade || '';
    o.execucao_resumo = c.modalidade === MODALIDADE_DEMANDA ? String(x.observacoes || '') : '';
    o.descricao_servico = c.modalidade === MODALIDADE_DEMANDA ? String(x.descricao_servico || '').trim() : '';
    o.rubrica = r.descricao || '';
    o.tipo_despesa = c.tipo_despesa || r.tipo_despesa || '';
    o.eh_compra = ehCompra_(c);
    o.classificacao_contabil = r.classificacao_contabil || '';
    o.tipo_despesa_sit = r.tipo_despesa_sit || '';   // código do SIT escolhido na rubrica (senão, sai da classificação)
    // Datas para o SIT: cotação da vencedora e contrato assinado; em compras, contrato = cotação
    o.data_cotacao = dt(c.data_cotacao || cotVenc[c.id_contratacao]);
    o.data_contrato = o.tipo_despesa === 'Prestação de serviço' ? dt(c.data_assinatura_contrato) : (dt(c.data_assinatura_contrato) || o.data_cotacao);
    o.total_parcelas = c.num_parcelas || '';
    o.status_contratacao = c.status || '';
    if (nf) { o.nf = limpar_(nf); o.nf.url = docs[nf.id_documento] ? docs[nf.id_documento].url : ''; }
    if (nf && nfsQtd[x.id_parcela] > 1) o.nf.divergencias = [o.nf.divergencias, nfsQtd[x.id_parcela] + ' notas lançadas nesta parcela – use “Excluir lançamento” e lance de novo'].filter(Boolean).join(' | ');
    if (pg) { o.pagamento = limpar_(pg); o.pagamento.url = docs[pg.id_documento_comprovante] ? docs[pg.id_documento_comprovante].url : ''; }
    o.dados_sit_ok = !!(nf && nf.numero && nf.data_emissao && Number(nf.valor) > 0 &&
                        pg && pg.forma_pagamento && pg.data_pagamento && pg.data_debito_conta && Number(pg.valor) > 0);
    return o;
  });
}

const VENC_CACHE_ = {};
/** Vencimento das parcelas: 5º dia útil (sem fins de semana e feriados) do mês de pagamento. */
function vencimentoDe_(competenciaMes) {
  if (!/^\d{4}-\d{2}$/.test(String(competenciaMes || ''))) return '';
  const mesPg = somaMes_(competenciaMes, 1);
  if (!VENC_CACHE_[mesPg]) VENC_CACHE_[mesPg] = Utilities.formatDate(diaUtil_(mesPg, 5), 'America/Sao_Paulo', 'yyyy-MM-dd');
  return VENC_CACHE_[mesPg];
}

function parcelaPausada_(x) {
  return x.pausada === true || String(x.pausada).toUpperCase() === 'TRUE';
}

/**
 * Pausa (ou retoma) parcelas que ainda não têm nota nem pagamento.
 * Pausada = não aparece como pendência em Pagamentos nem recebe pedido de NF, até ser retomada.
 */
function pausarParcelas_(u, d) {
  exigirPerfil_(u, ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO']);
  const ids = d.ids || [];
  if (!ids.length) throw new Error('Escolha as parcelas.');
  const pausar = d.pausar !== false;
  const comMov = {};
  ler_('NOTAS_FISCAIS').forEach(n => { if (n.id_parcela) comMov[n.id_parcela] = true; });
  ler_('PAGAMENTOS').forEach(g => { if (g.id_parcela) comMov[g.id_parcela] = true; });
  const feitas = [], ignoradas = [];
  ids.forEach(id => {
    const x = parcelaComAcesso_(u, id);
    if (pausar && (comMov[id] || ['Prevista', 'NF solicitada'].indexOf(x.status) === -1)) { ignoradas.push(id); return; }
    atualizar_('PARCELAS', buscar_('PARCELAS', 'id_parcela', id)._linha, pausar
      ? { pausada: true, pausa_motivo: String(d.motivo || '').trim(), pausada_em: new Date(), pausada_por: u.id_usuario }
      : { pausada: false, pausa_motivo: '', pausada_em: '', pausada_por: '' });
    feitas.push(id);
  });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', '', pausar ? 'pausar' : 'retomar', null, { feitas: feitas, motivo: d.motivo || '' });
  return { feitas: feitas, ignoradas: ignoradas };
}

function listarMesPagamentos_(u, d) {
  const mes = /^\d{4}-\d{2}$/.test(d.mes || '') ? d.mes : mesTexto_(new Date());
  // Período: 'mes' (padrão), 'ano' (todos os meses de pagamento do ano de d.mes) ou 'todos'
  const periodo = ['ano', 'todos'].indexOf(d.periodo) > -1 ? d.periodo : 'mes';
  const ano = mes.slice(0, 4);
  const competencia = somaMes_(mes, -1);
  // Faixa de competências (mês do serviço = mês de pagamento − 1)
  const compIni = periodo === 'ano' ? somaMes_(ano + '-01', -1) : periodo === 'todos' ? '0000-00' : competencia;
  const compFim = periodo === 'ano' ? somaMes_(ano + '-12', -1) : periodo === 'todos' ? '9999-99' : competencia;
  const carregadas = carregarParcelas_(u, d.id_projeto || '').filter(x => x.status_contratacao !== 'Cancelada');
  const naFaixa = x => periodo === 'todos' || (x.competencia_mes >= compIni && x.competencia_mes <= compFim);
  const pausadas = carregadas.filter(x => x.pausada && !x.pagamento && (periodo === 'mes' || naFaixa(x)));   // ficam fora das pendências
  const todas = carregadas.filter(x => !(x.pausada && !x.pagamento));
  const doMes = todas.filter(naFaixa).sort((a, b) => String(a.competencia_mes).localeCompare(String(b.competencia_mes)));
  const atrasadas = periodo === 'todos' ? [] :
    todas.filter(x => x.competencia_mes < compIni && idxStatus_(x.status) < idxStatus_('Conferida'));
  const limpa = x => { const o = Object.assign({}, x); delete o._linha; return o; };
  const conta = minimo => doMes.filter(x => idxStatus_(x.status) >= idxStatus_(minimo)).length;
  const modelo = modeloEmailNF_();

  return {
    mes: mes,
    periodo: periodo,
    ano: ano,
    competencia: competencia,
    mes_extenso: mesExtenso_(mes),
    competencia_extenso: mesExtenso_(competencia),
    prazo_nf: Utilities.formatDate(diaUtil_(mes, Number(modelo.dia_util) || 3), 'America/Sao_Paulo', 'dd/MM/yyyy'),
    parcelas: doMes.map(limpa),
    atrasadas: atrasadas.map(limpa),
    pausadas: pausadas.map(limpa),
    vencimento: vencimentoDe_(competencia),
    pode_pausar: ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO'].indexOf(u.perfil) > -1,
    resumo: {
      total: doMes.length,
      valor_total: doMes.reduce((s, x) => s + Number(x.valor_previsto || 0), 0),
      solicitadas: conta('NF solicitada'),
      recebidas: conta('NF recebida'),
      liberadas: conta('Liberada para pagamento'),
      pagas: conta('Paga'),
      conferidas: conta('Conferida'),
      valor_pago: doMes.filter(x => x.pagamento).reduce((s, x) => s + Number(x.pagamento.valor || x.valor_previsto || 0), 0)
    },
    projetos: projetosPermitidos_(u).map(p => ({ id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto })),
    modelo_email: modelo,
    pode_lancar_direto: PERFIS_LANCAMENTO_DIRETO.indexOf(u.perfil) > -1,
    pode_conferir: PERFIS_CONFERENCIA.indexOf(u.perfil) > -1,
    pode_editar_modelo: PERFIS_LANCAMENTO_DIRETO.indexOf(u.perfil) > -1
  };
}

function parcelaComAcesso_(u, idParcela) {
  const x = buscar_('PARCELAS', 'id_parcela', idParcela);
  if (!x) throw new Error('Parcela não encontrada.');
  exigirAcessoProjeto_(u, x.id_projeto);
  return x;
}

function pastaDoMes_(idProjeto, competencia) {
  const pagamento = somaMes_(competencia, 1);
  const raiz = subpastaProjeto_(idProjeto, '06 Pagamentos');
  const nome = pagamento + ' – pagamento de ' + mesExtenso_(pagamento) + ' (serviços de ' + mesExtenso_(competencia) + ')';
  const it = raiz.getFoldersByName(nome);
  return it.hasNext() ? it.next() : raiz.createFolder(nome);
}

// ---------------------------------------------------------------------------
// 1. Pedido de NF por e-mail

function camposEmail_(x, modelo) {
  const mesPagamento = somaMes_(x.competencia_mes, 1);
  const nomePessoa = String(x.contratado_representante || x.contratado || '').replace(/^[\d.\-\/\s]+/, '');
  const g = generoDe_(x.contratado_genero, nomePessoa).g;
  const funcao = String(x.rubrica || '').toLowerCase();
  const base = {
    prezado_a: g === 'F' ? 'Prezada' : 'Prezado',
    nome: nomeCurto_(x.contratado_representante || x.contratado),
    contratado: x.contratado,
    mes_referencia: mesTitulo_(x.competencia_mes),
    valor: brl_(x.valor_previsto).replace('R$ ', 'R$'),
    funcao: funcao,
    projeto_nome: x.projeto_nome,
    projeto_sigla: x.projeto_sigla,
    termo_fomento: x.termo_fomento,
    orgao: x.orgao || 'SEDEF/PR',
    instituicao: x.instituicao_nome,
    instituicao_sigla: x.instituicao_sigla,
    instituicao_cnpj: x.instituicao_cnpj,
    parcela: x.num_parcela + (x.total_parcelas ? '/' + x.total_parcelas : ''),
    prazo: Utilities.formatDate(diaUtil_(mesPagamento, Number(modelo.dia_util) || 3), 'America/Sao_Paulo', 'dd/MM/yy'),
    dia_util_nf: (Number(modelo.dia_util) || 3) + 'º',
    // Pagamento: sempre o 5º dia útil do mês de pagamento (fins de semana e feriados nacionais fora)
    vencimento: Utilities.formatDate(diaUtil_(mesPagamento, 5), 'America/Sao_Paulo', 'dd/MM/yy')
  };
  base.descricao_nf = x.descricao_nf_ctr
    ? x.descricao_nf_ctr
    : 'prestação de serviço de **' + funcao + '**';
  if (x.descricao_servico) base.descricao_nf = 'prestação de serviço de **' + x.descricao_servico + '**';   // por demanda: descrição digitada na execução
  else if (x.execucao_resumo) base.descricao_nf += ' – ' + x.execucao_resumo;      // por demanda (antigas): palestras e datas
  base.assinatura = preencher_(modelo.assinatura, base);
  return base;
}

function montarEmail_(x, modelo) {
  const campos = camposEmail_(x, modelo);
  // Modelos de e-mail antigos com "SEDEF/PR" escrito: usa o órgão cadastrado no projeto
  const orgao = s => x.orgao ? String(s || '').replace(/SEDEF\s*\/\s*PR/g, x.orgao) : s;
  const assunto = textoSemMarcas_(preencher_(orgao(modelo.assunto), campos));
  const texto = preencher_(orgao(modelo.corpo), campos);
  return { para: x.contratado_email, responder_para: x.instituicao_email, assunto: assunto,
           html: textoParaHtml_(texto), texto: textoSemMarcas_(texto) };
}

function solicitarNFs_(u, d) {
  const ids = d.ids || [];
  if (!ids.length) throw new Error('Selecione pelo menos uma parcela.');
  const modelo = modeloEmailNF_();
  const porId = {};
  carregarParcelas_(u, '').forEach(x => { porId[x.id_parcela] = x; });

  const enviados = [], falhas = [];
  ids.forEach(id => {
    const x = porId[id];
    if (!x) { falhas.push({ id: id, motivo: 'sem acesso ou não encontrada' }); return; }
    if (x.pausada) { falhas.push({ id: id, nome: x.contratado, motivo: 'parcela pausada' }); return; }
    if (!x.contratado_email) { falhas.push({ id: id, nome: x.contratado, motivo: 'contratado sem e-mail cadastrado' }); return; }
    try {
      const e = montarEmail_(x, modelo);
      const opcoes = { to: e.para, subject: e.assunto, body: e.texto, htmlBody: e.html,
                       name: 'Projetos – ' + (x.instituicao_sigla || x.projeto_sigla) };
      if (e.responder_para) opcoes.replyTo = e.responder_para;
      MailApp.sendEmail(opcoes);
      const campos = { nf_solicitada_em: new Date(), nf_solicitada_por: u.id_usuario };
      if (idxStatus_(x.status) < idxStatus_('NF solicitada')) campos.status = 'NF solicitada';
      atualizar_('PARCELAS', x._linha, campos);
      enviados.push({ id: id, nome: x.contratado, email: x.contratado_email });
    } catch (err) {
      falhas.push({ id: id, nome: x.contratado, motivo: err.message });
    }
  });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', '', 'solicitar_nf', null, { enviados: enviados.length, falhas: falhas.length });
  return { enviados: enviados, falhas: falhas, cota_restante: MailApp.getRemainingDailyQuota(), mes: listarMesPagamentos_(u, d) };
}

function previaEmailNF_(u, d) {
  const x = carregarParcelas_(u, '').find(p => p.id_parcela === d.id_parcela);
  if (!x) throw new Error('Parcela não encontrada.');
  return montarEmail_(x, d.modelo || modeloEmailNF_());
}

function salvarModeloEmail_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  if (!String(d.assunto || '').trim() || !String(d.corpo || '').trim()) throw new Error('Preencha assunto e texto do e-mail.');
  definirConfig_('email_nf_assunto', String(d.assunto), 'Assunto do e-mail de pedido de NF');
  definirConfig_('email_nf_corpo', String(d.corpo), 'Texto do e-mail de pedido de NF');
  definirConfig_('email_nf_assinatura', String(d.assinatura || EMAIL_NF_PADRAO.assinatura), 'Assinatura do e-mail de NF');
  definirConfig_('email_nf_dia_util', String(parseInt(d.dia_util, 10) || 5), 'Prazo da NF: n-ésimo dia útil do mês');
  registrarAuditoria_(u.id_usuario, 'CONFIG', 'email_nf', 'edicao');
  return modeloEmailNF_();
}

function restaurarModeloEmail_(u) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  ['email_nf_assunto', 'email_nf_corpo', 'email_nf_assinatura', 'email_nf_dia_util'].forEach(k => definirConfig_(k, ''));
  return modeloEmailNF_();
}

// ---------------------------------------------------------------------------
// 2. Anexar a nota fiscal (só o arquivo)

function anexarNF_(u, d) {
  const x = parcelaComAcesso_(u, d.id_parcela);
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione o arquivo da nota fiscal.');
  const doc = salvarArquivoEmPasta_(u, x.id_projeto, x.id_contratacao, 'Nota fiscal', d.arquivo, pastaDoMes_(x.id_projeto, competenciaDe_(x)));

  const existente = ler_('NOTAS_FISCAIS').find(z => z.id_parcela === x.id_parcela);
  const campos = { id_parcela: x.id_parcela, id_projeto: x.id_projeto, id_documento: doc.id_documento,
                   enviada_em: new Date(), enviada_por: u.id_usuario };
  if (existente) atualizar_('NOTAS_FISCAIS', existente._linha, campos);
  else inserir_('NOTAS_FISCAIS', Object.assign({ tipo_documento: 'Nota fiscal' }, campos));

  if (idxStatus_(x.status) < idxStatus_('NF recebida')) atualizar_('PARCELAS', x._linha, { status: 'NF recebida' });
  registrarAuditoria_(u.id_usuario, 'NOTAS_FISCAIS', x.id_parcela, 'anexar_nf', null, { doc: doc.id_documento });
  padronizarDocsParcela_(x.id_parcela);
  return true;
}

// ---------------------------------------------------------------------------
// 3. Liberar o lote

function liberarParcelas_(u, d) {
  const ids = d.ids || [];
  if (!ids.length) throw new Error('Selecione as parcelas a liberar.');
  const comNF = {};
  ler_('NOTAS_FISCAIS').forEach(n => { if (n.id_documento) comNF[n.id_parcela] = true; });
  const liberadas = [], ignoradas = [];
  ids.forEach(id => {
    const x = parcelaComAcesso_(u, id);
    if (!comNF[id]) { ignoradas.push({ id: id, motivo: 'sem nota fiscal anexada' }); return; }
    if (idxStatus_(x.status) >= idxStatus_('Liberada para pagamento')) { ignoradas.push({ id: id, motivo: 'já liberada' }); return; }
    atualizar_('PARCELAS', x._linha, { status: 'Liberada para pagamento', liberada_em: new Date(), liberada_por: u.id_usuario });
    liberadas.push(id);
  });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', '', 'liberar', null, { liberadas: liberadas });
  return { liberadas: liberadas, ignoradas: ignoradas };
}

// ---------------------------------------------------------------------------
// 4. Anexar o comprovante (quem paga)

function anexarComprovante_(u, d) {
  const x = parcelaComAcesso_(u, d.id_parcela);
  if (!d.arquivo || !d.arquivo.base64) throw new Error('Selecione o arquivo do comprovante.');
  const nf = ler_('NOTAS_FISCAIS').find(z => z.id_parcela === x.id_parcela && z.id_documento);
  if (!nf) throw new Error('A nota fiscal desta parcela ainda não foi anexada.');
  const direto = PERFIS_LANCAMENTO_DIRETO.indexOf(u.perfil) > -1;
  if (idxStatus_(x.status) < idxStatus_('Liberada para pagamento') && !direto) {
    throw new Error('Esta parcela ainda não foi liberada para pagamento.');
  }

  const doc = salvarArquivoEmPasta_(u, x.id_projeto, x.id_contratacao, 'Comprovante de pagamento', d.arquivo,
    pastaDoMes_(x.id_projeto, competenciaDe_(x)));
  const existente = ler_('PAGAMENTOS').find(z => z.id_parcela === x.id_parcela);
  const campos = { id_parcela: x.id_parcela, id_projeto: x.id_projeto, id_documento_comprovante: doc.id_documento,
                   pago_por: u.id_usuario, registrado_em: new Date() };
  const dataPg = paraData_(d.data_pagamento);
  if (dataPg) {
    campos.data_pagamento = dataPg;
    // Débito na conta: começa igual à data do pagamento (na conferência pode ser corrigido)
    if (!existente || !existente.data_debito_conta) campos.data_debito_conta = dataPg;
  }
  if (existente) atualizar_('PAGAMENTOS', existente._linha, campos);
  else inserir_('PAGAMENTOS', Object.assign({ forma_pagamento: 'PIX' }, campos));

  const cp = {};
  if (idxStatus_(x.status) < idxStatus_('Paga')) cp.status = 'Paga';
  if (!x.liberada_em) { cp.liberada_em = new Date(); cp.liberada_por = u.id_usuario; }
  if (Object.keys(cp).length) atualizar_('PARCELAS', x._linha, cp);
  registrarAuditoria_(u.id_usuario, 'PAGAMENTOS', x.id_parcela, 'anexar_comprovante', null, { doc: doc.id_documento });
  padronizarDocsParcela_(x.id_parcela);
  return true;
}

// ---------------------------------------------------------------------------
// 5. Conferência: dados que vão para o SIT

function conferirParcela_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  const x = parcelaComAcesso_(u, d.id_parcela);
  const nfAtual = ler_('NOTAS_FISCAIS').find(z => z.id_parcela === x.id_parcela);
  const pgAtual = ler_('PAGAMENTOS').find(z => z.id_parcela === x.id_parcela);
  if (!nfAtual || !nfAtual.id_documento) throw new Error('Falta anexar a nota fiscal.');
  if (!pgAtual || !pgAtual.id_documento_comprovante) throw new Error('Falta anexar o comprovante de pagamento.');

  const n = d.nf || {}, p = d.pagamento || {};
  const tipo = n.tipo_documento || 'Nota fiscal';
  if (LISTAS.tipo_documento_fiscal.indexOf(tipo) === -1) throw new Error('Tipo de documento inválido.');
  const forma = p.forma_pagamento || 'PIX';
  if (FORMAS_PAGAMENTO.indexOf(forma) === -1) throw new Error('Forma de pagamento inválida.');

  const camposNF = {
    tipo_documento: tipo, numero: texto_(n.numero), data_emissao: paraData_(n.data_emissao),
    valor: paraNumero_(n.valor), descricao: String(n.descricao || '').trim(),
    cnpj_emitente: texto_(n.cnpj_emitente), razao_social_emitente: String(n.razao_social_emitente || '').trim()
  };
  const camposPG = {
    forma_pagamento: forma, num_identificacao_pix: texto_(p.num_identificacao_pix),
    data_pagamento: paraData_(p.data_pagamento), data_debito_conta: paraData_(p.data_debito_conta) || paraData_(p.data_pagamento),
    valor: paraNumero_(p.valor)
  };

  // Conferências automáticas
  const c = buscar_('CONTRATACOES', 'id_contratacao', x.id_contratacao) || {};
  const f = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor) || {};
  const div = [];
  if (camposNF.cnpj_emitente && f.cnpj_cpf && soDigitos_(camposNF.cnpj_emitente) !== soDigitos_(f.cnpj_cpf)) div.push('CNPJ da nota diferente do contratado');
  if (camposNF.valor && Math.abs(camposNF.valor - Number(x.valor_previsto || 0)) > 0.009) div.push('valor da nota diferente do previsto (' + brl_(x.valor_previsto) + ')');
  if (camposNF.valor && camposPG.valor && Math.abs(camposNF.valor - camposPG.valor) > 0.009) div.push('valor pago diferente do valor da nota');
  camposNF.divergencias = div.join(' | ');
  camposNF.conferida_por = u.id_usuario;
  camposNF.conferida_em = new Date();

  atualizar_('NOTAS_FISCAIS', nfAtual._linha, camposNF);
  atualizar_('PAGAMENTOS', pgAtual._linha, camposPG);

  if (d.marcar_conferida) {
    const faltando = [];
    if (!camposNF.numero) faltando.push('número da NF');
    if (!camposNF.data_emissao) faltando.push('data de emissão');
    if (!(camposNF.valor > 0)) faltando.push('valor da NF');
    if (!camposPG.data_pagamento) faltando.push('data do pagamento');
    if (!(camposPG.valor > 0)) faltando.push('valor pago');
    if (faltando.length) throw new Error('Dados salvos, mas para marcar como conferida falta: ' + faltando.join(', ') + '.');
    if (idxStatus_(x.status) < idxStatus_('Conferida')) atualizar_('PARCELAS', x._linha, { status: 'Conferida' });
  }
  registrarAuditoria_(u.id_usuario, 'PARCELAS', x.id_parcela, d.marcar_conferida ? 'conferir' : 'dados_sit', null, { nf: camposNF, pg: camposPG });
  padronizarDocsParcela_(x.id_parcela);
  return { divergencias: div };
}

/** Volta uma parcela uma etapa (para corrigir um clique errado). */
function voltarEtapaParcela_(u, d) {
  exigirPerfil_(u, PERFIS_CONFERENCIA);
  const x = parcelaComAcesso_(u, d.id_parcela);
  const voltas = { 'Lançada no SIT': 'Conferida', 'Conferida': 'Paga', 'Liberada para pagamento': 'NF recebida', 'NF solicitada': 'Prevista' };
  const novo = voltas[x.status];
  if (!novo) throw new Error('Esta etapa não pode ser desfeita por aqui. Para trocar a NF ou o comprovante, anexe o arquivo de novo.');
  atualizar_('PARCELAS', x._linha, x.status === 'Lançada no SIT' ? { status: novo, id_bimestre: '' } : { status: novo });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', x.id_parcela, 'voltar_etapa', { status: x.status }, { status: novo });
  return true;
}

// ---------------------------------------------------------------------------
// Importação em lote de meses já pagos (NF + comprovante num único PDF)

/**
 * Recria as parcelas que estiverem faltando numa contratação (ex.: depois de uma edição
 * que apagou as parcelas, ou de um ID repetido). Não mexe nas que já existem.
 */
function garantirParcelasContratacao_(c, existentes) {
  if (c.status === 'Cancelada' || c.modalidade === MODALIDADE_DEMANDA || !(Number(c.num_parcelas) > 0) || !(c.inicio_execucao instanceof Date)) return 0;
  const tem = {};
  existentes.forEach(p => { tem[Number(p.num_parcela)] = true; });
  const faltando = [];
  for (let n = 1; n <= Number(c.num_parcelas); n++) if (!tem[n]) faltando.push(n);
  if (!faltando.length) return 0;
  const sh = aba_('PARCELAS'), cab = cabecalho_(sh), ini = c.inicio_execucao;
  const linhas = faltando.map(n => {
    const o = { id_parcela: gerarId('PARCELAS'), id_contratacao: c.id_contratacao, id_projeto: c.id_projeto, num_parcela: n,
      competencia: new Date(ini.getFullYear(), ini.getMonth() + n - 1, 1), valor_previsto: valorDaParcela_(n, c.num_parcelas, c.valor_parcela, c.valor_ultima_parcela),
      primeiro_pagamento: n === 1, status: 'Prevista' };
    return cab.map(k => (o[k] === undefined ? '' : o[k]));
  });
  relaxarValidacoes_(sh);
  invalidar_('PARCELAS');
  sh.getRange(linhaLivre_(sh, linhas.length), 1, linhas.length, cab.length).clearDataValidations().setValues(linhas);
  registrarAuditoria_('', 'PARCELAS', c.id_contratacao, 'recriar_parcelas', null, { parcelas: faltando });
  return faltando.length;
}

/** Contratações e parcelas de um projeto, para a tela de importação (recria parcelas que faltarem). */
function listarParcelasProjeto_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const ctrs = ler_('CONTRATACOES').filter(c => c.id_projeto === d.id_projeto && c.status !== 'Cancelada');
  const todas = ler_('PARCELAS');
  let recriadas = 0;
  ctrs.forEach(c => { recriadas += garantirParcelasContratacao_(c, todas.filter(p => p.id_contratacao === c.id_contratacao)); });

  const forn = {}; ler_('FORNECEDORES').forEach(f => { forn[f.id_fornecedor] = f; });
  const rub = {}; ler_('RUBRICAS').forEach(r => { rub[r.id_rubrica] = r; });
  return {
    recriadas: recriadas,
    contratacoes: ctrs.map(c => ({ id_contratacao: c.id_contratacao, tipo_despesa: c.tipo_despesa || '', contratado: (forn[c.id_fornecedor] || {}).razao_social || '',
      representante: (forn[c.id_fornecedor] || {}).representante_nome || '', rubrica: (rub[c.id_rubrica] || {}).descricao || '' })),
    parcelas: carregarParcelas_(u, d.id_projeto).map(x => ({
      id_parcela: x.id_parcela, id_contratacao: x.id_contratacao, num_parcela: x.num_parcela,
      total_parcelas: x.total_parcelas, competencia_mes: x.competencia_mes, valor_previsto: x.valor_previsto,
      status: x.status, contratado: x.contratado, representante: x.contratado_representante,
      rubrica: x.rubrica, tem_nf: !!(x.nf && x.nf.id_documento), tem_pagamento: !!(x.pagamento && x.pagamento.id_documento_comprovante)
    }))
  };
}

/** Grava um lançamento completo: arquivo único (NF + comprovante), dados da NF e do pagamento. */
function importarLancamento_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  const x = parcelaComAcesso_(u, d.id_parcela);
  const n = d.nf || {}, p = d.pagamento || {};
  const valorNF = paraNumero_(n.valor), valorPg = paraNumero_(p.valor) || valorNF;
  const emissao = paraData_(n.data_emissao), dataPg = paraData_(p.data_pagamento);
  if (!String(n.numero || '').trim()) throw new Error('Número da NF vazio.');
  if (!emissao || !dataPg) throw new Error('Datas de emissão e pagamento são obrigatórias.');
  if (!(valorNF > 0)) throw new Error('Valor inválido.');
  const statusFinal = ['Paga', 'Conferida', 'Lançada no SIT'].indexOf(d.status_final) > -1 ? d.status_final : 'Conferida';

  const c = buscar_('CONTRATACOES', 'id_contratacao', x.id_contratacao) || {};
  const f = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor) || {};
  const r = buscar_('RUBRICAS', 'id_rubrica', c.id_rubrica) || {};
  const comp = competenciaDe_(x);

  const nfAtual = ler_('NOTAS_FISCAIS').find(z => z.id_parcela === x.id_parcela);
  const pgAtual = ler_('PAGAMENTOS').find(z => z.id_parcela === x.id_parcela);

  let idDoc = (nfAtual && nfAtual.id_documento) || '';
  const docAtual = idDoc ? buscar_('DOCUMENTOS', 'id_documento', idDoc) : null;
  const mesmoArquivo = docAtual && d.arquivo &&
    (String(docAtual.nome_original || '') === d.arquivo.nome || String(docAtual.nome_arquivo || '').endsWith(' – ' + d.arquivo.nome));
  if (d.arquivo && d.arquivo.base64 && !mesmoArquivo) {
    const arq = Object.assign({}, d.arquivo, { nome_original: d.arquivo.nome,
      nome: 'NF ' + n.numero + ' + comprovante – ' + (f.razao_social || '') + ' – ' + d.arquivo.nome });
    idDoc = salvarArquivoEmPasta_(u, x.id_projeto, x.id_contratacao, 'Nota fiscal', arq, pastaDoMes_(x.id_projeto, comp)).id_documento;
  }
  if (!idDoc) throw new Error('Selecione o arquivo (NF + comprovante).');

  const resumoExec = c.modalidade === MODALIDADE_DEMANDA ? String(x.observacoes || '') : '';
  const descServ = c.modalidade === MODALIDADE_DEMANDA ? String(x.descricao_servico || '').trim() : '';
  const descricao = descServ
    ? 'prestação de serviço de ' + descServ
    : resumoExec
    ? (c.descricao_nf || 'prestação de serviço de ' + String(r.descricao || '').toLowerCase()) + ' – ' + resumoExec
    : ehCompra_(c)
    ? (c.descricao_nf || c.objeto || 'aquisição de ' + String(r.descricao || '').toLowerCase())
    : c.descricao_nf
    ? c.descricao_nf + ' referente ao mês de ' + mesExtenso_(comp)
    : 'prestação de serviço de ' + String(r.descricao || '').toLowerCase() + ' referente ao mês de ' + mesExtenso_(comp);
  const div = [];
  if (Math.abs(valorNF - Number(x.valor_previsto || 0)) > 0.009) div.push('valor da nota diferente do previsto (' + brl_(x.valor_previsto) + ')');

  const camposNF = {
    id_parcela: x.id_parcela, id_projeto: x.id_projeto, tipo_documento: 'Nota fiscal', numero: texto_(n.numero),
    data_emissao: emissao, valor: valorNF, descricao: (nfAtual && nfAtual.descricao) || descricao,
    cnpj_emitente: texto_(f.cnpj_cpf), razao_social_emitente: f.razao_social || '', id_documento: idDoc,
    divergencias: div.join(' | '), conferida_por: u.id_usuario, conferida_em: new Date(),
    enviada_em: new Date(), enviada_por: u.id_usuario
  };
  const camposPG = {
    id_parcela: x.id_parcela, id_projeto: x.id_projeto, forma_pagamento: p.forma_pagamento || 'PIX',
    num_identificacao_pix: texto_(p.num_identificacao_pix), data_pagamento: dataPg,
    data_debito_conta: paraData_(p.data_debito_conta) || dataPg, valor: valorPg,
    id_documento_comprovante: idDoc, pago_por: u.id_usuario, registrado_em: new Date()
  };
  if (nfAtual) atualizar_('NOTAS_FISCAIS', nfAtual._linha, camposNF); else inserir_('NOTAS_FISCAIS', camposNF);
  if (pgAtual) atualizar_('PAGAMENTOS', pgAtual._linha, camposPG); else inserir_('PAGAMENTOS', camposPG);

  const cp = { status: idxStatus_(x.status) > idxStatus_(statusFinal) ? x.status : statusFinal };
  if (!x.liberada_em) { cp.liberada_em = dataPg; cp.liberada_por = u.id_usuario; }
  atualizar_('PARCELAS', x._linha, cp);
  registrarAuditoria_(u.id_usuario, 'PARCELAS', x.id_parcela, 'importar_lancamento', null, { nf: n.numero, valor: valorNF });
  padronizarDocsParcela_(x.id_parcela);
  return { divergencias: div };
}

// ---------------------------------------------------------------------------
// Correção de lançamentos (prestação de contas)

/** Apaga a NF e o pagamento lançados numa parcela. O arquivo continua no Drive. */
function excluirLancamento_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  const x = parcelaComAcesso_(u, d.id_parcela);
  const nf = ler_('NOTAS_FISCAIS').filter(z => z.id_parcela === x.id_parcela);
  const pg = ler_('PAGAMENTOS').filter(z => z.id_parcela === x.id_parcela);
  if (!nf.length && !pg.length) throw new Error('Esta parcela não tem lançamento.');
  registrarAuditoria_(u.id_usuario, 'PARCELAS', x.id_parcela, 'excluir_lancamento',
    { status: x.status, nf: nf.map(limpar_), pagamento: pg.map(limpar_) }, null);
  excluirLinhas_('NOTAS_FISCAIS', nf.map(z => z._linha));
  excluirLinhas_('PAGAMENTOS', pg.map(z => z._linha));
  const p = buscar_('PARCELAS', 'id_parcela', x.id_parcela);
  atualizar_('PARCELAS', p._linha, { status: 'Prevista', liberada_em: '', liberada_por: '', id_bimestre: '' });
  return true;
}

/** Passa a NF e o pagamento de uma parcela para outra parcela (sem lançamento) do mesmo projeto. */
function moverLancamento_(u, d) {
  exigirPerfil_(u, PERFIS_LANCAMENTO_DIRETO);
  const de = parcelaComAcesso_(u, d.id_parcela);
  const para = parcelaComAcesso_(u, d.id_destino);
  if (de.id_parcela === para.id_parcela) throw new Error('Escolha uma parcela diferente.');
  if (de.id_projeto !== para.id_projeto) throw new Error('A parcela de destino é de outro projeto.');
  const nfs = ler_('NOTAS_FISCAIS'), pgs = ler_('PAGAMENTOS');
  if (nfs.some(z => z.id_parcela === para.id_parcela) || pgs.some(z => z.id_parcela === para.id_parcela)) {
    throw new Error('A parcela de destino já tem lançamento. Exclua ou mova o lançamento dela primeiro.');
  }
  const nf = nfs.filter(z => z.id_parcela === de.id_parcela), pg = pgs.filter(z => z.id_parcela === de.id_parcela);
  if (!nf.length && !pg.length) throw new Error('Esta parcela não tem lançamento para mover.');
  nf.forEach(z => atualizar_('NOTAS_FISCAIS', z._linha, { id_parcela: para.id_parcela }));
  pg.forEach(z => atualizar_('PAGAMENTOS', z._linha, { id_parcela: para.id_parcela }));
  atualizar_('PARCELAS', para._linha, { status: de.status, liberada_em: de.liberada_em || '', liberada_por: de.liberada_por || '',
                                        id_bimestre: de.id_bimestre || '' });
  atualizar_('PARCELAS', de._linha, { status: 'Prevista', liberada_em: '', liberada_por: '', id_bimestre: '' });
  registrarAuditoria_(u.id_usuario, 'PARCELAS', de.id_parcela, 'mover_lancamento', { de: de.id_parcela }, { para: para.id_parcela });
  padronizarDocsParcela_(para.id_parcela);
  return true;
}
