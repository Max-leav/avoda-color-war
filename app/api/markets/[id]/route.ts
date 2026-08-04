import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { calculatePools } from "@/lib/calculations";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();

  const { data: market, error: marketError } = await admin
    .from("markets")
    .select("*")
    .eq("id", params.id)
    .single();

  if (marketError || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const { data: bets, error: betsError } = await admin
    .from("bets")
    .select("*")
    .eq("market_id", params.id)
    .order("timestamp", { ascending: false });

  if (betsError) return NextResponse.json({ error: betsError.message }, { status: 500 });

  const pools = calculatePools(bets ?? []);

  return NextResponse.json({ market, bets, pools });
}
