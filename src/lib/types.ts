/** Year-month key like "2026-11" */
export type YearMonth = string

export interface PayrollPosition {
  id: string
  name: string
  monthlyAmount: number
}

export interface OneTimePayment {
  id: string
  month: YearMonth
  amount: number
}

export interface ExpenseBucket {
  id: string
  name: string
  /** Recurring monthly amount from effectiveMonth onward (unless overridden) */
  monthlyAmount: number
  /** First month the recurring amount applies (YYYY-MM) */
  effectiveMonth: YearMonth
  /** Per-month replacements for the recurring amount, keyed by YYYY-MM */
  overrides: Record<YearMonth, number>
  /** Event costs and production project costs can also take one-time payments */
  allowsOneTime: boolean
  oneTimePayments: OneTimePayment[]
}

export interface RevenueRow {
  id: string
  name: string
  /** Cash collected in that month, keyed by YYYY-MM. Missing month = 0. */
  amounts: Record<YearMonth, number>
  hint: string
}

export type OtherCashDirection = 'in' | 'out'

export interface OtherCashRow {
  id: string
  name: string
  direction: OtherCashDirection
  /** Scheduled cash in or out. Missing month = 0. Not an operating line. */
  amounts: Record<YearMonth, number>
  hint: string
}

export interface AppState {
  startMonth: YearMonth
  /** Opening cash for month 1. Not a sum of later balances, receivables, or intercompany. */
  availableCash: number
  payroll: PayrollPosition[]
  expenseBuckets: ExpenseBucket[]
  revenueRows: RevenueRow[]
  otherCashRows: OtherCashRow[]
  forecastMonths: number
}

export interface MonthProjection {
  month: YearMonth
  beginningCash: number
  revenueCollections: number
  otherInflows: number
  operatingExpenses: number
  otherOutflows: number
  endingCash: number
  /** Operating expenses − revenue collections. Other cash is excluded. Positive = burning. */
  operatingNetBurn: number
  /** First shortfall month when the runway estimate is only part of that month. */
  approximateShortfall: boolean
}

export type RunwayKind = 'no-burn' | 'months' | 'twelve-plus'

export interface RunwayResult {
  kind: RunwayKind
  /** "No cash burn", "1.5 months (approximate)", or "12+ months" */
  label: string
  exhaustionMonth: YearMonth | null
  /** Fractional months from the forecast start, or Infinity when cash does not run out. */
  months: number
  /** True when the estimate stops during a month rather than on a month boundary. */
  approximate: boolean
}

export interface ForecastResult {
  months: MonthProjection[]
  /** Month-1 operating expenses (payroll + buckets). */
  totalMonthlyExpenses: number
  /** Month-1 operating net burn. */
  operatingNetBurn: number
  runway: RunwayResult
}
