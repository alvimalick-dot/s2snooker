import mongoose, { Schema, models, model } from 'mongoose';

const MenuItemSchema = new Schema(
  {
    itemName: { type: String, required: true },
    category: { type: String, default: 'Snacks' }, // Snacks, Beverages, etc.
    price: { type: Number, required: true },
    description: { type: String, default: '' },
    inStock: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type MenuItemDocument = mongoose.InferSchemaType<typeof MenuItemSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default models.MenuItem || model('MenuItem', MenuItemSchema);
