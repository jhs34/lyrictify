import { LrcLibCandidate, LrcLibSongItem, LyricsFetchResult } from '../types/lyrics';
import {
  LyricMatchContext,
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
  signal?: AbortSignal,
  matchContext?: LyricMatchContext
): Promise<LrcLibCandidate[]> {
  const trimmed = queryStr.trim();
  if (!trimmed) return [];
  const raw = await fetchRawLrcLibItems(trimmed, signal);
  return normalizeLrcLibCandidates(raw, matchContext);
}

export async function searchLyricsOnLrcLib(
  title: string,
  artist: string,
  durationMs: number,
  signal?: AbortSignal
): Promise<LyricsFetchResult | null> {
  const { queries } = buildSearchQueries(title, artist);
  const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
  const matchContext: LyricMatchContext = {
    targetTitle: title,
    targetArtist: artist,
    targetDurationSec: durationSec,
  };

  let fallbackPlainResult: LyricsFetchResult | null = null;

  for (const query of queries) {
    if (signal?.aborted) return null;
    const rawItems = await fetchRawLrcLibItems(query, signal);
    if (rawItems.length === 0) continue;

    const normalized = normalizeLrcLibCandidates(rawItems, matchContext);
    const best = selectBestLyricsFromCandidates(rawItems, query, artist, durationSec, title);
    if (best) {
      const result: LyricsFetchResult = {
        type: best.type,
        text: best.text,
        sourceLabel: best.type === 'plain' ? 'LRCLIB (일반 가사)' : 'LRCLIB',
        selectedId: best.selectedId,
        candidates: normalized,
      };
      // Return synced match immediately; hold plain match briefly in case a cleaned query finds synced lyrics
      if (best.type === 'synced') {
        return result;
      }
      if (!fallbackPlainResult) {
        fallbackPlainResult = result;
      }
    }
  }

  return fallbackPlainResult;
}
