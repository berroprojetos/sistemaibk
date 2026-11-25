/**
 * Api.gs – ponto de entrada do App da Web (chamado pelo site no GitHub)
 *
 * O site envia POST com corpo JSON: { acao, token, dados }
 * Resposta: { ok: true, dados } ou { ok: false, erro }
 */

function doPost(e) {
  let resposta;
  EM_REQUISICAO_ = true;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    resposta = req.acao === 'lote'
      ? { ok: true, dados: lote_(req.token, req.dados || {}) }
      : { ok: true, dados: rotear_(req.acao, req.token, req.dados || {}) };
  } catch (err) {
    resposta = { ok: false, erro: err.message || String(err) };
  }
  // Grava de fato e atualiza a versão das abas alteradas (mesmo se houve erro no meio)
  try { finalizarGravacoes_(); } catch (err) { if (resposta.ok) resposta = { ok: false, erro: 'Falha ao confirmar a gravação: ' + err.message }; }
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, sistema: 'Gestor de Projetos' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Várias ações numa só chamada (ex.: gravar + recarregar a tela), na ordem enviada.
 * Cada item devolve { ok, dados } ou { ok:false, erro }. Se uma gravação falhar, as seguintes não rodam.
 */
function lote_(token, d) {
  const itens = d.itens || [];
  const res = [];
  let parou = false;
  itens.forEach(it => {
    if (parou) { res.push({ ok: false, erro: 'não executado: a ação anterior falhou' }); return; }
    try { res.push({ ok: true, dados: rotear_(it.acao, token, it.dados || {}) }); }
    catch (err) {
      if (err.message === 'SESSAO_EXPIRADA') throw err;
      res.push({ ok: false, erro: err.message || String(err) });
      if (!/^(listar|obter|me$|previa)/.test(it.acao)) parou = true;
    }
  });
  return res;
}

function rotear_(acao, token, dados) {
  registrarModulos_();   // módulos vendidos à parte (Modulos.gs)
  // Ações públicas
  if (acao === 'login') return login_(dados.email, dados.senha);

  // Daqui para baixo, só com sessão válida
  const u0 = sessao_(token);
  if (!ehPersonalizado_(u0)) return executar_(acao, token, dados, u0);

  // Usuário com permissões por funcionalidade: confere a área e o nível antes de executar
  const regra = regraAcao_(acao, dados);
  const perm = permissoesDe_(u0);
  if (regra) {
    if (regra[0] === 'admin') throw new Error('Esta ação é só para o administrador.');
    const ok = regra[0].split('|').some(a => regra[1] === 'editar' ? perm[a] === 'editar' : !!perm[a]);
    if (!ok) {
      const nomes = regra[0].split('|').map(a => NOMES_AREA[a] || a).join(' / ');
      throw new Error(regra[1] === 'editar' && regra[0].split('|').some(a => perm[a] === 'ver')
        ? 'Você tem permissão só para ver ' + nomes + ', não para alterar.'
        : 'Você não tem acesso a ' + nomes + '.');
    }
  }
  // As regras antigas de cada função passam (a permissão já foi conferida acima); o acesso a instituições e
  // projetos continua valendo pelo que foi escolhido para o usuário (acessoDe_ usa a marca _personalizado)
  const u = Object.assign({}, u0, { perfil: 'PRESTACAO_CONTAS', _personalizado: true });
  const res = executar_(acao, token, dados, u);
  limitarFlags_(res, perm, regra ? regra[0] : 'projetos', 0);
  return res;
}

const NOMES_AREA = { projetos: 'Projetos', pagamentos: 'Pagamentos', extratos: 'Extratos', sit: 'Prestação SIT',
  instituicoes: 'Instituições', fornecedores: 'Fornecedores', admin: 'Configurações' };

