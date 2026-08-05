import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { round2 } from "@/lib/calculations";

// ============================================================================
// POST /api/admin/adjust-balance
// Lets an admin account credit or debit another user's balance directly
// (e.g. correcting a mistake, seeding extra credits for an event). This is
// the ONLY way a balance changes outside of a bet being placed or a market
// resolving -- and it is only reachable by accounts with is_admin = true.
//
// Body: { targetUserId: string, amount: number, description: string }
//   amount can be positive (credit) or negative (debit).
// Auth: caller's Supabase access token in the Authorization header.
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { targetUserId, amount, description } = await req.json();

    const delta = Number(amount);
    if (!targetUserId || !Number.isFinite(delta) || delta === 0) {
      return NextResponse.json(
        { error: "targetUserId and a non-zero numeric amount are required." },
        { status: 400 }
      );
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "A description is required for the ledger." }, { status: 400 });
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

    // Confirm the CALLER is an admin -- never trust a flag sent from the client.
    const { data: caller, error: callerErr } = await db
      .from("users")
      .select("id, is_admin")
      .eq("id", userData.user.id)
      .single();
    if (callerErr || !caller?.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: target, error: targetErr } = await db
      .from("users")
      .select("id, balance")
      .eq("id", targetUserId)
      .single();
    if (targetErr || !target) {
      return NextResponse.json({ error: "Target user not found." }, { status: 404 });
    }

    const newBalance = round2(Number(target.balance) + delta);
    if (newBalance < 0) {
      return NextResponse.json({ error: "Adjustment would make balance negative." }, { status: 400 });
    }

    const { error: updateErr } = await db
      .from("users")
      .update({ balance: newBalance })
      .eq("id", targetUserId);
    if (updateErr) throw updateErr;

    const { error: txErr } = await db.from("transactions").insert({
      user_id: targetUserId,
      type: "admin_adjustment",
      amount: delta,
      description: description.trim(),
    });
    if (txErr) throw txErr;

    return NextResponse.json({ success: true, newBalance });
  } catch (err) {
    console.error("POST /api/admin/adjust-balance failed:", err);
    return NextResponse.json({ error: "Could not adjust balance." }, { status: 500 });
  }
}
