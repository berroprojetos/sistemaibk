/**
 * Projetos.gs – página do projeto: dados gerais, rubricas (orçamento) e pastas no Drive
 */

const PERFIS_EDICAO = ['ADMIN', 'PRESTACAO_CONTAS', 'GERENTE_PROJETO'];

const CAMPOS_PROJETO = [
  'id_instituicao', 'sigla', 'nome_projeto', 'num_edital', 'data_publicacao_edital',
  'num_proposta', 'termo_fomento_cit', 'cnpj_concedente', 'orgao', 'data_celebracao', 'inicio_vigencia', 'fim_vigencia',
  'data_recebimento_recurso', 'valor_total', 'banco', 'agencia', 'conta_corrente',
  'status', 'observacoes', 'inicio_bimestres'
];
// Guardados como TEXTO: a planilha transformava "4638-8" (agência) em data
const TEXTO_PROJETO = ['agencia', 'conta_corrente', 'num_edital', 'num_proposta', 'termo_fomento_cit', 'cnpj_concedente'];
const DATAS_PROJETO = ['data_publicacao_edital', 'data_celebracao', 'inicio_vigencia',
  'fim_vigencia', 'data_recebimento_recurso', 'inicio_bimestres'];

const CAMPOS_RUBRICA = ['codigo', 'descricao', 'carga_horaria', 'tipo_despesa', 'classificacao_contabil', 'tipo_despesa_sit',
  'unidade', 'quantidade', 'valor_unitario_max', 'meses', 'observacoes'];

// ---------------------------------------------------------------------------
// Conversões (o navegador manda texto; a planilha guarda data e número de verdade)

/**
 * Agência/conta que a planilha já tinha virado data (ex.: "4638-8" → 01/08/4638): volta ao texto "4638-8".
 * Usado na leitura até o projeto ser salvo de novo (aí fica gravado como texto).
 */
function textoDeData_(v) {
  if (v instanceof Date) return v.getFullYear() + '-' + (v.getMonth() + 1);
  return v === null || v === undefined ? '' : String(v);
}

function paraData_(s) {
  if (!s) return '';
  if (s instanceof Date) return s;
  const p = String(s).split('-').map(Number);
  return p.length === 3 ? new Date(p[0], p[1] - 1, p[2]) : '';
}

function paraNumero_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (isNaN(n)) throw new Error('Valor numérico inválido: ' + v);
  return n;
}

function config_(chave) {
  const c = ler_('CONFIG').find(x => x.chave === chave);
  return c ? c.valor : '';
}

function podeEditar_(u) {
  return PERFIS_EDICAO.indexOf(u.perfil) > -1;
}

// ---------------------------------------------------------------------------

function listarInstituicoes_(u) {
  return ler_('INSTITUICOES')
    .filter(i => podeVerInstituicao_(u, i.id_instituicao))
    .map(i => ({ id_instituicao: i.id_instituicao, sigla: i.sigla, razao_social: i.razao_social, cnpj: i.cnpj }));
}

