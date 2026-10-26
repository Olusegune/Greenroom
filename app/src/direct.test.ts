import { describe, expect, it } from "vitest";
import { composeText, countChars, stripTags, toggleIn, vkInstructions, vkUnsupported } from "./direct";
import { DEFAULT_DIRECTION } from "./types";

const line = (text: string, d: Partial<typeof DEFAULT_DIRECTION> = {}) => ({ text, direction: { ...DEFAULT_DIRECTION, ...d } });

describe("composeText", () => {
  it("puts the emotion and sounds in front of the words", () => {
    expect(composeText(line("Come on, Ada.", { emotion: "excited", sounds: ["laughs", "gasps"] }))).toBe("[excited] [laughs] [gasps] Come on, Ada.");
  });
  it("sends plain text untouched", () => {
    expect(composeText(line("  Hello.  "))).toBe("Hello.");
  });
  it("does not repeat a tag the writer already typed inline", () => {
    expect(composeText(line("[laughs] Oh no.", { sounds: ["laughs"] }))).toBe("[laughs] Oh no.");
  });
  it("counts the characters actually sent", () => {
    expect(countChars([line("ab", { emotion: "sad" }), line("cd")])).toBe("[sad] ab".length + 2);
  });
});

describe("toggleIn", () => {
  it("adds and removes", () => {
    expect(toggleIn([], "a")).toEqual(["a"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("VoiceKiller", () => {
  it("turns delivery and pace into one instruction sentence", () => {
    expect(vkInstructions("whispers", 1)).toBe("Speak in a tone that is whispering softly.");
    expect(vkInstructions("", 1.2)).toBe("Speak faster than normal.");
    expect(vkInstructions("excited", 0.8)).toBe("Speak in a tone that is excited and energetic. Speak slower than normal.");
    expect(vkInstructions("", 1)).toBeUndefined();
  });
  it("strips tags so none is read aloud", () => {
    expect(stripTags("[laughs] Oh   no [sighs] really")).toBe("Oh no really");
  });
  it("reports body sounds it cannot make, from chips or typed inline", () => {
    expect(vkUnsupported(line("[coughs] Sorry.", { sounds: ["laughs"] })).sort()).toEqual(["coughs", "laughs"]);
    expect(vkUnsupported(line("Plain."))).toEqual([]);
  });
});
