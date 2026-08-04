# Forecast — a play-money prediction market

Bet virtual credits (not real money) on outcomes you define. Built with
Next.js (App Router), Supabase (Postgres + Auth), and deployed on Vercel —
all on free tiers.

## Why play-money, and not real dollars via Venmo

Real-money betting on outcomes — even settled peer-to-peer, even if your site
never touches the funds — is regulated gambling in the U.S. Kalshi can do this
legally only because it's a CFTC-registered exchange; that license is what
makes it legal, not the tech stack. Routing settlement through Venmo doesn't
create an exemption, and it violates Venmo's own terms. This build uses a
free-credits balance (`users.balance`) that starts at 1000 and is never tied
to any real payment method, which is what makes it fine to self-host and
share with friends.

## 1. Project structure

```
prediction-market/
├── app/
│   ├── layout.tsx              root layout, loads Navbar + AuthProvider
│   ├── page.tsx                home page: ticker + open/resolved markets
│   ├── globals.css
│   ├── login/page.tsx          email/password sign in & sign up
│   ├── profile/page.tsx        balance, bet history, transaction ledger
│   ├── markets/
│   │   ├── new/page.tsx        create a market
│   │   └── [id]/page.tsx       market detail, bet form, resolve controls
│   └── api/
│       ├── bets/route.ts               POST — place a bet (server-side balance check)
│       └── markets/
│           ├── route.ts                POST — create a market
│           └── [id]/resolve/route.ts   POST — resolve a market & pay out winners
├── components/
│   ├── AuthProvider.tsx        React context wrapping Supabase auth session
│   ├── Navbar.tsx
│   ├── Ticker.tsx              scrolling live-price ticker
│   ├── MarketCard.tsx
│   └── BetForm.tsx
├── lib/
│   ├── supabase.ts             browser client + server (service-role) client
│   ├── types.ts                shared TS types matching the DB schema
│   └── calculations.ts         pari-mutuel pricing & payout math
├── supabase/
│   └── schema.sql              run this in Supabase to create everything
├── .env.local.example
├── package.json
└── tailwind.config.ts
```

## 2. How the pricing works (pari-mutuel)

Every market has a `yes_pool` and `no_pool` — the running total staked on
each side. The displayed "price" is just each side's share of the total pool
(`lib/calculations.ts`). When a market resolves, each winning bet gets its
own stake back plus a share of the *losing* pool proportional to its share of
the winning pool. This is simpler and easier to audit than an order book or
AMM, at the cost of prices moving in discrete jumps rather than continuously.

All balance changes (placing a bet, receiving a payout) happen **only**
inside the two API routes, using the Supabase **service role** key, which
bypasses Row Level Security. Regular users can read markets/bets directly via
the browser client, but cannot write to `balance`, `yes_pool`, `no_pool`, or
insert a `bets` row themselves — this is what stops someone from opening dev
tools and giving themselves free credits.

## 3. Set up Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor → New query**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates all four tables, Row
   Level Security policies, and a trigger that gives every new signup 1000
   free credits automatically.
3. Go to **Authentication → Providers** and make sure **Email** is enabled.
   For quick local testing you can turn off "Confirm email" under
   **Authentication → Settings**.
4. Go to **Project Settings → API** and copy three values:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**keep this secret** —
     never put it in a `NEXT_PUBLIC_` variable or commit it to GitHub)

## 4. Run it locally

```bash
cp .env.local.example .env.local
# paste your three Supabase values into .env.local

npm install
npm run dev
```

Visit `http://localhost:3000`, sign up (you'll start with 1000 credits),
create a market, and place a bet.

## 5. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/prediction-market.git
git push -u origin main
```

`.env.local` is already in `.gitignore` — your Supabase keys won't be
committed.

## 6. Deploy on Vercel (free tier)

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. In **Environment Variables**, add the same three values from your
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Deploy. Vercel will build and give you a live URL.
4. Back in Supabase → **Authentication → URL Configuration**, add your
   Vercel URL to the Site URL / Redirect URLs so auth emails link back
   correctly.

## 7. Notes on trust & abuse, since this is just for friends

- Anyone signed in can currently create a market and is the sole authority
  who can resolve it (`app/api/markets/[id]/resolve/route.ts` checks
  `creator_id`). For a small friend group this is usually fine; if you want
  tighter control, hardcode a list of allowed creator/resolver user IDs in
  that route instead.
- There's no dispute process if a creator resolves a market dishonestly —
  worth deciding informally with whoever you invite in.
- Free-tier Supabase pauses projects after a week of inactivity; log in
  every so often or upgrade if that's a problem.
