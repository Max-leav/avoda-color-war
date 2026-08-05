import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { priceForSide, round2 } from "@/lib/calculations";

// ============================================================================
// POST /api/bets
// Places a bet. Runs entirely server-side so a user can never bypass the
// balance check or forge a bet's recorded price by calling Supabase directly
// from the browser.
//
// Body: { marketId: string, side: "yes" | "no", amount: number }
// Auth: expects the caller's Supabase access token in the Authorization header
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { marketId, side, amount } = await req.json();

    if (!marketId || (side !== "yes" && side !== "no")) {
      return NextResponse.json({ error: "Invalid market or side." }, { status: 400 });
    }
    const stake = Number(amount);
    if (!Number.isFinite(stake) || stake <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
    }

    // Identify the caller from their access token (sent by the client).
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

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

    // Load the user's current balance/role and the market state.
    const [{ data: profile, error: profileErr }, { data: market, error: marketErr }] =
      await Promise.all([
        db.from("users").select("id, balance, is_admin").eq("id", userId).single(),
        db.from("markets").select("*").eq("id", marketId).single(),
      ]);

    if (profileErr || !profile) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }
    if (marketErr || !market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }
    if (profile.is_admin) {
      return NextResponse.json(
        { error: "Admin accounts cannot place bets." },
        { status: 403 }
      );
    }
    if (market.resolved) {
      return NextResponse.json({ error: "This market has already resolved." }, { status: 400 });
    }
    if (new Date(market.close_time).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This market is closed to new bets." }, { status: 400 });
    }
    if (profile.balance < stake) {
      return NextResponse.json({ error: "Insufficient credits." }, { status: 400 });
    }

    // Record the implied probability at the moment of the bet.
    const price = priceForSide(market, side);

    // Insert the bet.
    const { data: bet, error: betErr } = await db
      .from("bets")
      .insert({ user_id: userId, market_id: marketId, side, amount: stake, price })
      .select()
      .single();
    if (betErr) throw betErr;

    // Update the market's pool for that side.
    const poolField = side === "yes" ? "yes_pool" : "no_pool";
    const newPoolValue = round2(Number(market[poolField]) + stake);
    const { error: marketUpdateErr } = await db
      .from("markets")
      .update({ [poolField]: newPoolValue })
      .eq("id", marketId);
    if (marketUpdateErr) throw marketUpdateErr;

    // Deduct the stake from the user's balance.
    const newBalance = round2(Number(profile.balance) - stake);
    const { error: balanceErr } = await db
      .from("users")
      .update({ balance: newBalance })
      .eq("id", userId);
    if (balanceErr) throw balanceErr;

    // Ledger entry.
    const { error: txErr } = await db.from("transactions").insert({
      user_id: userId,
      type: "bet_placed",
      amount: -stake,
      description: `Bet ${side.toUpperCase()} on market ${marketId}`,
    });
    if (txErr) throw txErr;

    return NextResponse.json({ bet, newBalance });
  } catch (err: any) {
    console.error("POST /api/bets failed:", err);
    return NextResponse.json({ error: "Something went wrong placing the bet." }, { status: 500 });
  }
}
