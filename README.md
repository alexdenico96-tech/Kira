# Kira v5 Quality

Melhora a criação de projetos sem remover a v4:
- contrato forte para sites multi-arquivo;
- quality gate antes de salvar;
- reparo determinístico dos links `style.css` e `script.js`;
- uma segunda tentativa Gemini somente quando o artifact falha estruturalmente;
- fallback Groq também validado;
- rotação de múltiplas chaves Groq;
- mensagem final com os nomes exatos dos arquivos.

## Groq
No `.env`, use uma linha:
`GROQ_API_KEYS=chave1,chave2,chave3,chave4`

`GROQ_API_KEYS` tem prioridade sobre `GROQ_API_KEY`.

## Instalar
Copie `apply-kira-v5-quality.mjs` e `payload/` para a raiz e execute:
`node apply-kira-v5-quality.mjs`

Depois reinicie o backend.
