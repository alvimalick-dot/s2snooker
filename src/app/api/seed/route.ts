import { connectDB } from '@/lib/mongodb';
import Table from '@/models/Table';
import MenuItem from '@/models/MenuItem';
import ClubConfig from '@/models/ClubConfig';
import { CLUB_TABLES } from '@/lib/club';
import { ok, fail } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST /api/seed - creates exactly the 5 hardcoded tables, default game types, and starter menu
export async function POST() {
  try {
    await connectDB();

    // Upsert the 5 hardcoded tables
    for (const t of CLUB_TABLES) {
      await Table.findOneAndUpdate(
        { tableNumber: t.tableNumber },
        { $setOnInsert: { ...t, status: 'available' } },
        { upsert: true, new: true }
      );
    }

    // Upsert club config with default game types
    const existingConfig = await ClubConfig.findOne({ key: 'club_config' });
    if (!existingConfig) {
      await ClubConfig.create({
        key: 'club_config',
        gameTypes: [
          {
            name: 'Single',
            hasSubtypes: true,
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
      });
    }

    // Starter menu
    const menuSeed = [
      { itemName: '6pc Bites', category: 'Snacks', price: 600 },
      { itemName: '8pc Bites', category: 'Snacks', price: 800 },
      { itemName: '10pc Bites', category: 'Snacks', price: 1000 },
      { itemName: 'Tea/Coffee', category: 'Beverages', price: 500 },
      { itemName: 'Soft Drink', category: 'Beverages', price: 400 },
      { itemName: 'Century Snack', category: 'Snacks', price: 500 },
      { itemName: '10pc Wings', category: 'Snacks', price: 1000 },
      { itemName: 'Coke', category: 'Beverages', price: 200 },
    ];
    for (const m of menuSeed) {
      const existing = await MenuItem.findOne({ itemName: m.itemName });
      if (!existing) await MenuItem.create(m);
    }

    const tables = await Table.find().sort({ tableNumber: 1 }).lean();
    const menu = await MenuItem.find().lean();
    const config = await ClubConfig.findOne({ key: 'club_config' }).lean();

    return ok({ tables, menu, config, message: 'Seed complete' });
  } catch (err: any) {
    return fail(err.message ?? 'Failed to seed database', 500);
  }
}
