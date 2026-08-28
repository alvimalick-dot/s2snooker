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
    if (customerName.length > 100) return fail('customerName cannot exceed 100 characters');
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

// PATCH /api/customers/account — pay down a customer's outstanding balance
// body: { customerId?: string, customerName?: string, amount: number, type: 'cash'|'card'|'account', description?: string, staffName?: string }
export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { customerId, customerName, amount, type = 'cash', description = '', staffName = '' } = body;

    if (typeof amount !== 'number' || amount <= 0) return fail('amount is required and must be a positive number');
    if (amount < 1) return fail('amount must be at least Rs 1');

    // Find the account
    let account;
    if (customerId) {
      account = await CustomerAccount.findOne({ customerId });
    } else if (customerName) {
      account = await CustomerAccount.findOne({ customerName: normName(customerName) });
    }
    if (!account) return fail('Customer account not found', 404);

    // Validate payment doesn't exceed balance
    if (Number(amount) > account.balance + 1) {
      return fail(`Payment Rs ${amount} exceeds balance of Rs ${account.balance}`);
    }

    account.balance = Math.max(0, account.balance - Number(amount));
    account.totalPaid += Number(amount);
    account.transactions.push({
      type: 'payment',
      amount: -Number(amount),
      description: description || `Paid via ${type}`,
      sessionId: null,
      staffName: staffName || 'Staff',
      date: new Date(),
    } as any);
    await account.save();

    return ok(account);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to record payment', 500);
  }
}
