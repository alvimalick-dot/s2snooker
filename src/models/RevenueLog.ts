import mongoose, { Schema, models, model } from 'mongoose';

const LoggedOrderItemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true },
    isComp: { type: Boolean, default: false },
    compReason: { type: String, default: '' },
    discountPercent: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true }, // price * quantity after comp/discount
  },
  { _id: false }
);

const LoggedSettlementSchema = new Schema(
  {
    type: { type: String, required: true }, // cash, card, account, comp, discount, adjustment
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    staffName: { type: String, default: '' },
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RevenueLogSchema = new Schema(
  {
    date: { type: Date, required: true }, // day this log represents (midnight UTC)
    tableNumber: { type: Number, required: true },
    isPrivateRoom: { type: Boolean, default: false },
    customerId: { type: String, default: null },
    customerName: { type: String, default: '' },
    tableRentalRevenue: { type: Number, required: true, default: 0 },
    menuSalesRevenue: { type: Number, required: true, default: 0 },
    totalRevenue: { type: Number, required: true, default: 0 },
    pricingType: { type: String, default: '' },
    startTime: { type: Date },
    endTime: { type: Date },
    closedBy: { type: String, default: 'Admin' },
    additionalPlayers: { type: [String], default: [] }, // other people at the table for history search
    // Link to the shift during which this session was closed
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', default: null },
    // Snapshot of the food/drink tab at close-out, so the customer audit trail
    // can show "Bill: Rs. X + Snacks" style itemized history, not just totals.
    items: { type: [LoggedOrderItemSchema], default: [] },
    // Adjustment totals for the audit trail
    compTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    // Settlement events: how the bill was actually paid (cash, card, split, comp)
    settlements: { type: [LoggedSettlementSchema], default: [] },
    // When a session was closed because the customer switched tables (rather
    // than actually leaving), we record where they went so staff can trace
    // "Table 1 -> Table 2" moves in the audit trail without merging the bills.
    switchedToTableNumber: { type: Number, default: null },
    switchedFromTableNumber: { type: Number, default: null },
    // Accumulated charges from previous games ("New Game" flow).
    // Each entry is a frozen bill from a prior game before the timer was reset.
    accumulatedCharges: {
      type: [{
        tableNumber: { type: Number, required: true },
        gameType: { type: String, default: '' },
        gameTotal: { type: Number, default: 0 },
        foodTotal: { type: Number, default: 0 },
        elapsedMinutes: { type: Number, default: 0 },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

RevenueLogSchema.index({ date: 1 });
RevenueLogSchema.index({ customerId: 1 }, { sparse: true });
RevenueLogSchema.index({ customerName: 1 });

export type RevenueLogDocument = mongoose.InferSchemaType<typeof RevenueLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default models.RevenueLog || model('RevenueLog', RevenueLogSchema);
