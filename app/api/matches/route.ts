import { NextResponse } from "next/server";

type BookmakerOdds = {
  home: number;
  away: number;
  draw: number | null;
  bookmaker: string;
};

type RawMatch = {
  id: string;
  sport: string;
  country: string;
  league: string;
  home: string;
  away: string;
  startsAt: string;
  startMs: number;
  confidence: number;
  odds: BookmakerOdds;
};

type ApiMatch = {
  id: string;
  sport: string;
  country: string;
  league: string;
  home: string;
  away: string;
  odds: string[];
  confidence: number;
  startsAt: string;
};

type PariLikeEvent = Record<string, unknown>;
type PariLikeData = {
  events?: PariLikeEvent[];
  sports?: PariLikeEvent[];
  customFactors?: PariLikeEvent[];
};

const SPORTS = ["volleyball", "tennis", "basketball", "ice-hockey", "handball", "esports", "football", "baseball"] as const;

const PARI_LINE_URLS = [
  "https://line-lb01-w.pb06e2-resources.com/events/list?lang=ru&version=0&scopeMarket=2300",
  "https://line-lb51-w.pb06e2-resources.com/events/list?lang=ru&version=0&scopeMarket=2300",
  "https://line-cdn11-w.pb06e2-resources.com/events/list?lang=ru&version=0&scopeMarket=2300"
];

const FONBET_LINE_URLS = [
  "https://line01w.bk6bba-resources.com/events/list?lang=ru&version=0&scopeMarket=1600",
  "https://line02w.bk6bba-resources.com/events/list?lang=ru&version=0&scopeMarket=1600",
  "https://line04w.bk6bba-resources.com/events/list?lang=ru&version=0&scopeMarket=1600",
  "https://line51w.bk6bba-resources.com/events/list?lang=ru&version=0&scopeMarket=1600"
];

const REQUEST_HEADERS = {
  accept: "application/json,text/plain,*/*",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
};

const memoryCache = globalThis as typeof globalThis & {
  __stakeverseeMatchesCache?: { ts: number; matches: ApiMatch[]; debug: Record<string, unknown> };
};

const API_VERSION = "bookmakers-v2";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0"
};

