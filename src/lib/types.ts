export interface ShiftDoc {
  _id: string;
  staffName: string;
  startedAt: string;
  endedAt: string | null;
  startingCash: number;
  endingCash: number | null;
  expectedCash: number;
  difference: number;
  status: 'active' | 'closed';
  notes: string;
}

export type PricingType = 'single_frame' | 'double_frame' | 'century_booking' | 'per_minute';
export type TableStatus = 'available' | 'occupied' | 'reserved';

export interface OrderItem {
  _id: string;
  menuItemId?: string;
  itemName: string;
  quantity: number;
  price: number;
  timestamp: string;
  isComp: boolean;
  compReason: string;
  discountPercent: number;
}

export interface Settlement {
  _id: string;
  type: 'cash' | 'card' | 'account' | 'comp' | 'discount' | 'adjustment';
  amount: number;
  description: string;
  staffName: string;
  date: string;
}

export type BillingMode = 'time_based' | 'flat_rate' | 'per_frame' | 'manual_override';

export interface TableSession {
  customerId?: string | null;
  startTime: string;
  gameType: string; // single_frame, double_frame, century_booking, tournament, coaching, casual
  billingMode: BillingMode; // how the clock charges
  pricingType: PricingType; // legacy field, kept for compat
  flatPrice?: number; // used when billingMode === 'flat_rate'
  hourlyRate: number;
  durationMinutes?: number | null; // included time window for flat-rate types
  overtimeRate?: number; // Rs/min after durationMinutes expires
  gracePeriodMinutes?: number; // buffer before overtime kicks in
  flatSurcharge?: number; // flat extra fee on top of base price
  minimumMinutes?: number | null; // minimum billable minutes for per-minute rates
  framesPlayed: number; // frame counter for per-frame billing
  framePrice: number; // price per frame
  customerName: string;
  loser: string; // who lost this round
  additionalPlayers: string[];
  isPaused: boolean;
  pauseStartedAt: string | null;
  pausedDurationMs: number;
  pauseReason: string;
  activeOrders: OrderItem[];
  settlements: Settlement[];
  switchedFromTableNumber?: number | null;
  accumulatedCharges?: {
    tableNumber: number;
    gameType: string;
    gameTotal: number;
    foodTotal: number;
    elapsedMinutes: number;
    startTime: string;
    endTime: string;
    loser: string;
    settled: boolean;
    settledBy: string;
    items: { itemName: string; quantity: number; price: number; isComp?: boolean; discountPercent?: number }[];
  }[];
  // Chain tracking for Keep on Tab
  chainId?: string | null;
  sourceTableId?: string | null;
}

export interface Reservation {
  customerName: string;
  time: string;
  date?: string | null;
}

export interface TableDoc {
  _id: string;
  tableNumber: number;
  label?: string;
  isPrivateRoom: boolean;
  status: TableStatus;
  currentSession: TableSession | null;
  reservation: Reservation | null;
}

export interface MenuItemDoc {
  _id: string;
  itemName: string;
  category: string;
  price: number;
  description?: string;
  inStock: boolean;
}

export interface RateDoc {
  _id: string;
  rateName: string;
  pricingType: string; // dynamic — any string allowed
  durationMinutes: number | null;
  price: number;
  description?: string;
  extraPricePerMinute: number;
  extraPriceFlat: number;
  gracePeriodMinutes: number;
  minimumMinutes: number | null;
  peakPrice: number | null;
  offPeakPrice: number | null;
  peakStartHour: number;
  peakEndHour: number;
  peakDays: number[];
  tableOverrides: Record<string, number>;
  isActive: boolean;
}

export interface LoggedOrderItem {
  itemName: string;
  quantity: number;
  price: number;
}

export interface RevenueLogDoc {
  _id: string;
  date: string;
  tableNumber: number;
  isPrivateRoom: boolean;
  customerId?: string | null;
  customerName: string;
  tableRentalRevenue: number;
  menuSalesRevenue: number;
  totalRevenue: number;
  pricingType: string;
  startTime?: string;
  endTime?: string;
  closedBy: string;
  items?: LoggedOrderItem[];
  switchedToTableNumber?: number | null;
  switchedFromTableNumber?: number | null;
  accumulatedCharges?: {
    tableNumber: number;
    gameType: string;
    gameTotal: number;
    foodTotal: number;
    elapsedMinutes: number;
    startTime: string;
    endTime: string;
    loser: string;
    settled: boolean;
    settledBy: string;
    items: { itemName: string; quantity: number; price: number; isComp?: boolean; discountPercent?: number }[];
  }[];
}

export interface CustomerActiveSession {
  tableNumber: number;
  isPrivateRoom: boolean;
  label?: string;
  startTime: string;
  pricingType: PricingType;
  items: LoggedOrderItem[];
  tableRentalRevenue: number;
  menuSalesRevenue: number;
  totalRevenue: number;
  status: 'in_progress';
}

export interface Transaction {
  _id: string;
  type: 'charge' | 'payment' | 'adjustment';
  amount: number;
  description: string;
  sessionId?: string | null;
  staffName: string;
  date: string;
}

export interface CustomerAccountDoc {
  _id: string;
  customerId?: string | null;
  customerName: string;
  balance: number; // positive = owes, negative = overpaid
  totalCharged: number;
  totalPaid: number;
  isActive: boolean;
  creditLimit: number;
  notes: string;
  transactions: Transaction[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerHistoryResponse {
  customerName: string;
  records: RevenueLogDoc[];
  activeSessions: CustomerActiveSession[];
  account: CustomerAccountDoc | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
