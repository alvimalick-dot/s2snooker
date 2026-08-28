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
function validateGameTypes(types: any[], label: string): string | null {
  for (const gt of types) {
    if (!gt.name || typeof gt.name !== 'string' || gt.name.trim().length === 0) {
      return `${label}: Every game type must have a name`;
    }
    if (gt.name.length > 50) {
      return `${label}: Game type name cannot exceed 50 characters`;
    }
    if (gt.flatPrice != null && (typeof gt.flatPrice !== 'number' || gt.flatPrice < 0)) {
      return `${label}: "${gt.name}" flatPrice must be a non-negative number`;
    }
    if (gt.perMinuteRate != null && (typeof gt.perMinuteRate !== 'number' || gt.perMinuteRate < 0)) {
      return `${label}: "${gt.name}" perMinuteRate must be a non-negative number`;
    }
    if (gt.hasSubtypes && Array.isArray(gt.subtypes)) {
      for (const sub of gt.subtypes) {
        if (!sub.name || typeof sub.name !== 'string' || sub.name.trim().length === 0) {
          return `${label}: Every subtype in "${gt.name}" must have a name`;
        }
        if (sub.name.length > 50) {
          return `${label}: Subtype name in "${gt.name}" cannot exceed 50 characters`;
        }
        if (typeof sub.price !== 'number' || sub.price < 0) {
          return `${label}: Subtype "${sub.name}" price must be a non-negative number`;
        }
        if (typeof sub.perMinuteRate !== 'number' || sub.perMinuteRate < 0) {
          return `${label}: Subtype "${sub.name}" perMinuteRate must be a non-negative number`;
        }
        if (typeof sub.gameMinutes !== 'number' || sub.gameMinutes < 1) {
          return `${label}: Subtype "${sub.name}" gameMinutes must be at least 1`;
        }
      }
    }
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();

    if (body.gameTypes) {
      if (!Array.isArray(body.gameTypes)) return fail('gameTypes must be an array');
      const err = validateGameTypes(body.gameTypes, 'Standard Tables');
      if (err) return fail(err);
    }
    if (body.roomGameTypes) {
      if (!Array.isArray(body.roomGameTypes)) return fail('roomGameTypes must be an array');
      const err = validateGameTypes(body.roomGameTypes, 'Private Room');
      if (err) return fail(err);
    }

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
