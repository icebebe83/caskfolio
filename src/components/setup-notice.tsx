import Link from "next/link";

export function SetupNotice() {
  return (
    <div className="panel p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cask">
        Setup required
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
        Add your Supabase and storage keys to run Caskfolio.
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-ink/70">
        Create `.env.local` from `.env.example`, add Supabase credentials, and configure Supabase
        Storage for bottle and listing images. The full bootstrap flow is documented in the README.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-shell transition hover:bg-ink/90"
      >
        Open login flow
      </Link>
    </div>
  );
}
