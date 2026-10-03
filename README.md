# Kira --- Chat, Projetos e IA Multimodal

**Em produção:** https://kira-agqc.onrender.com/

Kira é uma aplicação de IA com chat autenticado, histórico de conversas,
recuperação de senha, entrada multimodal, geração de imagens e um
workspace de desenvolvimento capaz de criar, editar, versionar,
visualizar e exportar projetos. O Gemini continua como motor principal
para tarefas de maior qualidade, enquanto Groq e provedores adicionais
podem ampliar a disponibilidade e reduzir a dependência de um único
serviço.

A evolução atual da Kira inclui **Artifacts multi-arquivo**, **projetos
persistentes**, **edição incremental**, **versionamento**, **Monaco
Editor**, **Preview isolado**, **roteamento entre provedores**,
**quality gate para projetos web**, **múltiplas chaves Groq/Gemini**,
layout responsivo e a nova identidade visual da Kira.

## Estado atual

A versão atual corresponde à base **Kira v5.1 --- Quality + Preview**,
construída sobre as evoluções v2, v3 e v4.

Principais capacidades atuais:

-   chat com IA e autenticação por usuário;
-   recuperação de senha por e-mail;
-   histórico persistente de conversas;
-   análise de imagens e áudio enviados pelo usuário;
-   geração de imagens;
-   criação de projetos com múltiplos arquivos;
-   edição incremental sem regenerar arquivos intactos;
-   histórico e restauração de versões;
-   projeto ativo persistente por conversa;
-   Monaco Editor com syntax highlighting;
-   Preview de HTML/CSS/JavaScript;
-   download de arquivos, projeto completo e ZIP;
-   importação de ZIP e recursos de integração/exportação para GitHub;
-   geração de README e metadados de projeto;
-   Gemini, Groq, Cloudflare Workers AI, Mistral, OpenRouter e OpenAI
    opcional;
-   deduplicação de chamadas e circuit breaker nos provedores
    adicionais;
-   quality gate para evitar projetos web vazios, desconectados ou
    excessivamente simples;
-   suporte a múltiplas chaves Gemini e Groq;
-   interface Midnight responsiva para desktop e celular;
-   PWA e novo conjunto de ícones/favicons da Kira;
-   integração opcional com Home Assistant.

## Estrutura principal

``` text
analytics-ai-dashboard/
├── package.json
├── server/
│   ├── index.js
│   ├── lib/
│   │   ├── auth.js
│   │   ├── gemini.js
│   │   ├── groq.js
│   │   ├── openai.js
│   │   ├── extraProviders.js
│   │   ├── modelRouter.js
│   │   ├── projectUtils.js
│   │   ├── artifactQuality.js
│   │   ├── email.js
│   │   ├── rateLimit.js
│   │   └── store.js
│   └── .env.example / .env.v3.example
└── client/
    ├── public/
    │   ├── apple-touch-icon.png
    │   ├── favicon-16.png
    │   ├── favicon-32.png
    │   ├── favicon-192.png
    │   ├── favicon-512.png
    │   ├── favicon.png
    │   ├── favicon.ico
    │   ├── logo.png
    │   └── manifest.json
    └── src/
        ├── App.jsx
        ├── lib/
        │   ├── api.js
        │   └── useTheme.js
        └── components/
            ├── LoginScreen.jsx
            ├── Sidebar.jsx
            ├── SettingsModal.jsx
            ├── InputBar.jsx
            ├── MessageThread.jsx
            ├── ArtifactWorkspace.jsx
            └── Markdown.jsx
```

## Rodando em desenvolvimento

### Backend

``` bash
cd server
npm install
cp .env.example .env
npm run dev
```

O backend normalmente roda em:

``` text
http://localhost:3001
```

As tabelas e migrações necessárias são inicializadas pelo backend
conforme a implementação de `store.js`.

### Frontend

``` bash
cd client
npm install
npm run dev
```

O frontend Vite normalmente fica disponível em:

``` text
http://localhost:5173
```

## Banco de dados e autenticação

A Kira usa PostgreSQL para usuários, conversas, mensagens, Artifacts,
versões, projetos e demais dados persistentes.

A autenticação utiliza JWT e as senhas são armazenadas com hash.

Uma conversa pertence obrigatoriamente a um usuário existente. Se um JWT
antigo apontar para um usuário que já não existe na tabela `users`, o
PostgreSQL rejeitará a criação da conversa pela foreign key. Nessa
situação, a sessão deve ser renovada com logout/login ou novo cadastro.

O frontend utiliza atualmente as chaves locais:

``` text
kira_token
kira_user
```

