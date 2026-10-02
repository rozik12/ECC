import type { Metadata } from "next";
import { Disclaimer } from "@/components/layout/Disclaimer";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("legal.privacyTitle") };
}

const SECTIONS = Array.from({ length: 6 }, (_, i) => `s${i + 1}`);

export default async function Page() {
  const { t } = await getTranslator();
  return (
    <article className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold">{t("legal.privacyTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("legal.updated")}</p>
      <div className="mt-8 space-y-6">
        {SECTIONS.map((s, i) => (
          <section key={s}>
            <h2 className="text-lg font-semibold">{i + 1}. {t("legal.privacy." + s + ".title")}</h2>
            <p className="mt-2 leading-relaxed text-muted">{t("legal.privacy." + s + ".text")}</p>
          </section>
        ))}
      </div>
      <Disclaimer className="mt-10 border-t border-border pt-6" />
    </article>
  );
}
