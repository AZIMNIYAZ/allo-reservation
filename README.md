# Allo Inventory Reservation Platform

A production-grade, end-to-end inventory and order-fulfillment reservation system built for multi-warehouse retail and D2C brands.

> **Built for:** Allo Engineering Hackathon  
> **Stack:** Next.js 16 (App Router), TypeScript, Prisma 5, PostgreSQL (Supabase), Tailwind CSS + shadcn/ui, Zod

---

## Live Demo

**Deployed URL:** *(deploy to Vercel and paste your URL here)*

---

## What This Solves

When a customer reaches checkout, payment can take several minutes (3DS, UPI redirects, wallet flows). During that window, thousands of other shoppers may be looking at the same product page.

This app implements a **reservation pattern**:
- At checkout, units are temporarily held for a 10-minute window.
- If payment succeeds, the reservation is **confirmed** and stock is permanently decremented.
- If payment fails or the timer expires, the hold is **released** so units become available again.
- The reservation endpoint is **correct under concurrency** — if two shoppers request the last unit simultaneously, exactly one succeeds (HTTP 201) and the other receives a HTTP 409.

---

## Architecture Highlights

### Concurrency Safety (The Core)

Instead of read-check-write (which creates a classic race condition), we use a **single atomic PostgreSQL UPDATE with a conditional guard**:

```sql
UPDATE stocks
SET reserved_units = reserved_units + 1
WHERE product_id = $1
  AND warehouse_id = $2
  AND (total_units - reserved_units) >= $3
```

This relies on PostgreSQL row-level locking during the update. Two simultaneous transactions attempting to grab the last unit are serialized by the database. The first increments `reserved_units`, the second sees the updated row and fails the `WHERE` clause, affecting 0 rows. We detect this and return **HTTP 409 Conflict**.

The operation is wrapped in a Prisma interactive transaction with **Serializable isolation** for maximum correctness.

### Reservation Expiry

We use a **lazy cleanup + scheduled batch cleanup** strategy:

