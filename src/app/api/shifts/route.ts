import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Shift from '@/models/Shift';
import RevenueLog from '@/models/RevenueLog';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET /api/shifts — list recent shifts (most recent first)
export async function GET() {
  try {
    await connectDB();
    const shifts = await Shift.find().sort({ startedAt: -1 }).limit(50).lean();
    return ok(shifts);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load shifts', 500);
  }
}

// POST /api/shifts — start a new shift
// body: { staffName: string, startingCash?: number }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const staffName = body.staffName?.trim();
    if (!staffName) return fail('staffName is required');

    // Check if this staff already has an active shift
    const existing = await Shift.findOne({ staffName, status: 'active' });
    if (existing) {
      return fail(`You already have an active shift started at ${new Date(existing.startedAt).toLocaleTimeString()}. End it first.`, 409);
    }

    // Also check if ANY active shift exists (only one shift at a time)
    const anyActive = await Shift.findOne({ status: 'active' });
    if (anyActive) {
      return fail(`A shift is already active (started by ${anyActive.staffName}). Only one active shift at a time.`, 409);
    }

    const shift = await Shift.create({
      staffName,
      startedAt: new Date(),
      startingCash: body.startingCash ?? 0,
      status: 'active',
    });

    return ok(shift, 201);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to start shift', 500);
  }
}
