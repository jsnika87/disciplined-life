// src/components/train/TimerPanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TimerMode = "idle" | "running" | "paused";
type TimerKind = "countdown" | "stopwatch";

type TimerState = {
  mode: TimerMode;
  kind: TimerKind;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  durationMs: number; // countdown target; 0 for stopwatch
  elapsedMs: number; // accumulated elapsed time
};

const LS_KEY = "dl:train:timer:v2";

function nowMs() {
  return Date.now();
}

function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const DEFAULT_STATE: TimerState = {
  mode: "idle",
  kind: "countdown",
  startedAtMs: null,
  pausedAtMs: null,
  durationMs: 10 * 60 * 1000,
  elapsedMs: 0,
};

function loadState(): TimerState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed = JSON.parse(raw) as TimerState;

    // Basic shape validation
    if (
      !parsed ||
      (parsed.mode !== "idle" && parsed.mode !== "running" && parsed.mode !== "paused") ||
      (parsed.kind !== "countdown" && parsed.kind !== "stopwatch")
    ) {
      return DEFAULT_STATE;
    }

    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: TimerState) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export default function TimerPanel() {
  const [state, setState] = useState<TimerState>(DEFAULT_STATE);
  const [, forceTick] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Load from storage on mount
  useEffect(() => {
    setState(loadState());
  }, []);

  // Tick while running
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (state.mode === "running") {
      intervalRef.current = window.setInterval(() => {
        forceTick((t) => t + 1);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.mode]);

  const computed = useMemo(() => {
    const now = nowMs();

    const elapsed =
      state.mode === "running" && state.startedAtMs
        ? state.elapsedMs + (now - state.startedAtMs)
        : state.elapsedMs;

    if (state.kind === "stopwatch") {
      return { label: formatMs(elapsed), done: false };
    }

    const remaining = Math.max(0, state.durationMs - elapsed);
    return {
      label: formatMs(remaining),
      done: remaining === 0 && state.mode !== "idle",
    };
  }, [state]);

  // Auto-finish countdown
  useEffect(() => {
    if (state.kind !== "countdown") return;
    if (!computed.done) return;

    const finished: TimerState = {
      ...state,
      mode: "idle",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
    };

    setState(finished);
    saveState(finished);

    try {
      alert("Timer finished ✅");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed.done]);

  function commit(next: TimerState) {
    setState(next);
    saveState(next);
  }

  function start() {
    if (state.mode === "running") return;
    commit({
      ...state,
      mode: "running",
      startedAtMs: nowMs(),
      pausedAtMs: null,
    });
  }

  function pause() {
    if (state.mode !== "running" || !state.startedAtMs) return;

    const elapsedNow = state.elapsedMs + (nowMs() - state.startedAtMs);

    commit({
      ...state,
      mode: "paused",
      startedAtMs: null,
      pausedAtMs: nowMs(),
      elapsedMs: elapsedNow,
    });
  }

  function reset() {
    commit({
      ...state,
      mode: "idle",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
    });
  }

  function setCountdownMinutes(min: number) {
    commit({
      mode: "idle",
      kind: "countdown",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
      durationMs: Math.max(1, Math.round(min)) * 60 * 1000,
    });
  }

  function setStopwatch() {
    commit({
      mode: "idle",
      kind: "stopwatch",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
      durationMs: 0,
    });
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Timers</div>
        <div className="text-sm opacity-80">
          {state.kind === "countdown" ? "Countdown" : "Stopwatch"}
        </div>
      </div>

      <div className="text-3xl font-semibold tabular-nums">{computed.label}</div>

      <div className="flex gap-2 flex-wrap">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={start}>
          Start
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={pause}>
          Pause
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={reset}>
          Reset
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={() => setCountdownMinutes(5)}>
          5m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={() => setCountdownMinutes(10)}>
          10m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={() => setCountdownMinutes(20)}>
          20m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" onClick={setStopwatch}>
          Stopwatch
        </button>
      </div>

      <div className="text-xs opacity-70">
        iOS may pause timers in the background. State is restored when you return.
      </div>
    </div>
  );
}