// ação → [área(s) separadas por |, nível exigido]. Ações fora da lista: liberadas (o acesso aos projetos continua valendo).
const ACOES_AREA = {
  listarInstituicoesCompleto: ['instituicoes', 'ver'], listarDocsInstituicoes: ['instituicoes', 'ver'],
  salvarInstituicao: ['instituicoes', 'editar'], listarEnviosFormInst: ['instituicoes', 'editar'], enviarDocInstituicao: ['instituicoes', 'editar'],

  obterProjeto: ['projetos', 'ver'], salvarProjeto: ['projetos', 'editar'],
  salvarRubrica: ['projetos', 'editar'], importarRubricas: ['projetos', 'editar'], excluirRubrica: ['projetos', 'editar'],
  obterContratacao: ['projetos', 'ver'], salvarContratacao: ['projetos', 'editar'], salvarCotacao: ['projetos', 'editar'],
  excluirCotacao: ['projetos', 'editar'], enviarDocumento: ['projetos', 'editar'], excluirDocumento: ['projetos', 'editar'],
  gerarContrato: ['projetos', 'editar'], encerrarContratacao: ['projetos', 'editar'], importarContratacoes: ['projetos', 'editar'],
  padronizarNomesArquivos: ['projetos', 'editar'],
  listarProcessosCotacao: ['projetos', 'ver'], salvarProcessoCotacao: ['projetos', 'editar'], anexarCotacaoAssinada: ['projetos', 'editar'],
  marcarCotacaoVencedora: ['projetos', 'editar'], gerarRascunhoCotacao: ['projetos', 'editar'], editarProcessoCotacao: ['projetos', 'editar'],
  regerarCotacao: ['projetos', 'editar'], excluirProcessoCotacao: ['projetos', 'editar'],
  obterExecucoes: ['projetos|pagamentos', 'ver'], salvarExecucao: ['projetos', 'editar'], excluirExecucao: ['projetos', 'editar'],
  faturarExecucoes: ['projetos|pagamentos', 'editar'], desfazerFaturamento: ['projetos|pagamentos', 'editar'],

  obterExtratos: ['extratos', 'ver'], obterConciliacao: ['extratos', 'ver'], anexarExtrato: ['extratos', 'editar'],
  excluirExtrato: ['extratos', 'editar'], ligarLancamento: ['extratos', 'editar'], classificarLancamento: ['extratos', 'editar'],
  conciliarAgora: ['extratos', 'editar'],
  obterExtratosMes: ['extratos', 'ver'], anexarExtratoMes: ['extratos', 'editar'], excluirExtratoMes: ['extratos', 'editar'], salvarTaxasMes: ['extratos', 'editar'], salvarLeituraExtrato: ['extratos', 'editar'],

  listarMesPagamentos: ['pagamentos', 'ver'], previaEmailNF: ['pagamentos', 'ver'], listarParcelasProjeto: ['pagamentos|projetos', 'ver'],
  solicitarNFs: ['pagamentos', 'editar'], salvarModeloEmail: ['pagamentos', 'editar'], restaurarModeloEmail: ['pagamentos', 'editar'],
  anexarNF: ['pagamentos', 'editar'], liberarParcelas: ['pagamentos', 'editar'], anexarComprovante: ['pagamentos', 'editar'],
  conferirParcela: ['pagamentos', 'editar'], voltarEtapaParcela: ['pagamentos', 'editar'], importarLancamento: ['pagamentos', 'editar'],
  salvarCompra: ['pagamentos|projetos', 'editar'], reprogramarParcela: ['pagamentos', 'editar'], pausarParcelas: ['pagamentos', 'editar'],
  excluirLancamento: ['pagamentos', 'editar'], moverLancamento: ['pagamentos', 'editar'],

  listarBimestres: ['sit', 'ver'], obterBimestre: ['sit', 'ver'], salvarBimestre: ['sit', 'editar'], marcarLancadasSIT: ['sit', 'editar'], anexarExtratoSIT: ['sit', 'editar'], excluirExtratoSIT: ['sit', 'editar'],

  salvarFornecedorBase: ['fornecedores', 'editar'], salvarVinculosForn: ['fornecedores', 'editar'],

  listarUsuarios: ['admin'], salvarUsuario: ['admin'], redefinirSenhaUsuario: ['admin'], sincronizarDriveUsuarios: ['admin'],
  listarProjetosAdmin: ['admin'], excluirProjeto: ['admin'], excluirContratacao: ['admin'], salvarListas: ['admin'],
  obterConfigBaseForn: ['admin'], conectarBaseForn: ['admin'], salvarMapaForn: ['admin']
};

function regraAcao_(acao, dados) {
  // Base de fornecedores: a tela de contratação também lê (para escolher o contratado)
  if (acao === 'listarFornecedoresBase') return dados && dados.para_contratacao ? ['fornecedores|projetos', 'ver'] : ['fornecedores', 'ver'];
  return ACOES_AREA[acao] || regraModulo_(acao) || null;
}

