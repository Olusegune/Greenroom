import { api, toUrl } from "./api";
import { useApp } from "./ctx";
import { stripTags } from "./direct";
import { ENGINES, providerFor } from "./engines";
import type { VoiceEntry } from "./types";

export const SAMPLE_LINE = "Good morning. This is how I sound.";

/** Hear a voice. A provider-hosted preview and any offline engine are free; anything else asks first, because it uses credits. */
export function useSample() {
  const { confirmSpend, toast, engines } = useApp();
  return async (v: VoiceEntry, text = SAMPLE_LINE): Promise<string> => {
    try {
      if (v.previewUrl && text === SAMPLE_LINE) return toUrl(await api.previewFetch(v.previewUrl));
      const e = ENGINES[v.provider];
      if (!e.local) {
        const ok = await confirmSpend({ title: "Hear this voice?", lines: [`${text.length} characters, spoken by ${v.name}`], skipKey: "sample" });
        if (!ok) throw new Error("cancelled");
      }
      const out = await api.runClip({ provider: providerFor(v.provider, engines.elevenModel, v.vkClone), text: e.tags ? text : stripTags(text), voice: v.id });
      return toUrl(out);
    } catch (err) {
      if ((err as Error).message !== "cancelled") toast((err as Error).message, true);
      throw err;
    }
  };
}

export function voiceLine(v: Pick<VoiceEntry, "language" | "accent" | "gender">): string {
  return [v.language, v.accent, v.gender].filter((x) => x && x !== "Not stated").join(" · ");
}
