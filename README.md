# Kira — Chat com IA

**Em produção:** https://kira-agqc.onrender.com/

Kira é uma interface de chat com IA com autenticação por usuário, recuperação de senha por e-mail, histórico de conversas e suporte a tarefas multimodais e de programação. O **Gemini** é o motor principal, com suporte a múltiplas chaves em rotação, e o **Groq** funciona como fallback quando o Gemini está temporariamente indisponível. A Kira também entende imagens e áudio, gera imagens, cria **Artifacts com um ou vários arquivos**, e pode controlar dispositivos físicos via Home Assistant (opcional).

## Estrutura

```text
analytics-ai-dashboard/
├── package.json           # scripts de build/start usados em produção
├── server/
│   ├── index.js           # auth, conversas, chat, artifacts, uso e comentários
│   ├── lib/
│   │   ├── auth.js        # JWT
│   │   ├── gemini.js      # Gemini + ferramentas + rotação de chaves
│   │   ├── groq.js        # fallback de IA para texto e artifacts
│   │   ├── email.js       # envio de e-mail (Resend)
│   │   ├── rateLimit.js   # limite por usuário e orçamento diário compartilhado
│   │   └── store.js       # Postgres: usuários, conversas, mensagens e artifacts
│   └── .env.example
└── client/
    ├── public/             # favicons, logo.png, manifest.json/sw.js (PWA)
    └── src/
        ├── App.jsx         # estado principal + chat/workspace de artifacts
        ├── lib/ (api.js, useTheme.js)
        └── components/
            ├── LoginScreen.jsx      # login/cadastro/esqueci senha/redefinir
            ├── Sidebar.jsx
            ├── SettingsModal.jsx    # tema, ajuda, uso, comentários
            ├── InputBar.jsx         # texto + imagem + áudio
            ├── MessageThread.jsx
            ├── ArtifactWorkspace.jsx # visualização/download de projetos e arquivos
            └── Markdown.jsx
```

## Rodando em desenvolvimento

1. **Banco:** crie um projeto gratuito no Neon e copie a connection string.
2. **Gemini:** gere uma chave no Google AI Studio.
3. **Groq (recomendado):** gere uma chave para habilitar o fallback quando o Gemini estiver indisponível.
4. **Backend:**

   ```bash
   cd server
   npm install
   cp .env.example .env
   # preencha GEMINI_API_KEY, DATABASE_URL e JWT_SECRET
   # GROQ_API_KEY e RESEND_API_KEY são opcionais, mas recomendados
   npm run dev
   ```

   As tabelas/colunas do banco são criadas ou migradas automaticamente na inicialização.

5. **Frontend:**

   ```bash
   cd client
   npm install
   npm run dev
   ```

   Abra `http://localhost:5173`.

## Gemini: múltiplas chaves e rotação automática

Se uma chave estiver atingindo o limite gratuito, é possível configurar várias:

```env
GEMINI_API_KEYS=chave_um,chave_dois,chave_tres
```

A Kira faz rotação entre as chaves configuradas e tenta outra chave quando uma chamada falha por cota/autenticação ou indisponibilidade recuperável. Isso reduz a dependência de uma única chave e melhora a disponibilidade do chat.

Também é possível manter apenas:

```env
GEMINI_API_KEY=sua_chave
```

O modelo pode ser configurado por `GEMINI_MODEL`.

> Observação: várias chaves ajudam com cotas e disponibilidade, mas não eliminam indisponibilidades temporárias do próprio modelo, como respostas `503 UNAVAILABLE` em momentos de alta demanda.

## Fallback com Groq

Quando todas as tentativas do Gemini falham, a Kira pode recorrer ao Groq em vez de encerrar imediatamente a solicitação.

Configure:

```env
GROQ_API_KEY=sua_chave
```

O fallback suporta dois cenários:

- **Chat normal:** retorna uma resposta textual.
- **Artifacts:** solicita uma resposta estruturada com `projectName` e `files[]`, permitindo que um projeto continue sendo criado mesmo quando o Gemini estiver indisponível.

