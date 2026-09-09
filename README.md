# Lakebase CRUD Spike

CRUD from a SAPUI5 app, through BTP, against a Databricks Lakebase Postgres table -
architecture mirrors `capacityplanningscreens` (CAP as OData/auth layer only, raw `pg`
driver, BTP Destination + Credential Store for connection secrets). Full design and the
verified Databricks/BTP setup runbook: [`docs/design.md`](docs/design.md).

## Run locally against the real Lakebase instance

No BTP services needed for this loop - `srv/server.js` falls back to plain env vars when
`VCAP_SERVICES` isn't present.

```bash
npm install
cp .env.example .env   # fill in LB_PASSWORD
npm run watch
```

Opens `cds watch` with a mocked user (`planner`, role `Planner` - see `package.json`
`cds.requires.auth`). Test data for `demand_group_planner` was seeded directly via `psql`
during setup.

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
Create/Read/Update/Delete against `demand_group_planner`.

## Project layout

```
app/ui.demandgroupplanner/   freestyle UI5 app, OData V4, one Table with Add/Delete/Save
srv/
  demand-group-planner.cds   entity + service definition
  demand-group-planner.js    CDS handlers -> repository
  server.js                  PGWS destination + Credential Store -> pg.Pool, at boot
  common/
    pg.repository.js         query() helper
    credential-store.client.js   mTLS + JWE-encrypted Credential Store REST client
  repositories/
    demand-group-planner.repository.js   plain parameterized SQL, soft-delete only
mta.yaml, xs-security.json   BTP deployment descriptor + XSUAA scopes
```