function obterProjeto_(u, idProjeto) {
  exigirAcessoProjeto_(u, idProjeto);
  const p = buscar_('PROJETOS', 'id_projeto', idProjeto);
  const inst = buscar_('INSTITUICOES', 'id_instituicao', p.id_instituicao);
  const rubricas = ler_('RUBRICAS').filter(r => r.id_projeto === idProjeto);

  const totalOrcado = rubricas.reduce((s, r) => s + Number(r.valor_total_orcado || 0), 0);
  const valorTotal = Number(p.valor_total || 0);
  const exec = resumoExecucao_(u, p, rubricas);

  // Realizado = valores pagos nas parcelas das contratações de cada rubrica
  const rubDoCtr = {}, rubDaParc = {}, realizado = {};
  ler_('CONTRATACOES').forEach(c => { if (c.id_projeto === idProjeto) rubDoCtr[c.id_contratacao] = c.id_rubrica; });
  ler_('PARCELAS').forEach(x => { if (x.id_projeto === idProjeto) rubDaParc[x.id_parcela] = rubDoCtr[x.id_contratacao]; });
  let primeiroPag = null, qtdPags = 0;
  ler_('PAGAMENTOS').forEach(g => {
    const rb = rubDaParc[g.id_parcela];
    if (rb) realizado[rb] = (realizado[rb] || 0) + Number(g.valor || 0);
    if (g.id_projeto === idProjeto || rb) {
      qtdPags++;
      const dt = g.data_pagamento instanceof Date ? g.data_pagamento : paraData_(g.data_pagamento);
      if (dt && (!primeiroPag || dt < primeiroPag)) primeiroPag = dt;
    }
  });
  // Rendimentos e IR/IOF das aplicações (extratos anexados), quando houver
  let rendimentos = 0, irIof = 0;
  try {
    ler_('EXTRATO').forEach(l => {
      if (l.id_projeto !== idProjeto) return;
      if (l.categoria === 'Rendimento') rendimentos += Number(l.valor || 0);
      if (l.categoria === 'IR/IOF da aplicação') irIof += Number(l.valor || 0);
    });
  } catch (e) {}

  return {
    projeto: limpar_(Object.assign({}, p, TEXTO_PROJETO.reduce((o, c) => { if (p[c] instanceof Date) o[c] = textoDeData_(p[c]); return o; }, {}))),
    instituicao: inst ? limpar_(inst) : null,
    listas: listasConfig_(),
    rubricas: rubricas.map(r => {
      const o = limpar_(r);
      o.valor_contratado = Math.round((exec.porRubrica[r.id_rubrica] || 0) * 100) / 100;
      o.valor_realizado = Math.round((realizado[r.id_rubrica] || 0) * 100) / 100;
      return o;
    }),
    contratacoes: exec.contratacoes,
    fornecedores: exec.fornecedores,
    modelos: exec.modelos,
    campos_contrato: CAMPOS_CONTRATO_DESC,
    campos_cotacao: CAMPOS_COTACAO_DESC,
    processos_cotacao: listarProcessosCotacao_(u, idProjeto),
    resumo: {
      valor_total: valorTotal,
      total_orcado: Math.round(totalOrcado * 100) / 100,
      diferenca: Math.round((valorTotal - totalOrcado) * 100) / 100,
      total_contratado: exec.total_contratado,
      saldo_a_contratar: Math.round((valorTotal - exec.total_contratado) * 100) / 100,
      total_realizado: Math.round(Object.keys(realizado).reduce((t, k) => t + realizado[k], 0) * 100) / 100,
      primeiro_pagamento: primeiroPag ? Utilities.formatDate(primeiroPag, 'America/Sao_Paulo', 'yyyy-MM-dd') : '',
      qtd_pagamentos: qtdPags,
      rendimentos: Math.round(rendimentos * 100) / 100,
      ir_iof: Math.round(irIof * 100) / 100
    },
    pasta_url: p.pasta_drive_id ? 'https://drive.google.com/drive/folders/' + p.pasta_drive_id : '',
    podeEditar: podeEditar_(u),
    podeContratar: PERFIS_CONTRATACAO.indexOf(u.perfil) > -1
  };
}

