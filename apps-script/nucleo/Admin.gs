/**
 * Admin.gs – Configurações (só ADMIN): usuários e permissões, projetos por instituição,
 * exclusão de projetos e de contratações/lançamentos.
 *
 * Exclusões: os registros apagados são copiados para a aba LIXEIRA (com todos os dados),
 * para conferência ou recuperação manual. A pasta do Drive vai para a lixeira do Drive
 * (pode ser restaurada lá por 30 dias).
 */

const PERFIS_ADMIN = ['ADMIN'];

// Abas com dados de um projeto (todas têm a coluna id_projeto)
const ABAS_DO_PROJETO = ['RUBRICAS', 'CONTRATACOES', 'PARCELAS', 'NOTAS_FISCAIS', 'PAGAMENTOS', 'DOCUMENTOS',
  'COTACOES', 'PROCESSOS_COTACAO', 'ITENS_COMPRA', 'BIMESTRES', 'MOVIMENTO_MENSAL', 'EXTRATO', 'IMPORTACOES_EXTRATO', 'EXECUCOES'];

// ---------------------------------------------------------------------------
// Usuários e alçadas

function listarUsuarios_(u) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const insts = {}; ler_('INSTITUICOES').forEach(i => { insts[i.id_instituicao] = i; });
  const projetos = ler_('PROJETOS');
  return {
    usuarios: ler_('USUARIOS').map(x => {
      const o = limpar_(x);
      delete o.senha_hash; delete o.salt; delete o.callmebot_apikey;
      const a = acessoDe_(x);
      o.legado = x.perfil !== 'ADMIN' && x.perfil !== 'PERSONALIZADO';
      o.admin = x.perfil === 'ADMIN';
      o.permissoes = permissoesPublicas_(x);   // alçada antiga: já convertida para preencher a edição
      o.acesso = a;
      delete o.permissoes.admin;
      o.instituicao_sigla = a.todas ? '' : Object.keys(a.instituicoes).filter(id => insts[id])
        .map(id => insts[id].sigla || insts[id].razao_social).join(', ');
      o.projetos_visiveis = projetosPermitidos_(x).length;
      return o;
    }),
    instituicoes: ler_('INSTITUICOES').map(i => ({ id_instituicao: i.id_instituicao, sigla: i.sigla || i.razao_social })),
    projetos: projetos.map(p => ({ id_projeto: p.id_projeto, id_instituicao: p.id_instituicao, sigla: p.sigla || '',
                                   nome_projeto: p.nome_projeto || '', status: p.status || '' })),
    perfis: LISTAS.perfil
  };
}

/** Confere e limpa as permissões e o acesso vindos da tela. */
function prepararPermissoes_(d) {
  const perm = {};
  const p = d.permissoes || {};
  AREAS_PERMISSAO.forEach(a => { if (p[a] === 'ver' || p[a] === 'editar') perm[a] = p[a]; });
  if (!Object.keys(perm).length) throw new Error('Escolha pelo menos uma funcionalidade (Ver ou Editar).');

  const ac = d.acesso || {};
  if (ac.todas === true) return { permissoes: perm, acesso: { todas: true } };
  const insts = {}; ler_('INSTITUICOES').forEach(i => { insts[i.id_instituicao] = i; });
  const projs = ler_('PROJETOS');
  const o = {};
  Object.keys(ac.instituicoes || {}).forEach(id => {
    if (!insts[id]) return;
    const v = ac.instituicoes[id];
    if (v === 'todos') { o[id] = 'todos'; return; }
    const daInst = projs.filter(x => String(x.id_instituicao) === String(id)).map(x => String(x.id_projeto));
    const lista = (Array.isArray(v) ? v : []).map(String).filter(x => daInst.indexOf(x) > -1);
    if (!lista.length) throw new Error('Marque pelo menos um projeto de ' + (insts[id].sigla || insts[id].razao_social) +
      ' (ou escolha "todos os projetos").');
    o[id] = lista;
  });
  if (!Object.keys(o).length) throw new Error('Escolha as instituições que a pessoa vai acessar (ou "Todas as instituições").');
  return { permissoes: perm, acesso: { instituicoes: o } };
}

