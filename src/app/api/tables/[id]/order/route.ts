import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import MenuItem from '@/models/MenuItem';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/tables/:id/order - add a menu item to the table's active order
// body: { menuItemId: string, quantity?: number }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();
    if (!body.menuItemId) return fail('menuItemId is required');

    const quantity = body.quantity ?? 1;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return fail('quantity must be a whole number of at least 1');
    }

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('Table has no active session to order against', 409);

    const menuItem = await MenuItem.findById(body.menuItemId);
    if (!menuItem) return fail('Menu item not found', 404);
    // Mirror the UI's disabled state on the server: an item that's out of
    // stock (86'd) shouldn't be orderable even by a direct API call, e.g.
    // from a stale page that hasn't refreshed its menu yet.
    if (!menuItem.inStock) return fail(`${menuItem.itemName} is currently out of stock`, 409);

    table.currentSession.activeOrders.push({
      menuItemId: menuItem._id,
      itemName: menuItem.itemName,
      quantity,
      price: menuItem.price,
      timestamp: new Date(),
    } as any);

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to add order', 500);
  }
}

// DELETE /api/tables/:id/order?orderId=... - remove one order line from the active session
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const orderId = req.nextUrl.searchParams.get('orderId');
    if (!orderId) return fail('orderId query param is required');

    const table = await Table.findById(params.id);
    if (!table) return fail('Table not found', 404);
    if (!table.currentSession) return fail('Table has no active session', 409);

    table.currentSession.activeOrders = table.currentSession.activeOrders.filter(
      (o: any) => String(o._id) !== orderId
    ) as any;

    await table.save();
    return ok(table);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to remove order', 500);
  }
}