1. **Lazy cleanup** is the primary mechanism: when a user attempts to `confirm` a reservation that has already passed `expiresAt`, the endpoint immediately releases the stock (decrements `reserved_units`, marks the reservation `RELEASED`) and returns **HTTP 410 Gone**. This ensures stock is never permanently trapped, even without any background worker.
2. **Batch cleanup endpoint** (`GET /api/cron/release-expired`) is provided to eagerly release all expired `PENDING` reservations in a batch. This can be triggered by:
   - An external cron scheduler (e.g., [cron-job.org](https://cron-job.org) — free, hits your endpoint every minute)
   - Vercel Cron Jobs (on Pro plans)
   - A manual admin call

This dual strategy favors **simplicity and correctness** over a background worker or queue, which would add operational complexity for this scope.

### Idempotency (Bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` support `Idempotency-Key` headers.

- **Reserve:** We store the idempotency key directly on the `Reservation` row with a unique constraint (`idempotency_key`). If a client retries with the same key, we return the existing reservation without touching stock again.
- **Confirm / Release:** We implement a generic `IdempotencyCache` table that stores `SHA256(body) → response` for a TTL window. This prevents double-charging or double-releasing if a client retries due to a flaky network.

### Frontend UX

- **Server-rendered product grid** with real-time per-warehouse available stock (`total - reserved`).
- **Live countdown timer** on the checkout page with color-coded urgency (green → amber → red).
- **Optimistic UI feedback:** loading spinners, toast notifications, and instant state transitions after confirm/cancel.
- **Error visibility:** HTTP 409 (stock unavailable) and HTTP 410 (reservation expired) are surfaced to the user via prominent toast banners — never swallowed.
- **Confetti effect** on successful purchase confirmation for a touch of delight.

---

## Getting Started Locally

### Prerequisites

- Node.js 18+
- A hosted PostgreSQL database (we recommend [Supabase](https://supabase.com/) free tier)
- A Vercel account (for deployment)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/allo-reservation.git
cd allo-reservation
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase connection string:

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
CRON_SECRET="any-random-secret-for-local-testing"
```

> **Tip:** If you see connection errors during migrate, use the **direct (non-pooled)** connection string from Supabase (find it in Settings → Database → Connection String → URI mode). Append `?connection_limit=1` if needed for Prisma.

### 3. Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations (creates tables)
npm run db:migrate

# Seed the database with products, warehouses, and stock
npm run db:seed
```

### 4. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Reference

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/api/products` | List products with per-warehouse available stock |
| `GET` | `/api/warehouses` | List warehouses |
| `POST` | `/api/reservations` | Reserve units. Returns `409` if insufficient stock. Accepts `Idempotency-Key`. |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. Returns `410` if expired. |
| `POST` | `/api/reservations/:id/release` | Release reservation early. |
| `GET` | `/api/cron/release-expired` | Batch-release expired reservations (trigger via external scheduler). |

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma          # Product, Warehouse, Stock, Reservation, IdempotencyCache
│   └── seed.ts                # Seed script with realistic multi-warehouse inventory
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── products/route.ts
│   │   │   ├── warehouses/route.ts
│   │   │   ├── reservations/route.ts                 # Atomic reserve
│   │   │   ├── reservations/[id]/confirm/route.ts    # Confirm + lazy expiry
│   │   │   ├── reservations/[id]/release/route.ts    # Release
│   │   │   └── cron/release-expired/route.ts         # Batch cleanup endpoint
│   │   ├── page.tsx             # Product listing (Server Component)
│   │   ├── loading.tsx          # Skeleton loader for product grid
│   │   └── [reservationId]/
│   │       ├── page.tsx             # Checkout page
│   │       └── not-found.tsx        # Custom not-found UI
│   ├── components/
│   │   ├── product-card.tsx       # Client: reserve button + stock badges
│   │   └── reservation-checkout.tsx # Client: countdown, confirm, cancel
│   └── lib/
│       ├── prisma.ts            # Singleton Prisma client
│       ├── schemas.ts           # Zod validation schemas
│       └── idempotency.ts       # Idempotency cache helpers
├── .env.example
└── package.json
```

---

## How Expiry Works in Production

1. **Lazy cleanup** is the guaranteed safety net: every `confirm` request first checks if `expiresAt < now()`. If true, it immediately releases stock back to the pool and returns `410 Gone`.
2. **Batch cleanup** is available via `GET /api/cron/release-expired`. On a free infrastructure tier, you can register this URL with a free external cron service (e.g., cron-job.org) to run every 60 seconds. This eagerly reclaims expired holds before the next shopper arrives, keeping displayed stock as accurate as possible.
3. There is no background worker or Redis queue in this architecture — we intentionally kept the moving parts minimal to maximize reliability and reduce cold-start latency on serverless hosting.

---

## Deployment to Vercel

1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com).
3. Add the **Environment Variables** from your `.env` file in the Vercel dashboard (Project Settings → Environment Variables):
   - `DATABASE_URL`
   - `CRON_SECRET` (optional; protects the batch cleanup endpoint)
4. Vercel will run `npm run build` automatically, which includes `prisma generate` via the `postinstall` script.
5. After first deploy, open the Vercel **Function Logs** and run the seed script locally against your production database once:
   ```bash
   DATABASE_URL="your-production-url" npx tsx prisma/seed.ts
   ```
6. *(Optional)* Register `https://your-app.vercel.app/api/cron/release-expired` with an external cron service to run every minute.

---

## Trade-offs & What We'd Do Differently

| Decision | Rationale | With More Time |
|----------|-----------|--------------|
| **Atomic SQL UPDATE instead of Redis Redlock** | Keeps the stack simple and leverages Postgres, which we already require. One less moving part in a hackathon. | Add Redis (Upstash) for distributed locking if we needed to reserve across multiple DB shards or wanted sub-millisecond lock contention metrics. |
| **Lazy cleanup + external cron instead of a background worker** | No extra infra, works perfectly on serverless, and is guaranteed correct. | Move to a proper queue (Inngest, BullMQ, or Temporal) with per-reservation scheduled jobs for sub-second expiry precision and cleaner separation of concerns. |
| **Idempotency in Postgres table** | No extra Redis dependency; works well for moderate traffic. | Move to Redis with TTL for O(1) lookup and automatic expiration of stale keys. |
| **No Stripe / payment gateway** | Out of scope for the exercise; we simulate "Confirm Purchase" as the payment-success signal. | Integrate a real payment provider webhook that calls confirm asynchronously, with full idempotency across the payment → reservation → inventory pipeline. |
| **Client-side timer only** | Simplifies architecture. | Add WebSocket or Server-Sent Events to push expiry events to open checkout tabs in real time. |
| **Image hotlinks (Unsplash)** | Quick visual polish without image hosting. | Upload product images to a CDN (Cloudinary / Uploadcare) and store URLs in DB. |

---

## Testing Concurrency

You can verify the race-condition protection with a simple script:

```bash
# Open two terminals and paste this curl simultaneously:
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"productId":"<IPHONE_PRODUCT_ID>","warehouseId":"<MUMBAI_WAREHOUSE_ID>","quantity":1}'
```

With the seed data, **Mumbai FC has only 1 iPhone 15 Pro**. Both requests will hit simultaneously; one returns `201 Created`, the other returns `409 Conflict`.

---

## License

MIT — built for the Allo Engineering Hackathon.
