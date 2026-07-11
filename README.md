# day-count-conventions

ISDA day-count conventions for JavaScript/TypeScript — **30/360**, **30E/360**, **30E/360-ISDA**, **ACT/360**, **ACT/365F**, **ACT/ACT-ISDA**, **ACT/ACT-ICMA**. Zero dependencies.

```
npm install day-count-conventions
```

## Why

Every interest accrual, swap leg, and bond coupon depends on a day-count convention, and the details are famously fiddly: does the 31st count as the 30th? Is February month-end special? Which ACT/ACT is *your* ACT/ACT? npm had no focused, typed implementation of the ISDA 2006 §4.16 definitions — this is that package.

```ts
import { dayCount, yearFraction } from "day-count";

yearFraction("2026-01-15", "2026-07-15", "ACT/360");      // 181/360
yearFraction("2007-01-31", "2007-02-28", "30/360");       // 28/360 (D1 31→30)
yearFraction("2003-11-01", "2004-05-01", "ACT/ACT-ISDA"); // 61/365 + 121/366

// The US Treasury coupon basis:
yearFraction("2026-05-15", "2026-07-15", "ACT/ACT-ICMA", {
  periodEnd: "2026-11-15",  // next coupon
  frequency: 2,             // semiannual
}); // 61 / (2 × 184)
```

## API

### `yearFraction(start, end, convention, opts?) → number`

The year fraction between two dates. Dates are `"YYYY-MM-DD"` strings (recommended) or `Date` objects read as UTC calendar dates. Invalid or impossible dates throw `RangeError`.

- **`ACT/ACT-ICMA`** requires `opts.frequency` (coupon payments/year) and `opts.periodEnd` (next coupon date); `opts.periodStart` defaults to `start`. This is the convention for US Treasury notes and bonds.
- **`30E/360-ISDA`** accepts `opts.terminationDate`: when the end date *is* the maturity and falls on the last day of February, it is not adjusted to 30, per ISDA 2006 §4.16(h).

### `dayCount(start, end, convention, opts?) → number`

The day count under the convention: actual calendar days for ACT conventions, the 360-basis count for the 30/360 family.

### `CONVENTIONS`

The list of supported convention strings.

## Correctness

- Anchored to published examples (the ISDA EMU-memo ACT/ACT case; a live US Treasury accrual reproduced to TreasuryDirect's own published accrued interest).
- Cross-checked against an **independent Python reference implementation** ([`test/generate-fixtures.py`](test/generate-fixtures.py)) over 345 fixtures, including month-end, leap-February, and termination-date edge cases.
- All day arithmetic uses UTC calendar math — no timezone drift, no DST surprises.

## Related

Part of a small fixed-income toolkit: [`32nds`](https://github.com/moshejs/32nds) (Treasury quote notation) · [`accrued-interest`](https://github.com/moshejs/accrued-interest) · [`sifma-holidays`](https://github.com/moshejs/sifma-holidays) (bond-market calendar) · [`treasurydirect`](https://github.com/moshejs/treasurydirect) (auction data client).

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
