"use client";

import { useEffect } from "react";
import { syncTimezoneOnce } from "@/lib/syncTimezone";

export default function TimezoneSync() {
  useEffect(() => {
    // fire and forget
    syncTimezoneOnce();
  }, []);

  return null;
}