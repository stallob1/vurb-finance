import { useEffect, useMemo, useState } from 'react'
import {
  copyAmountAcrossFutureMonths,
  formatMonthLabel,
  formatMonthLong,
  monthKeys,
  projectForecast,
} from './lib/calc'
import {
  PAYROLL_SECTION_HINT,
  REFERENCE_BALANCE_LABEL,
  createDefaultState,
  createExpenseBucket,
  createPayrollRow,
  createRevenueRow,
  openingCashNeedsUpdate,
} from './lib/defaults'
import { money } from './lib/format'
import { loadState, saveState } from './lib/storage'
import type {
  AppState,
  ExpenseBucket,
  OneTimePayment,
  PayrollPosition,
  RevenueRow,
  YearMonth,
} from './lib/types'
import './App.css'

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function parseAmount(raw: string): number {
  if (raw.trim() === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function CashChart({
  months,
}: {
  months: { month: YearMonth; endingCash: number }[]
}) {
  const width = 720
  const height = 220
  const pad = { top: 16, right: 36, bottom: 36, left: 96 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const values = months.map((m) => m.endingCash)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values)
  const span = maxV - minV || 1

  const xAt = (i: number) =>
    pad.left + (months.length <= 1 ? innerW / 2 : (i / (months.length - 1)) * innerW)
  const yAt = (v: number) => pad.top + ((maxV - v) / span) * innerH

  const points = months.map((m, i) => `${xAt(i)},${yAt(m.endingCash)}`).join(' ')
  const zeroY = yAt(0)
  const areaPath =
    months.length > 0
      ? `M ${xAt(0)} ${zeroY} L ${points.split(' ').join(' L ')} L ${xAt(months.length - 1)} ${zeroY} Z`
      : ''

  return (
    <svg
      className="cash-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Ending cash by month"
    >
      <defs>
        <linearGradient id="vurbCashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={zeroY}
        y2={zeroY}
        className="chart-zero"
      />
      {areaPath && <path d={areaPath} fill="url(#vurbCashFill)" />}
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {months.map((m, i) => (
        <g key={m.month}>
          <circle cx={xAt(i)} cy={yAt(m.endingCash)} r="3.5" fill="var(--accent)" />
          {(i === 0 || i === months.length - 1 || i % 2 === 0) && (
            <text
              x={xAt(i)}
              y={height - 10}
              textAnchor="middle"
              className="chart-label"
            >
              {formatMonthLabel(m.month).replace(' ', '\u00a0')}
            </text>
          )}
        </g>
      ))}
      <text x={pad.left - 8} y={yAt(maxV) + 4} textAnchor="end" className="chart-label">
        {money(maxV)}
      </text>
      <text x={pad.left - 8} y={zeroY + 4} textAnchor="end" className="chart-label">
        $0
      </text>
      {minV < 0 && (
        <text x={pad.left - 8} y={yAt(minV) + 4} textAnchor="end" className="chart-label">
          {money(minV)}
        </text>
      )}
    </svg>
  )
}

function AmountCells({
  label,
  amounts,
  months,
  onAmount,
  onCopy,
}: {
  label: string
  amounts: Record<YearMonth, number>
  months: YearMonth[]
  onAmount: (month: YearMonth, value: number | null) => void
  onCopy?: (month: YearMonth) => void
}) {
  return (
    <>
      {months.map((month) => (
        <td key={month}>
          <div className="cell-edit">
            <input
              type="number"
              min={0}
              step={0.01}
              aria-label={`${label} ${month}`}
              value={amounts[month] ?? ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value
                onAmount(month, raw === '' ? null : parseAmount(raw))
              }}
            />
            {onCopy && (
              <button
                type="button"
                className="btn icon"
                title="Copy across future months"
                aria-label={`Copy ${label} from ${month} across future months`}
                onClick={() => onCopy(month)}
              >
                →
              </button>
            )}
          </div>
        </td>
      ))}
    </>
  )
}

export default function App() {
  const [state, setState] = useState<AppState>(() =>
    typeof window !== 'undefined' ? loadState() : createDefaultState(),
  )
  const [overrideOpen, setOverrideOpen] = useState<Record<string, boolean>>({})
  const [otherOpen, setOtherOpen] = useState(false)

  useEffect(() => {
    saveState(state)
  }, [state])

  const forecast = useMemo(() => projectForecast(state), [state])
  const months = useMemo(
    () => monthKeys(state.startMonth, state.forecastMonths),
    [state.startMonth, state.forecastMonths],
  )

  function reset() {
    setState(createDefaultState())
    setOverrideOpen({})
    setOtherOpen(false)
  }

  function updatePayroll(id: string, patch: Partial<PayrollPosition>) {
    setState((s) => ({
      ...s,
      payroll: s.payroll.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  function updateBucket(id: string, patch: Partial<ExpenseBucket>) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) =>
        b.id === id ? { ...b, ...patch } : b,
      ),
    }))
  }

  function setBucketOverride(id: string, month: YearMonth, value: number | null) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) => {
        if (b.id !== id) return b
        const overrides = { ...b.overrides }
        if (value === null) delete overrides[month]
        else overrides[month] = value
        return { ...b, overrides }
      }),
    }))
  }

  function addOneTime(bucketId: string) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) => {
        if (b.id !== bucketId) return b
        const payment: OneTimePayment = {
          id: uid('once'),
          month: s.startMonth,
          amount: 0,
        }
        return { ...b, oneTimePayments: [...b.oneTimePayments, payment] }
      }),
    }))
  }

  function updateOneTime(
    bucketId: string,
    paymentId: string,
    patch: Partial<OneTimePayment>,
  ) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) => {
        if (b.id !== bucketId) return b
        return {
          ...b,
          oneTimePayments: b.oneTimePayments.map((p) =>
            p.id === paymentId ? { ...p, ...patch } : p,
          ),
        }
      }),
    }))
  }

  function removeOneTime(bucketId: string, paymentId: string) {
    setState((s) => ({
      ...s,
      expenseBuckets: s.expenseBuckets.map((b) =>
        b.id === bucketId
          ? {
              ...b,
              oneTimePayments: b.oneTimePayments.filter((p) => p.id !== paymentId),
            }
          : b,
      ),
    }))
  }

  function setRowAmount(
    kind: 'revenue' | 'other',
    rowId: string,
    month: YearMonth,
    value: number | null,
  ) {
    setState((s) => {
      if (kind === 'revenue') {
        return {
          ...s,
          revenueRows: s.revenueRows.map((r) => {
            if (r.id !== rowId) return r
            const amounts = { ...r.amounts }
            if (value === null) delete amounts[month]
            else amounts[month] = value
            return { ...r, amounts }
          }),
        }
      }
      return {
        ...s,
        otherCashRows: s.otherCashRows.map((r) => {
          if (r.id !== rowId) return r
          const amounts = { ...r.amounts }
          if (value === null) delete amounts[month]
          else amounts[month] = value
          return { ...r, amounts }
        }),
      }
    })
  }

  function copyAcrossFuture(row: RevenueRow, fromMonth: YearMonth) {
    setState((s) => {
      const horizon = monthKeys(s.startMonth, s.forecastMonths)
      return {
        ...s,
        revenueRows: s.revenueRows.map((r) =>
          r.id === row.id
            ? {
                ...r,
                amounts: copyAmountAcrossFutureMonths(r.amounts, horizon, fromMonth),
              }
            : r,
        ),
      }
    })
  }

  function fillRow(rowId: string) {
    const first = months[0]
    const row = state.revenueRows.find((r) => r.id === rowId)
    if (!first || !row) return
    copyAcrossFuture(row, first)
  }

  const payrollTotal = state.payroll.reduce(
    (sum, p) => sum + (Number(p.monthlyAmount) || 0),
    0,
  )

  return (
    <div className="app">
      <header className="hero-band">
        <p className="brand">The Vurb Company</p>
        <h1>Cash Runway</h1>
        <p className="lede">
          A 12-month cash forecast. Revenue, payroll, and expenses start at $0.
          Update the September reference balance to the cash you will have when
          the forecast starts.
        </p>
      </header>

      <section className="summary-grid" aria-label="Runway summary">
        <article>
          <h2>Starting cash</h2>
          <p className="metric">{money(state.availableCash)}</p>
        </article>
        <article>
          <h2>Monthly operating expenses</h2>
          <p className="metric">{money(forecast.totalMonthlyExpenses)}</p>
          <p className="hint">Month 1 ({formatMonthLabel(state.startMonth)})</p>
        </article>
        <article>
          <h2>Operating net burn</h2>
          <p className="metric">{money(forecast.operatingNetBurn)}</p>
          <p className="hint">Operating expenses − revenue. Other cash excluded.</p>
        </article>
        <article className="runway-card">
          <h2>Runway</h2>
          <p className="metric runway">{forecast.runway.label}</p>
          {forecast.runway.exhaustionMonth && (
            <p className="hint">
              Exhaustion: {formatMonthLabel(forecast.runway.exhaustionMonth)}
              {forecast.runway.approximate ? ' · partial month, approximate' : ''}
            </p>
          )}
        </article>
      </section>

      <section className="panel" aria-labelledby="starting-cash-heading">
        <div className="panel-head">
          <h2 id="starting-cash-heading">Starting cash</h2>
          <button type="button" className="btn ghost" onClick={reset}>
            Reset
          </button>
        </div>
        <div className="field-grid">
          <label>
            {REFERENCE_BALANCE_LABEL}
            <input
              type="number"
              min={0}
              step={0.01}
              value={state.availableCash}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  availableCash: parseAmount(e.target.value),
                }))
              }
            />
          </label>
          <label>
            Forecast start
            <input
              type="month"
              value={state.startMonth}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  startMonth: e.target.value || s.startMonth,
                }))
              }
            />
          </label>
        </div>
        {openingCashNeedsUpdate(state.startMonth) && (
          <p className="cash-flag" role="status">
            Opening cash needs updating to {formatMonthLong(state.startMonth)}.
            This amount is the September 2026 ending cash after uncleared items
            — a reference balance. October–December zero placeholders are not
            cash balances. Receivables and intercompany balances are not added
            to available cash.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="revenue-heading">
        <div className="panel-head">
          <h2 id="revenue-heading">Revenue</h2>
          <div className="panel-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  revenueRows: [
                    ...s.revenueRows,
                    createRevenueRow(
                      'New revenue',
                      'Cash collected this month.',
                    ),
                  ],
                }))
              }
            >
              Add revenue row
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  revenueRows: [
                    ...s.revenueRows,
                    createRevenueRow(
                      'Prospect service contract',
                      'Optional. Enter cash collected in the month it arrives. Nothing is included until you type an amount.',
                    ),
                  ],
                }))
              }
            >
              Add Prospect service contract
            </button>
          </div>
        </div>
        <p className="section-hint">
          Amounts are cash collected in that month. Use → to copy a value across
          future months. Event sponsorship is entered once, on the Events row.
        </p>
        <div className="table-scroll">
          <table className="data-table revenue-table">
            <thead>
              <tr>
                <th scope="col">Stream</th>
                {months.map((month) => (
                  <th key={month} scope="col">
                    {formatMonthLabel(month)}
                  </th>
                ))}
                <th scope="col">Row</th>
              </tr>
            </thead>
            <tbody>
              {state.revenueRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <input
                      className="name-input stream-name"
                      aria-label={`Revenue name for ${row.name || 'new row'}`}
                      value={row.name}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          revenueRows: s.revenueRows.map((r) =>
                            r.id === row.id ? { ...r, name: e.target.value } : r,
                          ),
                        }))
                      }
                    />
                    {row.hint && <p className="row-hint">{row.hint}</p>}
                  </th>
                  <AmountCells
                    label={row.name || 'Revenue'}
                    amounts={row.amounts}
                    months={months}
                    onAmount={(month, value) =>
                      setRowAmount('revenue', row.id, month, value)
                    }
                    onCopy={(month) => copyAcrossFuture(row, month)}
                  />
                  <td>
                    <div className="panel-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => fillRow(row.id)}
                      >
                        Fill all
                      </button>
                      <button
                        type="button"
                        className="btn ghost danger"
                        aria-label={`Remove ${row.name || 'revenue row'}`}
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            revenueRows: s.revenueRows.filter((r) => r.id !== row.id),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="payroll-heading">
        <div className="panel-head">
          <h2 id="payroll-heading">Payroll</h2>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setState((s) => ({
                ...s,
                payroll: [...s.payroll, createPayrollRow()],
              }))
            }
          >
            Add person
          </button>
        </div>
        <p className="section-hint">{PAYROLL_SECTION_HINT}</p>
        <ul className="payroll-list">
          {state.payroll.map((person, index) => {
            const name = person.name || `Person ${index + 1}`
            return (
              <li key={person.id}>
                <input
                  className="name-input"
                  placeholder="Employee or contractor"
                  aria-label="Employee or contractor name"
                  autoComplete="off"
                  value={person.name}
                  onChange={(e) => updatePayroll(person.id, { name: e.target.value })}
                />
                <input
                  type="range"
                  min={0}
                  max={25000}
                  step={100}
                  value={Math.min(25000, Math.max(0, person.monthlyAmount))}
                  aria-label={`${name} salary slider`}
                  onChange={(e) =>
                    updatePayroll(person.id, {
                      monthlyAmount: parseAmount(e.target.value),
                    })
                  }
                />
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={person.monthlyAmount}
                  aria-label={`${name} salary`}
                  onChange={(e) =>
                    updatePayroll(person.id, {
                      monthlyAmount: parseAmount(e.target.value),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn ghost danger"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      payroll: s.payroll.filter((p) => p.id !== person.id),
                    }))
                  }
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
        <p className="total-line">
          Payroll total: <strong>{money(payrollTotal)}</strong>
        </p>
      </section>

      <section className="panel" aria-labelledby="expenses-heading">
        <div className="panel-head">
          <h2 id="expenses-heading">Expenses</h2>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setState((s) => ({
                ...s,
                expenseBuckets: [...s.expenseBuckets, createExpenseBucket(s.startMonth)],
              }))
            }
          >
            Add expense
          </button>
        </div>
        <p className="section-hint">
          Recurring amounts repeat every month from the effective month. Use
          overrides to change a single month. Event costs and production project
          costs can also record one-time payments, counted only in the month you
          schedule.
        </p>
        <ul className="bucket-list">
          {state.expenseBuckets.map((bucket) => {
            const open = Boolean(overrideOpen[bucket.id])
            return (
              <li key={bucket.id} className="bucket-row">
                <div className="bucket-main">
                  <input
                    className="name-input"
                    aria-label={`Expense name for ${bucket.name}`}
                    value={bucket.name}
                    onChange={(e) => updateBucket(bucket.id, { name: e.target.value })}
                  />
                  <label>
                    Monthly amount
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={bucket.monthlyAmount}
                      aria-label={`${bucket.name} monthly amount`}
                      onChange={(e) =>
                        updateBucket(bucket.id, {
                          monthlyAmount: parseAmount(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Effective
                    <input
                      type="month"
                      value={bucket.effectiveMonth}
                      aria-label={`${bucket.name} effective month`}
                      onChange={(e) =>
                        updateBucket(bucket.id, {
                          effectiveMonth: e.target.value || bucket.effectiveMonth,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn ghost"
                    aria-expanded={open}
                    aria-label={`${open ? 'Hide' : 'Show'} overrides for ${bucket.name}`}
                    onClick={() =>
                      setOverrideOpen((current) => ({
                        ...current,
                        [bucket.id]: !open,
                      }))
                    }
                  >
                    {open ? 'Hide overrides' : 'Overrides'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost danger"
                    aria-label={`Remove ${bucket.name}`}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        expenseBuckets: s.expenseBuckets.filter((b) => b.id !== bucket.id),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                {open && (
                  <div className="override-grid">
                    {months.map((month) => {
                      const has = Object.prototype.hasOwnProperty.call(
                        bucket.overrides,
                        month,
                      )
                      return (
                        <label key={month}>
                          <span>{formatMonthLabel(month)}</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder={String(
                              month < bucket.effectiveMonth ? 0 : bucket.monthlyAmount,
                            )}
                            aria-label={`${bucket.name} override ${month}`}
                            value={has ? bucket.overrides[month] : ''}
                            onChange={(e) => {
                              const raw = e.target.value
                              setBucketOverride(
                                bucket.id,
                                month,
                                raw === '' ? null : parseAmount(raw),
                              )
                            }}
                          />
                        </label>
                      )
                    })}
                  </div>
                )}
                {bucket.allowsOneTime && (
                  <div className="one-time">
                    <div className="one-time-head">
                      <p>One-time payments</p>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => addOneTime(bucket.id)}
                      >
                        Add one-time payment
                      </button>
                    </div>
                    <p className="hint">
                      Added on top of the recurring amount, and only in the
                      selected month. Outstanding bills are not imported.
                    </p>
                    {bucket.oneTimePayments.length > 0 && (
                      <ul className="one-time-list">
                        {bucket.oneTimePayments.map((payment) => (
                          <li key={payment.id} className="one-time-row">
                            <label>
                              Month
                              <input
                                type="month"
                                value={payment.month}
                                aria-label={`${bucket.name} one-time month`}
                                onChange={(e) =>
                                  updateOneTime(bucket.id, payment.id, {
                                    month: e.target.value || payment.month,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Amount
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={payment.amount}
                                aria-label={`${bucket.name} one-time amount`}
                                onChange={(e) =>
                                  updateOneTime(bucket.id, payment.id, {
                                    amount: parseAmount(e.target.value),
                                  })
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="btn ghost danger"
                              onClick={() => removeOneTime(bucket.id, payment.id)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel" aria-labelledby="other-cash-heading">
        <div className="panel-head">
          <h2 id="other-cash-heading">Other cash movements</h2>
          <button
            type="button"
            className="btn ghost"
            aria-expanded={otherOpen}
            onClick={() => setOtherOpen((open) => !open)}
          >
            {otherOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <p className="section-hint">
          Starts at $0 and stays separate from operating revenue and expenses.
          Do not enter A/R collections again as revenue, or card payments again
          as expenses already entered. Do not import outstanding liabilities as
          immediate payments. Payments count only in their scheduled months.
        </p>
        {otherOpen && (
          <div className="table-scroll">
            <table className="data-table revenue-table">
              <thead>
                <tr>
                  <th scope="col">Movement</th>
                  {months.map((month) => (
                    <th key={month} scope="col">
                      {formatMonthLabel(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.otherCashRows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="stream-name">
                        {row.name}
                        <span className={row.direction === 'in' ? 'tag' : 'tag out'}>
                          {row.direction === 'in' ? 'Inflow' : 'Outflow'}
                        </span>
                      </span>
                      <p className="row-hint">{row.hint}</p>
                    </th>
                    <AmountCells
                      label={row.name}
                      amounts={row.amounts}
                      months={months}
                      onAmount={(month, value) =>
                        setRowAmount('other', row.id, month, value)
                      }
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="chart-heading">
        <div className="panel-head">
          <h2 id="chart-heading">Ending cash</h2>
        </div>
        <CashChart months={forecast.months} />
      </section>

      <section className="panel" aria-labelledby="table-heading">
        <div className="panel-head">
          <h2 id="table-heading">Monthly cash flow</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Beginning</th>
                <th scope="col">Revenue</th>
                <th scope="col">Other in</th>
                <th scope="col">Operating expenses</th>
                <th scope="col">Other out</th>
                <th scope="col">Ending</th>
              </tr>
            </thead>
            <tbody>
              {forecast.months.map((month) => (
                <tr
                  key={month.month}
                  className={month.endingCash < 0 ? 'shortfall' : undefined}
                >
                  <th scope="row">
                    {formatMonthLabel(month.month)}
                    {month.approximateShortfall && (
                      <span className="approx-mark">approximate</span>
                    )}
                  </th>
                  <td>{money(month.beginningCash)}</td>
                  <td>{money(month.revenueCollections)}</td>
                  <td>{money(month.otherInflows)}</td>
                  <td>{money(month.operatingExpenses)}</td>
                  <td>{money(month.otherOutflows)}</td>
                  <td>{money(month.endingCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Ending cash = beginning cash + revenue collections + other cash inflows
          − operating expenses − other cash outflows. The ending balance rolls
          into the next month. Horizon {state.forecastMonths} months from{' '}
          {formatMonthLabel(state.startMonth)}.
        </p>
      </section>
    </div>
  )
}
