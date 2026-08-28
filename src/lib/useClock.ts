'use client';

import { useEffect, useState } from 'react';

/** Re-renders the calling component once a second so live timers/bills stay current. */
export function useClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Parse a display time string like "7:00 PM" or "19:00" into a Date
 * set to today at that time. Returns null if unparseable.
 */
export function parseReservationTime(timeStr: string): Date | null {
  if (!timeStr) return null;
  const now = new Date();

  // Try 12-hour format: "7:00 PM", "7 PM", "7:00PM"
  const twelveHr = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)$/i);
  if (twelveHr) {
    let hours = parseInt(twelveHr[1], 10);
    const minutes = parseInt(twelveHr[2] ?? '0', 10);
    const ampm = twelveHr[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(now);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  // Try 24-hour format: "19:00", "7:30"
  const twentyFourHr = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHr) {
    const hours = parseInt(twentyFourHr[1], 10);
    const minutes = parseInt(twentyFourHr[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const d = new Date(now);
      d.setHours(hours, minutes, 0, 0);
      return d;
    }
  }

  return null;
}

/**
 * Returns minutes past the reservation time, or 0 if not past yet.
 * Positive = late, negative = not yet due.
 */
export function reservationMinutesPast(timeStr: string): number {
  const reservationTime = parseReservationTime(timeStr);
  if (!reservationTime) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - reservationTime.getTime()) / 60000);
}

/**
 * Returns today's date string in PKT (UTC+5) as YYYY-MM-DD.
 * Mirrors the server-side businessDate() so client queries match.
 */
export function todayPKT(): string {
  const PKT_OFFSET = 5 * 60; // +05:00 in minutes
  const now = new Date();
  const pkt = new Date(now.getTime() + PKT_OFFSET * 60000);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pkt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