// Indicadores "pode_..." da resposta: só ficam verdadeiros se o usuário EDITA a área correspondente
const FLAG_AREA = { pode_conferir: 'pagamentos', pode_reprogramar: 'pagamentos', pode_lancar_direto: 'pagamentos',
  pode_pausar: 'pagamentos', pode_editar_modelo: 'pagamentos', pode_registrar: 'projetos', pode_faturar: 'projetos|pagamentos',
  podeContratar: 'projetos', podeEditar: 'projetos', pode_anexar: 'extratos', pode_conciliar: 'extratos' };

function limitarFlags_(r, perm, area, prof) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || prof > 3) return;
  Object.keys(r).forEach(k => {
    const v = r[k];
    if (/^pode/i.test(k) && typeof v === 'boolean') {
      if (v && !(FLAG_AREA[k] || area).split('|').some(a => perm[a] === 'editar')) r[k] = false;
    }
    else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) limitarFlags_(v, perm, area, prof + 1);
  });
}

function executar_(acao, token, dados, u) {
  switch (acao) {
    // Sessão
    case 'logout':            return logout_(token);
    case 'me':                return perfilPublico_(u);
    case 'trocarSenha':       return trocarSenha_(sessao_(token, true), dados.senhaAtual, dados.novaSenha);

    // Projetos
    case 'listarProjetos':    return listarProjetos_(u);
    case 'listarInstituicoes':return listarInstituicoes_(u);
    case 'listarInstituicoesCompleto': return listarInstituicoesCompleto_(u);
    case 'salvarInstituicao': return salvarInstituicao_(u, dados);
    case 'listarEnviosFormInst':  return listarEnviosFormInst_(u);
    case 'listarDocsInstituicoes': return listarDocsInstituicoes_(u);
    case 'enviarDocInstituicao':  return enviarDocInstituicao_(u, dados);
    case 'obterProjeto':      return obterProjeto_(u, dados.id_projeto);
    case 'salvarProjeto':     return salvarProjeto_(u, dados);

    // Rubricas
    case 'salvarRubrica':     return salvarRubrica_(u, dados);
    case 'importarRubricas':  return importarRubricas_(u, dados.id_projeto, dados.linhas);
    case 'excluirRubrica':    return excluirRubrica_(u, dados.id_rubrica);

    // Contratações
    case 'obterContratacao':  return obterContratacao_(u, dados.id_contratacao);
    case 'salvarContratacao': return salvarContratacao_(u, dados);
    case 'salvarCotacao':     return salvarCotacao_(u, dados);
    case 'excluirCotacao':    return excluirCotacao_(u, dados.id_cotacao);
    case 'enviarDocumento':   return enviarDocumento_(u, dados);
    case 'excluirDocumento':  return excluirDocumento_(u, dados.id_documento);
    case 'gerarContrato':     return gerarContrato_(u, dados);

    // Processos de cotação
    case 'listarProcessosCotacao': return listarProcessosCotacao_(u, dados.id_projeto);
    case 'salvarProcessoCotacao':  return salvarProcessoCotacao_(u, dados);
    case 'anexarCotacaoAssinada':  return anexarCotacaoAssinada_(u, dados);
    case 'marcarCotacaoVencedora': return marcarCotacaoVencedora_(u, dados);
    case 'gerarRascunhoCotacao':   return gerarRascunhoCotacao_(u, dados);
    case 'editarProcessoCotacao':  return editarProcessoCotacao_(u, dados);
    case 'regerarCotacao':         return regerarCotacao_(u, dados);
    case 'obterExtratos':          return obterExtratos_(u, dados);
    case 'obterExtratosMes':       return obterExtratosMes_(u, dados);
    case 'anexarExtratoMes':       return anexarExtratoMes_(u, dados);
    case 'excluirExtratoMes':      return excluirExtratoMes_(u, dados);
    case 'salvarTaxasMes':         return salvarTaxasMes_(u, dados);
    case 'salvarLeituraExtrato':   return salvarLeituraExtrato_(u, dados);
    case 'anexarExtrato':          return anexarExtrato_(u, dados);
    case 'excluirExtrato':         return excluirExtrato_(u, dados);
    case 'obterConciliacao':       return obterConciliacao_(u, dados);
    case 'ligarLancamento':        return ligarLancamento_(u, dados);
    case 'classificarLancamento':  return classificarLancamento_(u, dados);
    case 'conciliarAgora':         return conciliarAgora_(u, dados);
    case 'excluirProcessoCotacao': return excluirProcessoCotacao_(u, dados.id_processo);

    // Pagamentos (ciclo mensal)
    case 'listarMesPagamentos': return listarMesPagamentos_(u, dados);
    case 'solicitarNFs':        return solicitarNFs_(u, dados);
    case 'previaEmailNF':       return previaEmailNF_(u, dados);
    case 'salvarModeloEmail':   return salvarModeloEmail_(u, dados);
    case 'restaurarModeloEmail':return restaurarModeloEmail_(u);
    case 'anexarNF':            return anexarNF_(u, dados);
    case 'liberarParcelas':     return liberarParcelas_(u, dados);
    case 'anexarComprovante':   return anexarComprovante_(u, dados);
    case 'conferirParcela':     return conferirParcela_(u, dados);
    case 'voltarEtapaParcela':  return voltarEtapaParcela_(u, dados);
    case 'listarParcelasProjeto': return listarParcelasProjeto_(u, dados);
    case 'importarLancamento':  return importarLancamento_(u, dados);
    case 'salvarCompra':        return salvarCompra_(u, dados);
    case 'importarContratacoes': return importarContratacoes_(u, dados);
    // Configurações (administrador)
    case 'listarUsuarios':      return listarUsuarios_(u);
    case 'salvarUsuario':       return salvarUsuario_(u, dados);
    case 'redefinirSenhaUsuario': return redefinirSenhaUsuario_(u, dados);
    case 'sincronizarDriveUsuarios': return sincronizarDriveUsuarios_(u);
    case 'baixarArquivo':       return baixarArquivo_(u, dados);
    case 'listarProjetosAdmin': return listarProjetosAdmin_(u);
    case 'excluirProjeto':      return excluirProjeto_(u, dados);
    case 'excluirContratacao':  return excluirContratacao_(u, dados);
    case 'encerrarContratacao': return encerrarContratacao_(u, dados);
    case 'padronizarNomesArquivos': return padronizarNomesArquivos_(u, dados);
    case 'listarFornecedoresBase':  return listarFornecedoresBase_(u, dados);
    case 'salvarFornecedorBase':    return salvarFornecedorBase_(u, dados);
    case 'salvarVinculosForn':      return salvarVinculosForn_(u, dados);
    case 'obterExecucoes':          return obterExecucoes_(u, dados);
    case 'obterListas':             return obterListas_(u);
    case 'reprogramarParcela':      return reprogramarParcela_(u, dados);
    case 'pausarParcelas':          return pausarParcelas_(u, dados);
    case 'salvarListas':            return salvarListas_(u, dados);
    case 'salvarExecucao':          return salvarExecucao_(u, dados);
    case 'excluirExecucao':         return excluirExecucao_(u, dados);
    case 'faturarExecucoes':        return faturarExecucoes_(u, dados);
    case 'desfazerFaturamento':     return desfazerFaturamento_(u, dados);
    case 'obterConfigBaseForn':     return obterConfigBaseForn_(u);
    case 'conectarBaseForn':        return conectarBaseForn_(u, dados);
    case 'salvarMapaForn':          return salvarMapaForn_(u, dados);
    case 'excluirLancamento':   return excluirLancamento_(u, dados);
    case 'moverLancamento':     return moverLancamento_(u, dados);
    // Prestação SIT bimestral
    case 'listarBimestres':     return listarBimestres_(u, dados);
    case 'obterBimestre':       return obterBimestre_(u, dados);
    case 'salvarBimestre':      return salvarBimestre_(u, dados);
    case 'marcarLancadasSIT':   return marcarLancadasSIT_(u, dados);
    case 'anexarExtratoSIT':    return anexarExtratoSIT_(u, dados);
    case 'excluirExtratoSIT':   return excluirExtratoSIT_(u, dados);

    default: {
      const mod = acaoModulo_(acao);            // ação de um módulo (ex.: Beneficiários)
      if (mod) return mod.fn(u, dados);
      throw new Error('Ação desconhecida: ' + acao);
    }
  }
}

// ---------------------------------------------------------------------------

function listarProjetos_(u) {
  const insts = {};
  ler_('INSTITUICOES').forEach(i => { insts[i.id_instituicao] = i; });

  return projetosPermitidos_(u).map(p => {
    const o = limpar_(p);
    const inst = insts[p.id_instituicao];
    o.instituicao_sigla = inst ? inst.sigla : '';
    o.instituicao_nome = inst ? inst.razao_social : '';
    return o;
  });
}
