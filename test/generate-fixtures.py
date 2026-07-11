#!/usr/bin/env python3
"""Independent reference implementation of ISDA 2006 day-count conventions.

Generates test/fixtures.json used by the vitest suite to cross-check the
TypeScript implementation. Written separately from the TS code, directly from
the ISDA 2006 definitions (§4.16), as a guard against transcription bugs.
"""
import calendar
import json
import random
from datetime import date, timedelta

random.seed(32)  # deterministic fixtures


def is_leap(y):
    return calendar.isleap(y)


def days_between(a, b):
    return (b - a).days


def last_dom(d):
    return d.day == calendar.monthrange(d.year, d.month)[1]


def d30360(a, b):
    d1, d2 = a.day, b.day
    if d1 == 31:
        d1 = 30
    if d2 == 31 and d1 == 30:
        d2 = 30
    return 360 * (b.year - a.year) + 30 * (b.month - a.month) + (d2 - d1)


def d30e360(a, b):
    d1 = 30 if a.day == 31 else a.day
    d2 = 30 if b.day == 31 else b.day
    return 360 * (b.year - a.year) + 30 * (b.month - a.month) + (d2 - d1)


def d30e360isda(a, b, termination=None):
    d1 = 30 if last_dom(a) else a.day
    end_is_term = termination is not None and b == termination
    d2 = 30 if (last_dom(b) and not (end_is_term and b.month == 2)) else b.day
    return 360 * (b.year - a.year) + 30 * (b.month - a.month) + (d2 - d1)


def yf(a, b, conv, termination=None):
    if conv == "30/360":
        return d30360(a, b) / 360
    if conv == "30E/360":
        return d30e360(a, b) / 360
    if conv == "30E/360-ISDA":
        return d30e360isda(a, b, termination) / 360
    if conv == "ACT/360":
        return days_between(a, b) / 360
    if conv == "ACT/365F":
        return days_between(a, b) / 365
    if conv == "ACT/ACT-ISDA":
        if a.year == b.year:
            return days_between(a, b) / (366 if is_leap(a.year) else 365)
        first = days_between(a, date(a.year + 1, 1, 1)) / (366 if is_leap(a.year) else 365)
        last = days_between(date(b.year, 1, 1), b) / (366 if is_leap(b.year) else 365)
        return first + (b.year - a.year - 1) + last
    raise ValueError(conv)


def rand_date():
    start = date(1995, 1, 1)
    return start + timedelta(days=random.randrange(0, 40 * 365))


fixtures = []
convs = ["30/360", "30E/360", "30E/360-ISDA", "ACT/360", "ACT/365F", "ACT/ACT-ISDA"]
for _ in range(300):
    a, b = sorted((rand_date(), rand_date()))
    conv = random.choice(convs)
    fixtures.append(
        {
            "start": a.isoformat(),
            "end": b.isoformat(),
            "convention": conv,
            "yearFraction": yf(a, b, conv),
        }
    )

# Edge-heavy pairs: month ends, Feb 28/29, 31sts
edges = [
    ("2007-01-31", "2007-02-28"),
    ("2007-02-28", "2007-03-31"),
    ("2008-02-29", "2008-03-31"),
    ("2008-01-31", "2008-02-29"),
    ("2011-12-31", "2012-12-31"),
    ("2004-02-29", "2005-02-28"),
    ("2000-02-29", "2000-03-01"),
]
for s, e in edges:
    a, b = date.fromisoformat(s), date.fromisoformat(e)
    for conv in convs:
        fixtures.append(
            {"start": s, "end": e, "convention": conv, "yearFraction": yf(a, b, conv)}
        )

# 30E/360-ISDA termination-date cases (end on last day of Feb)
for s, e, term in [
    ("2011-08-31", "2012-02-29", "2012-02-29"),
    ("2011-08-31", "2012-02-29", "2015-02-28"),
    ("2012-02-29", "2013-02-28", "2013-02-28"),
]:
    a, b, t = date.fromisoformat(s), date.fromisoformat(e), date.fromisoformat(term)
    fixtures.append(
        {
            "start": s,
            "end": e,
            "convention": "30E/360-ISDA",
            "terminationDate": term,
            "yearFraction": yf(a, b, "30E/360-ISDA", t),
        }
    )

with open("test/fixtures.json", "w") as f:
    json.dump(fixtures, f, indent=1)
print(f"wrote {len(fixtures)} fixtures")
