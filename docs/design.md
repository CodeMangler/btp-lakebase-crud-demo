# Lakebase CRUD Spike — Design

## Purpose

Prove out CRUD from a SAPUI5 app, through BTP, against a Databricks Lakebase Postgres
table — using a trial BTP account and a trial Databricks account. The entity is modeled
on a real request from the NVIDIA EDM Capacity Planning engagement (see Provenance below),
but this project is a standalone technology spike, disconnected from that engagement's
actual infrastructure, data, or trial-account credentials.

## Provenance

Modeled after the "Manufacturing Flow planner-data table" requirement Jagriti Singh raised
in the Capacity Planning engagement — a flat `demand group -> planner` mapping, currently
maintained in Anaplan, that the team agreed to bring onto a Postgres-backed screen.
Source: `capacity-planning-standup-2026-09-04.md` and that day's daily status, in the Atlas
repository (`work/projects/nvidia-edm-delivery-enablement/`). The schema below approximates
that table; it is not the literal production schema.

Structural precedent for "build the table before the screen": the `meownermapping` app
(table `tbl_stg_cp_capacity_grp_planner_mapping`), documented in
`capacity-planning/apps-data-flow.md` §6 of the same Atlas project.

## Entity

Table `demand_group_planner`:

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36), PK | surrogate key |
| `demand_group` | varchar(100), not null | Anaplan demand group code |
| `planner` | varchar(100), not null | assigned planner |
| `delete_flag` | varchar(1), default `'N'` | soft delete only — never a hard `DELETE` |
| `created_by` | varchar(100) | audit |
| `created_date` | timestamp, default `now()` | audit |
| `modified_by` | varchar(100) | audit |
| `modified_date` | timestamp, default `now()` | audit |

## Approach

Lakebase Postgres supports a native, non-expiring Postgres password role (confirmed
working against the real trial project — see Deployment runbook below), alongside a
separate 60-minute OAuth-token mode. Password-role auth means the connection mechanics are
just standard Postgres — no token-minting or refresh logic needed regardless of which
architecture wraps it.

**Chosen approach — mirror `capacityplanningscreens` exactly, not `@cap-js/postgres`:**
CAP is used purely as the OData protocol + auth layer; all persistence is hand-written SQL
via the raw `pg` driver, matching the reference project's pattern
(Atlas `capacity-planning/architecture.md` §3.1–3.2):

1. A BTP Destination (`PGWS`, same name the reference project uses) holds the Lakebase
   host, port, and database as custom "Additional Properties" — resolved at boot via
   `@sap-cloud-sdk/connectivity`'s `getDestination()`, exactly as `capacityplanningscreens/srv/server.js`
   does today.
2. The `app_user` password goes into Credential Store if the trial account has it
   entitled, referenced from the destination by a `CRED_STORE_NAME` property (per the
   reference project); otherwise directly as a destination property, flagged as a
   spike-only shortcut — same fallback the reference project's own pattern implies.
3. `srv/server.js` builds a `pg.Pool` from those resolved values at startup and stores it
   on `global.pool`, same as the reference project.
4. `srv/demand-group-planner.js` wires CDS handlers (`this.on('READ'/'CREATE'/'UPDATE'/'DELETE', ...)`)
   that call a small `srv/repositories/demand-group-planner.repository.js`, which pulls a
   client from `global.pool` and runs plain parameterized SQL — the same repository-over-pool
   shape as `resource.repository.js` in the reference project, without that project's
   config-driven multi-screen dispatch, Excel import/export, or CM-specific role branching,
   none of which apply to this single-entity spike.
5. `DELETE` maps to an `UPDATE ... SET delete_flag = 'Y'`, never a real row delete, same
   rule the reference project follows.

**Rejected:**
- **`@cap-js/postgres` native binding** — less code, but intentionally not used here: the
  goal is to rehearse the same raw-SQL-over-destination-secrets pattern the real
  `capacityplanningscreens` project uses, not CAP's own ORM path.
- **OAuth token-minting** (service principal + two-call REST credential exchange) — the
  simpler password role covers this spike; nothing here needs it.
- **Plain Express + `pg`, no CAP** — pushes CRUD wiring onto the UI5 side by hand instead
  of OData binding.

## Project structure

```
btp-lakebase-crud-demo/
  app/ui.demandgroupplanner/webapp/          one Fiori Elements List Report/Object Page, OData V4
  srv/
    demand-group-planner.cds                 entity + service definition
    demand-group-planner.js                  CDS handlers (READ/CREATE/UPDATE/DELETE), calls the repository
    server.js                                resolves PGWS destination -> pg.Pool on global.pool, at boot
    common/pg.repository.js                  query() helper, same shape as the reference project's
    repositories/demand-group-planner.repository.js   plain parameterized SQL over global.pool
  mta.yaml, xs-security.json, package.json
  README.md                                  setup instructions, pointing back to this doc
```

