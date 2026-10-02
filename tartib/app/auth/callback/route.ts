import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** Сюда приходит пользователь по ссылке из письма с подтверждением почты. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}/dashboard`);
    } catch {
      /* ниже отправим на страницу входа */
    }
  }
  return NextResponse.redirect(`${origin}/login`);
}
