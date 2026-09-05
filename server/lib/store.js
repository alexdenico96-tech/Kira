import dotenv from "dotenv";
import pg from "pg";
import { randomUUID } from "crypto";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL não configurada. Defina uma connection string de um banco Postgres (ex: Neon, Supabase) no .env do servidor."
  );
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Bancos gerenciados (Neon, Supabase etc.) exigem SSL; um Postgres local geralmente não.
  ssl: isLocalDb ? false : { rejectUnauthorized: false }
});

export async function initStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      searched BOOLEAN NOT NULL DEFAULT false,
      search_queries JSONB NOT NULL DEFAULT '[]',
      visited_sites JSONB NOT NULL DEFAULT '[]',
      reasoning TEXT,
      search_disabled BOOLEAN NOT NULL DEFAULT false,
      image_url TEXT,
      had_attachment BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Migração segura para bancos que já tinham a tabela messages antes destas colunas existirem.
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS had_attachment BOOLEAN NOT NULL DEFAULT false;`);
  // Migração segura para bancos que já tinham a tabela users antes de e-mail/verificação existirem.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);
}

// ---------- Users ----------

const USER_FIELDS = `id, username, email, email_verified AS "emailVerified", password_hash AS "passwordHash"`;

export async function findUserByUsername(username) {
  const { rows } = await pool.query(
    `SELECT ${USER_FIELDS} FROM users WHERE lower(username) = lower($1)`,
    [username]
  );
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createUser({ username, email, passwordHash, verifyToken, verifyExpires }) {
  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, verify_token, verify_expires)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, email_verified AS "emailVerified", created_at AS "createdAt"`,
      [id, username, email, passwordHash, verifyToken, verifyExpires]
    );
    return { ...rows[0], passwordHash };
  } catch (err) {
    if (err.code === "23505") {
      if (String(err.detail || "").includes("email")) throw new Error("EMAIL_TAKEN");
      throw new Error("USERNAME_TAKEN");
    }
    throw err;
  }
}

export async function setVerifyToken(userId, token, expires) {
  await pool.query(`UPDATE users SET verify_token = $2, verify_expires = $3 WHERE id = $1`, [userId, token, expires]);
}

export async function findUserByVerifyToken(token) {
  const { rows } = await pool.query(
    `SELECT ${USER_FIELDS}, verify_expires AS "verifyExpires" FROM users WHERE verify_token = $1`,
    [token]
  );
  return rows[0] || null;
}

export async function markEmailVerified(userId) {
  await pool.query(
    `UPDATE users SET email_verified = true, verify_token = NULL, verify_expires = NULL WHERE id = $1`,
    [userId]
  );
}

export async function setResetToken(userId, token, expires) {
  await pool.query(`UPDATE users SET reset_token = $2, reset_expires = $3 WHERE id = $1`, [userId, token, expires]);
}

export async function findUserByResetToken(token) {
  const { rows } = await pool.query(
    `SELECT ${USER_FIELDS}, reset_expires AS "resetExpires" FROM users WHERE reset_token = $1`,
    [token]
  );
  return rows[0] || null;
}

export async function updatePassword(userId, passwordHash) {
  await pool.query(`UPDATE users SET password_hash = $2, reset_token = NULL, reset_expires = NULL WHERE id = $1`, [
    userId,
    passwordHash
  ]);
}

// ---------- Conversations (isoladas por user_id no próprio banco) ----------

export async function listConversations(userId) {
  const { rows } = await pool.query(
    `SELECT id, title, created_at AS "createdAt" FROM conversations WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getConversation(userId, conversationId) {
  const { rows: convRows } = await pool.query(
    `SELECT id, title, created_at AS "createdAt" FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  if (!convRows[0]) return null;

  const { rows: messages } = await pool.query(
    `SELECT role, content, searched,
            search_queries AS "searchQueries",
            visited_sites AS "visitedSites",
            reasoning,
            search_disabled AS "searchDisabled",
            image_url AS "imageUrl",
            had_attachment AS "hadAttachment"
     FROM messages WHERE conversation_id = $1 ORDER BY id ASC`,
    [conversationId]
  );

  return { ...convRows[0], messages };
}

export async function createConversation(userId, title) {
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)
     RETURNING id, title, created_at AS "createdAt"`,
    [id, userId, title]
  );
  return { ...rows[0], messages: [] };
}

export async function appendMessages(userId, conversationId, newMessages) {
  const { rows } = await pool.query(`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`, [
    conversationId,
    userId
  ]);
  if (!rows[0]) throw new Error("Conversa não encontrada.");

  for (const m of newMessages) {
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, searched, search_queries, visited_sites, reasoning, search_disabled, image_url, had_attachment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        conversationId,
        m.role,
        m.content,
        m.searched || false,
        JSON.stringify(m.searchQueries || []),
        JSON.stringify(m.visitedSites || []),
        m.reasoning || null,
        m.searchDisabled || false,
        m.imageUrl || null,
        m.hadAttachment || false
      ]
    );
  }
}

export async function deleteConversation(userId, conversationId) {
  await pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
}

export async function deleteAllConversations(userId) {
  await pool.query(`DELETE FROM conversations WHERE user_id = $1`, [userId]);
}

// ---------- Feedback ----------

export async function createFeedback(userId, username, message) {
  await pool.query(`INSERT INTO feedback (user_id, username, message) VALUES ($1, $2, $3)`, [
    userId,
    username,
    message
  ]);
}
