"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";
import {
  normalizeVenmoHandle,
  validatePhoneLast4,
  validateVenmoHandle,
} from "@/lib/payment";

/**
 * Where a user records how to pay them out. Reads straight from
 * user_payment_info (RLS limits that to your own row) but writes through the
 * API, matching how every other write in this app works -- no client ever
 * mutates a table directly.
 */
export default function PaymentInfoForm() {
  const { session } = useAuth();
  const [venmo, setVenmo] = useState("");
  const [last4, setLast4] = useState("");
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
      .select("venmo_handle, phone_last4")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error: readErr }) => {
        if (cancelled) return;
        if (readErr) console.error("[payment] could not read your details:", readErr.message);
        if (data) {
          setVenmo(data.venmo_handle ?? "");
          setLast4(data.phone_last4 ?? "");
        }
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

    const last4Error = validatePhoneLast4(last4);
    if (last4Error) return setError(last4Error);

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
        body: JSON.stringify({
          venmoHandle: normalizeVenmoHandle(venmo),
          phoneLast4: last4.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save your details.");

      setVenmo(body.paymentInfo?.venmo_handle ?? "");
      setLast4(body.paymentInfo?.phone_last4 ?? "");
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
      <h2 className="font-display font-600 text-ink mb-1">Payment details</h2>
      <p className="text-xs text-muted mb-4 leading-relaxed">
        Only you and the admins can see these. The last 4 digits are there because
        Venmo sometimes asks for them to confirm it's the right person — leave it
        blank if you'd rather not.
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

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Last 4 of your phone number
      </label>
      <input
        value={last4}
        onChange={(e) => {
          // Keep it to digits as they type rather than scolding them after.
          setLast4(e.target.value.replace(/\D/g, "").slice(0, 4));
          setSaved(false);
        }}
        inputMode="numeric"
        placeholder="0000"
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 font-mono text-ink focus-ring mb-4"
      />

      {error && <p className="text-xs text-no mb-3">{error}</p>}
      {saved && <p className="text-xs text-yes mb-3">Saved.</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save payment details"}
      </button>
    </div>
  );
}
