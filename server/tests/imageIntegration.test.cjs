const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(
  "server/lib/imageGeneration.js",
  "utf8"
);

const start = source.indexOf("const cloudflareCooldowns =");
const end = source.indexOf(
  "export async function generateKiraImage(",
  start
);

assert.ok(start >= 0, "Gerenciador não encontrado.");
assert.ok(end > start, "Função Cloudflare não encontrada.");

function createEnvironment(options = {}) {
  const calls = [];
  const pending = [];
  const saved = [];

  const context = {
    Date,
    Math,
    Number,
    Map,
    Buffer,
    FormData,
    AbortSignal,
    encodeURIComponent,
    console: { info() {}, warn() {} },
    process: {
      env: {
        CLOUDFLARE_ACCOUNT_IDS: "conta-a,conta-b,conta-c",
        CLOUDFLARE_API_TOKENS: "token-a,token-b,token-c"
      }
    },
    splitCredentials: value =>
      String(value || "").split(",").map(x => x.trim()).filter(Boolean),
    fs: {
      mkdir: async () => {},
      writeFile: async (filename, bytes) => {
        saved.push({ filename, size: bytes.length });
      }
    },
    imageDir: "/imagens",
    path,
    randomUUID: () => "imagem-teste",
    buildPollinationsUrl: prompt =>
      "https://pollinations.test/image?prompt=" +
      encodeURIComponent(prompt),
    fetch: url => {
      calls.push(url);

      if (options.autoFailCloudflare &&
          url.includes("api.cloudflare.com")) {
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: { get: () => null }
        });
      }

      if (options.autoFailCloudflare &&
          url.includes("pollinations.test")) {
        return Promise.resolve(successResponse());
      }

      return new Promise(resolve => pending.push(resolve));
    }
  };

  const api = vm.runInNewContext(
    source.slice(
      source.indexOf("function detectImageLayout("),
      source.indexOf("const cloudflareCooldowns =")
    ) +
    source.slice(start, end) +
    source.slice(end).replace(
      "export async function generateKiraImage(",
      "async function generateKiraImage("
    ) + `
      ({
        generate: generateCloudflareImage,
        generateKiraImage,
        getActive: getCloudflareActiveRequests,
        getOrder: getCloudflareAccountOrder
      })
    `,
    context
  );

  return { api, calls, pending, saved };
}

const layout = { width: 1024, height: 1024 };

function successResponse() {
  const bytes = Buffer.alloc(200, 1);

  return {
    ok: true,
    status: 200,
    headers: {
      get: name =>
        name === "content-type" ? "image/png" : null
    },
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      )
  };
}

test("Distribui três gerações entre três contas", async () => {
  const env = createEnvironment();

  const tasks = [
    env.api.generate("imagem 1", layout),
    env.api.generate("imagem 2", layout),
    env.api.generate("imagem 3", layout)
  ];

  assert.equal(env.calls.length, 3);
  assert.ok(env.calls[0].includes("conta-a"));
  assert.ok(env.calls[1].includes("conta-b"));
  assert.ok(env.calls[2].includes("conta-c"));

  for (const id of ["conta-a", "conta-b", "conta-c"]) {
    assert.equal(env.api.getActive(id), 1);
  }

  const fourth = env.api.generate("imagem 4", layout);

  await assert.rejects(fourth);
  assert.equal(env.calls.length, 3);

  for (const resolve of env.pending) {
    resolve(successResponse());
  }

  const results = await Promise.all(tasks);

  assert.equal(results.length, 3);
  assert.equal(env.saved.length, 3);

  for (const id of ["conta-a", "conta-b", "conta-c"]) {
    assert.equal(env.api.getActive(id), 0);
  }
});


async function waitForCalls(env, expected, timeoutMs = 2000) {
  const start = Date.now();

  while (env.calls.length < expected) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        "Timeout aguardando " + expected +
        " chamadas. Recebidas: " + env.calls.length
      );
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function errorResponse(status, retryAfter = null) {
  return {
    ok: false,
    status,
    headers: {
      get: name =>
        name === "retry-after" ? retryAfter : null
    }
  };
}

test("HTTP 429 coloca conta em cooldown e tenta a próxima", async () => {
  const env = createEnvironment();

  const task = env.api.generate("imagem com retry", layout);

  assert.equal(env.calls.length, 1);
  assert.ok(env.calls[0].includes("conta-a"));

  env.pending[0](errorResponse(429, "120"));

  await waitForCalls(env, 2);

  assert.equal(env.calls.length, 2);
  assert.ok(env.calls[1].includes("conta-b"));

  env.pending[1](successResponse());

  await task;

  assert.equal(env.api.getActive("conta-a"), 0);
  assert.equal(env.api.getActive("conta-b"), 0);

  assert.deepEqual(
    Array.from(env.api.getOrder(["conta-a", "conta-b", "conta-c"])),
    [2, 1]
  );
});

test("Falha de rede libera a reserva e tenta outra conta", async () => {
  const env = createEnvironment();

  const task = env.api.generate("imagem com falha", layout);

  assert.equal(env.calls.length, 1);

  env.pending[0](Promise.reject(new Error("Falha de rede simulada")));

  await waitForCalls(env, 2);

  assert.equal(env.calls.length, 2);
  assert.ok(env.calls[1].includes("conta-b"));

  env.pending[1](successResponse());

  await task;

  assert.equal(env.api.getActive("conta-a"), 0);
  assert.equal(env.api.getActive("conta-b"), 0);
});

test("Usa Pollinations quando todas as contas Cloudflare falham", async () => {
  const env = createEnvironment({ autoFailCloudflare: true });

  const result = await env.api.generateKiraImage(
    "Crie uma imagem de um gato astronauta"
  );

  const cloudflareCalls = env.calls.filter(url =>
    url.includes("api.cloudflare.com")
  );

  const pollinationsCalls = env.calls.filter(url =>
    url.includes("pollinations.test")
  );

  assert.equal(cloudflareCalls.length, 3);
  assert.equal(pollinationsCalls.length, 1);
  assert.ok(result.startsWith("/api/generated-images/"));
  assert.equal(env.saved.length, 1);
  assert.equal(env.saved[0].size, 200);

  for (const id of ["conta-a", "conta-b", "conta-c"]) {
    assert.equal(env.api.getActive(id), 0);
  }
});
