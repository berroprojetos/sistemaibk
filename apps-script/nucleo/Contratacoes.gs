/**
 * Contratacoes.gs – contratados (fornecedores), contratações, parcelas automáticas,
 * cotações e documentos salvos direto na pasta do Drive.
 */

const PERFIS_CONTRATACAO = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO', 'INSTITUICAO_CONTRATACAO'];

const CAMPOS_FORNECEDOR = [
  'razao_social', 'nome_fantasia', 'cnpj_cpf', 'rg', 'nacionalidade', 'estado_civil', 'profissao',
  'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'email', 'email_2', 'telefone',
  'representante_nome', 'representante_cpf', 'representante_cargo', 'representante_genero',
  'chave_pix', 'banco', 'agencia', 'conta', 'cnpj', 'cpf', 'nome_completo'
];
// Campos que podem ter zero à esquerda: gravados como texto
const CAMPOS_TEXTO_NUMERICO = ['cnpj_cpf', 'rg', 'cep', 'telefone', 'agencia', 'conta',
  'representante_cpf', 'chave_pix', 'numero', 'cnpj', 'cpf'];

const LIMITE_ARQUIVO_MB = 20;

// ---------------------------------------------------------------------------
// Utilitários

/**
 * Grava como TEXTO na planilha valores que o Sheets transformaria sozinho:
 * números (zero à esquerda), "3663-3" (viraria data), "+55 41 9…" (viraria fórmula → #ERROR!).
 */
function texto_(v) {
  v = String(v === null || v === undefined ? '' : v).trim();
  if (!v || v.charAt(0) === "'") return v;
  return (/^[=+@]/.test(v) || /^[\d\s.\-\/()+]+$/.test(v)) ? "'" + v : v;
}

function soDigitos_(v) {
  return String(v || '').replace(/\D/g, '');
}

function brl_(v) {
  const n = Number(v || 0);
  const partes = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + 'R$ ' + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
}

function excluirLinhas_(aba, linhas) {
  if (!linhas.length) return;
  conferirLinhas_(aba);
  const sh = aba_(aba);
  linhas.sort((a, b) => b - a).forEach(l => sh.deleteRow(l));
  invalidar_(aba);
}

// ---------------------------------------------------------------------------
// Resumo para a página do projeto

function resumoExecucao_(u, p, rubricas) {
  const ctrs = ler_('CONTRATACOES').filter(c => c.id_projeto === p.id_projeto);
  const forn = {};
  ler_('FORNECEDORES').forEach(f => { forn[f.id_fornecedor] = f; });
  const rub = {};
  rubricas.forEach(r => { rub[r.id_rubrica] = r; });
  const docs = ler_('DOCUMENTOS').filter(d => d.id_projeto === p.id_projeto);

  const porRubrica = {};
  let total = 0;
  const execs = valorExecutadoPorContratacao_();
  const lista = ctrs.map(c => {
    if (c.status !== 'Cancelada') {
      const v = comprometidoContratacao_(c, execs);       // por demanda: o maior entre o contratado e o já executado
      porRubrica[c.id_rubrica] = (porRubrica[c.id_rubrica] || 0) + v;
      total += v;
    }
    const o = limpar_(c);
    o.fornecedor_nome = forn[c.id_fornecedor] ? forn[c.id_fornecedor].razao_social : '';
    o.rubrica_descricao = rub[c.id_rubrica] ? rub[c.id_rubrica].descricao : '';
    o.qtd_documentos = docs.filter(d => d.id_contratacao === c.id_contratacao).length;
    o.tem_contrato = !!c.id_doc_contrato;
    return o;
  });

  // Instituição só vê contratados dos próprios projetos
  let fornecedores = Object.keys(forn).map(k => forn[k]);
  if (!podeVerTudo_(u)) {
    const meus = projetosPermitidos_(u).map(x => x.id_projeto);
    const ids = {};
    ler_('CONTRATACOES').forEach(c => { if (meus.indexOf(c.id_projeto) > -1) ids[c.id_fornecedor] = 1; });
    fornecedores = fornecedores.filter(f => ids[f.id_fornecedor]);
  }

  const modelos = ler_('MODELOS_CONTRATO')
    .filter(m => m.ativo === true && (!m.id_instituicao || m.id_instituicao === p.id_instituicao))
    .map(m => ({ id_modelo: m.id_modelo, nome: m.nome, tipo_despesa: m.tipo_despesa,
                 tipo_pessoa_contratado: m.tipo_pessoa_contratado, tipo_modelo: m.tipo_modelo || 'Contrato' }));

  return {
    contratacoes: lista,
    porRubrica: porRubrica,
    total_contratado: Math.round(total * 100) / 100,
    fornecedores: fornecedores.map(limpar_),
    modelos: modelos
  };
}

// ---------------------------------------------------------------------------
// Fornecedores (contratados)

function salvarFornecedor_(f) {
  const doc = soDigitos_(f.cnpj_cpf);
  if (!f.razao_social) throw new Error('Informe o nome / razão social do contratado.');
  if (!(doc.length === 11 || doc.length === 14)) throw new Error('CPF ou CNPJ do contratado inválido.');

  const campos = {};
  CAMPOS_FORNECEDOR.forEach(c => {
    if (f[c] === undefined) return;
    campos[c] = texto_(f[c]);
  });
  campos.tipo_pessoa = doc.length === 14 ? 'Pessoa jurídica' : 'Pessoa física';

  const existente = ler_('FORNECEDORES').find(x => soDigitos_(x.cnpj_cpf) === doc);
  if (existente) {
    atualizar_('FORNECEDORES', existente._linha, campos);
    return existente.id_fornecedor;
  }
  campos.criado_em = new Date();
  return inserir_('FORNECEDORES', campos).id_fornecedor;
}

