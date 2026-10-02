import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.dashboard") };
}

export default function Page() {
  return <ComingSoon titleKey="pages.dashboard" />;
}
