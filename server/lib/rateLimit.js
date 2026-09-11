const userWindows = new Map();
const USER_WINDOW_MS = 15 * 60 * 1000;
const USER_MAX_REQUESTS = 20;

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

export function getUserUsage(userId) {
  const now = Date.now();
  const entry = userWindows.get(userId);
  if (!entry || now > entry.resetAt) {
    return { count: 0, max: USER_MAX_REQUESTS, resetInMinutes: Math.ceil(USER_WINDOW_MS / 60000) };
  }
  return { count: entry.count, max: USER_MAX_REQUESTS, resetInMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000)) };
}

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

export function consumeDailyBudget() {
  if (Date.now() > dailyBudget.resetAt) {
    dailyBudget = { count: 0, resetAt: nextMidnight() };
  }
  dailyBudget.count += 1;
}

export function getDailyUsage() {
  if (Date.now() > dailyBudget.resetAt) {
    dailyBudget = { count: 0, resetAt: nextMidnight() };
  }
  return { count: dailyBudget.count, max: DAILY_MAX_AI_CALLS };
}
