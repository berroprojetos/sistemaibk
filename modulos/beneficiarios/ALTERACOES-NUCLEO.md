# Alterações no núcleo (Gestor da Berro) para receber módulos

São pequenas e servem para qualquer módulo futuro. As cópias já alteradas estão em `apps-script/nucleo/` e `docs/index.html`. Abaixo, o que mudou em cada arquivo (linhas com + entraram, com - saíram).

## Api.gs

```diff
@@ -48,6 +48,7 @@
 }
 
 function rotear_(acao, token, dados) {
+  registrarModulos_();   // módulos vendidos à parte (Modulos.gs)
   // Ações públicas
   if (acao === 'login') return login_(dados.email, dados.senha);
 
@@ -120,7 +121,7 @@
 function regraAcao_(acao, dados) {
   // Base de fornecedores: a tela de contratação também lê (para escolher o contratado)
   if (acao === 'listarFornecedoresBase') return dados && dados.para_contratacao ? ['fornecedores|projetos', 'ver'] : ['fornecedores', 'ver'];
-  return ACOES_AREA[acao] || null;
+  return ACOES_AREA[acao] || regraModulo_(acao) || null;
 }
 
 // Indicadores "pode_..." da resposta: só ficam verdadeiros se o usuário EDITA a área correspondente
@@ -244,8 +245,11 @@
     case 'anexarExtratoSIT':    return anexarExtratoSIT_(u, dados);
     case 'excluirExtratoSIT':   return excluirExtratoSIT_(u, dados);
 
-    default:
+    default: {
+      const mod = acaoModulo_(acao);            // ação de um módulo (ex.: Beneficiários)
+      if (mod) return mod.fn(u, dados);
       throw new Error('Ação desconhecida: ' + acao);
+    }
   }
 }
 
```

## Código.gs

```diff
@@ -235,6 +235,7 @@
 
 function setupSistema() {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
+  registrarModulos_();   // abas, listas e validações dos módulos instalados (Modulos.gs)
 
   Object.keys(ESTRUTURA).forEach(nome => criarOuAtualizarAba_(ss, nome, ESTRUTURA[nome]));
   preencherListas_(ss);
```

## Admin.gs

```diff
@@ -323,7 +323,11 @@
     if (cot) idProjeto = cot.id_projeto;
   }
   const f = DriveApp.getFileById(id);
-  if (idProjeto === null) {
+  if (doc && doc.id_beneficiario) {
+    // Documento de criança (módulo Beneficiários): só quem tem acesso à ficha
+    if (typeof benExigirDocumento_ !== 'function') throw new Error('Você não tem acesso a este arquivo.');
+    benExigirDocumento_(u, doc);
+  } else if (idProjeto === null) {
     // Documentos da instituição (pasta do Cadastro Institucional): quem vê todas ou usuário da própria instituição
     const pais = [];
     const it = f.getParents();
```

## Menu.gs

```diff
@@ -86,6 +86,7 @@
 /** Preenche o ID das linhas que foram digitadas à mão sem ID. */
 function gerarIdsFaltantesUI() {
   const ui = SpreadsheetApp.getUi();
+  registrarModulos_();
   const sh = SpreadsheetApp.getActiveSheet();
   const nome = sh.getName();
   if (!PREFIXOS[nome]) return ui.alert('Esta aba não usa ID automático.');
```

## index.html (site)

