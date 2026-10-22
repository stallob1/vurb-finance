import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  copyAmountAcrossFutureMonths,
  monthKeys,
  projectForecast,
} from './calc'
import {
  ADVERTISING_REVENUE_HINT,
  APPAREL_REVENUE_HINT,
  DEFAULT_STARTING_CASH,
  DEFAULT_START_MONTH,
  EVENT_ADVERTISING_REVENUE_HINT,
  EVENTS_REVENUE_HINT,
  PAYROLL_SECTION_HINT,
  createDefaultState,
  openingCashNeedsUpdate,
} from './defaults'
import { money } from './format'
import type { AppState, ExpenseBucket } from './types'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (entry.name.endsWith('.test.ts')) return []
    return [path]
  })
}

function bucket(partial: Partial<ExpenseBucket> & Pick<ExpenseBucket, 'name'>): ExpenseBucket {
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    monthlyAmount: partial.monthlyAmount ?? 0,
    effectiveMonth: partial.effectiveMonth ?? '2026-11',
    overrides: partial.overrides ?? {},
    allowsOneTime: partial.allowsOneTime ?? false,
    oneTimePayments: partial.oneTimePayments ?? [],
  }
}

function withBudget(patch: Partial<AppState>): AppState {
  return { ...createDefaultState(), ...patch }
}

describe('blank-slate defaults', () => {
  it('keeps ending cash at 15276.60 every month and shows No cash burn', () => {
    const state = createDefaultState()
    expect(state.availableCash).toBe(DEFAULT_STARTING_CASH)
    expect(state.availableCash).toBe(15276.6)
    expect(state.startMonth).toBe(DEFAULT_START_MONTH)
    expect(state.forecastMonths).toBe(12)
    expect(money(state.availableCash)).toBe('$15,276.60')
    expect(openingCashNeedsUpdate(state.startMonth)).toBe(true)

    expect(state.revenueRows.map((r) => r.name)).toEqual([
      'Advertising',
      'Production',
      'Apparel',
      'Events',
      'Event advertising',
    ])
    expect(state.revenueRows.find((r) => r.name === 'Advertising')?.hint).toBe(
      ADVERTISING_REVENUE_HINT,
    )
    expect(state.revenueRows.find((r) => r.name === 'Events')?.hint).toBe(
      EVENTS_REVENUE_HINT,
    )
    expect(state.revenueRows.find((r) => r.name === 'Event advertising')?.hint).toBe(
      EVENT_ADVERTISING_REVENUE_HINT,
    )
    expect(EVENTS_REVENUE_HINT.toLowerCase()).not.toContain('sponsorship')
    expect(ADVERTISING_REVENUE_HINT).toMatch(/Event advertising/)
    expect(EVENT_ADVERTISING_REVENUE_HINT).toMatch(
      /do not also enter it under Advertising or Events/i,
    )
    expect(state.revenueRows.find((r) => r.name === 'Apparel')?.hint).toBe(
      APPAREL_REVENUE_HINT,
    )
    expect(PAYROLL_SECTION_HINT).toMatch(/counted once/i)
    expect(state.revenueRows.some((r) => /prospect/i.test(r.name))).toBe(false)

    for (const row of state.revenueRows) {
      expect(Object.keys(row.amounts)).toHaveLength(0)
    }
    for (const row of state.payroll) {
      expect(row.name).toBe('')
      expect(row.monthlyAmount).toBe(0)
    }
    for (const row of state.expenseBuckets) {
      expect(row.monthlyAmount).toBe(0)
      expect(row.overrides).toEqual({})
      expect(row.oneTimePayments).toEqual([])
    }
    for (const row of state.otherCashRows) {
      expect(Object.keys(row.amounts)).toHaveLength(0)
    }
    expect(
      state.expenseBuckets
        .filter((b) => b.allowsOneTime)
        .map((b) => b.name)
        .sort(),
    ).toEqual(['Event costs', 'Production project costs'])

    const forecast = projectForecast(state)
    expect(forecast.months).toHaveLength(12)
    expect(forecast.months[0].month).toBe('2026-11')
    expect(forecast.months[11].month).toBe('2027-10')
    expect(forecast.runway.kind).toBe('no-burn')
    expect(forecast.runway.label).toBe('No cash burn')
    expect(forecast.runway.exhaustionMonth).toBeNull()
    expect(forecast.runway.approximate).toBe(false)
    expect(forecast.totalMonthlyExpenses).toBe(0)
    expect(forecast.operatingNetBurn).toBe(0)

    for (const month of forecast.months) {
      expect(month.beginningCash).toBe(15276.6)
      expect(month.endingCash).toBe(15276.6)
      expect(month.revenueCollections).toBe(0)
      expect(month.otherInflows).toBe(0)
      expect(month.operatingExpenses).toBe(0)
      expect(month.otherOutflows).toBe(0)
      expect(month.approximateShortfall).toBe(false)
    }
  })
})

