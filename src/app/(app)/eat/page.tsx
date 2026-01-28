// src/app/(app)/eat/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { recomputePillar } from "@/lib/recomputePillar";
import FastingCard from "@/components/eat/FastingCard";

type Food = {
  id: string;
  name: string;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type DraftItem =
  | {
      kind: "saved";
      food_id: string;
      name: string;
      quantity: number;
      unit: string;
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
    }
  | {
      kind: "custom";
      food_id: null;
      name: string;
      quantity: number;
      unit: string;
      calories: number | null;
      protein_g: number | null;
      carbs_g: number | null;
      fat_g: number | null;
    };

type MealRow = {
  id: string;
  meal_type: MealType;
  meal_date: string; // YYYY-MM-DD
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

function todayISODateUTC() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function EatPage() {
  const [error, setError] = useState<string | null>(null);

  // ---- foods list ----
  const [foods, setFoods] = useState<Food[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(true);

  async function loadFoods() {
    setLoadingFoods(true);
    setError(null);

    const { data, error } = await supabase
      .schema("disciplined")
      .from("foods")
      .select("id,name,brand,serving_size,calories,protein_g,carbs_g,fat_g")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
      setFoods([]);
      setLoadingFoods(false);
      return;
    }

    setFoods((data ?? []) as Food[]);
    setLoadingFoods(false);
  }

  // ---- Today meals summary ----
  const [todayMeals, setTodayMeals] = useState<MealRow[]>([]);
  const [todayItems, setTodayItems] = useState<MealItemRow[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);

  async function loadTodayMeals() {
    setLoadingToday(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setError("Not logged in.");
      setLoadingToday(false);
      return;
    }

    const d = todayISODateUTC();

    const mealsRes = await supabase
      .schema("disciplined")
      .from("meals")
      .select("id,meal_type,meal_date")
      .eq("user_id", uid)
      .eq("meal_date", d)
      .order("meal_type", { ascending: true });

    if (mealsRes.error) {
      setError(mealsRes.error.message);
      setTodayMeals([]);
      setTodayItems([]);
      setLoadingToday(false);
      return;
    }

    const meals = (mealsRes.data ?? []) as MealRow[];
    setTodayMeals(meals);

    if (meals.length === 0) {
      setTodayItems([]);
      setLoadingToday(false);
      return;
    }

    const mealIds = meals.map((m) => m.id);

    const itemsRes = await supabase
      .schema("disciplined")
      .from("meal_items")
      .select("id,meal_id,name,quantity,unit,calories,protein_g,carbs_g,fat_g,created_at")
      .in("meal_id", mealIds)
      .order("created_at", { ascending: true });

    if (itemsRes.error) {
      setError(itemsRes.error.message);
      setTodayItems([]);
      setLoadingToday(false);
      return;
    }

    setTodayItems((itemsRes.data ?? []) as MealItemRow[]);
    setLoadingToday(false);
  }

  useEffect(() => {
    loadFoods();
    loadTodayMeals();
  }, []);

  const itemsByMeal = useMemo(() => {
    const map = new Map<string, MealItemRow[]>();
    for (const it of todayItems) {
      const arr = map.get(it.meal_id) ?? [];
      arr.push(it);
      map.set(it.meal_id, arr);
    }
    return map;
  }, [todayItems]);

  const dayTotals = useMemo(() => sumMacroItems(todayItems), [todayItems]);

  // ---- Create food form (reusable) ----
  const [foodName, setFoodName] = useState("");
  const [foodBrand, setFoodBrand] = useState("");
  const [foodServing, setFoodServing] = useState("");
  const [cal, setCal] = useState<string>("");
  const [p, setP] = useState<string>("");
  const [c, setC] = useState<string>("");
  const [f, setF] = useState<string>("");

  async function createFood(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setError("Not logged in.");
      return;
    }

    const ins = await supabase.schema("disciplined").from("foods").insert({
      user_id: uid,
      name: foodName.trim(),
      brand: foodBrand.trim() || null,
      serving_size: foodServing.trim() || null,
      calories: cal ? Number(cal) : null,
      protein_g: p ? Number(p) : null,
      carbs_g: c ? Number(c) : null,
      fat_g: f ? Number(f) : null,
    });

    if (ins.error) {
      setError(ins.error.message);
      return;
    }

    setFoodName("");
    setFoodBrand("");
    setFoodServing("");
    setCal("");
    setP("");
    setC("");
    setF("");
    await loadFoods();
  }

  // ---- Meal builder (multi-item) ----
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [savingMeal, setSavingMeal] = useState(false);

  // add saved item controls
  const [selectedFoodId, setSelectedFoodId] = useState<string>("");
  const [savedQty, setSavedQty] = useState<string>("1");

  const selectedFood = useMemo(
    () => foods.find((x) => x.id === selectedFoodId) ?? null,
    [foods, selectedFoodId]
  );

  // add custom item controls
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("serving");
  const [customQty, setCustomQty] = useState<string>("1");
  const [customCal, setCustomCal] = useState<string>("");
  const [customP, setCustomP] = useState<string>("");
  const [customC, setCustomC] = useState<string>("");
  const [customF, setCustomF] = useState<string>("");

  const mealTotals = useMemo(() => {
    const calories = draftItems.reduce((a, it) => a + n(it.calories) * n(it.quantity), 0);
    const protein = draftItems.reduce((a, it) => a + n(it.protein_g) * n(it.quantity), 0);
    const carbs = draftItems.reduce((a, it) => a + n(it.carbs_g) * n(it.quantity), 0);
    const fat = draftItems.reduce((a, it) => a + n(it.fat_g) * n(it.quantity), 0);
    return { calories, protein, carbs, fat };
  }, [draftItems]);

  function addSavedToMeal() {
    setError(null);
    if (!selectedFood) {
      setError("Pick a saved food first.");
      return;
    }

    const qty = savedQty ? Number(savedQty) : 1;
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a number greater than 0.");
      return;
    }

    const unit = selectedFood.serving_size?.trim() || "serving";

    setDraftItems((prev) => [
      ...prev,
      {
        kind: "saved",
        food_id: selectedFood.id,
        name: selectedFood.name,
        quantity: qty,
        unit,
        calories: selectedFood.calories,
        protein_g: selectedFood.protein_g,
        carbs_g: selectedFood.carbs_g,
        fat_g: selectedFood.fat_g,
      },
    ]);

    setSavedQty("1");
  }

  function addCustomToMeal() {
    setError(null);

    const name = customName.trim();
    if (!name) {
      setError("Custom item needs a name.");
      return;
    }

    const qty = customQty ? Number(customQty) : 1;
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a number greater than 0.");
      return;
    }

    setDraftItems((prev) => [
      ...prev,
      {
        kind: "custom",
        food_id: null,
        name,
        quantity: qty,
        unit: customUnit.trim() || "serving",
        calories: customCal ? Number(customCal) : null,
        protein_g: customP ? Number(customP) : null,
        carbs_g: customC ? Number(customC) : null,
        fat_g: customF ? Number(customF) : null,
      },
    ]);

    setCustomName("");
    setCustomUnit("serving");
    setCustomQty("1");
    setCustomCal("");
    setCustomP("");
    setCustomC("");
    setCustomF("");
  }

  function removeDraftItem(index: number) {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveMeal() {
    setError(null);

    if (draftItems.length === 0) {
      setError("Add at least one item before saving the meal.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setError("Not logged in.");
      return;
    }

    setSavingMeal(true);
    try {
      const mealDate = todayISODateUTC();

      const mealUp = await supabase
        .schema("disciplined")
        .from("meals")
        .upsert({ user_id: uid, meal_date: mealDate, meal_type: mealType }, { onConflict: "user_id,meal_date,meal_type" })
        .select("id")
        .single<{ id: string }>();

      if (mealUp.error) throw mealUp.error;

      const mealId = mealUp.data.id;

      const payload = draftItems.map((it) => ({
        meal_id: mealId,
        food_id: it.food_id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        calories: it.calories,
        protein_g: it.protein_g,
        carbs_g: it.carbs_g,
        fat_g: it.fat_g,
      }));

      const ins = await supabase.schema("disciplined").from("meal_items").insert(payload);
      if (ins.error) throw ins.error;

      setDraftItems([]);

      // ✅ recompute Eat completion based on actual data (and respect manual override)
      await recomputePillar("eat");

      await loadTodayMeals();
      alert("Meal saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save meal.");
    } finally {
      setSavingMeal(false);
    }
  }

  async function deleteMealItem(itemId: string) {
    setError(null);

    // Find the meal_id for this item (we have it in state)
    const item = todayItems.find((x) => x.id === itemId);
    const mealId = item?.meal_id;

    const del = await supabase.schema("disciplined").from("meal_items").delete().eq("id", itemId);
    if (del.error) {
      setError(del.error.message);
      return;
    }

    // If the meal has no items left, delete the meal row too
    if (mealId) {
      const check = await supabase
        .schema("disciplined")
        .from("meal_items")
        .select("id")
        .eq("meal_id", mealId)
        .limit(1);

      if (!check.error && (check.data?.length ?? 0) === 0) {
        await supabase.schema("disciplined").from("meals").delete().eq("id", mealId);
      }
    }

    await loadTodayMeals();

    // ✅ recompute after deletes too (so Eat can auto-uncomplete if needed)
    await recomputePillar("eat");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">Eat</h1>

        <Link
          href="/eat/history"
          className="border rounded-xl px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          History
        </Link>
      </div>

      <FastingCard />

      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Create food */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="font-semibold">Saved foods (reusable)</div>

        <form onSubmit={createFood} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm">Food name</label>
              <input
                className="w-full border rounded px-3 py-2 bg-transparent"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Brand (optional)</label>
              <input
                className="w-full border rounded px-3 py-2 bg-transparent"
                value={foodBrand}
                onChange={(e) => setFoodBrand(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm">Serving size text (optional)</label>
            <input
              className="w-full border rounded px-3 py-2 bg-transparent"
              placeholder='e.g. "1 cup" or "100g"'
              value={foodServing}
              onChange={(e) => setFoodServing(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-sm">Calories</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={cal} onChange={(e) => setCal(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Protein (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={p} onChange={(e) => setP(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Carbs (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Fat (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={f} onChange={(e) => setF(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          <button className="border rounded-lg px-4 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900">
            Save food
          </button>
        </form>

        <div className="pt-2">
          <button className="text-sm underline" onClick={loadFoods} type="button" disabled={loadingFoods}>
            {loadingFoods ? "Refreshing…" : "Refresh foods list"}
          </button>
        </div>
      </div>

      {/* Meal builder */}
      <div className="border rounded-xl p-4 space-y-4">
        <div className="font-semibold">Build a meal (multiple items)</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <label className="text-sm">Meal type</label>
            <select className="w-full border rounded px-3 py-2 bg-transparent" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <div className="sm:col-span-2 border rounded-xl p-3">
            <div className="text-xs opacity-70">Running totals (this meal)</div>
            <div className="text-sm">
              {Math.round(mealTotals.calories)} cal · P {mealTotals.protein.toFixed(1)}g · C {mealTotals.carbs.toFixed(1)}g · F {mealTotals.fat.toFixed(1)}g
            </div>
          </div>
        </div>

        <div className="border rounded-xl p-3 space-y-2">
          <div className="font-medium">Add from saved foods</div>

          {loadingFoods ? (
            <div className="text-sm opacity-70">Loading foods…</div>
          ) : foods.length === 0 ? (
            <div className="text-sm opacity-70">Create a food above first.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm">Food</label>
                <select className="w-full border rounded px-3 py-2 bg-transparent" value={selectedFoodId} onChange={(e) => setSelectedFoodId(e.target.value)}>
                  <option value="">Select a food…</option>
                  {foods.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.brand ? ` (${x.brand})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm">Qty</label>
                <input className="w-full border rounded px-3 py-2 bg-transparent" value={savedQty} onChange={(e) => setSavedQty(e.target.value)} inputMode="decimal" />
              </div>

              <div className="sm:col-span-3 flex items-center justify-between gap-3">
                <div className="text-xs opacity-70">
                  {selectedFood ? (
                    <>
                      Per {selectedFood.serving_size ?? "serving"}: {selectedFood.calories ?? 0} cal · P {selectedFood.protein_g ?? 0}g · C {selectedFood.carbs_g ?? 0}g · F {selectedFood.fat_g ?? 0}g
                    </>
                  ) : (
                    "Pick a food to preview macros."
                  )}
                </div>

                <button type="button" className="border rounded-lg px-4 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={addSavedToMeal}>
                  Add item
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border rounded-xl p-3 space-y-2">
          <div className="font-medium">Add custom item (one-off)</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm">Name</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Restaurant burger" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Unit</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="serving" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-sm">Qty</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customQty} onChange={(e) => setCustomQty(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Calories</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customCal} onChange={(e) => setCustomCal(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Protein (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customP} onChange={(e) => setCustomP(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Carbs (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customC} onChange={(e) => setCustomC(e.target.value)} inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm">Fat (g)</label>
              <input className="w-full border rounded px-3 py-2 bg-transparent" value={customF} onChange={(e) => setCustomF(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          <button type="button" className="border rounded-lg px-4 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={addCustomToMeal}>
            Add custom item
          </button>
        </div>

        <div className="border rounded-xl p-3 space-y-2">
          <div className="font-medium">This meal’s items</div>

          {draftItems.length === 0 ? (
            <div className="text-sm opacity-70">No items yet. Add at least one item above.</div>
          ) : (
            <div className="space-y-2">
              {draftItems.map((it, idx) => (
                <div key={idx} className="border rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {it.name} <span className="text-xs opacity-70">({it.kind})</span>
                    </div>
                    <div className="text-sm opacity-70">
                      Qty: {it.quantity} {it.unit} · {Math.round(n(it.calories) * n(it.quantity))} cal · P {(n(it.protein_g) * n(it.quantity)).toFixed(1)}g · C {(n(it.carbs_g) * n(it.quantity)).toFixed(1)}g · F {(n(it.fat_g) * n(it.quantity)).toFixed(1)}g
                    </div>
                  </div>

                  <button type="button" className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => removeDraftItem(idx)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button type="button" className="border rounded-lg px-4 py-2 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => setDraftItems([])} disabled={draftItems.length === 0 || savingMeal}>
            Clear
          </button>

          <button type="button" className="border rounded-lg px-4 py-2 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={saveMeal} disabled={savingMeal || draftItems.length === 0}>
            {savingMeal ? "Saving…" : "Save meal"}
          </button>
        </div>
      </div>

      {/* Today summary */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Today’s meals</div>
            <div className="text-sm opacity-70">
              Totals: {Math.round(dayTotals.calories)} cal · P {dayTotals.protein.toFixed(1)}g · C {dayTotals.carbs.toFixed(1)}g · F {dayTotals.fat.toFixed(1)}g
            </div>
          </div>

          <button className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={loadTodayMeals} disabled={loadingToday}>
            {loadingToday ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loadingToday ? (
          <div className="text-sm opacity-70">Loading…</div>
        ) : todayMeals.length === 0 ? (
          <div className="text-sm opacity-70">No meals logged today yet.</div>
        ) : (
          <div className="space-y-3">
            {todayMeals.map((m) => {
              const items = itemsByMeal.get(m.id) ?? [];
              const totals = sumMacroItems(items);

              return (
                <div key={m.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium capitalize">{m.meal_type}</div>
                      <div className="text-xs opacity-70">
                        {items.length} item(s) · {Math.round(totals.calories)} cal · P {totals.protein.toFixed(1)}g · C {totals.carbs.toFixed(1)}g · F {totals.fat.toFixed(1)}g
                      </div>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-sm opacity-70">No items.</div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((it) => (
                        <div key={it.id} className="border rounded-xl p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{it.name}</div>
                            <div className="text-sm opacity-70">
                              Qty: {it.quantity} {it.unit ?? ""} · {Math.round(n(it.calories) * n(it.quantity))} cal · P {(n(it.protein_g) * n(it.quantity)).toFixed(1)}g · C {(n(it.carbs_g) * n(it.quantity)).toFixed(1)}g · F {(n(it.fat_g) * n(it.quantity)).toFixed(1)}g
                            </div>
                          </div>

                          <button
                            className="border rounded-lg px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                            type="button"
                            onClick={() => deleteMealItem(it.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs opacity-70">
        Next: Fasting windows (default 16/8 + custom that must sum to 24), then free barcode scanning options (no paid APIs).
      </div>
    </div>
  );
}