# Lakebase CRUD Spike

CRUD from a SAPUI5 app, through BTP, against a Databricks Lakebase Postgres table -
architecture mirrors `capacityplanningscreens` (CAP as OData/auth layer only, raw `pg`
driver, BTP Destination + Credential Store for connection secrets). Full design and the
verified Databricks/BTP setup runbook: [`docs/design.md`](docs/design.md).

## Run locally

No BTP services needed for either option below - `srv/server.js` falls back to plain env
vars when `VCAP_SERVICES` isn't present. Two ways to point those env vars:

### Option A - local Docker Postgres (fast inner loop, no trial-account usage)

```bash
npm install
npm run db:up                        # starts Postgres in Docker, loads schema + seed data
cp .env.docker.example .env
npm run watch
```

`npm run db:down` stops it (keeps data); `npm run db:reset` wipes and reloads from
`db/local/init/*.sql` (schema + the same 4 seed rows as Lakebase). Colima users: if the
project directory isn't under `$HOME`, Colima's VM won't mount it by default and the init
scripts will silently not run (`docker exec <container> ls /docker-entrypoint-initdb.d/`
comes back empty) - add the parent directory under Colima's `mounts:` config
(`~/.colima/default/colima.yaml` or wherever `$COLIMA_HOME` points) and `colima restart`.
Docker Desktop/Podman Desktop don't have this restriction.

### Option B - the real Lakebase instance

```bash
npm install
cp .env.example .env   # fill in LB_PASSWORD
npm run watch
```

Both start `cds watch` with a mocked user (`planner`, role `Planner` - see `package.json`
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
