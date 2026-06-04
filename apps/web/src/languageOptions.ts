import type { RuntimeSettings } from "./types";

export type LanguageOption = {
  value: string;
  label: string;
};

export const ANALYSIS_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

export const WHISPER_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
  { value: "sv", label: "Swedish" },
  { value: "uk", label: "Ukrainian" },
  { value: "vi", label: "Vietnamese" },
];

export const ENGLISH_ONLY_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
];

export function transcriptionLanguageOptions(settings: RuntimeSettings): LanguageOption[] {
  if (settings.asr_engine === "whisper" && !isEnglishOnlyWhisper(settings.model_id)) {
    return WHISPER_LANGUAGE_OPTIONS;
  }
  return ENGLISH_ONLY_LANGUAGE_OPTIONS;
}

export function normalizeTranscriptionLanguage(settings: RuntimeSettings): string {
  const options = transcriptionLanguageOptions(settings);
  return options.some((option) => option.value === settings.language) ? settings.language : options[0].value;
}

export function normalizeAnalysisLanguage(value: string): string {
  return ANALYSIS_LANGUAGE_OPTIONS.some((option) => option.value === value) ? value : "en";
}

function isEnglishOnlyWhisper(modelId: string): boolean {
  const tail = modelId.toLowerCase().split("/").pop() ?? "";
  return tail.endsWith(".en") || tail.includes("-en-") || tail.endsWith("-en");
}
