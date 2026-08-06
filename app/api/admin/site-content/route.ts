import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { SITE_CONTENT_KEYS } from "@/lib/types";

const MAX_BODY_LENGTH = 2000;

// ============================================================================
// POST /api/admin/site-content
// Saves the editable home page blurbs.
//
// Body: { credits_help?: string, password_help?: string }
//
// Only the keys the app knows about are writable -- the key comes from a
// fixed list, never from the request, so this can't be used to write
// arbitrary rows into site_content.
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

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
      console.error("site-content: caller lookup failed:", callerErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${callerErr.message}` },
        { status: 500 }
      );
    }
    if (!caller?.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const rows = [];
    for (const key of SITE_CONTENT_KEYS) {
      const value = payload?.[key];
      if (value === undefined) continue;
      if (typeof value !== "string") {
        return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
      }
      if (value.length > MAX_BODY_LENGTH) {
        return NextResponse.json(
          { error: `Keep each section under ${MAX_BODY_LENGTH} characters.` },
          { status: 400 }
        );
      }
      rows.push({ key, body: value.trim(), updated_at: new Date().toISOString() });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }

    const { error: saveErr } = await db
      .from("site_content")
      .upsert(rows, { onConflict: "key" });
    if (saveErr) throw saveErr;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/admin/site-content failed:", err);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}