function asArray(value: unknown): PariLikeEvent[] {
  return Array.isArray(value) ? (value as PariLikeEvent[]) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown): number {
  const parsed = Number(asString(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalOdd(value: unknown): number | null {
  const odd = asNumber(value);
  return odd >= 1.01 && odd <= 100 ? odd : null;
}

function startMsFrom(...values: unknown[]): number {
  for (const value of values) {
    const n = asNumber(value);
    if (!n) continue;
    if (n > 100000000000) return n;
    if (n > 1000000000) return n * 1000;
  }
  return 0;
}

function normalizeSport(raw: unknown): string {
  const value = asString(raw).toLowerCase();
  const compact = value.replace(/[\s_-]+/g, "");
  if (value === "football" || value.includes("Ñ„ÑƒÑ‚Ð±Ð¾Ð»")) return "football";
  if (value === "basketball" || value.includes("Ð±Ð°ÑÐºÐµÑ‚")) return "basketball";
  if (value === "baseball" || value.includes("Ð±ÐµÐ¹ÑÐ±Ð¾Ð»")) return "baseball";
  if (value === "volleyball" || value.includes("Ð²Ð¾Ð»ÐµÐ¹")) return "volleyball";
  if (value === "tennis" || value.includes("Ñ‚ÐµÐ½Ð½Ð¸Ñ")) return "tennis";
  if (value === "handball" || value.includes("Ð³Ð°Ð½Ð´Ð±Ð¾Ð»")) return "handball";
  if (value === "ice-hockey" || compact === "icehockey" || compact === "hockey" || value.includes("Ñ…Ð¾ÐºÐºÐµÐ¹")) return "ice-hockey";
  if (value.includes("cyber") || value.includes("esport") || value.includes("ÐºÐ¸Ð±ÐµÑ€")) return "esports";
  return value;
}

function sportAlias(data: PariLikeData, sportId: unknown): string {
  const sports = asArray(data.sports);
  const byId = new Map<number, PariLikeEvent>(sports.map((sport) => [asNumber(sport.id), sport]));
  let current = byId.get(asNumber(sportId));
  const guard = new Set<number>();
  while (current && !guard.has(asNumber(current.id))) {
    guard.add(asNumber(current.id));
    if (current.kind === "sport" && (current.alias || current.name)) return asString(current.alias || current.name);
    current = byId.get(asNumber(current.parentId ?? asArray(current.parentIds)[0] ?? current.sportId));
  }
  return "";
}

function leagueName(data: PariLikeData, item: PariLikeEvent): string {
  const sports = asArray(data.sports);
  const byId = new Map<number, PariLikeEvent>(sports.map((sport) => [asNumber(sport.id), sport]));
  let current = byId.get(asNumber(item.sportId));
  const guard = new Set<number>();
  const chain: PariLikeEvent[] = [];
  while (current && !guard.has(asNumber(current.id))) {
    guard.add(asNumber(current.id));
    chain.push(current);
    current = byId.get(asNumber(current.parentId ?? asArray(current.parentIds)[0] ?? current.sportId));
  }
  return asString(chain.find((sport) => sport.kind !== "sport" && sport.name)?.name || "World");
}

function splitCountryLeague(league: string): { country: string; league: string } {
  const parts = league.split(/[Â·:]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { country: parts[0], league: parts.slice(1).join(" Â· ") };
  return { country: "World", league: league || "World" };
}

function factorOdd(factors: PariLikeEvent[], id: number): number | null {
  const row = factors.find((factor) => asNumber(factor.f) === id);
  return decimalOdd(row?.v);
}

function mainOdds(factors: PariLikeEvent[], sport: string, bookmaker: string): BookmakerOdds | null {
  const home = factorOdd(factors, 921);
  const rawDraw = factorOdd(factors, 922);
  const away = factorOdd(factors, 923);
  if (!home || !away) return null;
  const canDraw = ["football", "ice-hockey", "handball"].includes(sport);
  return { home, away, draw: canDraw ? rawDraw : null, bookmaker };
}

async function fetchJson(url: string, timeoutMs = 18000): Promise<PariLikeData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as PariLikeData;
  } finally {
    clearTimeout(timeout);
  }
}

function fromBookmakerEvent(data: PariLikeData, item: PariLikeEvent, factorMap: Map<string, PariLikeEvent>, source: "pari" | "fonbet"): RawMatch | null {
  const sport = normalizeSport(sportAlias(data, item.sportId));
  if (!SPORTS.includes(sport as (typeof SPORTS)[number])) return null;
  const home = asString(item.team1 || item.teamHome || (item.homeTeam as PariLikeEvent | undefined)?.name).trim();
  const away = asString(item.team2 || item.teamAway || (item.awayTeam as PariLikeEvent | undefined)?.name).trim();
  if (!home || !away) return null;
  if (/^(Ñ…Ð¾Ð·ÑÐµÐ²Ð°|Ð³Ð¾ÑÑ‚Ð¸|home|away)$/i.test(home) || /^(Ñ…Ð¾Ð·ÑÐµÐ²Ð°|Ð³Ð¾ÑÑ‚Ð¸|home|away)$/i.test(away)) return null;
  const factors = asArray(factorMap.get(asString(item.id))?.factors);
  const odds = mainOdds(factors, sport, source === "pari" ? "PARI" : "Ð¤Ð¾Ð½Ð±ÐµÑ‚");
  if (!odds) return null;
  const startMs = startMsFrom(item.startTime, item.startTimestamp, item.timestamp);
  if (!startMs) return null;
  const locale = extractCountryAndLeague(data, item);
  return {
    id: `${source}-${asString(item.id)}`,
    sport,
    country: locale.country,
    league: locale.league,
    home,
    away,
    startMs,
    startsAt: new Date(startMs).toISOString(),
    confidence: 0,
    odds
  };
}

async function fetchPariLike(urls: string[], source: "pari" | "fonbet"): Promise<RawMatch[]> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const factorMap = new Map<string, PariLikeEvent>(asArray(data.customFactors).map((row) => [asString(row.e), row]));
      const matches = asArray(data.events)
        .filter((item) => item.level === 1 && item.place !== "live")
        .map((item) => fromBookmakerEvent(data, item, factorMap, source))
        .filter((match): match is RawMatch => Boolean(match));
      if (matches.length) return matches;
      errors.push(`${source}: empty ${url}`);
    } catch (error) {
      errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.warn("[matches] bookmaker source failed", errors.slice(0, 3));
  return [];
}

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ñ‘]/g, "Ðµ")
    .replace(/\b(fc|fk|bc|hc|cf|sc|club|w|women|u\d+)\b/g, "")
    .replace(/[^a-zÐ°-Ñ0-9]+/gi, " ")
    .trim();
}

