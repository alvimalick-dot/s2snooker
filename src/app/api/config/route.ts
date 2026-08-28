import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import ClubConfig from '@/models/ClubConfig';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DEFAULT_CONFIG = {
  key: 'club_config',
  gameTypes: [
    {
      name: 'Single',
      hasSubtypes: true,
      flatPrice: 0,
      perMinuteRate: 8,
      subtypes: [
        { name: '6 Ball', price: 180, perMinuteRate: 8, gameMinutes: 25 },
        { name: '10 Ball', price: 250, perMinuteRate: 8, gameMinutes: 25 },
        { name: '15 Ball', price: 300, perMinuteRate: 8, gameMinutes: 25 },
      ],
    },
    {
      name: 'Double',
      hasSubtypes: true,
      flatPrice: 0,
      perMinuteRate: 8,
      subtypes: [
        { name: '6 Ball', price: 300, perMinuteRate: 8, gameMinutes: 25 },
        { name: '10 Ball', price: 350, perMinuteRate: 8, gameMinutes: 25 },
        { name: '15 Ball', price: 350, perMinuteRate: 8, gameMinutes: 25 },
      ],
    },
    {
      name: 'Century',
      hasSubtypes: false,
      flatPrice: 900,
      perMinuteRate: 8,
      subtypes: [],
    },
  ],
  roomGameTypes: [
    {
      name: 'Room Booking',
      hasSubtypes: false,
      flatPrice: 900,
      perMinuteRate: 15,
      subtypes: [],
    },
  ],
};

// GET /api/config — return the singleton club config (creates default with gameTypes if missing)
export async function GET() {
  try {
    await connectDB();
    let config = await ClubConfig.findOne({ key: 'club_config' });

    // Create with proper gameTypes if missing or if gameTypes is empty
    if (!config || !config.gameTypes || config.gameTypes.length === 0) {
      if (config) {
        config.gameTypes = DEFAULT_CONFIG.gameTypes as any;
        await config.save();
      } else {
        config = await ClubConfig.create(DEFAULT_CONFIG);
      }
    }

    // Ensure roomGameTypes exists for legacy configs
    if (config && (!config.roomGameTypes || config.roomGameTypes.length === 0)) {
      config.roomGameTypes = DEFAULT_CONFIG.roomGameTypes as any;
      await config.save();
    }

    return ok(config);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to load config', 500);
  }
}

// PATCH /api/config — update game types
// body: { gameTypes?: [...], roomGameTypes?: [...] }
export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    let config = await ClubConfig.findOne({ key: 'club_config' });
    if (!config) {
      config = await ClubConfig.create({
        key: 'club_config',
        gameTypes: body.gameTypes ?? DEFAULT_CONFIG.gameTypes,
        roomGameTypes: body.roomGameTypes ?? DEFAULT_CONFIG.roomGameTypes,
      });
    } else {
      if (body.gameTypes) {
        config.gameTypes = body.gameTypes;
      }
      if (body.roomGameTypes) {
        config.roomGameTypes = body.roomGameTypes;
      }
    }

    await config.save();
    return ok(config);
  } catch (err: any) {
    return fail(err.message ?? 'Failed to update config', 500);
  }
}
