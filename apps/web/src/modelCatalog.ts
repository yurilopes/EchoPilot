import type { AsrModelRow } from "./types";

const rank = {
  speed: { "ultra-fast": 6, "very-fast": 5, fast: 4, "medium-fast": 3, medium: 2, slow: 1, unknown: 0 },
  quality: { "very-high": 5, high: 4, "good-plus": 3, good: 2, basic: 1, unknown: 0 },
  live: { excellent: 4, "very-good": 3, good: 2, fair: 1, unknown: 0 },
  size: { "very-light": 1, light: 2, medium: 3, heavy: 4, "very-heavy": 5, unknown: 6 },
} as const;

export type SortBy = "name" | "downloads" | "speed" | "quality" | "live" | "size" | "installed";
export type SortDir = "asc" | "desc";

function scoreModel(model: AsrModelRow, sortBy: SortBy): number {
  if (sortBy === "downloads") return model.downloads ?? 0;
  if (sortBy === "installed") return model.installed ? 1 : 0;
  if (sortBy === "speed") return rank.speed[(model.profile.speed as keyof typeof rank.speed) ?? "unknown"] ?? 0;
  if (sortBy === "quality") return rank.quality[(model.profile.quality as keyof typeof rank.quality) ?? "unknown"] ?? 0;
  if (sortBy === "live") return rank.live[(model.profile.live_suitability as keyof typeof rank.live) ?? "unknown"] ?? 0;
  if (sortBy === "size") return rank.size[(model.profile.footprint as keyof typeof rank.size) ?? "unknown"] ?? 0;
  return 0;
}

export function filterAndSortModels(models: AsrModelRow[], filterText: string, sortBy: SortBy, sortDir: SortDir): AsrModelRow[] {
  const filtered = !filterText.trim()
    ? models
    : models.filter((model) => model.id.toLowerCase().includes(filterText.toLowerCase()));

  return [...filtered].sort((a, b) => {
    if (sortBy === "name") {
      return sortDir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    }

    const av = scoreModel(a, sortBy);
    const bv = scoreModel(b, sortBy);
    return sortDir === "asc" ? av - bv : bv - av;
  });
}
