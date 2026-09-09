-- Identical DDL to what's deployed on the real Lakebase instance
-- (see docs/design.md, "Deployment runbook — Databricks trial account").
-- Keep these in sync by hand if one changes - there's no migration tooling
-- wired up yet on this branch.

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
