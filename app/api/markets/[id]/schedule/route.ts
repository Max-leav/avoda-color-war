import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// PATCH /api/markets/[id]/schedule
// Closes a market early, or moves its close time.
//
// Body: { closeNow: true } | { closeTime: string (ISO) }
//
// The hard rule: this only works while the market is still open. Once a
// market has closed -- either because its time passed or because someone
// closed it early -- the schedule is frozen. Allowing a reopen would mean
// people could bet on an outcome others may already know, which is the one
// way to genuinely break a prediction market. Resolving a closed market is
// still fine; that's a separate endpoint.
//
// Permitted for the market's creator or any admin account.
// ============================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const marketId = params.id;
    const { closeNow, closeTime } = await req.json();

    if (!closeNow && !closeTime) {
      return NextResponse.json(
        { error: "Send either closeNow: true or a closeTime." },
        { status: 400 }
      );
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
    const userId = userData.user.id;

    const db = getServiceClient();

    const [{ data: market, error: marketErr }, { data: profile, error: profileErr }] =
      await Promise.all([
        db.from("markets").select("*").eq("id", marketId).maybeSingle(),
        db.from("users").select("is_admin").eq("id", userId).maybeSingle(),
      ]);

    if (marketErr) {
      console.error("PATCH schedule: market lookup failed:", marketErr);
      return NextResponse.json(
        { error: `Could not load the market: ${marketErr.message}` },
        { status: 500 }
      );
    }
    if (!market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }
    if (profileErr) {
      console.error("PATCH schedule: profile lookup failed:", profileErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${profileErr.message}` },
        { status: 500 }
      );
    }

    const isCreator = market.creator_id === userId;
    if (!isCreator && !profile?.is_admin) {
      return NextResponse.json(
        { error: "Only the market's creator or an admin can change its schedule." },
        { status: 403 }
      );
    }

    if (market.resolved) {
      return NextResponse.json(
        { error: "This market has already resolved." },
        { status: 400 }
      );
    }

    const alreadyClosed = new Date(market.close_time).getTime() <= Date.now();
    if (alreadyClosed) {
      return NextResponse.json(
        {
          error:
            "This market is already closed. Its schedule can't be changed -- resolve it instead.",
        },
        { status: 400 }
      );
    }

    let newCloseTime: string;

    if (closeNow) {
      newCloseTime = new Date().toISOString();
    } else {
      const parsed = new Date(closeTime);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "That close time isn't a valid date." }, { status: 400 });
      }
      // A past close time via this path is almost always a timezone mistake
      // rather than an intent to close immediately -- closeNow exists for that.
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "New close time must be in the future. Use 'Close now' to close immediately." },
          { status: 400 }
        );
      }
      newCloseTime = parsed.toISOString();
    }

    const { data: updated, error: updateErr } = await db
      .from("markets")
      .update({ close_time: newCloseTime })
      .eq("id", marketId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return NextResponse.json({ market: updated, closed: !!closeNow });
  } catch (err) {
    console.error("PATCH /api/markets/[id]/schedule failed:", err);
    return NextResponse.json({ error: "Could not update the market." }, { status: 500 });
  }
}
