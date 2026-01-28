export type FastingSettings = {
  eating_start: string; // "HH:MM:SS" from Postgres time (or "HH:MM")
  eating_hours: number; // 1..23
};

export type FastingStatus = {
  mode: "eating" | "fasting";
  nextSwitchAt: Date;
  minutesUntilSwitch: number;
  eatingStartToday: Date;
  eatingEndToday: Date;
};

function parseTimeToTodayLocal(timeStr: string, base: Date = new Date()): Date {
  // accepts "HH:MM" or "HH:MM:SS"
  const [hh, mm, ss] = timeStr.split(":").map((x) => Number(x));
  const d = new Date(base);
  d.setHours(hh || 0, mm || 0, ss || 0, 0);
  return d;
}

export function computeFastingStatus(settings: FastingSettings, now: Date = new Date()): FastingStatus {
  const eatingStartToday = parseTimeToTodayLocal(settings.eating_start, now);

  const eatingEndToday = new Date(eatingStartToday);
  eatingEndToday.setHours(eatingEndToday.getHours() + settings.eating_hours);

  // handle window that crosses midnight
  let inEatingWindow = false;

  if (eatingEndToday >= eatingStartToday) {
    // normal same-day window OR past midnight window represented by Date overflow (JS handles it)
    inEatingWindow = now >= eatingStartToday && now < eatingEndToday;
  }

  // Determine next switch
  let nextSwitchAt: Date;

  if (inEatingWindow) {
    nextSwitchAt = eatingEndToday;
  } else {
    // If we're before today's start, next switch is today's start.
    // If we're after today's end, next switch is tomorrow's start.
    if (now < eatingStartToday) {
      nextSwitchAt = eatingStartToday;
    } else {
      const tomorrowStart = new Date(eatingStartToday);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      nextSwitchAt = tomorrowStart;
    }
  }

  const minutesUntilSwitch = Math.max(0, Math.round((nextSwitchAt.getTime() - now.getTime()) / 60000));

  return {
    mode: inEatingWindow ? "eating" : "fasting",
    nextSwitchAt,
    minutesUntilSwitch,
    eatingStartToday,
    eatingEndToday,
  };
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}