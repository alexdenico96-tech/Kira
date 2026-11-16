const test = require('node:test');
const assert = require('node:assert/strict');
const voice = import('../lib/voiceRequest.js');
const tx = import('../lib/kiraTranscription.js');

const audio = { data: Buffer.from('fake-audio-bytes').toString('base64'), mimeType: 'audio/webm;codecs=opus' };
const seg = (logprob, noSpeech = 0.01) => [{ start: 0, end: 3, avg_logprob: logprob, no_speech_prob: noSpeech }];
const withFetch = async (handler, fn) => { const original = global.fetch; global.fetch = handler; try { return await fn(); } finally { global.fetch = original; } };

test('Whisper large-v3 com prompt de contexto, temperatura 0 e rodízio de chaves no 429', async () => {
  const { transcribeKiraAudioDetailed } = await tx;
  process.env.GROQ_API_KEYS = 'k1,k2,k3';
  const seen = [];
  const result = await withFetch(async (url, init) => {
    const form = init.body;
    seen.push({ key: init.headers.Authorization, model: form.get('model'), prompt: form.get('prompt'), temperature: form.get('temperature'), format: form.get('response_format') });
    if (seen.length === 1) return new Response('{}', { status: 429 });
    return Response.json({ text: 'Crie uma apresentação sobre café com 8 slides', language: 'portuguese', segments: seg(-0.2) });
  }, () => transcribeKiraAudioDetailed(audio, { context: 'falamos sobre a marca Aurora' }));
  assert.equal(result.text, 'Crie uma apresentação sobre café com 8 slides');
  assert.equal(seen[0].model, 'whisper-large-v3');
  assert.notEqual(seen[0].key, seen[1].key);
  assert.equal(seen[1].temperature, '0');
  assert.equal(seen[1].format, 'verbose_json');
  assert.match(seen[1].prompt, /PowerPoint.*Contexto da conversa: falamos sobre a marca Aurora/);
  assert.equal(result.lowConfidence, false);
});

test('alucinação em silêncio ("Obrigado por assistir") vira texto vazio, sem reserva', async () => {
  const { transcribeKiraAudioDetailed } = await tx;
  process.env.GROQ_API_KEYS = 'k1';
  process.env.KIRA_AUDIO_GEMINI_FALLBACK = 'false';
  const result = await withFetch(async () => Response.json({ text: ' Obrigado por assistir!', segments: seg(-0.9, 0.9) }), () => transcribeKiraAudioDetailed(audio));
  delete process.env.KIRA_AUDIO_GEMINI_FALLBACK;
  assert.equal(result.text, '');
  assert.equal(result.lowConfidence, true);
});

test('confiança e detecção de alucinações', async () => {
  const { confidenceFrom, isHallucination, whisperPrompt } = await tx;
  assert.ok(confidenceFrom(seg(-0.1)).score > 0.85);
  assert.ok(confidenceFrom(seg(-1.5)).score < 0.45);
  assert.equal(isHallucination('Legendas pela comunidade Amara.org'), true);
  assert.equal(isHallucination('Obrigado, agora mude a cor para azul'), false);
  assert.ok(whisperPrompt('x'.repeat(2000)).length <= 700);
});

test('limpeza da fala: aplica autocorreção e recusa respostas, números inventados e cortes', async () => {
  const { needsVoiceCleanup, acceptVoiceCleanup, cleanVoiceRequest } = await voice;
  const spoken = 'é... cria um site, não, espera, uma landing page tipo azul, não, verde, com três seções né';
  assert.equal(needsVoiceCleanup(spoken), true);
  assert.equal(needsVoiceCleanup('crie um site de padaria'), false);
  const r = await cleanVoiceRequest(spoken, async () => 'Crie uma landing page verde com três seções.');
  assert.deepEqual(r, { text: 'Crie uma landing page verde com três seções.', cleaned: true });
  assert.equal(acceptVoiceCleanup(spoken, 'Claro! Aqui está sua landing page...'), null);
  assert.equal(acceptVoiceCleanup('crie 3 slides tipo né sobre café é ãh', 'Crie 5 slides sobre café'), null);
  assert.equal(acceptVoiceCleanup(spoken, 'Landing page.'), null);
});
