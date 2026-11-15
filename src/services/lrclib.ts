import { LrcLibCandidate, LrcLibSongItem, LyricsFetchResult } from '../types/lyrics';
import {
  buildSearchQueries,
  normalizeLrcLibCandidates,
  selectBestLyricsFromCandidates,
} from '../utils/lyrics';

async function fetchRawLrcLibItems(queryStr: string, signal?: AbortSignal): Promise<LrcLibSongItem[]> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(queryStr)}`, {
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as LrcLibSongItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchLrcLibCandidates(
  queryStr: string,
  signal?: AbortSignal
): Promise<LrcLibCandidate[]> {
  const trimmed = queryStr.trim();
  if (!trimmed) return [];
  const raw = await fetchRawLrcLibItems(trimmed, signal);
  return normalizeLrcLibCandidates(raw);
}

export async function searchLyricsOnLrcLib(
  title: string,
  artist: string,
  durationMs: number,
  signal?: AbortSignal
): Promise<LyricsFetchResult | null> {
  const { firstArtist, queries } = buildSearchQueries(title, artist);
  const durationSec = durationMs ? Math.round(durationMs / 1000) : 0;

  let collectedCandidates: LrcLibCandidate[] = [];

  for (const query of queries) {
    if (signal?.aborted) return null;
    const rawItems = await fetchRawLrcLibItems(query, signal);
    if (rawItems.length === 0) continue;

    const normalized = normalizeLrcLibCandidates(rawItems);
    if (collectedCandidates.length === 0 && normalized.length > 0) {
      collectedCandidates = normalized;
    }

    const best = selectBestLyricsFromCandidates(rawItems, query, firstArtist, durationSec);
    if (best) {
      return {
        type: best.type,
        text: best.text,
        sourceLabel: best.type === 'plain' ? 'LRCLIB (일반 가사)' : 'LRCLIB',
        selectedId: best.selectedId,
        candidates: normalized,
      };
    }
  }

  if (collectedCandidates.length > 0) {
    // Even if strict artist/duration filter didn't auto-pick, return null or allow manual pick via fetchLrcLibCandidates
    return null;
  }

  return null;
}
