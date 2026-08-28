import { connectDB } from '@/lib/mongodb';
import ClubConfig from '@/models/ClubConfig';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const CANONICAL_CONFIG = {
  key: 'club_config',
  gameTypes: [
    {
      name: 'Single',
      hasSubtypes: true,
      flatPrice: 0,
      perMinuteRate: 6,
      subtypes: [
        { name: '1 Ball', price: 150, perMinuteRate: 6, gameMinutes: 25 },
        { name: '6 Ball', price: 180, perMinuteRate: 7.2, gameMinutes: 25 },
        { name: '10 Ball', price: 200, perMinuteRate: 8, gameMinutes: 25 },
        { name: 'Full Frame (15 Ball)', price: 250, perMinuteRate: 10, gameMinutes: 25 },
      ],
    },
    {
      name: 'Double',
      hasSubtypes: true,
      flatPrice: 0,
      perMinuteRate: 10,
      subtypes: [
        { name: '1 Ball', price: 250, perMinuteRate: 10, gameMinutes: 25 },
        { name: '6 Ball', price: 300, perMinuteRate: 12, gameMinutes: 25 },
        { name: '10 Ball', price: 350, perMinuteRate: 14, gameMinutes: 25 },
        { name: 'Full Frame (15 Ball)', price: 400, perMinuteRate: 16, gameMinutes: 25 },
      ],
    },
    {
      name: 'Century',
      hasSubtypes: false,
      flatPrice: 900,
      perMinuteRate: 15,
      subtypes: [],
    },
  ],
  roomGameTypes: [
    {
      name: 'Private Room',
      hasSubtypes: false,
      flatPrice: 1200,
      perMinuteRate: 20,
      subtypes: [],
    },
  ],
};

// POST /api/config/reset — force-replace config with canonical rates
export async function POST() {
  try {
    await connectDB();
    const config = await ClubConfig.findOneAndUpdate(
      { key: 'club_config' },
      { $set: CANONICAL_CONFIG },
      { upsert: true, new: true },
    );
    return ok({ config, message: 'Config reset to canonical rates' });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to reset config', 500);
  }
}
