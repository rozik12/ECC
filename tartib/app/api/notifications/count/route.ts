import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Сколько непрочитанных уведомлений. Для колокольчика: страница опрашивает раз в минуту. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await createClient();
  const user = await getApiUser(supabase);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  return NextResponse.json({ unread: count ?? 0 }, { headers: { "cache-control": "no-store" } });
}
