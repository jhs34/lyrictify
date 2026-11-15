import { LrcLibSongItem, LyricsFetchResult } from '../types/lyrics';
import { buildSearchQueries, selectBestLyricsFromCandidates } from '../utils/lyrics';

async function searchLrcLibSingleQuery(
  queryStr: string,
  targetArtist: string,
  targetDurationSec: number,
  signal?: AbortSignal
): Promise<{ type: 'synced' | 'plain'; text: string } | null> {
  try {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(queryStr)}`, {
      signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as LrcLibSongItem[];
    return selectBestLyricsFromCandidates(data, queryStr, targetArtist, targetDurationSec);
  } catch {
    return null;
  }
}

export async function searchLyricsOnLrcLib(
  title: string,
  artist: string,
  durationMs: number,
  signal?: AbortSignal
): Promise<LyricsFetchResult | null> {
  const { firstArtist, queries } = buildSearchQueries(title, artist);
  const durationSec = durationMs ? Math.round(durationMs / 1000) : 0;

  for (const query of queries) {
    if (signal?.aborted) return null;
    const found = await searchLrcLibSingleQuery(query, firstArtist, durationSec, signal);
    if (found) {
      return {
        type: found.type,
        text: found.text,
        sourceLabel: found.type === 'plain' ? 'LRCLIB (Plain Text)' : 'LRCLIB',
      };
    }
  }

  return null;
}
