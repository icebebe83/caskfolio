"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DemoBanner } from "@/components/demo-banner";
import { useAuth, useLanguage } from "@/components/providers";
import { SetupNotice } from "@/components/setup-notice";
import { isBackendConfigured } from "@/lib/backend/client";
import { registerWithEmail, signInWithEmail, signInWithGoogle } from "@/lib/data/store";

type FieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "email"
    | "password"
    | "confirmPassword"
    | "dateOfBirth"
    | "terms",
    string
  >
>;

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isPending, startTransition] = useTransition();
  const fieldIds = {
    firstName: "auth-first-name",
    lastName: "auth-last-name",
    email: "auth-email",
    password: "auth-password",
    confirmPassword: "auth-confirm-password",
    dateOfBirth: "auth-date-of-birth",
    terms: "auth-terms",
  } as const;

  useEffect(() => {
    if (user) {
      router.replace("/mypage");
    }
  }, [router, user]);

  if (!isBackendConfigured) {
    return (
      <div className="space-y-6">
        <DemoBanner />
        <SetupNotice />
      </div>
    );
  }

  const maxDateOfBirth = new Date().toISOString().slice(0, 10);

  const resetFeedback = () => {
    setError("");
    setMessage("");
    setFieldErrors({});
  };

  const validateRegister = (): FieldErrors => {
    const nextErrors: FieldErrors = {};

    if (!firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password) nextErrors.password = "Password is required.";
    if (!confirmPassword) nextErrors.confirmPassword = "Please confirm your password.";
    if (password && confirmPassword && password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    if (!dateOfBirth) nextErrors.dateOfBirth = "Date of birth is required.";
    if (!agreedToTerms) nextErrors.terms = "You must agree before creating an account.";

    return nextErrors;
  };

  const validateSignIn = (): FieldErrors => {
    const nextErrors: FieldErrors = {};
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password) nextErrors.password = "Password is required.";
    return nextErrors;
  };

  const onSubmit = () => {
    resetFeedback();

    const nextFieldErrors = mode === "signin" ? validateSignIn() : validateRegister();
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    startTransition(async () => {
      try {
        if (mode === "signin") {
          await signInWithEmail(email, password);
          router.replace("/mypage");
        } else {
          const result = await registerWithEmail({
            firstName,
            lastName,
            email,
            password,
            dateOfBirth,
          });
          setMessage(
            result.verificationEmailSent
              ? `Welcome to Caskfolio. Your account was created and a confirmation email was sent to ${
                  result.credential.user.email ?? email
                }.`
              : "Welcome to Caskfolio. Your account was created. Email confirmation could not be sent from this environment, but you can continue using the app now.",
          );
          router.replace("/mypage");
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to continue.");
      }
    });
  };

  const onGoogleSignIn = () => {
    resetFeedback();

    startTransition(async () => {
      try {
        await signInWithGoogle();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Unable to continue with Google.");
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="panel p-6 sm:p-8">
        <p className="eyebrow">{language === "kr" ? "인증" : "Authentication"}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
          {language === "kr"
            ? "수집가를 위한 바틀 시장 가격 추적 로그인"
            : "Sign in for collectors tracking bottle market prices"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          {language === "kr"
            ? "Google로 로그인하거나 계정을 만들어 바틀 시장 데이터를 탐색하고 수집가로서 등록 내역을 추적해보세요."
            : "Sign in with Google or create an account to explore bottle market data and track listings as a collector."}
        </p>

        <div className="mt-6 flex gap-2">
          {[
            { key: "signin", label: language === "kr" ? "로그인" : "Sign in" },
            { key: "register", label: language === "kr" ? "계정 만들기" : "Create account" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key as "signin" | "register")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                mode === item.key
                  ? "bg-[#171717] text-white"
                  : "bg-white text-[#666159] ring-1 ring-[#e2ddd3] hover:bg-[#f3f0ea]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={isPending}
            className="button-secondary flex w-full items-center justify-center gap-3 disabled:opacity-60"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.29h6.44a5.5 5.5 0 0 1-2.39 3.61v2.99h3.87c2.26-2.08 3.57-5.14 3.57-8.62Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.87-2.99c-1.07.72-2.43 1.15-4.07 1.15-3.13 0-5.78-2.12-6.72-4.96H1.28v3.09A11.997 11.997 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.55.37-2.29V6.62H1.28A11.997 11.997 0 0 0 0 12c0 1.93.46 3.76 1.28 5.38l4-3.09Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.76 0 3.33.61 4.57 1.8l3.43-3.43C17.94 1.19 15.24 0 12 0A11.997 11.997 0 0 0 1.28 6.62l4 3.09c.94-2.84 3.59-4.96 6.72-4.96Z"
              />
            </svg>
            <span>{language === "kr" ? "Google로 계속하기" : "Continue with Google"}</span>
          </button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-neutral-400">
            <div className="h-px flex-1 bg-neutral-200" />
            <span>{language === "kr" ? "이메일 로그인" : "Email login"}</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          {mode === "register" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={fieldIds.firstName} className="mb-2 block text-sm font-medium text-ink">
                  {language === "kr" ? "이름" : "First name"}
                </label>
                <input
                  id={fieldIds.firstName}
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="field w-full"
                  placeholder="Darren"
                />
                {fieldErrors.firstName ? (
                  <p className="mt-2 text-xs text-red-600">{fieldErrors.firstName}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor={fieldIds.lastName} className="mb-2 block text-sm font-medium text-ink">
                  {language === "kr" ? "성" : "Last name"}
                </label>
                <input
                  id={fieldIds.lastName}
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="field w-full"
                  placeholder="Kim"
                />
                {fieldErrors.lastName ? (
                  <p className="mt-2 text-xs text-red-600">{fieldErrors.lastName}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor={fieldIds.email} className="mb-2 block text-sm font-medium text-ink">
              {language === "kr" ? "이메일" : "Email"}
            </label>
            <input
              id={fieldIds.email}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field w-full"
              placeholder="collector@caskfolio.com"
              autoComplete="email"
            />
            {fieldErrors.email ? <p className="mt-2 text-xs text-red-600">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label htmlFor={fieldIds.password} className="mb-2 block text-sm font-medium text-ink">
              {language === "kr" ? "비밀번호" : "Password"}
            </label>
            <input
              id={fieldIds.password}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field w-full"
              placeholder={language === "kr" ? "최소 6자 이상" : "At least 6 characters"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            {fieldErrors.password ? (
              <p className="mt-2 text-xs text-red-600">{fieldErrors.password}</p>
            ) : null}
          </div>

          {mode === "register" ? (
            <>
              <div>
                <label htmlFor={fieldIds.confirmPassword} className="mb-2 block text-sm font-medium text-ink">
                  {language === "kr" ? "비밀번호 확인" : "Confirm Password"}
                </label>
                <input
                  id={fieldIds.confirmPassword}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="field w-full"
                  placeholder={language === "kr" ? "비밀번호를 다시 입력하세요" : "Re-enter your password"}
                  autoComplete="new-password"
                />
                {fieldErrors.confirmPassword ? (
                  <p className="mt-2 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor={fieldIds.dateOfBirth} className="mb-2 block text-sm font-medium text-ink">
                  {language === "kr" ? "생년월일" : "Date of Birth"}
                </label>
                <input
                  id={fieldIds.dateOfBirth}
                  type="date"
                  max={maxDateOfBirth}
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  className="field w-full"
                />
                {fieldErrors.dateOfBirth ? (
                  <p className="mt-2 text-xs text-red-600">{fieldErrors.dateOfBirth}</p>
                ) : null}
              </div>
              <label className="flex items-start gap-3 rounded-2xl bg-[#f4f1ea] px-4 py-3 text-sm text-ink/80">
                <input
                  id={fieldIds.terms}
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(event) => setAgreedToTerms(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#d9d3c8] text-[#171717] focus:ring-[#171717]"
                />
                <span>
                  {language === "kr" ? "다음 약관에 동의합니다: " : "I agree to the "}
                  <Link href="/terms-of-service" className="font-medium text-cask underline underline-offset-2">
                    {language === "kr" ? "이용약관" : "Terms of Service"}
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.terms ? <p className="-mt-1 text-xs text-red-600">{fieldErrors.terms}</p> : null}
            </>
          ) : null}

          <button type="submit" disabled={isPending} className="button-primary disabled:opacity-60">
            {isPending
              ? language === "kr"
                ? "처리 중..."
                : "Working..."
              : mode === "signin"
                ? language === "kr"
                  ? "로그인"
                  : "Sign in"
                : language === "kr"
                  ? "계정 만들기"
                  : "Create account"}
          </button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {mode === "register" ? (
            <p className="text-xs leading-5 text-neutral-500">
              {language === "kr"
                ? "이메일 인증 발송 여부는 현재 Supabase Auth 설정에 따라 달라집니다."
                : "Email confirmation depends on your Supabase Auth settings for this project."}
            </p>
          ) : null}
        </form>

        <div className="mt-8 rounded-2xl bg-[#f4f1ea] p-5 text-sm text-ink/68">
          {language === "kr"
            ? "공유할 바틀 가격이 있나요? 등록 페이지로 이동하세요. "
            : "Have a bottle price to share? Submit a listing. Continue to "}
          <Link href="/submit" className="font-medium text-cask">
            {language === "kr" ? "등록 페이지" : "Submit Listing"}
          </Link>
          .
        </div>
      </section>
    </div>
  );
}
