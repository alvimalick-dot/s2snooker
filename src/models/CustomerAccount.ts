import mongoose, { Schema, models, model } from 'mongoose';

const TransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['charge', 'payment', 'adjustment'],
      required: true,
    },
    amount: { type: Number, required: true }, // positive for charges, negative for payments
    description: { type: String, default: '' }, // e.g. "Single Frame + 2x Tea"
    sessionId: { type: Schema.Types.ObjectId, default: null }, // link to RevenueLog if applicable
    staffName: { type: String, default: '' }, // who processed this
    date: { type: Date, default: Date.now },
  },
  { _id: true }
);

const CustomerAccountSchema = new Schema(
  {
    customerId: { type: String, default: null, sparse: true },
    customerName: { type: String, required: true, index: true },
    balance: { type: Number, default: 0 }, // positive = customer owes, negative = overpaid
    totalCharged: { type: Number, default: 0 }, // lifetime charges
    totalPaid: { type: Number, default: 0 }, // lifetime payments
    isActive: { type: Boolean, default: true }, // can they still run tabs?
    creditLimit: { type: Number, default: 0 }, // 0 = no limit
    notes: { type: String, default: '' },
    transactions: { type: [TransactionSchema], default: [] },
  },
  { timestamps: true }
);

CustomerAccountSchema.index({ customerId: 1 }, { sparse: true });

export type CustomerAccountDocument = mongoose.InferSchemaType<typeof CustomerAccountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default models.CustomerAccount || model('CustomerAccount', CustomerAccountSchema);
