"use client";

export default function HistoryShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{title} history</h1>
        <div className="text-sm opacity-70 mt-1">
          Review your past entries
        </div>
      </div>

      {children}
    </div>
  );
}