Não remova as foreign keys para contornar erros de sessão: elas protegem
a integridade dos dados.

## Recuperação de senha

O fluxo utiliza token temporário e envio de e-mail pelo Resend:

``` text
Esqueci minha senha
       ↓
usuário informa o e-mail
       ↓
token temporário
       ↓
Resend envia o link
       ↓
usuário define nova senha
```

Variáveis:

``` env
RESEND_API_KEY=
EMAIL_FROM=Kira <seu-email@seu-dominio.com>
APP_URL=
```

O endpoint deve responder genericamente mesmo quando o e-mail não
existe.

## Gemini

Gemini é o provedor principal para tarefas que exigem melhor
compreensão, multimodalidade e geração estruturada de Artifacts.

Uma chave:

``` env
GEMINI_API_KEY=
GEMINI_MODEL=
```

Múltiplas chaves:

``` env
GEMINI_API_KEYS=chave1,chave2,chave3
```

A aplicação pode alternar entre chaves quando uma tentativa falha por
condições recuperáveis. O uso de várias chaves deve respeitar os limites
e termos do provedor.

Na geração estruturada de projetos, a configuração foi ajustada para
reduzir aleatoriedade e permitir respostas maiores. O objetivo é
diminuir casos em que um pedido completo vira apenas um HTML mínimo.

## Groq e múltiplas chaves

Groq funciona como fallback para texto e para geração/atualização de
Artifacts.

Uma chave continua compatível:

``` env
GROQ_API_KEY=
```

A versão atual também aceita:

``` env
GROQ_API_KEYS=chave1,chave2,chave3,chave4
```

As chaves são rotacionadas para redundância e disponibilidade. Cada
chamada continua sujeita às cotas e termos do Groq; múltiplas chaves não
tornam o consumo ilimitado.

Também é possível configurar:

``` env
GROQ_MODEL=
```

O fallback de Artifact exige uma resposta estruturada e não deve
confirmar que um projeto foi criado se nenhum arquivo válido tiver sido
recebido.

## Provedores adicionais

A arquitetura v4 adicionou um pool opcional de provedores para reduzir a
dependência de Gemini/Groq em conversas simples.

### Cloudflare Workers AI

``` env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct
```

### Mistral

``` env
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest
```

### OpenRouter

``` env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
```

### OpenAI opcional

A estrutura também possui suporte opcional ao provedor OpenAI quando
configurado.

### Ordem e circuit breaker

``` env
EXTRA_PROVIDER_ORDER=cloudflare,mistral,openrouter
AI_PROVIDER_COOLDOWN_MS=600000
```

`extraProviders.js` implementa pool de provedores, deduplicação de
chamadas em andamento e cooldown/circuit breaker para erros como `429` e
falhas temporárias do servidor.

A estratégia recomendada é reservar modelos mais capazes para criação e
alteração de projetos e usar modelos econômicos para conversas simples.

## Roteamento de modelos

`modelRouter.js` classifica a solicitação para evitar usar o mesmo
modelo em todas as tarefas.

Conceitualmente:

``` text
conversa simples   → provedor rápido/econômico
tarefa complexa    → modelo mais capaz
novo Artifact      → geração estruturada de projeto
edição de projeto  → atualização incremental
imagem/áudio       → fluxo multimodal
```

O roteamento deve priorizar qualidade em geração de código. Economizar
uma chamada não é vantajoso quando o resultado precisa ser regenerado
várias vezes.

## Artifacts multi-arquivo

Um pedido como:

> Crie uma landing page com HTML, CSS e JavaScript separados.

pode produzir:

``` text
landing-page/
├── index.html
├── style.css
└── script.js
```

Cada arquivo possui caminho, conteúdo e linguagem. O projeto completo é
persistido como Artifact e pode ser reaberto posteriormente.

## Kira v2 --- versionamento incremental

A v2 introduziu versionamento real de Artifacts.

Em vez de substituir silenciosamente o projeto inteiro, cada alteração
cria uma nova versão:

``` text
projeto
├── v1 — criação inicial
├── v2 — alteração do hero
└── v3 — nova funcionalidade
```

Quando apenas um arquivo é alterado, a atualização pode registrar
somente esse arquivo modificado enquanto o snapshot reconstruído
continua representando o projeto completo.

O workspace permite selecionar versões anteriores e restaurar uma
versão.

## Kira v3 --- projetos persistentes

A v3 transformou Artifacts em projetos mais persistentes.

Foram adicionados conceitos como:

