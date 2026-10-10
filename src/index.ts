/**
 * day-count — ISDA day-count conventions for fixed income.
 *
 * Implements the conventions as defined in the ISDA 2006 Definitions §4.16,
 * plus 30U/360 (SIA), Actual/Actual AFB (ISDA 1998 memo) and BUS/252.
 * Dates are calendar dates: pass "YYYY-MM-DD" strings (recommended) or Date
 * objects, which are read as UTC calendar dates.
 */

export type DayCountConvention =
  | "30/360"        // ISDA 2006 §4.16(f) — 30/360 Bond Basis (US)
  | "30E/360"       // ISDA 2006 §4.16(g) — Eurobond Basis
  | "30E/360-ISDA"  // ISDA 2006 §4.16(h)
  | "30U/360"       // 30/360 US (SIA) with the February month-end rule
  | "ACT/360"       // ISDA 2006 §4.16(e)
  | "ACT/365F"      // ISDA 2006 §4.16(d) — Actual/365 Fixed
  | "ACT/ACT-ISDA"  // ISDA 2006 §4.16(b)
  | "ACT/ACT-ICMA"  // ISDA 2006 §4.16(c) — the US Treasury / bond coupon basis
  | "ACT/ACT-AFB"   // ISDA 1998 memo "Actual/Actual (Euro)" — French AFB basis
  | "BUS/252";      // Business days / 252 — Brazilian basis (needs a calendar)

export type DateInput = string | Date;

export interface YearFractionOptions {
  /**
   * 30E/360-ISDA only: the schedule's termination (maturity) date. When the
   * end date is the termination date and falls on the last day of February,
   * it is NOT adjusted to 30. Omit if the end date is not the termination.
   */
  terminationDate?: DateInput;
  /** ACT/ACT-ICMA only: coupon payments per year (1, 2, 4, 12). */
  frequency?: number;
  /** ACT/ACT-ICMA only: start of the coupon period. Defaults to `start`. */
  periodStart?: DateInput;
  /** ACT/ACT-ICMA only: end of the coupon period (next coupon date). */
  periodEnd?: DateInput;
  /**
   * BUS/252 only: holiday calendar. Either a predicate `(isoDate) => boolean`
   * returning true for holidays, or a list/Set of "YYYY-MM-DD" holiday dates.
   * Weekends are always non-business days. Required for BUS/252.
   */
  holidays?: ((isoDate: string) => boolean) | Iterable<string>;
}

interface YMD {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function toYMD(input: DateInput, label: string): YMD {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new RangeError(`Invalid Date for ${label}`);
    }
    return { y: input.getUTCFullYear(), m: input.getUTCMonth() + 1, d: input.getUTCDate() };
  }
  const m = DATE_RE.exec(input);
  if (!m) {
    throw new RangeError(`Invalid date for ${label}: "${input}" (expected YYYY-MM-DD)`);
  }
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const check = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  if (
    check.getUTCFullYear() !== ymd.y ||
    check.getUTCMonth() + 1 !== ymd.m ||
    check.getUTCDate() !== ymd.d
  ) {
    throw new RangeError(`Invalid calendar date for ${label}: "${input}"`);
  }
  return ymd;
}