function salvarUsuario_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const email = String(d.email || '').trim().toLowerCase();
  const nome = String(d.nome || '').trim();
  const ativo = d.ativo !== false;
  if (!nome) throw new Error('Informe o nome.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');

  // Administrador: acesso a tudo. Demais: permissões escolhidas uma a uma (perfil PERSONALIZADO)
  const admin = d.admin === true;
  const perfil = admin ? 'ADMIN' : 'PERSONALIZADO';
  const pp = admin ? { permissoes: {}, acesso: { todas: true } } : prepararPermissoes_(d);
  const permissoes = admin ? '' : JSON.stringify(pp.permissoes);
  const acesso = admin ? '' : JSON.stringify(pp.acesso);
  const idInst = '';

  const todos = ler_('USUARIOS');
  const mesmoEmail = todos.find(x => String(x.email).trim().toLowerCase() === email && x.id_usuario !== d.id_usuario);
  if (mesmoEmail) throw new Error('Já existe usuário com este e-mail (' + mesmoEmail.nome + ').');

  if (d.id_usuario) {
    const x = todos.find(y => y.id_usuario === d.id_usuario);
    if (!x) throw new Error('Usuário não encontrado.');
    // Não deixa o sistema ficar sem nenhum administrador ativo
    if (x.perfil === 'ADMIN' && x.ativo === true && (perfil !== 'ADMIN' || !ativo)) {
      const outros = todos.filter(y => y.perfil === 'ADMIN' && y.ativo === true && y.id_usuario !== x.id_usuario);
      if (!outros.length) throw new Error('Este é o único administrador ativo. Cadastre outro administrador antes.');
    }
    const campos = { nome: nome, email: email, perfil: perfil, id_instituicao: idInst, ativo: ativo, permissoes: permissoes, acesso: acesso };
    atualizar_('USUARIOS', x._linha, campos);
    registrarAuditoria_(u.id_usuario, 'USUARIOS', x.id_usuario, 'edicao',
      { perfil: x.perfil, ativo: x.ativo, id_instituicao: x.id_instituicao, permissoes: x.permissoes || '', acesso: x.acesso || '' }, campos);
    // Acesso aos arquivos no Drive: tira do que não pode mais ver (e do e-mail antigo) e libera o que pode
    const mudou = String(x.email).trim().toLowerCase() !== email || x.perfil !== perfil || String(x.id_instituicao || '') !== idInst ||
      String(x.acesso || '') !== acesso || String(x.permissoes || '') !== permissoes || !ativo;
    if (mudou) revogarDriveUsuario_(Object.assign({}, x, { email: String(x.email).trim().toLowerCase() }), ativo ? Object.assign({}, x, campos) : null);
    const drive = ativo ? liberarDriveUsuario_(Object.assign({}, x, campos)) : { ok: true, msg: 'Acesso aos arquivos do Drive removido.' };
    return { id_usuario: x.id_usuario, drive: drive };
  }

  const senha = gerarSenhaTemporaria_(), salt = gerarSalt_();
  const novo = inserir_('USUARIOS', {
    nome: nome, email: email, perfil: perfil, id_instituicao: idInst, permissoes: permissoes, acesso: acesso,
    senha_hash: hashSenha_(senha, salt), salt: salt, deve_trocar_senha: true, ativo: ativo, criado_em: new Date()
  });
  registrarAuditoria_(u.id_usuario, 'USUARIOS', novo.id_usuario, 'cadastro', null, { email: email, perfil: perfil, permissoes: permissoes, acesso: acesso });
  const drive = ativo ? liberarDriveUsuario_(novo) : null;
  return { id_usuario: novo.id_usuario, senha_temporaria: senha, drive: drive };
}

// ---------------------------------------------------------------------------
// Acesso aos arquivos no Google Drive
//  Quem vê todas as instituições → pasta raiz do sistema; usuário de instituição → só a pasta da instituição dele
//  (com todos os projetos dentro). Administrador e Prestação de contas: editor; demais: leitor.
//  Assim o usuário abre notas, comprovantes e contratos sem precisar "solicitar acesso".

function pastasDriveDoUsuario_(x) {
  const a = acessoDe_(x);
  if (a.todas) { const r = config_('pasta_raiz_drive_id'); return r ? [r] : []; }
  // Instituição com "todos os projetos" → pasta da instituição; só alguns projetos → a pasta de cada projeto
  const res = [];
  Object.keys(a.instituicoes).forEach(id => {
    const v = a.instituicoes[id];
    if (v === 'todos') {
      const inst = buscar_('INSTITUICOES', 'id_instituicao', id);
      if (inst && inst.pasta_drive_id) res.push(String(inst.pasta_drive_id));
    } else (v || []).forEach(idp => {
      const p = buscar_('PROJETOS', 'id_projeto', idp);
      if (p && p.pasta_drive_id) res.push(String(p.pasta_drive_id));
    });
  });
  return res;
}
function donoDoScript_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }

