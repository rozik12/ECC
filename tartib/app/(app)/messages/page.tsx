import type { Metadata } from "next";
import { Messenger } from "@/components/messenger/Messenger";
import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/lib/i18n/server";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("chat.title"), robots: { index: false, follow: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { t } = await getTranslator();
  const { user, profile } = await requireUser();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("chat.title")}</h1>
        <p className="mt-1 hidden text-muted sm:block">{t("chat.subtitle")}</p>
      </div>
      <Messenger me={{ id: user.id, handle: profile?.handle ?? null, timeZone: safeTimeZone(profile?.timezone), banned: !!profile?.chat_banned }} initialChat={sp.c && UUID.test(sp.c) ? sp.c : null} />
      <p className="text-xs text-muted">{t("chat.rules")}</p>
    </div>
  );
}
