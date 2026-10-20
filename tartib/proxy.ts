import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

const PRIVATE_PREFIXES = [
  "/dashboard", "/calculator", "/trades", "/rules", "/statistics", "/charts", "/market", "/profile", "/settings", "/notifications", "/onboarding", "/reset-password", "/admin", "/diary", "/trader-types", "/portfolio", "/prop", "/metals", "/support", "/messages",
];
const AUTH_PAGES = ["/login", "/register"];

/** Обновляет сессию и не пускает неавторизованных на приватные страницы. */
export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;
  const isPrivate = PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!signedIn && isPrivate) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && AUTH_PAGES.includes(path) && !request.nextUrl.searchParams.has("mfa")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

// Обработчик нужен только там, где важен вход: закрытые разделы, страницы входа и API. Публичные страницы (главная, блог,
// инструменты, новости, тарифы, условия) он не трогает: так на бесплатном тарифе Cloudflare тратится меньше процессорного времени.
export const config = {
  matcher: [
    "/dashboard/:path*", "/calculator/:path*", "/trades/:path*", "/rules/:path*", "/statistics/:path*", "/charts/:path*",
    "/market/:path*", "/profile/:path*", "/settings/:path*", "/notifications/:path*", "/onboarding/:path*",
    "/reset-password/:path*", "/admin/:path*", "/diary/:path*", "/trader-types/:path*", "/portfolio/:path*", "/prop/:path*", "/metals/:path*", "/support/:path*", "/messages/:path*", "/login", "/register", "/api/:path*",
  ],
};