function salvarProjeto_(u, d) {
  exigirPerfil_(u, PERFIS_EDICAO);

  const campos = {};
  CAMPOS_PROJETO.forEach(c => {
    if (d[c] === undefined) return;
    if (DATAS_PROJETO.indexOf(c) > -1) campos[c] = paraData_(d[c]);
    else if (c === 'valor_total') campos[c] = paraNumero_(d[c]);
    else if (TEXTO_PROJETO.indexOf(c) > -1) campos[c] = texto_(d[c]);
    else campos[c] = String(d[c]).trim();
  });

  // Quem não é da equipe global só mexe em projeto da própria instituição
  if (ehPersonalizado_(u)) {
    // Permissões por funcionalidade: cria (ou muda de instituição) só onde tem acesso a todos os projetos
    const a = acessoDe_(u);
    const atualP = d.id_projeto ? buscar_('PROJETOS', 'id_projeto', d.id_projeto) : null;
    if (!campos.id_instituicao && atualP) campos.id_instituicao = atualP.id_instituicao;
    const mudouInst = !atualP || String(atualP.id_instituicao) !== String(campos.id_instituicao);
    if (mudouInst && !a.todas && a.instituicoes[String(campos.id_instituicao)] !== 'todos') {
      throw new Error('Você só pode criar projetos nas instituições em que tem acesso a todos os projetos.');
    }
  } else if (!podeVerTudo_(u)) campos.id_instituicao = u.id_instituicao;

  if (!campos.nome_projeto) throw new Error('Informe o nome do projeto.');
  if (!buscar_('INSTITUICOES', 'id_instituicao', campos.id_instituicao)) {
    throw new Error('Selecione uma instituição válida.');
  }
  if (campos.inicio_vigencia && campos.fim_vigencia && campos.fim_vigencia < campos.inicio_vigencia) {
    throw new Error('O fim da vigência não pode ser antes do início.');
  }

  let id = d.id_projeto;
  if (id) {
    exigirAcessoProjeto_(u, id);
    const atual = buscar_('PROJETOS', 'id_projeto', id);
    atualizar_('PROJETOS', atual._linha, campos);
    registrarAuditoria_(u.id_usuario, 'PROJETOS', id, 'edicao', limpar_(atual), campos);
  } else {
    // Evita projeto em dobro (ex.: salvar de novo depois de um erro)
    const repetido = ler_('PROJETOS').find(x => String(x.id_instituicao) === String(campos.id_instituicao) && (
      (campos.termo_fomento_cit && String(x.termo_fomento_cit).trim() === campos.termo_fomento_cit) ||
      String(x.nome_projeto).trim().toLowerCase() === campos.nome_projeto.toLowerCase()));
    if (repetido) throw new Error('Este projeto já existe (' + repetido.id_projeto + ' – ' + repetido.nome_projeto +
      '). Abra-o pela lista de projetos em vez de criar outro.');
    campos.criado_em = new Date();
    campos.criado_por = u.id_usuario;
    if (!campos.status) campos.status = 'Em implantação';
    id = inserir_('PROJETOS', campos).id_projeto;
    registrarAuditoria_(u.id_usuario, 'PROJETOS', id, 'criacao', null, campos);
  }

  garantirPastaProjeto_(id);
  return obterProjeto_(u, id);
}

// ---------------------------------------------------------------------------
// Rubricas

function calcularTotalRubrica_(r) {
  const meses = Number(r.meses) > 0 ? Number(r.meses) : 1;
  return Math.round(Number(r.quantidade || 0) * Number(r.valor_unitario_max || 0) * meses * 100) / 100;
}

function prepararRubrica_(d) {
  const r = {};
  CAMPOS_RUBRICA.forEach(c => {
    if (d[c] === undefined) return;
    r[c] = ['quantidade', 'valor_unitario_max', 'meses', 'carga_horaria'].indexOf(c) > -1
      ? paraNumero_(d[c]) : String(d[c]).trim();
  });
  if (!r.descricao) throw new Error('Informe a descrição da rubrica.');
  if (!(Number(r.quantidade) > 0)) throw new Error('Quantidade precisa ser maior que zero: ' + r.descricao);
  // Lançamento pelo valor total (tela de Orçamento): o unitário sai de total ÷ (qtd × meses)
  // e o total fica exato — a diferença de centavos é ajustada na última parcela do contrato.
  const totalInf = d.valor_total_orcado === undefined || d.valor_total_orcado === '' ? 0 : paraNumero_(d.valor_total_orcado);
  if (totalInf > 0) {
    const div = Number(r.quantidade || 0) * (Number(r.meses) > 0 ? Number(r.meses) : 1);
    if (div > 0) r.valor_unitario_max = Math.round(totalInf / div * 100) / 100;
    if (!(Number(r.quantidade) > 0)) throw new Error('Quantidade precisa ser maior que zero: ' + r.descricao);
    r.valor_total_orcado = Math.round(totalInf * 100) / 100;
    return r;
  }
  if (!(Number(r.valor_unitario_max) > 0)) throw new Error('Valor unitário precisa ser maior que zero: ' + r.descricao);
  r.valor_total_orcado = calcularTotalRubrica_(r);
  return r;
}

