# Kira — correção pontual da sintaxe HTML

Esta atualização trata exclusivamente HTML gerado com aspas de atributos indevidamente escapadas, por exemplo `lang=\\"pt-BR\\"`.

## Arquivos incluídos
- `server/index.js`
- `server/lib/gemini.js`
- `server/lib/groq.js`
- `server/lib/htmlArtifactRepair.js` (novo)
- `server/tests/htmlArtifactRepair.test.cjs` (novo)

## Aplicação no Git Bash
Na raiz do repositório `~/Kira`, extraia o ZIP em uma pasta temporária e copie os arquivos:

```bash
cd ~/Kira
unzip -o ~/Downloads/kira-html-syntax-fix.zip
cp kira-html-syntax-fix/server/index.js server/index.js
cp kira-html-syntax-fix/server/lib/gemini.js server/lib/gemini.js
cp kira-html-syntax-fix/server/lib/groq.js server/lib/groq.js
cp kira-html-syntax-fix/server/lib/htmlArtifactRepair.js server/lib/
cp kira-html-syntax-fix/server/tests/htmlArtifactRepair.test.cjs server/tests/
```

## Testes
Execute na raiz do repositório:

```bash
node --test server/tests/htmlArtifactRepair.test.cjs
node --check server/index.js
node --check server/lib/gemini.js
node --check server/lib/groq.js
node --check server/lib/htmlArtifactRepair.js
```

A normalização atua somente em arquivos `.html`/`.htm`, somente em marcação HTML. Ela preserva o corpo de `<script>` e `<style>`, comentários e arquivos JS/JSX/CSS. Também ajusta as instruções de geração para Gemini e Groq. Não altera Sandpack, Vite, a estrutura do projeto nem os Quality/Syntax Gates existentes.
