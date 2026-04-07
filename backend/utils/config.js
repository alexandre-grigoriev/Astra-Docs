/**
 * utils/config.js — centralised environment variable access
 *
 * All process.env access goes through this module.
 * Validates required variables at startup and throws a descriptive error
 * if any are missing, so the process fails fast rather than at first use.
 */

const REQUIRED = [
  'NEO4J_URI',
  'NEO4J_USER',
  'NEO4J_PASSWORD',
  'GEMINI_API_KEY',
];

const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  throw new Error(
    `[config] Missing required environment variables: ${missing.join(', ')}.\n` +
    `Check your .env file and ensure all required variables are set.`
  );
}

export const config = {
  // Neo4j
  NEO4J_URI:      process.env.NEO4J_URI,
  NEO4J_USER:     process.env.NEO4J_USER,
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,

  // Gemini
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // SQLite
  DB_PATH: process.env.DB_PATH || './users.db',

  // Server
  PORT:         parseInt(process.env.PORT || '3001', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || 'http://localhost:5173',

  // Auth
  COOKIE_NAME:     process.env.COOKIE_NAME     || 'avatar_session',
  COOKIE_SECURE:   String(process.env.COOKIE_SECURE || 'false') === 'true',
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE  || 'lax',
  SESSION_SECRET:  process.env.SESSION_SECRET   || '',

  // SMTP (optional)
  SMTP_HOST:     process.env.SMTP_HOST     || '',
  SMTP_PORT:     parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER:     process.env.SMTP_USER     || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID     || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',

  // LDAP (optional)
  LDAP_URL:           process.env.LDAP_URL           || '',
  LDAP_BASE_DN:       process.env.LDAP_BASE_DN       || '',
  LDAP_BIND_DN:       process.env.LDAP_BIND_DN       || '',
  LDAP_BIND_PASSWORD: process.env.LDAP_BIND_PASSWORD || '',

  // SVG display constraints (used when rendering graphviz blocks to SVG files)
  SVG_MAX_WIDTH:  parseInt(process.env.SVG_MAX_WIDTH  || '800', 10),
  SVG_MAX_HEIGHT: parseInt(process.env.SVG_MAX_HEIGHT || '600', 10),

  // Uploads
  UPLOADS_DIR: process.env.UPLOADS_DIR || '',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
};

/** File extensions that the ingestion pipeline accepts. */
export const SUPPORTED_EXTS = ['pdf', 'md', 'markdown', 'docx'];

/** Image extensions recognised inside ZIP archives. */
export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'tif']);
