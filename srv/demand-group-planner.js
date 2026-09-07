'use strict';

const cds = require('@sap/cds');
const crypto = require('crypto');
const { UPDATE } = cds.ql;

module.exports = cds.service.impl(async function () {
  const { DemandGroupPlanner } = this.entities;

  // Generic CAP+@cap-js/postgres handlers do the actual READ/CREATE/UPDATE
  // SQL - including correct partial-update semantics on UPDATE, which the
  // raw-pg branch had to hand-roll with COALESCE. What's left here is the
  // behavior that's specific to this table, not generic to CAP: a
  // client-generated id (no db-side default), and soft delete.

  this.before('CREATE', DemandGroupPlanner, (req) => {
    req.data.id = req.data.id || crypto.randomUUID();
  });

  // Soft delete only - never a real row delete. Matches the standing rule
  // for this table family (see docs/design.md, Error handling).
  this.on('DELETE', DemandGroupPlanner, async (req) => {
    await UPDATE(DemandGroupPlanner).set({ delete_flag: 'Y' }).where({ id: req.data.id });
    return req.data.id;
  });

  // Exclude soft-deleted rows from being read or edited. req.query.where(...)
  // merges an additional AND condition into whatever filter/key the incoming
  // request already carries, rather than replacing it.
  this.before(['READ', 'UPDATE'], DemandGroupPlanner, (req) => {
    req.query.where({ delete_flag: { '!=': 'Y' } });
  });
});
