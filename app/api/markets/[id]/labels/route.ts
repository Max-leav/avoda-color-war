import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { normalizeSideLabel, validateSideLabel } from "@/lib/labels";

// ============================================================================
// PATCH /api/markets/[id]/labels
// Renames a market's two sides after the fact -- for fixing a typo, or
// naming teams that weren't decided when the market went up.
//
// Body: { yesLabel?: string | null, noLabel?: string | null }
// Blank or null resets that side to YES / NO.
//
// Only the names change. The stored side values stay 'yes' and 'no', so bets
// placed before a rename still point at the right side afterwards.
//
// Blocked once a market is settled: relabelling a finished market would
// rewrite what everyone's bet history says they backed.
//
// Creator or any admin.
// ============================================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const marketId = params.id;
    const { yesLabel, noLabel } = await req.json();

    for (const label of [yesLabel, noLabel]) {
      if (label === undefined || label === null) continue;
      if (typeof label !== "string") {
        return NextResponse.json({ error: "Side names must be text." }, { status: 400 });
      }
      const labelError = validateSideLabel(label);
      if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });
    }

    const cleanYesLabel = normalizeSideLabel(yesLabel);
    const cleanNoLabel = normalizeSideLabel(noLabel);

    if (
      cleanYesLabel &&
      cleanNoLabel &&
      cleanYesLabel.toLowerCase() === cleanNoLabel.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "The two sides need different names." },
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
      console.error("labels: market lookup failed:", marketErr);
      return NextResponse.json(
        { error: `Could not load the market: ${marketErr.message}` },
        { status: 500 }
      );
    }
    if (!market) return NextResponse.json({ error: "Market not found." }, { status: 404 });

    if (profileErr) {
      console.error("labels: profile lookup failed:", profileErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${profileErr.message}` },
        { status: 500 }
      );
    }

    if (market.creator_id !== userId && !profile?.is_admin) {
      return NextResponse.json(
        { error: "Only the market's creator or an admin can rename the sides." },
        { status: 403 }
      );
    }

    if (market.resolved || market.voided) {
      return NextResponse.json(
        { error: "This market is settled. Renaming its sides now would rewrite bet history." },
        { status: 400 }
      );
    }

    const { data: updated, error: updateErr } = await db
      .from("markets")
      .update({ yes_label: cleanYesLabel, no_label: cleanNoLabel })
      .eq("id", marketId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return NextResponse.json({ market: updated });
  } catch (err) {
    console.error("PATCH /api/markets/[id]/labels failed:", err);
    return NextResponse.json({ error: "Could not rename the sides." }, { status: 500 });
  }
}
