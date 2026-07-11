/**
 * day-count — ISDA day-count conventions for fixed income.
 *
 * Implements the conventions as defined in the ISDA 2006 Definitions §4.16.
 * Dates are calendar dates: pass "YYYY-MM-DD" strings (recommended) or Date
 * objects, which are read as UTC calendar dates.
 */

export type DayCountConvention =
  | "30/360"        // ISDA 2006 §4.16(f) — 30/360 Bond Basis (US)
  | "30E/360"       // ISDA 2006 §4.16(g) — Eurobond Basis
  | "30E/360-ISDA"  // ISDA 2006 §4.16(h)
  | "ACT/360"       // ISDA 2006 §4.16(e)
  | "ACT/365F"      // ISDA 2006 §4.16(d) — Actual/365 Fixed
  | "ACT/ACT-ISDA"  // ISDA 2006 §4.16(b)
  | "ACT/ACT-ICMA"; // ISDA 2006 §4.16(c) — the US Treasury / bond coupon basis

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
    case "ACT/360":
    case "ACT/365F":
    case "ACT/ACT-ISDA":
    case "ACT/ACT-ICMA":
      return actualDays(a, b);
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
      return actualDays(a, b) / (frequency * periodDays);
    }
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
];
