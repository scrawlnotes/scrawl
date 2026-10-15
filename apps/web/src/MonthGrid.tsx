import { dayOf } from '@scrawlnotes/core';
import { locale, t } from '@scrawlnotes/i18n';
import { useState } from 'react';
import { Icon } from './Icon';

/** The first day of the month a day is in. */
const monthOf = (day: string) => {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1);
};

/** The month a picker shows: the one of the day set, else this one; ‹ and › change it. */
export const useMonth = (day: string) => useState(() => monthOf(day));

/**
 * A month to pick a day in, a week starting on Monday: its name with ‹ and ›, then its days, those
 * before today faint, today in the accent, the one set filled. It goes inside the element that
 * sets its look: a phone's sheet, or a picker on a computer.
 */
export function MonthGrid({ month, onMonth, today, current, onPick }: {
  /** The month's first day. */
  month: Date;
  onMonth: (month: Date) => void;
  today: string;
  current: string | null;
  onPick: (day: string) => void;
}) {
  const blanks = (month.getDay() + 6) % 7;
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const shift = (by: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const initials = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }));
  return (
    <>
      <div className="mh">
        {month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
        <span>
          <button type="button" aria-label={t('phone.previousMonth')} title={t('phone.previousMonth')} onClick={() => shift(-1)}>
            <Icon name="back" />
          </button>
          <button type="button" aria-label={t('phone.nextMonth')} title={t('phone.nextMonth')} onClick={() => shift(1)}>
            <Icon name="chevron" />
          </button>
        </span>
      </div>
      <div className="g">
        {initials.map((initial, i) => (
          <span key={`w${i}`} className="w">
            {initial}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const day = dayOf(new Date(month.getFullYear(), month.getMonth(), i + 1));
          const classes = [day < today && 'past', day === today && 'today', day === current && 'on'].filter(Boolean).join(' ');
          return (
            <button key={day} type="button" className={classes || undefined} aria-pressed={day === current} onClick={() => onPick(day)}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </>
  );
}
