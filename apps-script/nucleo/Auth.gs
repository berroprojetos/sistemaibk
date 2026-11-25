/**
 * Auth.gs – login, sessão, troca de senha e regra de acesso por instituição
 *
 * Regra de visibilidade:
 * - Usuário COM id_instituicao  -> vê só os projetos daquela instituição.
 * - Usuário SEM id_instituicao  -> vê todos (equipe de prestação de contas / admin).
 * - Perfis INSTITUICAO_* são obrigados a ter id_instituicao.
 *
 * v2 – permissões por funcionalidade (perfil PERSONALIZADO):
 * - coluna "acesso": {"todas":true} ou {"instituicoes":{"<id_inst>":"todos" | ["<id_projeto>", ...]}}
 * - coluna "permissoes": {"projetos":"ver|editar", "pagamentos":..., "extratos":..., "sit":..., "instituicoes":..., "fornecedores":...}
 * - perfil ADMIN = acesso a tudo. Usuários com as alçadas antigas continuam valendo até serem editados.
 *
 * Senhas nunca ficam na planilha: só o hash (SHA-256 com salt, 1000 iterações).
 */

const SESSAO_SEGUNDOS = 6 * 60 * 60;   // 6 h (máximo do CacheService)
const MAX_TENTATIVAS = 5;
const BLOQUEIO_SEGUNDOS = 15 * 60;
const PERFIS_GLOBAIS = ['ADMIN', 'PRESTACAO_CONTAS'];
const PERFIS_INSTITUICAO = ['INSTITUICAO_CONTRATACAO', 'INSTITUICAO_PAGAMENTO'];
const AREAS_PERMISSAO = ['projetos', 'pagamentos', 'extratos', 'sit', 'instituicoes', 'fornecedores'];
// Alçadas antigas → permissões equivalentes (só para mostrar na tela e para preencher a edição)
const PERMISSOES_LEGADO = {
  PRESTACAO_CONTAS: { projetos: 'editar', pagamentos: 'editar', extratos: 'editar', sit: 'editar', instituicoes: 'editar', fornecedores: 'editar' },
  GERENTE_PROJETO: { projetos: 'editar', pagamentos: 'editar', extratos: 'editar', sit: 'ver', instituicoes: 'ver', fornecedores: 'editar' },
  INSTITUICAO_CONTRATACAO: { projetos: 'editar', pagamentos: 'ver', extratos: 'editar', sit: 'ver', instituicoes: 'ver' },
  INSTITUICAO_PAGAMENTO: { projetos: 'ver', pagamentos: 'editar', extratos: 'editar', sit: 'ver', instituicoes: 'ver' }
};

function hashSenha_(senha, salt) {
  let bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, salt + senha, Utilities.Charset.UTF_8);
  for (let i = 0; i < 999; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return Utilities.base64Encode(bytes);
}

function gerarSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function gerarSenhaTemporaria_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function validarNovaSenha_(senha) {
  if (!senha || senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    throw new Error('A senha precisa ter letras e números.');
  }
}

// ---------------------------------------------------------------------------

