'use strict';

const cds = require('@sap/cds');
const repo = require('./repositories/demand-group-planner.repository');

module.exports = cds.service.impl(async function () {
  const { DemandGroupPlanner } = this.entities;

  const username = (req) => req.user && req.user.id !== 'anonymous' ? req.user.id : 'unknown';

  this.on('READ', DemandGroupPlanner, async (req) => {
    if (req.data.id) return repo.findOne(req.data.id);
    return repo.findAll();
  });

  this.on('CREATE', DemandGroupPlanner, async (req) => {
    return repo.create(req.data, username(req));
  });

  this.on('UPDATE', DemandGroupPlanner, async (req) => {
    return repo.update(req.data.id, req.data, username(req));
  });

  this.on('DELETE', DemandGroupPlanner, async (req) => {
    await repo.softDelete(req.data.id, username(req));
    return req.data.id;
  });
});
