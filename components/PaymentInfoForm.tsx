"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import { normalizeVenmoHandle, validateVenmoHandle } from "@/lib/payment";

/**
 * Where a user records how to pay them out. Reads straight from
 * user_payment_info (RLS limits that to your own row) but writes through the
 * API, matching how every other write in this app works -- no client ever
 * mutates a table directly.
 */
export default function PaymentInfoForm() {
  const { session } = useAuth();
  const [venmo, setVenmo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase
      .from("user_payment_info")
      .select("venmo_handle")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error: readErr }) => {
        if (cancelled) return;
        if (readErr) console.error("[payment] could not read your details:", readErr.message);
        if (data) setVenmo(data.venmo_handle ?? "");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function save() {
    setError(null);
    setSaved(false);

    const venmoError = validateVenmoHandle(venmo);
    if (venmoError) return setError(venmoError);

    setSaving(true);
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/profile/payment-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${freshSession?.access_token}`,
        },
        body: JSON.stringify({ venmoHandle: normalizeVenmoHandle(venmo) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save your details.");

      setVenmo(body.paymentInfo?.venmo_handle ?? "");
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!session || loading) return null;

  return (
    <div className="border border-border bg-surface rounded-xl p-5 mb-8">
      <h2 className="font-display font-600 text-ink mb-1">Venmo</h2>
      <p className="text-xs text-muted mb-4 leading-relaxed">
        Only you and the admins can see this. Leave it blank if you'd rather not
        share it.
      </p>

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Venmo handle
      </label>
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-muted">@</span>
        <input
          value={venmo}
          onChange={(e) => {
            setVenmo(e.target.value);
            setSaved(false);
          }}
          placeholder="your-venmo"
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 font-mono text-ink focus-ring"
        />
      </div>


      {error && <p className="text-xs text-no mb-3">{error}</p>}
      {saved && <p className="text-xs text-yes mb-3">Saved.</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save Venmo handle"}
      </button>
    </div>
  );
}
