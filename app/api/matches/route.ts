import { NextResponse } from "next/server";

import { inferFootballCountry, isWorldCountry } from "@/lib/footballCountries";
import { KBO_TEAMS, isKboMatchContext, kboTeamId, resolveKboTeam } from "@/lib/kboTeams";
import { MLB_TEAMS, isMlbMatchContext, mlbTeamId, resolveMlbTeam } from "@/lib/mlbTeams";
import { NPB_TEAMS, isNpbMatchContext, npbTeamId, resolveNpbTeam } from "@/lib/npbTeams";
import { isWnbaMatchContext, resolveWnbaTeam, wnbaTeamId } from "@/lib/wnbaTeams";
import { areHltvTeamNamesSimilar, counterStrikeTeamId, loadHltvUpcomingMatches, type HltvUpcomingMatch } from "@/lib/hltv";
import {
  hasTop100Participant,
  loadTennisRankings,
  tennisParticipants,
  type TennisParticipant,
  type TennisRankings,
  type TennisTour
} from "@/lib/tennisRankings";

type BookmakerOdds = {
  home: number;
  away: number;
  draw: number | null;
  bookmaker: string;
};

type BookmakerKey = "pari" | "fonbet" | "tennisi" | "featured";

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
  recommendationSide: "home" | "draw" | "away";
  odds: BookmakerOdds;
  bookmakerOdds: Partial<Record<BookmakerKey, BookmakerOdds>>;
  homeTeamId?: string;
  awayTeamId?: string;
  tennisTour?: TennisTour;
  homePlayers?: TennisParticipant[];
  awayPlayers?: TennisParticipant[];
  hltvMatchId?: string;
  hltvMatchUrl?: string;
  hltvEventUrl?: string;
  esportsMatchFormat?: string;
  esportsMatchVenue?: "LAN" | "Online";
  hltvEvent?: string;
  homeHltvWorldRank?: number;
  awayHltvWorldRank?: number;
  homeValveRank?: number;
  awayValveRank?: number;
  homeHltvForm?: string;
  awayHltvForm?: string;
  homeHltvProfileUrl?: string;
  awayHltvProfileUrl?: string;
};

type ApiMatch = {
  id: string;
  sport: string;
  country: string;
  league: string;
  home: string;
  away: string;
  odds: string[];
  bookmakerOdds: Partial<Record<BookmakerKey, string[]>>;
  bestBookmakers: string[];
  confidence: number;
  recommendationSide: "home" | "draw" | "away";
  startsAt: string;
  homeTeamId?: string;
  awayTeamId?: string;
  tennisTour?: TennisTour;
  homePlayers?: TennisParticipant[];
  awayPlayers?: TennisParticipant[];
  hltvMatchId?: string;
  hltvMatchUrl?: string;
  hltvEventUrl?: string;
  esportsMatchFormat?: string;
  esportsMatchVenue?: "LAN" | "Online";
  hltvEvent?: string;
  homeHltvWorldRank?: number;
  awayHltvWorldRank?: number;
  homeValveRank?: number;
  awayValveRank?: number;
  homeHltvForm?: string;
  awayHltvForm?: string;
  homeHltvProfileUrl?: string;
  awayHltvProfileUrl?: string;
};

type Analysis = {
  confidence: number;
  recommendationSide: "home" | "draw" | "away";
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

const TENNISI_CATEGORIES: { categoryId: number; path: string; sport: string }[] = [
  { categoryId: 137, path: "football", sport: "football" },
  { categoryId: 139, path: "tennis", sport: "tennis" },
  { categoryId: 140, path: "basketball", sport: "basketball" },
  { categoryId: 138, path: "hockey", sport: "ice-hockey" },
  { categoryId: 9027116, path: "volleyball", sport: "volleyball" },
  { categoryId: 439908280, path: "cybersport", sport: "esports" },
  { categoryId: 5662396, path: "handball", sport: "handball" },
  { categoryId: 326835, path: "baseball", sport: "baseball" }
];

const REQUEST_HEADERS = {
  accept: "application/json,text/plain,*/*",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
};

const memoryCache = globalThis as typeof globalThis & {
  __stakeverseeMatchesCache?: Map<number, { ts: number; matches: ApiMatch[]; debug: Record<string, unknown> }>;
};

const API_VERSION = "bookmakers-v39-esports-team-ids";
const BOOKMAKER_REQUEST_TIMEOUT_MS = 6_500;
const TENNISI_ENDPOINTS = [
  {
    baseUrl: "https://tennisi.kz",
    buildUrl: (category: { categoryId: number }) => `https://tennisi.kz/mtg2/cgi/!free.CategoryInfo?categoryid=${category.categoryId}&gameid=18&more=today&lang=rus`,
    gameId: 18
  },
  {
    baseUrl: "https://tennisi.bet",
    buildUrl: (category: { categoryId: number; path: string }) => `https://tennisi.bet/rt/cgi/!rt_home.CategoryInfo?mcmd=cat&mcmdparam=${category.path}&gameid=5&categoryid=${category.categoryId}&lang=rus`,
    gameId: 5
  }
] as const;

const BASEBALL_TEAM_ALIASES: [string, string[]][] = [
  ["oaxaca", ["oaxaca", "оахака", "геррерос де оаксака", "guerreros de oaxaca", "guerreros oaxaca"]],
  ["bravos leon", ["bravos leon", "bravos de leon", "бравос леон", "бравос де леон"]],
  ["monterrey sultanes", ["monterrey", "sultanes monterrey", "sultanes de monterrey", "монтеррей", "султанес монтеррей"]],
  ["diablos rojos mexico", ["diablos rojos", "diablos rojos del mexico", "diablos rojos mexico", "мехико диаблос рохос"]],
  ["toros tijuana", ["toros tijuana", "toros de tijuana", "tijuana", "тихуана"]],
  ["algodoneros union laguna", ["algodoneros", "union laguna", "algodoneros union laguna", "алгодонерос"]],
  ["acereros monclova", ["acereros monclova", "acereros de monclova", "monclova", "монклова"]],
  ["saraperos saltillo", ["saraperos saltillo", "saraperos de saltillo", "saltillo", "сараперос"]],
  ["rieleros aguascalientes", ["rieleros aguascalientes", "rieleros de aguascalientes", "aguascalientes", "рьелерос"]],
  ["tigres quintana roo", ["tigres quintana roo", "tigres de quintana roo", "quintana roo", "тигрес"]],
  ["leones yucatan", ["leones yucatan", "leones de yucatan", "yucatan", "юкатан"]],
  ...KBO_TEAMS.map(team => [team.id, [team.id, team.name, team.shortName, ...team.aliases]] as [string, string[]]),
  ...MLB_TEAMS.map(team => [team.id, [team.id, team.name, team.shortName, ...team.aliases]] as [string, string[]]),
  ...NPB_TEAMS.map(team => [team.id, [team.id, team.name, team.shortName, ...team.aliases]] as [string, string[]])
];

const BASEBALL_TEAM_ID_BY_ALIAS = new Map(
  BASEBALL_TEAM_ALIASES.flatMap(([id, aliases]) => aliases.map(alias => [normalizedName(alias), id] as const))
);
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

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&numero;/gi, "№")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTeams(value: string): [string, string] | null {
  const parts = stripTags(value).split(/\s+(?:-|—|–)\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts.slice(1).join(" - ")] : null;
}

const TENNISI_MONTH_NAMES: Record<string, number> = {
  "ЯНВАРЯ": 0,
  "ФЕВРАЛЯ": 1,
  "МАРТА": 2,
  "АПРЕЛЯ": 3,
  "МАЯ": 4,
  "ИЮНЯ": 5,
  "ИЮЛЯ": 6,
  "АВГУСТА": 7,
  "СЕНТЯБРЯ": 8,
  "ОКТЯБРЯ": 9,
  "НОЯБРЯ": 10,
  "ДЕКАБРЯ": 11
};

function parseTennisiStartMs(dateText: string, baseYear: number, baseMonth: number, baseDay: number, dayOffset: number, utcOffsetHours = 3): number | null {
  const timeMatch = dateText.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const numericDate = dateText.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  const wordDate = dateText.match(/(\d{1,2})\s+([А-ЯЁ]+)/i);

  let year = baseYear;
  let month = baseMonth;
  let day = baseDay + dayOffset;

  if (numericDate) {
    day = Number(numericDate[1]);
    month = Number(numericDate[2]) - 1;
    if (numericDate[3]) {
      year = Number(numericDate[3]);
      if (year < 100) year += 2000;
    }
  }
  if (!numericDate && wordDate) {
    const parsedMonth = TENNISI_MONTH_NAMES[wordDate[2].toUpperCase()];
    if (parsedMonth !== undefined) {
      day = Number(wordDate[1]);
      month = parsedMonth;
    }
  }

  const startMs = Date.UTC(year, month, day, hour - utcOffsetHours, minute);
  const baseMs = Date.UTC(baseYear, baseMonth, baseDay, 0, 0);
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  return (numericDate || wordDate) && startMs < baseMs - monthMs
    ? Date.UTC(year + 1, month, day, hour - 3, minute)
    : startMs;
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
  if (value === "football" || value.includes("футбол")) return "football";
  if (value === "basketball" || value.includes("баскет")) return "basketball";
  if (value === "baseball" || value.includes("бейсбол")) return "baseball";
  if (value === "volleyball" || value.includes("волей")) return "volleyball";
  if (value === "tennis" || value.includes("теннис")) return "tennis";
  if (value === "handball" || value.includes("гандбол")) return "handball";
  if (value === "ice-hockey" || compact === "icehockey" || compact === "hockey" || value.includes("хоккей")) return "ice-hockey";
  if (value.includes("cyber") || value.includes("esport") || value.includes("кибер")) return "esports";
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
  const parts1 = league.split(/[\u00b7:]/).map((part) => part.trim()).filter(Boolean);
  if (parts1.length >= 2) return { country: normalizeCountryName(parts1[0]), league: parts1.slice(1).join(" \u00b7 ") };
  const parts2 = league.split(".").map((part) => part.trim()).filter(Boolean);
  if (parts2.length >= 2) return { country: normalizeCountryName(parts2[0]), league: parts2.slice(1).join(". ") };
  return { country: "World", league: league || "World" };
}

