import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { execFile, spawn, exec } from 'child_process';
import path from 'path';
import { PassThrough, Readable } from 'stream';
import { YouTube } from 'youtube-sr';
import {
  Ytdl,
  Quality,
  SearchType,
  chooseFormat,
  parseVideoId,
  parsePlaylistId,
} from '@distube/ytdl-core';
import { Innertube, Log, UniversalCache } from 'youtubei.js';
import ffmpegStatic from 'ffmpeg-static';

// Ensure prism-media / @discordjs/voice has ffmpeg path
if (!process.env.FFMPEG_PATH && ffmpegStatic) {
  process.env.FFMPEG_PATH = ffmpegStatic;
}

// Silence verbose parser warnings from youtubei.js
Log.setLevel(Log.Level.NONE);

export interface YouTubeSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number; // in seconds
  durationString: string;
}

const ROOT_DIR = process.cwd();
const YTDLP_PATH = path.join(ROOT_DIR, 'bin', 'yt-dlp');

// Singleton instances to maintain session health, PO token worker, and cache
let ytdlInstance: Ytdl | null = null;
let innertubePromise: Promise<Innertube> | null = null;
let ytDlpYouTube429Until = 0;

function getYtdl(): Ytdl {
  if (!ytdlInstance) {
    ytdlInstance = new Ytdl({
      lang: 'en',
      country: 'US',
      timeoutMs: 8000,
    });
  }
  return ytdlInstance;
}

async function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      lang: 'en',
      location: 'US',
    }).catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(url.trim());
}

function formatDuration(durationSec: number): string {
  if (isNaN(durationSec) || durationSec <= 0) return '0:00';
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = Math.floor(durationSec % 60);

  const parts: (number | string)[] = [];
  if (hours > 0) {
    parts.push(hours);
    parts.push(minutes.toString().padStart(2, '0'));
  } else {
    parts.push(minutes);
  }
  parts.push(seconds.toString().padStart(2, '0'));
  return parts.join(':');
}

function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\(Official\s*(Music\s*)?(Video|Audio)\)/gi, '')
    .replace(/\[Official\s*(Music\s*)?(Video|Audio)\]/gi, '')
    .replace(/\(Lyric(s)?\s*(Video)?\)/gi, '')
    .replace(/\[MV\]/gi, '')
    .replace(/\(4K\s*Remaster\)/gi, '')
    .replace(/\|\s*(Official\s*)?(Music\s*)?(Video|Audio|Lyrics?|MV)\b/gi, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies that a Readable stream actually produces initial audio bytes
 * before handing it off to @discordjs/voice, catching 403/SABR/process failures early
 * so fallback engines can take over cleanly.
 */
function verifyStreamStarts(source: Readable, timeoutMs = 15000, onCloseCleanup?: () => void): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const pass = new PassThrough({ highWaterMark: 1 << 16 });
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        source.destroy();
        onCloseCleanup?.();
        reject(new Error(`Stream timed out after ${timeoutMs}ms waiting for first audio bytes`));
      }
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        pass.write(chunk);
        source.pipe(pass);
        source.on('error', (err) => {
          if (!pass.destroyed) pass.destroy(err);
        });
        pass.on('close', () => {
          if (!source.destroyed) source.destroy();
          onCloseCleanup?.();
        });
        source.on('close', () => {
          onCloseCleanup?.();
        });
        resolve(pass);
      }
    };

    const onError = (err: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        onCloseCleanup?.();
        reject(err);
      }
    };

    const onEnd = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        onCloseCleanup?.();
        reject(new Error('Stream ended with 0 bytes'));
      }
    };

    const cleanup = () => {
      source.removeListener('data', onData);
      source.removeListener('error', onError);
      source.removeListener('end', onEnd);
    };

    source.on('data', onData);
    source.on('error', onError);
    source.on('end', onEnd);
  });
}