describe('runway', () => {
  it('shows 12+ months when a monthly outflow stays positive all year', () => {
    const state = withBudget({
      payroll: [{ id: 'p1', name: 'Contractor', monthlyAmount: 100 }],
    })
    const forecast = projectForecast(state)
    expect(forecast.runway.kind).toBe('twelve-plus')
    expect(forecast.runway.label).toBe('12+ months')
    expect(forecast.runway.exhaustionMonth).toBeNull()
    expect(forecast.runway.approximate).toBe(false)
    expect(forecast.months.every((m) => m.endingCash > 0)).toBe(true)
    expect(forecast.months[11].endingCash).toBe(15276.6 - 1200)
    expect(forecast.months.every((m) => !m.approximateShortfall)).toBe(true)
  })

  it('stops at the first shortfall and marks the partial month approximate', () => {
    const state = withBudget({
      expenseBuckets: [
        bucket({ name: 'Fixed overhead', monthlyAmount: 10000 }),
      ],
    })
    const forecast = projectForecast(state)
    const firstShortfall = forecast.months.findIndex((m) => m.endingCash < 0)

    expect(firstShortfall).toBe(1)
    expect(forecast.months[0].endingCash).toBe(5276.6)
    expect(forecast.months[0].endingCash).toBeGreaterThan(0)
    expect(forecast.months[1].month).toBe('2026-12')
    expect(forecast.months[1].endingCash).toBeLessThan(0)
    expect(forecast.months[2].endingCash).toBeLessThan(0)

    expect(forecast.runway.kind).toBe('months')
    expect(forecast.runway.exhaustionMonth).toBe('2026-12')
    expect(forecast.runway.exhaustionMonth).toBe(forecast.months[firstShortfall].month)
    expect(forecast.runway.months).toBe(1.5)
    expect(forecast.runway.approximate).toBe(true)
    expect(forecast.runway.label).toBe('1.5 months (approximate)')
    expect(forecast.runway.label.toLowerCase()).toContain('approximate')

    const marked = forecast.months.filter((m) => m.approximateShortfall)
    expect(marked.map((m) => m.month)).toEqual(['2026-12'])
  })
})

describe('event advertising is separate from Events', () => {
  it('counts the two rows independently', () => {
    const state = withBudget({
      revenueRows: [
        { id: 'ads', name: 'Advertising', amounts: { '2026-11': 10 }, hint: '' },
        { id: 'events', name: 'Events', amounts: { '2026-11': 100 }, hint: '' },
        {
          id: 'event-ads',
          name: 'Event advertising',
          amounts: { '2026-11': 40 },
          hint: '',
        },
      ],
    })
    const forecast = projectForecast(state)
    expect(forecast.months[0].revenueCollections).toBe(150)
    expect(state.revenueRows.find((row) => row.name === 'Events')?.amounts['2026-11']).toBe(100)
    expect(
      state.revenueRows.find((row) => row.name === 'Event advertising')?.amounts['2026-11'],
    ).toBe(40)
  })
})

