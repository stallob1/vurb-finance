import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultState } from './defaults'
import { STORAGE_KEY, loadState, saveState } from './storage'

afterEach(() => {
  vi.unstubAllGlobals()
})

function installStorage() {
  const data = new Map<string, string>()
  const calls: string[] = []
  const storage = {
    getItem(key: string) {
      calls.push(`get:${key}`)
      return data.has(key) ? (data.get(key) ?? null) : null
    },
    setItem(key: string, value: string) {
      calls.push(`set:${key}`)
      data.set(key, value)
    },
    removeItem(key: string) {
      calls.push(`del:${key}`)
      data.delete(key)
    },
    clear() {
      data.clear()
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    get length() {
      return data.size
    },
  }
  vi.stubGlobal('localStorage', storage)
  return { data, calls }
}

describe('vurb storage key', () => {
  it('is not the other finance app key', () => {
    const otherKey = ['prospect', 'finance', 'runway', 'v1'].join('-')
    expect(STORAGE_KEY).toBe('vurb-finance-runway-v1')
    expect(STORAGE_KEY).not.toBe(otherKey)

    const { data, calls } = installStorage()
    data.set(otherKey, JSON.stringify({ availableCash: 1, startMonth: '2020-01' }))

    const loaded = loadState()
    expect(loaded.availableCash).toBe(createDefaultState().availableCash)
    expect(loaded.startMonth).toBe('2026-11')

    saveState(loaded)
    const saved = loadState()
    expect(saved.availableCash).toBe(15276.6)

    expect(data.has(STORAGE_KEY)).toBe(true)
    expect(data.get(otherKey)).toBe(
      JSON.stringify({ availableCash: 1, startMonth: '2020-01' }),
    )
    expect(calls.every((call) => call.endsWith(STORAGE_KEY))).toBe(true)
    expect(calls.some((call) => call.includes(otherKey))).toBe(false)
  })
})