// ---------------------------------------------------------------------------
// Contratações

function obterContratacao_(u, idContratacao) {
  const c = buscar_('CONTRATACOES', 'id_contratacao', idContratacao);
  if (!c) throw new Error('Contratação não encontrada.');
  exigirAcessoProjeto_(u, c.id_projeto);

  const forn = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor);
  const rub = buscar_('RUBRICAS', 'id_rubrica', c.id_rubrica);
  let parcelas = ler_('PARCELAS').filter(x => x.id_contratacao === idContratacao);
  if (garantirParcelasContratacao_(c, parcelas)) parcelas = ler_('PARCELAS').filter(x => x.id_contratacao === idContratacao);
  const tComp = x => x.competencia instanceof Date ? x.competencia.getTime() : 0;
  parcelas.sort((a, b) => tComp(a) - tComp(b) || Number(a.num_parcela) - Number(b.num_parcela));
  const docs = ler_('DOCUMENTOS').filter(x => x.id_contratacao === idContratacao);
  const cotacoes = ler_('COTACOES').filter(x => x.id_contratacao === idContratacao);

  return {
    contratacao: limpar_(c),
    fornecedor: forn ? limpar_(forn) : null,
    rubrica: rub ? limpar_(rub) : null,
    parcelas: parcelas.map(limpar_),
    documentos: docs.map(limpar_),
    cotacoes: cotacoes.map(limpar_),
    itens: itensDaCompra_(idContratacao),
    // parcelas com NF e pagamento, para abrir cada uma e corrigir
    parcelas_det: carregarParcelas_(u, c.id_projeto).filter(x => x.id_contratacao === idContratacao)
      .sort((a, b) => String(a.competencia_mes || '').localeCompare(String(b.competencia_mes || '')) || Number(a.num_parcela) - Number(b.num_parcela))
      .map(x => { const o = Object.assign({}, x); delete o._linha; return o; }),
    pode_conferir: PERFIS_CONFERENCIA.indexOf(u.perfil) > -1,
    pode_reprogramar: PERFIS_REPROGRAMAR.indexOf(u.perfil) > -1,
    pode_lancar_direto: PERFIS_LANCAMENTO_DIRETO.indexOf(u.perfil) > -1,
    pasta_url: c.pasta_drive_id ? 'https://drive.google.com/drive/folders/' + c.pasta_drive_id : '',
    podeContratar: PERFIS_CONTRATACAO.indexOf(u.perfil) > -1
  };
}

