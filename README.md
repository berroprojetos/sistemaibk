# Sistema IBK

Sistema de gestão do IBK, feito em **Google Planilhas + Apps Script + GitHub**.
Ele é **modular**: existe um núcleo (o Gestor de Projetos, vindo da Berro) e cada módulo vendido à parte entra como arquivos a mais.

- **Planilha Google**: guarda os dados (uma planilha por cliente).
- **Apps Script**: é o "servidor" (API). Fica ligado à planilha.
- **Site** (pasta `docs/`): é a tela que as pessoas usam. Fica no GitHub Pages e conversa com o Apps Script.

## Como o repositório está organizado

| Pasta | O que tem |
|---|---|
| `apps-script/nucleo/` | Os arquivos do núcleo (projetos, instituições, pagamentos, prestação, extratos, fornecedores, usuários e permissões). Já vêm com os ganchos para módulos e com o `Modulos.gs`. |
| `apps-script/modulos/beneficiarios/` | Módulo **Beneficiários** (ficha da criança, matrícula, termos, oficinas, chamada, fotos e frequência). |
| `docs/` | O site: `index.html`, `config.js` (onde vai a URL do Apps Script) e `beneficiarios.js` (tela do módulo). |
| `modulos/beneficiarios/` | Explicação do módulo, o que mudou no núcleo e a planilha de estrutura das abas (com dados fictícios). |

Não há nenhum dado real de pessoas no repositório.

## Como colocar para funcionar

### 1. Planilha e Apps Script
1. Crie uma **planilha Google nova** e vazia (ex.: "Sistema IBK").
2. Na planilha, abra **Extensões → Apps Script**.
3. Em **Configurações do projeto** (engrenagem), marque **"Mostrar arquivo de manifesto appsscript.json no editor"**. Volte ao Editor, abra o `appsscript.json` e substitua o conteúdo pelo de `apps-script/nucleo/appsscript.json`.
4. Para **cada arquivo `.gs`** de `apps-script/nucleo/`, crie um arquivo com o mesmo nome no editor (botão **+ → Script**) e cole o conteúdo. O arquivo `Código.gs` que já vem no editor é substituído pelo daqui.
5. Se o cliente comprou o módulo Beneficiários, faça o mesmo com `apps-script/modulos/beneficiarios/Beneficiarios.gs`.
6. Clique em **Salvar**.

### 2. Montar as abas e criar o primeiro usuário
1. Volte à planilha e **recarregue a página**. Aparece o menu **Gestor**.
2. Rode **Gestor → Atualizar estrutura (setup)**. Na primeira vez o Google pede autorização: aceite. Isso cria todas as abas e a pasta no Drive.
3. Rode **Gestor → Cadastrar usuário** e crie o seu usuário com perfil **ADMIN** (deixe a instituição em branco). Anote a senha temporária que aparece.

### 3. Publicar o Apps Script
1. No Apps Script, clique em **Implantar → Nova implantação**.
2. Tipo: **App da Web**. Executar como: **Eu**. Quem pode acessar: **Qualquer pessoa**.
3. Clique em **Implantar** e **copie a URL** (termina em `/exec`).

> Sempre que mudar algum `.gs`, publique uma nova versão em **Implantar → Gerenciar implantações → editar (lápis) → Nova versão**. Assim a URL continua a mesma.

### 4. Ligar o site
1. Aqui no GitHub, abra `docs/config.js`, clique no lápis (editar) e cole a URL no lugar de `COLE_AQUI_A_URL_DO_APP_DA_WEB`. Salve (Commit changes).
2. Vá em **Settings → Pages**. Em "Branch", escolha **main** e a pasta **/docs**, e clique em **Save**.
3. Em 1 ou 2 minutos o site fica no ar em `https://berroprojetos.github.io/sistemaibk/`.
4. Entre com o e-mail e a senha temporária do passo 2.

Enquanto a URL não estiver configurada, o site mostra uma faixa vermelha avisando.

## Módulos

| Módulo | Situação |
|---|---|
| Núcleo (Gestor de Projetos) | Pronto (código da Berro) |
| Beneficiários | v0.3.1, testado em simulação, ainda não rodou no Google de verdade |
| Projetos (oficinas, planejamento pedagógico, cronograma) | A fazer |
| Prestadores de serviço (antecedentes a cada 6 meses) | A fazer |
| Relacionamento com a rede | A fazer |
| Dashboard | A fazer |

**Para um cliente que não comprou um módulo:** não copie o `.gs` do módulo e, no `docs/index.html`, apague a linha `<script src="beneficiarios.js"></script>` (ou o arquivo do módulo). O resto continua igual.

Detalhes do módulo Beneficiários: [`modulos/beneficiarios/README.md`](modulos/beneficiarios/README.md).
