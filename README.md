# Lakebase CRUD Spike (branch: `cap-js-postgres-alternative`)

CRUD from a SAPUI5 app, through BTP, against a Databricks Lakebase Postgres table. Same
entity and UI5 app as `main`, but persistence goes through CAP's native `@cap-js/postgres`
plugin instead of a hand-written repository over raw `pg` - see
[`docs/design.md`](docs/design.md#alternative-approach---cap-jspostgres-branch-cap-js-postgres-alternative)
for the full comparison and what changed.

## Run locally against the real Lakebase instance

No BTP services needed for this loop - `srv/server.js` falls back to plain env vars when
`VCAP_SERVICES` isn't present.

```bash
npm install
cp .env.example .env   # fill in LB_PASSWORD
npx cds deploy \
  --credentials.host=$LB_HOST --credentials.port=$LB_PORT \
  --credentials.database=$LB_DATABASE --credentials.user=$LB_USER \
  --credentials.password=$LB_PASSWORD    # one-time: creates CAP's own schema in Lakebase
npm run watch
```

`cds deploy` doesn't go through `srv/server.js`'s bootstrap hook (that only runs for
`cds serve`/`cds watch`), so it needs credentials passed directly - see `docs/design.md`
for the exact env-var-based invocation actually used during verification.

Opens `cds watch` with a mocked user (`planner`, role `Planner` - see `package.json`
`cds.requires.auth`).

## Deploy to BTP

Prerequisites (see `docs/design.md` for the full runbook): `PGWS` destination and the
`credential-store` service instance (with the `PGWS` password credential in the `lakebase`
namespace) must already exist in the target subaccount/space - this MTA does not create
them (`credential-store` is declared as `existing-service`, same pattern
`capacityplanningscreens` uses for its own `cred-store`).

```bash
npm i -g @sap/cds-dk    # if not already installed
cf login -a <trial CF API endpoint> -o <org> -s dev
npm run build           # mbt build -> mta_archives/archive.mtar
npm run deploy          # cf deploy
```

Then open the deployed app through its HTML5 runtime URL (shown in the `cf deploy` output,
under the `btp-lakebase-crud-demo-destination-content` / HTML5 repo host) and exercise
Create/Read/Update/Delete.

## Project layout

```
app/ui.demandgroupplanner/   freestyle UI5 app, OData V4, one Table with Add/Delete/Save
                             (unchanged from main - same OData contract)
db/
  schema.cds                 persisted entity, audit fields via @cds.on.insert/update
srv/
  demand-group-planner.cds   service projection over db/schema.cds
  demand-group-planner.js    3 small hooks (id generation, soft-delete, read/update filter) -
                             generic CAP+@cap-js/postgres handlers do the rest
  server.js                  resolves PGWS/Credential-Store (or env var) credentials,
                              hands them to cds.env.requires.db.credentials at boot
  common/
    credential-store.client.js   mTLS + JWE-encrypted Credential Store REST client
                                  (identical to main - still needed to fetch the password)
mta.yaml, xs-security.json   BTP deployment descriptor + XSUAA scopes
```