function liberarDriveUsuario_(x) {
  const email = String(x.email || '').trim().toLowerCase();
  if (!email || email === donoDoScript_()) return { ok: true, msg: '' };
  const editor = ['ADMIN', 'PRESTACAO_CONTAS'].indexOf(x.perfil) > -1 ||
    (x.perfil === 'PERSONALIZADO' && acessoDe_(x).todas === true && permissoesDe_(x).pagamentos === 'editar');
  const pastas = pastasDriveDoUsuario_(x);
  if (!pastas.length) return { ok: true, msg: 'A instituição ainda não tem pasta no Drive; o acesso é liberado quando o 1º projeto dela for criado.' };
  try {
    pastas.forEach(id => {
      const f = DriveApp.getFolderById(id);
      try { const dono = f.getOwner(); if (dono && String(dono.getEmail()).toLowerCase() === email) return; } catch (e) {}   // dono já tem acesso
      if (editor) f.addEditor(email); else f.addViewer(email);
    });
    return { ok: true, msg: 'Acesso aos arquivos do Drive liberado (' + (editor ? 'pode editar' : 'só visualizar') + ').' };
  } catch (e) {
    return { ok: false, msg: 'Não consegui liberar o Drive para ' + email + ': ' + e.message +
      ' – o e-mail precisa ser uma conta Google (Gmail ou Google Workspace).' };
  }
}

/** Tira o acesso das pastas que o usuário (como era antes) via e que, na nova situação, não deve mais ver. */
function revogarDriveUsuario_(antes, depois) {
  const email = String(antes.email || '').trim().toLowerCase();
  if (!email || email === donoDoScript_()) return;
  const manter = {};
  if (depois && String(depois.email || '').trim().toLowerCase() === email) pastasDriveDoUsuario_(depois).forEach(id => { manter[id] = true; });
  pastasDriveDoUsuario_(antes).forEach(id => {
    if (manter[id]) return;
    const f = DriveApp.getFolderById(id);
    try { f.removeEditor(email); } catch (e) {}
    try { f.removeViewer(email); } catch (e) {}
  });
}

/** Botão em Configurações → Usuários: libera o Drive para todos os usuários ativos (os já cadastrados). */
function sincronizarDriveUsuarios_(u) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const r = { liberados: 0, falhas: [] };
  ler_('USUARIOS').filter(x => x.ativo === true).forEach(x => {
    const s = liberarDriveUsuario_(x);
    if (s.ok) r.liberados++; else r.falhas.push(x.nome + ': ' + s.msg);
  });
  registrarAuditoria_(u.id_usuario, 'USUARIOS', '', 'sincronizar_drive', null, r);
  return r;
}

/** Pasta nova de instituição: libera para os usuários daquela instituição (os de "todas" já veem pela raiz). */
function compartilharPastaInstituicao_(idInst) {
  ler_('USUARIOS').filter(x => x.ativo === true && acessoDe_(x).instituicoes && acessoDe_(x).instituicoes[String(idInst)] === 'todos')
    .forEach(x => liberarDriveUsuario_(x));
}

function redefinirSenhaUsuario_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const x = buscar_('USUARIOS', 'id_usuario', d.id_usuario);
  if (!x) throw new Error('Usuário não encontrado.');
  const senha = gerarSenhaTemporaria_(), salt = gerarSalt_();
  atualizar_('USUARIOS', x._linha, { senha_hash: hashSenha_(senha, salt), salt: salt, deve_trocar_senha: true });
  registrarAuditoria_(u.id_usuario, 'USUARIOS', x.id_usuario, 'redefinicao_senha');
  return { senha_temporaria: senha };
}

// ---------------------------------------------------------------------------
// Projetos por instituição e exclusão

