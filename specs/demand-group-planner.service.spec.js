import { describe, it, expect, vi, beforeEach } from 'vitest';

// demand-group-planner.js destructures `const { UPDATE } = cds.ql` at its own
// require-time, so this spy must exist BEFORE that file is first required -
// same ordering constraint as jose in credential-store.client.spec.js, but
// cds.ql.UPDATE (unlike jose's frozen ESM exports) is a plain, configurable
// property, so vi.spyOn works directly on the real, shared @sap/cds module.
const cds = require('@sap/cds');
const updateSpy = vi.spyOn(cds.ql, 'UPDATE');

const implFn = require('../srv/demand-group-planner.js');

/**
 * The handler-registration function only calls this.on(...)/this.before(...)
 * synchronously - capturing those registrations gives us the real handler
 * functions to test directly, without a live db connection. What the
 * generic CAP+@cap-js/postgres CRUD handlers themselves do (including
 * partial-update semantics) is proven by the real Lakebase runs in
 * docs/design.md instead - out of scope for a unit test.
 */
async function registerHandlers() {
  const registrations = { on: {}, before: {} };
  const fakeThis = {
    entities: { DemandGroupPlanner: 'DemandGroupPlannerEntity' },
    on(event, _entity, handler) { registrations.on[event] = handler; },
    before(events, _entity, handler) {
      for (const event of Array.isArray(events) ? events : [events]) registrations.before[event] = handler;
    }
  };
  await implFn.call(fakeThis);
  return registrations;
}

describe('demand-group-planner service handlers (native @cap-js/postgres persistence)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('before CREATE', () => {
    it('generates an id when the incoming payload has none', async () => {
      const { before } = await registerHandlers();
      const req = { data: { demand_group: 'DG1', planner: 'Bob' } };

      before.CREATE(req);

      expect(req.data.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('leaves a client-supplied id untouched', async () => {
      const { before } = await registerHandlers();
      const req = { data: { id: 'explicit-id', demand_group: 'DG1', planner: 'Bob' } };

      before.CREATE(req);

      expect(req.data.id).toBe('explicit-id');
    });
  });

  describe('before READ/UPDATE', () => {
    it('is registered for both READ and UPDATE, not just one', async () => {
      const { before } = await registerHandlers();

      expect(before.READ).toBe(before.UPDATE);
    });

    it('merges a delete_flag exclusion into the query rather than replacing it', async () => {
      const { before } = await registerHandlers();
      const whereSpy = vi.fn();
      const req = { query: { where: whereSpy } };

      before.READ(req);

      expect(whereSpy).toHaveBeenCalledWith({ delete_flag: { '!=': 'Y' } });
    });
  });

  describe('DELETE', () => {
    it('soft-deletes via UPDATE...SET delete_flag, never a real row delete, and returns the id', async () => {
      const { on } = await registerHandlers();
      const setSpy = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      updateSpy.mockReturnValue({ set: setSpy });

      const result = await on.DELETE({ data: { id: '1' } });

      expect(updateSpy).toHaveBeenCalledWith('DemandGroupPlannerEntity');
      expect(setSpy).toHaveBeenCalledWith({ delete_flag: 'Y' });
      expect(setSpy.mock.results[0].value.where).toHaveBeenCalledWith({ id: '1' });
      expect(result).toBe('1');
    });
  });
});