-   projeto ativo;
-   metadados;
-   reconstrução do estado completo;
-   operações `create`, `update` e `delete`;
-   manifest de alterações;
-   README gerado;
-   ZIP completo e ZIP de alterações;
-   importação de ZIP;
-   endpoints/estrutura para integração com GitHub;
-   roteamento de modelos;
-   cache baseado em normalização/fingerprint e similaridade.

A atualização de um projeto existente deve preservar a stack e modificar
apenas o necessário.

## Kira v4 --- workspace moderno

A v4 adicionou uma experiência mais próxima de um ambiente de
desenvolvimento.

### Monaco Editor

O workspace utiliza Monaco para oferecer:

-   syntax highlighting;
-   numeração de linhas;
-   busca;
-   navegação mais confortável pelo código;
-   edição manual;
-   salvamento como nova versão.

### Preview

Projetos HTML/CSS/JavaScript podem ser visualizados antes de serem
abertos em ferramentas externas.

O Preview roda em iframe com sandbox e não deve executar o projeto
gerado diretamente no contexto principal da aplicação.

### Layout Midnight

A interface foi atualizada para um visual azul-marinho escuro, moderno e
consistente com a identidade da Kira.

No desktop, o workspace possui largura controlada para não dominar o
chat.

No mobile, o workspace assume uma visualização praticamente full-screen,
evitando que editor, arquivos e Preview fiquem comprimidos.

## Kira v5 --- Quality Gate

A v5 foi criada para atacar um problema importante: o modelo às vezes
criava os arquivos corretos em quantidade, mas entregava código mínimo,
desconectado ou sem qualidade suficiente.

O módulo:

``` text
server/lib/artifactQuality.js
```

adiciona validação específica para projetos web.

Para um projeto HTML/CSS/JS simples, o quality gate verifica elementos
como:

-   existência de `index.html`;
-   existência de `style.css`;
-   existência de `script.js`;
-   HTML com estrutura mínima útil;
-   CSS com conteúdo suficiente;
-   JavaScript com comportamento utilizável;
-   ligação entre HTML, CSS e JavaScript;
-   coerência estrutural;
-   quantidades explícitas solicitadas pelo usuário quando detectáveis.

Quando necessário, conexões básicas entre os arquivos podem ser
reparadas deterministicamente.

Se a primeira geração estrutural falhar na validação, o backend pode
realizar uma tentativa de correção com os problemas encontrados antes de
recorrer ao fallback.

## Kira v5.1 --- Quality + Preview

A v5.1 corrigiu o caso em que `style.css` existia, mas o Preview ainda
aparecia como HTML sem formatação.

O Preview agora coleta os arquivos CSS e JavaScript do próprio Artifact
e os injeta no documento renderizado. Isso reduz a dependência de
caminhos imperfeitos gerados pelo modelo.

O quality gate também foi reforçado para rejeitar:

-   CSS quase vazio;
-   CSS sem quantidade mínima de regras/declarations úteis;
-   JavaScript excessivamente curto;
-   JavaScript sem comportamento reconhecível;
-   páginas que ignoram requisitos quantitativos explícitos;
-   projetos visualmente mínimos quando o pedido exige uma interface
    completa.

O prompt de geração passou a enfatizar:

-   layout responsivo;
-   tipografia;
-   espaçamento;
-   cores;
-   cards;
-   botões;
-   estados visuais;
-   interações reais;
-   coerência entre seletores, IDs e arquivos;
-   cumprimento literal de quantidades solicitadas.

## Resposta após criação de projeto

Depois de criar um projeto, a Kira evita uma descrição genérica e
informa os arquivos efetivamente produzidos.

Exemplo:

> Criei os arquivos `index.html`, `style.css`, `script.js` conforme
> solicitado por você. Dá uma olhadinha e me fale se precisa arrumar
> alguma coisa.

A confirmação só deve acontecer depois que os arquivos forem recebidos e
validados.

## Edição incremental

Para projetos existentes, a Kira utiliza operações equivalentes a:

``` text
create
update
delete
```

Arquivos que não precisam mudar não devem ser regenerados.

Isso reduz:

-   tokens;
-   tamanho da resposta;
-   risco de quebrar partes já corretas;
-   consumo desnecessário de APIs.

## Workspace e exportação

O workspace permite:

-   navegar pelos arquivos;
-   abrir arquivos no Monaco;
-   editar código;
-   visualizar Preview;
-   selecionar versões;
-   restaurar versões;
-   baixar um arquivo;
-   baixar o projeto em ZIP;
-   trabalhar com ZIP de alterações;
-   visualizar README/metadados quando disponíveis.