function listarProjetosAdmin_(u) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const cont = {};
  ['RUBRICAS', 'CONTRATACOES', 'PAGAMENTOS', 'DOCUMENTOS'].forEach(aba => {
    ler_(aba).forEach(r => { const k = r.id_projeto + '|' + aba; cont[k] = (cont[k] || 0) + 1; });
  });
  const insts = {}; ler_('INSTITUICOES').forEach(i => { insts[i.id_instituicao] = i; });
  return ler_('PROJETOS').map(p => ({
    id_projeto: p.id_projeto, sigla: p.sigla, nome_projeto: p.nome_projeto, status: p.status,
    termo: p.termo_fomento_cit || '', valor_total: Number(p.valor_total || 0),
    id_instituicao: p.id_instituicao, instituicao: insts[p.id_instituicao] ? (insts[p.id_instituicao].sigla || insts[p.id_instituicao].razao_social) : '(sem instituição)',
    criado_em: p.criado_em instanceof Date ? Utilities.formatDate(p.criado_em, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') : '',
    rubricas: cont[p.id_projeto + '|RUBRICAS'] || 0, contratacoes: cont[p.id_projeto + '|CONTRATACOES'] || 0,
    pagamentos: cont[p.id_projeto + '|PAGAMENTOS'] || 0, documentos: cont[p.id_projeto + '|DOCUMENTOS'] || 0
  }));
}

/** Copia os registros para a aba LIXEIRA antes de apagar. */
function guardarNaLixeira_(u, aba, regs, idProjeto) {
  if (!regs.length) return;
  const sh = aba_('LIXEIRA');
  const cab = garantirColunas_(sh, ESTRUTURA.LIXEIRA);
  const agora = new Date();
  const linhas = regs.map((r, i) => {
    const dados = {}; Object.keys(r).forEach(k => { if (k !== '_linha' && k !== 'senha_hash' && k !== 'salt') dados[k] = r[k]; });
    const o = { id_lixo: 'LIX-' + Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyyMMddHHmmss') + '-' + aba + '-' + i,
                aba: aba, id_registro: r[Object.keys(r)[1]] || '', id_projeto: idProjeto || r.id_projeto || '',
                dados_json: JSON.stringify(dados), excluido_em: agora, excluido_por: u.id_usuario };
    return cab.map(c => (o[c] === undefined ? '' : o[c]));
  });
  sh.getRange(linhaLivre_(sh, linhas.length), 1, linhas.length, cab.length).setValues(linhas);
  invalidar_('LIXEIRA');
}

function excluirProjeto_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const p = buscar_('PROJETOS', 'id_projeto', d.id_projeto);
  if (!p) throw new Error('Projeto não encontrado.');
  if (String(d.confirmacao || '').trim().toUpperCase() !== String(p.id_projeto).toUpperCase()) {
    throw new Error('Para confirmar, digite o código do projeto (' + p.id_projeto + ').');
  }
  const resumo = {};
  ABAS_DO_PROJETO.forEach(aba => {
    let regs;
    try { regs = ler_(aba).filter(r => r.id_projeto === p.id_projeto); } catch (e) { return; }
    if (!regs.length) return;
    guardarNaLixeira_(u, aba, regs, p.id_projeto);
    excluirLinhas_(aba, regs.map(r => r._linha));
    resumo[aba] = regs.length;
  });
  const proj = buscar_('PROJETOS', 'id_projeto', p.id_projeto);
  guardarNaLixeira_(u, 'PROJETOS', [proj], p.id_projeto);
  excluirLinhas_('PROJETOS', [proj._linha]);

  let pasta = '';
  if (d.apagar_pasta && p.pasta_drive_id) {
    try { DriveApp.getFolderById(p.pasta_drive_id).setTrashed(true); pasta = 'pasta do Drive enviada para a lixeira'; }
    catch (e) { pasta = 'não consegui mover a pasta do Drive: ' + e.message; }
  }
  registrarAuditoria_(u.id_usuario, 'PROJETOS', p.id_projeto, 'exclusao', { nome: p.nome_projeto }, { removidos: resumo, pasta: pasta });
  return { removidos: resumo, pasta: pasta };
}