function utc(a: YMD): number {
  return Date.UTC(a.y, a.m - 1, a.d);
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isLastDayOfMonth(a: YMD): boolean {
  return a.d === daysInMonth(a.y, a.m);
}

/** Actual calendar days from `a` to `b` (b − a). */
function actualDays(a: YMD, b: YMD): number {
  return Math.round((utc(b) - utc(a)) / MS_PER_DAY);
}

function days30360(a: YMD, b: YMD): number {
  let d1 = a.d;
  let d2 = b.d;
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
}

function days30E360(a: YMD, b: YMD): number {
  const d1 = a.d === 31 ? 30 : a.d;
  const d2 = b.d === 31 ? 30 : b.d;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
}

function days30E360ISDA(a: YMD, b: YMD, termination?: YMD): number {
  const d1 = isLastDayOfMonth(a) ? 30 : a.d;
  const endIsTermination =
    termination !== undefined &&
    termination.y === b.y &&
    termination.m === b.m &&
    termination.d === b.d;
  const d2 =
    isLastDayOfMonth(b) && !(endIsTermination && b.m === 2) ? 30 : b.d;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
}

/**
 * 30/360 US (SIA Standard Securities Calculation Methods): Bond Basis plus the
 * February month-end rule, matching QuantLib's Thirty360(USA).
 *   1. D1 and D2 both the last day of February → D2 = 30
 *   2. D1 the last day of February → D1 = 30
 *   3. D2 = 31 and D1 ≥ 30 → D2 = 30
 *   4. D1 = 31 → D1 = 30
 */
function days30U360(a: YMD, b: YMD): number {
  let d1 = a.d;
  let d2 = b.d;
  const febEnd1 = a.m === 2 && isLastDayOfMonth(a);
  const febEnd2 = b.m === 2 && isLastDayOfMonth(b);
  if (febEnd1 && febEnd2) d2 = 30;
  if (febEnd1) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  if (d1 === 31) d1 = 30;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
}

function cmp(a: YMD, b: YMD): number {
  return utc(a) - utc(b);
}

/**
 * Actual/Actual AFB (ISDA 1998 "Actual/Actual (Euro)"): count whole years
 * back from the end date; the remaining stub is divided by 366 if it contains
 * a 29 February, else 365. Stepping back a year from 29 February lands on
 * 28 February (and from 28 February onto 29 February of a leap year).
 */
function yfActActAFB(a: YMD, b: YMD): number {
  if (cmp(a, b) === 0) return 0;
  if (cmp(a, b) > 0) return -yfActActAFB(b, a);
  let years = 0;
  let end = b;
  for (;;) {
    const y = end.y - 1;
    let prev: YMD;
    if (end.m === 2 && end.d >= 28) prev = { y, m: 2, d: isLeap(y) && end.d === 28 ? 29 : 28 };
    else prev = { y, m: end.m, d: end.d };
    if (cmp(prev, a) < 0) break;
    years++;
    end = prev;
  }
  // Does the stub accrue over a 29 February, i.e. a ≤ 29 Feb < end?
  let den = 365;
  for (let y = a.y; y <= end.y; y++) {
    if (!isLeap(y)) continue;
    const feb29: YMD = { y, m: 2, d: 29 };
    if (cmp(a, feb29) <= 0 && cmp(feb29, end) < 0) den = 366;
  }
  return years + actualDays(a, end) / den;
}

function holidayPredicate(h: YearFractionOptions["holidays"]): (iso: string) => boolean {
  if (h === undefined) {
    throw new RangeError("BUS/252 requires opts.holidays (a predicate or a list of holiday dates)");
  }
  if (typeof h === "function") return h;
  const set = h instanceof Set ? (h as Set<string>) : new Set(h);
  return (iso) => set.has(iso);
}

function isoOf(a: YMD): string {
  return `${String(a.y).padStart(4, "0")}-${String(a.m).padStart(2, "0")}-${String(a.d).padStart(2, "0")}`;
}

/**
 * Business days in [a, b) — start inclusive, end exclusive — or the negative
 * count of [b, a) when b < a.
 */
function businessDays(a: YMD, b: YMD, isHoliday: (iso: string) => boolean): number {
  if (cmp(a, b) > 0) return -businessDays(b, a, isHoliday);
  let n = 0;
  const end = utc(b);
  for (let t = utc(a); t < end; t += MS_PER_DAY) {
    const d = new Date(t);
    const w = d.getUTCDay();
    if (w === 0 || w === 6) continue;
    if (!isHoliday(isoOf({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }))) n++;
  }
  return n;
}

/**
 * Day count from `start` to `end` under a convention: actual calendar days
 * for the ACT conventions, the 360-basis count for the 30/360 family.
 */
export function dayCount(
  start: DateInput,
  end: DateInput,
  convention: DayCountConvention,
  opts: YearFractionOptions = {},
): number {
  const a = toYMD(start, "start");
  const b = toYMD(end, "end");
  switch (convention) {
    case "30/360":
      return days30360(a, b);
    case "30E/360":
      return days30E360(a, b);
    case "30E/360-ISDA":
      return days30E360ISDA(
        a,
        b,
        opts.terminationDate === undefined ? undefined : toYMD(opts.terminationDate, "terminationDate"),
      );
    case "30U/360":
      return days30U360(a, b);
    case "ACT/360":
    case "ACT/365F":
    case "ACT/ACT-ISDA":
    case "ACT/ACT-ICMA":
    case "ACT/ACT-AFB":
      return actualDays(a, b);
    case "BUS/252":
      return businessDays(a, b, holidayPredicate(opts.holidays));
    default:
      throw new RangeError(`Unknown day-count convention: "${convention satisfies never}"`);
  }
}

/**
 * Year fraction from `start` to `end` under a convention.
 *
 * ```ts
 * yearFraction("2026-01-15", "2026-07-15", "ACT/360");   // 181/360
 * yearFraction("2003-11-01", "2004-05-01", "ACT/ACT-ISDA"); // 61/365 + 121/366
 * yearFraction("2026-05-15", "2026-07-10", "ACT/ACT-ICMA", {
 *   periodEnd: "2026-11-15",
 *   frequency: 2,
 * }); // 56 / (2 × 184)
 * ```
 */
export function yearFraction(
  start: DateInput,
  end: DateInput,
  convention: DayCountConvention,
  opts: YearFractionOptions = {},
): number {
  const a = toYMD(start, "start");
  const b = toYMD(end, "end");

  switch (convention) {
    case "30/360":
      return days30360(a, b) / 360;
    case "30E/360":
      return days30E360(a, b) / 360;
    case "30E/360-ISDA":
      return (
        days30E360ISDA(
          a,
          b,
          opts.terminationDate === undefined ? undefined : toYMD(opts.terminationDate, "terminationDate"),
        ) / 360
      );
    case "30U/360":
      return days30U360(a, b) / 360;
    case "ACT/360":
      return actualDays(a, b) / 360;
    case "ACT/365F":
      return actualDays(a, b) / 365;
    case "ACT/ACT-ISDA": {
      if (a.y === b.y) {
        return actualDays(a, b) / (isLeap(a.y) ? 366 : 365);
      }
      const startYearEnd: YMD = { y: a.y + 1, m: 1, d: 1 };
      const endYearStart: YMD = { y: b.y, m: 1, d: 1 };
      return (
        actualDays(a, startYearEnd) / (isLeap(a.y) ? 366 : 365) +
        (b.y - a.y - 1) +
        actualDays(endYearStart, b) / (isLeap(b.y) ? 366 : 365)
      );
    }
    case "ACT/ACT-ICMA": {
      const { frequency, periodEnd } = opts;
      if (frequency === undefined || periodEnd === undefined) {
        throw new RangeError(
          "ACT/ACT-ICMA requires opts.frequency and opts.periodEnd (and optionally opts.periodStart)",
        );
      }
      if (!Number.isInteger(frequency) || frequency <= 0) {
        throw new RangeError(`Invalid frequency: ${frequency}`);
      }
      const ps = opts.periodStart === undefined ? a : toYMD(opts.periodStart, "periodStart");
      const pe = toYMD(periodEnd, "periodEnd");
      const periodDays = actualDays(ps, pe);
      if (periodDays <= 0) {
        throw new RangeError("periodEnd must be after periodStart");
      }
      // The formula is only valid inside one (regular or notional) coupon
      // period. Outside it the result would be silently wrong, so refuse.
      for (const [x, label] of [[a, "start"], [b, "end"]] as const) {
        if (cmp(x, ps) < 0 || cmp(x, pe) > 0) {
          throw new RangeError(
            `ACT/ACT-ICMA: ${label} (${isoOf(x)}) must lie within the coupon period ` +
              `${isoOf(ps)} → ${isoOf(pe)}; split longer accruals at coupon dates`,
          );
        }
      }
      return actualDays(a, b) / (frequency * periodDays);
    }
    case "ACT/ACT-AFB":
      return yfActActAFB(a, b);
    case "BUS/252":
      return businessDays(a, b, holidayPredicate(opts.holidays)) / 252;
    default:
      throw new RangeError(`Unknown day-count convention: "${convention satisfies never}"`);
  }
}

/** All supported conventions. */
export const CONVENTIONS: readonly DayCountConvention[] = [
  "30/360",
  "30E/360",
  "30E/360-ISDA",
  "ACT/360",
  "ACT/365F",
  "ACT/ACT-ISDA",
  "ACT/ACT-ICMA",
  "30U/360",
  "ACT/ACT-AFB",
  "BUS/252",
];
