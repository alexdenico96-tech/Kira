# Kira — correção da prévia Sandpack

Substitua os arquivos pelos caminhos correspondentes no repositório:

- `client/src/components/ProjectRunner.jsx`
- `client/src/lib/projectPreviewConfig.js` (novo)
- `client/tests/projectPreviewConfig.test.mjs` (novo teste)

O ajuste seleciona o preset Vite correspondente à stack, não envia o `package.json` gerado como arquivo que sobrescreve o manifesto do preset e deixa as versões Vite/esbuild gerenciadas pelo template Sandpack compatível com Nodebox. As dependências adicionais do projeto continuam sendo encaminhadas ao Sandpack.

Teste a configuração com:

```bash
cd ~/Kira/client
node --test tests/projectPreviewConfig.test.mjs
npm run build
```

Não faça deploy antes de validar a prévia no navegador.
