import { describe, expect, it } from "vitest";
import { CONVENTIONS, dayCount, yearFraction } from "../src/index.js";
import fixtures from "./fixtures.json";

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
    expect(CONVENTIONS).toHaveLength(7);
  });
});

describe("cross-check against independent Python reference", () => {
  it(`matches all ${fixtures.length} generated fixtures`, () => {
    for (const f of fixtures) {
      const opts = "terminationDate" in f ? { terminationDate: f.terminationDate as string } : {};
      const got = yearFraction(f.start, f.end, f.convention as never, opts);
      expect(got, `${f.convention} ${f.start} → ${f.end}`).toBeCloseTo(f.yearFraction, 12);
    }
  });
});
