/**
 * utils/logger.js — structured logger
 *
 * Outputs human-readable tagged lines in development,
 * newline-delimited JSON in production.
 * Detected via process.env.NODE_ENV.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Format a log entry as a human-readable string (development).
 *
 * @param {string} level
 * @param {string} message
 * @param {object} [context]
 * @returns {string}
 */
function formatDev(level, message, context) {
  const ts  = new Date().toISOString();
  const ctx = context ? ' ' + JSON.stringify(context) : '';
  return `[${ts}] [${level.toUpperCase()}] ${message}${ctx}`;
}

/**
 * Format a log entry as a JSON string (production).
 *
 * @param {string} level
 * @param {string} message
 * @param {object} [context]
 * @returns {string}
 */
function formatProd(level, message, context) {
  return JSON.stringify({ ts: new Date().toISOString(), level, message, ...context });
}

function write(level, stream, message, context) {
  const line = IS_PROD
    ? formatProd(level, message, context)
    : formatDev(level, message, context);
  stream.write(line + '\n');
}

export const logger = {
  /** @param {string} message @param {object} [context] */
  info:  (message, context) => write('info',  process.stdout, message, context),
  /** @param {string} message @param {object} [context] */
  warn:  (message, context) => write('warn',  process.stderr, message, context),
  /** @param {string} message @param {object} [context] */
  error: (message, context) => write('error', process.stderr, message, context),
  /** @param {string} message @param {object} [context] */
  debug: (message, context) => {
    if (!IS_PROD) write('debug', process.stdout, message, context);
  },
};
