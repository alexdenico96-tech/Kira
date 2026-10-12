const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  "server/lib/imageGeneration.js",
  "utf8"
);

const match = source.match(
  /const cleanPrompt = text\s*\.replace\((\/\^.*?\/i), ""\)\s*\.trim\(\);/
);

assert.ok(match, "Expressão de limpeza do prompt não encontrada.");

const regex = new RegExp(match[1].slice(1, -2), "i");

function clean(text) {
  return text.replace(regex, "").trim();
}

test("Remove introdução de criação de imagem", () => {
  assert.equal(
    clean("Crie uma imagem de um gato"),
    "um gato"
  );
});

test("Remove introdução de geração de foto", () => {
  assert.equal(
    clean("Gere uma foto de uma paisagem"),
    "uma paisagem"
  );
});

test("Preserva descrições diretas", () => {
  assert.equal(
    clean("Um dragão azul voando"),
    "Um dragão azul voando"
  );
});

test("Preserva instruções que não correspondem ao padrão", () => {
  assert.equal(
    clean("Transforme esta imagem em anime"),
    "Transforme esta imagem em anime"
  );
});