A configuração atual prioriza modelos GPT-OSS compatíveis com a conta/chave configurada. Se `GROQ_MODEL` estiver definido no `.env`, ele pode ser usado como preferência antes das alternativas configuradas no código.

A Kira só confirma que um Artifact foi criado depois de receber e validar arquivos. Se Gemini e Groq falharem, deve retornar uma mensagem de indisponibilidade em vez de afirmar que arquivos inexistentes foram gerados.

## Artifacts e projetos multi-arquivo

A Kira agora possui um fluxo específico para criação de código, documentos e pequenos projetos.

Quando o usuário pede, por exemplo:

> Crie uma landing page com `index.html`, `style.css` e `script.js` separados.

A ferramenta de Artifact pode devolver:

```text
landing-page/
├── index.html
├── style.css
└── script.js
```

Em vez de condensar tudo em um único HTML, o backend trabalha com uma estrutura semelhante a:

```json
{
  "projectName": "landing-page",
  "files": [
    { "path": "index.html", "content": "...", "language": "html" },
    { "path": "style.css", "content": "...", "language": "css" },
    { "path": "script.js", "content": "...", "language": "javascript" }
  ]
}
```

### Workspace de Artifact

Quando um Artifact é criado, a interface pode trabalhar em modo dividido:

```text
┌──────────────────────┬──────────────────────────┐
│                      │ Projeto                  │
│       Chat           │ ├── index.html           │
│                      │ ├── style.css            │
│                      │ └── script.js            │
│                      │                          │
│                      │ Código do arquivo ativo  │
└──────────────────────┴──────────────────────────┘
```

O chat permanece à esquerda e o Artifact à direita. O usuário pode navegar pelos arquivos, visualizar o conteúdo e fazer download dos arquivos/projeto. Em telas menores, o layout se adapta para evitar comprimir excessivamente o conteúdo.

Artifacts antigos de arquivo único continuam sendo tratados como fallback para manter compatibilidade com conversas anteriores.

## Escolha de tecnologias em projetos

Ao criar um projeto novo, a Kira pode sugerir ou escolher uma tecnologia adequada quando o usuário não especificar uma stack.

Exemplo:

> Crie um pequeno dashboard para acompanhar tarefas.

A Kira pode propor uma estrutura adequada antes/de acordo com a geração. Porém, quando estiver trabalhando em um projeto existente, deve **preservar a stack atual** e não migrar silenciosamente React para outra tecnologia, trocar banco de dados ou introduzir frameworks sem necessidade.

O objetivo é permitir sugestões técnicas sem tornar a Kira imprevisível.

## E-mail e recuperação de senha

A recuperação de senha não utiliza perguntas de segurança. O fluxo atual é:

```text
Esqueci minha senha
       ↓
usuário informa o e-mail
       ↓
token aleatório temporário
       ↓
Resend envia o link
       ↓
usuário define nova senha
```

O link de redefinição expira em aproximadamente 1 hora. O token é armazenado de forma protegida e invalidado depois da troca de senha.

Configure:

```env
RESEND_API_KEY=sua_chave
EMAIL_FROM=Kira <seu-email@seu-dominio.com>
APP_URL=https://seu-dominio.com
```

⚠️ O remetente de teste do Resend pode ter restrições de destinatários. Para produção, use um domínio verificado no Resend e configure `EMAIL_FROM` com esse domínio.

O endpoint de recuperação responde de forma genérica mesmo quando o e-mail não existe, evitando revelar quais endereços estão cadastrados.

## Controlar dispositivos físicos (Home Assistant) — opcional

1. Gere um token de longa duração no Home Assistant.
2. Configure `HOME_ASSISTANT_URL` e `HOME_ASSISTANT_TOKEN`.
3. A ferramenta `control_device` fica disponível para a Kira.

Sem essas variáveis, a integração permanece desabilitada.

## Imagem e áudio

