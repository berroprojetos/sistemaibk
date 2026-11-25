/**
 * Menu.gs – ferramentas de administração direto na planilha
 * (menu "Gestor" aparece ao abrir a planilha)
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gestor')
    .addItem('Cadastrar usuário', 'cadastrarUsuarioUI')
    .addItem('Redefinir senha de usuário', 'redefinirSenhaUI')
    .addSeparator()
    .addItem('Gerar IDs faltantes na aba atual', 'gerarIdsFaltantesUI')
    .addItem('Corrigir IDs repetidos', 'corrigirIdsRepetidosUI')
    .addSeparator()
    .addItem('Cadastrar modelo de contrato', 'cadastrarModeloUI')
    .addItem('Criar modelo de contrato de exemplo', 'criarModeloExemploUI')
    .addItem('Cadastrar modelo de cotação', 'cadastrarModeloCotacaoUI')
    .addSeparator()
    .addItem('Limpar cache do sistema', 'limparCacheUI')
    .addItem('Atualizar estrutura (setup)', 'setupSistema')
    .addToUi();
}

function perguntar_(ui, titulo, texto) {
  const r = ui.prompt(titulo, texto, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) throw new Error('CANCELADO');
  return r.getResponseText().trim();
}

function cadastrarUsuarioUI() {
  const ui = SpreadsheetApp.getUi();
  try {
    const nome = perguntar_(ui, 'Novo usuário', 'Nome completo:');
    const email = perguntar_(ui, 'Novo usuário', 'E-mail (usado no login):').toLowerCase();
    if (buscar_('USUARIOS', 'email', email)) return ui.alert('Já existe usuário com este e-mail.');

    const perfil = perguntar_(ui, 'Novo usuário',
      'Perfil (digite exatamente):\n' + LISTAS.perfil.join('\n')).toUpperCase();
    if (LISTAS.perfil.indexOf(perfil) === -1) return ui.alert('Perfil inválido.');

    const insts = ler_('INSTITUICOES');
    const listaInst = insts.map(i => i.id_instituicao + ' – ' + (i.sigla || i.razao_social)).join('\n');
    const idInst = perguntar_(ui, 'Novo usuário',
      'ID da instituição (deixe em branco para ver TODAS):\n' + (listaInst || '(nenhuma cadastrada)')).toUpperCase();

    if (idInst && !insts.some(i => i.id_instituicao === idInst)) return ui.alert('Instituição não encontrada.');
    if (!idInst && PERFIS_INSTITUICAO.indexOf(perfil) > -1) {
      return ui.alert('Perfis de instituição precisam estar vinculados a uma instituição.');
    }

    const senha = gerarSenhaTemporaria_();
    const salt = gerarSalt_();
    const novo = inserir_('USUARIOS', {
      nome: nome, email: email, perfil: perfil, id_instituicao: idInst,
      senha_hash: hashSenha_(senha, salt), salt: salt,
      deve_trocar_senha: true, ativo: true, criado_em: new Date()
    });
    registrarAuditoria_('', 'USUARIOS', novo.id_usuario, 'cadastro');

    ui.alert('Usuário criado: ' + novo.id_usuario,
      'Senha temporária: ' + senha + '\n\nEnvie para a pessoa. No primeiro acesso ela será obrigada a trocar.',
      ui.ButtonSet.OK);
  } catch (e) {
    if (e.message !== 'CANCELADO') ui.alert('Erro: ' + e.message);
  }
}

function redefinirSenhaUI() {
  const ui = SpreadsheetApp.getUi();
  try {
    const email = perguntar_(ui, 'Redefinir senha', 'E-mail do usuário:').toLowerCase();
    const u = buscar_('USUARIOS', 'email', email);
    if (!u) return ui.alert('Usuário não encontrado.');

    const senha = gerarSenhaTemporaria_();
    const salt = gerarSalt_();
    atualizar_('USUARIOS', u._linha, {
      senha_hash: hashSenha_(senha, salt), salt: salt, deve_trocar_senha: true
    });
    registrarAuditoria_('', 'USUARIOS', u.id_usuario, 'redefinicao_senha');
    ui.alert('Nova senha temporária de ' + u.nome + ': ' + senha);
  } catch (e) {
    if (e.message !== 'CANCELADO') ui.alert('Erro: ' + e.message);
  }
}

/** Preenche o ID das linhas que foram digitadas à mão sem ID. */
function gerarIdsFaltantesUI() {
  const ui = SpreadsheetApp.getUi();
  registrarModulos_();
  const sh = SpreadsheetApp.getActiveSheet();
  const nome = sh.getName();
  if (!PREFIXOS[nome]) return ui.alert('Esta aba não usa ID automático.');
  if (sh.getLastRow() < 2) return ui.alert('Nenhuma linha preenchida.');

  const valores = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  let qtd = 0;
  valores.forEach((linha, i) => {
    const temConteudo = linha.slice(1).some(v => v !== '');
    if (!linha[0] && temConteudo) {
      sh.getRange(i + 2, 1).setValue(gerarId(nome));
      qtd++;
      invalidar_(nome);
    }
  });
  ui.alert(qtd + ' ID(s) gerado(s) em ' + nome + '.');
}

/**
 * Rode esta função pelo editor (▷ Executar) sempre que o sistema passar a usar
 * um serviço novo do Google: ela faz o Google pedir as autorizações que faltam.
 */
function autorizarPermissoes() {
  DriveApp.getRootFolder();
  DocumentApp.getActiveDocument;          // Google Docs (contratos e cotações)
  Logger.log('E-mails disponíveis hoje: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Permissões OK');
}

/**
 * Edição feita à mão na planilha: o sistema passa a ler a aba de novo (o cache dela deixa de valer).
 * (gatilho simples do Google: roda sozinho a cada edição manual)
 */
function onEdit(e) {
  try {
    const nome = e && e.range ? e.range.getSheet().getName() : '';
    const p = {};
    p[nome ? 'ver_' + nome : 'ver_global'] = String(Date.now());
    PropertiesService.getScriptProperties().setProperties(p);
  } catch (err) {}
}

/** Menu Gestor > Limpar cache do sistema (use se inserir/apagar linhas à mão e algo parecer desatualizado). */
function limparCacheUI() {
  PropertiesService.getScriptProperties().setProperty('ver_global', String(Date.now()));
  SpreadsheetApp.getUi().alert('Cache limpo. O sistema vai ler a planilha de novo na próxima ação. ✓');
}
