// src/app/(app)/eat/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import HistoryShell from "@/components/history/HistoryShell";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type MealRow = {
  id: string;
  meal_type: MealType;
  meal_date: string; // YYYY-MM-DD
  created_at?: string;
};

type MealItemRow = {
  id: string;
  meal_id: string;
  name: string;
  quantity: number;
  unit: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
};

function n(v: number | null | undefined) {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

function sumMacroItems(
  items: { quantity: number; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }[]
) {
  const calories = items.reduce((a, it) => a + n(it.calories) * n(it.quantity), 0);
  const protein = items.reduce((a, it) => a + n(it.protein_g) * n(it.quantity), 0);
  const carbs = items.reduce((a, it) => a + n(it.carbs_g) * n(it.quantity), 0);
  const fat = items.reduce((a, it) => a + n(it.fat_g) * n(it.quantity), 0);
  return { calories, protein, carbs, fat };
}

export default function EatHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meals, setMeals] = useState<MealRow[]>([]);
  const [items, setItems] = useState<MealItemRow[]>([]);

  async function load() {
    setLoading(true);
    setBusy(true);
    setError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not logged in.");

      const mealsRes = await supabase
        .schema("disciplined")
        .from("meals")
        .select("id,meal_type,meal_date,created_at")
        .eq("user_id", uid)
        .order("meal_date", { ascending: false })
        .order("meal_type", { ascending: true });

      if (mealsRes.error) throw mealsRes.error;

      const m = (mealsRes.data ?? []) as MealRow[];
      setMeals(m);

      if (m.length === 0) {
        setItems([]);
        return;
      }

      const mealIds = m.map((x) => x.id);

      const itemsRes = await supabase
        .schema("disciplined")
        .from("meal_items")
        .select("id,meal_id,name,quantity,unit,calories,protein_g,carbs_g,fat_g,created_at")
        .in("meal_id", mealIds)
        .order("created_at", { ascending: true });

      if (itemsRes.error) throw itemsRes.error;

      setItems((itemsRes.data ?? []) as MealItemRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load Eat history.");
      setMeals([]);
      setItems([]);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const itemsByMeal = useMemo(() => {
    const map = new Map<string, MealItemRow[]>();
    for (const it of items) {
      const arr = map.get(it.meal_id) ?? [];
      arr.push(it);
      map.set(it.meal_id, arr);
    }
    return map;
  }, [items]);

  const mealsByDate = useMemo(() => {
    const map = new Map<string, MealRow[]>();
    for (const m of meals) {
      const arr = map.get(m.meal_date) ?? [];
      arr.push(m);
      map.set(m.meal_date, arr);
    }
    return map;
  }, [meals]);

  const dates = useMemo(() => Array.from(mealsByDate.keys()), [mealsByDate]);

  return (
    <HistoryShell title="Eat history">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm opacity-70">Meals you’ve logged (most recent first).</div>

        <div className="flex gap-2">
          <Link
            href="/eat"
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Back
          </Link>

          <button
            className="border rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
            onClick={load}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : dates.length === 0 ? (
        <div className="border rounded-2xl p-6 text-sm opacity-70">No meals logged yet.</div>
      ) : (
        <div className="space-y-6">
          {dates.map((d) => {
            const dayMeals = mealsByDate.get(d) ?? [];
            const dayItems = dayMeals.flatMap((m) => itemsByMeal.get(m.id) ?? []);
            const totals = sumMacroItems(dayItems);

            return (
              <div key={d} className="border rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{d}</div>
                    <div className="text-sm opacity-70">
                      Totals: {Math.round(totals.calories)} cal · P {totals.protein.toFixed(1)}g · C{" "}
                      {totals.carbs.toFixed(1)}g · F {totals.fat.toFixed(1)}g
                    </div>
                  </div>
                  <div className="text-sm opacity-70">{dayMeals.length} meal(s)</div>
                </div>

                <div className="space-y-3">
                  {dayMeals.map((m) => {
                    const mealItems = itemsByMeal.get(m.id) ?? [];
                    const mealTotals = sumMacroItems(mealItems);

                    return (
                      <div key={m.id} className="border rounded-xl p-4 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium capitalize">{m.meal_type}</div>
                            <div className="text-xs opacity-70">
                              {mealItems.length} item(s) · {Math.round(mealTotals.calories)} cal · P{" "}
                              {mealTotals.protein.toFixed(1)}g · C {mealTotals.carbs.toFixed(1)}g · F{" "}
                              {mealTotals.fat.toFixed(1)}g
                            </div>
                          </div>
                        </div>

                        {mealItems.length === 0 ? (
                          <div className="text-sm opacity-70">No items.</div>
                        ) : (
                          <div className="space-y-2">
                            {mealItems.map((it) => (
                              <div key={it.id} className="border rounded-xl p-3">
                                <div className="font-medium">{it.name}</div>
                                <div className="text-sm opacity-70">
                                  Qty: {it.quantity} {it.unit ?? ""} ·{" "}
                                  {Math.round(n(it.calories) * n(it.quantity))} cal · P{" "}
                                  {(n(it.protein_g) * n(it.quantity)).toFixed(1)}g · C{" "}
                                  {(n(it.carbs_g) * n(it.quantity)).toFixed(1)}g · F{" "}
                                  {(n(it.fat_g) * n(it.quantity)).toFixed(1)}g
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </HistoryShell>
  );
}