## Data flow

UI5 (OData V4, SmartTable/SmartFields) -> approuter -> `srv-api` destination (auto-created
by `mta.yaml`, `HTML5.ForwardAuthToken: true`) -> CAP service handlers -> repository ->
`global.pool` (raw `pg`) -> Lakebase. Auth: CAP mocked user for local `cds watch`; XSUAA in
the deployed environment.

## Error handling

- CAP's default OData error responses cover mandatory-field violations
  (`demand_group`, `planner`).
- One custom handler maps `DELETE` to an `UPDATE ... SET delete_flag = 'Y'` — never a real
  row delete — consistent with the "delete is always soft" rule documented for this table
  family in Atlas's `manufacturing-flow-requirements.md`.
- Read queries filter `delete_flag <> 'Y'` by default.

## Testing

Local CRUD smoke test against a Dockerized Postgres via `cds watch`, before ever touching
the real Lakebase trial instance — keeps the inner dev loop off the trial account's pace
and quota. Once verified locally, re-point the same connection module at the real Lakebase
instance for an end-to-end deployed check.

## Deployment runbook — Databricks trial account

Completed and verified directly against the real trial workspace.

1. **Create the project.** Top-right **Apps switcher → Lakebase Postgres → Autoscaling**
   tab → **New project**. Name it, pick a Postgres version. This auto-creates a
   `production` branch, a default `databricks_postgres` database, and a compute endpoint.
2. **Create a password-authenticated role.** Project → **Roles & Databases** (left nav) →
   **Add role** → **Password** tab → name it (e.g. `app_user`), set its permissions in the
   same wizard, **Add**. Copy the generated password immediately — it is shown once. (If
   this is blocked, there is a project-level password-connections toggle to enable first.)
3. **Get connection details.** Connect dialog → select the `app_user` role from the
   dropdown → copy host (port is always 5432, database is `databricks_postgres`).
4. **Create the schema**, via SQL Editor:
   ```sql
   CREATE TABLE demand_group_planner (
     id            varchar(36) PRIMARY KEY,
     demand_group  varchar(100) NOT NULL,
     planner       varchar(100) NOT NULL,
     delete_flag   varchar(1) DEFAULT 'N',
     created_by    varchar(100),
     created_date  timestamp DEFAULT now(),
     modified_by   varchar(100),
     modified_date timestamp DEFAULT now()
   );
   GRANT CONNECT, USAGE, SELECT, INSERT, UPDATE, DELETE
     ON DATABASE databricks_postgres TO app_user;
   ```
5. **Verified:** the resulting `postgresql://app_user:<password>@<host>/databricks_postgres?sslmode=require`
   connection string works from an external Postgres client — confirmed against the real
   trial project. This is exactly what `srv/lib/db.js`'s CDS `db` binding needs.

## Deployment runbook — BTP trial account

Completed so far:

1. **Cloud Foundry confirmed enabled** on the trial subaccount.
2. **`PGWS` destination created** by hand (Connectivity -> Destinations): `Type: HTTP`,
   `ProxyType: Internet`, `Authentication: NoAuthentication`, Additional Properties for
   Lakebase `host`, `port` (5432), `database` (`databricks_postgres`), `username`
   (`app_user`), and `CRED_STORE_NAME` pointing at the `lakebase` namespace.
3. **Credential Store service instance created** — actual name is
   **`credential-store`**, not `cred-store` (corrects the placeholder name used earlier in
   this doc and in the reference project's own naming) — with the `app_user` password
   stored as a Password-type credential named `PGWS` in the `lakebase` namespace, per the
   Credential Store deployment guide. `mta.yaml` must reference this exact instance name.

Remaining:

4. **Check entitlements** (Subaccount -> Entitlements -> Configure Entitlements):
   Destination (`lite`), Connectivity (`lite`), XSUAA (`application`), HTML5 Application
   Repository (`app-host` + `app-runtime`) — Credential Store is already provisioned.
5. **Install tooling**: `npm i -g @sap/cds-dk`, `mbt` (already present locally), and the
   `cf` CLI (not yet installed locally — needed before deploy).
6. `cf login -a <trial CF API endpoint> -o <org> -s dev`.
7. **Build and deploy**: `npm run build && npm run deploy` (`mbt build` + `cf deploy`).
   Provisions `srv-api` and `ui5` destinations (via the managed destination service
   instance, `HTML5Runtime_enabled: true` — same mechanism `capacityplanningscreens` uses
   to serve its UI5 apps without a separate approuter module), XSUAA, and the HTML5 App
   Repository binding, all from `mta.yaml`. Binds the `PGWS` destination and
   `credential-store` service to the `srv` module.
8. **Verify end-to-end**: open the deployed app's HTML5 runtime URL, confirm the mocked or
   trial-IdP login, and exercise Create/Read/Update/Delete against `demand_group_planner`.