function salvarContratacao_(u, d, opcoes) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  exigirAcessoProjeto_(u, d.id_projeto);

  const rub = buscar_('RUBRICAS', 'id_rubrica', d.id_rubrica);
  if (!rub || rub.id_projeto !== d.id_projeto) throw new Error('Selecione a rubrica.');
  if (!String(d.objeto || '').trim()) throw new Error('Descreva o objeto da contratação.');

  const atualEd = d.id_contratacao ? buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao) : null;
  // Por demanda (palestras, oficinas…): paga por unidade executada; as parcelas nascem do faturamento das execuções
  const porDemanda = d.modalidade === MODALIDADE_DEMANDA;
  // Por demanda não tem início/fim: cada palestra tem a sua data
  const inicio = paraData_(d.inicio_execucao) || (porDemanda ? '' : null);
  if (inicio === null) throw new Error('Informe o início da execução.');
  const eraDemanda = !!(atualEd && atualEd.modalidade === MODALIDADE_DEMANDA);
  if (atualEd && porDemanda !== eraDemanda) {
    const temParcelas = ler_('PARCELAS').some(p => p.id_contratacao === atualEd.id_contratacao);
    if (temParcelas) throw new Error('Esta contratação já tem parcelas. Para mudar a forma de execução (mensal × por demanda), ' +
      'encerre esta e crie uma nova contratação.');
  }
  let numParcelas, valorParcela, total, plano = null, valorUnit = '', qtdContratada = '', ultimaParcela = '';
  if (porDemanda) {
    valorUnit = paraNumero_(d.valor_unitario);
    if (!(valorUnit > 0)) throw new Error('Informe o valor por ' + (String(d.unidade_execucao || '').trim() || 'unidade') + '.');
    qtdContratada = parseInt(d.quantidade_contratada, 10) || '';
    numParcelas = atualEd ? ler_('PARCELAS').filter(p => p.id_contratacao === atualEd.id_contratacao).length : 0;
    valorParcela = valorUnit;
    total = qtdContratada ? Math.round(valorUnit * qtdContratada * 100) / 100 : 0;
  } else {
    numParcelas = parseInt(d.num_parcelas, 10) || 1;
    valorParcela = paraNumero_(d.valor_parcela);
    // Valor total informado: parcela = total ÷ nº de parcelas; a diferença de centavos vai para a última parcela
    const totalInf = paraNumero_(d.valor_total);
    if (totalInf > 0) {
      const dv = dividirTotal_(totalInf, numParcelas);
      valorParcela = dv.valor; ultimaParcela = dv.ultima;
    }
    if (!(valorParcela > 0)) throw new Error('Informe o valor da parcela.');
    // Edição: parcelas já pagas/lançadas ficam como estão; só as futuras (Previstas, sem NF/pagamento) mudam
    plano = atualEd ? planejarParcelas_(atualEd, numParcelas, valorParcela, inicio, true, d.revalorar_lancadas === true, ultimaParcela) : null;
    total = plano ? plano.total : totalParcelas_(numParcelas, valorParcela, ultimaParcela);
  }
  const status = d.status || 'Em execução';
  if (LISTAS.status_contratacao.indexOf(status) === -1) throw new Error('Status inválido.');

  // Não deixa passar do valor orçado na rubrica
  if (status !== 'Cancelada') {
    const execs = valorExecutadoPorContratacao_();
    const jaContratado = ler_('CONTRATACOES')
      .filter(c => c.id_rubrica === d.id_rubrica && c.id_contratacao !== d.id_contratacao && c.status !== 'Cancelada')
      .reduce((s, c) => s + comprometidoContratacao_(c, execs), 0);
    const orcado = Number(rub.valor_total_orcado || 0);
    if (jaContratado + total > orcado + 0.009) {
      throw new Error('O valor (' + brl_(total) + ') ultrapassa o saldo da rubrica. Orçado: ' + brl_(orcado) +
        ' · já contratado: ' + brl_(jaContratado) + ' · disponível: ' + brl_(orcado - jaContratado) + '.');
    }
  }

  // Dados do contratado ficam no cadastro interno da contratação (não mexe no menu Fornecedores / planilha)
  const idForn = salvarFornecedor_(normalizarFornecedor_(d.fornecedor || {}));

  const campos = {
    id_projeto: d.id_projeto,
    id_rubrica: d.id_rubrica,
    id_fornecedor: idForn,
    objeto: String(d.objeto).trim(),
    tipo_despesa: rub.tipo_despesa || '',
    data_cotacao: paraData_(d.data_cotacao),
    // Compra de bens/materiais: a data do contrato é a mesma da cotação
    data_assinatura_contrato: (rub.tipo_despesa && rub.tipo_despesa !== 'Prestação de serviço' && d.data_cotacao)
      ? paraData_(d.data_cotacao) : paraData_(d.data_assinatura_contrato),
    inicio_execucao: inicio,
    fim_execucao: porDemanda ? (paraData_(d.fim_execucao) || '') : paraData_(d.fim_execucao),
    num_parcelas: numParcelas,
    valor_parcela: valorParcela,
    valor_ultima_parcela: ultimaParcela,
    valor_total_contratado: total,
    status: status,
    observacoes: String(d.observacoes || '').trim(),
    carga_horaria_mensal: parseInt(d.carga_horaria_mensal, 10) || '',
    descricao_nf: String(d.descricao_nf || '').trim(),
    modalidade: porDemanda ? MODALIDADE_DEMANDA : 'Mensal',
    unidade_execucao: porDemanda ? (String(d.unidade_execucao || '').trim() || 'palestra') : '',
    valor_unitario: porDemanda ? valorUnit : '',
    quantidade_contratada: porDemanda ? qtdContratada : ''
  };

  let id = d.id_contratacao;
  if (id) {
    const atual = atualEd;
    if (!atual || atual.id_projeto !== d.id_projeto) throw new Error('Contratação não encontrada.');
    if (!porDemanda) aplicarPlanoParcelas_(atual, plano, d.id_projeto, numParcelas, valorParcela, inicio, ultimaParcela);
    atualizar_('CONTRATACOES', atual._linha, campos);
    registrarAuditoria_(u.id_usuario, 'CONTRATACOES', id, 'edicao', limpar_(atual), campos);
    if (atual.id_rubrica !== campos.id_rubrica || atual.id_fornecedor !== campos.id_fornecedor) padronizarDocsContratacao_(id);
  } else {
    campos.criado_em = new Date();
    campos.criado_por = u.id_usuario;
    id = inserir_('CONTRATACOES', campos).id_contratacao;
    if (!porDemanda) gerarParcelas_(id, d.id_projeto, numParcelas, valorParcela, inicio, ultimaParcela);
    if (d.id_processo_cotacao) {
      const proc = buscar_('PROCESSOS_COTACAO', 'id_processo', d.id_processo_cotacao);
      if (proc && proc.id_projeto === d.id_projeto && !proc.id_contratacao) vincularProcessoAContratacao_(proc.id_processo, id);
    }
    registrarAuditoria_(u.id_usuario, 'CONTRATACOES', id, 'criacao', null, campos);
  }

  garantirPastaContratacao_(id);
  if (opcoes && opcoes.leve) return id;
  return obterContratacao_(u, id);
}

// ---------------------------------------------------------------------------
// Ajuste de contrato em andamento (aditivo, redução, encerramento antecipado)

/**
 * Divide o valor total em n parcelas iguais (arredondadas em centavos).
 * A sobra/falta de centavos fica na última parcela: ultima = '' quando todas são iguais.
 * Ex.: 42.067,01 em 19 → 18 × 2.214,05 + 1 × 2.214,11.
 */
