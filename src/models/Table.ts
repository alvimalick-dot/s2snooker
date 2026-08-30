import mongoose, { Schema, models, model } from 'mongoose';

const OrderItemSchema = new Schema(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem' },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true }, // price per unit at time of order
    timestamp: { type: Date, default: Date.now },
    // Comp / discount fields
    isComp: { type: Boolean, default: false }, // true = item is free (comped by owner)
    compReason: { type: String, default: '' }, // e.g. "Owner comp", "Regular customer"
    discountPercent: { type: Number, default: 0 }, // 0–100, percentage off this line item
  },
  { _id: true }
);

// Settlement event: how the bill was actually paid (cash, card, comp, discount)
const SettlementSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['cash', 'card', 'account', 'comp', 'discount', 'adjustment'],
      required: true,
    },
    amount: { type: Number, required: true }, // positive = payment received, negative = discount/comp given
    description: { type: String, default: '' },
    staffName: { type: String, default: '' },
    date: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SessionSchema = new Schema(
  {
    customerId: { type: String, default: null },
    startTime: { type: Date, required: true },
    // Game type is the customer's stated intent — a label for tracking.
    // It does NOT决定 how billing works.
    gameType: { type: String, default: 'casual' }, // single_frame, double_frame, century_booking, tournament, coaching, casual
    // Billing mode is how the clock actually charges.
    // The clock ALWAYS runs. This controls the math.
    billingMode: {
      type: String,
      enum: ['time_based', 'flat_rate', 'per_frame', 'manual_override'],
      default: 'time_based',
    },
    // Legacy field kept for backward compat — now equivalent to gameType
    pricingType: {
      type: String,
      required: true,
    },
    flatPrice: { type: Number }, // used when billingMode === 'flat_rate'
    hourlyRate: { type: Number, required: true }, // Rs/hour, used for time_based math
    durationMinutes: { type: Number, default: null }, // included time window for flat-rate types (null = unlimited)
    overtimeRate: { type: Number, default: 0 }, // Rs/min charged after durationMinutes expires
    gracePeriodMinutes: { type: Number, default: 0 }, // buffer before overtime kicks in
    flatSurcharge: { type: Number, default: 0 }, // flat extra fee added to base price (room surcharge, equipment, etc.)
    minimumMinutes: { type: Number, default: null }, // minimum billable minutes for per-minute rates
    framesPlayed: { type: Number, default: 0 }, // frame counter for per-frame billing
    framePrice: { type: Number, default: 0 }, // price per frame (when billingMode === 'per_frame')
    customerName: { type: String, default: '' },
    loser: { type: String, default: '' }, // who lost this round (for bet tracking)
    additionalPlayers: { type: [String], default: [] }, // other people at the table (for group history search)
    isPaused: { type: Boolean, default: false },
    pauseStartedAt: { type: Date, default: null },
    pausedDurationMs: { type: Number, default: 0 }, // accumulated paused time
    pauseReason: { type: String, default: '' }, // why the clock was stopped (club-side issue only)
    activeOrders: { type: [OrderItemSchema], default: [] },
    // Settlement events: tracks how the bill was actually paid.
    // Multiple entries allow split payments (half cash, half card) and
    // comps/discounts applied during the session.
    settlements: { type: [SettlementSchema], default: [] },
    // Set when this page was opened as the destination half of a "Switch
    // Table" action, so staff can see "moved from Table X" at a glance and
    // it can be carried into the RevenueLog audit trail when this page is
    // eventually closed (either by Ending or by switching again).
    switchedFromTableNumber: { type: Number, default: null },
    // Chain tracking for Keep on Tab: links multiple tables playing
    // simultaneously under one customer. When End Session is called on
    // any table in the chain, ALL tables in the chain are ended and
    // billed together.
    chainId: { type: String, default: null }, // shared across all linked sessions
    sourceTableId: { type: String, default: null }, // which table this session was derived from
    // Accumulated charges from previous games in this session.
    // When staff taps "New Game", the current game's bill is frozen here
    // and the timer resets for the next game.
    accumulatedCharges: {
      type: [{
        tableNumber: { type: Number, required: true },
        gameType: { type: String, default: '' },
        gameTotal: { type: Number, default: 0 },
        foodTotal: { type: Number, default: 0 },
        elapsedMinutes: { type: Number, default: 0 },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        loser: { type: String, default: '' }, // who lost this round
        settled: { type: Boolean, default: false }, // true if billed via 'Bill now'
        settledBy: { type: String, default: '' }, // customerId of person billed
        items: { type: [{
          itemName: { type: String, required: true },
          quantity: { type: Number, default: 1 },
          price: { type: Number, required: true },
          isComp: { type: Boolean, default: false },
          discountPercent: { type: Number, default: 0 },
        }], default: [] },
      }],
      default: [],
    },
  },
  { _id: false }
);

SessionSchema.index({ customerId: 1 }, { sparse: true });

const ReservationSchema = new Schema(
  {
    customerName: { type: String, required: true },
    time: { type: String, required: true }, // display string e.g. "7:00 PM"
    date: { type: Date, default: null },
  },
  { _id: false }
);

const TableSchema = new Schema(
  {
    tableNumber: { type: Number, required: true, unique: true },
    label: { type: String }, // e.g. "Table 5" or "Private Room"
    isPrivateRoom: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['available', 'occupied', 'reserved'],
      default: 'available',
    },
    currentSession: { type: SessionSchema, default: null },
    reservation: { type: ReservationSchema, default: null },
  },
  { timestamps: true }
);

export type TableDocument = mongoose.InferSchemaType<typeof TableSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default models.Table || model('Table', TableSchema);