function isSportHeaderName(value: string): boolean {
  return /^(football|футбол|basketball|баскетбол|baseball|бейсбол|volleyball|волейбол|tennis|теннис|hockey|хоккей|handball|гандбол|cyber|кибер|киберспорт)$/i
    .test(value.trim());
}

const COUNTRY_FROM_LEAGUE_KEYWORDS: Array<[RegExp, string]> = [
  [/болгар(ия|ии|ский|ская|ское)/i, "Bulgaria"],
  [/уругва(й|я|йский|йская|йское)/i, "Uruguay"],
  [/литв(а|ы|ы|ский|ская|ское)/i, "Lithuania"],
  [/росси(я|и|йский|йская|йское)/i, "Russia"],
  [/беларус(ь|и|ский|ская|ское)/i, "Belarus"],
  [/инд(ия|ии|ийский|ийская|ийское)/i, "India"],
  [/бутан(а|ский|ская|ское)?/i, "Bhutan"],
  [/бразили(я|и|йский|йская|йское)/i, "Brazil"],
  [/австрали(я|и|йский|йская|йское)/i, "Australia"],
  [/аргентин(а|ы|ский|ская|ское)/i, "Argentina"],
  [/мексик(а|и|анский|анская|анское)/i, "Mexico"],
  [/чили(йский|йская|йское)?/i, "Chile"],
  [/колумби(я|и|йский|йская|йское)/i, "Colombia"],
  [/перу(анский|анская|анское)?/i, "Peru"],
  [/егип(ет|та|етский|етская|етское)/i, "Egypt"],
  [/марокко|мароккан/i, "Morocco"],
  [/тунис(а|ский|ская|ское)?/i, "Tunisia"],
  [/казахстан(а|ский|ская|ское)?/i, "Kazakhstan"],
  [/таиланд(а|ский|ская|ское)?/i, "Thailand"],
  [/вьетнам(а|ский|ская|ское)?/i, "Vietnam"],
  [/индонези(я|и|йский|йская|йское)/i, "Indonesia"],
  [/малайзи(я|и|йский|йская|йское)/i, "Malaysia"],
  [/сингапур(а|ский|ская|ское)?/i, "Singapore"],
  [/филиппин(ы|ский|ская|ское)?/i, "Philippines"],
  [/саудовск|саудовская аравия|саудовской аравии/i, "Saudi Arabia"],
  [/турци(я|и|ецкий|ецкая|ецкое)/i, "Turkey"],
  [/польш(а|и|ский|ская|ское)/i, "Poland"],
  [/германи(я|и|йский|йская|йское)/i, "Germany"],
  [/франци(я|и|йский|йская|йское)/i, "France"],
  [/испани(я|и|йский|йская|йское)/i, "Spain"],
  [/итали(я|и|йский|йская|йское)/i, "Italy"],
  [/португали(я|и|йский|йская|йское)/i, "Portugal"],
  [/нидерланд(ы|ов|ский|ская|ское)/i, "Netherlands"],
  [/бельги(я|и|йский|йская|йское)/i, "Belgium"],
  [/швеци(я|и|йский|йская|йское)/i, "Sweden"],
  [/норвеги(я|и|йский|йская|йское)/i, "Norway"],
  [/дани(я|и|йский|йская|йское)/i, "Denmark"],
  [/финлянди(я|и|йский|йская|йское)/i, "Finland"],
  [/швейцари(я|и|йский|йская|йское)/i, "Switzerland"],
  [/австри(я|и|йский|йская|йское)/i, "Austria"],
  [/греци(я|и|йский|йская|йское)/i, "Greece"],
  [/венгри(я|и|ерский|ерская|ерское)/i, "Hungary"],
  [/румыни(я|и|ский|ская|ское)/i, "Romania"],
  [/хорвати(я|и|йский|йская|йское)/i, "Croatia"],
  [/серби(я|и|йский|йская|йское)/i, "Serbia"],
  [/словаки(я|и|йский|йская|йское)/i, "Slovakia"],
  [/чехи(я|и|йский|йская|йское)/i, "Czech Republic"],
  [/израил(ь|я|ьский|ьская|ьское)/i, "Israel"]
];

function inferCountryFromLeague(value: string): string | null {
  return COUNTRY_FROM_LEAGUE_KEYWORDS.find(([pattern]) => pattern.test(value))?.[1] || null;
}

function splitTennisiCountryLeague(prefix: string, value: string): { country: string; league: string } {
  const parsed = splitCountryLeague(value);
  if (isSportHeaderName(prefix)) {
    if (isKnownCountry(parsed.country)) return parsed;
    const inferredCountry = inferCountryFromLeague(value);
    return inferredCountry ? { country: inferredCountry, league: value.trim() || "Tennisi" } : { country: "World", league: value.trim() || "Tennisi" };
  }

  const countryCandidate = normalizeCountryName(prefix);
  if (isKnownCountry(countryCandidate)) return { country: countryCandidate, league: value.trim() || "Tennisi" };
  return isKnownCountry(parsed.country) ? parsed : { country: "World", league: `${countryCandidate} — ${value.trim()}` };
}

