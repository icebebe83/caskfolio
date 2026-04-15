import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto max-w-2xl p-8 text-center">
      <p className="text-xs uppercase tracking-[0.24em] text-cask">404</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-6 text-ink/68">
        Use the main navigation to return to a supported route.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell"
      >
        Back to home
      </Link>
    </div>
  );
}
