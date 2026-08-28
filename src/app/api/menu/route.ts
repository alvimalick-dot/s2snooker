import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import MenuItem from '@/models/MenuItem';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET /api/menu - list all menu items
export async function GET() {
  try {
    await connectDB();
    const items = await MenuItem.find().sort({ category: 1, itemName: 1 }).lean();
    return ok(items);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load menu', 500);
  }
}

// POST /api/menu - add a new menu item
// body: { itemName, price, category?, description?, inStock? }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    if (!body.itemName) return fail('itemName is required');
    if (typeof body.price !== 'number') return fail('price (number) is required');

    const item = await MenuItem.create({
      itemName: body.itemName,
      price: body.price,
      category: body.category ?? 'Snacks',
      description: body.description ?? '',
      inStock: body.inStock ?? true,
    });

    return ok(item, 201);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to create menu item', 500);
  }
}
