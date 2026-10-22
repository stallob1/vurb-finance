# The Vurb Company — Cash Runway

A one-page, 12-month cash runway calculator. There is no login, backend, or import. Every revenue, payroll, and expense line starts at $0. Inputs are saved in this browser under `vurb-finance-runway-v1`.

## Defaults

- Opening cash: **$15,276.60**, labeled as the September 2026 ending cash after uncleared items (a reference balance).
- Forecast start: **November 2026**. A flag stays visible until the forecast starts in September 2026, because that reference balance still needs to be updated to the forecast date.
- October–December placeholder zeros are not treated as cash balances. Receivables and intercompany amounts are not added to opening cash.
- Revenue rows: Advertising, Production, Apparel, Events. Optional rows can be added, including a Prospect service contract. Contract income is not preloaded.
- Payroll starts as blank $0 rows. Each person’s pay is entered once.
- Expense buckets start at $0 and repeat from an editable effective month, with per-month overrides. Event costs and production project costs can also take one-time payments.
- Other cash movements (A/R collections, debt and payable payments, owner distributions, funding) start at $0, collapsed, and outside operating revenue and expenses.

Ending cash = beginning cash + revenue collections + other cash inflows − operating expenses − other cash outflows. That ending balance rolls into the next month.

Runway stops at the first month cash goes negative. A partial month is labeled approximate. No cash outflow reads “No cash burn.” Cash that stays positive for all 12 months reads “12+ months.”

**Reset** restores $15,276.60, November 2026, and a zero budget.

## Run

```bash
npm install
npm run dev
```

The app is served with base path `/vurb-finance/` (usually `http://localhost:5173/vurb-finance/`).

## Scripts

- `npm test` — forecast, runway, override, and storage-key checks
- `npm run build` — typecheck and production build
- `npm run lint` — oxlint
