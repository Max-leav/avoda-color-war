"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BROKER_FEE_RATE } from "@/lib/calculations";

const FEE_PERCENT = Math.round(BROKER_FEE_RATE * 100);

/**
 * The "what is this and how do I play" block at the top of the home page.
 *
 * Collapsed by default so it doesn't push the markets off the screen for
 * people who already know how it works -- the first section is open, the rest
 * are a tap away.
 *
 * The credits and password sections are admin-editable and stored in the
 * database, because their answers are specific to your camp ("find me at
 * lunch") and change more often than a deploy cycle allows. Defaults below
 * cover the case where nothing has been written yet.
 */

const DEFAULT_CREDITS_HELP =
  "Credits are handed out by me, Max Leavitt. They don't arrive automatically when you sign up. When I have received your venmo, @Max-leav, I will then give your account credits at a 1:1 ratio. At the end of Color War, all credits in your account will be payed back out via venmo at a 1:1 ratio.";

const DEFAULT_PASSWORD_HELP =
  "If you need to reset your password, please send an email to \"max@kesame.com\" asking for a password reset. I will then send a reset code back to you which will be active for 1 hour. Then go to Sign in, tap \"Forgot your password?\", and enter your email with that code. You choose the new password yourself.";

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="border border-border bg-surface rounded-xl overflow-hidden"
    >
      <summary className="px-4 py-3 text-sm text-ink cursor-pointer select-none hover:bg-surfaceHover transition-colors focus-ring">
        {title}
      </summary>
      <div className="px-4 pb-4 pt-1 text-xs text-muted leading-relaxed space-y-3">
        {children}
      </div>
    </details>
  );
}

export default function WelcomePanel() {
  const [creditsHelp, setCreditsHelp] = useState(DEFAULT_CREDITS_HELP);
  const [passwordHelp, setPasswordHelp] = useState(DEFAULT_PASSWORD_HELP);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("site_content")
      .select("key, body")
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        for (const row of data) {
          // Empty means "nothing written yet", so keep the default rather
          // than showing a blank section.
          if (!row.body?.trim()) continue;
          if (row.key === "credits_help") setCreditsHelp(row.body);
          if (row.key === "password_help") setPasswordHelp(row.body);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-10">
      <h1 className="font-display text-3xl font-700 text-ink mb-1">
        Avoda Color War Exchange
      </h1>
      <p className="text-muted text-sm mb-5">
        Bet credits on what happens next. Everything below is play-money.
      </p>

      <div className="space-y-2">
        <Section title="How payouts work" defaultOpen>
          <p>
            Every credit bet on a side goes into that side&apos;s pool. When the market
            resolves, whoever backed the winning side gets their own stake back plus a
            share of the losing pool, split in proportion to how much each person
            staked.
          </p>
          <p>
            <span className="text-ink">Your odds aren&apos;t locked in.</span> The rate
            shown on a market is what it pays right now, and it moves until betting
            closes. More money on your side shrinks your share, while more on the other side
            grows it. What you collect is worked out from the pools as they stand when
            the market closes, NOT from the number showing when you bet.
          </p>
          <p>
            Your own bet moves it too. Staking 100 on a market showing 1.95× won&apos;t
            pay 1.95×, because your 100 joins the pool you&apos;re backing and dilutes
            it. The bet form prices your exact stake as you type in your potential stake.
          </p>
          <p>
            I will keep a <span className="text-ink">{FEE_PERCENT}% broker fee</span>
            on. This is the same fee sportsbooks and prediction markets like Kalshi use.
          </p>
          <p>
            If nobody bets the winning side, or a market gets cancelled, every stake is
            refunded in full.
          </p>
        </Section>

        <Section title="How to get credits">
          <p className="whitespace-pre-line">{creditsHelp}</p>
        </Section>

        <Section title="Forgot your password?">
          <p className="whitespace-pre-line">{passwordHelp}</p>
          <p>
            <Link href="/reset-password" className="text-brand hover:underline">
              Go to the reset page
            </Link>
          </p>
        </Section>
      </div>
    </section>
  );
}
