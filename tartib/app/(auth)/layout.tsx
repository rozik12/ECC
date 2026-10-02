import { Footer } from "@/components/layout/Footer";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { SetupNotice } from "@/components/auth/SetupNotice";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
        <SetupNotice />
        {children}
      </main>
      <Footer />
    </div>
  );
}
