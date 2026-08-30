export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Net price for a logged/ordered line item after comps and percentage
 * discounts. Used by the receipt and report detail views so the amount shown
 * next to an item matches what was actually charged.
 */
export function itemNetLine(it: {
  price?: number;
  quantity?: number;
  isComp?: boolean;
  discountPercent?: number;
  lineTotal?: number;
}): number {
  if (it.lineTotal != null) return it.lineTotal;
  const gross = (it.price ?? 0) * (it.quantity ?? 1);
  if (it.isComp) return 0;
  const disc = it.discountPercent ?? 0;
  return disc > 0 ? money(gross * (1 - disc / 100)) : gross;
}

// The club runs on Pakistan Standard Time (UTC+5, no DST) regardless of where
// the server itself happens to be deployed (e.g. a host like Vercel that runs
// its functions in UTC). If we naively used `new Date().getFullYear()/etc.`
// on such a host, every session closed after 7:00 PM PKT would get logged
// under the WRONG calendar date once UTC has already rolled over to the next
// day (00:00 UTC = 5:00 AM PKT... the actual danger window is anything after
// 19:00 PKT, when UTC has already ticked to the next date). That would
// silently corrupt "today's revenue" totals and the daily report. To avoid
// depending on the server's local timezone at all, we compute the club's
// business date explicitly from a configurable UTC offset.
const CLUB_TZ_OFFSET_MINUTES = process.env.CLUB_TZ_OFFSET_MINUTES
  ? Number(process.env.CLUB_TZ_OFFSET_MINUTES)
  : 300; // +05:00 (Asia/Karachi)

