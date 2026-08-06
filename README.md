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
free-credits balance (`users.balance`) that starts at 0 and is never tied
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
   Level Security policies, and a trigger that creates a profile row for every
   new signup with a 0
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

Visit `http://localhost:3000`, sign up (you'll start with 0 credits -- an admin
issues them from the Admin page),
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

## 7. Admin accounts

`users.is_admin` controls admin status. Admins:
- **cannot place bets** (enforced server-side in `app/api/bets/route.ts`)
- can credit/debit any user's balance from `/admin`, via
  `app/api/admin/adjust-balance/route.ts`

**A user's balance can only ever change in three ways**, all server-side,
all logged to `transactions`:
1. Placing a bet (`app/api/bets/route.ts`)
2. A market resolving (`app/api/markets/[id]/resolve/route.ts`)
3. An admin adjustment (`app/api/admin/adjust-balance/route.ts`)

There is deliberately no database policy that lets a signed-in user UPDATE
their own `users` row from the browser — that would let anyone set their own
`balance` or `is_admin` from dev tools. All writes to those columns go
through the service role key on the server, after each route's own checks.

### Making an account an admin

There's no self-serve toggle in the app (on purpose — you don't want users
making themselves admin). To promote an account:

1. Have that person sign up normally first, so their row exists in
   `public.users`.
2. In Supabase, go to **Table Editor → users**, find their row, and flip
   `is_admin` to `true`. Or run in the **SQL Editor**:

   ```sql
   update public.users set is_admin = true where email = 'them@example.com';
   ```

3. They'll need to sign out and back in (or just refresh) for the app to
   pick up the change.

If you're adding `is_admin` to a database that already has the old schema,
run the migration block at the bottom of `supabase/schema.sql` first.

## 8. Notes on trust & abuse, since this is just for friends

- Anyone signed in can currently create a market and is the sole authority
  who can resolve it (`app/api/markets/[id]/resolve/route.ts` checks
  `creator_id`). For a small friend group this is usually fine; if you want
  tighter control, hardcode a list of allowed creator/resolver user IDs in
  that route instead.
- There's no dispute process if a creator resolves a market dishonestly —
  worth deciding informally with whoever you invite in.
- Free-tier Supabase pauses projects after a week of inactivity; log in
  every so often or upgrade if that's a problem.

## Venmo handles

Collected on the signup form and stored in `public.user_payment_info`, which is
readable only by its owner -- `public.users` is world-readable (that's how
usernames and balances show up), so payment details can't live there. Admins
read handles through `/api/admin/search-users`, which checks `is_admin`
server-side before returning anything.

The handle travels as auth metadata and is copied across by the signup trigger,
rather than being POSTed after signup. With email confirmation enabled,
`signUp()` returns no session, so a follow-up write would have nothing to
authenticate with and the handle would be dropped for exactly those accounts.
The trigger validates the shape and skips anything malformed -- an error raised
inside it would abort the whole signup, and a typo'd handle must never stop
someone creating an account.

Users can add or change it later on their profile page.

## Password resets

The flow is: `/login` → "Forgot your password?" → Supabase emails a link →
`/reset-password` → new password saved via `supabase.auth.updateUser()`.

Two things have to be set in the Supabase dashboard or the emailed link will
bounce, and the failure looks like a bug in the app rather than config:

1. **Authentication → URL Configuration → Site URL** — set to your deployed
   origin (e.g. `https://your-app.vercel.app`), not `localhost`.
2. **Authentication → URL Configuration → Redirect URLs** — add
   `https://your-app.vercel.app/reset-password`. Supabase refuses to redirect
   anywhere not on this allowlist. Add `http://localhost:3000/reset-password`
   too if you test resets locally.

Reset links are single-use, time-limited, and have to be opened in the same
browser they were requested from (the PKCE code verifier lives in that
browser's storage). The reset page reports each of these cases distinctly.

Supabase's built-in email sender is rate-limited to a few messages per hour on
the free tier, which is fine for a camp-sized group but will silently throttle
you during heavy testing. Set up custom SMTP under Authentication → Emails if
you hit it.

## Credits and the house cut

New accounts start at **0 credits**. Credits only enter circulation when an
admin issues them from the Admin page, which is also the only place they can
be taken back. That makes the total supply something you control rather than
something that grows every time someone registers another email address.

Winning bets pay out **minus a 5% broker's fee**, set by `BROKER_FEE_RATE` in
`lib/calculations.ts`. The fee comes out of winnings only -- never out of the
stake being returned, and never out of a refund. That ordering matters: 5% of
the gross payout could make a narrow win pay back less than was staked, which
means being right and losing credits at the same time.

The fee isn't paid to anyone. It's simply not distributed, so total credits in
circulation shrink slightly with every resolved market. If you'd rather the
house actually accumulate it, credit it to a designated admin account during
resolution in `app/api/markets/[id]/resolve/route.ts`.
