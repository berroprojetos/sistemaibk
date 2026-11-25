// Configuração do site do Sistema IBK
// Cole abaixo a URL do App da Web do Apps Script
// (no Apps Script: Implantar > Gerenciar implantações > copiar a URL que termina em /exec)
window.API_URL = 'COLE_AQUI_A_URL_DO_APP_DA_WEB';

// Aviso na tela enquanto a URL não estiver configurada
if (!/^https:\/\/script\.google\.com\//.test(window.API_URL)) {
  document.addEventListener('DOMContentLoaded', function () {
    var aviso = document.createElement('div');
    aviso.textContent = 'Falta configurar: cole a URL do App da Web no arquivo docs/config.js.';
    aviso.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;' +
      'background:#b42318;color:#fff;font:600 14px/1.4 sans-serif;text-align:center';
    document.body.appendChild(aviso);
  });
}