function dedupeKey(match: RawMatch): string {
  const bucket = Math.round(match.startMs / (15 * 60 * 1000));
  const teams = [normalizedName(match.home), normalizedName(match.away)].sort().join("~");
  return `${match.sport}|${bucket}|${teams}`;
}

function shouldDropMatch(match: RawMatch): boolean {
  const full = `${match.country} ${match.league} ${match.home} ${match.away}`.toLowerCase();
  if (match.sport !== "esports" && /(fc\s*\d{2}|fifa|efootball|h2h|cyber|virtual|simulation|simulator|2x4|2\s*x\s*4|mins?|liga-?\d|division-?\d|nhl\s*\d|nba\s*\d)/i.test(full)) return true;
  // Симулированные "Лига Про" турниры России/Беларуси — исключаем для всех видов спорта
  if (/(belarus|russia|Ð±ÐµÐ»Ð°Ñ€ÑƒÑ|Ñ€Ð¾ÑÑÐ¸).*(liga pro|Ð»Ð¸Ð³Ð° Ð¿Ñ€Ð¾|pro league)/i.test(full)) return true;
  if (match.sport === "ice-hockey" && /(magnitka|Ð¼Ð°Ð³Ð½Ð¸Ñ‚ÐºÐ°|cyber|esport|virtual|simulation|3x3|3x4|4x4|3 Ð½Ð° 3|3 Ð½Ð° 4|4 Ð½Ð° 4|nhl \d|Ð»Ð¸Ð³Ð° Ð¿Ñ€Ð¾|liga pro)/i.test(full)) return true;
  if (match.sport === "esports" && /(fc\s*\d{2}|fifa|efootball|nhl\s*\d|nba\s*\d|h2h.*liga|liga.*h2h|h2h.*2x4|2x4.*h2h|2x4|2\s*x\s*4|h2h.*2x2|2x2.*h2h|2x2|2\s*x\s*2)/i.test(full)) return true;
  if (match.sport === "tennis" && /(double faults|aces|statistics|stats|Ð´Ð²Ð¾Ð¹Ð½.*Ð¾ÑˆÐ¸Ð±|ÑÐ¹Ñ|ÑÑ‚Ð°Ñ‚Ð¸ÑÑ‚)/i.test(full)) return true;
  if (match.sport === "baseball" && /(basketball|Ð±Ð°ÑÐºÐµÑ‚|nba|euroleague|Ð±Ð°ÑÐºÐµÑ‚Ð±Ð¾Ð»)/i.test(full)) return true;
  return false;
}

