import { NextResponse } from 'next/server';

export function ok(data: unknown, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export { money, computeSessionBill, buildRevenueLogPayload, businessDate, isToday, resolveRate } from './billing';
