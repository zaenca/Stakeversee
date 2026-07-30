import { NextResponse } from "next/server";

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
  __stakeverseeMatchesCache?: { ts: number; matches: ApiMatch[]; debug: Record<string, unknown> };
};

const API_VERSION = "bookmakers-v9";
const MLB_TEAM_ALIASES: [string, string[]][] = [
  ["Техас Рейнджерс", ["texas", "техас", "texas rangers", "техас рейнджерс"]],
  ["Сиэтл Маринерс", ["seattle", "сиэтл", "seattle mariners", "сиэтл маринерс"]],
  ["Детройт Тайгерс", ["detroit", "детройт", "detroit tigers", "детройт тайгерс"]],
  ["Балтимор Ориолс", ["baltimore", "балтимор", "baltimore orioles", "балтимор ориолс"]],
  ["Питтсбург Пайретс", ["pittsburgh", "питтсбург", "pittsburgh pirates", "питтсбург пайретс"]],
  ["Аризона Даймондбэкс", ["arizona", "аризона", "arizona diamondbacks", "аризона даймондбэкс"]],
  ["Нью-Йорк Янкиз", ["ny yankees", "new york yankees", "нью йорк янкиз"]],
  ["Нью-Йорк Метс", ["ny mets", "new york mets", "нью йорк метс"]],
  ["Лос-Анджелес Доджерс", ["la dodgers", "los angeles dodgers", "лос анджелес доджерс"]],
  ["Лос-Анджелес Энджелс", ["la angels", "los angeles angels", "лос анджелес энджелс"]],
  ["Бостон Ред Сокс", ["boston", "бостон", "boston red sox", "бостон ред сокс"]],
  ["Торонто Блю Джейс", ["toronto", "торонто", "toronto blue jays", "торонто блю джейс"]],
  ["Хьюстон Астрос", ["houston", "хьюстон", "houston astros", "хьюстон астрос"]],
  ["Атланта Брэйвз", ["atlanta", "атланта", "atlanta braves", "атланта брэйвз"]],
  ["Чикаго Кабс", ["chicago cubs", "чикаго кабс"]],
  ["Чикаго Уайт Сокс", ["chicago white sox", "чикаго уайт сокс"]],
  ["Кливленд Гардианс", ["cleveland", "кливленд", "cleveland guardians", "кливленд гардианс"]],
  ["Миннесота Твинс", ["minnesota", "миннесота", "minnesota twins", "миннесота твинс"]],
  ["Канзас-Сити Роялс", ["kansas city", "канзас сити", "kansas city royals", "канзас сити роялс"]],
  ["Окленд Атлетикс", ["oakland", "окленд", "athletics", "oakland athletics", "окленд атлетикс"]],
  ["Майами Марлинс", ["miami", "майами", "miami marlins", "майами марлинс"]],
  ["Филадельфия Филлис", ["philadelphia", "филадельфия", "philadelphia phillies", "филадельфия филлис"]],
  ["Вашингтон Нэшионалс", ["washington", "вашингтон", "washington nationals", "вашингтон нэшионалс"]],
  ["Милуоки Брюэрс", ["milwaukee", "милуоки", "milwaukee brewers", "милуоки брюэрс"]],
  ["Сент-Луис Кардиналс", ["st louis", "st. louis", "сент луис", "st louis cardinals", "сент луис кардиналс"]],
  ["Цинциннати Редс", ["cincinnati", "цинциннати", "cincinnati reds", "цинциннати редс"]],
  ["Колорадо Рокиз", ["colorado", "колорадо", "colorado rockies", "колорадо рокиз"]],
  ["Сан-Диего Падрес", ["san diego", "сан диего", "san diego padres", "сан диего падрес"]],
  ["Сан-Франциско Джайентс", ["san francisco", "сан франциско", "san francisco giants", "сан франциско джайентс"]],
  ["Тампа-Бэй Рэйс", ["tampa bay", "тампа бэй", "tampa bay rays", "тампа бэй рэйс"]]
];
const MLB_TEAM_NAME_BY_ALIAS = new Map(MLB_TEAM_ALIASES.flatMap(([fullName, aliases]) => aliases.map(alias => [alias, fullName] as const)));

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
  ["nc dinos", ["nc dinos", "nk dinos", "нц динос", "нк динос", "диноз", "динос"]],
  ["kt wiz", ["kt wiz", "kt wiz suwon", "кт виз", "кт уиз", "виз"]],
  ["ssg landers", ["ssg landers", "ссг ландерс", "ссг лэндерс", "ssg", "лендерс", "лэндерс", "ландерс"]],
  ["doosan bears", ["doosan bears", "дусан беарс", "дусан", "doosan"]],
  ["lg twins", ["lg twins", "лджи твинс", "лг твинс", "lg"]],
  ["kiwoom heroes", ["kiwoom heroes", "кивум хироуз", "кивум"]],
  ["kia tigers", ["kia tigers", "киа тайгерс", "kia"]],
  ["lotte giants", ["lotte giants", "лотте джайентс", "lotte"]],
  ["samsung lions", ["samsung lions", "самсунг лайонс", "samsung"]],
  ["hanwha eagles", ["hanwha eagles", "ханвха иглс", "hanwha"]]
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

