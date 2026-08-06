import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// POST /api/auth/ensure-profile
// Self-heal endpoint: if a signed-in user has no row in public.users (e.g.
// their signup happened before the trigger existed, or the trigger failed
// for any reason), create one now with the standard starting balance. Safe
// to call repeatedly -- it's a no-op if the row already exists.
// ============================================================================
export async function POST(req: NextRequest) {
  try {
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
    const user = userData.user;

    const db = getServiceClient();

    const { data: existing } = await db
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    const username =
      (user.user_metadata?.username as string | undefined) ||
      user.email?.split("@")[0] ||
      `user_${user.id.slice(0, 8)}`;

    const { data: created, error: insertErr } = await db
      .from("users")
      // Starts at zero -- credits are issued by an admin, not handed out on signup.
      .insert({ id: user.id, username, email: user.email, balance: 0 })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ profile: created });
  } catch (err) {
    console.error("POST /api/auth/ensure-profile failed:", err);
    return NextResponse.json({ error: "Could not create profile." }, { status: 500 });
  }
}
