import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// ============================================================================
// POST /api/admin/user-access
// Gets a locked-out user back in, without sending any email.
//
// Body: { userId: string, mode: "code" | "link" }
//
// Why this exists: Supabase's default email sender only delivers to addresses
// belonging to the project's organization, and caps out at a couple of
// messages an hour. So for everyone except the project owner, the emailed
// reset -- link or code -- silently goes nowhere. Anything that depends on a
// camper receiving an email is not a working reset flow here.
//
// Both modes hand the admin something to pass on in person or over text:
//   code -- a one-time reset code; the user redeems it and chooses their own
//           password on the reset page.
//   link -- a one-time sign-in link that signs them straight in.
//
// Neither lets an admin see or set someone's password. An earlier version of
// this route had a mode that generated a temporary password and set it
// directly, which is the obvious way to solve this and the wrong one: it
// means an admin knows a working password for a camper's account, and a
// camper who never changes it stays in that state all summer.
//
// Admin only, and the check happens server-side.
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const { userId, mode } = await req.json();

    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Pick a user first." }, { status: 400 });
    }
    if (mode !== "code" && mode !== "link") {
      return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
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
      console.error("user-access: caller lookup failed:", callerErr);
      return NextResponse.json(
        { error: `Could not verify your account: ${callerErr.message}` },
        { status: 500 }
      );
    }
    if (!caller?.is_admin) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: target, error: targetErr } = await db
      .from("users")
      .select("id, username, email")
      .eq("id", userId)
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    if (mode === "code") {
      // Mints a recovery token and hands it back instead of mailing it. The
      // code only gets its holder to the "choose a new password" screen.
      const { data: linkData, error: codeErr } = await db.auth.admin.generateLink({
        type: "recovery",
        email: target.email,
      });

      if (codeErr) {
        console.error("user-access: reset code generation failed:", codeErr);
        return NextResponse.json(
          { error: `Could not create a reset code: ${codeErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        mode: "code",
        username: target.username,
        code: linkData?.properties?.email_otp ?? null,
      });
    }

    // mode === "link"
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
      options: { redirectTo: req.nextUrl.origin },
    });

    if (linkErr) {
      console.error("user-access: link generation failed:", linkErr);
      return NextResponse.json(
        { error: `Could not create a sign-in link: ${linkErr.message}` },
        { status: 500 }
      );
    }

    // generateLink returns the link rather than mailing it, which is exactly
    // what's wanted here -- the admin passes it on directly.
    return NextResponse.json({
      mode: "link",
      username: target.username,
      link: linkData?.properties?.action_link ?? null,
    });
  } catch (err) {
    console.error("POST /api/admin/user-access failed:", err);
    return NextResponse.json({ error: "Could not update access." }, { status: 500 });
  }
}