/** Returns the club's local calendar date (midnight, club timezone, expressed as a UTC Date) for the given instant. */
export function businessDate(at: Date | string = new Date()): Date {
  const d = new Date(at);
  const shifted = new Date(d.getTime() + CLUB_TZ_OFFSET_MINUTES * 60000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** True if `at` falls on the club's current business day. */
export function isToday(at: Date | string): boolean {
  return businessDate(at).getTime() === businessDate(new Date()).getTime();
}

/**
 * Builds the payload used to write a RevenueLog document when a table
 * session is closed out — whether that's a normal "End Session" or the
 * close-out half of a "Switch Table" transfer. Kept in one place so both
 * flows always produce an identical, itemized audit-trail record.
 */
export function buildRevenueLogPayload(params: {
  tableNumber: number;
  isPrivateRoom: boolean;
  session: {
    customerId?: string | null;
    startTime: Date | string;
    pricingType: 'single_frame' | 'double_frame' | 'century_booking' | 'per_minute';
    hourlyRate: number;
    flatPrice?: number;
    durationMinutes?: number | null;
    overtimeRate?: number;
    minimumMinutes?: number | null;
    customerName?: string;
    additionalPlayers?: string[];
    activeOrders?: { itemName: string; price: number; quantity: number; isComp?: boolean; compReason?: string; discountPercent?: number }[];
    settlements?: { type: string; amount: number; description?: string; staffName?: string; date?: Date | string }[];
    pausedDurationMs?: number;
    isPaused?: boolean;
    pauseStartedAt?: Date | string | null;
    switchedFromTableNumber?: number | null;
    accumulatedCharges?: { tableNumber: number; gameType: string; gameTotal: number; foodTotal: number; elapsedMinutes: number; startTime: Date | string; endTime: Date | string; loser?: string; settled?: boolean; settledBy?: string }[];
  };
  closedBy: string;
  endTime?: Date;
  switchedToTableNumber?: number | null;
  switchedFromTableNumber?: number | null;
  // Pass a bill already computed with the same `now`/`endTime` used elsewhere
  // in the request (e.g. shown to the cashier before confirming) so the
  // figure printed on the receipt and the figure written to the audit trail
  // can never drift apart because two separate clock reads landed a
  // per-minute session on either side of a minute boundary.
  bill?: { tableTotal: number; foodTotal: number; foodSubtotal?: number; compTotal?: number; discountTotal?: number; total: number };
}) {
  const now = params.endTime ?? new Date();
  const bill = params.bill ?? computeSessionBill(params.session, now);
  const logDate = businessDate(now);

  // Build itemized list with comp/discount info
  // Include items from accumulated rounds (previous games) + current round
  const currentItems = (params.session.activeOrders ?? []).map((o) => {
    const lineGross = o.price * o.quantity;
    let lineTotal = lineGross;
    if (o.isComp) {
      lineTotal = 0;
    } else if (o.discountPercent && o.discountPercent > 0) {
      lineTotal = lineGross * (1 - o.discountPercent / 100);
    }
    return {
      itemName: o.itemName,
      quantity: o.quantity,
      price: o.price,
      isComp: o.isComp ?? false,
      compReason: o.compReason ?? '',
      discountPercent: o.discountPercent ?? 0,
      lineTotal: money(lineTotal),
    };
  });

  // Items from accumulated rounds (previous games in this session).
  // Exclude settled rounds — they were itemized on their own "Bill Now" log,
  // so including them here would make the final receipt's line items not add
  // up to its total (which only counts unsettled rounds).
  const accItems = (params.session.accumulatedCharges ?? [])
    .flatMap((c: any, cIdx: number) =>
      c.settled
        ? []
        : (c.items ?? []).map((o: any) => ({
            itemName: `[R${cIdx + 1}] ${o.itemName}`,
            quantity: o.quantity,
            price: o.price,
            isComp: o.isComp ?? false,
            compReason: '',
            discountPercent: o.discountPercent ?? 0,
            lineTotal: money(o.price * o.quantity * (o.isComp ? 0 : (1 - (o.discountPercent ?? 0) / 100))),
          }))
    );

  const items = [...accItems, ...currentItems];

  // Accumulated charges from previous games ("New Game" flow)
  // Exclude settled rounds (already billed via "Bill Now") to avoid double-counting
  const prev = (params.session.accumulatedCharges ?? []).filter((c: any) => !c.settled);
  const prevGameTotal = prev.reduce((sum, c) => sum + c.gameTotal, 0);
  const prevFoodTotal = prev.reduce((sum, c) => sum + c.foodTotal, 0);

  return {
    date: logDate,
    tableNumber: params.tableNumber,
    isPrivateRoom: params.isPrivateRoom,
    customerId: params.session.customerId ?? null,
    customerName: params.session.customerName ?? '',
    additionalPlayers: params.session.additionalPlayers ?? [],
    tableRentalRevenue: money(bill.tableTotal + prevGameTotal),
    menuSalesRevenue: money(bill.foodTotal + prevFoodTotal),
    totalRevenue: money(bill.total + prevGameTotal + prevFoodTotal),
    pricingType: params.session.pricingType,
    startTime: prev.length > 0 ? prev[0].startTime : params.session.startTime,
    endTime: now,
    closedBy: params.closedBy,
    items,
    compTotal: bill.compTotal ?? 0,
    discountTotal: bill.discountTotal ?? 0,
    settlements: (params.session.settlements ?? []).map((s) => ({
      type: s.type,
      amount: s.amount,
      description: s.description ?? '',
      staffName: s.staffName ?? '',
      date: s.date ?? now,
    })),
    switchedToTableNumber: params.switchedToTableNumber ?? null,
    switchedFromTableNumber: params.switchedFromTableNumber ?? params.session.switchedFromTableNumber ?? null,
    accumulatedCharges: prev,
  };
}

/**
 * Computes the live bill for a table session based on its pricing type.
 *
 * Flat-rate types (single_frame / double_frame / century_booking):
 *   • The configured flatPrice covers up to `durationMinutes` of table time.
 *   • If the customer exceeds that window, overtime kicks in: every extra
 *     minute (rounded up) is charged at `overtimeRate` per minute.
 *   • Example: Single Frame Rs 250 / 25 min, overtime Rs 8/min →
 *     40 min = Rs 250 + ceil(40−25) × 8 = Rs 370.
 *
 * Per-minute type:
 *   • Charges hourlyRate/60 for every elapsed minute (partial minutes
 *     round up).
 *
 * In both cases, active food orders are added on top.
 */
export function computeSessionBill(
  session: {
    startTime: Date | string;
    billingMode?: string; // time_based, flat_rate, manual_override
    pricingType?: string; // legacy, used as fallback
    hourlyRate: number;
    flatPrice?: number;
    durationMinutes?: number | null;
    overtimeRate?: number;
    gracePeriodMinutes?: number;
    flatSurcharge?: number;
    minimumMinutes?: number | null;
    framesPlayed?: number;
    framePrice?: number;
    activeOrders?: { price: number; quantity: number; isComp?: boolean; discountPercent?: number }[];
    pausedDurationMs?: number;
    isPaused?: boolean;
    pauseStartedAt?: Date | string | null;
  },
  asOf: Date | string = new Date()
): { tableTotal: number; foodTotal: number; foodSubtotal: number; compTotal: number; discountTotal: number; total: number; elapsedMs: number; overtimeMinutes: number } {
  const start = new Date(session.startTime).getTime();
  const now = new Date(asOf).getTime();
  let elapsedMs = now - start;

  let pausedMs = session.pausedDurationMs ?? 0;
  if (session.isPaused && session.pauseStartedAt) {
    pausedMs += now - new Date(session.pauseStartedAt).getTime();
  }
  elapsedMs = Math.max(0, elapsedMs - pausedMs);

  // Itemized food calculation with comp/discount support
  let foodSubtotal = 0; // gross before adjustments
  let compTotal = 0;
  let discountTotal = 0;

  for (const item of session.activeOrders ?? []) {
    const lineGross = item.price * item.quantity;
    foodSubtotal += lineGross;

    if (item.isComp) {
      compTotal += lineGross;
    } else if (item.discountPercent && item.discountPercent > 0) {
      discountTotal += lineGross * (item.discountPercent / 100);
    }
  }

  const foodTotal = money(foodSubtotal - compTotal - discountTotal);

  let tableTotal = 0;
  let overtimeMinutes = 0;

  // Determine billing mode: new field takes priority, fallback to legacy pricingType
  const mode = session.billingMode ??
    (session.pricingType === 'per_minute' ? 'time_based' : 'flat_rate');

  if (mode === 'per_frame') {
    // Per-frame billing: charge framePrice × framesPlayed.
    // The clock still runs for time tracking, but money comes from frames.
    const frames = session.framesPlayed ?? 0;
    const pricePerFrame = session.framePrice ?? session.flatPrice ?? session.hourlyRate;
    tableTotal = frames * pricePerFrame;
  } else if (mode === 'time_based' || mode === 'manual_override') {
    // Time-based billing: charge hourlyRate/60 for every minute (rounded up).
    // If a minimumMinutes is set, the customer is billed for at least that
    // many minutes even if they finish early (standard club convention:
    // "minimum half hour" etc.).
    // manual_override uses the same math but staff has set a custom hourlyRate.
    const rawMinutes = Math.ceil(elapsedMs / 60000);
    const minimum = session.minimumMinutes ?? 0;
    const billableMinutes = minimum > 0 ? Math.max(rawMinutes, minimum) : rawMinutes;
    tableTotal = (session.hourlyRate / 60) * billableMinutes;
  } else {
    // Flat-rate billing: base price covers the included duration window,
    // then overtime per-minute kicks in for time beyond that.
    // flatSurcharge is a fixed extra fee added to the base price
    // (e.g., private room surcharge, equipment rental, etc.).
    const basePrice = session.flatPrice ?? session.hourlyRate;
    const surcharge = session.flatSurcharge ?? 0;
    const includedMinutes = session.durationMinutes ?? 0;
    const overtimePerMin = session.overtimeRate ?? 0;
    const graceMinutes = session.gracePeriodMinutes ?? 0;
    const elapsedMinutes = Math.ceil(elapsedMs / 60000);

    // Overtime kicks in after duration + grace period.
    // e.g. Century booking: 60 min + 5 min grace = overtime starts at 65 min.
    const overtimeThreshold = includedMinutes + graceMinutes;

    if (includedMinutes > 0 && overtimePerMin > 0 && elapsedMinutes > overtimeThreshold) {
      overtimeMinutes = elapsedMinutes - overtimeThreshold;
      tableTotal = basePrice + surcharge + overtimeMinutes * overtimePerMin;
    } else {
      tableTotal = basePrice + surcharge;
    }
  }

  return {
    tableTotal: money(tableTotal),
    foodTotal,
    foodSubtotal: money(foodSubtotal),
    compTotal: money(compTotal),
    discountTotal: money(discountTotal),
    total: money(tableTotal + foodTotal),
    elapsedMs,
    overtimeMinutes,
  };
}

/**
 * Resolves the effective price for a Rate at a given moment and table.
 *
 * Priority:
 *  1. Per-table override (tableOverrides["5"] = 350)
 *  2. Peak / off-peak pricing (peakPrice during peak hours on peak days)
 *  3. Base price (rate.price)
 *
 * Also resolves the correct overtime rate and duration from the rate.
 * Used by StartSessionModal and SwitchTableModal so the session is
 * created with the correct pre-resolved numbers.
 */
export function resolveRate(
  rate: {
    price: number;
    durationMinutes?: number | null;
    extraPricePerMinute?: number;
    extraPriceFlat?: number;
    gracePeriodMinutes?: number;
    minimumMinutes?: number | null;
    peakPrice?: number | null;
    offPeakPrice?: number | null;
    peakStartHour?: number;
    peakEndHour?: number;
    peakDays?: number[];
    tableOverrides?: Record<string, number> | Map<string, number>;
    pricingType?: string;
  },
  tableNumber?: number,
  at: Date | string = new Date()
): {
  basePrice: number;
  durationMinutes: number | null;
  overtimeRate: number;
  gracePeriodMinutes: number;
  flatSurcharge: number;
  minimumMinutes: number | null;
  isPeak: boolean;
} {
  const d = new Date(at);
  const hour = d.getHours();
  const day = d.getDay(); // 0=Sun..6=Sat

  // --- peak/off-peak check ---
  const peakStart = rate.peakStartHour ?? 17;
  const peakEnd = rate.peakEndHour ?? 23;
  const peakDays = rate.peakDays ?? [5, 6];

  let isPeak = false;
  if (rate.peakPrice != null || rate.offPeakPrice != null) {
    const dayIsPeak = peakDays.includes(day);
    // Handle ranges that wrap past midnight (e.g. 22 → 2)
    if (peakStart <= peakEnd) {
      isPeak = dayIsPeak && hour >= peakStart && hour < peakEnd;
    } else {
      isPeak = dayIsPeak && (hour >= peakStart || hour < peakEnd);
    }
  }

  // --- per-table override ---
  let basePrice = rate.price;
  if (tableNumber != null && rate.tableOverrides) {
    const overrides = rate.tableOverrides instanceof Map
      ? rate.tableOverrides.get(String(tableNumber))
      : (rate.tableOverrides as Record<string, number>)[String(tableNumber)];
    if (typeof overrides === 'number') {
      basePrice = overrides;
    }
  }

  // --- peak / off-peak ---
  if (isPeak && rate.peakPrice != null) {
    basePrice = rate.peakPrice;
  } else if (!isPeak && rate.offPeakPrice != null) {
    basePrice = rate.offPeakPrice;
  }

  return {
    basePrice: money(basePrice),
    durationMinutes: rate.durationMinutes ?? null,
    overtimeRate: rate.extraPricePerMinute ?? 0,
    gracePeriodMinutes: rate.gracePeriodMinutes ?? 0,
    flatSurcharge: rate.extraPriceFlat ?? 0,
    minimumMinutes: rate.minimumMinutes ?? null,
    isPeak,
  };
}
