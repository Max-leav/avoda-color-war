import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// POST /api/admin/search-users
// Admin-only user lookup. Returns the profile plus Venmo handle and last 4
// phone digits, which the browser client can't read on its own -- the RLS
// policy on user_payment_info limits every signed-in user to their own row.
// This route reads it with the service role key, but only after confirming
// the CALLER is an admin.
//
// Body: { query: string }
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json({ error: "Enter something to search for." }, { status: 400 });
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

    const { data: caller, error: callerErr } = await db
      .from("users")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (callerErr) {
      console.error("search-users: caller lookup failed:", callerErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${callerErr.message}` },
        { status: 500 }
      );
    }
    if (!caller?.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Escape the wildcards so a search for "%" doesn't match everyone.
    const term = query.trim().replace(/[%_]/g, (c) => `\\${c}`);

    const { data: users, error: searchErr } = await db
      .from("users")
      .select("*")
      .or(`username.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(10);
    if (searchErr) throw searchErr;

    const ids = (users ?? []).map((u) => u.id);
    const { data: payments, error: paymentErr } = ids.length
      ? await db
          .from("user_payment_info")
          .select("user_id, venmo_handle, phone_last4")
          .in("user_id", ids)
      : { data: [], error: null };

    if (paymentErr) {
      // A missing payment table shouldn't break user search outright -- the
      // balance tools still work without it.
      console.error("search-users: payment info lookup failed:", paymentErr);
    }

    const byUser = new Map(
      (payments ?? []).map((p: any) => [p.user_id, p])
    );

    const results = (users ?? []).map((u) => ({
      ...u,
      venmo_handle: byUser.get(u.id)?.venmo_handle ?? null,
      phone_last4: byUser.get(u.id)?.phone_last4 ?? null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/admin/search-users failed:", err);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