function salvarRubrica_(u, d) {
  exigirPerfil_(u, PERFIS_EDICAO);
  exigirAcessoProjeto_(u, d.id_projeto);
  const r = prepararRubrica_(d);

  if (d.id_rubrica) {
    const atual = buscar_('RUBRICAS', 'id_rubrica', d.id_rubrica);
    if (!atual || atual.id_projeto !== d.id_projeto) throw new Error('Rubrica não encontrada.');
    atualizar_('RUBRICAS', atual._linha, r);
    registrarAuditoria_(u.id_usuario, 'RUBRICAS', d.id_rubrica, 'edicao', limpar_(atual), r);
  } else {
    r.id_projeto = d.id_projeto;
    const nova = inserir_('RUBRICAS', r);
    registrarAuditoria_(u.id_usuario, 'RUBRICAS', nova.id_rubrica, 'criacao', null, r);
  }
  return obterProjeto_(u, d.id_projeto);
}

function importarRubricas_(u, idProjeto, linhas) {
  exigirPerfil_(u, PERFIS_EDICAO);
  exigirAcessoProjeto_(u, idProjeto);
  if (!linhas || !linhas.length) throw new Error('Nenhuma linha para importar.');

  const preparadas = linhas.map(prepararRubrica_); // valida tudo antes de gravar qualquer coisa
  preparadas.forEach(r => {
    r.id_projeto = idProjeto;
    inserir_('RUBRICAS', r);
  });
  registrarAuditoria_(u.id_usuario, 'RUBRICAS', idProjeto, 'importacao', null, { qtd: preparadas.length });
  return obterProjeto_(u, idProjeto);
}

function excluirRubrica_(u, idRubrica) {
  exigirPerfil_(u, PERFIS_EDICAO);
  const r = buscar_('RUBRICAS', 'id_rubrica', idRubrica);
  if (!r) throw new Error('Rubrica não encontrada.');
  exigirAcessoProjeto_(u, r.id_projeto);
  if (ler_('CONTRATACOES').some(c => c.id_rubrica === idRubrica)) {
    throw new Error('Esta rubrica já tem contratações vinculadas e não pode ser excluída.');
  }
  conferirLinhas_('RUBRICAS'); aba_('RUBRICAS').deleteRow(r._linha); invalidar_('RUBRICAS');
  registrarAuditoria_(u.id_usuario, 'RUBRICAS', idRubrica, 'exclusao', limpar_(r), null);
  return obterProjeto_(u, r.id_projeto);
}

// ---------------------------------------------------------------------------
// Pastas no Drive: Raiz > Instituição > Projeto > subpastas padrão

const SUBPASTAS_PROJETO = [
  '01 Documentos do projeto', '02 Contratações', '03 Extratos bancários', '04 Prestações bimestrais'
];

function garantirPastaProjeto_(idProjeto) {
  const p = buscar_('PROJETOS', 'id_projeto', idProjeto);
  if (p.pasta_drive_id) return p.pasta_drive_id;

  const inst = buscar_('INSTITUICOES', 'id_instituicao', p.id_instituicao);
  let pastaInst = inst.pasta_drive_id;
  if (!pastaInst) {
    const raiz = DriveApp.getFolderById(config_('pasta_raiz_drive_id'));
    pastaInst = raiz.createFolder((inst.sigla || inst.razao_social) + ' (' + inst.id_instituicao + ')').getId();
    atualizar_('INSTITUICOES', inst._linha, { pasta_drive_id: pastaInst });
    try { compartilharPastaInstituicao_(inst.id_instituicao); } catch (e) { console.warn('Drive: ' + e.message); }
  }

  const pasta = DriveApp.getFolderById(pastaInst)
    .createFolder((p.sigla || p.nome_projeto) + ' (' + p.id_projeto + ')');
  SUBPASTAS_PROJETO.forEach(n => pasta.createFolder(n));
  atualizar_('PROJETOS', p._linha, { pasta_drive_id: pasta.getId() });
  return pasta.getId();
}
