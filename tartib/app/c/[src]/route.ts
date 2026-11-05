import { NextResponse, type NextRequest } from "next/server";
import { parseSource } from "@/lib/referral";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const DEFAULT = "https://t.me/tartibuk";

/** Ссылка в Telegram-канал по источнику (/c/site, /c/blog, /c/friends…): у каждого источника своя ссылка-приглашение, Telegram считает подписчиков по ним. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ src: string }> }) {
  const src = parseSource((await params).src);
  let url = DEFAULT;
  if (isSupabaseConfigured()) {
    try {
      const { data } = await (await createClient()).rpc("channel_link", { p_src: src });
      if (typeof data === "string" && data.startsWith("https://t.me/")) url = data;
    } catch {
      /* запасная ссылка ниже */
    }
  }
  const res = NextResponse.redirect(url, 302);
  res.headers.set("cache-control", "public, max-age=300");
  return res;
}
