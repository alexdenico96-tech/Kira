const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  "server/lib/imageGeneration.js",
  "utf8"
);

const start = source.indexOf("const CLOUDFLARE_COOLDOWN_MS =");
const end = source.indexOf("function getCloudflareAccountOrder(", start);

assert.ok(start >= 0, "Constante de cooldown não encontrada.");
assert.ok(end > start, "Função de cooldown não encontrada.");

const code = source.slice(start, end);

const context = vm.createContext({
  Date,
  Math,
  Number
});

const getCooldown = vm.runInContext(
  code + "\ngetCloudflareCooldownMs",
  context
);

function response(value) {
  return {
    headers: {
      get: () => value
    }
  };
}

test("Sem Retry-After usa 15 minutos", () => {
  assert.equal(getCooldown(response(null)), 900000);
});

test("Retry-After de 120 segundos", () => {
  assert.equal(getCooldown(response("120")), 120000);
});

test("Retry-After zero respeita mínimo de 1 segundo", () => {
  assert.equal(getCooldown(response("0")), 1000);
});

test("Retry-After excessivo respeita máximo de 24 horas", () => {
  assert.equal(getCooldown(response("999999")), 86400000);
});

test("Retry-After inválido usa padrão", () => {
  assert.equal(getCooldown(response("valor-invalido")), 900000);
});
