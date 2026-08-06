"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Changing your own password while signed in. No email involved, which makes
 * this the only recovery path that works reliably here -- Supabase's default
 * sender only delivers to addresses inside the project's organisation, so a
 * camper on their own Gmail never receives anything.
 *
 * The current password is re-checked before the change goes through. Supabase
 * would happily update the password on session alone, but a session outlives
 * the tab: without this, anyone who walked up to an unlocked phone left on the
 * site could lock its owner out of their own account. At a camp, with shared
 * and borrowed devices everywhere, that's the likely case rather than the
 * paranoid one.
 */
export default function ChangePasswordForm() {
  const { session } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!session?.user?.email) return null;
  const email = session.user.email;

  async function save() {
    setError(null);
    setSaved(false);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    if (next === current) {
      setError("That's the same password you already have.");
      return;
    }

    setSaving(true);
    try {
      // Re-authenticate. A wrong password fails here, before anything changes.
      const { error: checkError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (checkError) {
        setError("That current password isn't right.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) throw updateError;

      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border bg-surface rounded-xl p-5 mb-8">
      <h2 className="font-display font-600 text-ink mb-1">Change your password</h2>
      <p className="text-xs text-muted mb-4 leading-relaxed">
        Locked out instead? An admin can issue you a one-time reset code — they can&apos;t
        see or set your password, only let you choose a new one.
      </p>

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Current password
      </label>
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        New password
      </label>
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      <label className="block text-xs uppercase tracking-wide text-muted mb-1">
        Confirm new password
      </label>
      <input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-ink focus-ring mb-4"
      />

      {error && <p className="text-xs text-no mb-3">{error}</p>}
      {saved && <p className="text-xs text-yes mb-3">Password updated.</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-brand text-bg font-display font-600 rounded-lg py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {saving ? "Saving…" : "Change password"}
      </button>
    </div>
  );
}
