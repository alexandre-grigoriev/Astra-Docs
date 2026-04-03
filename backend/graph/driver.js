/**
 * graph/driver.js — Neo4j driver singleton with read/write query helpers.
 *
 * readQuery()  — uses READ access mode; safe for all retrieval Cypher.
 * writeQuery() — uses WRITE access mode; required for MERGE/CREATE/SET.
 * Both helpers close the session in a finally block.
 */

import neo4j from 'neo4j-driver';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/** @type {neo4j.Driver | null} */
let _driver = null;

/**
 * Returns the shared Neo4j driver instance, creating it on first call.
 *
 * @returns {neo4j.Driver}
 */
export function getDriver() {
  if (!_driver) {
    _driver = neo4j.driver(
      config.NEO4J_URI,
      neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
      {
        maxConnectionPoolSize: 50,
        logging: neo4j.logging.console('warn'),
      }
    );
  }
  return _driver;
}

/**
 * Closes the driver and resets the singleton.
 *
 * @returns {Promise<void>}
 */
export async function closeDriver() {
  if (_driver) {
    await _driver.close();
    _driver = null;
    logger.info('Neo4j driver closed');
  }
}

/**
 * Runs a Cypher read query and returns plain JS objects.
 *
 * @template T
 * @param {string} cypher - Parameterised Cypher string (no string interpolation)
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<T[]>}
 */
export async function readQuery(cypher, params = {}) {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => r.toObject());
  } finally {
    await session.close();
  }
}

/**
 * Runs a Cypher write query and returns plain JS objects.
 *
 * @template T
 * @param {string} cypher - Parameterised Cypher string (no string interpolation)
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<T[]>}
 */
export async function writeQuery(cypher, params = {}) {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => r.toObject());
  } finally {
    await session.close();
  }
}

/**
 * Convenience alias for writeQuery — used by route handlers that need
 * to run ad-hoc Cypher (e.g. the reset endpoint) without importing writeQuery directly.
 *
 * @param {string} cypherStr
 * @param {Record<string, unknown>} [params]
 * @returns {Promise<object[]>}
 */
export const cypher = writeQuery;