function normalizeEsportsLeagueName(sport: string, league: string): string {
  if (sport !== "esports") return league;
  const value = league
    .replace(/\bbest\s+of\s*(\d+)\b/gi, "BO$1")
    .replace(/\bbo\s*(\d+)\b/gi, "BO$1")
    .replace(/\s*[-–—·:.]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bo = esportsBoFormat(value);
  const discipline = esportsDisciplineName(value);
  const tournament = normalizeEsportsTournamentName(value, discipline, bo);
  return [discipline, tournament, bo].filter(Boolean).join(" ") || value;
}

function esportsDisciplineName(value: string): string | null {
  if (/\b(league\s+of\s+legends|lol)\b/i.test(value)) return "LoL";
  if (/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(value)) return "COUNTER STRIKE 2";
  if (/\b(dota\s*2?|дота)\b/i.test(value)) return "Dota 2";
  if (/\b(call\s+of\s+duty|cod)\b/i.test(value)) return "Call of Duty";
  if (/\bvalorant\b/i.test(value)) return "Valorant";
  if (/\boverwatch\b/i.test(value)) return "Overwatch";
  if (/\brainbow\s*six\b/i.test(value)) return "Rainbow Six";
  if (/\bstarcraft\b/i.test(value)) return "StarCraft";
  return null;
}

function normalizeEsportsTournamentName(value: string, discipline: string | null, bo: string | null): string {
  let tournament = value;
  if (discipline === "LoL") tournament = tournament.replace(/\b(league\s+of\s+legends|lol)\b/gi, " ");
  if (discipline === "COUNTER STRIKE 2") {
    tournament = tournament.replace(/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/gi, " ");
  }
  if (discipline === "Dota 2") tournament = tournament.replace(/\b(dota\s*2?|дота)\b/gi, " ");
  if (discipline === "Call of Duty") tournament = tournament.replace(/\b(call\s+of\s+duty|cod)\b/gi, " ");
  if (discipline === "Valorant") tournament = tournament.replace(/\bvalorant\b/gi, " ");
  if (discipline === "Overwatch") tournament = tournament.replace(/\boverwatch\b/gi, " ");
  if (discipline === "Rainbow Six") tournament = tournament.replace(/\brainbow\s*six\b/gi, " ");
  if (discipline === "StarCraft") tournament = tournament.replace(/\bstarcraft\b/gi, " ");
  if (bo) tournament = tournament.replace(new RegExp(`\\b${bo}\\b`, "gi"), " ");
  return tournament
    .replace(/\bqualification\b/gi, " ")
    .replace(/\bквалификация\b/gi, " ")
    .replace(/\s*[-–—·:.]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\blck\b/gi, "LCK")
    .replace(/\blcs\b/gi, "LCS")
    .replace(/\blec\b/gi, "LEC")
    .trim();
}

const COUNTRY_NAME_MAP: Record<string, string> = {
  "\u0411\u0415\u041b\u0410\u0420\u0423\u0421\u042c": "Belarus", "\u0420\u041e\u0421\u0421\u0418\u042f": "Russia", "\u0423\u041a\u0420\u0410\u0418\u041d\u0410": "Ukraine",
  "\u042f\u041f\u041e\u041d\u0418\u042f": "Japan", "\u041a\u0418\u0422\u0410\u0419": "China", "\u041a\u041e\u0420\u0415\u042f": "South Korea",
  "\u0411\u0420\u0410\u0417\u0418\u041b\u0418\u042f": "Brazil", "\u0410\u0420\u0413\u0415\u041d\u0422\u0418\u041d\u0410": "Argentina", "\u041c\u0415\u041a\u0421\u0418\u041a\u0410": "Mexico",
  "\u0421\u0428\u0410": "USA", "\u041a\u0410\u041d\u0410\u0414\u0410": "Canada", "\u0410\u0412\u0421\u0422\u0420\u0410\u041b\u0418\u042f": "Australia",
  "\u0413\u0415\u0420\u041c\u0410\u041d\u0418\u042f": "Germany", "\u0424\u0420\u0410\u041d\u0426\u0418\u042f": "France", "\u0418\u0421\u041f\u0410\u041d\u0418\u042f": "Spain",
  "\u0418\u0422\u0410\u041b\u0418\u042f": "Italy", "\u041f\u041e\u041b\u042c\u0428\u0410": "Poland", "\u0422\u0423\u0420\u0426\u0418\u042f": "Turkey",
  "\u041d\u0418\u0414\u0415\u0420\u041b\u0410\u041d\u0414\u042b": "Netherlands", "\u0411\u0415\u041b\u042c\u0413\u0418\u042f": "Belgium", "\u041f\u041e\u0420\u0422\u0423\u0413\u0410\u041b\u0418\u042f": "Portugal",
  "\u0428\u0412\u0415\u0426\u0418\u042f": "Sweden", "\u041d\u041e\u0420\u0412\u0415\u0413\u0418\u042f": "Norway", "\u0414\u0410\u041d\u0418\u042f": "Denmark",
  "\u0424\u0418\u041d\u041b\u042f\u041d\u0414\u0418\u042f": "Finland", "\u0428\u0412\u0415\u0419\u0426\u0410\u0420\u0418\u042f": "Switzerland", "\u0410\u0412\u0421\u0422\u0420\u0418\u042f": "Austria",
  "\u0413\u0420\u0415\u0426\u0418\u042f": "Greece", "\u0412\u0415\u041d\u0413\u0420\u0418\u042f": "Hungary", "\u0420\u0423\u041c\u042b\u041d\u0418\u042f": "Romania",
  "\u0411\u041e\u041b\u0413\u0410\u0420\u0418\u042f": "Bulgaria", "\u0425\u041e\u0420\u0412\u0410\u0422\u0418\u042f": "Croatia", "\u0421\u0415\u0420\u0411\u0418\u042f": "Serbia",
  "\u0421\u041b\u041e\u0412\u0410\u041a\u0418\u042f": "Slovakia", "\u0427\u0415\u0425\u0418\u042f": "Czech Republic", "\u0418\u0417\u0420\u0410\u0418\u041b\u042c": "Israel",
  "\u041a\u0410\u0417\u0410\u0425\u0421\u0422\u0410\u041d": "Kazakhstan", "\u0422\u0410\u0418\u041b\u0410\u041d\u0414": "Thailand", "\u0418\u041d\u0414\u0418\u042f": "India",
  "\u0412\u042c\u0415\u0422\u041d\u0410\u041c": "Vietnam",
  "\u0411\u0423\u0422\u0410\u041d": "Bhutan",
  "\u0423\u0420\u0423\u0413\u0412\u0410\u0419": "Uruguay",
  "\u0422\u0410\u0419\u0412\u0410\u041d\u042c": "Taiwan", "\u041c\u0423\u0416\u0427\u0418\u041d\u042b": "ATP", "\u0416\u0415\u041d\u0429\u0418\u041d\u042b": "WTA",
};

function normalizeCountryName(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return COUNTRY_NAME_MAP[upper] ?? raw;
}

// Список реальных стран — всё что не входит сюда (лиги, туры, дисциплины
// вроде LoL/COUNTER STRIKE 2/ATP/UTR Pro) не считается страной и уходит в лигу.
const KNOWN_COUNTRIES = new Set([
  "russia", "england", "usa", "germany", "france", "spain", "italy", "japan",
  "brazil", "australia", "china", "south korea", "korea", "poland", "turkey",
  "ukraine", "netherlands", "belgium", "portugal", "argentina", "mexico",
  "canada", "serbia", "croatia", "czech republic", "romania", "sweden",
  "norway", "denmark", "finland", "switzerland", "austria", "greece",
  "hungary", "slovakia", "bulgaria", "israel", "kazakhstan", "belarus",
  "thailand", "india", "bhutan", "uruguay", "taiwan", "new zealand", "indonesia", "iran",
  "united arab emirates", "qatar", "chile", "colombia", "peru", "egypt",
  "morocco", "tunisia", "lithuania", "latvia", "estonia", "philippines",
  "saudi arabia", "scotland", "wales", "ireland", "slovenia",
  "bosnia and herzegovina", "north macedonia", "albania", "iceland",
  "vietnam", "malaysia", "singapore", "hong kong", "world",
]);

function isKnownCountry(name: string): boolean {
  return KNOWN_COUNTRIES.has(name.toLowerCase().trim());
}

const HOCKEY_FRIENDLY_COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/беларус|минск|лида|авиатор\s+барановичи|барановичи|брест|шахтер\s+солигорск|солигорск/i, "Belarus"],
  [/\b(кхл|khl)\b|адмирал|нефтехимик|челны|ак\s*барс|сибирь|локомотив|трактор|северсталь|салават|ска|лада|спартак|торпедо|автомобилист|динамо\s+москва|рязань|саратов/i, "Russia"]
];

function normalizeBaseballLeague(match: RawMatch): RawMatch {
  if (match.sport !== "baseball") return match;
  const full = normalizedName(`${match.country} ${match.league}`);
  const isNpbReserve = /reserve|резерв|farm|minor/.test(full)
    && /\bnpb\b|japan|япон|чемпионат японии/.test(full);
  if (isNpbReserve) {
    return { ...match, country: "Japan", league: "NPB. Резерв" };
  }
  const home = resolveKboTeam(match.home, match.homeTeamId);
  const away = resolveKboTeam(match.away, match.awayTeamId);
  if (/kbo|korea|south korea|коре|южн\s+коре|чемпионат\s+южн\s+коре/.test(full)
    || isKboMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "South Korea",
      league: "KBO",
      home: home?.name || match.home,
      away: away?.name || match.away
    };
  }
  const mlbHome = resolveMlbTeam(match.home, match.homeTeamId);
  const mlbAway = resolveMlbTeam(match.away, match.awayTeamId);
  if (isMlbMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "USA",
      league: "MLB",
      home: mlbHome?.name || match.home,
      away: mlbAway?.name || match.away
    };
  }
  const npbHome = resolveNpbTeam(match.home, match.homeTeamId);
  const npbAway = resolveNpbTeam(match.away, match.awayTeamId);
  if (isNpbMatchContext(match.country, match.league, match.home, match.away) || (npbHome && npbAway)) {
    return {
      ...match,
      country: "Japan",
      league: "NPB",
      home: npbHome?.name || match.home,
      away: npbAway?.name || match.away
    };
  }
  if (/lmb|mexico|мексик/.test(full)) {
    return { ...match, country: "Mexico", league: "LMB" };
  }
  return match;
}

function normalizeHockeyLeague(match: RawMatch): RawMatch {
  if (match.sport !== "ice-hockey") return match;

  if (/цыплаков/i.test(match.league)) {
    return {
      ...match,
      country: isWorldCountry(match.country) ? "Belarus" : match.country,
      league: "Кубок Владимира Цыплакова"
    };
  }

  if (!/товарищ|friendly/i.test(match.league)) return match;

  const nationalTeams = /сборн|national\s+team/i.test(match.league);
  const under20 = /u\s*[-.]?\s*20\b|до\s*[-.]?\s*20|20\s+лет|мол(?:одеж\w*)?/i.test(match.league);
  const leagueParts = [
    "Товарищеские матчи",
    nationalTeams ? "Сборные" : "",
    under20 ? "До 20 лет" : ""
  ].filter(Boolean);

  return { ...match, league: leagueParts.join(". ") };
}

function normalizeBasketballLeague(match: RawMatch): RawMatch {
  if (match.sport !== "basketball") return match;
  const full = normalizedName(`${match.country} ${match.league}`);
  if (/\bwnba\b/.test(full) || isWnbaMatchContext(match.country, match.league, match.home, match.away)) {
    const home = resolveWnbaTeam(match.home, match.homeTeamId);
    const away = resolveWnbaTeam(match.away, match.awayTeamId);
    return {
      ...match,
      country: "USA",
      league: "WNBA",
      home: home?.name || match.home,
      away: away?.name || match.away,
      homeTeamId: home ? wnbaTeamId(home) : match.homeTeamId,
      awayTeamId: away ? wnbaTeamId(away) : match.awayTeamId
    };
  }
  if (/vba|vietnam|вьетнам/.test(full)) {
    return { ...match, country: "Vietnam", league: "VBA" };
  }
  return match;
}

const TENNIS_VENUE_COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/(?:торонто|toronto|монреаль|montreal)/i, "Canada"],
  [/(?:вашингтон|washington)/i, "USA"]
];