function parseTennisiStartMs(dateText: string, baseYear: number, baseMonth: number, baseDay: number, dayOffset: number): number | null {
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

  const startMs = Date.UTC(year, month, day, hour - 3, minute);
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
    .replace(/\bbest\s+of\s*([135])\b/gi, "BO$1")
    .replace(/\bbo\s*([135])\b/gi, "BO$1")
    .replace(/\s*[-–—·:]\s*/g, ". ")
    .replace(/\s*\.\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
  const bo = esportsBoFormat(value);
  const discipline = esportsDisciplineName(value);
  const tournament = normalizeEsportsTournamentName(value, discipline, bo);
  return [discipline, tournament, bo].filter(Boolean).join(". ") || value;
}

function esportsDisciplineName(value: string): string | null {
  if (/\b(league\s+of\s+legends|lol)\b/i.test(value)) return "LoL";
  if (/\b(counter\s*strike|cs2?|кс)\b/i.test(value)) return "Counter-Strike";
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
  if (discipline === "Counter-Strike") tournament = tournament.replace(/\b(counter\s*strike|cs2?|кс)\b/gi, " ");
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
    .replace(/\s*[-–—·:]\s*/g, ". ")
    .replace(/\s*\.\s*/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "")
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
  "\u0411\u0423\u0422\u0410\u041d": "Bhutan",
  "\u0423\u0420\u0423\u0413\u0412\u0410\u0419": "Uruguay",
  "\u0422\u0410\u0419\u0412\u0410\u041d\u042c": "Taiwan", "\u041c\u0423\u0416\u0427\u0418\u041d\u042b": "ATP", "\u0416\u0415\u041d\u0429\u0418\u041d\u042b": "WTA",
};

function normalizeCountryName(raw: string): string {
  const upper = raw.toUpperCase().trim();
  return COUNTRY_NAME_MAP[upper] ?? raw;
}

// Список реальных стран — всё что не входит сюда (лиги, туры, дисциплины
// вроде LoL/Counter-Strike/ATP/UTR Pro) не считается страной и уходит в лигу.
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
  [/\b(кхл|khl)\b|адмирал|нефтехимик|челны|ак\s*барс|сибирь|локомотив|трактор|северсталь|салават|ска|лада|спартак|торпедо|автомобилист|динамо\s+москва/i, "Russia"]
];

