const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(
  "server/lib/imageGeneration.js",
  "utf8"
);

const start = source.indexOf("const cloudflareCooldowns =");
const end = source.indexOf("async function generateCloudflareImage(", start);

assert.ok(start >= 0, "Gerenciador não encontrado.");
assert.ok(end > start, "Fim do gerenciador não encontrado.");

const context = vm.createContext({
  Date,
  Math,
  Number,
  console: { info() {} }
});

const manager = vm.runInContext(
  source.slice(start, end) +
    `
    ({
      getOrder: getCloudflareAccountOrder,
      setNext: index => { cloudflareNextAccount = index; },
      setCooldown: (id, until) => cloudflareCooldowns.set(id, until),
      clearCooldowns: () => cloudflareCooldowns.clear()
    })
    `,
  context
);

const accounts = ["conta-a", "conta-b", "conta-c"];

function reset() {
  manager.clearCooldowns();
  manager.setNext(0);
}

test("Começa pela primeira conta", () => {
  reset();
  assert.deepEqual(Array.from(manager.getOrder(accounts)), [0, 1, 2]);
});

test("Rotação começa pela próxima conta", () => {
  reset();
  manager.setNext(1);
  assert.deepEqual(Array.from(manager.getOrder(accounts)), [1, 2, 0]);
});

test("Ignora conta em cooldown", () => {
  reset();
  manager.setCooldown("conta-a", Date.now() + 60000);
  assert.deepEqual(Array.from(manager.getOrder(accounts)), [1, 2]);
});

test("Conta volta após cooldown expirado", () => {
  reset();
  manager.setCooldown("conta-a", Date.now() - 1000);
  assert.deepEqual(Array.from(manager.getOrder(accounts)), [0, 1, 2]);
});

test("Todas as contas bloqueadas retornam lista vazia", () => {
  reset();
  for (const id of accounts) {
    manager.setCooldown(id, Date.now() + 60000);
  }
  assert.deepEqual(Array.from(manager.getOrder(accounts)), []);
});