export async function ensureYtDlp(force: boolean = false): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const stats = fs.existsSync(YTDLP_PATH) ? fs.statSync(YTDLP_PATH) : null;
  const shouldDownload = force || !stats || (Date.now() - stats.mtimeMs > 12 * 60 * 60 * 1000);

  if (shouldDownload) {
    logger.info(force ? 'FORCING yt-dlp binary update...' : 'Checking for yt-dlp updates...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    try {
      const tempPath = `${YTDLP_PATH}.new`;

      await new Promise((resolve, reject) => {
        exec(`curl -L ${url} -o "${tempPath}"`, (err) => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      if (fs.existsSync(tempPath)) {
        fs.chmodSync(tempPath, 0o755);
        fs.renameSync(tempPath, YTDLP_PATH);
        logger.success('yt-dlp has been updated to the latest version.');
      }
    } catch (err) {
      logger.error('Failed to update yt-dlp:', err);
      if (!fs.existsSync(YTDLP_PATH)) {
        throw new Error('Could not download yt-dlp binary.');
      }
    }
  }

  return YTDLP_PATH;
}

/**
 * Modern 2026 yt-dlp arguments:
 * - No broken --impersonate chrome or stale Chrome/121 headers
 * - No broken android,web player_client override
 * - Enables Node JS runtime + remote EJS solver for YouTube n-challenges (with caching enabled)
 * - Cookie-free by default (cookies only used if explicitly requested)
 */
function buildYtDlpArgs(baseArgs: string[], useCookies = false): string[] {
  const args = [...baseArgs];

  args.push('--force-ipv4');
  args.push('--no-check-certificates');
  args.push('--socket-timeout', '8');
  args.push('--retries', '1');
  args.push('--js-runtimes', `node:${process.execPath}`);
  args.push('--remote-components', 'ejs:github');

  if (ffmpegStatic) {
    args.push('--ffmpeg-location', ffmpegStatic);
  }

  if (useCookies && config.hasCookies) {
    const resolvedPath = config.absoluteCookiePath;
    if (fs.existsSync(resolvedPath)) {
      args.push('--cookies', resolvedPath);
      logger.info(`Using fallback cookies from: ${resolvedPath}`);
    }
  }

  const proxy = process.env.YT_PROXY;
  if (proxy) args.push('--proxy', proxy);

  return args;
}

export async function runYtDlp(args: string[]): Promise<string> {
  const binaryPath = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    logger.info('Running yt-dlp fallback command...');

    execFile(binaryPath, args, { maxBuffer: 15 * 1024 * 1024, timeout: 15000 }, (error, stdout, stderr) => {
      if (stderr) {
        if (stderr.includes('HTTP Error 429') || stderr.includes('Too Many Requests')) {
          ytDlpYouTube429Until = Date.now() + 60_000;
          logger.warn('yt-dlp hit YouTube HTTP 429 rate limit. Enabling 60s cooldown for yt-dlp YouTube scraping.');
        } else if (stderr.includes('Sign in') || stderr.includes('bot')) {
          logger.warn(`yt-dlp bot warning: ${stderr.trim()}`);
        }
      }

      if (error) {
        if (stdout.trim()) {
          return resolve(stdout);
        }
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

async function resolveYouTubeOEmbed(url: string): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; thumbnail_url?: string };
    if (!data.title) return null;
    return {
      title: data.title,
      thumbnail: data.thumbnail_url || '',
    };
  } catch {
    return null;
  }
}

async function resolveYouTubeTitleOEmbed(url: string): Promise<string | null> {
  const info = await resolveYouTubeOEmbed(url);
  return info?.title || null;
}

export async function searchYouTube(query: string, limit: number = 5): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  const isUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');
  const ytUrl = isUrl && isYouTubeUrl(cleanQuery);

  // 1. Handle YouTube URLs natively via @distube/ytdl-core -> youtubei.js -> yt-dlp
  if (ytUrl) {
    const videoId = parseVideoId(cleanQuery);
    const playlistId = parsePlaylistId(cleanQuery);
    const isExplicitPlaylist = cleanQuery.includes('/playlist') || (!videoId && !!playlistId);

    // 1a. Playlist URL
    if (isExplicitPlaylist && playlistId) {
      try {
        const yt = getYtdl();
        const playlist = await yt.getPlaylist(cleanQuery, {
          limit: Math.max(limit, 50),
          signal: AbortSignal.timeout(8000),
        });
        if (playlist.videos.length > 0) {
          return playlist.videos.slice(0, limit).map((v) => ({
            id: v.id,
            title: v.title || 'Unknown Title',
            url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
            thumbnail: v.thumbnails?.[0]?.url || '',
            duration: v.lengthSeconds || 0,
            durationString: formatDuration(v.lengthSeconds || 0),
          }));
        }
      } catch (err: any) {
        logger.warn(`ytdl-core getPlaylist failed for "${cleanQuery}": ${err.message || err}`);
      }

      try {
        const innertube = await getInnertube();
        const playlist = await innertube.getPlaylist(playlistId);
        const items = (playlist.items || [])
          .filter((item: any) => item.id)
          .slice(0, limit)
          .map((item: any) => {
            const sec = item.duration?.seconds || 0;
            return {
              id: item.id,
              title: item.title?.text || item.title?.toString() || 'Unknown Title',
              url: `https://www.youtube.com/watch?v=${item.id}`,
              thumbnail: item.thumbnails?.[0]?.url || '',
              duration: sec,
              durationString: item.duration?.text || formatDuration(sec),
            };
          });
        if (items.length > 0) return items;
      } catch (err: any) {
        logger.warn(`youtubei.js getPlaylist failed for "${cleanQuery}": ${err.message || err}`);
      }
    }

    // 1b. Single Video URL
    if (videoId) {
      try {
        const yt = getYtdl();
        const info = await yt.getInfo(videoId, { signal: AbortSignal.timeout(7000) });
        const d = info.videoDetails;
        if (d?.title) {
          return [
            {
              id: d.id,
              title: d.title,
              url: d.url || `https://www.youtube.com/watch?v=${d.id}`,
              thumbnail: d.thumbnails?.[d.thumbnails.length - 1]?.url || d.thumbnails?.[0]?.url || '',
              duration: d.lengthSeconds || 0,
              durationString: formatDuration(d.lengthSeconds || 0),
            },
          ];
        }
      } catch (err: any) {
        logger.warn(`ytdl-core getInfo failed for "${cleanQuery}": ${err.message || err}`);
      }

      try {
        const innertube = await getInnertube();
        const info = await innertube.getBasicInfo(videoId);
        const b = info.basic_info;
        if (b?.title) {
          const sec = b.duration || 0;
          return [
            {
              id: b.id || videoId,
              title: b.title,
              url: `https://www.youtube.com/watch?v=${b.id || videoId}`,
              thumbnail: b.thumbnail?.[0]?.url || '',
              duration: sec,
              durationString: formatDuration(sec),
            },
          ];
        }
      } catch (err: any) {
        logger.warn(`youtubei.js getBasicInfo failed for "${cleanQuery}": ${err.message || err}`);
      }

      // Fast oEmbed metadata fallback (survives YouTube 429 / bot walls so Track.from still resolves title & plays via fallback)
      const oembed = await resolveYouTubeOEmbed(`https://www.youtube.com/watch?v=${videoId}`);
      if (oembed) {
        logger.info(`Resolved YouTube URL metadata via oEmbed: "${oembed.title}"`);
        return [
          {
            id: videoId,
            title: oembed.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: oembed.thumbnail,
            duration: 0,
            durationString: '--:--',
          },
        ];
      }
    }
  }

  // 2. Non-URL search queries: Tier 1 @distube/ytdl-core -> Tier 2 youtubei.js -> Tier 3 youtube-sr -> Tier 4 yt-dlp
  if (!isUrl) {
    try {
      const yt = getYtdl();
      const results = await yt.search(cleanQuery, {
        type: SearchType.Video,
        limit,
        signal: AbortSignal.timeout(7000),
      });
      if (results && results.length > 0) {
        return results.slice(0, limit).map((v) => ({
          id: v.id,
          title: v.title || 'Unknown Title',
          url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
          thumbnail: v.thumbnails?.[0]?.url || '',
          duration: v.lengthSeconds || 0,
          durationString: formatDuration(v.lengthSeconds || 0),
        }));
      }
    } catch (err: any) {
      logger.warn(`ytdl-core search failed for "${cleanQuery}": ${err.message || err}`);
    }

    try {
      const innertube = await getInnertube();
      const search = await innertube.search(cleanQuery, { type: 'video' });
      const videos = (search.results || [])
        .filter((v: any) => v.id && v.type === 'Video')
        .slice(0, limit)
        .map((v: any) => {
          const sec = v.duration?.seconds || 0;
          return {
            id: v.id,
            title: v.title?.text || v.title?.toString() || 'Unknown Title',
            url: `https://www.youtube.com/watch?v=${v.id}`,
            thumbnail: v.thumbnails?.[0]?.url || '',
            duration: sec,
            durationString: v.duration?.text || formatDuration(sec),
          };
        });
      if (videos.length > 0) return videos;
    } catch (err: any) {
      logger.warn(`youtubei.js search failed for "${cleanQuery}": ${err.message || err}`);
    }

    try {
      const srResults = await YouTube.search(cleanQuery, { limit, type: 'video' });
      if (srResults && srResults.length > 0) {
        return srResults.map((v) => ({
          id: v.id || '',
          title: v.title || 'Unknown Title',
          url: v.url,
          thumbnail: v.thumbnail?.url || '',
          duration: (v.duration || 0) / 1000,
          durationString: v.durationFormatted || formatDuration((v.duration || 0) / 1000),
        }));
      }
    } catch (err: any) {
      logger.warn(`youtube-sr search failed for "${cleanQuery}": ${err.message || err}`);
    }
  }

  // 3. Modernized yt-dlp fallback (also handles non-YouTube URLs like SoundCloud / Bandcamp)
  try {
    const baseArgs = isUrl
      ? [cleanQuery, '--flat-playlist', '--dump-json', '--no-warnings']
      : [`ytsearch${limit}:${cleanQuery}`, '--flat-playlist', '--dump-json', '--no-warnings'];

    const args = buildYtDlpArgs(baseArgs, false);
    const output = await runYtDlp(args);

    if (output) {
      const lines = output.trim().split('\n');
      const results: YouTubeSearchResult[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item._type === 'playlist' || item._type === 'url') {
            if (item.url && (item.url.includes('channel/') || item.url.includes('@'))) continue;
          }

          const id = item.id || '';
          results.push({
            id,
            title: item.title || item.fulltitle || 'Unknown Title',
            url: item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : isUrl ? cleanQuery : ''),
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
            duration: item.duration || 0,
            durationString: item.duration_string || formatDuration(item.duration || 0),
          });
        } catch {
          // ignore malformed JSON line
        }
      }

      if (results.length > 0) return results.slice(0, limit);
    }
  } catch (err: any) {
    logger.warn(`yt-dlp search/metadata failed for "${cleanQuery}": ${err.message || err}`);
  }

  return [];
}

