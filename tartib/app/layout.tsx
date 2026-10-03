import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/lib/i18n/provider";
import { getLocale } from "@/lib/i18n/server";
import { RegisterServiceWorker } from "@/components/layout/RegisterServiceWorker";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#0f766e" };

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { title, description } = dictionaries[locale].seo;
  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: "%s · Tartib" },
    description,
    openGraph: { title, description, type: "website", siteName: "Tartib" },
    twitter: { card: "summary", title, description },
    icons: { icon: "/pwa/icon-192", apple: "/pwa/icon-192" },
    appleWebApp: { capable: true, title: "Tartib", statusBarStyle: "default" },
  };
}

/** Ставит тёмную тему до отрисовки страницы, чтобы не было «вспышки». */
const themeScript = `try{var t=localStorage.getItem("tartib_theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider locale={locale} dictionary={dictionaries[locale]}>
          {children}
        </I18nProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