function normalizeBaseballLeague(match: RawMatch): RawMatch {
  if (match.sport !== "baseball") return match;
  const full = `${match.country} ${match.league}`.toLowerCase();
  if (/\b(kbo|korea|south korea|коре[яй]|южн\w*\s+коре)|чемпионат\s+южн\w*\s+коре/i.test(full)) {
    return { ...match, country: "South Korea", league: "KBO" };
  }
  if (/\b(lmb|mexico|мексик)/i.test(full)) {
    return { ...match, country: "Mexico", league: "LMB" };
  }
  return match;
}

function normalizeMatchLocale(match: RawMatch): RawMatch {
  const baseballMatch = normalizeBaseballLeague(match);
  if (baseballMatch !== match) return withTeamIds(baseballMatch);
  if (match.country !== "World" || match.sport !== "ice-hockey") return withTeamIds(match);
  if (!/товарищ|friendly/i.test(match.league)) return withTeamIds(match);

  const full = `${match.league} ${match.home} ${match.away}`;
  const inferred = HOCKEY_FRIENDLY_COUNTRY_HINTS.find(([pattern]) => pattern.test(full))?.[1];
  return withTeamIds(inferred ? { ...match, country: inferred } : match);
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
    // Не страна (например LoL, ATP, Counter-Strike, UTR Pro) — переносим в лигу
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

async function fetchTennisiCategory(category: { categoryId: number; path: string; sport: string }): Promise<RawMatch[]> {
  const url = `https://tennisi.bet/rt/cgi/!rt_home.CategoryInfo?mcmd=cat&mcmdparam=${category.path}&gameid=5&categoryid=${category.categoryId}&lang=rus&more=today`;
  const response = await fetch(url, {
    headers: { ...REQUEST_HEADERS, referer: `https://tennisi.bet/sport/${category.path}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Tennisi ${category.path}: HTTP ${response.status}`);

  const html = new TextDecoder("windows-1251").decode(await response.arrayBuffer());
  return parseTennisiHtml(html, category.sport);
}

function parseTennisiHtml(html: string, sport: string): RawMatch[] {
  const serverDate = html.match(/server_time">(\d{1,2})\s+([А-ЯЁ]+)\s+(\d{4})/i);
  const baseDay = serverDate ? Number(serverDate[1]) : new Date().getUTCDate();
  const baseMonth = serverDate ? TENNISI_MONTH_NAMES[serverDate[2].toUpperCase()] ?? new Date().getUTCMonth() : new Date().getUTCMonth();
  const baseYear = serverDate ? Number(serverDate[3]) : new Date().getUTCFullYear();
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
    const startMs = parseTennisiStartMs(dateText, baseYear, baseMonth, baseDay, dayOffset);
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
  if (match.sport !== "baseball") return value;
  return MLB_TEAM_NAME_BY_ALIAS.get(normalizedName(value)) || value;
}

function normalizeEsportsParticipantAlias(value: string): string {
  const cleaned = value
    .replace(/\bs\b/g, " ")
    .replace(/\b(team|vivo|academy|академия|challengers?|esports?|киберспорт)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^keyd(?:\s+stars)?$/.test(cleaned)) return "keyd";
  if (/^solid$/.test(cleaned)) return "solid";
  return cleaned;
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
  if (match.sport === "baseball") {
    const normalized = normalizedName(displayTeamName(match, value)).replace(/\bde\b/g, " ").replace(/\s+/g, " ").trim();
    return BASEBALL_TEAM_ID_BY_ALIAS.get(normalized) || normalized;
  }
  const normalized = normalizedName(value);
  if (match.sport === "esports") return normalizeEsportsParticipantAlias(normalized);
  if (match.sport === "football") return normalizeFootballParticipantAlias(normalized);
  if (match.sport !== "tennis") return normalized;

  return normalized
    .split(" ")
    .filter((part, index, parts) => part.length > 1 || index === 0 || parts.length === 1)
    .join(" ");
}

function canonicalTeamId(match: RawMatch, value: string): string {
  const participant = normalizedMatchParticipant(match, value);
  return [match.sport, match.country, match.league, participant]
    .map(part => normalizedName(part))
    .filter(Boolean)
    .join(":");
}

function withTeamIds(match: RawMatch): RawMatch {
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

function sameParticipants(left: RawMatch, right: RawMatch): boolean {
  if (left.homeTeamId && left.awayTeamId && right.homeTeamId && right.awayTeamId) {
    return (left.homeTeamId === right.homeTeamId && left.awayTeamId === right.awayTeamId)
      || (left.homeTeamId === right.awayTeamId && left.awayTeamId === right.homeTeamId);
  }

  const leftHome = compactParticipantName(left, left.home);
  const leftAway = compactParticipantName(left, left.away);
  const rightHome = compactParticipantName(right, right.home);
  const rightAway = compactParticipantName(right, right.away);
  const useAcronym = left.sport === "esports" || right.sport === "esports";

  return (areSimilarParticipants(leftHome, rightHome, useAcronym) && areSimilarParticipants(leftAway, rightAway, useAcronym))
    || (areSimilarParticipants(leftHome, rightAway, useAcronym) && areSimilarParticipants(leftAway, rightHome, useAcronym));
}

function dedupeKey(match: RawMatch): string {
  const bucket = Math.round(match.startMs / (15 * 60 * 1000));
  const teams = [match.homeTeamId || canonicalTeamId(match, match.home), match.awayTeamId || canonicalTeamId(match, match.away)].sort().join("~");
  return `${match.sport}|${bucket}|${normalizedName(match.country)}|${normalizedName(match.league)}|${teams}`;
}

function mergeTimeToleranceMs(sport: string): number {
  if (sport === "football") return 3 * 60 * 60 * 1000;
  return sport === "tennis" ? 90 * 60 * 1000 : 45 * 60 * 1000;
}

function esportsBoFormat(value: string): string | null {
  const match = value.match(/\b(?:bo|best\s+of)\s*([135])\b/i);
  return match ? `BO${match[1]}` : null;
}

function mergedLeagueName(current: RawMatch, match: RawMatch): string {
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
    if (sameParticipants(current, match)) return key;
  }

  return null;
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
    const match = normalizeMatchLocale(rawMatch);
    if (shouldDropMatch(match)) continue;
    const key = findMergeKey(byKey, match) || dedupeKey(match);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, match);
      continue;
    }
    const bookmakerOdds = { ...current.bookmakerOdds, ...match.bookmakerOdds };
    const odds = bestOddsFromBookmakers(bookmakerOdds);
    byKey.set(key, {
      ...current,
      id: `${current.id}+${match.id}`,
      country: current.country !== "World" ? current.country : match.country,
      league: mergedLeagueName(current, match),
      home: displayTeamName(current, /[а-яё]/i.test(current.home) ? current.home : match.home),
      away: displayTeamName(current, /[а-яё]/i.test(current.away) ? current.away : match.away),
      bookmakerOdds,
      odds
    });
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
    awayTeamId: match.awayTeamId
  };
}

async function loadBookmakerMatches(hours: number): Promise<{ matches: ApiMatch[]; debug: Record<string, unknown> }> {
  const now = Date.now();
  const horizon = now + Math.max(1, hours) * 60 * 60 * 1000;
  const [pari, fonbet, tennisi] = await Promise.all([
    fetchPariLike(PARI_LINE_URLS, "pari"),
    fetchPariLike(FONBET_LINE_URLS, "fonbet"),
    fetchTennisiMatches()
  ]);
  const raw = [...pari, ...fonbet, ...tennisi, ...featuredFallbackMatches(now, horizon)]
    .filter((match) => match.startMs > now && match.startMs <= horizon);
  const merged = mergeMatches(raw).map(toApiMatch);
  return {
    matches: merged,
    debug: {
      pari: pari.length,
      fonbet: fonbet.length,
      tennisi: tennisi.length,
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