function dividirTotal_(total, n) {
  const r2 = x => Math.round(x * 100) / 100;
  n = Math.max(1, parseInt(n, 10) || 1);
  const valor = r2(total / n), ultima = r2(total - (n - 1) * valor);
  return { valor: valor, ultima: Math.abs(ultima - valor) < 0.001 ? '' : ultima };
}

/** Valor previsto da parcela k (a última pode ter o ajuste de centavos). */
function valorDaParcela_(k, n, valor, ultima) {
  return (Number(k) === Number(n) && ultima !== '' && ultima != null && Number(ultima) > 0) ? Number(ultima) : Number(valor);
}

function totalParcelas_(n, valor, ultima) {
  let t = 0;
  for (let k = 1; k <= n; k++) t += valorDaParcela_(k, n, valor, ultima);
  return Math.round(t * 100) / 100;
}

/** Parcela "travada" = já tem movimento (status além de Prevista, NF ou pagamento). Essas nunca são alteradas aqui. */
function parcelasComTrava_(idContratacao) {
  const ids = {};
  ler_('NOTAS_FISCAIS').forEach(n => { if (n.id_parcela) ids[n.id_parcela] = true; });
  ler_('PAGAMENTOS').forEach(g => { if (g.id_parcela) ids[g.id_parcela] = true; });
  return ler_('PARCELAS').filter(p => p.id_contratacao === idContratacao)
    .sort((a, b) => Number(a.num_parcela) - Number(b.num_parcela))
    .map(p => Object.assign({}, p, { travada: p.status !== 'Prevista' || !!ids[p.id_parcela] }));
}

/**
 * Calcula o que muda nas parcelas quando o contrato é editado.
 * - Sem parcelas travadas: recria tudo (como antes).
 * - Com parcelas travadas: mantém as travadas; remove as previstas além do novo nº de parcelas;
 *   ajusta o valor das previstas restantes e cria as que faltarem (prorrogação).
 */
function planejarParcelas_(atual, n, valor, inicio, alinhar, revalorarLancadas, ultima) {
  if (ultima === undefined) ultima = '';
  const vk = k => valorDaParcela_(k, n, valor, ultima);
  const parcelas = parcelasComTrava_(atual.id_contratacao);
  const travadas = parcelas.filter(p => p.travada);
  const r2 = x => Math.round(x * 100) / 100;
  if (!travadas.length) {
    const p1 = parcelas.find(p => Number(p.num_parcela) === 1);
    const c1 = p1 ? (p1.competencia instanceof Date ? p1.competencia : paraData_(p1.competencia)) : null;
    const mudou = Number(atual.num_parcelas) !== n || Number(atual.valor_parcela) !== valor ||
      Number(atual.valor_ultima_parcela || 0) !== Number(ultima || 0) ||
      !(atual.inicio_execucao instanceof Date) || atual.inicio_execucao.getTime() !== inicio.getTime() ||
      !!(alinhar && c1 && (c1.getFullYear() !== inicio.getFullYear() || c1.getMonth() !== inicio.getMonth()));
    return { recriar: mudou, parcelas: parcelas, total: totalParcelas_(n, valor, ultima) };
  }
  // Mudou o mês de início (ou a 1ª parcela não bate com o início): as competências de todas as parcelas andam
  // o mesmo número de meses (mantém meses pulados por reprogramação). NF e pagamentos continuam ligados à parcela.
  const mesIdx = d => d instanceof Date ? d.getFullYear() * 12 + d.getMonth() : null;
  const compIdx = p => { const c = p.competencia instanceof Date ? p.competencia : paraData_(p.competencia); return c ? mesIdx(c) : null; };
  const ini = atual.inicio_execucao instanceof Date ? atual.inicio_execucao : null;
  const p1 = parcelas.find(p => Number(p.num_parcela) === 1);
  let delta = 0;
  if (alinhar && p1 && compIdx(p1) !== null) delta = mesIdx(inicio) - compIdx(p1);       // edição: a 1ª parcela fica no mês do início
  else if (ini) delta = mesIdx(inicio) - mesIdx(ini);
  const deslocar = delta !== 0;
  const ultTravada = travadas[travadas.length - 1];
  if (n < Number(ultTravada.num_parcela)) {
    throw new Error('A parcela ' + ultTravada.num_parcela + ' já tem lançamento (' + ultTravada.status + '). ' +
      'O contrato não pode ficar com menos de ' + ultTravada.num_parcela + ' parcela(s). ' +
      'Se esse lançamento estiver errado, abra a parcela e mova ou exclua o lançamento antes.');
  }
  const porNum = {};
  parcelas.forEach(p => { porNum[Number(p.num_parcela)] = p; });
  let total = 0;
  for (let k = 1; k <= n; k++) {
    const p = porNum[k];
    total += p && p.travada && !revalorarLancadas ? Number(p.valor_previsto || 0) : vk(k);
  }
  return {
    recriar: false, parcelas: parcelas, total: r2(total), deslocar: deslocar, delta: delta,
    remover: parcelas.filter(p => !p.travada && Number(p.num_parcela) > n),
    // revalorarLancadas: corrige também o valor previsto das parcelas que já têm NF/pagamento (ex.: contrato cadastrado com valor errado)
    reajustar: parcelas.filter(p => (!p.travada || revalorarLancadas) && Number(p.num_parcela) <= n && Math.abs(Number(p.valor_previsto) - vk(p.num_parcela)) > 0.001)
  };
}

