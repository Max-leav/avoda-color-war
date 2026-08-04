import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { calculatePayout, round2 } from "@/lib/calculations";

// ============================================================================
// POST /api/markets/[id]/resolve
// Resolves a market to "yes" or "no" and pays out every winning bet.
// Only the market's creator may resolve it (simple rule for a small self-run
// site -- swap for a proper admin check if you want tighter control).
// Body: { winningSide: "yes" | "no" }
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const marketId = params.id;
    const { winningSide } = await req.json();
    if (winningSide !== "yes" && winningSide !== "no") {
      return NextResponse.json({ error: "winningSide must be 'yes' or 'no'." }, { status: 400 });
    }

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

    const db = getServiceClient();

    const { data: market, error: marketErr } = await db
      .from("markets")
      .select("*")
      .eq("id", marketId)
      .single();
    if (marketErr || !market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }
    if (market.resolved) {
      return NextResponse.json({ error: "Market already resolved." }, { status: 400 });
    }
    if (market.creator_id !== userData.user.id) {
      return NextResponse.json({ error: "Only the creator can resolve this market." }, { status: 403 });
    }

    // Mark resolved first so no new bets can slip in mid-payout.
    const { error: resolveErr } = await db
      .from("markets")
      .update({ resolved: true, winning_side: winningSide })
      .eq("id", marketId);
    if (resolveErr) throw resolveErr;

    const { data: bets, error: betsErr } = await db
      .from("bets")
      .select("*")
      .eq("market_id", marketId);
    if (betsErr) throw betsErr;

    for (const bet of bets ?? []) {
      const payout = calculatePayout(bet, { ...market, winning_side: winningSide });

      await db.from("bets").update({ payout }).eq("id", bet.id);

      if (payout > 0) {
        const { data: bettor } = await db
          .from("users")
          .select("balance")
          .eq("id", bet.user_id)
          .single();
        if (bettor) {
          const newBalance = round2(Number(bettor.balance) + payout);
          await db.from("users").update({ balance: newBalance }).eq("id", bet.user_id);
          await db.from("transactions").insert({
            user_id: bet.user_id,
            type: "payout",
            amount: payout,
            description: `Payout for winning ${winningSide.toUpperCase()} bet on market ${marketId}`,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/markets/[id]/resolve failed:", err);
    return NextResponse.json({ error: "Could not resolve market." }, { status: 500 });
  }
}