- **Imagem:** pode ser enviada junto à conversa para análise pelo modelo multimodal.
- **Áudio:** pode ser enviado para interpretação pela IA.
- **Geração de imagem:** a Kira pode chamar a ferramenta `generate_image`, atualmente integrada ao Pollinations.

Anexos são enviados ao backend em base64. Evite aumentar excessivamente o limite de upload sem também adicionar validações de tamanho e tipo.

## Histórico de conversas

Cada usuário possui suas próprias conversas. O backend associa as conversas ao usuário autenticado e o frontend permite selecionar, criar e excluir conversas.

Artifacts podem ser armazenados junto às mensagens da assistente para que projetos gerados possam reaparecer quando uma conversa for reaberta.

## Painel de Configurações

A interface inclui configurações de aparência, ajuda, acompanhamento de uso e envio de comentários.

Os comentários ficam armazenados no banco e podem ser consultados administrativamente.

## Limites de uso

A aplicação possui proteção em dois níveis:

- limite de mensagens por usuário em uma janela de tempo;
- orçamento diário compartilhado de chamadas de IA.

O limite global pode ser configurado por `DAILY_MAX_AI_CALLS`.

Como Gemini e Groq possuem limites próprios, especialmente nos planos gratuitos, a aplicação deve tratar `429`, `503`, modelos indisponíveis e outras falhas de provedor como situações esperadas e recuperáveis.

## Deploy em produção (Render)

1. Suba o projeto para o GitHub sem `.env` ou `node_modules`.
2. No Render, crie um Web Service conectado ao repositório.
3. Use os comandos definidos pelo projeto para build/start.
4. Configure as variáveis de ambiente necessárias.

Principais variáveis:

```env
DATABASE_URL=
JWT_SECRET=
APP_URL=
NODE_ENV=production

GEMINI_API_KEY=
# ou GEMINI_API_KEYS=
GEMINI_MODEL=

GROQ_API_KEY=
GROQ_MODEL=

RESEND_API_KEY=
EMAIL_FROM=

HOME_ASSISTANT_URL=
HOME_ASSISTANT_TOKEN=

DAILY_MAX_AI_CALLS=
```

Nem todas são obrigatórias. Home Assistant, Resend e Groq são integrações opcionais.

## Instalar no celular (PWA)

**Android/Chrome:** menu → Adicionar à tela inicial.

**iPhone/Safari:** compartilhar → Adicionar à Tela de Início.

## Segurança

- Chaves de API e connection strings permanecem no backend.
- Senhas são armazenadas com hash usando bcrypt.
- Tokens de recuperação de senha são aleatórios, temporários e invalidados após uso.
- O endpoint de recuperação não revela se uma conta existe.
- Rotas privadas utilizam autenticação JWT.
- Conversas são isoladas por usuário no backend.

## Melhorias futuras sugeridas

A base atual já permite evoluir a Kira sem reconstruir o projeto. Algumas melhorias interessantes para próximas versões:

### 1. Editor de código real no Artifact

Hoje o workspace é principalmente de visualização. Uma evolução natural é permitir editar o conteúdo diretamente no painel, com:

- numeração de linhas;
- syntax highlighting mais completo;
- busca dentro dos arquivos;
- indicação de alterações não salvas;
- salvar uma nova versão do Artifact.

Um editor como Monaco ou CodeMirror pode ser avaliado no futuro, mas não é necessário para o funcionamento atual.

### 2. Preview ao vivo para HTML/CSS/JavaScript

Para projetos web simples, adicionar uma aba **Preview** capaz de renderizar o resultado dos arquivos do Artifact em um ambiente isolado.

O isolamento é importante: código gerado pela IA não deve executar diretamente no contexto principal da aplicação.

### 3. Versionamento de Artifacts

Guardar versões sucessivas do mesmo projeto:

```text
landing-page
├── v1 — criação inicial
├── v2 — alteração do hero
└── v3 — formulário adicionado
```

Isso permitiria pedir “volte para a versão anterior” ou comparar mudanças.

### 4. Editar apenas arquivos necessários

