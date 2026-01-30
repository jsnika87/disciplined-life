// src/app/debug/page.tsx
import DebugClient from "./DebugClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DebugPage() {
  return <DebugClient />;
}