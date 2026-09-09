-- Same rows originally seeded into the real Lakebase table, for parity
-- between the two environments during local development.

INSERT INTO demand_group_planner (id, demand_group, planner, created_by, modified_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 'DGCQINSP',  'Asha Gottipati',       'seed', 'seed'),
  ('22222222-2222-2222-2222-222222222222', 'DGPCBEAST', 'Sairam Padarthi',      'seed', 'seed'),
  ('33333333-3333-3333-3333-333333333333', 'DGPCBWEST', 'Mithun Pattankar',     'seed', 'seed'),
  ('44444444-4444-4444-4444-444444444444', 'DGICT',     'Lakshmi Kanth Indoori','seed', 'seed');
