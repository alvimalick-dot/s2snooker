import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/release — release (cancel) a reservation, freeing the table
// No body required. The table goes from 'reserved' → 'available'.
// This is the clean alternative to force-starting a fake session just to end it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (table.status !== 'reserved') return fail('Table is not reserved', 409);

    const releasedName = table.reservation?.customerName ?? 'Unknown';

    table.status = 'available';
    table.reservation = null as any;
    await table.save();

    return ok({ table, releasedCustomer: releasedName });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to release reservation', 500);
  }
}