```diff
@@ -1239,6 +1239,8 @@
   <div class="modal-corpo" id="corpoCtr"></div>
 </dialog>
 
+<!-- Módulos vendidos à parte: cada um é um arquivo .js (apague a linha do módulo que o cliente não comprou) -->
+<script src="beneficiarios.js"></script>
 <script>
   // >>> Cole aqui a URL do App da Web (Implantar > Gerenciar implantações)
   const API_URL = 'https://script.google.com/macros/s/AKfycbwuthtTVEQ6doF05EMRTFbznYxQ_R7YInP3ee2VECyKAPPonqo6fxIjm75Bnl7IzIRBTA/exec';
@@ -1493,6 +1495,7 @@
     ['sit', 'Prestação SIT', 'Bimestres, movimento mensal, envio ao SIT e marcação "Lançada no SIT".'],
     ['instituicoes', 'Instituições', 'Cadastro e documentos das instituições (cadastrar instituição nova só com acesso a todas).'],
     ['fornecedores', 'Fornecedores', 'Base de fornecedores (planilha de cadastro).']];
+  (window.MODULOS_TELA || []).forEach(m => (m.areas || []).forEach(a => AREAS_PERM.push(a)));   // áreas dos módulos
   const PERM_LEGADO = {
     PRESTACAO_CONTAS: { projetos: 'editar', pagamentos: 'editar', extratos: 'editar', sit: 'editar', instituicoes: 'editar', fornecedores: 'editar' },
     GERENTE_PROJETO: { projetos: 'editar', pagamentos: 'editar', extratos: 'editar', sit: 'ver', instituicoes: 'ver', fornecedores: 'editar' },
@@ -1539,6 +1542,7 @@
     document.body.classList.toggle('ver-pagamentos', !pode('pagamentos', 'editar'));
     document.body.classList.toggle('ver-fornecedores', !pode('fornecedores', 'editar'));
     document.body.classList.toggle('ver-fat', !pode('pagamentos', 'editar') && !pode('projetos', 'editar'));
+    (window.MODULOS_TELA || []).forEach(m => m.aplicarMenus && m.aplicarMenus());
   }
 
   document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
@@ -1617,6 +1621,8 @@
     if (rota.tipo === 'pagamentos' && pode('pagamentos')) return abrirPagamentos(rota.id, rota.aba);
     if (rota.tipo === 'sit' && pode('sit')) return abrirSit(rota.id, rota.aba);
     if (rota.tipo === 'extratos' && pode('extratos')) return abrirExtratos(rota.id);
+    const mod = (window.MODULOS_TELA || []).find(m => m.rotas.includes(rota.tipo) && m.pode());
+    if (mod) return mod.abrir(rota);
     return mostrarLista();
   }
   // ---------- abrir em nova aba (Ctrl/⌘ + clique, botão do meio do mouse ou "Abrir link em nova aba")
@@ -1630,6 +1636,8 @@
     if (id === 'navExt') return 'extratos/' + (($('extProjeto') && $('extProjeto').value) || '');
     if (id === 'navForn') return 'fornecedores';
     if (id === 'navConfig') return 'config';
+    const modNav = (window.MODULOS_TELA || []).find(m => m.navIds && m.navIds[id]);
+    if (modNav) return modNav.navIds[id];
     if (el.classList.contains('projeto') && el.dataset.id) return 'projeto/' + el.dataset.id + '/dados';
     if (el.matches('#viewDetalhe .aba[data-aba]') && atual && atual.projeto && atual.projeto.id_projeto) return 'projeto/' + atual.projeto.id_projeto + '/' + el.dataset.aba;
     return '';
@@ -1668,7 +1676,10 @@
   window.addEventListener('popstate', () => { if (usuario && sessao.get()) irParaRota(lerRota()); });
 
   const VIEWS = ['viewLista', 'viewDetalhe', 'viewInst', 'viewPag', 'viewSit', 'viewConfig', 'viewForn', 'viewExt'];
-  function mostrarView(id) { VIEWS.forEach(v => $(v).classList.toggle('oculto', v !== id)); }
+  function mostrarView(id) {
+    VIEWS.forEach(v => $(v).classList.toggle('oculto', v !== id));
+    (window.MODULOS_TELA || []).forEach(m => (m.views || []).forEach(v => { if ($(v)) $(v).classList.toggle('oculto', v !== id); }));
+  }
   function navAtivo(id, migalha) {
     seqTela++;
     document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('ativo', b.id === id));
@@ -1688,6 +1699,8 @@
       if (a === 'sit') return abrirSit('');
       if (a === 'instituicoes') return abrirInstituicoes();
       if (a === 'fornecedores') return abrirFornecedores();
+      const mod = (window.MODULOS_TELA || []).find(m => m.pode());
+      if (mod) return mod.abrir({});
       mostrarView('viewLista');
       $('listaProjetos').innerHTML = '<div class="vazio">Seu usuário ainda não tem nenhuma funcionalidade liberada. Fale com o administrador.</div>';
       return;
@@ -1770,6 +1783,7 @@
     document.querySelector('[data-aba="cotacoes"]').classList.toggle('oculto', novo);
     document.querySelector('[data-aba="execucoes"]').classList.toggle('oculto', novo);
     renderResumo(); renderFormProjeto(); renderRubricas(); renderContratacoes(); renderCotacoes();
+    (window.MODULOS_TELA || []).forEach(m => m.renderProjeto && m.renderProjeto(atual));
   }
 
   function renderResumo() {
@@ -1864,6 +1878,7 @@
     $('abaCotacoes').classList.toggle('oculto', nome !== 'cotacoes');
     $('abaExecucoes').classList.toggle('oculto', nome !== 'execucoes');
     if (nome === 'execucoes') carregarExecucoes();
+    (window.MODULOS_TELA || []).forEach(m => m.trocarAbaProjeto && m.trocarAbaProjeto(nome));   // abas de módulos (ex.: Oficinas)
     if (atual && atual.projeto && atual.projeto.id_projeto) gravarRota('projeto/' + atual.projeto.id_projeto + '/' + nome);
   }
   document.querySelectorAll('.aba').forEach(a => a.addEventListener('click', () => trocarAba(a.dataset.aba)));
```