A arquitetura v3/v4 também preparou operações de importação/exportação e
integração com GitHub.

## Imagem e áudio

Atualmente:

-   imagens podem ser anexadas à conversa;
-   áudio pode ser enviado para interpretação;
-   a Kira pode gerar imagens usando sua integração configurada;
-   anexos são enviados ao backend em base64.

A criação musical e remasterização de faixas **ainda não fazem parte da
versão atual**. Está planejado um futuro **Kira Audio Studio**, separado
do fluxo de chat, para geração musical e processamento/masterização de
áudio.

## Nova identidade visual

A identidade da Kira foi atualizada para um estilo mais tecnológico e
cinematográfico.

O ícone atual utiliza:

-   robô humanoide sem rosto visível;
-   visor/máscara escura;
-   acabamento metálico;
-   iluminação azul;
-   letra `K` integrada;
-   estética premium de hardware futurista.

Arquivos atuais em `client/public`:

``` text
apple-touch-icon.png
favicon-16.png
favicon-32.png
favicon-192.png
favicon-512.png
favicon.png
favicon.ico
logo.png
```

Os tamanhos menores recebem redimensionamento apropriado para manter
legibilidade como favicon.

## PWA

A Kira continua preparada para instalação como PWA.

**Android/Chrome:** menu → Adicionar à tela inicial.

**iPhone/Safari:** compartilhar → Adicionar à Tela de Início.

O `manifest.json`, service worker e ícones devem permanecer
sincronizados com os arquivos de `public`.

## Home Assistant

A integração continua opcional.

``` env
HOME_ASSISTANT_URL=
HOME_ASSISTANT_TOKEN=
```

Quando configurada, a ferramenta de controle pode ser disponibilizada à
Kira. Sem essas variáveis, a integração permanece desativada.

## Limites e eficiência de APIs

A Kira possui limites internos e deve também respeitar as cotas de cada
provedor.

``` env
DAILY_MAX_AI_CALLS=
```

A estratégia atual combina:

-   roteamento local;
-   cache;
-   deduplicação;
-   edição incremental;
-   múltiplos provedores;
-   fallback limitado;
-   circuit breaker;
-   uso de modelos econômicos para tarefas simples;
-   modelos melhores para geração de projetos.

Erros `429`, `503` e indisponibilidades temporárias devem ser tratados
como situações recuperáveis.

## Variáveis de ambiente principais

Exemplo consolidado:

``` env
DATABASE_URL=
JWT_SECRET=
APP_URL=
NODE_ENV=production

GEMINI_API_KEY=
# ou:
GEMINI_API_KEYS=
GEMINI_MODEL=

GROQ_API_KEY=
# ou:
GROQ_API_KEYS=
GROQ_MODEL=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct

MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-small-latest

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

EXTRA_PROVIDER_ORDER=cloudflare,mistral,openrouter
AI_PROVIDER_COOLDOWN_MS=600000

RESEND_API_KEY=
EMAIL_FROM=

HOME_ASSISTANT_URL=
HOME_ASSISTANT_TOKEN=

DAILY_MAX_AI_CALLS=
```

Não publique `.env`, tokens, senhas ou connection strings no
repositório.

## Deploy no Render

Fluxo geral:

1.  envie o projeto para um repositório sem `.env` e sem `node_modules`;
2.  conecte o repositório ao Render;
3.  configure build/start conforme o `package.json`;
4.  adicione as variáveis de ambiente;
5.  confirme a conexão com PostgreSQL;
6.  teste login, chat, Artifact e Preview após o deploy.

### Aviso de SSL do PostgreSQL

Versões recentes de `pg`/`pg-connection-string` podem mostrar um aviso
sobre mudanças futuras na interpretação de `sslmode=require`.

Esse warning não significa necessariamente que a conexão falhou. Para
preservar o comportamento de verificação mais forte, a connection string
pode ser configurada explicitamente conforme a política SSL do provedor
do banco.

## Segurança

Princípios atuais:

-   secrets permanecem no backend;
-   senhas usam hash;
-   JWT protege rotas privadas;
-   conversas e projetos são isolados por usuário;
-   foreign keys preservam integridade;
-   recuperação de senha não revela se uma conta existe;
-   Preview utiliza isolamento;
-   caminhos de arquivos devem impedir traversal como `../`;
-   o backend deve validar respostas dos modelos antes de
    persistir/confirmar ações;
-   código produzido por IA deve ser tratado como conteúdo não
    confiável.

## Testes realizados nas evoluções recentes

Durante os hotfixes recentes foram executados testes locais de sintaxe e
verificações específicas.

Entre os comportamentos já validados:

