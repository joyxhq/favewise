import { describe, it, expect } from 'vitest'
import { mapLimit } from '~/shared/lib/concurrency'

describe('concurrency › mapLimit', () => {
  it('preserves input order in the result array', async () => {
    const input = [100, 20, 50, 80, 10]
    const out = await mapLimit(input, 3, async (n) => {
      await new Promise((r) => setTimeout(r, n))
      return n * 2
    })
    expect(out.map((r) => (r.ok ? r.value : -1))).toEqual(input.map((n) => n * 2))
  })

  it('bounds in-flight tasks to the limit', async () => {
    let concurrent = 0
    let peak = 0
    const input = Array.from({ length: 20 }, (_, i) => i)
    await mapLimit(input, 4, async () => {
      concurrent++
      if (concurrent > peak) peak = concurrent
      await new Promise((r) => setTimeout(r, 10))
      concurrent--
    })
    expect(peak).toBeLessThanOrEqual(4)
  })

  it('captures errors per-item without throwing', async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom')
      return n
    })
    expect(out[0].ok).toBe(true)
    expect(out[1].ok).toBe(false)
    expect(out[2].ok).toBe(true)
  })

  it('empty input returns empty array without invoking task', async () => {
    let called = 0
    const out = await mapLimit([], 5, async () => {
      called++
      return 1
    })
    expect(out).toEqual([])
    expect(called).toBe(0)
  })
})
