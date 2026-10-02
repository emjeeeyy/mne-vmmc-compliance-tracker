/**
 * Minimal stand-in for a `@supabase/postgrest-js` query builder chain, for unit-testing
 * services without a real database. Every chain method (`.select()`, `.eq()`, `.update()`, …)
 * returns the same chainable object, and the object itself is thenable so an `await` at any
 * point in the chain — with or without a terminal `.single()`/`.maybeSingle()` — resolves to
 * the configured `{ data, error }`.
 *
 * `createSupabaseClientMock` queues one chain result per `.from()` call, in the exact
 * chronological order the service under test is expected to call it — including calls made
 * from nested helper methods (e.g. `emit()`), since they all share the same client. Reading
 * the service source top-to-bottom for a given code path tells you the queue order to supply.
 */
export interface ChainResult {
  data: unknown;
  error: unknown;
}

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'order', 'limit', 'not', 'in', 'gte', 'lte', 'gt', 'lt', 'is',
  'update', 'insert', 'upsert', 'delete', 'returns',
] as const;

export function createChain(result: ChainResult) {
  const chain: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    chain[method] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: ChainResult) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

export function createSupabaseClientMock(chainResults: ChainResult[]) {
  const queue = [...chainResults];
  const calls: string[] = [];
  const from = jest.fn((table: string) => {
    calls.push(table);
    const result = queue.shift();
    if (!result) {
      throw new Error(
        `createSupabaseClientMock: no more queued responses (called .from("${table}") after the queue was exhausted). ` +
          `Calls so far: ${calls.join(' -> ')}`,
      );
    }
    return createChain(result);
  });
  return { client: { from }, calls };
}
