// Limitação simples em memória — suficiente para uma instância única (como no Render free tier).
// Reinicia se o servidor reiniciar; isso é aceitável aqui (erra a favor de permitir um pouco mais,
// nunca menos, o que é seguro).

const userWindows = new Map(); // userId -> { count, resetAt }
const USER_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const USER_MAX_REQUESTS = 20; // ~20 mensagens a cada 15 min por usuário

export function checkUserRateLimit(userId) {
  const now = Date.now();
  let entry = userWindows.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + USER_WINDOW_MS };
    userWindows.set(userId, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= USER_MAX_REQUESTS,
    resetInMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000))
  };
}

// Só consulta o uso atual do usuário, sem contar mais uma requisição — usado pela tela de Configurações.
export function getUserUsage(userId) {
  const now = Date.now();
  const entry = userWindows.get(userId);
  if (!entry || now > entry.resetAt) {
    return { count: 0, max: USER_MAX_REQUESTS, resetInMinutes: Math.ceil(USER_WINDOW_MS / 60000) };
  }
  return {
    count: entry.count,
    max: USER_MAX_REQUESTS,
    resetInMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000))
  };
}

// Orçamento diário global de chamadas reais à IA — protege a cota compartilhada da chave
// (Gemini Flash tem ~250 requisições/dia no plano gratuito, para o app inteiro).
const DAILY_MAX_AI_CALLS = Number(process.env.DAILY_MAX_AI_CALLS) || 220;

function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

let dailyBudget = { count: 0, resetAt: nextMidnight() };

export function hasDailyBudget() {
  if (Date.now() > dailyBudget.resetAt) {
    dailyBudget = { count: 0, resetAt: nextMidnight() };
  }
  return dailyBudget.count < DAILY_MAX_AI_CALLS;
}

// Só consulta o orçamento diário atual, sem consumir — usado pela tela de Configurações.
export function getDailyUsage() {
  if (Date.now() > dailyBudget.resetAt) {
    dailyBudget = { count: 0, resetAt: nextMidnight() };
  }
  return { count: dailyBudget.count, max: DAILY_MAX_AI_CALLS };
}

export function consumeDailyBudget() {
  if (Date.now() > dailyBudget.resetAt) {
    dailyBudget = { count: 0, resetAt: nextMidnight() };
  }
  dailyBudget.count += 1;
}