function aplicarPlanoParcelas_(atual, plano, idProjeto, n, valor, inicio, ultima) {
  if (!plano) return;
  if (ultima === undefined) ultima = '';
  if (plano.recriar) {
    excluirLinhas_('PARCELAS', plano.parcelas.map(x => x._linha));
    gerarParcelas_(atual.id_contratacao, idProjeto, n, valor, inicio, ultima);
    return;
  }
  if (!plano.remover) return;                                     // nada travado e nada mudou
  // Sem parcela 1 (ex.: importação) não há como alinhar; quando há, as demais andam juntas
  const reaj = {};
  plano.reajustar.forEach(p => { reaj[p.id_parcela] = true; });
  plano.parcelas.filter(p => Number(p.num_parcela) <= n || p.travada).forEach(p => {
    const campos = {};
    if (reaj[p.id_parcela]) campos.valor_previsto = valorDaParcela_(p.num_parcela, n, valor, ultima);
    if (plano.deslocar) {
      const c = p.competencia instanceof Date ? p.competencia : paraData_(p.competencia);
      campos.competencia = c ? new Date(c.getFullYear(), c.getMonth() + plano.delta, 1)
                             : new Date(inicio.getFullYear(), inicio.getMonth() + Number(p.num_parcela) - 1, 1);
    }
    if (Object.keys(campos).length) atualizar_('PARCELAS', p._linha, campos);
  });
  excluirLinhas_('PARCELAS', plano.remover.map(p => p._linha));
  // Prorrogação: cria as parcelas que faltam até n
  const ficam = ler_('PARCELAS').filter(p => p.id_contratacao === atual.id_contratacao);
  garantirParcelasContratacao_({ id_contratacao: atual.id_contratacao, id_projeto: idProjeto, status: 'Em execução',
    num_parcelas: n, valor_parcela: valor, valor_ultima_parcela: ultima, inicio_execucao: inicio }, ficam);
  if (plano.remover.length || plano.reajustar.length || plano.deslocar) {
    registrarAuditoria_('', 'PARCELAS', atual.id_contratacao, 'ajuste_contrato', null,
      { removidas: plano.remover.map(p => p.num_parcela), reajustadas: plano.reajustar.map(p => p.num_parcela),
        novo_inicio: plano.deslocar ? inicio : '', num_parcelas: n, valor_parcela: valor });
  }
}

/**
 * Encerramento antecipado (ex.: prestador saiu no 4º mês de 19).
 * Mantém as parcelas até "ultima_parcela", remove as futuras, status Encerrada e libera o saldo na rubrica.
 * Devolve também o "remanescente" para contratar o substituto.
 */
function encerrarContratacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const atual = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!atual) throw new Error('Contratação não encontrada.');
  exigirAcessoProjeto_(u, atual.id_projeto);
  if (atual.status === 'Cancelada') throw new Error('Esta contratação está cancelada.');
  const n = parseInt(d.ultima_parcela, 10);
  if (!(n >= 1)) throw new Error('Informe a última parcela executada.');
  if (n > Number(atual.num_parcelas)) throw new Error('O contrato só tem ' + atual.num_parcelas + ' parcelas.');
  const valor = Number(atual.valor_parcela);
  // Encerrou antes do fim: a parcela n vira a última, mas mantém o valor dela (o ajuste de centavos sai junto com as futuras)
  const ultimaEnc = n === Number(atual.num_parcelas) ? (atual.valor_ultima_parcela || '') : '';
  const plano = planejarParcelas_(atual, n, valor, atual.inicio_execucao, false, false, ultimaEnc);
  const totalAntes = Number(atual.valor_total_contratado || 0);
  const parcelasAntes = Number(atual.num_parcelas);

  if (plano.recriar || !plano.remover) {
    // nenhuma parcela travada: só remove as previstas além de n
    const remover = plano.parcelas.filter(p => Number(p.num_parcela) > n);
    excluirLinhas_('PARCELAS', remover.map(p => p._linha));
  } else {
    excluirLinhas_('PARCELAS', plano.remover.map(p => p._linha));
  }
  const ultima = plano.parcelas.find(p => Number(p.num_parcela) === n);
  const fimPadrao = ultima && ultima.competencia instanceof Date
    ? new Date(ultima.competencia.getFullYear(), ultima.competencia.getMonth() + 1, 0) : new Date();
  const fim = paraData_(d.data_encerramento) || fimPadrao;
  const motivo = String(d.motivo || '').trim();
  const nota = 'Encerrado antecipadamente em ' + Utilities.formatDate(fim, Session.getScriptTimeZone(), 'dd/MM/yyyy') +
    ' (' + n + ' de ' + parcelasAntes + ' parcelas)' + (motivo ? ' – ' + motivo : '') + '.';
  const campos = {
    num_parcelas: n, valor_ultima_parcela: ultimaEnc, valor_total_contratado: plano.total, fim_execucao: fim, status: 'Encerrada',
    observacoes: [String(atual.observacoes || '').trim(), nota].filter(Boolean).join(' ')
  };
  atualizar_('CONTRATACOES', buscar_('CONTRATACOES', 'id_contratacao', atual.id_contratacao)._linha, campos);
  registrarAuditoria_(u.id_usuario, 'CONTRATACOES', atual.id_contratacao, 'encerramento_antecipado', limpar_(atual), campos);

  const ini = atual.inicio_execucao;
  const res = obterContratacao_(u, atual.id_contratacao);
  res.remanescente = limpar_({
    id_rubrica: atual.id_rubrica, objeto: atual.objeto,
    num_parcelas: parcelasAntes - n, valor_parcela: valor,
    valor_liberado: Math.round((totalAntes - plano.total) * 100) / 100,
    inicio_execucao: ini instanceof Date ? new Date(ini.getFullYear(), ini.getMonth() + n, 1) : '',
    fim_execucao: atual.fim_execucao || '',
    carga_horaria_mensal: atual.carga_horaria_mensal || '', descricao_nf: atual.descricao_nf || ''
  });
  return res;
}

