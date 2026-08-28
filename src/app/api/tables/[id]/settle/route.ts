import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/settle — record a settlement (payment, comp, discount) on the running session
// body: { type: 'cash'|'card'|'account'|'comp'|'discount'|'adjustment', amount: number, description?: string, staffName?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.type) return fail('type is required (cash, card, account, comp, discount, adjustment)');
    if (typeof body.amount !== 'number' || body.amount === 0) return fail('amount must be a non-zero number');

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    // Initialize settlements array if needed
    if (!table.currentSession.settlements) {
      (table.currentSession as any).settlements = [];
    }

    table.currentSession.settlements.push({
      type: body.type,
      amount: body.amount,
      description: body.description ?? '',
      staffName: body.staffName ?? '',
      date: new Date(),
    } as any);

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to record settlement', 500);
  }
}
