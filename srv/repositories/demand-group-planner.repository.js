'use strict';

const crypto = require('crypto');
const { query } = require('../common/pg.repository');

const TABLE = 'demand_group_planner';
const ACTIVE_COLUMNS = 'id, demand_group, planner, created_by, created_date, modified_by, modified_date';

async function findAll() {
  const client = await global.pool.connect();
  try {
    return await query(
      client,
      `SELECT ${ACTIVE_COLUMNS} FROM ${TABLE} WHERE delete_flag <> 'Y' ORDER BY demand_group`
    );
  } finally {
    client.release();
  }
}

async function findOne(id) {
  const client = await global.pool.connect();
  try {
    const rows = await query(
      client,
      `SELECT ${ACTIVE_COLUMNS} FROM ${TABLE} WHERE id = $1 AND delete_flag <> 'Y'`,
      [id]
    );
    return rows[0];
  } finally {
    client.release();
  }
}

async function create({ demand_group, planner }, username) {
  const client = await global.pool.connect();
  try {
    const id = crypto.randomUUID();
    await query(
      client,
      `INSERT INTO ${TABLE} (id, demand_group, planner, created_by, modified_by)
       VALUES ($1, $2, $3, $4, $4)`,
      [id, demand_group, planner, username]
    );
    return findOne(id);
  } finally {
    client.release();
  }
}

// Partial update (PATCH sends only changed fields) - COALESCE keeps any
// omitted column at its current value rather than nulling it out.
async function update(id, { demand_group, planner }, username) {
  const client = await global.pool.connect();
  try {
    await query(
      client,
      `UPDATE ${TABLE}
       SET demand_group = COALESCE($2, demand_group),
           planner = COALESCE($3, planner),
           modified_by = $4,
           modified_date = now()
       WHERE id = $1 AND delete_flag <> 'Y'`,
      [id, demand_group ?? null, planner ?? null, username]
    );
    return findOne(id);
  } finally {
    client.release();
  }
}

// Soft delete only - never a real row delete. Matches the standing rule for
// this table family (see docs/design.md, Error handling).
async function softDelete(id, username) {
  const client = await global.pool.connect();
  try {
    await query(
      client,
      `UPDATE ${TABLE} SET delete_flag = 'Y', modified_by = $2, modified_date = now() WHERE id = $1`,
      [id, username]
    );
  } finally {
    client.release();
  }
}

module.exports = { findAll, findOne, create, update, softDelete };
