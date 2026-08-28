import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import MenuItem from '@/models/MenuItem';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// PATCH /api/menu/:id - update price/name/stock/etc.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const body = await req.json();

    const item = await MenuItem.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true, runValidators: true }
    );
    if (!item) return fail('Menu item not found', 404);

    return ok(item);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to update menu item', 500);
  }
}

// DELETE /api/menu/:id
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await connectDB();
    const deleted = await MenuItem.findByIdAndDelete(params.id);
    if (!deleted) return fail('Menu item not found', 404);
    return ok({ deleted: true });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to delete menu item', 500);
  }
}
