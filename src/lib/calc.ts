import type {
  AppState,
  ExpenseBucket,
  ForecastResult,
  MonthProjection,
  RunwayResult,
  YearMonth,
} from './types'

function parseYearMonth(ym: YearMonth): { y: number; m: number } {
  const [ys, ms] = ym.split('-')
  const y = Number(ys)
  const m = Number(ms)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`Invalid YearMonth: ${ym}`)
  }
  return { y, m }
}

export function roundCents(n: number): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const { y, m } = parseYearMonth(ym)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function monthKeys(start: YearMonth, n: number): YearMonth[] {
  const keys: YearMonth[] = []
  for (let i = 0; i < n; i++) keys.push(addMonths(start, i))
  return keys
}

export function formatMonthLabel(ym: YearMonth): string {
  const { y, m } = parseYearMonth(ym)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatMonthLong(ym: YearMonth): string {
  const { y, m } = parseYearMonth(ym)
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function cmpYm(a: YearMonth, b: YearMonth): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Recurring amount for the month, plus one-time payments scheduled that month. */
export function expenseForBucket(bucket: ExpenseBucket, month: YearMonth): number {
  let recurring: number
  if (Object.prototype.hasOwnProperty.call(bucket.overrides, month)) {
    recurring = Number(bucket.overrides[month]) || 0
  } else if (cmpYm(month, bucket.effectiveMonth) < 0) {
    recurring = 0
  } else {
    recurring = Number(bucket.monthlyAmount) || 0
  }
  const oneTime = (bucket.oneTimePayments ?? [])
    .filter((p) => p.month === month)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  return roundCents(recurring + oneTime)
}

export function totalPayroll(state: AppState): number {
  return roundCents(
    state.payroll.reduce((sum, p) => sum + (Number(p.monthlyAmount) || 0), 0),
  )
}

export function operatingExpenses(state: AppState, month: YearMonth): number {
  const buckets = state.expenseBuckets.reduce(
    (sum, b) => sum + expenseForBucket(b, month),
    0,
  )
  return roundCents(totalPayroll(state) + buckets)
}

export function revenueCollections(state: AppState, month: YearMonth): number {
  return roundCents(
    state.revenueRows.reduce(
      (sum, r) => sum + (Number(r.amounts[month]) || 0),
      0,
    ),
  )
}

export function otherInflows(state: AppState, month: YearMonth): number {
  return roundCents(
    state.otherCashRows
      .filter((r) => r.direction === 'in')
      .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0),
  )
}

export function otherOutflows(state: AppState, month: YearMonth): number {
  return roundCents(
    state.otherCashRows
      .filter((r) => r.direction === 'out')
      .reduce((sum, r) => sum + (Number(r.amounts[month]) || 0), 0),
  )
}

/**
 * Write `fromMonth`'s amount onto that month and every later month in `months`.
 * Earlier months stay as they are. A blank cell counts as 0.
 */
export function copyAmountAcrossFutureMonths(
  amounts: Record<YearMonth, number>,
  months: YearMonth[],
  fromMonth: YearMonth,
): Record<YearMonth, number> {
  const value = Number(amounts[fromMonth]) || 0
  const fromIdx = months.indexOf(fromMonth)
  if (fromIdx < 0) return { ...amounts }
  const next = { ...amounts }
  for (let i = fromIdx; i < months.length; i++) {
    next[months[i]] = value
  }
  return next
}

function computeRunway(months: MonthProjection[]): RunwayResult {
  const noOutflow = months.every(
    (m) => m.operatingExpenses === 0 && m.otherOutflows === 0,
  )
  const shortfallIdx = months.findIndex((m) => m.endingCash < 0)

  if (noOutflow && shortfallIdx < 0) {
    return {
      kind: 'no-burn',
      label: 'No cash burn',
      exhaustionMonth: null,
      months: Infinity,
      approximate: false,
    }
  }

  if (shortfallIdx < 0) {
    return {
      kind: 'twelve-plus',
      label: '12+ months',
      exhaustionMonth: null,
      months: Infinity,
      approximate: false,
    }
  }

  const short = months[shortfallIdx]
  const netOut = short.beginningCash - short.endingCash
  let fractional = shortfallIdx
  if (netOut > 0 && short.beginningCash > 0) {
    fractional = shortfallIdx + short.beginningCash / netOut
  }

  const rounded = Math.round(fractional * 10) / 10
  const partial = Math.abs(fractional - Math.round(fractional)) > 1e-6
  return {
    kind: 'months',
    label: partial
      ? `${rounded.toFixed(1)} months (approximate)`
      : `${rounded.toFixed(1)} months`,
    exhaustionMonth: short.month,
    months: rounded,
    approximate: partial,
  }
}

/**
 * Ending cash = beginning + revenue collections + other inflows
 * − operating expenses − other outflows.
 * Ending cash becomes the next month's beginning cash.
 * Receivables are not added to opening cash; they count only as scheduled other inflows.
 */
export function projectForecast(state: AppState): ForecastResult {
  const keys = monthKeys(state.startMonth, state.forecastMonths)
  const projections: MonthProjection[] = []
  let beginning = roundCents(Number(state.availableCash) || 0)

  for (const month of keys) {
    const revenue = revenueCollections(state, month)
    const inflow = otherInflows(state, month)
    const expenses = operatingExpenses(state, month)
    const outflow = otherOutflows(state, month)
    const ending = roundCents(beginning + revenue + inflow - expenses - outflow)
    const operatingNetBurn = roundCents(expenses - revenue)

    projections.push({
      month,
      beginningCash: beginning,
      revenueCollections: revenue,
      otherInflows: inflow,
      operatingExpenses: expenses,
      otherOutflows: outflow,
      endingCash: ending,
      operatingNetBurn,
      approximateShortfall: false,
    })

    beginning = ending
  }

  const runway = computeRunway(projections)
  if (runway.approximate && runway.exhaustionMonth) {
    for (const month of projections) {
      month.approximateShortfall = month.month === runway.exhaustionMonth
    }
  }

  const first = projections[0]
  return {
    months: projections,
    totalMonthlyExpenses: first ? first.operatingExpenses : 0,
    operatingNetBurn: first ? first.operatingNetBurn : 0,
    runway,
  }
}
