import pg from "pg";
import { randomUUID, randomBytes, createHash } from "crypto";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL não configurada. Defina uma connection string de um banco Postgres (ex: Neon, Supabase) no .env do servidor."
  );
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
  // Migrações seguras para bancos que já tinham as tabelas antes destas colunas existirem.
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS had_attachment BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS document_name TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS document_content TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_name TEXT;`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS artifact_files JSONB;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);
}

// ---------- Users ----------

const USER_FIELDS = `id, username, email, password_hash AS "passwordHash"`;

export async function findUserByUsername(username) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE lower(username) = lower($1)`, [username]);
  return rows[0] || null;
}

export async function createUser({ username, email, passwordHash }) {
  try {
    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, created_at AS "createdAt"`,
      [id, username, email, passwordHash]
    );
    return { ...rows[0], passwordHash };
  } catch (err) {
    if (err.code === "23505") throw new Error(err.constraint === "idx_users_email_lower" ? "EMAIL_TAKEN" : "USERNAME_TAKEN");
    throw err;
  }
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM users WHERE lower(email) = lower($1)`, [email]);
  return rows[0] || null;
}

export async function createPasswordResetToken(userId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await pool.query(
    `UPDATE users SET reset_token_hash = $2, reset_token_expires_at = now() + interval '1 hour' WHERE id = $1`,
    [userId, tokenHash]
  );
  return token;
}

export async function findUserByValidResetToken(token) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query(
    `SELECT ${USER_FIELDS} FROM users WHERE reset_token_hash = $1 AND reset_token_expires_at > now()`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function clearPasswordResetToken(userId) {
  await pool.query(`UPDATE users SET reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = $1`, [userId]);
}

export async function updatePassword(userId, passwordHash) {
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

// ---------- Conversations ----------

export async function listConversations(userId) {
  const { rows } = await pool.query(`SELECT id, title, created_at AS "createdAt" FROM conversations WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows;
}

export async function getConversation(userId, conversationId) {
  const { rows: convRows } = await pool.query(`SELECT id, title, created_at AS "createdAt" FROM conversations WHERE id = $1 AND user_id = $2`, [
    conversationId,
    userId
  ]);
  if (!convRows[0]) return null;

  const { rows: messages } = await pool.query(
    `SELECT role, content, searched,
            search_queries AS "searchQueries",
            visited_sites AS "visitedSites",
            reasoning,
            search_disabled AS "searchDisabled",
            image_url AS "imageUrl",
            had_attachment AS "hadAttachment",
            document_name AS "documentName",
            document_content AS "documentContent",
            artifact_name AS "artifactName",
            artifact_files AS "artifactFiles"
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
  const { rows } = await pool.query(`SELECT id FROM conversations WHERE id = $1 AND user_id = $2`, [conversationId, userId]);
  if (!rows[0]) throw new Error("Conversa não encontrada.");

  for (const m of newMessages) {
    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, searched, search_queries, visited_sites, reasoning, search_disabled, image_url, had_attachment, document_name, document_content, artifact_name, artifact_files)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        m.hadAttachment || false,
        m.documentName || null,
        m.documentContent || null,
        m.artifactName || null,
        m.artifactFiles ? JSON.stringify(m.artifactFiles) : null
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
  await pool.query(`INSERT INTO feedback (user_id, username, message) VALUES ($1, $2, $3)`, [userId, username, message]);
}