/** Exclui uma contratação (ou compra) com parcelas, notas, pagamentos, cotações, itens e documentos. */
function excluirContratacao_(u, d) {
  exigirPerfil_(u, PERFIS_ADMIN);
  const c = buscar_('CONTRATACOES', 'id_contratacao', d.id_contratacao);
  if (!c) throw new Error('Contratação não encontrada.');
  exigirAcessoProjeto_(u, c.id_projeto);
  const idsParc = ler_('PARCELAS').filter(x => x.id_contratacao === c.id_contratacao).map(x => x.id_parcela);
  const plano = [
    ['NOTAS_FISCAIS', r => idsParc.indexOf(r.id_parcela) > -1],
    ['PAGAMENTOS', r => idsParc.indexOf(r.id_parcela) > -1],
    ['PARCELAS', r => r.id_contratacao === c.id_contratacao],
    ['COTACOES', r => r.id_contratacao === c.id_contratacao],
    ['ITENS_COMPRA', r => r.id_contratacao === c.id_contratacao],
    ['EXECUCOES', r => r.id_contratacao === c.id_contratacao],
    ['DOCUMENTOS', r => r.id_contratacao === c.id_contratacao]
  ];
  const resumo = {};
  plano.forEach(([aba, filtro]) => {
    let regs;
    try { regs = ler_(aba).filter(filtro); } catch (e) { return; }
    if (!regs.length) return;
    guardarNaLixeira_(u, aba, regs, c.id_projeto);
    excluirLinhas_(aba, regs.map(r => r._linha));
    resumo[aba] = regs.length;
  });
  // processo de cotação vinculado volta a ficar sem contratação
  ler_('PROCESSOS_COTACAO').filter(x => x.id_contratacao === c.id_contratacao)
    .forEach(x => atualizar_('PROCESSOS_COTACAO', x._linha, { id_contratacao: '' }));
  const ctr = buscar_('CONTRATACOES', 'id_contratacao', c.id_contratacao);
  guardarNaLixeira_(u, 'CONTRATACOES', [ctr], c.id_projeto);
  excluirLinhas_('CONTRATACOES', [ctr._linha]);
  if (c.pasta_drive_id) { try { DriveApp.getFolderById(c.pasta_drive_id).setTrashed(true); } catch (e) {} }
  registrarAuditoria_(u.id_usuario, 'CONTRATACOES', c.id_contratacao, 'exclusao', null, { removidos: resumo });
  return { removidos: resumo };
}


// ---------------------------------------------------------------------------
// Abrir arquivo pelo sistema (sem login no Google): o servidor lê o arquivo do Drive
// e manda para a tela, só se o usuário tiver acesso ao projeto do documento.

function baixarArquivo_(u, d) {
  const id = String(d.id || '').trim();
  if (!/^[\w-]{10,}$/.test(id)) throw new Error('Arquivo inválido.');
  let idProjeto = null;
  const doc = ler_('DOCUMENTOS').find(x => x.drive_file_id === id);
  if (doc) idProjeto = doc.id_projeto;
  else {
    const cot = ler_('COTACOES').find(x => x.rascunho_file_id === id || x.gdoc_id === id);
    if (cot) idProjeto = cot.id_projeto;
  }
  const f = DriveApp.getFileById(id);
  if (doc && doc.id_beneficiario) {
    // Documento de criança (módulo Beneficiários): só quem tem acesso à ficha
    if (typeof benExigirDocumento_ !== 'function') throw new Error('Você não tem acesso a este arquivo.');
    benExigirDocumento_(u, doc);
  } else if (idProjeto === null) {
    // Documentos da instituição (pasta do Cadastro Institucional): quem vê todas ou usuário da própria instituição
    const pais = [];
    const it = f.getParents();
    while (it.hasNext()) pais.push(it.next().getId());
    const inst = ler_('INSTITUICOES').find(i => i.pasta_documentos_id && pais.indexOf(String(i.pasta_documentos_id)) > -1);
    if (inst) {
      if (!podeVerInstituicao_(u, inst.id_instituicao)) throw new Error('Você não tem acesso a este arquivo.');
    } else if (u.perfil !== 'ADMIN') throw new Error('Este arquivo não está registrado no sistema.');
  } else if (idProjeto) exigirAcessoProjeto_(u, idProjeto);
  else if (!podeVerTudo_(u)) throw new Error('Você não tem acesso a este arquivo.');

  let blob, nome = f.getName();
  const mime = f.getMimeType();
  if (mime === MimeType.GOOGLE_DOCS || mime === MimeType.GOOGLE_SHEETS || mime === MimeType.GOOGLE_SLIDES) {
    blob = f.getAs('application/pdf'); nome = nome.replace(/\.[a-z0-9]{2,5}$/i, '') + '.pdf';
  } else blob = f.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Arquivo grande demais para abrir pelo sistema (mais de 25 MB).');
  return { nome: nome, mime: blob.getContentType() || mime, base64: Utilities.base64Encode(bytes) };
}