function normalizeTennisLocale(match: RawMatch): RawMatch {
  if (match.sport !== "tennis") return match;
  const context = `${match.country} ${match.league}`;
  const inferredCountry = TENNIS_VENUE_COUNTRY_HINTS.find(([pattern]) => pattern.test(context))?.[1];
  return inferredCountry ? { ...match, country: inferredCountry } : match;
}

function normalizeMatchLocale(match: RawMatch): RawMatch {
  const baseballMatch = normalizeBaseballLeague(match);
  if (baseballMatch !== match) return withTeamIds(baseballMatch);
  const basketballMatch = normalizeBasketballLeague(match);
  if (basketballMatch !== match) return withTeamIds(basketballMatch);
  const tennisMatch = normalizeTennisLocale(match);
  if (tennisMatch !== match) return withTeamIds(tennisMatch);
  if (match.sport === "football" && isWorldCountry(match.country)) {
    const inferredCountry = inferFootballCountry(match.league);
    return withTeamIds({ ...match, country: inferredCountry || "World" });
  }
  const hockeyMatch = normalizeHockeyLeague(match);
  if (hockeyMatch.country !== "World" || hockeyMatch.sport !== "ice-hockey") return withTeamIds(hockeyMatch);
  if (!/товарищ|friendly/i.test(hockeyMatch.league)) return withTeamIds(hockeyMatch);

  const full = `${hockeyMatch.league} ${hockeyMatch.home} ${hockeyMatch.away}`;
  const inferred = HOCKEY_FRIENDLY_COUNTRY_HINTS.find(([pattern]) => pattern.test(full))?.[1];
  return withTeamIds(inferred ? { ...hockeyMatch, country: inferred } : hockeyMatch);
}

function extractCountryAndLeague(data: PariLikeData, item: PariLikeEvent): { country: string; league: string } {
  const sports = asArray(data.sports);
  const byId = new Map<number, PariLikeEvent>(sports.map((s) => [asNumber(s.id), s]));

  let current = byId.get(asNumber(item.sportId));
  const guard = new Set<number>();
  const chain: PariLikeEvent[] = [];

  while (current && !guard.has(asNumber(current.id))) {
    guard.add(asNumber(current.id));
    chain.push(current);
    current = byId.get(asNumber(current.parentId ?? asArray(current.parentIds)[0] ?? current.sportId));
  }

  const nonSport = chain.filter((n) => n.kind !== "sport" && n.name);

  if (nonSport.length >= 2) {
    const league = asString(nonSport[0].name);
    const countryCandidate = normalizeCountryName(asString(nonSport[1].name));
    if (isKnownCountry(countryCandidate)) {
      return { country: countryCandidate, league };
    }
    // Не страна (например LoL, ATP, COUNTER STRIKE 2, UTR Pro) — переносим в лигу
    return { country: "World", league: `${countryCandidate} — ${league}` };
  }
  if (nonSport.length === 1) {
    const result = splitCountryLeague(asString(nonSport[0].name));
    if (!isKnownCountry(result.country)) {
      return { country: "World", league: asString(nonSport[0].name) };
    }
    return result;
  }
  const rawLeague = asString(chain.find((n) => n.kind !== "sport" && n.name)?.name || "World");
  const fallback = splitCountryLeague(rawLeague);
  if (!isKnownCountry(fallback.country)) {
    return { country: "World", league: rawLeague };
  }
  return fallback;
}

function factorOdd(factors: PariLikeEvent[], id: number): number | null {
  const row = factors.find((factor) => asNumber(factor.f) === id);
  return decimalOdd(row?.v);
}

// Снимаем маржу букмекера (vig) с коэффициентов и получаем реальную
// вероятность каждого исхода. Это базовый, но честный сигнал —
// букмекерская линия уже аккумулирует огромный объём информации
// (составы, травмы, форма), которую мы не можем добыть напрямую.
function analyzeOdds(odds: BookmakerOdds): Analysis {
  const rawHome = 1 / odds.home;
  const rawAway = 1 / odds.away;
  const rawDraw = odds.draw ? 1 / odds.draw : 0;
  const overround = rawHome + rawAway + rawDraw;

  const pHome = rawHome / overround;
  const pAway = rawAway / overround;
  const pDraw = rawDraw / overround;

  let side: "home" | "draw" | "away" = "home";
  let prob = pHome;
  if (pAway > prob) { side = "away"; prob = pAway; }
  if (pDraw > prob) { side = "draw"; prob = pDraw; }

  return {
    confidence: Math.round(Math.min(96, Math.max(4, prob * 100))),
    recommendationSide: side
  };
}

function formatOdds(odds: BookmakerOdds): string[] {
  return [odds.home, odds.draw, odds.away].map((odd) => odd ? odd.toFixed(2) : "-");
}

function bestOddsFromBookmakers(bookmakerOdds: Partial<Record<BookmakerKey, BookmakerOdds>>): BookmakerOdds {
  const values = Object.values(bookmakerOdds);
  const home = Math.max(...values.map((odds) => odds.home));
  const away = Math.max(...values.map((odds) => odds.away));
  const drawValues = values.map((odds) => odds.draw || 0).filter(Boolean);
  return {
    bookmaker: "Лучшие",
    home,
    away,
    draw: drawValues.length ? Math.max(...drawValues) : null
  };
}

function bestBookmakersByOutcome(bookmakerOdds: Partial<Record<BookmakerKey, BookmakerOdds>>, best: BookmakerOdds): string[] {
  const values = Object.values(bookmakerOdds);
  const findLabel = (side: "home" | "draw" | "away", bestValue: number | null) => {
    if (!bestValue) return "";
    const found = values.find((odds) => Math.abs(((side === "draw" ? odds.draw : odds[side]) || 0) - bestValue) < 0.001);
    return found?.bookmaker || "";
  };

  return [
    findLabel("home", best.home),
    findLabel("draw", best.draw),
    findLabel("away", best.away)
  ];
}

function mainOdds(factors: PariLikeEvent[], sport: string, bookmaker: string): BookmakerOdds | null {
  const home = factorOdd(factors, 921);
  const rawDraw = factorOdd(factors, 922);
  const away = factorOdd(factors, 923);
  if (!home || !away) return null;
  const canDraw = ["football", "ice-hockey", "handball"].includes(sport);
  return { home, away, draw: canDraw ? rawDraw : null, bookmaker };
}

