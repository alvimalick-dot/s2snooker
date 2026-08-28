import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/comp — comp or discount a specific order item
// body: { itemId: string, action: 'comp' | 'discount', discountPercent?: number, reason?: string }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.itemId) return fail('itemId is required');
    if (!body.action || !['comp', 'discount', 'uncomp'].includes(body.action)) {
      return fail('action must be comp, discount, or uncomp');
    }

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('No active session on this table', 409);

    const order = table.currentSession.activeOrders.id(body.itemId);
    if (!order) return fail('Order item not found', 404);

    if (body.action === 'comp') {
      order.isComp = true;
      order.compReason = body.reason ?? 'Owner comp';
      order.discountPercent = 0;
    } else if (body.action === 'discount') {
      order.isComp = false;
      order.discountPercent = Math.min(100, Math.max(0, Number(body.discountPercent) || 0));
      order.compReason = body.reason ?? '';
    } else if (body.action === 'uncomp') {
      order.isComp = false;
      order.discountPercent = 0;
      order.compReason = '';
    }

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to update item', 500);
  }
}
