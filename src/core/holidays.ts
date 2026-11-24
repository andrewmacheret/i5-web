import type { DayKey } from './models.ts';
import { addDays, dayKey, splitDay, validDay, weekday } from './seattle.ts';

// Holidays when WSDOT may run the lanes differently. WSDOT's page doesn't list
// holiday schedules, so on these days the app says it can't confirm.

const MONDAY = 1;
const THURSDAY = 4;

function nth(n: number, wd: number, month: number, year: number): DayKey {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const key = validDay(year, month, d);
    if (key && weekday(key) === wd && ++count === n) return key;
  }
  return dayKey(year, month, 1);
}

function last(wd: number, month: number, year: number): DayKey {
  for (let d = 31; d >= 1; d--) {
    const key = validDay(year, month, d);
    if (key && weekday(key) === wd) return key;
  }
  return dayKey(year, month, 1);
}

/** Saturday holidays move to Friday, Sunday ones to Monday */
function observed(day: DayKey): DayKey {
  const wd = weekday(day);
  return wd === 6 ? addDays(day, -1) : wd === 0 ? addDays(day, 1) : day;
}

export function holidayName(day: DayKey): string | null {
  const y = splitDay(day).year;
  const thanksgiving = nth(4, THURSDAY, 11, y);
  const fixed: [number, number, string][] = [
    [1, 1, "New Year's Day"],
    [6, 19, 'Juneteenth'],
    [7, 4, 'Independence Day'],
    [11, 11, 'Veterans Day'],
    [12, 25, 'Christmas'],
  ];
  const list: [DayKey, string][] = [
    [observed(dayKey(y, 1, 1)), "New Year's Day"],
    [nth(3, MONDAY, 1, y), 'Martin Luther King Jr. Day'],
    [nth(3, MONDAY, 2, y), 'Presidents Day'],
    [last(MONDAY, 5, y), 'Memorial Day'],
    [observed(dayKey(y, 6, 19)), 'Juneteenth'],
    [observed(dayKey(y, 7, 4)), 'Independence Day'],
    [nth(1, MONDAY, 9, y), 'Labor Day'],
    [observed(dayKey(y, 11, 11)), 'Veterans Day'],
    [thanksgiving, 'Thanksgiving'],
    [dayKey(y, 12, 24), 'Christmas Eve'],
    [observed(dayKey(y, 12, 25)), 'Christmas'],
    [dayKey(y, 12, 31), "New Year's Eve"],
    [addDays(thanksgiving, 1), 'Day after Thanksgiving'],
    // The real date too, when the holiday is observed on another day
    ...fixed.map(([m, d, name]): [DayKey, string] => [dayKey(y, m, d), name]),
  ];
  return list.find(([d]) => d === day)?.[1] ?? null;
}
