"use client";

import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { MfaCodeForm } from "./MfaCodeForm";

/** Показывает форму пароля, а после неё (если включена 2FA) форму кода. */
export function LoginSwitch({ mfaPending, before, after }: { mfaPending: boolean; before: React.ReactNode; after: React.ReactNode }) {
  const [needsMfa, setNeedsMfa] = useState(mfaPending);
  if (needsMfa) return <MfaCodeForm />;
  return (
    <>
      {before}
      <LoginForm onNeedsMfa={() => setNeedsMfa(true)} />
      {after}
    </>
  );
}
