// Languages offered for voice search and character labels. Eleven v4 lists 90+ languages; this is a practical starting
// set. Nothing here claims a given voice or accent is authentic: that is decided by listening.

export interface Lang {
  code: string;
  name: string;
}

export const LANGUAGES: Lang[] = [
  { code: "en", name: "English" },
  { code: "yo", name: "Yoruba" },
  { code: "ig", name: "Igbo" },
  { code: "ha", name: "Hausa" },
  { code: "sw", name: "Swahili" },
  { code: "zu", name: "Zulu" },
  { code: "af", name: "Afrikaans" },
  { code: "am", name: "Amharic" },
  { code: "ar", name: "Arabic" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "ru", name: "Russian" },
  { code: "uk", name: "Ukrainian" },
  { code: "tr", name: "Turkish" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "bn", name: "Bengali" },
  { code: "ur", name: "Urdu" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "vi", name: "Vietnamese" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "ms", name: "Malay" },
  { code: "fil", name: "Filipino (Tagalog)" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "cs", name: "Czech" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
];

/** Accent labels worth offering as quick filters. Free text is always allowed. */
export const ACCENTS = ["nigerian", "ghanaian", "south african", "kenyan", "american", "british", "irish", "scottish", "australian", "indian", "jamaican", "filipino", "korean", "japanese", "french", "spanish", "arabic"];

/** Labels with no language code of their own. The text is written in that language; the voice does the accent. */
export const MIXED_LANGUAGES = ["Nigerian Pidgin", "Taglish", "Code-switching (mixed)"];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}
