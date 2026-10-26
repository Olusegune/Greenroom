import { api, toUrl } from "./api";
import { useApp } from "./ctx";
import { stripTags } from "./direct";
import type { VoiceEntry } from "./types";

export const SAMPLE_LINE = "Good morning. This is how I sound.";

/** Hear a voice. A provider-hosted preview is free; anything else asks first, because it uses credits. */
export function useSample() {
  const { confirmSpend, toast } = useApp();
  return async (v: VoiceEntry, text = SAMPLE_LINE): Promise<string> => {
    try {
      if (v.previewUrl && text === SAMPLE_LINE) return toUrl(await api.previewFetch(v.previewUrl));
      const ok = await confirmSpend({ title: "Hear this voice?", lines: [`${text.length} characters, spoken by ${v.name}`], skipKey: "sample" });
      if (!ok) throw new Error("cancelled");
      const out = await api.runClip({
        provider: v.provider === "voicekiller" ? (v.vkClone ? "voicekiller-clone" : "voicekiller") : "eleven-v4",
        text: v.provider === "voicekiller" ? stripTags(text) : text,
        voice: v.id,
      });
      return toUrl(out);
    } catch (e) {
      if ((e as Error).message !== "cancelled") toast((e as Error).message, true);
      throw e;
    }
  };
}

export function voiceLine(v: Pick<VoiceEntry, "language" | "accent" | "gender">): string {
  return [v.language, v.accent, v.gender].filter((x) => x && x !== "Not stated").join(" · ");
}