describe('payroll is counted once', () => {
  it('does not repeat compensation for each revenue stream', () => {
    const state = withBudget({
      payroll: [{ id: 'p', name: 'Alex', monthlyAmount: 1000 }],
      revenueRows: [
        { id: 'a', name: 'Advertising', amounts: { '2026-11': 100 }, hint: '' },
        { id: 'b', name: 'Production', amounts: { '2026-11': 80 }, hint: '' },
        { id: 'c', name: 'Apparel', amounts: {}, hint: '' },
        { id: 'd', name: 'Events', amounts: { '2026-11': 20 }, hint: '' },
      ],
    })
    const forecast = projectForecast(state)
    expect(forecast.months[0].operatingExpenses).toBe(1000)
    expect(forecast.months[0].revenueCollections).toBe(200)
    expect(forecast.months[1].operatingExpenses).toBe(1000)
    expect(forecast.months[1].revenueCollections).toBe(0)
  })
})

describe('monthly edits', () => {
  it('applies a one-month override to only that month', () => {
    const state = withBudget({
      expenseBuckets: [
        bucket({
          name: 'Marketing',
          monthlyAmount: 200,
          effectiveMonth: '2026-11',
          overrides: { '2027-01': 5000 },
        }),
      ],
    })
    const forecast = projectForecast(state)
    const byMonth = Object.fromEntries(
      forecast.months.map((m) => [m.month, m.operatingExpenses]),
    )

    expect(byMonth['2026-11']).toBe(200)
    expect(byMonth['2026-12']).toBe(200)
    expect(byMonth['2027-01']).toBe(5000)
    expect(byMonth['2027-02']).toBe(200)
    expect(byMonth['2027-10']).toBe(200)

    const changed = forecast.months.filter((m) => m.operatingExpenses !== 200)
    expect(changed.map((m) => m.month)).toEqual(['2027-01'])
  })

  it('counts a one-time payment only in its scheduled month', () => {
    const state = withBudget({
      expenseBuckets: [
        bucket({
          name: 'Event costs',
          monthlyAmount: 0,
          allowsOneTime: true,
          oneTimePayments: [{ id: 'once', month: '2027-03', amount: 2500 }],
        }),
      ],
    })
    const forecast = projectForecast(state)
    const changed = forecast.months.filter((m) => m.operatingExpenses !== 0)
    expect(changed.map((m) => m.month)).toEqual(['2027-03'])
    expect(changed[0].operatingExpenses).toBe(2500)
  })

  it('copies an amount across future months and leaves earlier months alone', () => {
    const months = monthKeys('2026-11', 12)
    const next = copyAmountAcrossFutureMonths(
      { '2026-11': 40, '2027-01': 250 },
      months,
      '2027-01',
    )
    expect(next['2026-11']).toBe(40)
    expect(next['2026-12']).toBeUndefined()
    for (const month of months.slice(2)) {
      expect(next[month]).toBe(250)
    }
  })
})

describe('other cash stays off the operating lines and out of opening cash', () => {
  it('does not fold a scheduled A/R collection into starting cash or revenue', () => {
    const state = createDefaultState()
    const ar = state.otherCashRows.find((r) => r.name === 'Existing A/R collections')
    expect(ar).toBeDefined()
    ar!.amounts = { '2026-12': 4000 }

    const forecast = projectForecast(state)
    expect(forecast.months[0].beginningCash).toBe(15276.6)
    expect(forecast.months[0].otherInflows).toBe(0)
    expect(forecast.months[0].revenueCollections).toBe(0)
    expect(forecast.months[1].otherInflows).toBe(4000)
    expect(forecast.months[1].revenueCollections).toBe(0)
    expect(forecast.months[1].beginningCash).toBe(15276.6)
    expect(forecast.months[1].endingCash).toBe(19276.6)
    expect(forecast.months[1].operatingNetBurn).toBe(0)
    expect(forecast.months[2].beginningCash).toBe(19276.6)
    expect(forecast.runway.label).toBe('No cash burn')
  })
})

describe('storage key isolation', () => {
  it('does not mention the other app key in source', () => {
    const banned = ['prospect', 'finance', 'runway', 'v1'].join('-')
    const files = sourceFiles(join(process.cwd(), 'src'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(readFileSync(file, 'utf8').includes(banned), file).toBe(false)
    }
  })
})
