# Kira — Chat com IA

**Em produção:** https://kira-agqc.onrender.com/ (plano gratuito — a primeira requisição depois de um tempo sem uso pode demorar ~50s para "acordar" o servidor. Depois da migração desta versão, atualize as variáveis de ambiente no Render — veja "Migrando de Groq para Gemini" abaixo.)

Interface de chat com login e histórico de conversas isolado por usuário, usando o **Gemini** (Google, gratuito) como motor de IA. A Kira também é uma parceira de programação, entende imagens e áudio que você enviar, e pode gerar imagens a partir de uma descrição.

## Estrutura

```
analytics-ai-dashboard/
├── package.json           # scripts de build/start usados em produção
├── server/
│   ├── index.js           # rotas: auth, conversas, chat
│   ├── lib/
│   │   ├── auth.js        # JWT: assinatura e middleware requireAuth
│   │   ├── gemini.js      # chamadas à API do Gemini + geração de imagem (Pollinations)
│   │   ├── rateLimit.js   # limite por usuário e orçamento diário compartilhado
│   │   └── store.js       # acesso ao banco Postgres (usuários + conversas + mensagens)
│   └── .env.example
└── client/
    ├── public/                # favicons + logo.png + manifest.json/sw.js (PWA)
    └── src/
        ├── App.jsx
        ├── lib/api.js
        └── components/
            ├── LoginScreen.jsx
            ├── Sidebar.jsx
            ├── InputBar.jsx      # texto + anexar imagem + gravar áudio
            ├── MessageThread.jsx
            └── Markdown.jsx
```

## O que a Kira faz

- **Conversa geral, ideias e brainstorm** — respostas um pouco mais longas e detalhadas quando o assunto pede.
- **Parceira de programação:** escreve, revisa, depura e explica código, sempre em blocos de código formatados.
- **Entende imagens:** anexe uma foto e pergunte sobre ela.
- **Entende áudio:** grave um áudio pelo microfone e a Kira ouve e responde. Você pode reproduzir o áudio que enviou (fica disponível durante a sessão, não é salvo no banco).
- **Gera imagens** com qualidade melhor (modelo `flux` + prompt aprimorado automaticamente) via Pollinations.ai.
- **Login com e-mail:** cadastro pede e-mail, envia confirmação, e tem recuperação de senha por link — veja a seção própria abaixo.
- **Controle de dispositivos físicos (opcional):** se você configurar um Home Assistant, a Kira ganha uma ferramenta para ligar/desligar dispositivos reais. Desativado por padrão.
- **Configurações** (botão na barra lateral): tema claro/escuro, central de ajuda com perguntas frequentes, acompanhamento do seu limite de uso, e um espaço para enviar comentários/sugestões.

## Sobre o banco de dados

Usuários, conversas e mensagens ficam num **banco Postgres externo** — não em arquivos dentro do projeto. Isso significa:

- Nada de dados sensíveis fica no código ou no repositório do GitHub.
- Só quem tiver a `DATABASE_URL` (uma string de conexão secreta, guardada como variável de ambiente) consegue acessar os dados.
- Senhas nunca são guardadas em texto puro, sempre com hash (bcrypt).
- Imagens e áudios enviados **não ficam salvos no banco** — só o texto da conversa (e, quando a Kira gera uma imagem, o link dela). Isso mantém o banco leve; a consequência é que anexos de conversas antigas não reaparecem ao reabrir o histórico, só o texto.

