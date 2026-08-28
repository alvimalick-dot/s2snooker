import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const table = await Table.findById(params.id).lean();
    if (!table) return fail('Table not found', 404);
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load table', 500);
  }
}

// PATCH /api/tables/:id - set/clear a reservation, rename, etc.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);

    if (body.reservation === null) {
      table.reservation = null as any;
      if (table.status === 'reserved') table.status = 'available';
    } else if (body.reservation) {
      table.reservation = body.reservation;
      if (table.status === 'available') table.status = 'reserved';
    }

    if (body.label) table.label = body.label;

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to update table', 500);
  }
}

// DELETE /api/tables/:id - remove a table entirely (setup/admin use only)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const deleted = await Table.findByIdAndDelete(params.id);
    if (!deleted) return fail('Table not found', 404);
    return ok({ deleted: true });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to delete table', 500);
  }
}
