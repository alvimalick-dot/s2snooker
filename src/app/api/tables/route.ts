import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic'; // always fetch live data, never cache

// GET /api/tables - list every table, sorted by table number
export async function GET() {
  try {
    await connectDB();
    const tables = await Table.find().sort({ tableNumber: 1 }).lean();
    return ok(tables);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load tables', 500);
  }
}

// POST /api/tables - create a new table (used once during setup, or to add a table)
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    if (typeof body.tableNumber !== 'number') {
      return fail('tableNumber (number) is required');
    }

    const exists = await Table.findOne({ tableNumber: body.tableNumber });
    if (exists) return fail(`Table ${body.tableNumber} already exists`, 409);

    const table = await Table.create({
      tableNumber: body.tableNumber,
      label: body.label ?? `Table ${body.tableNumber}`,
      isPrivateRoom: body.isPrivateRoom ?? false,
      status: 'available',
    });

    return ok(table, 201);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to create table', 500);
  }
}
