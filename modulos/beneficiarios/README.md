# Módulo Beneficiários · Sistema IBK (v0.3.2)

Módulo de **Beneficiários**, agora ligado ao código do Gestor da Berro. Ele usa o mesmo login, as mesmas permissões (Configurações → Usuários), a AUDITORIA, a LIXEIRA, a pasta do Drive e o visual do site.

O que tem:
- **Ficha de inscrição e matrícula** da criança ou adolescente. Por dentro da ficha ficam ocorrências, encaminhamentos, acompanhamentos, documentos e os **termos e autorizações da família**. A ficha também pode ser impressa ou salva em PDF, com os termos e a linha de assinatura do responsável.
- **Vínculo:** na aba Projetos da ficha aparecem todos os projetos da instituição com as oficinas de cada um, para inscrever a criança.
- **Chamada:** você escolhe a oficina e aparece o **calendário com todas as datas da oficina**, geradas pelos dias da semana dentro do período dela (ou da vigência do projeto). Verde é chamada feita, amarelo é pendente e cinza é futura. A professora clica na data e recebe a lista das crianças vinculadas. Também dá para lançar uma aula fora da agenda.
- **Fotos da aula (opcional):** depois de salvar a chamada, dá para anexar fotos. O site reduz a foto antes de enviar, e ela vai para a pasta do projeto no Drive (Fotos das oficinas). A chamada avisa quem não autorizou uso de imagem.
- **Frequência:** mostra o percentual de cada criança e as faltas seguidas, e gera a lista do mês para assinatura.
- **Aba "Oficinas" dentro do projeto**, ao lado de Execuções. A aba de Planejamento Pedagógico entra depois, junto com o módulo Projetos.

## Arquivos

| Onde | O que fazer |
|---|---|
| `apps-script/modulos/beneficiarios/Beneficiarios.gs` | O módulo. Copie para o projeto Apps Script. |
| `apps-script/nucleo/Modulos.gs` | Registro dos módulos (arquivo novo do núcleo). Já está na pasta do núcleo. |
| `apps-script/nucleo/` | `Api.gs`, `Código.gs`, `Admin.gs` e `Menu.gs` já vêm com os ganchos para módulos (1 a 3 linhas a mais cada). |
| `docs/beneficiarios.js` | A tela do módulo, ao lado do `index.html`. |
| `docs/index.html` | O site com os ganchos para módulos. A URL do App da Web fica em `docs/config.js`. |
| `ALTERACOES-NUCLEO.md` | Mostra exatamente o que mudou em cada arquivo do núcleo. |
| `Modulo Beneficiarios - estrutura.xlsx` | As abas e as colunas, com dados fictícios. A aba LEIA-ME é o dicionário dos campos. |

## Como instalar
1. No Apps Script, copie todos os arquivos de `apps-script/nucleo/` e o `Beneficiarios.gs` (veja o README principal).
2. Na planilha, rode **Gestor → Atualizar estrutura (setup)**. Isso cria as 11 abas e acrescenta colunas em DOCUMENTOS, listas em LISTAS e chaves em CONFIG. Nada do que já existe é apagado.
3. Publique uma **nova versão** do App da Web, em Implantar → Gerenciar implantações.
4. O site (`docs/`) já vem com o `beneficiarios.js` e o `index.html` com os ganchos.
5. Em Configurações → Usuários, dê as permissões novas para as pessoas (veja abaixo).

**Para um cliente que não comprou o módulo:** basta não incluir o `Beneficiarios.gs` nem o `beneficiarios.js`. O resto continua igual. Os próximos módulos (Projetos/Oficinas, Relacionamento…) entram do mesmo jeito.

## Permissões e perfis
O Gestor usa permissão por área (Ver ou Editar). O módulo traz três áreas novas: **Beneficiários**, **Presença** e **Atendimentos**. Os perfis que você aprovou ficam assim:

| Perfil | Beneficiários | Presença | Atendimentos |
|---|---|---|---|
| Admin | tudo | tudo | tudo |
| Equipe técnica | Editar | Editar | Editar |
| Coordenação pedagógica | Ver | Editar | — |
| Educador | — | Editar (só chamada e ocorrência) | — |
| Prefeitura (se o convênio pedir) | Ver | Ver | — |

