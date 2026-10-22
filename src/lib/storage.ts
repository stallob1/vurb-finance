import { createDefaultState } from './defaults'
import type { AppState, OtherCashDirection } from './types'

/** Vurb inputs only. Never read or write another app's storage key. */
export const STORAGE_KEY = 'vurb-finance-runway-v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function amountMap(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {}
  const amounts: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    amounts[k] = asNumber(v, 0)
  }
  return amounts
}

/** Best-effort hydrate. Missing or corrupt data falls back to the blank-slate defaults. */
export function loadState(): AppState {
  const defaults = createDefaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return defaults

    return {
      startMonth: asString(parsed.startMonth, defaults.startMonth),
      availableCash: asNumber(parsed.availableCash, defaults.availableCash),
      forecastMonths: asNumber(parsed.forecastMonths, defaults.forecastMonths),
      payroll: Array.isArray(parsed.payroll)
        ? parsed.payroll.map((p, i) => {
            const row = isRecord(p) ? p : {}
            const d = defaults.payroll[i]
            return {
              id: asString(row.id, d?.id ?? `pay-${i}`),
              name: asString(row.name, d?.name ?? ''),
              monthlyAmount: asNumber(row.monthlyAmount, 0),
            }
          })
        : defaults.payroll,
      expenseBuckets: Array.isArray(parsed.expenseBuckets)
        ? parsed.expenseBuckets.map((b, i) => {
            const row = isRecord(b) ? b : {}
            const d = defaults.expenseBuckets[i]
            const oneTimeRaw = Array.isArray(row.oneTimePayments)
              ? row.oneTimePayments
              : []
            return {
              id: asString(row.id, d?.id ?? `exp-${i}`),
              name: asString(row.name, d?.name ?? `Expense ${i + 1}`),
              monthlyAmount: asNumber(row.monthlyAmount, 0),
              effectiveMonth: asString(
                row.effectiveMonth,
                d?.effectiveMonth ?? defaults.startMonth,
              ),
              overrides: amountMap(row.overrides),
              allowsOneTime:
                typeof row.allowsOneTime === 'boolean'
                  ? row.allowsOneTime
                  : Boolean(d?.allowsOneTime),
              oneTimePayments: oneTimeRaw.map((p, j) => {
                const item = isRecord(p) ? p : {}
                return {
                  id: asString(item.id, `once-${i}-${j}`),
                  month: asString(item.month, defaults.startMonth),
                  amount: asNumber(item.amount, 0),
                }
              }),
            }
          })
        : defaults.expenseBuckets,
      revenueRows: Array.isArray(parsed.revenueRows)
        ? parsed.revenueRows.map((r, i) => {
            const row = isRecord(r) ? r : {}
            const d = defaults.revenueRows[i]
            return {
              id: asString(row.id, d?.id ?? `rev-${i}`),
              name: asString(row.name, d?.name ?? `Revenue ${i + 1}`),
              amounts: amountMap(row.amounts),
              hint: asString(row.hint, d?.hint ?? ''),
            }
          })
        : defaults.revenueRows,
      otherCashRows: Array.isArray(parsed.otherCashRows)
        ? parsed.otherCashRows.map((r, i) => {
            const row = isRecord(r) ? r : {}
            const d = defaults.otherCashRows[i]
            const direction: OtherCashDirection =
              row.direction === 'in' || row.direction === 'out'
                ? row.direction
                : (d?.direction ?? 'in')
            return {
              id: asString(row.id, d?.id ?? `oc-${i}`),
              name: asString(row.name, d?.name ?? `Other ${i + 1}`),
              direction,
              amounts: amountMap(row.amounts),
              hint: asString(row.hint, d?.hint ?? ''),
            }
          })
        : defaults.otherCashRows,
    }
  } catch {
    return defaults
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures.
  }
}
