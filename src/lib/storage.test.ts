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

  it('adds a zero Event advertising row without wiping saved inputs', () => {
    const { data } = installStorage()
    data.set(
      STORAGE_KEY,
      JSON.stringify({
        startMonth: '2026-12',
        availableCash: 15276.6,
        forecastMonths: 12,
        payroll: [{ id: 'pay-1', name: 'Alex', monthlyAmount: 250 }],
        revenueRows: [
          {
            id: 'rev-ads',
            name: 'Advertising',
            amounts: { '2026-12': 500 },
            hint: 'Cash collected this month. Do not include event sponsorship; count it once under Events.',
          },
          {
            id: 'rev-events',
            name: 'Events',
            amounts: { '2026-12': 80 },
            hint: 'Count event sponsorship once, under Events, not also under Advertising.',
          },
          {
            id: 'rev-contract',
            name: 'Prospect service contract',
            amounts: { '2027-01': 1000 },
            hint: 'Optional.',
          },
        ],
      }),
    )

    const loaded = loadState()
    expect(loaded.availableCash).toBe(15276.6)
    expect(loaded.startMonth).toBe('2026-12')
    expect(loaded.payroll).toEqual([{ id: 'pay-1', name: 'Alex', monthlyAmount: 250 }])
    expect(loaded.revenueRows.map((row) => row.name)).toEqual([
      'Advertising',
      'Events',
      'Event advertising',
      'Prospect service contract',
    ])
    expect(loaded.revenueRows.find((row) => row.name === 'Advertising')?.amounts).toEqual({
      '2026-12': 500,
    })
    expect(loaded.revenueRows.find((row) => row.name === 'Events')?.amounts).toEqual({
      '2026-12': 80,
    })
    expect(loaded.revenueRows.find((row) => row.name === 'Events')?.hint).toBe(
      'Event revenue collected this month, excluding event advertising.',
    )
    const eventAds = loaded.revenueRows.find((row) => row.name === 'Event advertising')
    expect(eventAds?.amounts).toEqual({})
    expect(eventAds?.hint).toMatch(/do not also enter it under Advertising or Events/i)
    expect(
      loaded.revenueRows.find((row) => row.name === 'Prospect service contract')?.amounts,
    ).toEqual({ '2027-01': 1000 })

    saveState(loaded)
    const again = loadState()
    expect(again.revenueRows.filter((row) => row.name === 'Event advertising')).toHaveLength(1)
    expect(again.revenueRows.find((row) => row.name === 'Event advertising')?.id).toBe(
      eventAds?.id,
    )
    expect(again.revenueRows.find((row) => row.name === 'Advertising')?.amounts['2026-12']).toBe(
      500,
    )
  })
})
