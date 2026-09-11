# Kira — Chat com IA

**Em produção:** https://kira-agqc.onrender.com/

Interface de chat com login (e-mail + recuperação de senha), histórico de conversas isolado por usuário, usando o **Gemini** (Google, gratuito, com suporte a múltiplas chaves em rotação) como motor de IA. A Kira é parceira de programação, entende imagens e áudio, gera imagens, e pode controlar dispositivos físicos via Home Assistant (opcional).

## Estrutura

```
analytics-ai-dashboard/
├── package.json           # scripts de build/start usados em produção
├── server/
│   ├── index.js           # rotas: auth, conversas, chat, uso, comentários
│   ├── lib/
│   │   ├── auth.js        # JWT
│   │   ├── gemini.js      # Gemini (com rotação de chaves) + Pollinations + Home Assistant
│   │   ├── email.js       # envio de e-mail (Resend)
│   │   ├── rateLimit.js   # limite por usuário e orçamento diário compartilhado
│   │   └── store.js       # Postgres: usuários, conversas, mensagens, comentários
│   └── .env.example
└── client/
    ├── public/             # favicons, logo.png, manifest.json/sw.js (PWA)
    └── src/
        ├── App.jsx
        ├── lib/ (api.js, useTheme.js)
        └── components/
            ├── LoginScreen.jsx    # login/cadastro/esqueci senha/redefinir
            ├── Sidebar.jsx
            ├── SettingsModal.jsx  # tema, ajuda, uso, comentários
            ├── InputBar.jsx       # texto + imagem + áudio
            ├── MessageThread.jsx
            └── Markdown.jsx
```

## Rodando em desenvolvimento

1. **Banco:** crie um projeto gratuito em https://neon.tech, copie a connection string.
2. **Gemini:** gere uma chave em https://aistudio.google.com/apikey.
3. **Backend:**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # preencha GEMINI_API_KEY, DATABASE_URL, JWT_SECRET no .env
   npm run dev
   ```
   As tabelas do banco são criadas/migradas automaticamente na primeira execução.
4. **Frontend:**
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Abra `http://localhost:5173`.

## Múltiplas chaves do Gemini (rotação automática)

Se uma chave sozinha estiver batendo no limite gratuito, configure várias no `.env`:

```
GEMINI_API_KEYS=chave_um,chave_dois,chave_tres
```

O app tenta a próxima chave automaticamente sempre que uma bate em erro de cota (429) ou autenticação — só mostra "limite atingido" pro usuário quando **todas** as chaves configuradas falharem na mesma tentativa. Quando as chaves estão saudáveis, ele também faz round-robin entre elas (alterna a cada chamada), espalhando o uso em vez de sempre bater na primeira.

Cada chave do Gemini vem de uma conta Google diferente e tem sua própria cota gratuita — múltiplas contas multiplicam o total disponível para o app.

## E-mail: confirmação e recuperação de senha

- **Confirmação de cadastro:** enviada ao criar a conta; aviso com botão "Reenviar" enquanto não confirmado (não bloqueia o uso).
- **Recuperação de senha:** "Esqueci minha senha" na tela de login → e-mail com link, válido por 1 hora.

Configure em `RESEND_API_KEY` (grátis, https://resend.com, até 3.000 e-mails/mês) e `EMAIL_FROM`.

⚠️ **Importante:** o remetente de teste padrão (`onboarding@resend.dev`) só consegue enviar e-mail para o dono da própria conta Resend — não funciona para outros usuários reais. Para produção de verdade, verifique um domínio próprio no painel da Resend (Domains → Add Domain) e use um endereço desse domínio em `EMAIL_FROM`.

Sem `RESEND_API_KEY` configurada, nada quebra — os links aparecem no terminal do servidor em vez de serem enviados, suficiente para testar localmente.

## Controlar dispositivos físicos (Home Assistant) — opcional

1. Gere um token de longa duração no Home Assistant (perfil → Long-Lived Access Tokens).
2. Configure `HOME_ASSISTANT_URL` e `HOME_ASSISTANT_TOKEN` no `.env`.
3. A Kira ganha a ferramenta `control_device` automaticamente — peça algo como "liga a tomada da máquina de lavar".

Sem essas variáveis, a ferramenta nem existe pra Kira — ela não tenta nem "acha" que consegue controlar nada.

## Imagem, áudio e geração de imagem

- **Enviar imagem/áudio:** ícones na barra de chat; convertidos para base64 no navegador e enviados direto pro Gemini.
- **Gerar imagem:** a Kira decide sozinha quando chamar `generate_image`; a imagem é gerada pela **Pollinations.ai** (gratuita, sem chave, modelo `flux` + `enhance=true` para melhor qualidade) — a geração nativa do Gemini está com cota zero no plano gratuito no momento.
- Áudio enviado pode ser reproduzido de volta (player na própria mensagem); nada disso fica salvo no banco, só durante a sessão.

## Painel de Configurações

Botão na barra lateral: **Aparência** (tema claro/escuro, via variáveis CSS), **Central de ajuda** (FAQ), **Limite de uso** (barras de progresso em tempo real via `/api/usage`), **Comentários** (salvos na tabela `feedback`, consulte com `SELECT * FROM feedback ORDER BY created_at DESC;`).

## Limites de uso

- **Por usuário:** 20 mensagens / 15 min.
- **Global:** ~220 chamadas de IA/dia (ajustável via `DAILY_MAX_AI_CALLS`), compartilhado entre todos os usuários — soma as tentativas em todas as chaves configuradas.

## Deploy em produção (Render)

1. Suba o projeto para o GitHub (`.gitignore` já impede `.env`/`node_modules`).
2. Render → New → Web Service → conecte o repositório.
3. Build Command: `npm run build` — Start Command: `npm start`.
4. Variáveis de ambiente: `GEMINI_API_KEY` (ou `GEMINI_API_KEYS`), `GEMINI_MODEL`, `JWT_SECRET` (novo, não reuse o local), `DATABASE_URL`, `APP_URL` (a URL pública do serviço), `NODE_ENV=production`, e opcionalmente `RESEND_API_KEY`/`EMAIL_FROM`/`HOME_ASSISTANT_URL`/`HOME_ASSISTANT_TOKEN`.
5. Deploy — as tabelas/colunas do banco são criadas/migradas sozinhas na primeira inicialização.

## Instalar no celular (PWA)

Android (Chrome): menu → "Adicionar à tela inicial". iPhone (Safari, obrigatório): compartilhar → "Adicionar à Tela de Início".

## Notas de segurança

- Chaves de API e connection string nunca vão para o navegador — tudo passa pelo backend.
- Senhas com hash (bcrypt); tokens de verificação/redefinição são aleatórios (32 bytes) e expiram.
- `/api/auth/forgot-password` sempre responde sucesso, exista ou não a conta, para não revelar quais e-mails têm cadastro.