Quando o usuário pedir uma alteração em um projeto existente, enviar ao modelo somente o contexto necessário e solicitar patches/arquivos modificados, em vez de regenerar todo o projeto.

Isso reduz consumo de tokens e é especialmente importante usando APIs gratuitas.

### 5. Contexto de projeto persistente

Transformar um Artifact em um projeto persistente com metadados próprios, separado do histórico textual da conversa. Isso permitiria continuar trabalhando no mesmo código através de várias sessões.

### 6. Exportação mais completa

Além de download individual e ZIP, futuramente avaliar:

- exportar diretamente para GitHub;
- importar um repositório existente;
- gerar README automaticamente;
- copiar estrutura completa do projeto;
- exportar somente arquivos alterados.

### 7. Roteamento inteligente entre modelos

Em vez de usar sempre o mesmo modelo para tudo, criar uma camada de roteamento:

```text
conversa simples → modelo rápido/econômico
código pequeno   → modelo de código rápido
artifact grande  → modelo com maior contexto/saída
imagem/áudio     → modelo multimodal
```

Isso pode aumentar a disponibilidade e aproveitar melhor cotas gratuitas.

### 8. Descoberta automática de modelos disponíveis

No fallback Groq, consultar periodicamente os modelos disponíveis para a chave e evitar depender apenas de IDs hardcoded. Também é possível manter uma allowlist interna de modelos considerados compatíveis com Artifacts.

### 9. Observabilidade de provedores

Adicionar métricas administrativas para entender:

- quantas chamadas foram para Gemini;
- quantas precisaram de fallback;
- quantidade de erros 429/503;
- tokens aproximados por tarefa;
- taxa de sucesso de Artifacts;
- modelo que efetivamente respondeu.

Isso facilita decidir onde otimizar sem depender apenas dos logs do Render.

### 10. Validação mais forte de Artifacts

Antes de entregar um projeto:

- confirmar que `files[]` não está vazio;
- impedir caminhos perigosos (`../`);
- limitar tamanho e quantidade de arquivos;
- validar nomes/extensões;
- detectar conteúdo truncado;
- não confirmar criação quando o provedor retornar resposta incompleta.

### 11. Segurança do preview e dos arquivos

Antes de permitir execução/preview avançado de código gerado, adicionar sandboxing, Content Security Policy e limites de recursos. Código produzido por IA deve ser tratado como conteúdo não confiável.

### 12. Filas e retry para indisponibilidade temporária

Para erros como `503 UNAVAILABLE`, uma evolução futura é implementar retry com exponential backoff e jitter, respeitando limites dos provedores. Para tarefas maiores, uma fila pode impedir que várias gerações simultâneas esgotem rapidamente a cota gratuita.

### 13. Melhor gerenciamento de contexto e tokens

Para conversas longas:

- resumir mensagens antigas;
- manter separadamente decisões importantes do projeto;
- enviar apenas arquivos relevantes para cada alteração;
- calcular orçamento de contexto antes de chamar o modelo.

Isso melhora qualidade e reduz custo/uso de cota.

### 14. Testes automatizados

Adicionar testes para os fluxos mais críticos:

- cadastro/login;
- recuperação de senha;
- isolamento de conversas por usuário;
- fallback Gemini → Groq;
- Artifact de arquivo único;
- Artifact multi-arquivo;
- persistência/reabertura de Artifact;
- comportamento quando todos os provedores falham.

Essa é uma das melhorias mais importantes antes de aumentar muito o número de usuários.

## Princípios para próximas evoluções

Ao adicionar novas capacidades à Kira, manter quatro princípios:

1. **Não afirmar que uma ação foi concluída antes de validar o resultado.**
2. **Preservar a stack de projetos existentes, salvo quando o usuário pedir uma migração.**
3. **Tratar indisponibilidade de APIs como parte normal do sistema, com fallback e mensagens claras.**
4. **Priorizar eficiência de tokens e compatibilidade com planos gratuitos enquanto o projeto estiver nessa fase.**