/** Cria as parcelas mensais: competência = mês de início + i. */
function gerarParcelas_(idContratacao, idProjeto, n, valor, inicio, ultima) {
  const sh = aba_('PARCELAS');
  const cab = cabecalho_(sh);
  const linhas = [];
  for (let i = 0; i < n; i++) {
    const obj = {
      id_parcela: gerarId('PARCELAS'),
      id_contratacao: idContratacao,
      id_projeto: idProjeto,
      num_parcela: i + 1,
      competencia: new Date(inicio.getFullYear(), inicio.getMonth() + i, 1),
      valor_previsto: valorDaParcela_(i + 1, n, valor, ultima),
      primeiro_pagamento: i === 0,
      status: 'Prevista'
    };
    linhas.push(cab.map(c => (obj[c] === undefined ? '' : obj[c])));
  }
  if (linhas.length) { relaxarValidacoes_(sh); invalidar_('PARCELAS'); sh.getRange(linhaLivre_(sh, linhas.length), 1, linhas.length, cab.length).setValues(linhas); }
}

// ---------------------------------------------------------------------------
// Pastas no Drive

function subpastaProjeto_(idProjeto, nome) {
  const pasta = DriveApp.getFolderById(garantirPastaProjeto_(idProjeto));
  const it = pasta.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pasta.createFolder(nome);
}

function garantirPastaContratacao_(idContratacao) {
  const c = buscar_('CONTRATACOES', 'id_contratacao', idContratacao);
  if (c.pasta_drive_id) return DriveApp.getFolderById(c.pasta_drive_id);
  const forn = buscar_('FORNECEDORES', 'id_fornecedor', c.id_fornecedor);
  const pasta = subpastaProjeto_(c.id_projeto, '02 Contratações')
    .createFolder(c.id_contratacao + ' - ' + (forn ? forn.razao_social : 'Contratado'));
  atualizar_('CONTRATACOES', c._linha, { pasta_drive_id: pasta.getId() });
  return pasta;
}

// ---------------------------------------------------------------------------
// Documentos (upload direto no Drive)

function salvarArquivo_(u, idProjeto, idContratacao, tipo, arquivo) {
  if (!arquivo || !arquivo.base64) throw new Error('Selecione um arquivo.');
  if (LISTAS.tipo_documento_anexo.indexOf(tipo) === -1) throw new Error('Tipo de documento inválido.');

  const bytes = Utilities.base64Decode(arquivo.base64);
  if (bytes.length > LIMITE_ARQUIVO_MB * 1024 * 1024) {
    throw new Error('Arquivo maior que ' + LIMITE_ARQUIVO_MB + ' MB.');
  }

  const pasta = idContratacao
    ? garantirPastaContratacao_(idContratacao)
    : subpastaProjeto_(idProjeto, '01 Documentos do projeto');

  const nome = tipo + ' - ' + arquivo.nome;
  const file = pasta.createFile(Utilities.newBlob(bytes, arquivo.mime || 'application/octet-stream', nome));

  return inserir_('DOCUMENTOS', {
    id_projeto: idProjeto,
    id_contratacao: idContratacao || '',
    tipo: tipo,
    nome_arquivo: nome,
    nome_original: arquivo.nome_original || arquivo.nome || '',
    drive_file_id: file.getId(),
    url: file.getUrl(),
    mime_type: arquivo.mime || '',
    enviado_por: u.id_usuario,
    enviado_em: new Date()
  });
}

function enviarDocumento_(u, d) {
  let idProjeto = d.id_projeto;
  if (d.id_contratacao) {
    const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
    if (!c) throw new Error('Contratação não encontrada.');
    idProjeto = c.id_projeto;
  }
  exigirAcessoProjeto_(u, idProjeto);

  // Importação em massa: não envia de novo um arquivo que já está na contratação
  if (d.leve && d.arquivo) {
    const nome = d.tipo + ' - ' + d.arquivo.nome;
    const ja = ler_('DOCUMENTOS').find(x => x.id_contratacao === (d.id_contratacao || '') && x.id_projeto === idProjeto &&
      (x.nome_arquivo === nome || (x.tipo === d.tipo && x.nome_original === d.arquivo.nome)));
    if (ja) return { id_documento: ja.id_documento, ja_existia: true };
  }

  const doc = salvarArquivo_(u, idProjeto, d.id_contratacao, d.tipo, d.arquivo);

  // Contrato assinado anexado: vira o contrato oficial da contratação
  if (d.tipo === 'Contrato' && d.id_contratacao) {
    const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
    atualizar_('CONTRATACOES', c._linha, { id_doc_contrato: doc.id_documento });
  }
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', doc.id_documento, 'upload', null,
    { tipo: d.tipo, nome: doc.nome_arquivo });
  padronizarDocsPorId_([doc.id_documento]);

  if (d.leve) return { id_documento: doc.id_documento };
  return d.id_contratacao ? obterContratacao_(u, d.id_contratacao) : obterProjeto_(u, idProjeto);
}

