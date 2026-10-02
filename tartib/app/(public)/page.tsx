import Link from "next/link";
import { ListChecks, ShieldCheck, Wallet } from "lucide-react";
import { PricingCards } from "@/components/landing/PricingCards";
import { buttonStyles, Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

export default async function LandingPage() {
  const { t } = await getTranslator();

  const pillars = [
    { key: "risk", icon: ShieldCheck },
    { key: "discipline", icon: ListChecks },
    { key: "cost", icon: Wallet },
  ] as const;

  const steps = ["step1", "step2", "step3", "step4"] as const;

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-24">
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          {t("landing.hero.title")}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted">
          {t("landing.hero.subtitle")}
        </p>
        <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link href="/register" className={buttonStyles({ size: "lg" })}>
            {t("landing.hero.start")}
          </Link>
          <a href="#demo" className={buttonStyles({ variant: "secondary", size: "lg" })}>
            {t("landing.hero.demo")}
          </a>
        </div>
      </section>

      {/* Преимущества */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-balance text-center text-2xl font-bold sm:text-3xl">
          {t("landing.pillars.title")}
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {pillars.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{t(`landing.pillars.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{t(`landing.pillars.${key}.text`)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Цена дисциплины — демонстрация */}
      <section id="demo" className="scroll-mt-20 border-y border-border bg-surface">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">{t("landing.demo.title")}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-sm text-muted">{t("landing.demo.followed")}</p>
              <p className="mt-2 text-3xl font-bold text-success">+$184</p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-sm text-muted">{t("landing.demo.violated")}</p>
              <p className="mt-2 text-3xl font-bold text-danger">−$127</p>
            </div>
            <div className="rounded-2xl border border-danger/40 bg-danger-soft p-5">
              <p className="text-sm text-muted">{t("landing.demo.cost")}</p>
              <p className="mt-2 text-3xl font-bold text-danger">$127</p>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-xl text-balance text-center text-lg">{t("landing.demo.text")}</p>
          <p className="mt-3 text-center text-xs text-muted">{t("landing.demo.note")}</p>
        </div>
      </section>

      {/* Как это работает */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">{t("landing.how.title")}</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s}>
              <Card className="h-full">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white dark:text-[#0f1419]">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{t(`landing.how.${s}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t(`landing.how.${s}.text`)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Тарифы */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">{t("landing.pricing.title")}</h2>
        <p className="mt-3 text-center text-muted">{t("landing.pricing.subtitle")}</p>
        <div className="mt-10">
          <PricingCards />
        </div>
      </section>

      {/* Финальный призыв */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
        <h2 className="text-balance text-2xl font-bold sm:text-3xl">{t("landing.cta.title")}</h2>
        <p className="mt-3 text-muted">{t("landing.cta.text")}</p>
        <Link href="/register" className={buttonStyles({ size: "lg", className: "mt-8" })}>
          {t("landing.hero.start")}
        </Link>
      </section>
    </>
  );
}