function login_(email, senha) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !senha) throw new Error('Informe e-mail e senha.');

  const cache = CacheService.getScriptCache();
  const chaveTent = 'tent_' + email;
  const tentativas = Number(cache.get(chaveTent) || 0);
  if (tentativas >= MAX_TENTATIVAS) {
    throw new Error('Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  }

  const u = ler_('USUARIOS').find(x => String(x.email).trim().toLowerCase() === email);
  const valido = u && u.ativo === true && u.salt && hashSenha_(senha, u.salt) === u.senha_hash;

  if (!valido) {
    cache.put(chaveTent, String(tentativas + 1), BLOQUEIO_SEGUNDOS);
    throw new Error('E-mail ou senha incorretos.');
  }
  if (PERFIS_INSTITUICAO.indexOf(u.perfil) > -1 && !u.id_instituicao) {
    throw new Error('Seu usuário não está vinculado a uma instituição. Fale com o administrador.');
  }

  cache.remove(chaveTent);
  const token = Utilities.getUuid();
  cache.put('sess_' + token, u.id_usuario, SESSAO_SEGUNDOS);
  atualizar_('USUARIOS', u._linha, { ultimo_acesso: new Date() });
  registrarAuditoria_(u.id_usuario, 'USUARIOS', u.id_usuario, 'login');

  return { token: token, usuario: perfilPublico_(u) };
}

/** Valida o token e devolve o usuário (relido da planilha, para respeitar desativação). */
function sessao_(token, completo) {
  if (!token) throw new Error('SESSAO_EXPIRADA');
  const cache = CacheService.getScriptCache();
  // Usuário guardado por 5 min junto da sessão: evita ler a aba USUARIOS a cada clique
  if (!completo) {
    const c = cache.getAll(['sess_' + token, 'sessu_' + token]);
    if (c['sess_' + token] && c['sessu_' + token]) {
      try {
        const uc = JSON.parse(c['sessu_' + token]);
        if (uc.id_usuario === c['sess_' + token]) return uc;
      } catch (e) {}
    }
  }
  const id = cache.get('sess_' + token);
  if (!id) throw new Error('SESSAO_EXPIRADA');

  const u = buscar_('USUARIOS', 'id_usuario', id);
  if (!u || u.ativo !== true) {
    cache.remove('sess_' + token);
    throw new Error('SESSAO_EXPIRADA');
  }
  cache.put('sess_' + token, id, SESSAO_SEGUNDOS); // renova
  const leve = {}; Object.keys(u).forEach(k => { if (['senha_hash', 'salt', '_linha'].indexOf(k) === -1) leve[k] = u[k]; });
  cache.put('sessu_' + token, JSON.stringify(leve), 300);
  return u;
}

function logout_(token) {
  CacheService.getScriptCache().removeAll(['sess_' + token, 'sessu_' + token]);
  return true;
}

function trocarSenha_(u, senhaAtual, novaSenha) {
  if (hashSenha_(senhaAtual, u.salt) !== u.senha_hash) throw new Error('Senha atual incorreta.');
  validarNovaSenha_(novaSenha);
  if (novaSenha === senhaAtual) throw new Error('A nova senha precisa ser diferente da atual.');
  const salt = gerarSalt_();
  atualizar_('USUARIOS', u._linha, {
    senha_hash: hashSenha_(novaSenha, salt),
    salt: salt,
    deve_trocar_senha: false
  });
  registrarAuditoria_(u.id_usuario, 'USUARIOS', u.id_usuario, 'troca_senha');
  return true;
}

function perfilPublico_(u) {
  const a = acessoDe_(u);
  let rotulo = 'Todas as instituições';
  if (!a.todas) {
    const siglas = {}; ler_('INSTITUICOES').forEach(i => { siglas[i.id_instituicao] = i.sigla || i.razao_social; });
    const ids = Object.keys(a.instituicoes).filter(id => siglas[id]);
    rotulo = !ids.length ? 'Nenhuma instituição' : ids.length > 3 ? ids.length + ' instituições' : ids.map(id => siglas[id]).join(', ');
  }
  return {
    id_usuario: u.id_usuario,
    nome: u.nome,
    email: u.email,
    perfil: u._personalizado ? 'PERSONALIZADO' : u.perfil,
    id_instituicao: u.id_instituicao || '',
    instituicao: rotulo,
    todas: a.todas === true,
    permissoes: permissoesPublicas_(u),
    pode_criar_projeto: podeCriarProjeto_(u),
    deve_trocar_senha: u.deve_trocar_senha === true
  };
}

// ---------------------------------------------------------------------------
// Permissões por funcionalidade (v2)

function jsonUsuario_(v) {
  if (v && typeof v === 'object') return v;
  try { return v ? JSON.parse(String(v)) : {}; } catch (e) { return {}; }
}

/** Usuário no modelo novo (permissões escolhidas uma a uma). Na requisição o perfil vira PRESTACAO_CONTAS, com a marca _personalizado. */
function ehPersonalizado_(u) { return u.perfil === 'PERSONALIZADO' || u._personalizado === true; }

/** {area: 'ver' | 'editar' | ''} – para as regras do servidor */
function permissoesDe_(u) {
  const r = {};
  if (u.perfil === 'ADMIN' && !u._personalizado) { AREAS_PERMISSAO.forEach(a => { r[a] = 'editar'; }); r.admin = true; return r; }
  const p = ehPersonalizado_(u) ? jsonUsuario_(u.permissoes) : (PERMISSOES_LEGADO[u.perfil] || {});
  AREAS_PERMISSAO.forEach(a => { r[a] = p[a] === 'editar' || p[a] === 'ver' ? p[a] : ''; });
  return r;
}

/** Permissões para a tela (alçada antiga: ajusta ao que ela realmente permite) */
function permissoesPublicas_(u) {
  const r = permissoesDe_(u);
  if (!ehPersonalizado_(u) && !r.admin && !podeVerTudo_(u)) {
    r.fornecedores = '';
    if (r.instituicoes === 'editar') r.instituicoes = 'ver';
  }
  return r;
}

function nivel_(u, area) { return permissoesDe_(u)[area] || ''; }

/** {todas:true} ou {instituicoes: {id_inst: 'todos' | [id_projeto...]}} */
function acessoDe_(u) {
  if (u.perfil === 'ADMIN' && !u._personalizado) return { todas: true };
  if (ehPersonalizado_(u)) {
    const a = jsonUsuario_(u.acesso);
    if (a.todas === true) return { todas: true };
    const o = {};
    Object.keys(a.instituicoes || {}).forEach(id => {
      const v = a.instituicoes[id];
      if (v === 'todos') o[id] = 'todos';
      else if (Array.isArray(v)) o[id] = v.map(String);
    });
    return { instituicoes: o };
  }
  if (!u.id_instituicao && PERFIS_INSTITUICAO.indexOf(u.perfil) === -1) return { todas: true };
  const o = {};
  if (u.id_instituicao) o[u.id_instituicao] = 'todos';
  return { instituicoes: o };
}

function podeVerInstituicao_(u, idInst) {
  const a = acessoDe_(u);
  return a.todas === true || !!a.instituicoes[String(idInst)];
}

/** Pode criar projeto: edita Projetos e tem acesso a todos os projetos de pelo menos uma instituição */
function podeCriarProjeto_(u) {
  if (!ehPersonalizado_(u)) return (PERFIS_EDICAO.indexOf(u.perfil) > -1 && podeVerTudo_(u));
  if (nivel_(u, 'projetos') !== 'editar') return false;
  const a = acessoDe_(u);
  return a.todas === true || Object.keys(a.instituicoes).some(id => a.instituicoes[id] === 'todos');
}

// ---------------------------------------------------------------------------
// Escopo de acesso: TODA consulta de dados passa por aqui.

function podeVerTudo_(u) {
  return acessoDe_(u).todas === true;
}

function projetosPermitidos_(u) {
  const projetos = ler_('PROJETOS');
  const a = acessoDe_(u);
  if (a.todas) return projetos;
  return projetos.filter(p => {
    const v = a.instituicoes[String(p.id_instituicao)];
    return v === 'todos' || (Array.isArray(v) && v.indexOf(String(p.id_projeto)) > -1);
  });
}

function exigirAcessoProjeto_(u, idProjeto) {
  const ok = projetosPermitidos_(u).some(p => String(p.id_projeto) === String(idProjeto));
  if (!ok) throw new Error('Você não tem acesso a este projeto.');
}

function exigirPerfil_(u, perfis) {
  if (perfis.indexOf(u.perfil) === -1) throw new Error('Seu perfil não permite esta ação.');
}
