import { describe, it, expect, vi } from 'vitest';
import { query } from '../../srv/common/pg.repository.js';

describe('query', () => {
  it('passes sql and params through to the client and returns only rows', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ a: 1 }], rowCount: 1 }) };

    const result = await query(client, 'SELECT * FROM t WHERE id = $1', ['x']);

    expect(client.query).toHaveBeenCalledWith('SELECT * FROM t WHERE id = $1', ['x']);
    expect(result).toEqual([{ a: 1 }]);
  });

  it('defaults params to an empty array when omitted', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await query(client, 'SELECT 1');

    expect(client.query).toHaveBeenCalledWith('SELECT 1', []);
  });
});