-   Artifact v1 com múltiplos arquivos;
-   alteração incremental gerando v2;
-   reconstrução do snapshot completo;
-   seletor de versões;
-   layout desktop do workspace;
-   layout mobile full-screen;
-   quality gate básico;
-   reparo automático de ligação HTML/CSS/JS;
-   Preview com injeção direta de CSS/JS;
-   sintaxe dos módulos alterados e instaladores.

Chamadas reais a provedores que exigem credenciais não podem ser
consideradas testadas apenas por testes locais. O funcionamento final
também depende das chaves, modelos, cotas e disponibilidade externa.

## Pontos ainda importantes para evoluir

### Detecção de intenção de edição

Um projeto ativo não deve fazer qualquer mensagem comum ser interpretada
automaticamente como pedido de edição. A intenção deve ser detectada
explicitamente antes de chamar `update_artifact`.

### Quality gate por stack

A validação atual é especialmente voltada a projetos HTML/CSS/JavaScript
simples. Ela deve evoluir para reconhecer stacks diferentes.

Exemplo:

``` text
HTML/CSS/JS → index.html + CSS + JS
React/Vite  → package.json + src/main.jsx + src/App.jsx + estilos
Node        → package.json + arquivos de servidor
```

Não se deve exigir `style.css` e `script.js` de toda aplicação web
independentemente da tecnologia.

### Validação cruzada mais profunda

Evoluções desejáveis:

-   verificar seletores/IDs usados entre HTML, CSS e JS;
-   confirmar que arquivos locais referenciados existem;
-   detectar imports quebrados;
-   detectar assets inexistentes;
-   smoke test do Preview;
-   identificar conteúdo truncado.

### Observabilidade

Adicionar painel administrativo para acompanhar:

-   provedor utilizado;
-   modelo utilizado;
-   chamadas por provedor;
-   `429`/`503`;
-   fallback;
-   taxa de sucesso de Artifacts;
-   tentativas de reparo;
-   consumo aproximado por tarefa.

### Concorrência e transações

Operações de versão/projeto devem continuar evoluindo para evitar
conflitos quando duas alterações são realizadas simultaneamente.

### Diff visual

Adicionar comparação entre versões e arquivos modificados tornará o
versionamento mais fácil de entender.

## Próximo módulo planejado --- Kira Audio Studio

Ainda não implementado.

A proposta é criar uma área própria para:

``` text
KIRA AUDIO STUDIO
├── Gerar música por gênero/mood/BPM
├── Gerar faixa instrumental
├── Upload de WAV/MP3
├── Remasterização
├── Preview antes/depois
├── Waveform
├── Histórico de versões
└── Exportação WAV / MP3
```

A geração musical deve usar provedores de áudio dedicados, sem consumir
desnecessariamente as cotas dos modelos de chat.

A masterização pode combinar IA com processamento determinístico, por
exemplo normalização, EQ, compressão, limiter e exportação.

Esse módulo deve ser implementado somente depois de estabilizar
completamente o fluxo atual de projetos.

## Princípios para próximas evoluções

1.  **Não afirmar que uma ação foi concluída antes de validar o
    resultado.**
2.  **Preservar a stack de projetos existentes, salvo quando o usuário
    pedir uma migração.**
3.  **Modificar somente os arquivos necessários em projetos
    existentes.**
4.  **Tratar indisponibilidade de APIs como parte normal do sistema.**
5.  **Priorizar qualidade de geração antes de simplesmente reduzir o
    número de chamadas.**
6.  **Usar modelos mais baratos para tarefas simples e modelos mais
    capazes para projetos complexos.**
7.  **Manter secrets exclusivamente no backend.**
8.  **Tratar código gerado como conteúdo não confiável.**
9.  **Validar a saída antes de persistir ou confirmar Artifacts.**
10. **Manter desktop, mobile e PWA como experiências de primeira
    classe.**

------------------------------------------------------------------------

## Linha de evolução

``` text
Base inicial
   ↓
Artifacts multi-arquivo
   ↓
v2 — versionamento incremental
   ↓
v3 — projetos persistentes / operações / ZIP / GitHub
   ↓
v3 hotfix — correção wantsArtifact + workspace desktop
   ↓
v3 mobile hotfix — workspace responsivo
   ↓
v4 — Monaco + Preview + Midnight UI + novos provedores
   ↓
v5 — Quality Gate + múltiplas chaves Groq
   ↓
v5.1 — Quality reforçado + correção do Preview CSS/JS
   ↓
Nova identidade visual / favicons
   ↓
Próximo: Kira Audio Studio
```
