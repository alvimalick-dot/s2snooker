import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import CustomerAccount from '@/models/CustomerAccount';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Normalize a name for consistent grouping: trimmed, lowercase. */
function normName(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

// GET /api/customers/account?name=Ali&id=abc123 — get a specific account or list all with balances
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = req.nextUrl;
    const name = searchParams.get('name');
    const customerId = searchParams.get('id');

    if (customerId) {
      // Prefer customerId lookup when available — prevents two different
      // customers who share a common name (e.g. "Ahmed") from merging.
      const account = await CustomerAccount.findOne({ customerId });
      if (!account && name) {
        // Fallback: maybe legacy record without customerId
        const fallback = await CustomerAccount.findOne({ customerName: normName(name) });
        return ok(fallback ?? null);
      }
      return ok(account ?? null);
    }

    if (name) {
      const account = await CustomerAccount.findOne({ customerName: normName(name) });
      if (!account) return ok(null);
      return ok(account);
    }

    // List all accounts, sorted by balance (biggest debtor first)
    const accounts = await CustomerAccount.find({ isActive: true })
      .sort({ balance: -1 })
      .lean();
    return ok(accounts);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load customer accounts', 500);
  }
}

// POST /api/customers/account — create or update account settings
// body: { customerId?, customerName, creditLimit?, notes?, isActive? }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const customerName = body.customerName?.trim();
    if (!customerName) return fail('customerName is required');
    const customerId = body.customerId ?? null;

    // When a customerId is provided, look up by customerId first — this
    // ensures two different customers named "Ahmed" never merge into the
    // same account/balance.
    const lookup = customerId
      ? { customerId }
      : { customerName: normName(customerName) };

    const account = await CustomerAccount.findOneAndUpdate(
      lookup,
      {
        $setOnInsert: {
          customerId,
          customerName: normName(customerName),
          balance: 0,
          totalCharged: 0,
          totalPaid: 0,
          transactions: [],
        },
        // Keep displayName (customerName) in sync if the user changes it
        ...(customerId ? { $set: { customerName: normName(customerName) } } : {}),
        ...(body.creditLimit != null && { creditLimit: body.creditLimit }),
        ...(body.notes != null && { notes: body.notes }),
        ...(body.isActive != null && { isActive: body.isActive }),
      },
      { upsert: true, new: true }
    );

    return ok(account, 201);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to create/update customer account', 500);
  }
}
