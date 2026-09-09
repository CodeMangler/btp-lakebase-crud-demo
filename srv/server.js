'use strict';

if (!process.env.VCAP_SERVICES) {
  // quiet: true suppresses dotenv's self-promotional console "tips" (see its
  // own lib/main.js TIPS array) - not a warning worth logging on every boot.
  try { require('dotenv').config({ quiet: true }); } catch { /* dotenv is a devDependency only */ }
}

const cds = require('@sap/cds');
const { Pool } = require('pg');
const LOG = cds.log('server');

/**
 * Resolves Lakebase connection details and opens a shared pg.Pool on
 * global.pool, exactly like capacityplanningscreens' srv/server.js does for
 * its own PGWS destination.
 *
 * Two paths:
 *  - Deployed (VCAP_SERVICES present): destination "PGWS" for host/port/database/
 *    username, Credential Store (bound service "credstore") for the password.
 *  - Local dev (`cds watch`): plain env vars, so the inner dev loop can hit the
 *    real Lakebase project directly without needing BTP destination/connectivity
 *    services bound locally. See .env.example.
 */
async function connect() {
  if (process.env.VCAP_SERVICES) {
    return connectViaDestination();
  }
  return connectViaEnv();
}

async function connectViaEnv() {
  const { LB_HOST, LB_PORT, LB_DATABASE, LB_USER, LB_PASSWORD, LB_SSL } = process.env;
  if (!LB_HOST || !LB_USER || !LB_PASSWORD) {
    LOG.error('Missing LB_HOST/LB_USER/LB_PASSWORD env vars - see .env.example');
    return;
  }
  // Real Lakebase requires TLS; a local Docker Postgres (see docker-compose.yml)
  // isn't configured for it - LB_SSL=false switches this off for that case.
  // Defaults to true so the real-Lakebase path stays secure without every
  // .env needing to say so explicitly.
  const sslEnabled = LB_SSL !== 'false';
  global.pool = new Pool({
    host: LB_HOST,
    port: Number(LB_PORT) || 5432,
    database: LB_DATABASE || 'databricks_postgres',
    user: LB_USER,
    password: LB_PASSWORD,
    ssl: sslEnabled ? { rejectUnauthorized: true } : false,
    max: 5
  });
  LOG.info(`Connected to Postgres via local env vars (${LB_HOST}, ssl: ${sslEnabled})`);
}

async function connectViaDestination() {
  const connectivity = require('@sap-cloud-sdk/connectivity');
  const { readPasswordCredential } = require('./common/credential-store.client');

  try {
    const destination = await connectivity.getDestination({ destinationName: 'PGWS' });
    if (!destination) {
      LOG.error('PGWS destination not found');
      return;
    }

    const { host, port, database, username, CRED_STORE_NAME } = destination.originalProperties;
    const credstoreBinding = JSON.parse(process.env.VCAP_SERVICES).credstore[0].credentials;
    const credential = await readPasswordCredential(credstoreBinding, CRED_STORE_NAME, 'PGWS');

    global.pool = new Pool({
      host,
      port: Number(port) || 5432,
      database: database || 'databricks_postgres',
      user: username,
      password: credential.value,
      ssl: { rejectUnauthorized: true },
      max: 5
    });
    LOG.info(`Connected to Lakebase via PGWS destination (namespace: ${CRED_STORE_NAME})`);
  } catch (error) {
    LOG.error('Failed to resolve Lakebase connection via PGWS destination:', error);
  }
}

connect();

module.exports = cds.server;
