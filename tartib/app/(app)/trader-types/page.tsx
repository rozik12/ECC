import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { TRADER_GROUPS } from "@/lib/trader-types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("tradertypes.title") };
}

/** Виды трейдеров по группам. Страница только для зарегистрированных пользователей. */
export default async function TraderTypesPage() {
  const { t } = await getTranslator();
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("tradertypes.title")}</h1>
        <p className="mt-2 max-w-3xl text-muted">{t("tradertypes.subtitle")}</p>
        <nav aria-label={t("tradertypes.title")} className="mt-4 flex flex-wrap gap-2">
          {TRADER_GROUPS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground">{t(`tradertypes.groups.${g.id}.title`)}</a>
          ))}
        </nav>
      </div>

      {TRADER_GROUPS.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`h-${g.id}`} className="scroll-mt-24 space-y-3">
          <div>
            <h2 id={`h-${g.id}`} className="text-xl font-semibold">{t(`tradertypes.groups.${g.id}.title`)} <span className="text-sm font-normal text-muted">· {t("tradertypes.count", { n: g.types.length })}</span></h2>
            <p className="text-sm text-muted">{t(`tradertypes.groups.${g.id}.desc`)}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.types.map((id) => (
              <li key={id} id={id} className="scroll-mt-24">
                <Card className="h-full space-y-1.5 p-4 sm:p-5">
                  <h3 className="font-semibold">{t(`tradertypes.types.${id}.name`)}</h3>
                  <p className="text-sm leading-relaxed text-muted">{t(`tradertypes.types.${id}.text`)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs leading-relaxed text-muted">{t("tradertypes.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
