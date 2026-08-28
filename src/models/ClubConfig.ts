import mongoose, { Schema, models, model } from 'mongoose';

const GameSubtypeSchema = new Schema(
  {
    name: { type: String, required: true }, // e.g. "6 Ball", "10 Ball", "15 Ball"
    price: { type: Number, required: true }, // flat rate for this subtype
    perMinuteRate: { type: Number, required: true, default: 8 }, // overtime Rs/min
    gameMinutes: { type: Number, default: 25 }, // included minutes for flat rate
  },
  { _id: true }
);

const GameTypeSchema = new Schema(
  {
    name: { type: String, required: true }, // e.g. "Single", "Double", "Century"
    hasSubtypes: { type: Boolean, default: true }, // false = just one flat rate (like Century)
    flatPrice: { type: Number, default: 0 }, // used when hasSubtypes = false (Century = 900/hr)
    perMinuteRate: { type: Number, default: 8 }, // overtime rate (used when hasSubtypes = false)
    subtypes: { type: [GameSubtypeSchema], default: [] },
  },
  { _id: true }
);

const ClubConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'club_config' },
    gameTypes: { type: [GameTypeSchema], default: [] },
    roomGameTypes: { type: [GameTypeSchema], default: [] },
  },
  { timestamps: true }
);

export type ClubConfigDocument = mongoose.InferSchemaType<typeof ClubConfigSchema> & {
  _id: mongoose.Types.ObjectId;
  gameTypes: mongoose.InferSchemaType<typeof GameTypeSchema>[];
  roomGameTypes: mongoose.InferSchemaType<typeof GameTypeSchema>[];
};

export default models.ClubConfig || model('ClubConfig', ClubConfigSchema);
