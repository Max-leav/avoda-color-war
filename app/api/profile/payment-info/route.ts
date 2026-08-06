import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";
import { normalizeVenmoHandle, validateVenmoHandle } from "@/lib/payment";

// ============================================================================
// POST /api/profile/payment-info
// Saves the signed-in user's Venmo handle. You can only ever write your own row -- the user id comes from the access token,
// never from the request body, so there's nothing to tamper with.
//
// Body: { venmoHandle?: string }
// Sending an empty string clears it.
// ============================================================================
export async function POST(req: NextRequest) {
  try {
    const { venmoHandle = "" } = await req.json();

    if (typeof venmoHandle !== "string") {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const venmoError = validateVenmoHandle(venmoHandle);
    if (venmoError) return NextResponse.json({ error: venmoError }, { status: 400 });

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

    const cleanedHandle = normalizeVenmoHandle(venmoHandle);

    const db = getServiceClient();
    const { data, error } = await db
      .from("user_payment_info")
      .upsert(
        {
          user_id: userData.user.id,
          venmo_handle: cleanedHandle === "" ? null : cleanedHandle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("POST /api/profile/payment-info failed:", error);
      return NextResponse.json(
        { error: `Could not save your Venmo handle: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ paymentInfo: data });
  } catch (err) {
    console.error("POST /api/profile/payment-info failed:", err);
    return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
  }
}
