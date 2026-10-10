import { describe, expect, it } from "vitest";
import { CONVENTIONS, dayCount, yearFraction } from "../src/index.js";
import { QUANTLIB_VERSION, brazilHolidays, bus252, icma, pairs } from "./fixtures.js";

describe("known published examples", () => {
  it("ACT/ACT-ISDA — ISDA EMU memo example (2003-11-01 → 2004-05-01)", () => {
    // 61 days in 2003 (÷365) + 121 days in 2004 (÷366)
    expect(yearFraction("2003-11-01", "2004-05-01", "ACT/ACT-ISDA")).toBeCloseTo(
      61 / 365 + 121 / 366,
      15,
    );
  });

  it("ACT/ACT-ICMA — regular semiannual period is exactly 0.5", () => {
    expect(
      yearFraction("2003-11-01", "2004-05-01", "ACT/ACT-ICMA", {
        periodEnd: "2004-05-01",
        frequency: 2,
      }),
    ).toBe(0.5);
  });

  it("ACT/ACT-ICMA — US Treasury accrual (matches TreasuryDirect)", () => {
    // T 4.375% period 2026-05-15 → 2026-11-15 (184 days), settle 2026-07-15
    // (61 accrued days): TreasuryDirect publishes accruedInterestPer1000 =
    // 7.25204 = 1000 × 4.375%/2 × yf×2
    const yf = yearFraction("2026-05-15", "2026-07-15", "ACT/ACT-ICMA", {
      periodEnd: "2026-11-15",
      frequency: 2,
    });
    expect(yf).toBe(61 / (2 * 184));
    expect(1000 * 0.04375 * yf).toBeCloseTo(7.25204, 5);
  });

  it("ACT/ACT-ISDA — short stub within one year", () => {
    expect(yearFraction("1999-02-01", "1999-07-01", "ACT/ACT-ISDA")).toBeCloseTo(150 / 365, 15);
  });

  it("30/360 month-end behavior", () => {
    expect(dayCount("2007-01-15", "2007-01-30", "30/360")).toBe(15);
    expect(dayCount("2007-01-31", "2007-02-28", "30/360")).toBe(28); // D1 31→30
    expect(dayCount("2007-02-28", "2007-03-31", "30/360")).toBe(33); // D2=31 kept (D1<30)
    expect(dayCount("2007-01-31", "2007-03-31", "30/360")).toBe(60); // both adjusted
  });

  it("30E/360 always caps the 31st", () => {
    expect(dayCount("2007-02-28", "2007-03-31", "30E/360")).toBe(32);
    expect(dayCount("2007-01-31", "2007-03-31", "30E/360")).toBe(60);
  });

  it("30E/360-ISDA treats month-end February as 30", () => {
    // Feb 29 2012 is last day of month → D1 = 30
    expect(dayCount("2012-02-29", "2012-03-30", "30E/360-ISDA")).toBe(30);
    // end is last-day-of-Feb termination date → NOT adjusted to 30
    expect(
      dayCount("2011-08-31", "2012-02-29", "30E/360-ISDA", { terminationDate: "2012-02-29" }),
    ).toBe(179);
    // same end date, but not the termination → adjusted to 30
    expect(
      dayCount("2011-08-31", "2012-02-29", "30E/360-ISDA", { terminationDate: "2015-02-28" }),
    ).toBe(180);
  });

  it("ACT/360 and ACT/365F", () => {
    expect(yearFraction("2026-01-15", "2026-07-15", "ACT/360")).toBe(181 / 360);
    expect(yearFraction("2026-01-15", "2026-07-15", "ACT/365F")).toBe(181 / 365);
  });

  it("ACT/ACT-ISDA spanning multiple years", () => {
    // 2003-11-01 → 2006-05-01: 61/365 + 2 full years + 120/365
    expect(yearFraction("2003-11-01", "2006-05-01", "ACT/ACT-ISDA")).toBeCloseTo(
      61 / 365 + 2 + 120 / 365,
      15,
    );
  });
});

describe("input handling", () => {
  it("accepts Date objects (read as UTC)", () => {
    expect(
      yearFraction(new Date(Date.UTC(2026, 0, 15)), new Date(Date.UTC(2026, 6, 15)), "ACT/360"),
    ).toBe(181 / 360);
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => yearFraction("2026-1-15", "2026-07-15", "ACT/360")).toThrow(RangeError);
    expect(() => yearFraction("2026-02-30", "2026-07-15", "ACT/360")).toThrow(RangeError);
    expect(() => yearFraction("2025-02-29", "2026-07-15", "ACT/360")).toThrow(RangeError);
    expect(() => yearFraction(new Date("nope"), "2026-07-15", "ACT/360")).toThrow(RangeError);
  });

  it("requires frequency and periodEnd for ACT/ACT-ICMA", () => {
    expect(() => yearFraction("2026-01-01", "2026-02-01", "ACT/ACT-ICMA")).toThrow(RangeError);
    expect(() =>
      yearFraction("2026-01-01", "2026-02-01", "ACT/ACT-ICMA", {
        periodEnd: "2026-01-01",
        frequency: 2,
      }),
    ).toThrow(RangeError);
  });

  it("exports the convention list", () => {
    expect(CONVENTIONS).toHaveLength(10);
  });

  it("ACT/ACT-ICMA refuses accruals outside the coupon period (was silently wrong)", () => {
    // A full year against a semiannual period used to return 365/368 ≈ 0.9918.
    expect(() =>
      yearFraction("2026-05-15", "2027-05-15", "ACT/ACT-ICMA", {
        periodEnd: "2026-11-15",
        frequency: 2,
      }),
    ).toThrow(/within the coupon period/);
    expect(() =>
      yearFraction("2026-05-14", "2026-07-15", "ACT/ACT-ICMA", {
        periodStart: "2026-05-15",
        periodEnd: "2026-11-15",
        frequency: 2,
      }),
    ).toThrow(RangeError);
    // Short first coupon: accrue from issue against the notional period.
    expect(
      yearFraction("2026-06-01", "2026-11-15", "ACT/ACT-ICMA", {
        periodStart: "2026-05-15",
        periodEnd: "2026-11-15",
        frequency: 2,
      }),
    ).toBe(167 / 368);
  });

  it("BUS/252 requires a holiday calendar", () => {
    expect(() => yearFraction("2026-01-01", "2026-02-01", "BUS/252")).toThrow(RangeError);
  });
});