function excluirDocumento_(u, idDocumento) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const doc = buscar_('DOCUMENTOS', 'id_documento', idDocumento);
  if (!doc) throw new Error('Documento não encontrado.');
  exigirAcessoProjeto_(u, doc.id_projeto);

  try { DriveApp.getFileById(doc.drive_file_id).setTrashed(true); } catch (e) { /* já removido */ }
  conferirLinhas_('DOCUMENTOS'); aba_('DOCUMENTOS').deleteRow(doc._linha); invalidar_('DOCUMENTOS');

  if (doc.id_contratacao) {
    const c = buscar_('CONTRATACOES', 'id_contratacao', doc.id_contratacao);
    if (c && c.id_doc_contrato === idDocumento) atualizar_('CONTRATACOES', c._linha, { id_doc_contrato: '' });
  }
  registrarAuditoria_(u.id_usuario, 'DOCUMENTOS', idDocumento, 'exclusao', limpar_(doc), null);
  return doc.id_contratacao ? obterContratacao_(u, doc.id_contratacao) : obterProjeto_(u, doc.id_projeto);
}

// ---------------------------------------------------------------------------
// Cotações

function salvarCotacao_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!c) throw new Error('Contratação não encontrada.');
  exigirAcessoProjeto_(u, c.id_projeto);

  if (!String(d.razao_social || '').trim()) throw new Error('Informe o fornecedor da cotação.');
  const valor = paraNumero_(d.valor);
  if (!(valor > 0)) throw new Error('Informe o valor cotado.');

  let idDoc = '';
  if (d.arquivo && d.arquivo.base64) {
    idDoc = salvarArquivo_(u, c.id_projeto, c.id_contratacao, 'Cotação', d.arquivo).id_documento;
  }

  if (d.vencedora) {
    ler_('COTACOES').filter(x => x.id_contratacao === c.id_contratacao && x.vencedora === true)
      .forEach(x => atualizar_('COTACOES', x._linha, { vencedora: false }));
  }

  const cot = inserir_('COTACOES', {
    id_contratacao: c.id_contratacao,
    id_projeto: c.id_projeto,
    razao_social: String(d.razao_social).trim(),
    cnpj: texto_(d.cnpj),
    valor: valor,
    data_cotacao: paraData_(d.data_cotacao),
    vencedora: !!d.vencedora,
    id_documento: idDoc
  });
  registrarAuditoria_(u.id_usuario, 'COTACOES', cot.id_cotacao, 'criacao', null, { valor: valor });
  if (idDoc) padronizarDocsPorId_([idDoc]);
  return obterContratacao_(u, c.id_contratacao);
}

function excluirCotacao_(u, idCotacao) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  const cot = buscar_('COTACOES', 'id_cotacao', idCotacao);
  if (!cot) throw new Error('Cotação não encontrada.');
  exigirAcessoProjeto_(u, cot.id_projeto);
  conferirLinhas_('COTACOES'); aba_('COTACOES').deleteRow(cot._linha); invalidar_('COTACOES');
  registrarAuditoria_(u.id_usuario, 'COTACOES', idCotacao, 'exclusao', limpar_(cot), null);
  return obterContratacao_(u, cot.id_contratacao);
}

/**
 * Importação em massa de contratações (planilha dos prestadores colada no sistema).
 * Cada linha é gravada separadamente: uma linha com erro não impede as outras.
 * Linha repetida (mesmo CPF/CNPJ + mesma rubrica + mesmo início) é ignorada.
 */
