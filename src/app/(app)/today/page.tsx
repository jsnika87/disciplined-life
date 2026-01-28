import Link from "next/link";
import DailyCheckinClient from "./DailyCheckinClient";

const tiles = [
  { href: "/train", title: "Train", subtitle: "Workouts & movement", emoji: "🏋️" },
  { href: "/eat", title: "Eat", subtitle: "Meals, macros, fasting", emoji: "🍽️" },
  { href: "/word", title: "Word", subtitle: "Scripture & journaling", emoji: "📖" },
  { href: "/freedom", title: "Freedom", subtitle: "Struggles → passages → response", emoji: "🛡️" },
];

export default function TodayPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm opacity-70">
          Any pillar counts — but the app encourages completing all pillars daily.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="border rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-zinc-900/40">
            <div className="flex items-start gap-3">
              <div className="text-2xl">{t.emoji}</div>
              <div className="min-w-0">
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm opacity-70">{t.subtitle}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <DailyCheckinClient />
    </div>
  );
}