// The 5 tables at Break & Game.
// No table CRUD UI — these are the only tables, period.
export const CLUB_TABLES = [
  { tableNumber: 1, label: 'Table 1', isPrivateRoom: false },
  { tableNumber: 2, label: 'Table 2', isPrivateRoom: false },
  { tableNumber: 3, label: 'Table 3', isPrivateRoom: false },
  { tableNumber: 4, label: 'Table 4', isPrivateRoom: false },
  { tableNumber: 5, label: 'Private Room', isPrivateRoom: true },
];

export type TableGroup = 'standard' | 'room';

export function getTableGroup(tableNumber: number): TableGroup {
  return tableNumber === 5 ? 'room' : 'standard';
}
