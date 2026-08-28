import mongoose, { Schema, models, model } from 'mongoose';

const ShiftSchema = new Schema(
  {
    staffName: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    // Cash drawer reconciliation
    startingCash: { type: Number, default: 0 }, // cash in drawer at shift start
    endingCash: { type: Number, default: null }, // cash counted at shift end (null = still open)
    expectedCash: { type: Number, default: 0 }, // system-calculated total during shift
    difference: { type: Number, default: 0 }, // actualCash - expectedCash (over/short)
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active',
    },
    notes: { type: String, default: '' }, // optional shift notes
  },
  { timestamps: true }
);

export type ShiftDocument = mongoose.InferSchemaType<typeof ShiftSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default models.Shift || model('Shift', ShiftSchema);
