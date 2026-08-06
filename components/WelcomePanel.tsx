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
  "Credits are handed out by an admin — they don't arrive automatically when you sign up. Find an admin to get your starting stack, and to top up if you bust.";

const DEFAULT_PASSWORD_HELP =
  "Ask an admin for a reset code. Then go to Sign in, tap \"Forgot your password?\", and enter your email with that code. You choose the new password yourself — no one else sees it.";

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
            closes. More money on your side shrinks your share; more on the other side
            grows it. What you collect is worked out from the pools as they stand when
            the market closes — not from the number showing when you bet.
          </p>
          <p>
            Your own bet moves it too. Staking 100 on a market showing 1.95× won&apos;t
            pay 1.95×, because your 100 joins the pool you&apos;re backing and dilutes
            it. The bet form prices your exact stake as you type — that&apos;s the
            honest number.
          </p>
          <p>
            The house keeps <span className="text-ink">{FEE_PERCENT}% of winnings</span>.
            It comes out of what you win, never out of your stake coming back, so a win
            is always a win.
          </p>
          <p>
            If nobody bet the winning side, or a market gets cancelled, every stake is
            refunded in full with no fee.
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
