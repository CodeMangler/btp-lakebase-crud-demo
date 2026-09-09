'use strict';

/**
 * Thin wrapper around a pg client/pool query, matching the shape used by the
 * capacityplanningscreens reference project's srv/common/pg.repository.js.
 */
async function query(client, sqlText, params = []) {
  const result = await client.query(sqlText, params);
  return result.rows;
}

module.exports = { query };
