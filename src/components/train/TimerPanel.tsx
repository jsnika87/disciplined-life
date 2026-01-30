"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TimerMode = "idle" | "running" | "paused";
type TimerKind = "countdown" | "stopwatch";

export type TimerState = {
  kind: TimerKind;
  mode: TimerMode;
  durationMs: number; // for countdown
  startedAtMs: number | null;
  pausedAtMs: number | null;
  elapsedMs: number; // cached for display
};

type SessionPick = { id: string; label: string };

const LS_STATE = "dl:trainTimerState:v1";
const LS_ATTACH = "dl:trainTimerAttachSessionId:v1";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(1, "0")}:${String(s).padStart(2, "0")}`;
}

function nowMs() {
  return Date.now();
}

function makeDefault(): TimerState {
  return {
    kind: "countdown",
    mode: "idle",
    durationMs: 10 * 60 * 1000,
    startedAtMs: null,
    pausedAtMs: null,
    elapsedMs: 0,
  };
}

export default function TimerPanel(props: {
  sessions?: SessionPick[];
  onApplyDurationSec?: (sessionId: string, durationSec: number) => Promise<void> | void;
}) {
  const sessions = props.sessions ?? [];
  const onApply = props.onApplyDurationSec;

  const [state, setState] = useState<TimerState>(() => makeDefault());
  const [attachedSessionId, setAttachedSessionId] = useState<string>("");

  const tickRef = useRef<number | null>(null);

  // restore state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TimerState>;
        setState((prev) => ({
          ...prev,
          kind: parsed.kind ?? prev.kind,
          mode: parsed.mode ?? prev.mode,
          durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : prev.durationMs,
          startedAtMs: typeof parsed.startedAtMs === "number" ? parsed.startedAtMs : null,
          pausedAtMs: typeof parsed.pausedAtMs === "number" ? parsed.pausedAtMs : null,
          elapsedMs: typeof parsed.elapsedMs === "number" ? parsed.elapsedMs : 0,
        }));
      }

      const a = localStorage.getItem(LS_ATTACH);
      if (a) setAttachedSessionId(a);
    } catch {
      // ignore
    }
  }, []);

  // persist state
  useEffect(() => {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  useEffect(() => {
    try {
      if (attachedSessionId) localStorage.setItem(LS_ATTACH, attachedSessionId);
      else localStorage.removeItem(LS_ATTACH);
    } catch {
      // ignore
    }
  }, [attachedSessionId]);

  function computeElapsedMs(s: TimerState): number {
    if (s.mode === "idle") return 0;

    if (s.kind === "stopwatch") {
      if (!s.startedAtMs) return s.elapsedMs ?? 0;

      if (s.mode === "paused") {
        // pausedAtMs marks pause moment; elapsedMs already cached
        return s.elapsedMs ?? 0;
      }

      return clamp((nowMs() - s.startedAtMs) + (s.elapsedMs ?? 0), 0, 1000 * 60 * 60 * 24);
    }

    // countdown
    if (!s.startedAtMs) return s.durationMs;

    if (s.mode === "paused") {
      const remaining = s.durationMs - (s.elapsedMs ?? 0);
      return clamp(remaining, 0, s.durationMs);
    }

    const runElapsed = nowMs() - s.startedAtMs;
    const remaining = s.durationMs - (runElapsed + (s.elapsedMs ?? 0));
    return clamp(remaining, 0, s.durationMs);
  }

  // tick loop
  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      setState((prev) => {
        if (prev.mode !== "running") return prev;
        const valueMs = computeElapsedMs(prev);

        // auto-stop countdown at 0
        if (prev.kind === "countdown" && valueMs <= 0) {
          return {
            ...prev,
            mode: "idle",
            startedAtMs: null,
            pausedAtMs: null,
            elapsedMs: prev.elapsedMs ?? 0,
          };
        }

        return { ...prev };
      });
    }, 250);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayMs = useMemo(() => computeElapsedMs(state), [state]);

  function start() {
    setState((prev) => {
      if (prev.mode === "running") return prev;

      if (prev.kind === "stopwatch") {
        return {
          ...prev,
          mode: "running",
          startedAtMs: nowMs(),
          pausedAtMs: null,
        };
      }

      // countdown
      return {
        ...prev,
        mode: "running",
        startedAtMs: nowMs(),
        pausedAtMs: null,
      };
    });
  }

  function pause() {
    setState((prev) => {
      if (prev.mode !== "running") return prev;

      if (prev.kind === "stopwatch") {
        const runElapsed = prev.startedAtMs ? (nowMs() - prev.startedAtMs) : 0;
        return {
          ...prev,
          mode: "paused",
          pausedAtMs: nowMs(),
          startedAtMs: null,
          elapsedMs: (prev.elapsedMs ?? 0) + runElapsed,
        };
      }

      // countdown: cache elapsed for later
      const runElapsed = prev.startedAtMs ? (nowMs() - prev.startedAtMs) : 0;
      return {
        ...prev,
        mode: "paused",
        pausedAtMs: nowMs(),
        startedAtMs: null,
        elapsedMs: (prev.elapsedMs ?? 0) + runElapsed,
      };
    });
  }

  function reset() {
    setState((prev) => ({
      ...prev,
      mode: "idle",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
    }));
  }

  function setCountdownMinutes(min: number) {
    const ms = clamp(Math.round(min * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
    setState((prev) => ({
      ...prev,
      kind: "countdown",
      mode: "idle",
      durationMs: ms,
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
    }));
  }

  function setStopwatch() {
    setState((prev) => ({
      ...prev,
      kind: "stopwatch",
      mode: "idle",
      startedAtMs: null,
      pausedAtMs: null,
      elapsedMs: 0,
    }));
  }

  async function applyDurationToSession() {
    if (!onApply) return;
    if (!attachedSessionId) return;

    // for countdown, "duration" is configured duration - remaining
    // for stopwatch, "duration" is elapsed
    const sec =
      state.kind === "stopwatch"
        ? Math.max(0, Math.round(displayMs / 1000))
        : Math.max(0, Math.round((state.durationMs - displayMs) / 1000));

    if (sec <= 0) return;

    await onApply(attachedSessionId, sec);
  }

  return (
    <section className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Timers</div>
        <div className="text-sm opacity-70">{state.kind === "stopwatch" ? "Stopwatch" : "Countdown"}</div>
      </div>

      {sessions.length > 0 ? (
        <label className="block space-y-1">
          <div className="text-xs opacity-70">Attach timer to session (optional)</div>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm bg-background"
            value={attachedSessionId}
            onChange={(e) => setAttachedSessionId(e.target.value)}
          >
            <option value="">— Not attached —</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="text-5xl font-semibold tabular-nums">{fmt(displayMs)}</div>

      <div className="flex gap-2 flex-wrap">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={start}>
          Start
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={pause}>
          Pause
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={reset}>
          Reset
        </button>

        {onApply ? (
          <button
            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            type="button"
            onClick={applyDurationToSession}
            disabled={!attachedSessionId}
            title={!attachedSessionId ? "Choose a session to attach first" : "Apply the timer duration to the attached session"}
          >
            Apply to session
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => setCountdownMinutes(5)}>
          5m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => setCountdownMinutes(10)}>
          10m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={() => setCountdownMinutes(20)}>
          20m
        </button>
        <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="button" onClick={setStopwatch}>
          Stopwatch
        </button>
      </div>

      <div className="text-xs opacity-70">iOS may pause timers in the background. State is restored when you return.</div>
    </section>
  );
}