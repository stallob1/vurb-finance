import type {
  AppState,
  ExpenseBucket,
  OtherCashRow,
  RevenueRow,
} from './types'

/** September 2026 reference balance. Not a later month's cash. */
export const DEFAULT_STARTING_CASH = 15276.6

export const DEFAULT_START_MONTH = '2026-11'

/** The reference balance is September 2026 ending cash, not the forecast start. */
export const REFERENCE_BALANCE_MONTH = '2026-09'

export const REFERENCE_BALANCE_LABEL =
  'September 2026 ending cash after uncleared items — reference balance.'

export const EVENTS_REVENUE_HINT =
  'Count event sponsorship once, under Events, not also under Advertising.'

export const APPAREL_REVENUE_HINT =
  "Enter only Vurb's cash distribution from the FMF partnership. FMF handles fulfillment and Vurb receives 50% of net profit. Do not treat gross retail sales as Vurb cash receipts or add merchandise COGS."

export const PAYROLL_SECTION_HINT =
  "Each person's compensation is counted once even if they work across revenue streams."

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function openingCashNeedsUpdate(startMonth: string): boolean {
  return startMonth !== REFERENCE_BALANCE_MONTH
}

function expense(
  name: string,
  startMonth: string,
  allowsOneTime = false,
): ExpenseBucket {
  return {
    id: id('exp'),
    name,
    monthlyAmount: 0,
    effectiveMonth: startMonth,
    overrides: {},
    allowsOneTime,
    oneTimePayments: [],
  }
}

function revenue(name: string, hint: string): RevenueRow {
  return {
    id: id('rev'),
    name,
    amounts: {},
    hint,
  }
}

function other(
  name: string,
  direction: OtherCashRow['direction'],
  hint: string,
): OtherCashRow {
  return {
    id: id('oc'),
    name,
    direction,
    amounts: {},
    hint,
  }
}

/** Blank-slate budget. Only the September 2026 reference cash is non-zero. */
export function createDefaultState(): AppState {
  const startMonth = DEFAULT_START_MONTH

  return {
    startMonth,
    availableCash: DEFAULT_STARTING_CASH,
    forecastMonths: 12,
    payroll: [0, 1, 2].map(() => ({
      id: id('pay'),
      name: '',
      monthlyAmount: 0,
    })),
    expenseBuckets: [
      expense('Payroll taxes and benefits', startMonth),
      expense('Content contributors/freelancers', startMonth),
      expense('Production project costs', startMonth, true),
      expense('Event costs', startMonth, true),
      expense('Apparel-related costs', startMonth),
      expense('Marketing', startMonth),
      expense('Software and technology', startMonth),
      expense('Travel', startMonth),
      expense('Fixed overhead', startMonth),
      expense('Professional fees', startMonth),
      expense('Other expenses', startMonth),
    ],
    revenueRows: [
      revenue(
        'Advertising',
        'Cash collected this month. Do not include event sponsorship; count it once under Events.',
      ),
      revenue('Production', 'Cash collected this month.'),
      revenue('Apparel', APPAREL_REVENUE_HINT),
      revenue('Events', EVENTS_REVENUE_HINT),
    ],
    otherCashRows: [
      other(
        'Existing A/R collections',
        'in',
        'Do not also enter these collections as revenue. Outstanding receivables are not added to available cash. Count a collection only in the month cash arrives.',
      ),
      other(
        'Debt and existing payable payments',
        'out',
        'Do not import outstanding liabilities as immediate payments. Payments count only in their scheduled months. Do not also enter card payments as expenses already entered above.',
      ),
      other(
        'Owner distributions',
        'out',
        'Cash paid to owners. Not an operating expense. Enter a payment only in the month it leaves the account.',
      ),
      other(
        'Funding or owner contributions',
        'in',
        'Cash contributed by owners or funders. Not operating revenue. Enter it only in the month it is received.',
      ),
    ],
  }
}

export function createRevenueRow(name = 'New revenue', hint = ''): RevenueRow {
  return revenue(name, hint)
}

export function createPayrollRow(): AppState['payroll'][number] {
  return { id: id('pay'), name: '', monthlyAmount: 0 }
}

export function createExpenseBucket(startMonth: string): ExpenseBucket {
  return expense('New expense', startMonth, false)
}
