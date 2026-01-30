// src/app/(app)/train/page.tsx
import TrainV2Client from "./TrainV2Client";

export const dynamic = "force-dynamic";

export default function TrainPage() {
  return <TrainV2Client />;
}