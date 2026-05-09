/**
 * Run an async `task` over each item with at most `limit` in flight.
 * Preserves input order in the returned results array. Never throws — any
 * task rejection is captured as an error result.
 */
export type MapLimitResult<T, R> =
  | { ok: true; input: T; value: R }
  | { ok: false; input: T; error: unknown }

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<MapLimitResult<T, R>[]> {
  const results: MapLimitResult<T, R>[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      const input = items[i]
      try {
        const value = await task(input, i)
        results[i] = { ok: true, input, value }
      } catch (error) {
        results[i] = { ok: false, input, error }
      }
    }
  })
  await Promise.all(workers)
  return results
}
