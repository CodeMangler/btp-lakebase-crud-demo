'use strict';

if (!process.env.VCAP_SERVICES) {
  // quiet: true suppresses dotenv's self-promotional console "tips" (see its
  // own lib/main.js TIPS array) - not a warning worth logging on every boot.
  try { require('dotenv').config({ quiet: true }); } catch { /* dotenv is a devDependency only */ }
}

const cds = require('@sap/cds');
const LOG = cds.log('server');

/**
 * @cap-js/postgres self-registers as the "db" service kind once installed -
 * no cds.requires.db entry needed in package.json. What it still needs is
 * connection credentials, which (unlike a normal BTP-provisioned Postgres
 * service) don't arrive via VCAP_SERVICES automatically for Lakebase - so
 * this resolves them the same way the raw-pg branch's server.js did (PGWS
 * destination + Credential Store when deployed, plain env vars locally) and
 * hands them to CAP before it connects, via cds.on('bootstrap').
 */
async function resolveCredentials() {
  return process.env.VCAP_SERVICES ? resolveViaDestination() : resolveViaEnv();
}

function resolveViaEnv() {
  const { LB_HOST, LB_PORT, LB_DATABASE, LB_USER, LB_PASSWORD } = process.env;
  if (!LB_HOST || !LB_USER || !LB_PASSWORD) {
    LOG.error('Missing LB_HOST/LB_USER/LB_PASSWORD env vars - see .env.example');
    return null;
  }
  return {
    host: LB_HOST,
    port: Number(LB_PORT) || 5432,
    database: LB_DATABASE || 'databricks_postgres',
    user: LB_USER,
    password: LB_PASSWORD,
    ssl: { rejectUnauthorized: true }
  };
}

async function resolveViaDestination() {
  const connectivity = require('@sap-cloud-sdk/connectivity');
  const { readPasswordCredential } = require('./common/credential-store.client');

  try {
    const destination = await connectivity.getDestination({ destinationName: 'PGWS' });
    if (!destination) {
      LOG.error('PGWS destination not found');
      return null;
    }

    const { host, port, database, username, CRED_STORE_NAME } = destination.originalProperties;
    const credstoreBinding = JSON.parse(process.env.VCAP_SERVICES).credstore[0].credentials;
    const credential = await readPasswordCredential(credstoreBinding, CRED_STORE_NAME, 'PGWS');

    return {
      host,
      port: Number(port) || 5432,
      database: database || 'databricks_postgres',
      user: username,
      password: credential.value,
      ssl: { rejectUnauthorized: true }
    };
  } catch (error) {
    LOG.error('Failed to resolve Lakebase connection via PGWS destination:', error);
    return null;
  }
}

cds.on('bootstrap', async () => {
  const credentials = await resolveCredentials();
  if (!credentials) {
    LOG.error('No Lakebase credentials resolved - the db connection will fail');
    return;
  }
  cds.env.requires.db.credentials = credentials;
  LOG.info(`Configured Lakebase credentials via ${process.env.VCAP_SERVICES ? 'PGWS destination' : 'local env vars'}`);
});

module.exports = cds.server;
