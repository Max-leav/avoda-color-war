import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { round2 } from "@/lib/calculations";

// ============================================================================
// POST /api/markets/[id]/void
// Cancels a market and returns every stake in full. For events that got
// called off, or outcomes nobody can fairly settle.
//
// Body: { reason?: string }
//
// No fee is taken -- nothing was won. Voiding is available whether or not
// betting has closed, since an event can be cancelled after the market shuts
// but before anyone knows a result. It is NOT available once a market has
// resolved: payouts are already spent by then, and clawing them back would
// mean taking credits out of balances people have since bet with.
//
// Creator or any admin.
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const marketId = params.id;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: userData, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const userId = userData.user.id;

    const db = getServiceClient();

    const [{ data: market, error: marketErr }, { data: profile, error: profileErr }] =
      await Promise.all([
        db.from("markets").select("*").eq("id", marketId).maybeSingle(),
        db.from("users").select("is_admin").eq("id", userId).maybeSingle(),
      ]);

    if (marketErr) {
      console.error("void: market lookup failed:", marketErr);
      return NextResponse.json(
        { error: `Could not load the market: ${marketErr.message}` },
        { status: 500 }
      );
    }
    if (!market) return NextResponse.json({ error: "Market not found." }, { status: 404 });

    if (profileErr) {
      console.error("void: profile lookup failed:", profileErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${profileErr.message}` },
        { status: 500 }
      );
    }

    if (market.creator_id !== userId && !profile?.is_admin) {
      return NextResponse.json(
        { error: "Only the market's creator or an admin can void a market." },
        { status: 403 }
      );
    }

    if (market.resolved) {
      return NextResponse.json(
        {
          error:
            "This market already resolved and paid out. Voiding it now would mean taking credits back out of balances people have already bet with.",
        },
        { status: 400 }
      );
    }

    if (market.voided) {
      return NextResponse.json(
        { error: "This market was already voided and refunded." },
        { status: 400 }
      );
    }

    // Flag it before refunding, the same order the resolve route uses. If
    // something fails midway, a second run is blocked by the check above --
    // far better than a retry paying everyone twice.
    const { error: voidErr } = await db
      .from("markets")
      .update({
        voided: true,
        void_reason: reason === "" ? null : reason,
      })
      .eq("id", marketId);
    if (voidErr) throw voidErr;

    const { data: bets, error: betsErr } = await db
      .from("bets")
      .select("*")
      .eq("market_id", marketId);
    if (betsErr) throw betsErr;

    let refundedCredits = 0;

    for (const bet of bets ?? []) {
      const refund = round2(Number(bet.amount));

      // Recorded as the payout for this bet so the position panel and bet
      // history show what came back rather than a blank.
      await db.from("bets").update({ payout: refund }).eq("id", bet.id);

      if (refund <= 0) continue;

      const { data: bettor } = await db
        .from("users")
        .select("balance")
        .eq("id", bet.user_id)
        .single();
      if (!bettor) continue;

      await db
        .from("users")
        .update({ balance: round2(Number(bettor.balance) + refund) })
        .eq("id", bet.user_id);

      await db.from("transactions").insert({
        user_id: bet.user_id,
        type: "refund",
        amount: refund,
        description: reason
          ? `Refund -- market voided: ${reason}`
          : `Refund -- market ${marketId} voided`,
      });

      refundedCredits = round2(refundedCredits + refund);
    }

    return NextResponse.json({
      success: true,
      refundedBets: bets?.length ?? 0,
      refundedCredits,
    });
  } catch (err) {
    console.error("POST /api/markets/[id]/void failed:", err);
    return NextResponse.json({ error: "Could not void the market." }, { status: 500 });
  }
}
