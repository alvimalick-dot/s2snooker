import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import CustomerAccount from '@/models/CustomerAccount';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/customers/account/pay — record a payment against a customer's tab
// body: { customerName, amount, staffName?, notes? }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const customerName = body.customerName?.trim();
    if (!customerName) return fail('customerName is required');
    if (typeof body.amount !== 'number' || body.amount <= 0) return fail('amount must be a positive number');

    const account = await CustomerAccount.findOne({ customerName });
    if (!account) return fail('Customer account not found.', 404);

    const transaction = {
      type: 'payment' as const,
      amount: -body.amount, // negative = reduces balance
      description: body.notes ?? 'Payment received',
      sessionId: null,
      staffName: body.staffName ?? '',
      date: new Date(),
    };

    account.transactions.push(transaction as any);
    account.balance -= body.amount;
    account.totalPaid += body.amount;
    await account.save();

    return ok(account);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to record payment', 500);
  }
}