- Os dados sensíveis (CID, renda, benefício social), os encaminhamentos, os acompanhamentos e as ocorrências marcadas como **sigilosas** só aparecem para quem tem a área **Atendimentos**. Isso vale também na ficha impressa.
- Os documentos da criança abrem pelo sistema só para quem tem acesso à ficha. Ajustei o `baixarArquivo_` do núcleo para isso. Antes, quem tinha acesso a todas as instituições conseguia abrir.
- Só o Admin exclui registros, e o que é excluído vai para a LIXEIRA. Uma criança que já tem histórico não pode ser excluída, só desligada.

## Termos e autorizações
Cada termo é respondido com Autoriza ou Não autoriza, com data e quem assinou. Ficam numa aba própria (BEN_CONSENTIMENTOS), um registro por criança e termo. Termo sem resposta vira pendência na ficha.
A lista de termos vale para todas as fichas e o Admin edita na própria ficha (Termos e autorizações → Editar termos). Ela fica guardada em `CONFIG.lista_tipo_consentimento`. ⚠ Os termos iniciais são sugestão (Uso de imagem e voz, LGPD, Passeios e atividades externas), até o IBK mandar a lista dele.

## Calendário e fotos
- As datas não ficam gravadas: são calculadas na hora a partir de "Dias da semana" (ex.: "Seg, Qua") e do início e fim da oficina. Se a oficina não tiver datas, usa a vigência do projeto. Assim, mudar o dia da oficina muda o calendário.
- **Férias e recessos** saem do calendário. Eles são cadastrados na aba Oficinas do projeto (seção "Férias e recessos"). ⚠ Isso é provisório: quando o módulo Projetos trouxer o cronograma de execução, os períodos passam a vir de lá. Se houver aula num dia de férias, ela entra como aula extra.
- As fotos ficam na aba BEN_FOTOS, ligadas à chamada, e os arquivos ficam na pasta do projeto. Abrem só pelo sistema, para quem tem acesso ao projeto. O planejamento pedagógico mensal (módulo Projetos) vai puxar as fotos do mês daqui.
- Só o Admin exclui foto. Uma chamada com fotos só pode ser excluída depois das fotos.

## Regras já confirmadas
- Os beneficiários são só crianças e adolescentes. A matrícula fica bloqueada acima de 17 anos (dá para mudar em `CONFIG.ben_idade_maxima`).
- O IBK é uma instituição só. A instituição entra sozinha na matrícula.
- A falta justificada conta como ausência no percentual. A frequência mínima (75%) pode ser ajustada em CONFIG.
- **Alerta de evasão** com 3 faltas seguidas (confirmado pela Ana). Ele aparece na Frequência e nas pendências da ficha. Só a falta sem justificativa conta para a sequência. O número fica em `CONFIG.ben_faltas_alerta`.
- A chamada vale pela data. Quem entrou depois ou saiu antes não aparece, e dá para lançar uma chamada atrasada. Salvar de novo no mesmo dia edita a chamada, sem duplicar.

## Pendente
- **Campos da ficha:** a ficha de inscrição do IBK (formulário do projeto Jiu-jitsu) foi conferida na v0.3.2. Entraram "Condições de saúde / medicação contínua / restrições físicas", "Possui diagnóstico, condição específica ou necessidade?" com a descrição, e a opção "Outra" em Sexo. As outras perguntas já existiam.
- **Termos da família:** a lista inicial é sugestão. Quando o IBK mandar os termos dele, o Admin troca pela tela (não precisa mexer no código).
- **Documentos obrigatórios** (geram aviso na ficha): ficha assinada, certidão de nascimento, documento do responsável e comprovante de residência. ⚠ Isso é uma suposição.
- **Oficinas** foram feitas junto com este módulo. Quando o módulo Projetos chegar (com Planejamento Pedagógico), elas passam para ele sem mudar a tela.

## Testado
Rodei o código completo da Berro com o módulo, usando os dados da planilha. Foram 84 verificações, e todas passaram. Elas cobrem setup, login, permissões de cada perfil, matrícula, vínculos, chamada, frequência, sigilo, documentos, desligamento, lixeira, termos, calendário da oficina, férias, alerta de evasão e fotos, e confirmam que projetos e usuários continuam funcionando. Também abri o site de verdade no navegador, ligado a esse servidor simulado. Fiz matrícula, termos, ocorrência, vínculo, chamada pelo calendário, envio de fotos, frequência e a aba Oficinas do projeto, e não apareceu nenhum erro.

**Ainda não rodou no Google de verdade.** O primeiro teste real deve ser numa cópia da planilha e numa implantação de teste.

Observação: projetos com ID que tem barra (ex.: `558/2026`) quebram o endereço da página (`#projeto/558/2026`). Isso já acontece no Gestor hoje e não foi causado pelo módulo.