export async function ytDlpGetMetadata(url: string): Promise<YouTubeSearchResult[]> {
  return searchYouTube(url, 50);
}

async function spawnYtDlpProcess(url: string, useCookies = false): Promise<{ stream: Readable; cleanup: () => void }> {
  const binaryPath = await ensureYtDlp();
  const isScSearch = url.startsWith('scsearch');

  const baseArgs = isScSearch
    ? [
        '-f', 'bestaudio[format_id!*=preview]',
        '--ignore-errors',
        '--max-downloads', '1',
        '--no-part',
        '--no-warnings',
        '-o', '-',
        url,
      ]
    : [
        '-f', 'bestaudio[acodec=opus]/bestaudio/best',
        '--no-playlist',
        '--no-part',
        '--no-warnings',
        '-o', '-',
        url,
      ];

  const args = buildYtDlpArgs(baseArgs, useCookies);

  logger.info(`Spawning yt-dlp audio stream (${useCookies ? 'with cookies' : 'cookie-free'}): "${url}"`);
  const child = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      if (msg.includes('HTTP Error 429') || msg.includes('Too Many Requests')) {
        ytDlpYouTube429Until = Date.now() + 60_000;
      }
      logger.warn(`[yt-dlp stream stderr]: ${msg}`);
    }
  });

  child.on('error', (err) => {
    logger.error(`yt-dlp stream process failed to spawn for "${url}":`, err);
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== 101 && code !== null) {
      logger.warn(`yt-dlp stream process exited with code ${code}, signal: ${signal}`);
    }
  });

  const cleanup = () => {
    try {
      if (!child.killed) child.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  child.stdout.on('close', cleanup);

  return { stream: child.stdout, cleanup };
}

export async function spawnYtDlpStream(url: string, useCookies = false): Promise<Readable> {
  const { stream, cleanup } = await spawnYtDlpProcess(url, useCookies);
  return verifyStreamStarts(stream, 15000, cleanup);
}

async function streamViaYtdlCore(url: string): Promise<Readable> {
  const yt = getYtdl();
  const info = await yt.getInfo(url, { signal: AbortSignal.timeout(7000) });
  const format = chooseFormat(info.formats, {
    quality: Quality.HighestAudio,
    filter: [
      { hasAudio: true, hasVideo: false, audioCodec: 'opus' },
      { hasAudio: true, hasVideo: false },
      { hasAudio: true },
    ],
  });
  logger.info(`Streaming via @distube/ytdl-core (client=${info.client}, itag=${format.itag}, codec=${format.audioCodec || format.codecs}, sabr=${!!info.sabr})`);
  const raw = yt.download(info, {
    format,
    highWaterMark: 1 << 20,
  });
  return verifyStreamStarts(raw, 10000);
}

async function streamViaInnertube(videoId: string): Promise<Readable> {
  const innertube = await getInnertube();
  const clients: Array<'IOS' | 'WEB_EMBEDDED' | 'ANDROID_VR'> = ['IOS', 'WEB_EMBEDDED', 'ANDROID_VR'];

  let lastErr: any;
  for (const client of clients) {
    try {
      logger.info(`Attempting youtubei.js audio stream with client=${client} for ${videoId}`);
      const webStream = await innertube.download(videoId, {
        type: 'audio',
        quality: 'best',
        client,
      });
      const raw = Readable.fromWeb(webStream as any);
      return await verifyStreamStarts(raw, 10000);
    } catch (err: any) {
      lastErr = err;
      const msg = err.message || String(err);
      logger.warn(`youtubei.js client=${client} failed for ${videoId}: ${msg}`);
      if (msg.includes('login required') || msg.includes('429') || msg.includes('bot')) {
        break; // Fast-fail to next tier instead of hitting more blocked clients
      }
    }
  }
  throw lastErr || new Error('All youtubei.js clients failed');
}

/**
 * Resilient multi-engine audio stream resolver (cookie-free by default):
 * 1. @distube/ytdl-core v5 (built-in BotGuard PO token worker + SABR + client rotation)
 * 2. youtubei.js v18 (IOS / WEB_EMBEDDED / ANDROID_VR)
 * 3. Modernized yt-dlp (Node JS runtime + EJS GitHub solver, cookie-free, skipped during 429 cooldown)
 * 4. SoundCloud fallback via yt-dlp (if YouTube datacenter IP is rate-limited / hard-blocked)
 */
export async function spawnStream(url: string, fallbackTitle?: string): Promise<Readable> {
  const ytUrl = isYouTubeUrl(url);

  if (ytUrl) {
    const videoId = parseVideoId(url);

    // Tier 1: @distube/ytdl-core v5 (Primary, cookie-free)
    try {
      return await streamViaYtdlCore(url);
    } catch (err: any) {
      logger.warn(`Tier 1 (@distube/ytdl-core) failed for "${url}": ${err.message || err}`);
    }

    // Tier 2: youtubei.js v18 (Secondary, cookie-free)
    if (videoId) {
      try {
        return await streamViaInnertube(videoId);
      } catch (err: any) {
        logger.warn(`Tier 2 (youtubei.js) failed for "${url}": ${err.message || err}`);
      }
    }

    // Tier 3: Modernized yt-dlp (Tertiary, cookie-free; skip during 429 cooldown)
    if (Date.now() > ytDlpYouTube429Until) {
      try {
        return await spawnYtDlpStream(url, false);
      } catch (err: any) {
        logger.warn(`Tier 3 (yt-dlp cookie-free) failed for "${url}": ${err.message || err}`);
      }
    } else {
      logger.info(`Skipping Tier 3 (yt-dlp YouTube) due to active 429 cooldown; falling back to SoundCloud.`);
    }

    // Tier 4: SoundCloud fallback (rescues playback when datacenter IP gets 429 or bot-blocked)
    const resolvedTitle = fallbackTitle || (await resolveYouTubeTitleOEmbed(url));
    if (resolvedTitle) {
      const scQuery = cleanTitleForSearch(resolvedTitle);
      if (scQuery) {
        try {
          logger.info(`Tier 4 (SoundCloud fallback) searching: "${scQuery}"`);
          return await spawnYtDlpStream(`scsearch5:${scQuery}`, false);
        } catch (scErr: any) {
          logger.warn(`Tier 4 (SoundCloud fallback) failed for "${scQuery}": ${scErr.message || scErr}`);
        }
      }
    }

    throw new Error('Không thể phát luồng âm thanh từ YouTube hoặc nguồn dự phòng cho bài hát này.');
  }

  // Non-YouTube URLs (SoundCloud, Bandcamp, direct audio links, etc.)
  return spawnYtDlpStream(url, false);
}

export const YouTubeSearch = {
  async getVersion(): Promise<string> {
    const binPath = await ensureYtDlp();
    return new Promise((resolve) => {
      execFile(binPath, ['--version'], (error, stdout) => {
        if (error) resolve('Unknown');
        else resolve(stdout.trim());
      });
    });
  },

  async getSuggestions(query: string): Promise<string[]> {
    try {
      const yt = getYtdl();
      const suggestions = await yt.getSuggestions(query);
      if (suggestions && suggestions.length > 0) {
        return [...suggestions];
      }
    } catch {
      // fallback to youtube-sr
    }
    try {
      const sr = await YouTube.getSuggestions(query);
      return sr.map((item: any) => (typeof item === 'string' ? item : item.title || '')).filter(Boolean);
    } catch {
      return [];
    }
  },

  async search(query: string, options?: { limit?: number }) {
    const limit = options?.limit || 5;
    const results = await searchYouTube(query, limit);
    return results.map((r) => ({
      title: r.title,
      url: r.url,
      thumbnail: { url: r.thumbnail },
      duration: r.duration * 1000,
      durationFormatted: r.durationString,
    }));
  },

  async searchOne(query: string) {
    const results = await this.search(query, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  },

  spawnStream,
};
