import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// POST /api/markets
// Creates a new market. Admin accounts only -- hiding the nav link doesn't
// stop anyone from POSTing here directly, so the check has to live server-side.
// Body: { title: string, description?: string, closeTime: string (ISO) }
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { title, description, closeTime } = await req.json();

    if (!title || typeof title !== "string" || title.trim().length < 4) {
      return NextResponse.json({ error: "Title must be at least 4 characters." }, { status: 400 });
    }
    if (!closeTime || new Date(closeTime).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Close time must be in the future." }, { status: 400 });
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

    // Three different failures live here and they need different answers:
    // the lookup itself failing (config problem), no row existing (broken
    // account), and the row saying you're not an admin. Collapsing all three
    // into one 403 makes a misconfigured server look like a permissions
    // decision, which is exactly how you end up chasing the wrong bug.
    const { data: profile, error: profileErr } = await db
      .from("users")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("POST /api/markets: admin lookup failed:", profileErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${profileErr.message}` },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        { error: "No profile row found for this account." },
        { status: 404 }
      );
    }

    if (!profile.is_admin) {
      return NextResponse.json(
        { error: "Only admin accounts can create markets." },
        { status: 403 }
      );
    }

    const { data: market, error } = await db
      .from("markets")
      .insert({
        creator_id: userData.user.id,
        title: title.trim(),
        description: description?.trim() ?? null,
        close_time: closeTime,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ market });
  } catch (err) {
    console.error("POST /api/markets failed:", err);
    return NextResponse.json({ error: "Could not create market." }, { status: 500 });
  }
}
