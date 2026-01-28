"use client";

import { useEffect } from "react";
import { syncTimezoneIfNeeded } from "@/lib/syncTimezone";

export default function TimezoneSync() {
  useEffect(() => {
    syncTimezoneIfNeeded();
  }, []);

  return null;
}