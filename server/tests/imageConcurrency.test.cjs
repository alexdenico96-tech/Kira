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

const manager = vm.runInNewContext(
  source.slice(start, end) + `
  ({
    getOrder: getCloudflareAccountOrder,
    getActive: getCloudflareActiveRequests,
    reserve: reserveCloudflareAccount,
    release: releaseCloudflareAccount,
    setNext: value => { cloudflareNextAccount = value; }
  })
  `,
  {
    Date,
    Math,
    Number,
    console: { info() {} }
  }
);

const ids = ["conta-a", "conta-b", "conta-c"];

function reset() {
  for (const id of ids) {
    while (manager.getActive(id) > 0) {
      manager.release(id);
    }
  }
  manager.setNext(0);
}

test("Conta começa livre", () => {
  reset();
  assert.equal(manager.getActive("conta-a"), 0);
});

test("Reserva marca conta como ocupada", () => {
  reset();
  manager.reserve("conta-a");
  assert.equal(manager.getActive("conta-a"), 1);
});

test("Conta ocupada não aparece na seleção", () => {
  reset();
  manager.reserve("conta-a");

  assert.deepEqual(
    Array.from(manager.getOrder(ids)),
    [1, 2]
  );
});

test("Liberação torna conta disponível novamente", () => {
  reset();
  manager.reserve("conta-a");
  manager.release("conta-a");

  assert.deepEqual(
    Array.from(manager.getOrder(ids)),
    [0, 1, 2]
  );
});

test("Todas ocupadas retornam lista vazia", () => {
  reset();

  for (const id of ids) {
    manager.reserve(id);
  }

  assert.deepEqual(
    Array.from(manager.getOrder(ids)),
    []
  );
});
