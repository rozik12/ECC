import { NextResponse, type NextRequest } from "next/server";
import { parseRefCode, REF_COOKIE, REF_MAX_AGE } from "@/lib/referral";

/** Ссылка-приглашение: запоминает, кто пригласил (на 30 дней), и ведёт на регистрацию. Неверный код просто игнорируется. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/register", request.url), 302);
  const ref = parseRefCode(code);
  if (ref) res.cookies.set(REF_COOKIE, ref, { maxAge: REF_MAX_AGE, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/" });
  res.headers.set("cache-control", "no-store");
  return res;
}
