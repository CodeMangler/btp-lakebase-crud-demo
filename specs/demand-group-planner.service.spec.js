import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on the real, shared repository module object rather than vi.mock()-
// replacing it: demand-group-planner.js accesses it via `repo.findOne(...)`
// property access (not destructured at require time), and since both this
// file and the source file's require() resolve to the same cached module
// object, spying here is visible there too - no ESM/CJS interop involved.
const repo = require('../srv/repositories/demand-group-planner.repository.js');
vi.spyOn(repo, 'findOne');
vi.spyOn(repo, 'findAll');
vi.spyOn(repo, 'create');
vi.spyOn(repo, 'update');
vi.spyOn(repo, 'softDelete');

// cds.service.impl is identity in CAP's own source (lib/index.js: `impl: fn
// => fn`, verified directly in node_modules) - using the real package here
// rather than mocking it, since mocking it would just reimplement the same
// one-line fact with more moving parts.
const implFn = require('../srv/demand-group-planner.js');

/**
 * The handler-registration function only calls this.on(...) synchronously
 * (it's declared async purely per CAP convention, not because it awaits
 * anything itself) - capturing those registrations gives us the real
 * handler functions to test directly, without spinning up a CDS server.
 */
async function registerHandlers() {
  const handlers = {};
  const fakeThis = {
    entities: { DemandGroupPlanner: 'DemandGroupPlannerEntity' },
    on(event, _entity, handler) { handlers[event] = handler; }
  };
  await implFn.call(fakeThis);
  return handlers;
}

describe('demand-group-planner service handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('READ without an id lists all rows via findAll', async () => {
    const handlers = await registerHandlers();
    repo.findAll.mockResolvedValue([{ id: '1' }]);

    const result = await handlers.READ({ data: {}, user: { id: 'planner1' } });

    expect(repo.findAll).toHaveBeenCalled();
    expect(repo.findOne).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: '1' }]);
  });

  it('READ with an id fetches that one row via findOne, not findAll', async () => {
    const handlers = await registerHandlers();
    repo.findOne.mockResolvedValue({ id: '42' });

    const result = await handlers.READ({ data: { id: '42' }, user: { id: 'planner1' } });

    expect(repo.findOne).toHaveBeenCalledWith('42');
    expect(repo.findAll).not.toHaveBeenCalled();
    expect(result).toEqual({ id: '42' });
  });

  it('CREATE forwards the payload and the resolved username', async () => {
    const handlers = await registerHandlers();
    repo.create.mockResolvedValue({ id: 'new' });

    await handlers.CREATE({ data: { demand_group: 'DG1', planner: 'Bob' }, user: { id: 'planner1' } });

    expect(repo.create).toHaveBeenCalledWith({ demand_group: 'DG1', planner: 'Bob' }, 'planner1');
  });

  it('UPDATE forwards the id, the full payload, and the username as separate arguments', async () => {
    const handlers = await registerHandlers();
    repo.update.mockResolvedValue({ id: '1' });

    await handlers.UPDATE({ data: { id: '1', planner: 'Carol' }, user: { id: 'planner1' } });

    expect(repo.update).toHaveBeenCalledWith('1', { id: '1', planner: 'Carol' }, 'planner1');
  });

  it('DELETE soft-deletes via the repository and returns the deleted id', async () => {
    const handlers = await registerHandlers();
    repo.softDelete.mockResolvedValue(undefined);

    const result = await handlers.DELETE({ data: { id: '1' }, user: { id: 'planner1' } });

    expect(repo.softDelete).toHaveBeenCalledWith('1', 'planner1');
    expect(result).toBe('1');
  });

  it('falls back to "unknown" for an anonymous user instead of writing "anonymous" as an audit value', async () => {
    const handlers = await registerHandlers();
    repo.create.mockResolvedValue({});

    await handlers.CREATE({ data: { demand_group: 'DG1', planner: 'Bob' }, user: { id: 'anonymous' } });

    expect(repo.create).toHaveBeenCalledWith(expect.anything(), 'unknown');
  });

  it('falls back to "unknown" when req.user is missing entirely, rather than throwing', async () => {
    const handlers = await registerHandlers();
    repo.create.mockResolvedValue({});

    await handlers.CREATE({ data: { demand_group: 'DG1', planner: 'Bob' } });

    expect(repo.create).toHaveBeenCalledWith(expect.anything(), 'unknown');
  });
});