describe("30U/360, ACT/ACT-AFB, BUS/252", () => {
  it("30U/360 applies the February month-end rule that 30/360 Bond Basis does not", () => {
    expect(dayCount("2007-02-28", "2007-03-31", "30/360")).toBe(33);
    expect(dayCount("2007-02-28", "2007-03-31", "30U/360")).toBe(30); // D1 Feb-end → 30, then D2 31 → 30
    expect(dayCount("2007-02-28", "2008-02-29", "30U/360")).toBe(360); // both Feb-ends
    expect(dayCount("2007-01-31", "2007-02-28", "30U/360")).toBe(28);
  });

  it("ACT/ACT-AFB — ISDA 1998 memo examples", () => {
    // 1994-02-10 → 1997-06-30: 3 whole years back from the end + 140/365
    expect(yearFraction("1994-02-10", "1997-06-30", "ACT/ACT-AFB")).toBeCloseTo(3 + 140 / 365, 15);
    // 1999-02-01 → 1999-07-01: 150/365 (no 29 Feb)
    expect(yearFraction("1999-02-01", "1999-07-01", "ACT/ACT-AFB")).toBeCloseTo(150 / 365, 15);
    // 2003-11-01 → 2004-05-01: stub contains 29 Feb 2004 → 182/366
    expect(yearFraction("2003-11-01", "2004-05-01", "ACT/ACT-AFB")).toBeCloseTo(182 / 366, 15);
  });

  it("BUS/252 counts business days start-inclusive, end-exclusive", () => {
    const holidays = ["2026-02-16", "2026-02-17"]; // Carnival Monday/Tuesday
    // Fri 2026-02-13 → Wed 2026-02-18: only Fri 13 counts
    expect(dayCount("2026-02-13", "2026-02-18", "BUS/252", { holidays })).toBe(1);
    expect(dayCount("2026-02-18", "2026-02-13", "BUS/252", { holidays })).toBe(-1);
    expect(yearFraction("2026-02-13", "2026-02-18", "BUS/252", { holidays: (d) => holidays.includes(d) })).toBe(
      1 / 252,
    );
  });
});

describe(`cross-check against QuantLib ${QUANTLIB_VERSION}`, () => {
  const convs = [
    "30/360",
    "30E/360",
    "30E/360-ISDA",
    "30U/360",
    "ACT/360",
    "ACT/365F",
    "ACT/ACT-ISDA",
    "ACT/ACT-AFB",
  ] as const;

  for (const conv of convs) {
    it(`${conv} matches ${pairs.length} QuantLib date pairs`, () => {
      for (const p of pairs) {
        const [dc, yf] = p[conv] as [number, number];
        const msg = `${conv} ${p.start} → ${p.end}`;
        expect(dayCount(p.start, p.end, conv), msg).toBe(dc);
        expect(yearFraction(p.start, p.end, conv), msg).toBeCloseTo(yf, 14);
      }
    });
  }

  it("30E/360-ISDA with the end date as termination date matches QuantLib", () => {
    for (const p of pairs) {
      const [dc, yf] = p["30E/360-ISDA@termination"] as [number, number];
      const opts = { terminationDate: p.end };
      expect(dayCount(p.start, p.end, "30E/360-ISDA", opts), `${p.start} → ${p.end}`).toBe(dc);
      expect(yearFraction(p.start, p.end, "30E/360-ISDA", opts)).toBeCloseTo(yf, 14);
    }
  });

  it(`ACT/ACT-ICMA matches ${icma.length} QuantLib (ISMA) coupon-period accruals`, () => {
    for (const f of icma) {
      const got = yearFraction(f.start, f.end, "ACT/ACT-ICMA", f);
      expect(got, `${f.start} → ${f.end} in ${f.periodStart} → ${f.periodEnd}`).toBeCloseTo(f.yearFraction, 14);
    }
  });

  it(`BUS/252 matches ${bus252.length} QuantLib Brazil-calendar intervals`, () => {
    const holidays = new Set(brazilHolidays);
    for (const f of bus252) {
      expect(dayCount(f.start, f.end, "BUS/252", { holidays }), `${f.start} → ${f.end}`).toBe(f.dayCount);
      expect(yearFraction(f.start, f.end, "BUS/252", { holidays })).toBeCloseTo(f.yearFraction, 14);
    }
  });
});
