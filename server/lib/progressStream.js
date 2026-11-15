// KIRA_PROGRESS_STREAM_V1
// Quando o cliente pede "Accept: application/x-ndjson", a resposta do /api/chat vira um fluxo de linhas JSON:
//   {"type":"progress","id":"build","label":"Construindo o projeto","detail":"","state":"active"}
//   {"type":"result","status":200,"body":{...resposta normal...}}
// O handler continua usando res.status(...).json(...) normalmente; aqui só redirecionamos para o fluxo.
// Clientes antigos (sem o header) recebem exatamente o JSON de sempre.
export function progressStream(req, res, next) {
  const wantsStream = String(req.get('accept') || '').includes('application/x-ndjson');
  req.progress = () => {};
  if (!wantsStream) return next();

  let status = 200;
  let ended = false;
  res.status(200);
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no' // evita que proxies segurem o fluxo
  });
  res.flushHeaders?.();

  const write = payload => {
    if (ended || res.writableEnded) return;
    res.write(`${JSON.stringify(payload)}\n`);
  };
  // Mantém a conexão viva em gerações longas (proxies costumam cortar após ~60s sem dados).
  const keepAlive = setInterval(() => write({ type: 'ping' }), 15000);
  res.on('close', () => clearInterval(keepAlive));

  req.progress = (id, label, detail = '', state = 'active', extra = {}) => {
    if (!id || !label) return;
    const icons = Array.isArray(extra?.icons) ? extra.icons.map(String).filter(Boolean).slice(0, 8) : undefined;
    write({ type: 'progress', id, label: String(label).slice(0, 120), detail: String(detail || '').slice(0, 200), state, ...(icons?.length ? { icons } : {}) });
  };
  res.status = code => { status = Number(code) || 200; return res; };
  res.json = body => {
    clearInterval(keepAlive);
    write({ type: 'result', status, body });
    ended = true;
    res.end();
    return res;
  };
  next();
}
