import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import CustomerAccount from '@/models/CustomerAccount';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/customers/account/charge — add a charge to a customer's tab
// body: { customerName, amount, description?, staffName?, sessionId? }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    const customerName = body.customerName?.trim();
    if (!customerName) return fail('customerName is required');
    if (typeof body.amount !== 'number' || body.amount <= 0) return fail('amount must be a positive number');

    const nameRegex = new RegExp(`^${customerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const account = await CustomerAccount.findOne({ customerName: nameRegex });
    if (!account) return fail('Customer account not found. Create it first.', 404);

    if (!account.isActive) return fail('This account is inactive and cannot accept new charges.', 403);

    // Check credit limit (0 = no limit)
    if (account.creditLimit > 0 && account.balance + body.amount > account.creditLimit) {
      return fail(
        `Credit limit exceeded. Current balance: Rs ${account.balance}, limit: Rs ${account.creditLimit}, new charge: Rs ${body.amount}`,
        403
      );
    }

    const transaction = {
      type: 'charge' as const,
      amount: body.amount,
      description: body.description ?? '',
      sessionId: body.sessionId ?? null,
      staffName: body.staffName ?? '',
      date: new Date(),
    };

    account.transactions.push(transaction as any);
    account.balance += body.amount;
    account.totalCharged += body.amount;
    await account.save();

    return ok(account);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to charge customer account', 500);
  }
}
