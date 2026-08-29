# Break & Game — Table Management Dashboard

Full-stack Next.js 14 (App Router) + MongoDB (Mongoose) dashboard for a snooker
club: live table status, per-minute/flat-rate billing, a quick food-order
menu, rate management, and date-ranged revenue reports with PDF/CSV export.

## Stack

- **Next.js 14 App Router** — UI + API routes + Server-side logic in one project (no separate Express backend)
- **MongoDB Atlas + Mongoose** — flexible schema for sessions, embedded active orders
- **Tailwind CSS** — dark felt/brass "snooker club" theme (see Design notes below)
- **Polling (4s) for live sync** — see "Real-time" notes below on why this replaced raw WebSockets
- **jsPDF + jspdf-autotable** — client-side PDF report export

## Getting started

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste your MongoDB Atlas connection string into MONGODB_URI
npm run dev
```

Open http://localhost:3000. On first run the dashboard will show a **"Seed Demo
Data"** button — click it once to create Tables 1–4, a private Table 5, a
starter food menu, and the four rate tiers from your mockups (Single Frame,
Double Frame, Century-Booking, Per Minute). You can also POST to `/api/seed`
directly. Seeding is idempotent — safe to run more than once.

## Folder structure

```
src/
  app/
    layout.tsx, globals.css, page.tsx        # dashboard shell (client component)
    api/
      tables/route.ts                        # GET list, POST create
      tables/[id]/route.ts                   # GET/PATCH/DELETE one table
      tables/[id]/start/route.ts             # POST start a session
      tables/[id]/pause/route.ts             # POST toggle pause/resume
      tables/[id]/end/route.ts               # POST end session -> writes RevenueLog
      tables/[id]/order/route.ts             # POST add / DELETE remove a food order line
      menu/route.ts, menu/[id]/route.ts      # menu CRUD
      rates/route.ts, rates/[id]/route.ts    # rate CRUD ("Batch Rate Update")
      reports/route.ts                       # GET revenue report, json or csv
      seed/route.ts                          # POST one-time demo data bootstrap
  models/
    Table.ts, MenuItem.ts, Rate.ts, RevenueLog.ts
  lib/
    mongodb.ts      # cached Mongoose connection (safe for Next.js hot reload / serverless)
    billing.ts       # pure session-bill math, shared by API routes and the UI
    utils.ts          # server response helpers (ok/fail), re-exports billing.ts
    types.ts, api.ts, useClock.ts
  components/
    Header.tsx, StatsStrip.tsx, TableCard.tsx, StartSessionModal.tsx,
    OrderModal.tsx, MenuManager.tsx, RateManager.tsx, RevenueReport.tsx
```

## What I changed from the original plan, and why

Your architecture doc was solid — this keeps its shape almost exactly, but a
few things needed adjusting to actually work in production:

1. **WebSockets → polling (every 4s) + a 1s local clock tick.**
   True WebSockets need a persistent server process; standard Next.js API
   routes (and most serverless hosts, e.g. Vercel) don't keep a socket open
   between requests. Server-Sent Events have the same problem on serverless.
   The practical fix — and what most POS/table-management SaaS products
   actually ship — is short-interval polling for cross-device sync (so if
   the receptionist hits "Start" on one iPad, other screens catch up within
   ~4 seconds) combined with a **client-side 1-second timer** so the bill
   and clock on the *same* screen tick smoothly in between polls. If you
   later deploy on a platform that supports a persistent Node server
   (self-hosted, Railway, a custom server.js), you can swap the polling
   `useEffect` in `page.tsx` for a `socket.io` or native `ws` connection
   without touching the API route logic — the REST endpoints already return
   the full updated table document after every action, which is exactly
   what you'd broadcast over a socket.

2. **`rates` folded in properly, not just designed.** Your diagram defined a
   `rates` collection but the API list only had `/api/tables`, `/api/menu`,
   `/api/reports`. I added full `/api/rates` CRUD, because "Batch Rate
   Update" and the Start-Session rate picker both need to read live rate
   documents rather than hardcoded numbers.

3. **Billing math centralized in one pure function** (`lib/billing.ts` →
   `computeSessionBill`), imported by both the `end` session API route (to
   write the final, authoritative `RevenueLog`) and the `TableCard`
   component (to show a live-ticking bill). This guarantees the number
   the receptionist watches tick up is exactly the number that gets
   charged — no drift between a "display estimate" and the real charge.

4. **Pause is now a real accounting feature, not just a UI toggle.** A
   `pausedDurationMs` + `pauseStartedAt` pair on the session means a paused
   table's `per_minute` bill genuinely stops accruing (useful for e.g. a
   rain delay or a dispute), and resumes correctly after resume — verified
   in `computeSessionBill`.

5. **`revenue_logs` records one row per closed session** (not just one row
   per day) so a report can break revenue down by table/customer/time as
   well as roll up into a daily total — `totals` in the `/api/reports`
   response is the daily aggregate your mockup's "Today's Total Revenue"
   card wants; `logs` is the detail table for the exportable report.

6. **Design.** The reference screenshots are a generic dark dashboard
   template; since this is literally a *snooker club*, I gave it a
   signature look instead: a felt-green/brass palette, a diamond-stitch
   "rail" border on every card (evoking a table's cushion), and the live
   session timers rendered in a glowing LED/scoreboard mono font
   (`Share Tech Mono`) so an occupied table reads like a scoreboard clock,
   not a generic stat card. Headings use `Bebas Neue`, a condensed poster
   face, for that snooker-hall marquee feel.

## Extending

- **Auth**: there's no login yet — `ADMIN_PASSWORD` in `.env.example` is a
  placeholder. For a real deployment, gate the "Pricing, Reports & Settings"
  tab behind NextAuth or a simple cookie-based password check in
  `middleware.ts`.
- **Reservations**: `PATCH /api/tables/:id` accepts `{ reservation: {...} }`
  or `{ reservation: null }` to set/clear the yellow "Reserved" state shown
  in the mockup — there's no dedicated reservation UI yet, wire a small form
  to that endpoint when you need it.
- **Real WebSockets**: see point 1 above.