async function fetchJson(
  url: string,
  timeoutMs = BOOKMAKER_REQUEST_TIMEOUT_MS,
  controller = new AbortController()
): Promise<PariLikeData> {
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

function fromBookmakerEvent(data: PariLikeData, item: PariLikeEvent, factorMap: Map<string, PariLikeEvent>, source: "pari" | "fonbet" | "tennisi"): RawMatch | null {
  const sport = normalizeSport(sportAlias(data, item.sportId));
  if (!SPORTS.includes(sport as (typeof SPORTS)[number])) return null;
  const home = asString(item.team1 || item.teamHome || (item.homeTeam as PariLikeEvent | undefined)?.name).trim();
  const away = asString(item.team2 || item.teamAway || (item.awayTeam as PariLikeEvent | undefined)?.name).trim();
  if (!home || !away) return null;
  if (/^(хозяева|гости|home|away)$/i.test(home) || /^(хозяева|гости|home|away)$/i.test(away)) return null;
  const factors = asArray(factorMap.get(asString(item.id))?.factors);
  const odds = mainOdds(factors, sport, source === "pari" ? "PARI" : source === "fonbet" ? "Фонбет" : "Tennisi");
  if (!odds) return null;
  const startMs = startMsFrom(item.startTime, item.startTimestamp, item.timestamp);
  if (!startMs) return null;
  const locale = extractCountryAndLeague(data, item);
  const analysis = analyzeOdds(odds);
  return {
    id: `${source}-${asString(item.id)}`,
    sport,
    country: locale.country,
    league: normalizeEsportsLeagueName(sport, locale.league),
    home,
    away,
    startMs,
    startsAt: new Date(startMs).toISOString(),
    confidence: analysis.confidence,
    recommendationSide: analysis.recommendationSide,
    odds,
    bookmakerOdds: { [source]: odds }
  };
}

async function fetchPariLike(urls: string[], source: "pari" | "fonbet" | "tennisi"): Promise<RawMatch[]> {
  const errors: string[] = [];
  const controllers = urls.map(() => new AbortController());
  const requests = urls.map(async (url, index) => {
    try {
      const data = await fetchJson(url, BOOKMAKER_REQUEST_TIMEOUT_MS, controllers[index]);
      const factorMap = new Map<string, PariLikeEvent>(asArray(data.customFactors).map((row) => [asString(row.e), row]));
      const matches: RawMatch[] = [];
      for (const item of asArray(data.events)) {
        if (item.level !== 1 || item.place === "live") continue;
        try {
          const match = fromBookmakerEvent(data, item, factorMap, source);
          if (match) matches.push(match);
        } catch (error) {
          console.warn("[matches] skipped malformed bookmaker event", source, asString(item.id), error);
        }
      }
      if (!matches.length) throw new Error(`empty ${url}`);
      return matches;
    } catch (error) {
      const message = `${source}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      throw new Error(message);
    }
  });

  try {
    return await Promise.any(requests);
  } catch {
    console.warn("[matches] bookmaker source failed", errors.slice(0, 3));
    return [];
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}

async function fetchTennisiCategory(category: { categoryId: number; path: string; sport: string }, depth = 0): Promise<RawMatch[]> {
  const errors: string[] = [];
  for (const endpoint of TENNISI_ENDPOINTS) {
    const url = endpoint.buildUrl(category);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BOOKMAKER_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { ...REQUEST_HEADERS, referer: `${endpoint.baseUrl}/sport/${category.path}` },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = new TextDecoder("windows-1251").decode(await response.arrayBuffer());
      const rootMatches = parseTennisiHtml(html, category.sport, endpoint.gameId === 18 ? 5 : 3);
      if (category.sport !== "baseball" || depth >= 1 || endpoint.gameId !== 5) return rootMatches;

      const childCategories = tennisiChildCategories(html, category);
      if (!childCategories.length) return rootMatches;

      const childResults = await Promise.allSettled(childCategories.map(child => fetchTennisiCategory(child, depth + 1)));
      const childMatches = childResults.flatMap(result => result.status === "fulfilled" ? result.value : []);
      return [...rootMatches, ...childMatches];
    } catch (error) {
      errors.push(`${endpoint.baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Tennisi ${category.path}: ${errors.join("; ")}`);
}

function tennisiChildCategories(html: string, parent: { categoryId: number; path: string; sport: string }): { categoryId: number; path: string; sport: string }[] {
  const found = new Map<number, { categoryId: number; path: string; sport: string }>();
  const anchors = html.match(/<a\b[\s\S]*?<\/a>/gi) || [];
  for (const anchor of anchors) {
    const text = stripTags(anchor);
    const context = normalizedName(`${anchor} ${text}`);
    if (!/\bnpb\b|japan|япон/.test(context)) continue;
    const categoryId = Number(anchor.match(/categoryid=(\d+)/i)?.[1] || anchor.match(/categoryid['"]?\s*[:=]\s*['"]?(\d+)/i)?.[1] || 0);
    if (!categoryId || categoryId === parent.categoryId || found.has(categoryId)) continue;
    const path = decodeHtml(anchor.match(/mcmdparam=([^"'&\s>]+)/i)?.[1] || parent.path);
    found.set(categoryId, { categoryId, path, sport: parent.sport });
  }
  return Array.from(found.values()).slice(0, 6);
}

function parseTennisiHtml(html: string, sport: string, utcOffsetHours = 3): RawMatch[] {
  const serverDate = html.match(/server_time">(\d{1,2})\s+([А-ЯЁ]+)\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/i);
  const baseDay = serverDate ? Number(serverDate[1]) : new Date().getUTCDate();
  const baseMonth = serverDate ? TENNISI_MONTH_NAMES[serverDate[2].toUpperCase()] ?? new Date().getUTCMonth() : new Date().getUTCMonth();
  const baseYear = serverDate ? Number(serverDate[3]) : new Date().getUTCFullYear();
  const serverMinutes = serverDate?.[4] && serverDate?.[5]
    ? Number(serverDate[4]) * 60 + Number(serverDate[5])
    : null;
  const matches: RawMatch[] = [];
  let league = "Tennisi";
  let country = "World";
  let columns: string[] = [];
  let dayOffset = 0;
  let dateHeader = "";

  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const rowHtml = row[0];
    const headerText = stripTags(rowHtml);
    const leagueMatch = headerText.match(/^(.+?)\s*::\s*(.+)$/);
    if (leagueMatch) {
      const locale = splitTennisiCountryLeague(leagueMatch[1], leagueMatch[2]);
      country = locale.country;
      league = normalizeEsportsLeagueName(sport, locale.league);
      columns = [];
      continue;
    }
    if (/^Сегодня$/i.test(headerText)) {
      dayOffset = 0;
      dateHeader = "";
      continue;
    }
    if (/^Завтра$/i.test(headerText)) {
      dayOffset = 1;
      dateHeader = "";
      continue;
    }
    if (/^\d{1,2}\s+[А-ЯЁ]+(?:\s+\d{4})?$/i.test(headerText)) {
      dayOffset = 0;
      dateHeader = headerText;
      continue;
    }

    const headerCells = [...rowHtml.matchAll(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi)].map((cell) => stripTags(cell[0]));
    if (headerCells.includes("Событие") && headerCells.some((cell) => /П\s*1|П1/i.test(cell)) && headerCells.some((cell) => /П\s*2|П2/i.test(cell))) {
      columns = headerCells.slice(headerCells.findIndex((cell) => cell === "Событие") + 1);
      continue;
    }

    if (!/id="el\d+"/i.test(rowHtml) || !columns.length) continue;
    const cells = [...rowHtml.matchAll(/<td\b[\s\S]*?<\/td>/gi)].map((cell) => cell[0]);
    if (cells.length < 5) continue;

    const dateText = `${dateHeader} ${stripTags(cells[1])}`.trim();
    const time = dateText.match(/\d{1,2}:\d{2}/)?.[0];
    const teams = splitTeams(cells[2]);
    if (!time || !teams) continue;

    const [home, away] = teams;
    const oddsCells = cells.slice(3);
    let homeOdd: number | null = null;
    let drawOdd: number | null = null;
    let awayOdd: number | null = null;

    columns.forEach((column, index) => {
      const odd = decimalOdd(stripTags(oddsCells[index] || ""));
      if (!odd) return;
      if (/^x$|^х$/i.test(column)) drawOdd = odd;
      else if (/П\s*1|П1/i.test(column)) homeOdd = odd;
      else if (/П\s*2|П2/i.test(column)) awayOdd = odd;
    });

    if (!homeOdd || !awayOdd) continue;
    const [eventHour, eventMinute] = time.split(":").map(Number);
    const eventMinutes = eventHour * 60 + eventMinute;
    const overnightOffset = !dateHeader && dayOffset === 0 && serverMinutes !== null && eventMinutes < serverMinutes ? 1 : 0;
    const startMs = parseTennisiStartMs(dateText, baseYear, baseMonth, baseDay, dayOffset + overnightOffset, utcOffsetHours);
    if (!startMs) continue;
    const odds: BookmakerOdds = {
      bookmaker: "Tennisi",
      home: homeOdd,
      away: awayOdd,
      draw: ["football", "ice-hockey", "handball"].includes(sport) ? drawOdd : null
    };
    const analysis = analyzeOdds(odds);
    const eventId = rowHtml.match(/id="el(\d+)"/i)?.[1] || `${home}-${away}-${time}`;

    matches.push({
      id: `tennisi-${eventId}`,
      sport,
      country,
      league,
      home,
      away,
      startMs,
      startsAt: new Date(startMs).toISOString(),
      confidence: analysis.confidence,
      recommendationSide: analysis.recommendationSide,
      odds,
      bookmakerOdds: { tennisi: odds }
    });
  }

  return matches;
}

async function fetchTennisiMatches(): Promise<RawMatch[]> {
  const settled = await Promise.allSettled(TENNISI_CATEGORIES.map(fetchTennisiCategory));
  settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .forEach((result) => console.warn("[matches] tennisi source failed", result.reason));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(fc|fk|bc|hc|cf|sc|club|w|women|u\d+)\b|(^|\s)(хк|фк|бк)(?=\s)/g, " ")
    .replace(/\bматч\s+в\s+[a-zа-я0-9]+\b/gi, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function displayTeamName(match: RawMatch, value: string): string {
  if (match.sport === "basketball" && isWnbaMatchContext(match.country, match.league, match.home, match.away)) {
    return resolveWnbaTeam(value)?.name || value;
  }
  if (match.sport !== "baseball") return value;
  const kboTeam = resolveKboTeam(value);
  if (kboTeam && isKboMatchContext(match.country, match.league, match.home, match.away)) return kboTeam.name;
  const mlbTeam = resolveMlbTeam(value);
  if (mlbTeam && isMlbMatchContext(match.country, match.league, match.home, match.away)) return mlbTeam.name;
  const npbTeam = resolveNpbTeam(value);
  if (npbTeam && isNpbMatchContext(match.country, match.league, match.home, match.away)) return npbTeam.name;
  return value;
}

function normalizeEsportsParticipantAlias(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\bs\b/g, " ")
    .replace(/\b(team|vivo|academy|академия|challengers?|esports?|киберспорт)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(bcg|bc\s+(?:game|gaming))$/.test(cleaned)) return "bcg";
  if (/^keyd(?:\s+stars)?$/.test(cleaned)) return "keyd";
  if (/^life(?:\s+s)?\s+a\s+game$/.test(cleaned)) return "lag";
  if (/^solid$/.test(cleaned)) return "solid";
  return cleaned;
}

function esportsDisciplineId(match: Pick<RawMatch, "league">): string {
  if (/\b(league\s+of\s+legends|lol)\b/i.test(match.league)) return "lol";
  if (/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(match.league)) return "cs";
  if (/\b(dota\s*2?|дота)\b/i.test(match.league)) return "dota";
  if (/\bvalorant\b/i.test(match.league)) return "valorant";
  return "esports";
}

function esportsTeamId(match: Pick<RawMatch, "league">, value: string): string {
  if (esportsDisciplineId(match) === "cs") return counterStrikeTeamId(value);
  const slug = normalizeEsportsParticipantAlias(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";
  return `${esportsDisciplineId(match)}.${slug}`;
}

function participantAcronym(value: string): string {
  const tokens = value
    .split(" ")
    .filter(Boolean)
    .filter((part) => !["team", "club", "academy", "challenger", "challengers", "gaming", "esports", "киберспорт"].includes(part));
  if (tokens.length < 2) return "";
  return tokens.map((part) => part[0]).join("");
}

function normalizeFootballParticipantAlias(value: string): string {
  const tokens = value
    .replace(/[э]/g, "е")
    .replace(/[й]/g, "и")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => !["атлетик", "athletic", "сити", "city", "клуб", "club"].includes(part));
  const cleaned = tokens.join(" ");
  if (/^(вс|в с)\s+уондерерс(?:\s|$)/.test(cleaned)) return "вестерн сидней уондерерс";
  if (/^ws\s+wanderers(?:\s|$)/.test(cleaned)) return "western sydney wanderers";
  if (/^реил[ув]еи(?:\s|$)/.test(cleaned)) return "реилвеи";
  return cleaned;
}

function normalizedMatchParticipant(match: RawMatch, value: string): string {
  if (match.sport === "basketball" && isWnbaMatchContext(match.country, match.league, match.home, match.away)) {
    return resolveWnbaTeam(value)?.id || normalizedName(value);
  }
  if (match.sport === "baseball") {
    const normalized = normalizedName(displayTeamName(match, value)).replace(/\bde\b/g, " ").replace(/\s+/g, " ").trim();
    return BASEBALL_TEAM_ID_BY_ALIAS.get(normalized) || normalized;
  }
  if (match.sport === "esports") return normalizeEsportsParticipantAlias(value);
  const normalized = normalizedName(value);
  if (match.sport === "football") return normalizeFootballParticipantAlias(normalized);
  if (match.sport !== "tennis") return normalized;

  return normalized
    .split(" ")
    .filter((part, index, parts) => part.length > 1 || index === 0 || parts.length === 1)
    .join(" ");
}

function canonicalTeamId(match: RawMatch, value: string): string {
  const wnbaTeam = match.sport === "basketball" ? resolveWnbaTeam(value) : null;
  if (wnbaTeam && isWnbaMatchContext(match.country, match.league, match.home, match.away)) return wnbaTeamId(wnbaTeam);
  const kboTeam = match.sport === "baseball" ? resolveKboTeam(value) : null;
  if (kboTeam && isKboMatchContext(match.country, match.league, match.home, match.away)) return kboTeamId(kboTeam);
  const mlbTeam = match.sport === "baseball" ? resolveMlbTeam(value) : null;
  if (mlbTeam && isMlbMatchContext(match.country, match.league, match.home, match.away)) return mlbTeamId(mlbTeam);
  const npbTeam = match.sport === "baseball" ? resolveNpbTeam(value) : null;
  if (npbTeam && isNpbMatchContext(match.country, match.league, match.home, match.away)) return npbTeamId(npbTeam);
  if (match.sport === "esports") return esportsTeamId(match, value);
  const participant = normalizedMatchParticipant(match, value);
  return [match.sport, match.country, match.league, participant]
    .map(part => normalizedName(part))
    .filter(Boolean)
    .join(":");
}

function withTeamIds(match: RawMatch): RawMatch {
  if (match.sport === "tennis" && match.homePlayers?.length && match.awayPlayers?.length) {
    const sideId = (players: TennisParticipant[]) => players
      .map(player => player.id)
      .sort()
      .join("+");
    return {
      ...match,
      homeTeamId: `tennis-side:${sideId(match.homePlayers)}`,
      awayTeamId: `tennis-side:${sideId(match.awayPlayers)}`
    };
  }
  return {
    ...match,
    homeTeamId: canonicalTeamId(match, match.home),
    awayTeamId: canonicalTeamId(match, match.away)
  };
}

function compactParticipantName(match: RawMatch, value: string): string {
  const normalized = normalizedMatchParticipant(match, value);
  if (match.sport === "esports") return normalized;
  const parts = normalized.split(" ").filter(Boolean);
  const primary = match.sport === "tennis" ? parts.find(part => part.length > 1) || parts[0] || normalized : normalized;
  return primary.replace(/[aeiouаеёиоуыэюяьъ]/g, "") || primary;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function areSimilarParticipants(a: string, b: string, useAcronym = false): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength < 4) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (useAcronym) {
    const longerAcronym = participantAcronym(longer);
    const shorterAcronym = participantAcronym(shorter);
    if ((longerAcronym.length >= 2 && longerAcronym === shorter) || (shorterAcronym.length >= 2 && shorterAcronym === longer)) return true;
  }
  if (shorter.length >= 3 && longer.split(" ").includes(shorter)) return true;
  return editDistance(a, b) <= Math.max(1, Math.floor(maxLength * 0.34));
}

function compactTennisPlayerName(player: TennisParticipant): string {
  const words = normalizedName(player.sourceName || player.name)
    .split(" ")
    .filter(word => word.length > 1);
  const value = words.join(" ") || normalizedName(player.sourceName || player.name);
  return value.replace(/[aeiouаеёиоуыэюяьъ]/g, "") || value;
}

function sameTennisPlayer(left: TennisParticipant, right: TennisParticipant): boolean {
  const leftRanked = left.rank !== null && !left.id.startsWith("tennis:unranked:");
  const rightRanked = right.rank !== null && !right.id.startsWith("tennis:unranked:");
  if (leftRanked && rightRanked) return left.id === right.id;
  return areSimilarParticipants(compactTennisPlayerName(left), compactTennisPlayerName(right));
}

function sameTennisSide(left: TennisParticipant[] | undefined, right: TennisParticipant[] | undefined): boolean {
  if (!left?.length || !right?.length || left.length !== right.length) return false;
  const unmatched = [...right];
  return left.every(player => {
    const index = unmatched.findIndex(candidate => sameTennisPlayer(player, candidate));
    if (index < 0) return false;
    unmatched.splice(index, 1);
    return true;
  });
}

function sameParticipants(left: RawMatch, right: RawMatch): boolean {
  if (left.sport === "tennis" && right.sport === "tennis") {
    return (sameTennisSide(left.homePlayers, right.homePlayers) && sameTennisSide(left.awayPlayers, right.awayPlayers))
      || (sameTennisSide(left.homePlayers, right.awayPlayers) && sameTennisSide(left.awayPlayers, right.homePlayers));
  }

  if (left.homeTeamId && left.awayTeamId && right.homeTeamId && right.awayTeamId) {
    const exactTeams = (left.homeTeamId === right.homeTeamId && left.awayTeamId === right.awayTeamId)
      || (left.homeTeamId === right.awayTeamId && left.awayTeamId === right.homeTeamId);
    if (left.sport === "esports" || right.sport === "esports") return exactTeams;
    const supportsNameFallback = ["baseball", "basketball", "football", "esports", "ice-hockey"].includes(left.sport)
      && ["baseball", "basketball", "football", "esports", "ice-hockey"].includes(right.sport);
    if (exactTeams || !supportsNameFallback) return exactTeams;
  }

  const leftHome = compactParticipantName(left, left.home);
  const leftAway = compactParticipantName(left, left.away);
  const rightHome = compactParticipantName(right, right.home);
  const rightAway = compactParticipantName(right, right.away);
  const useAcronym = left.sport === "esports" || right.sport === "esports";

  return (areSimilarParticipants(leftHome, rightHome, useAcronym) && areSimilarParticipants(leftAway, rightAway, useAcronym))
    || (areSimilarParticipants(leftHome, rightAway, useAcronym) && areSimilarParticipants(leftAway, rightHome, useAcronym));
}

function isCounterStrikeRawMatch(match: Pick<RawMatch, "sport" | "league">): boolean {
  return match.sport === "esports" && /\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(match.league);
}

function hltvMatchFits(match: RawMatch, hltv: HltvUpcomingMatch): boolean {
  if (!hltv.startsAt || Math.abs(match.startMs - hltv.startsAt) > 90 * 60 * 1000) return false;
  return (areHltvTeamNamesSimilar(match.home, hltv.home) && areHltvTeamNamesSimilar(match.away, hltv.away))
    || (areHltvTeamNamesSimilar(match.home, hltv.away) && areHltvTeamNamesSimilar(match.away, hltv.home));
}

function hltvMatchReversed(match: RawMatch, hltv: HltvUpcomingMatch): boolean {
  return areHltvTeamNamesSimilar(match.home, hltv.away) && areHltvTeamNamesSimilar(match.away, hltv.home);
}

function withHltvContext(match: RawMatch, hltvMatches: HltvUpcomingMatch[]): RawMatch {
  if (!isCounterStrikeRawMatch(match)) return match;
  const hltv = hltvMatches.find(candidate => hltvMatchFits(match, candidate));
  if (!hltv) return match;
  const reversed = hltvMatchReversed(match, hltv);
  const format = hltv.format || esportsBoFormat(match.league) || undefined;
  const venue = hltv.venue;
  const event = hltv.event || "";
  const league = ["COUNTER STRIKE 2", event, format, venue].filter(Boolean).join(" ");
  const home = reversed ? hltv.away : hltv.home;
  const away = reversed ? hltv.home : hltv.away;

  return {
    ...match,
    country: "World",
    league,
    home,
    away,
    homeTeamId: counterStrikeTeamId(home),
    awayTeamId: counterStrikeTeamId(away),
    hltvMatchId: hltv.id,
    hltvMatchUrl: hltv.detailUrl,
    hltvEventUrl: hltv.eventUrl,
    hltvEvent: event || undefined,
    esportsMatchFormat: format,
    esportsMatchVenue: venue,
    homeHltvWorldRank: reversed ? hltv.awayWorldRank : hltv.homeWorldRank,
    awayHltvWorldRank: reversed ? hltv.homeWorldRank : hltv.awayWorldRank,
    homeValveRank: reversed ? hltv.awayValveRank : hltv.homeValveRank,
    awayValveRank: reversed ? hltv.homeValveRank : hltv.awayValveRank,
    homeHltvForm: reversed ? hltv.awayForm : hltv.homeForm,
    awayHltvForm: reversed ? hltv.homeForm : hltv.awayForm,
    homeHltvProfileUrl: reversed ? hltv.awayProfileUrl : hltv.homeProfileUrl,
    awayHltvProfileUrl: reversed ? hltv.homeProfileUrl : hltv.awayProfileUrl
  };
}

function dedupeKey(match: RawMatch): string {
  const bucket = Math.round(match.startMs / (15 * 60 * 1000));
  const teams = participantIdPair(match);
  if (match.sport === "esports") return `${match.sport}|${bucket}|${esportsDisciplineId(match)}|${teams}`;
  return `${match.sport}|${bucket}|${normalizedName(match.country)}|${normalizedName(match.league)}|${teams}`;
}

function participantIdPair(match: RawMatch): string {
  return [match.homeTeamId || canonicalTeamId(match, match.home), match.awayTeamId || canonicalTeamId(match, match.away)].sort().join("~");
}

function mergeTimeToleranceMs(sport: string): number {
  if (sport === "football") return 3 * 60 * 60 * 1000;
  if (sport === "baseball" || sport === "basketball") return 90 * 60 * 1000;
  if (sport === "esports") return 90 * 60 * 1000;
  return sport === "tennis" ? 90 * 60 * 1000 : 45 * 60 * 1000;
}

function esportsBoFormat(value: string): string | null {
  const match = value.match(/\b(?:bo|best\s+of)\s*(\d+)\b/i);
  return match ? `BO${match[1]}` : null;
}

function mergedLeagueName(current: RawMatch, match: RawMatch): string {
  if (current.sport === "tennis") {
    const detailScore = (value: string) => (value.match(/\d+/g)?.length || 0) * 10 + value.split("·").length;
    return detailScore(match.league) > detailScore(current.league) ? match.league : current.league;
  }
  if (current.sport === "esports") {
    const currentBo = esportsBoFormat(current.league);
    const nextBo = esportsBoFormat(match.league);
    if (!currentBo && nextBo) return match.league;
    if (currentBo && !new RegExp(`\\b${currentBo}\\b`, "i").test(current.league)) {
      return `${current.league}. ${currentBo}`;
    }
  }
  return current.league !== "World" ? current.league : match.league;
}

function findMergeKey(byKey: Map<string, RawMatch>, match: RawMatch): string | null {
  const exactKey = dedupeKey(match);
  if (byKey.has(exactKey)) return exactKey;

  for (const [key, current] of byKey) {
    if (current.sport !== match.sport) continue;
    if (Math.abs(current.startMs - match.startMs) > mergeTimeToleranceMs(match.sport)) continue;
    if (match.sport === "esports" && participantIdPair(current) === participantIdPair(match)) return key;
    if (match.sport === "baseball" && participantIdPair(current) === participantIdPair(match)) return key;
    if (sameParticipants(current, match)) return key;
  }

  return null;
}

function participantsAreReversed(left: RawMatch, right: RawMatch): boolean {
  return Boolean(left.homeTeamId && left.awayTeamId && right.homeTeamId && right.awayTeamId
    && left.homeTeamId === right.awayTeamId
    && left.awayTeamId === right.homeTeamId);
}

function flipBookmakerOdds(odds: BookmakerOdds): BookmakerOdds {
  return {
    ...odds,
    home: odds.away,
    away: odds.home
  };
}

function alignBookmakerOdds(current: RawMatch, match: RawMatch): Partial<Record<BookmakerKey, BookmakerOdds>> {
  if (!participantsAreReversed(current, match)) return match.bookmakerOdds;
  return Object.fromEntries(
    Object.entries(match.bookmakerOdds).map(([bookmaker, odds]) => [bookmaker, flipBookmakerOdds(odds)])
  ) as Partial<Record<BookmakerKey, BookmakerOdds>>;
}

function shouldDropMatch(match: RawMatch): boolean {
  const full = `${match.country} ${match.league} ${match.home} ${match.away}`.toLowerCase();
  if (match.sport !== "esports" && /(fc\s*\d{2}|fifa|efootball|h2h|cyber|virtual|simulation|simulator|synthetic|синтет|2x4|2\s*x\s*4|mins?|liga-?\d|division-?\d|nhl\s*\d|nba\s*\d)/i.test(full)) return true;
  // Симулированные "Лига Про" турниры России/Беларуси — исключаем для всех видов спорта
  if (/(liga pro|лига про|pro league)/i.test(full)) return true;
  // Команды с суффиксом "-Про" в названии (например "Тверь-про") - тот же формат
  // симулированных матчей, встречается и без явного "Лига Про" в названии турнира.
  if (/[\s-]про(?:[\s-]|$)/i.test(`${match.home} ${match.away}`.toLowerCase())) return true;
  if (match.sport === "ice-hockey" && /(magnitka|магнитка|cyber|esport|virtual|simulation|3x3|3x4|4x4|3 на 3|3 на 4|4 на 4|nhl \d|лига про|liga pro)/i.test(full)) return true;
  if (match.sport === "basketball" && /3\s*(?:x|х|×|на)\s*3/i.test(full)) return true;
  if (match.sport === "esports" && /(fc\s*\d{2}|fifa|efootball|nhl\s*\d|nba\s*\d|h2h.*liga|liga.*h2h|h2h.*2x4|2x4.*h2h|2x4|2\s*x\s*4|h2h.*2x2|2x2.*h2h|2x2|2\s*x\s*2)/i.test(full)) return true;
  if (match.sport === "tennis" && /(double faults|aces|statistics|stats|двойн.*ошиб|эйс|статист)/i.test(full)) return true;
  if (match.sport === "volleyball" && /(russia|россия).*(amateur|любительск)|(?:amateur|любительск).*(russia|россия)/i.test(full)) return true;
  if (match.sport === "volleyball" && /(belarus|беларус).*(minsk league|лига минска)|(?:minsk league|лига минска).*(belarus|беларус)/i.test(full)) return true;
  if (match.sport === "volleyball" && /(belarus|беларус).*(amateur|любительск)|(?:amateur|любительск).*(belarus|беларус)/i.test(full)) return true;
  if (match.sport === "baseball" && /(basketball|баскет|nba|euroleague|баскетбол)/i.test(full)) return true;
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
      recommendationSide: "home",
      odds: {
        bookmaker: "featured",
        home: 1.58,
        away: 2.46,
        draw: null
      },
      bookmakerOdds: {
        featured: {
          bookmaker: "featured",
          home: 1.58,
          away: 2.46,
          draw: null
        }
      }
    }
  ];
}

function mergeMatches(matches: RawMatch[]): RawMatch[] {
  const byKey = new Map<string, RawMatch>();
  for (const rawMatch of matches) {
    try {
      const match = normalizeMatchLocale(rawMatch);
      if (shouldDropMatch(match)) continue;
      const key = findMergeKey(byKey, match) || dedupeKey(match);
      const current = byKey.get(key);
      if (!current) {
        byKey.set(key, match);
        continue;
      }
      const bookmakerOdds = { ...current.bookmakerOdds, ...alignBookmakerOdds(current, match) };
      const odds = bestOddsFromBookmakers(bookmakerOdds);
      byKey.set(key, {
        ...current,
        id: `${current.id}+${match.id}`,
        country: current.country !== "World" ? current.country : match.country,
        league: mergedLeagueName(current, match),
        home: displayTeamName(current, /[а-яё]/i.test(current.home) ? current.home : match.home),
        away: displayTeamName(current, /[а-яё]/i.test(current.away) ? current.away : match.away),
        hltvMatchId: current.hltvMatchId || match.hltvMatchId,
        hltvMatchUrl: current.hltvMatchUrl || match.hltvMatchUrl,
        hltvEventUrl: current.hltvEventUrl || match.hltvEventUrl,
        hltvEvent: current.hltvEvent || match.hltvEvent,
        esportsMatchFormat: current.esportsMatchFormat || match.esportsMatchFormat,
        esportsMatchVenue: current.esportsMatchVenue || match.esportsMatchVenue,
        homeHltvWorldRank: current.homeHltvWorldRank || match.homeHltvWorldRank,
        awayHltvWorldRank: current.awayHltvWorldRank || match.awayHltvWorldRank,
        homeValveRank: current.homeValveRank || match.homeValveRank,
        awayValveRank: current.awayValveRank || match.awayValveRank,
        homeHltvForm: current.homeHltvForm || match.homeHltvForm,
        awayHltvForm: current.awayHltvForm || match.awayHltvForm,
        homeHltvProfileUrl: current.homeHltvProfileUrl || match.homeHltvProfileUrl,
        awayHltvProfileUrl: current.awayHltvProfileUrl || match.awayHltvProfileUrl,
        bookmakerOdds,
        odds
      });
    } catch (error) {
      console.warn("[matches] skipped malformed match during merge", rawMatch.id, error);
    }
  }
  // Пересчитываем анализ по итоговым (объединённым) коэффициентам —
  // после merge odds могли обновиться (взяли лучшую котировку из двух букмекеров).
  return Array.from(byKey.values())
    .map((match) => {
      const analysis = analyzeOdds(match.odds);
      return { ...match, confidence: analysis.confidence, recommendationSide: analysis.recommendationSide };
    })
    .sort((a, b) => a.startMs - b.startMs);
}

function toApiMatch(match: RawMatch): ApiMatch {
  const bookmakerOdds = Object.fromEntries(
    Object.entries(match.bookmakerOdds).map(([bookmaker, odds]) => [bookmaker, formatOdds(odds)])
  ) as Partial<Record<BookmakerKey, string[]>>;
  const odds = formatOdds(match.odds);
  return {
    id: match.id,
    sport: match.sport,
    country: match.country,
    league: match.league,
    home: displayTeamName(match, match.home),
    away: displayTeamName(match, match.away),
    odds,
    bookmakerOdds,
    bestBookmakers: bestBookmakersByOutcome(match.bookmakerOdds, match.odds),
    confidence: match.confidence,
    recommendationSide: match.recommendationSide,
    startsAt: match.startsAt,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    tennisTour: match.tennisTour,
    homePlayers: match.homePlayers,
    awayPlayers: match.awayPlayers,
    hltvMatchId: match.hltvMatchId,
    hltvMatchUrl: match.hltvMatchUrl,
    hltvEventUrl: match.hltvEventUrl,
    esportsMatchFormat: match.esportsMatchFormat,
    esportsMatchVenue: match.esportsMatchVenue,
    hltvEvent: match.hltvEvent,
    homeHltvWorldRank: match.homeHltvWorldRank,
    awayHltvWorldRank: match.awayHltvWorldRank,
    homeValveRank: match.homeValveRank,
    awayValveRank: match.awayValveRank,
    homeHltvForm: match.homeHltvForm,
    awayHltvForm: match.awayHltvForm,
    homeHltvProfileUrl: match.homeHltvProfileUrl,
    awayHltvProfileUrl: match.awayHltvProfileUrl
  };
}

function tennisTourForMatch(match: RawMatch): TennisTour {
  const context = `${match.country} ${match.league} ${match.home} ${match.away}`;
  const isWomen = /\bwta\b|\bwomen(?:'s)?\b|\bwoman\b|\bladies\b|\bfemale\b|\bgirls?\b|женщ|девуш|девоч|\(ж\)/i.test(context);
  return isWomen ? "WTA" : "ATP";
}

function tennisVenueName(value: string): string {
  const normalized = normalizedName(value);
  const translations: Record<string, string> = {
    washington: "Вашингтон",
    memphis: "Мемфис",
    "great britain": "Великобритания",
    britain: "Великобритания",
    usa: "США",
    "united states": "США"
  };
  return translations[normalized] || value.trim();
}

function tennisLeagueName(match: RawMatch, tour: TennisTour, homePlayers: TennisParticipant[], awayPlayers: TennisParticipant[]): string {
  const raw = match.league.replace(/[—:]/g, " · ");
  const tier = raw.match(/\b(?:atp|wta)\s*(1000|500|250|125|100)\b/i)?.[1]
    || raw.match(/\b(1000|500|250|125|100)\b/)?.[1]
    || "";
  const isDoubles = homePlayers.length > 1
    || awayPlayers.length > 1
    || /\b(?:doubles?|pairs?)\b|пар(?:ы|ный|ные|н\.?)?/i.test(raw);
  const venue = raw
    .split(/[·.]/)
    .map(part => part
      .replace(/\b(?:world\s+tennis|tennis|atp|wta)\b/gi, " ")
      .replace(/\b(?:1000|500|250|125|100)\b/g, " ")
      .replace(/\b(?:men(?:'s)?|women(?:'s)?|male|female|singles?|doubles?|pairs?|hard|clay|grass|indoor|outdoor|qualification|qualifying)\b/gi, " ")
      .replace(/мужчин\w*|женщин\w*|одиноч\w*|парн\w*|пары|хард|грунт\w*|трава|квалификац\w*/gi, " ")
      .replace(/\s+/g, " ")
      .trim())
    .find(part => part.length > 1 && !/^(?:world|мир)$/i.test(part));
  const fallbackVenue = !isWorldCountry(match.country) && !/^(?:atp|wta)$/i.test(match.country)
    ? match.country
    : "Место не указано";
  const level = `${tour}${tier ? ` ${tier}` : ""}`;
  const gender = tour === "WTA" ? "женщины" : "мужчины";
  return [level, tennisVenueName(venue || fallbackVenue), gender, isDoubles ? "пары" : ""].filter(Boolean).join(" · ");
}

function withTennisRankings(match: RawMatch, rankings: TennisRankings): RawMatch {
  if (match.sport !== "tennis") return match;
  const tennisTour = tennisTourForMatch(match);
  const homePlayers = tennisParticipants(match.home, rankings, tennisTour);
  const awayPlayers = tennisParticipants(match.away, rankings, tennisTour);
  return withTeamIds({
    ...match,
    tennisTour,
    league: tennisLeagueName(match, tennisTour, homePlayers, awayPlayers),
    home: homePlayers.map(player => player.name).join(" / ") || match.home,
    away: awayPlayers.map(player => player.name).join(" / ") || match.away,
    homePlayers,
    awayPlayers
  });
}

async function loadBookmakerMatches(hours: number): Promise<{ matches: ApiMatch[]; debug: Record<string, unknown> }> {
  const now = Date.now();
  const horizon = now + Math.max(1, hours) * 60 * 60 * 1000;
  const [pari, fonbet, tennisi, rankingsResult, hltvResult] = await Promise.all([
    fetchPariLike(PARI_LINE_URLS, "pari"),
    fetchPariLike(FONBET_LINE_URLS, "fonbet"),
    fetchTennisiMatches(),
    loadTennisRankings()
      .then(value => ({ value, error: "" }))
      .catch(error => ({ value: null, error: error instanceof Error ? error.message : String(error) })),
    loadHltvUpcomingMatches()
      .then(value => ({ value, error: "" }))
      .catch(error => ({ value: [], error: error instanceof Error ? error.message : String(error) }))
  ]);
  const raw = [...pari, ...fonbet, ...tennisi, ...featuredFallbackMatches(now, horizon)]
    .filter((match) => match.startMs > now && match.startMs <= horizon);
  const hltvMatches = hltvResult.value || [];
  const hltvRaw = raw.map(match => withHltvContext(match, hltvMatches));
  const identifiedRaw = rankingsResult.value
    ? hltvRaw.map(match => withTennisRankings(match, rankingsResult.value!))
    : hltvRaw;
  const mergedRaw = mergeMatches(identifiedRaw);
  const ranked = rankingsResult.value
    ? mergedRaw
        .filter(match => match.sport !== "tennis"
          || hasTop100Participant(match.homePlayers || [])
          || hasTop100Participant(match.awayPlayers || []))
    : mergedRaw.filter(match => match.sport !== "tennis");
  const merged = ranked.flatMap((match) => {
    try {
      return [toApiMatch(match)];
    } catch (error) {
      console.warn("[matches] skipped malformed match response", match.id, error);
      return [];
    }
  });
  return {
    matches: merged,
    debug: {
      pari: pari.length,
      fonbet: fonbet.length,
      tennisi: tennisi.length,
      raw: raw.length,
      tennisBeforeTop100: mergedRaw.filter(match => match.sport === "tennis").length,
      tennisAfterTop100: ranked.filter(match => match.sport === "tennis").length,
      tennisRankings: rankingsResult.value
        ? { atp: rankingsResult.value.atp.length, wta: rankingsResult.value.wta.length, source: rankingsResult.value.source }
        : { error: rankingsResult.error },
      hltv: hltvResult.error ? { matches: hltvMatches.length, error: hltvResult.error } : { matches: hltvMatches.length },
      merged: merged.length
    }
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Number(searchParams.get("hours") || 72);
  const now = Date.now();
  const matchesCache = memoryCache.__stakeverseeMatchesCache ?? new Map();
  memoryCache.__stakeverseeMatchesCache = matchesCache;
  const cached = matchesCache.get(hours);

  if (cached && now - cached.ts < 4 * 60 * 1000) {
    return NextResponse.json(
      { hours, matches: cached.matches, updatedAt: new Date(cached.ts).toISOString(), cache: "memory", version: API_VERSION, debug: cached.debug },
      { headers: NO_STORE_HEADERS }
    );
  }

  const loaded = await loadBookmakerMatches(hours);
  matchesCache.set(hours, { ts: now, matches: loaded.matches, debug: loaded.debug });

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