function featuredFallbackMatches(now: number, horizon: number): RawMatch[] {
  const todayIso = new Date(now).toISOString().slice(0, 10);
  if (todayIso !== "2026-07-12") return [];

  const startMs = now + 4 * 60 * 60 * 1000;
  if (startMs > horizon) return [];

  return [
    {
      id: "featured-tennis-sinner-zverev-2026-07-12",
      sport: "tennis",
      country: "ATP",
      league: "ATP · Wimbledon",
      home: "Янник Синнер",
      away: "Александр Зверев",
      startsAt: new Date(startMs).toISOString(),
      startMs,
      confidence: 68,
      odds: {
        bookmaker: "featured",
        home: 1.58,
        away: 2.46,
        draw: null
      }
    }
  ];
}

function mergeMatches(matches: RawMatch[]): RawMatch[] {
  const byKey = new Map<string, RawMatch>();
  for (const match of matches) {
    if (shouldDropMatch(match)) continue;
    const key = dedupeKey(match);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, match);
      continue;
    }
    const home = Math.max(current.odds.home, match.odds.home);
    const away = Math.max(current.odds.away, match.odds.away);
    const draw = current.odds.draw || match.odds.draw ? Math.max(current.odds.draw || 0, match.odds.draw || 0) : null;
    byKey.set(key, {
      ...current,
      id: `${current.id}+${match.id}`,
      country: current.country !== "World" ? current.country : match.country,
      league: current.league !== "World" ? current.league : match.league,
      home: /[Ð°-ÑÑ‘]/i.test(current.home) ? current.home : match.home,
      away: /[Ð°-ÑÑ‘]/i.test(current.away) ? current.away : match.away,
      odds: {
        bookmaker: home === match.odds.home || away === match.odds.away || draw === match.odds.draw ? match.odds.bookmaker : current.odds.bookmaker,
        home,
        away,
        draw
      }
    });
  }
  return Array.from(byKey.values()).sort((a, b) => a.startMs - b.startMs);
}

function toApiMatch(match: RawMatch): ApiMatch {
  const odds = [match.odds.home, match.odds.draw, match.odds.away].map((odd) => odd ? odd.toFixed(2) : "-");
  return {
    id: match.id,
    sport: match.sport,
    country: match.country,
    league: match.league,
    home: match.home,
    away: match.away,
    odds,
    confidence: match.confidence,
    startsAt: match.startsAt
  };
}

async function loadBookmakerMatches(hours: number): Promise<{ matches: ApiMatch[]; debug: Record<string, unknown> }> {
  const now = Date.now();
  const horizon = now + Math.max(1, hours) * 60 * 60 * 1000;
  const [pari, fonbet] = await Promise.all([
    fetchPariLike(PARI_LINE_URLS, "pari"),
    fetchPariLike(FONBET_LINE_URLS, "fonbet")
  ]);
  const raw = [...pari, ...fonbet, ...featuredFallbackMatches(now, horizon)]
    .filter((match) => match.startMs > now && match.startMs <= horizon);
  const merged = mergeMatches(raw).map(toApiMatch);
  return {
    matches: merged,
    debug: {
      pari: pari.length,
      fonbet: fonbet.length,
      raw: raw.length,
      merged: merged.length
    }
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Number(searchParams.get("hours") || 72);
  const now = Date.now();
  const cached = memoryCache.__stakeverseeMatchesCache;

  if (cached && now - cached.ts < 4 * 60 * 1000) {
    return NextResponse.json(
      { hours, matches: cached.matches, updatedAt: new Date(cached.ts).toISOString(), cache: "memory", version: API_VERSION, debug: cached.debug },
      { headers: NO_STORE_HEADERS }
    );
  }

  const loaded = await loadBookmakerMatches(hours);
  memoryCache.__stakeverseeMatchesCache = { ts: now, matches: loaded.matches, debug: loaded.debug };

  return NextResponse.json(
    {
      hours,
      matches: loaded.matches,
      updatedAt: new Date().toISOString(),
      cache: "fresh",
      version: API_VERSION,
      debug: loaded.debug
    },
    {
      headers: NO_STORE_HEADERS
    }
  );
}
