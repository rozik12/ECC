import { Badge, type BadgeTone } from "@/components/ui";
import type { EmotionKey } from "@/lib/trading";

const tones: Record<EmotionKey, BadgeTone> = {
  calm: "success", confident: "success", fear: "warning", uncertain: "warning",
  greed: "danger", fomo: "danger", revenge: "danger", other: "neutral",
};

export function EmotionBadge({ emotion, label }: { emotion: EmotionKey; label: string }) {
  return <Badge tone={tones[emotion]}>{label}</Badge>;
}
