const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = 'g1';
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
process.env.KIRA_GEMINI_FALLBACK_MODELS = 'gemini-3.6-flash,gemini-3.5-flash-lite';
process.env.GROQ_API_KEYS = 'q1';
const gemini = import('../lib/gemini.js');
const groq = import('../lib/groq.js');

const ok = text => Response.json({ candidates: [{ content: { parts: [{ text }] } }] });

test('503 no modelo principal: usa a reserva e depois vai direto para ela enquanto o principal esfria', async () => {
  const { callGemini } = await gemini;
  const calls = [];
  const original = global.fetch;
  global.fetch = async url => {
    const model = String(url).match(/models\/([^:]+):/)[1];
    calls.push(model);
    return model === 'gemini-3.8-flash' ? new Response('{"error":{"message":"overloaded"}}', { status: 503 }) : ok(`resposta do ${model}`);
  };
  try {
    const first = await callGemini({ systemInstruction: 'x', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] });
    assert.equal(first._kiraModel, 'gemini-3.6-flash');
    const second = await callGemini({ systemInstruction: 'x', contents: [{ role: 'user', parts: [{ text: 'oi' }] }] });
    assert.equal(second._kiraModel, 'gemini-3.6-flash');
    assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']);
  } finally { global.fetch = original; }
});

test('Groq para arquivos: modo JSON, 16 mil tokens e GPT-OSS 120B primeiro', async () => {
  const { callGroqJson } = await groq;
  let body;
  const original = global.fetch;
  global.fetch = async (url, init) => { body = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '{"title":"ok"}' }, finish_reason: 'stop' }] }); };
  try {
    assert.equal(await callGroqJson({ systemInstruction: 's', message: 'm' }), '{"title":"ok"}');
    assert.equal(body.model, 'openai/gpt-oss-120b');
    assert.equal(body.max_tokens, 16000);
    assert.deepEqual(body.response_format, { type: 'json_object' });
  } finally { global.fetch = original; }
});
