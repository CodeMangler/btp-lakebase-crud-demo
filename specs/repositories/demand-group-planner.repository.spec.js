import { describe, it, expect, vi, beforeEach } from 'vitest';
import repo from '../../srv/repositories/demand-group-planner.repository.js';

/**
 * These specs exercise the actual SQL text and parameters sent to pg, plus
 * the connection-lifecycle guarantees (client always released), against a
 * fake pool/client. No real database - that's what the manual Lakebase
 * smoke tests (see docs/design.md) cover. The value here is locking in the
 * two invariants that actually broke in practice during development:
 *   - update() must COALESCE omitted fields, not null them out (a real bug
 *     found via a live PATCH request - see git history)
 *   - delete is always soft (UPDATE delete_flag), never a real DELETE
 */

function makeFakeClient(queryImpl) {
  return { query: vi.fn(queryImpl), release: vi.fn() };
}

beforeEach(() => {
  global.pool = { connect: vi.fn() };
});

describe('findAll', () => {
  it('selects only non-deleted rows, ordered by demand_group', async () => {
    const client = makeFakeClient(() => ({ rows: [{ id: '1' }] }));
    global.pool.connect.mockResolvedValue(client);

    const result = await repo.findAll();

    expect(result).toEqual([{ id: '1' }]);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/delete_flag <> 'Y'/);
    expect(sql).toMatch(/ORDER BY demand_group/);
    expect(params ?? []).toEqual([]);
  });

  it('releases the client even if the query throws', async () => {
    const client = makeFakeClient(() => { throw new Error('connection reset'); });
    global.pool.connect.mockResolvedValue(client);

    await expect(repo.findAll()).rejects.toThrow('connection reset');
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('findOne', () => {
  it('filters by id and excludes soft-deleted rows', async () => {
    const client = makeFakeClient(() => ({ rows: [{ id: 'abc', demand_group: 'DG1' }] }));
    global.pool.connect.mockResolvedValue(client);

    const result = await repo.findOne('abc');

    expect(result).toEqual({ id: 'abc', demand_group: 'DG1' });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1 AND delete_flag <> 'Y'/);
    expect(params).toEqual(['abc']);
  });

  it('returns undefined when no row matches (not an error)', async () => {
    const client = makeFakeClient(() => ({ rows: [] }));
    global.pool.connect.mockResolvedValue(client);

    expect(await repo.findOne('missing')).toBeUndefined();
  });
});

describe('create', () => {
  it('inserts with a generated id and the same username for created_by/modified_by', async () => {
    const client = makeFakeClient((sql) => {
      if (sql.startsWith('INSERT')) return { rows: [] };
      return { rows: [{ id: 'generated-id', demand_group: 'DG1', planner: 'Alice' }] };
    });
    global.pool.connect.mockResolvedValue(client);

    const result = await repo.create({ demand_group: 'DG1', planner: 'Alice' }, 'planner_user');

    const [insertSql, insertParams] = client.query.mock.calls[0];
    expect(insertSql).toMatch(/INSERT INTO demand_group_planner/);
    // id, demand_group, planner, created_by=modified_by
    expect(insertParams[1]).toBe('DG1');
    expect(insertParams[2]).toBe('Alice');
    expect(insertParams[3]).toBe('planner_user');
    expect(insertParams[0]).toMatch(/^[0-9a-f-]{36}$/); // a real UUID, not a placeholder

    // create() reads the row back via findOne() using the same id it just inserted
    const [selectSql, selectParams] = client.query.mock.calls[1];
    expect(selectSql).toMatch(/WHERE id = \$1/);
    expect(selectParams).toEqual([insertParams[0]]);

    expect(result).toEqual({ id: 'generated-id', demand_group: 'DG1', planner: 'Alice' });
  });

  it('releases the client even if the insert throws', async () => {
    const client = makeFakeClient(() => { throw new Error('unique violation'); });
    global.pool.connect.mockResolvedValue(client);

    await expect(repo.create({ demand_group: 'DG1', planner: 'Alice' }, 'u')).rejects.toThrow();
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('update', () => {
  it('sends both fields when both are provided', async () => {
    const client = makeFakeClient((sql) => (sql.startsWith('UPDATE') ? { rows: [] } : { rows: [{ id: '1' }] }));
    global.pool.connect.mockResolvedValue(client);

    await repo.update('1', { demand_group: 'DG2', planner: 'Bob' }, 'u');

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/COALESCE\(\$2, demand_group\)/);
    expect(sql).toMatch(/COALESCE\(\$3, planner\)/);
    expect(params).toEqual(['1', 'DG2', 'Bob', 'u']);
  });

  // Regression: a real PATCH request in manual testing sent only
  // {"planner": "..."} and the old (buggy) implementation wrote a literal
  // NULL into demand_group, tripping its NOT NULL constraint. COALESCE with
  // a null parameter is what makes a partial update actually partial.
  it('preserves the omitted field on a partial update instead of nulling it', async () => {
    const client = makeFakeClient((sql) => (sql.startsWith('UPDATE') ? { rows: [] } : { rows: [{ id: '1' }] }));
    global.pool.connect.mockResolvedValue(client);

    await repo.update('1', { planner: 'Bob' }, 'u'); // demand_group omitted entirely

    const [, params] = client.query.mock.calls[0];
    expect(params).toEqual(['1', null, 'Bob', 'u']); // null -> COALESCE keeps the DB value
  });

  it('excludes soft-deleted rows from being updated', async () => {
    const client = makeFakeClient((sql) => (sql.startsWith('UPDATE') ? { rows: [] } : { rows: [{ id: '1' }] }));
    global.pool.connect.mockResolvedValue(client);

    await repo.update('1', { planner: 'Bob' }, 'u');

    const [sql] = client.query.mock.calls[0];
    expect(sql).toMatch(/AND delete_flag <> 'Y'/);
  });
});

describe('softDelete', () => {
  it('performs an UPDATE, never a real DELETE', async () => {
    const client = makeFakeClient(() => ({ rows: [] }));
    global.pool.connect.mockResolvedValue(client);

    await repo.softDelete('1', 'u');

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/^\s*UPDATE demand_group_planner SET delete_flag = 'Y'/);
    expect(sql).not.toMatch(/^\s*DELETE/);
    expect(params).toEqual(['1', 'u']);
  });

  it('releases the client even if the update throws', async () => {
    const client = makeFakeClient(() => { throw new Error('deadlock'); });
    global.pool.connect.mockResolvedValue(client);

    await expect(repo.softDelete('1', 'u')).rejects.toThrow('deadlock');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