Você pode usar qualquer Postgres, mas o guia abaixo usa o **Neon** (https://neon.tech), que tem camada gratuita sem pedir cartão.

---

## Rodando em desenvolvimento (na sua máquina)

### 1. Crie um banco Postgres gratuito

1. Acesse https://neon.tech e crie uma conta.
2. Crie um projeto novo (ele já cria um banco padrão).
3. No painel do projeto, copie a **connection string** (algo como `postgresql://usuario:senha@ep-xxxx.neon.tech/neondb?sslmode=require`).

### 2. Pegue uma chave gratuita do Gemini

1. Acesse https://aistudio.google.com/apikey, faça login com uma conta Google.
2. Clique em **Create API Key** (não pede cartão).

### 3. Configure e rode o backend

```bash
cd server
npm install
cp .env.example .env
```

Edite `server/.env` e preencha:
- `GEMINI_API_KEY` — sua chave do Gemini
- `DATABASE_URL` — a connection string do Neon que você copiou
- `JWT_SECRET` — qualquer texto longo e aleatório

```bash
npm run dev
```

Na primeira execução, o servidor cria automaticamente as tabelas necessárias no banco (`users`, `conversations`, `messages`) — não precisa rodar nenhum script de migração à parte. Sobe em `http://localhost:3001`.

### 4. Configure e rode o frontend

```bash
cd client
npm install
npm run dev
```

Abra `http://localhost:5173`.

---

## Migrando de Groq para Gemini (se você já tinha a versão anterior)

Esta versão trocou o motor de IA — algumas coisas mudam:

1. **Variáveis de ambiente:** troque `GROQ_API_KEY`, `GROQ_MODEL` e `GROQ_FALLBACK_MODEL` por `GEMINI_API_KEY` e `GEMINI_MODEL` no `.env` (local) e no painel do seu host (produção). Pegue a chave nova em https://aistudio.google.com/apikey.
2. **Banco de dados:** nenhuma ação manual necessária — o servidor adiciona sozinho as colunas novas (`image_url`, `had_attachment`) na tabela `messages` já existente, na próxima vez que ele iniciar.
3. **Busca na web:** a versão anterior usava a busca embutida dos modelos `groq/compound*`; o Gemini no plano gratuito não tem isso da mesma forma, então esse recurso foi removido por enquanto (a Kira responde com o conhecimento do modelo, sem pesquisar ao vivo). Veja a ideia "Busca na web com Gemini" na seção de ideias futuras, no fim deste README, se quiser recuperar isso.

---

## Subindo para o GitHub

O `.gitignore` já impede que `.env` (com suas chaves) e `node_modules` sejam enviados. Só o código-fonte vai para o repositório — nenhum dado de usuário.

```bash
cd analytics-ai-dashboard
git init
git add .
git commit -m "Kira: chat com IA, login e busca web"
```

Crie um repositório vazio no GitHub (pode ser **privado**, se preferir) em https://github.com/new, sem adicionar README/licença por lá (para não conflitar). Depois:

```bash
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git
git branch -M main
git push -u origin main
```

Confirme no GitHub que a pasta `server/.env` **não** aparece no repositório (ela não deve, por causa do `.gitignore`).

---

## Deploy em produção — passo a passo

A aplicação roda como **um único serviço**: em produção, o próprio backend Express serve os arquivos estáticos do frontend já compilado, então você só precisa hospedar uma coisa.

### 1. Escolha um host

Qualquer um destes funciona bem com Node.js e tem camada gratuita: **Render**, **Railway** ou **Fly.io**. O guia abaixo usa o **Render** como exemplo.

### 2. Crie o Web Service no Render

1. Acesse https://render.com, crie uma conta e conecte sua conta do GitHub.
2. Clique em **New → Web Service**.
3. Selecione o repositório.
4. Preencha:
   - **Root Directory:** deixe em branco (raiz do repositório)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** o plano gratuito serve para testar

### 3. Configure as variáveis de ambiente no Render

Na aba **Environment** do serviço, adicione:

| Variável | Valor |
|---|---|
| `GEMINI_API_KEY` | sua chave do Gemini |
| `GEMINI_MODEL` | `gemini-flash-latest` |
| `JWT_SECRET` | gere uma string nova e aleatória — **não reutilize a de desenvolvimento** |
| `DATABASE_URL` | a connection string do Neon |
| `NODE_ENV` | `production` |
| `APP_URL` | a URL pública do seu serviço (ex: `https://kira-agqc.onrender.com`) — necessária para os links de e-mail funcionarem |
| `RESEND_API_KEY` | opcional — sem ela, os links de confirmação/redefinição só aparecem nos logs do servidor em vez de serem enviados por e-mail |
| `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` | opcionais — só se for usar o controle de dispositivos físicos |

### 4. Deploy

Clique em **Create Web Service**. O Render instala as dependências, compila o frontend e inicia o servidor. Na primeira inicialização, o servidor cria/atualiza as tabelas no Postgres automaticamente.

### 5. Teste

- Acesse a URL pública, crie uma conta e converse com a Kira.
- Confira `https://sua-url.onrender.com/api/health` — deve responder `{"ok":true,"model":"gemini-flash-latest"}`.

### Atualizações futuras

Depois desse primeiro deploy, basta fazer `git push` para o `main` — o host reconstrói e publica automaticamente a cada push.

### Checklist de segurança antes de ir ao ar

- [ ] `JWT_SECRET` de produção é diferente do usado em desenvolvimento
- [ ] `GEMINI_API_KEY` e `DATABASE_URL` configuradas só como variável de ambiente do host, nunca commitadas
- [ ] O repositório do GitHub não contém nenhum arquivo `.env`
- [ ] HTTPS habilitado (Render/Railway/Fly.io já fornecem isso automaticamente)

---

## Como funciona o login

- Senhas são armazenadas com hash (bcrypt), nunca em texto puro.
- Cada conversa pertence a um `user_id` no banco — a rota `/api/conversations` só retorna as conversas de quem está autenticado no token, então um usuário nunca vê o histórico de outro.
- O token de sessão (JWT) fica salvo no `localStorage` do navegador, então o login persiste ao recarregar a página.

## E-mail: confirmação e recuperação de senha

O cadastro agora pede um e-mail, e o app envia dois tipos de link por e-mail:

- **Confirmação de cadastro:** enviado automaticamente ao criar a conta. Enquanto não confirmado, aparece um aviso discreto no topo do chat com um botão "Reenviar". A conta funciona normalmente mesmo sem confirmar — não é um bloqueio, só um lembrete.
- **Recuperação de senha:** clique em "Esqueci minha senha" na tela de login, informe o e-mail, e um link chega para escolher uma senha nova. O link expira em 1 hora.

### Configurando o envio de e-mail (Resend)

1. Crie uma conta gratuita em https://resend.com (até 3.000 e-mails/mês, sem cartão).
2. Gere uma API Key no painel.
3. No `.env`, defina `RESEND_API_KEY` e, se quiser, `EMAIL_FROM` (por padrão usa `onboarding@resend.dev`, um domínio de teste que a própria Resend disponibiliza — funciona sem precisar verificar domínio próprio, mas os e-mails podem cair em spam com mais frequência; para produção "de verdade" considere verificar seu próprio domínio no painel da Resend).
4. Defina `APP_URL` com a URL pública do app (em produção, a URL do Render; em desenvolvimento, `http://localhost:5173`) — é isso que monta os links dentro dos e-mails.

**Sem `RESEND_API_KEY` configurada**, nada quebra: o app não envia e-mail de verdade, só imprime o link no terminal do servidor (`[email] RESEND_API_KEY não configurada...`). Isso é suficiente para testar o fluxo inteiro localmente sem precisar configurar e-mail ainda — copie o link do terminal e cole no navegador.

## Controlar dispositivos físicos (Home Assistant) — opcional

Se você tiver um [Home Assistant](https://www.home-assistant.io/) rodando (ver a discussão sobre hardware — tomada inteligente, hub etc. — numa sessão anterior deste projeto), a Kira pode ganhar uma ferramenta para ligar/desligar dispositivos reais.

1. No Home Assistant, gere um **token de acesso de longa duração** (perfil do usuário → rolar até o fim → "Long-Lived Access Tokens").
2. No `.env` do servidor, defina `HOME_ASSISTANT_URL` (ex: `http://192.168.1.10:8123`, o endereço local do seu Home Assistant) e `HOME_ASSISTANT_TOKEN` com o token gerado.
3. Reinicie o servidor. A partir daí, a Kira passa a ter a ferramenta `control_device` disponível, e você pode pedir algo como "liga a tomada da máquina de lavar" — ela decide sozinha quando chamar essa ferramenta, chamando o serviço correspondente do Home Assistant (`domain`/`service`/`entity_id`, ex: `switch.turn_on` em `switch.maquina_de_lavar`).

**Sem essas duas variáveis configuradas**, essa ferramenta nem existe na lista que a Kira recebe — ela não tenta e não "acha" que consegue controlar nada, evitando respostas confusas.

⚠️ Isso expõe controle de dispositivos reais da sua casa a partir de uma IA — funciona melhor com o Home Assistant na sua rede local (não exposto direto à internet); se for expor externamente, use HTTPS e mantenha o token em segredo com o mesmo cuidado que as outras chaves deste projeto.

## Imagem, áudio e geração de imagem — como funciona

- **Enviar imagem:** clique no ícone de imagem na barra de chat, escolha um arquivo. Ele é convertido para base64 no navegador e enviado junto da pergunta; o Gemini recebe a imagem diretamente.
- **Enviar áudio:** clique no microfone para começar a gravar, clique de novo para parar. O áudio gravado (formato do navegador, geralmente `webm`) é enviado do mesmo jeito, direto pro Gemini.
- **Gerar imagem:** quando você pede algo como "gera uma imagem de...", a própria Kira decide chamar uma função interna (`generate_image`) — o backend monta uma URL na **Pollinations.ai** (serviço gratuito, sem necessidade de chave) com a descrição, e mostra a imagem resultante na conversa. A geração de imagem *nativa* do Gemini está com cota zero no plano gratuito no momento (confirmado em fóruns oficiais), por isso usamos essa alternativa.

## Trocar de modelo

Edite `GEMINI_MODEL` no `.env`:
- `gemini-flash-latest` — **padrão recomendado.** É um alias mantido pela própria Google que sempre aponta para o modelo Flash atual, evitando quebrar quando uma versão específica é aposentada.
- `gemini-flash-lite-latest` — versão mais leve/rápida do alias acima, cota diária maior, um pouco menos "esperta".
- Nomes fixos como `gemini-2.5-flash` também funcionam quando disponíveis, mas têm "data de validade" — a Google tem trocado modelos com bastante frequência em 2026, e nomes fixos já apresentaram erro 404 inesperado mesmo antes da data de descontinuação oficial (relatado por outros desenvolvedores, não é bug deste projeto). Prefira os aliases `-latest` para evitar isso.

Se `/api/health` ou o chat começarem a dar erro `model_not_found`/404 do nada, troque para `gemini-flash-latest` primeiro — resolve a maioria dos casos. Se persistir, confira os nomes disponíveis em https://aistudio.google.com.

## Painel de Configurações

Clique em "Configurações" na barra lateral. Tem quatro abas:

- **Aparência:** troca entre tema escuro (padrão) e claro. A preferência fica salva no navegador (`localStorage`) e persiste entre sessões. Tecnicamente, todas as cores do app são variáveis CSS (`--c-*`, definidas em `client/src/index.css`) que o Tailwind referencia — trocar o tema só muda essas variáveis, sem precisar duplicar componentes.
- **Central de ajuda:** perguntas frequentes sobre como usar o chat, anexar imagem/áudio, pedir imagens geradas, histórico e instalação como PWA. É conteúdo estático em `SettingsModal.jsx` — edite ali para adicionar mais perguntas.
- **Limite de uso:** mostra em tempo real quantas mensagens você já usou na janela atual (15 min) e quanto do orçamento diário do app já foi consumido, puxando da rota `GET /api/usage`.
- **Comentários:** formulário simples que salva o texto na tabela `feedback` do banco (rota `POST /api/feedback`), junto com o usuário que enviou. Não tem interface para você ler os comentários ainda — para ver o que foi enviado, consulte direto o banco (`SELECT * FROM feedback ORDER BY created_at DESC;` no painel do Neon) ou peça para eu montar uma tela de administração depois.

## Apagar histórico

- Passe o mouse sobre uma conversa na barra lateral para ver o ícone de lixeira e apagar só aquela conversa.
- O botão "Limpar histórico" no rodapé da barra lateral apaga todas as conversas do usuário logado de uma vez, com confirmação antes.
- Cada usuário só pode apagar as próprias conversas.

## Limites de uso

- **Por usuário:** até 20 mensagens a cada 15 minutos.
- **Global (todo o app):** até 220 chamadas reais à IA por dia (o Gemini Flash libera por volta de 250/dia no plano gratuito — deixamos margem de segurança). Esse contador soma todos os usuários juntos, já que todos compartilham a mesma `GEMINI_API_KEY`.

Os dois limites ficam em memória no servidor, então reiniciam se o serviço reiniciar. Para ajustar, edite `USER_MAX_REQUESTS`/`USER_WINDOW_MS` em `server/lib/rateLimit.js`, ou defina `DAILY_MAX_AI_CALLS` no `.env`.

## Instalar no celular (PWA)

- **Android (Chrome):** menu (⋮) → "Adicionar à tela inicial" ou "Instalar app".
- **iPhone (Safari, obrigatoriamente):** ícone de compartilhar (□↑) → "Adicionar à Tela de Início".

## Notas

- A chave do Gemini e a connection string do banco nunca vão para o navegador — todas as chamadas passam pelo backend.
- O chat exige login (`requireAuth` na rota `/api/chat`).
- Imagens/áudio anexados aumentam bastante o tamanho da requisição — o limite do corpo da requisição no backend foi ajustado para 20MB para acomodar isso.

---

## Ideias para evoluir o projeto

### Rápidas (poucas horas)
- **Renomear conversas**, **atalho de teclado** para nova conversa, **copiar resposta**.

### Médias (um fim de semana)
- **Respostas em streaming** (SSE), **exportar conversa** como `.md`/`.pdf`, **busca dentro do histórico**.
- **Busca na web com Gemini:** o Gemini tem uma ferramenta de "Grounding with Google Search", mas com cota própria e mais restrita no plano gratuito — dá pra adicionar como uma segunda ferramenta (parecido com `generate_image`) quando fizer sentido pra pergunta.

### Maiores (bom projeto de continuidade)
- **Métricas de uso:** painel simples (só pra você) mostrando consumo por usuário, pra acompanhar a cota gratuita antes de estourar.
- **Salvar anexos de verdade:** hoje imagens/áudios não ficam persistidos; migrar para um storage de objetos (ex: Cloudflare R2 ou Supabase Storage) permitiria reabrir uma conversa antiga e ver a imagem/áudio original.
- **Tela de administração para os comentários:** hoje só dá pra ler direto no banco (`SELECT * FROM feedback`) — uma tela simples reservada para você ver e responder seria um bom próximo passo.