function importarContratacoes_(u, d) {
  exigirPerfil_(u, PERFIS_CONTRATACAO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const res = [];
  (d.linhas || []).forEach(l => {
    try {
      const doc = soDigitos_((l.fornecedor || {}).cnpj_cpf);
      const forn = ler_('FORNECEDORES').find(f => soDigitos_(f.cnpj_cpf) === doc);
      if (forn) {
        const ini = paraData_(l.inicio_execucao);
        const igual = ler_('CONTRATACOES').find(c => c.id_projeto === d.id_projeto && c.id_fornecedor === forn.id_fornecedor &&
          c.id_rubrica === l.id_rubrica && c.status !== 'Cancelada' &&
          (!ini || !(c.inicio_execucao instanceof Date) || c.inicio_execucao.getTime() === ini.getTime()));
        if (igual) { res.push({ linha: l._linha, ok: true, ja_existia: true, id_contratacao: igual.id_contratacao }); return; }
      }
      const id = salvarContratacao_(u, Object.assign({}, l, { id_projeto: d.id_projeto, id_contratacao: '' }), { leve: true });
      res.push({ linha: l._linha, ok: true, id_contratacao: id });
    } catch (e) {
      res.push({ linha: l._linha, ok: false, erro: e.message });
    }
  });
  registrarAuditoria_(u.id_usuario, 'CONTRATACOES', d.id_projeto, 'importacao', null,
    { linhas: res.length, ok: res.filter(r => r.ok && !r.ja_existia).length });
  return res;
}

// ---------------------------------------------------------------------------
// Reprogramar uma parcela (ex.: prestadora de férias em julho: a parcela de julho vai para setembro ou para o fim)

const PERFIS_REPROGRAMAR = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO'];

/**
 * d.id_parcela, d.modo = 'mes' | 'fim', d.mes = 'AAAA-MM' (modo 'mes').
 *  - 'mes': a parcela passa para o mês escolhido e as parcelas ainda em aberto desse mês em diante andam um mês.
 *  - 'fim': a parcela passa para o mês seguinte ao da última parcela do contrato.
 * Só mexe em parcelas Previstas sem NF nem pagamento. O número de cada parcela não muda (histórico das já pagas);
 * as telas mostram as parcelas pela ordem da competência.
 */
function reprogramarParcela_(u, d) {
  exigirPerfil_(u, PERFIS_REPROGRAMAR);
  const alvo = buscar_('PARCELAS', 'id_parcela', d.id_parcela);
  if (!alvo) throw new Error('Parcela não encontrada.');
  exigirAcessoProjeto_(u, alvo.id_projeto);
  const c = buscar_('CONTRATACOES', 'id_contratacao', alvo.id_contratacao);
  if (!c) throw new Error('Contratação não encontrada.');
  if (c.modalidade === MODALIDADE_DEMANDA) throw new Error('Em contratações por demanda a competência é escolhida no faturamento.');

  const ym = v => v instanceof Date ? v.getFullYear() * 12 + v.getMonth() : null;
  const deYm = n => new Date(Math.floor(n / 12), n % 12, 1);
  const parcelas = parcelasComTrava_(c.id_contratacao);
  const p = parcelas.find(x => x.id_parcela === alvo.id_parcela);
  if (p.travada) throw new Error('Esta parcela já tem nota fiscal, pagamento ou outra etapa. Só dá para reprogramar parcela prevista em aberto.');
  const atualYm = ym(p.competencia);
  if (atualYm === null) throw new Error('Parcela sem competência.');

  const novas = {};                                   // id_parcela -> nova competência (número de meses)
  if (d.modo === 'fim') {
    const ultimo = parcelas.filter(x => x.id_parcela !== p.id_parcela).reduce((m, x) => Math.max(m, ym(x.competencia) || 0), atualYm);
    novas[p.id_parcela] = ultimo + 1;
  } else {
    const m = String(d.mes || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new Error('Escolha o mês para onde a parcela vai.');
    const destino = Number(m[1]) * 12 + Number(m[2]) - 1;
    if (destino <= atualYm) throw new Error('Escolha um mês depois da competência atual da parcela.');
    const daFrente = parcelas.filter(x => x.id_parcela !== p.id_parcela && ym(x.competencia) >= destino);
    const travadaNaFrente = daFrente.find(x => x.travada);
    if (travadaNaFrente) {
      throw new Error('A parcela ' + travadaNaFrente.num_parcela + ' (' + mesExtenso_(Utilities.formatDate(travadaNaFrente.competencia, 'America/Sao_Paulo', 'yyyy-MM')) +
        ') já tem lançamento e não pode andar. Escolha um mês depois dela ou use "mover para o fim".');
    }
    novas[p.id_parcela] = destino;
    daFrente.forEach(x => { novas[x.id_parcela] = ym(x.competencia) + 1; });
  }

  // Grava as competências e acerta o fim da execução
  const final = parcelas.map(x => ({ x: x, comp: novas[x.id_parcela] !== undefined ? novas[x.id_parcela] : ym(x.competencia) }))
    .sort((a, b) => a.comp - b.comp || Number(a.x.num_parcela) - Number(b.x.num_parcela));
  const primeiroEra = parcelas.find(x => x.primeiro_pagamento === true);
  final.forEach((f, i) => {
    const campos = {};
    if (novas[f.x.id_parcela] !== undefined) campos.competencia = deYm(f.comp);
    // "1º pagamento" (SIT: cotações + NF + comprovante) fica com a primeira parcela, se a marcada era a que mudou de lugar
    if (primeiroEra && primeiroEra.id_parcela === p.id_parcela && !primeiroEra.travada) campos.primeiro_pagamento = i === 0;
    if (Object.keys(campos).length) atualizar_('PARCELAS', f.x._linha, campos);
  });
  const ultimaComp = final[final.length - 1].comp;
  const fimNovo = new Date(Math.floor(ultimaComp / 12), ultimaComp % 12 + 1, 0);
  const ctr = buscar_('CONTRATACOES', 'id_contratacao', c.id_contratacao);
  if (!(ctr.fim_execucao instanceof Date) || ctr.fim_execucao.getTime() < fimNovo.getTime()) atualizar_('CONTRATACOES', ctr._linha, { fim_execucao: fimNovo });

  registrarAuditoria_(u.id_usuario, 'PARCELAS', p.id_parcela, 'reprogramar', { competencia: Utilities.formatDate(p.competencia, 'America/Sao_Paulo', 'yyyy-MM') },
    { modo: d.modo, destino: Utilities.formatDate(deYm(novas[p.id_parcela]), 'America/Sao_Paulo', 'yyyy-MM'), deslocadas: Object.keys(novas).length - 1 });
  return obterContratacao_(u, c.id_contratacao);
}
