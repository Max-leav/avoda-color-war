import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// POST /api/markets
// Creates a new market. Any signed-in user can create one (change this if
// you want market creation restricted to an admin allowlist).
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
