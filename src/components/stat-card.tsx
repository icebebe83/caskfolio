interface StatCardProps {
  label: string;
  value: string;
  note: string;
}

export function StatCard({ label, value, note }: StatCardProps) {
  return (
    <div className="panel subtle-grid p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-ink/55">{label}</p>
      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">
        {value}
      </p>
      <p className="mt-2 text-sm text-ink/65">{note}</p>
    </div>
  );
}

