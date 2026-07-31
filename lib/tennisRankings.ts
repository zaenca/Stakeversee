export type TennisTour = "ATP" | "WTA";

export type TennisRankingPlayer = {
  id: string;
  tour: TennisTour;
  rank: number;
  name: string;
  originalName: string;
  country: string;
  points: number;
  age?: number;
  tournaments?: number;
  profileUrl: string;
};

export type TennisParticipant = {
  id: string;
  sourceName: string;
  name: string;
  originalName?: string;
  tour: TennisTour | null;
  rank: number | null;
  country: string;
  points: number | null;
  age?: number;
  tournaments?: number;
  profileUrl?: string;
};

export type TennisRankings = {
  atp: TennisRankingPlayer[];
  wta: TennisRankingPlayer[];
  source: string;
  updatedAt: string;
};

const ATP_RANKINGS_URL = "https://www.atptour.com/en/rankings/singles?rankRange=1-100";
const ATP_FALLBACK_RANKINGS_URL = "https://tenniscompanion.org/rankings/mens/";
const WTA_RANKINGS_API = "https://api.wtatennis.com/tennis/players/ranked";
const CACHE_TTL_MS = 60 * 60 * 1000;

const rankingCache = globalThis as typeof globalThis & {
  __stakeverseeTennisRankings?: { ts: number; value: TennisRankings };
  __stakeverseeTennisRankingsPromise?: Promise<TennisRankings>;
};

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
};

const TENNIS_NAME_RU_OVERRIDES: Record<string, string> = {
  "caty mcnally": "Кэти Макналли",
  "katie mcnally": "Кэти Макналли",
  "aryna sabalenka": "Арина Сабаленка",
  "elena rybakina": "Елена Рыбакина",
  "jessica pegula": "Джессика Пегула",
  "coco gauff": "Коко Гауфф",
  "mirra andreeva": "Мирра Андреева",
  "karolina muchova": "Каролина Мухова",
  "linda noskova": "Линда Носкова",
  "iga swiatek": "Ига Швёнтек",
  "amanda anisimova": "Аманда Анисимова",
  "elina svitolina": "Элина Свитолина",
  "marta kostyuk": "Марта Костюк",
  "victoria mboko": "Виктория Мбоко",
  "naomi osaka": "Наоми Осака",
  "belinda bencic": "Белинда Бенчич",
  "jasmine paolini": "Жасмин Паолини",
  "iva jovic": "Ива Йович",
  "sorana cirstea": "Сорана Кырстя",
  "diana shnaider": "Диана Шнайдер",
  "ekaterina alexandrova": "Екатерина Александрова",
  "anna kalinskaya": "Анна Калинская",
  "marie bouzkova": "Мария Боузкова",
  "maja chwalinska": "Майя Хвалиньская",
  "madison keys": "Мэдисон Киз",
  "elise mertens": "Элизе Мертенс",
  "leylah fernandez": "Лейла Фернандес",
  "barbora krejcikova": "Барбора Крейчикова",
  "emma navarro": "Эмма Наварро",
  "anastasia potapova": "Анастасия Потапова",
  "alexandra eala": "Александра Эала",
  "clara tauson": "Клара Таусон",
  "jelena ostapenko": "Елена Остапенко",
  "ann li": "Энн Ли",
  "maria sakkari": "Мария Саккари",
  "hailey baptiste": "Хейли Баптист",
  "katerina siniakova": "Катерина Синякова",
  "donna vekic": "Донна Векич",
  "emma raducanu": "Эмма Радукану",
  "janice tjen": "Дженис Тьен",
  "xinyu wang": "Ван Синьюй",
  "sara bejlek": "Сара Бейлек",
  "novak djokovic": "Новак Джокович",
  "jannik sinner": "Янник Синнер",
  "carlos alcaraz": "Карлос Алькарас",
  "alexander zverev": "Александр Зверев",
  "daniil medvedev": "Даниил Медведев",
  "andrey rublev": "Андрей Рублёв",
  "karen khachanov": "Карен Хачанов",
  "holger rune": "Хольгер Руне",
  "casper ruud": "Каспер Рууд",
  "stefanos tsitsipas": "Стефанос Циципас"
};

function transliterateLatinWord(value: string): string {
  const replacements: [RegExp, string][] = [
    [/shch/g, "щ"], [/tsch/g, "ч"], [/dzh/g, "дж"], [/zh/g, "ж"],
    [/kh/g, "х"], [/ch/g, "ч"], [/sh/g, "ш"], [/th/g, "т"],
    [/ph/g, "ф"], [/ck/g, "к"], [/qu/g, "кв"], [/ya/g, "я"],
    [/yu/g, "ю"], [/yo/g, "ё"], [/ye/g, "е"], [/ee/g, "и"]
  ];
  let word = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  replacements.forEach(([pattern, replacement]) => { word = word.replace(pattern, replacement); });
  word = word
    .replace(/c(?=[eiy])/g, "с")
    .replace(/g(?=[eiy])/g, "дж")
    .replace(/[a-z]/g, char => ({
      a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х",
      i: "и", j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
      q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс",
      y: "й", z: "з"
    }[char] || char));
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function russianTennisName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
  const override = TENNIS_NAME_RU_OVERRIDES[normalized];
  if (override) return override;
  return value
    .split(/(\s+|-|')/)
    .map(part => /^[A-Za-zÀ-ž]+$/.test(part) ? transliterateLatinWord(part) : part)
    .join("");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function titleFromSlug(value: string): string {
  return decodeURIComponent(value)
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function integer(value: string): number {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

function parseAtpRankings(html: string): TennisRankingPlayer[] {
  const players: TennisRankingPlayer[] = [];
  const seen = new Set<number>();
  const rows = html.matchAll(/<tr[^>]*class="[^"]*\blower-row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rows) {
    const row = rowMatch[1];
    const rankMatch = row.match(/<td[^>]*class="[^"]*\brank\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const profileMatch = row.match(/href="(\/en\/players\/([^"/]+)\/([^"/]+)\/overview)"/i);
    const pointsMatch = row.match(/<td[^>]*class="[^"]*\bpoints\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (!rankMatch || !profileMatch) continue;

    const rank = integer(stripTags(rankMatch[1]));
    if (rank < 1 || rank > 100 || seen.has(rank)) continue;
    seen.add(rank);
    const originalName = titleFromSlug(profileMatch[2]);
    const country = row.match(/#flag-([a-z]{3})/i)?.[1]?.toUpperCase() || "";
    players.push({
      id: `atp:${profileMatch[3].toLowerCase()}`,
      tour: "ATP",
      rank,
      name: russianTennisName(originalName),
      originalName,
      country,
      points: integer(stripTags(pointsMatch?.[1] || "0")),
      profileUrl: `https://www.atptour.com${profileMatch[1]}`
    });
  }

  return players.sort((a, b) => a.rank - b.rank).slice(0, 100);
}

function parseTennisCompanionAtpRankings(html: string): TennisRankingPlayer[] {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const players: TennisRankingPlayer[] = [];
  const seen = new Set<string>();

  for (const rowMatch of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => stripTags(match[1]));
    if (cells.length < 6) continue;

    const sourceRank = integer(cells[0]);
    const originalName = cells[2]?.trim() || "";
    const identity = slugify(originalName);
    if (sourceRank < 1 || sourceRank > 100 || !identity || seen.has(identity)) continue;
    seen.add(identity);
    players.push({
      id: `atp:${identity}`,
      tour: "ATP",
      rank: sourceRank,
      name: russianTennisName(originalName),
      originalName,
      country: cells[3]?.trim().toUpperCase() || "",
      points: integer(cells[5]),
      age: integer(cells[4]) || undefined,
      profileUrl: ATP_RANKINGS_URL
    });
    if (players.length === 100) break;
  }

  return players.sort((a, b) => a.rank - b.rank);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    next: { revalidate: 3600 }
  } as RequestInit & { next: { revalidate: number } });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

type RankingFetchResult = {
  players: TennisRankingPlayer[];
  source: string;
};

async function fetchAtpRankings(): Promise<RankingFetchResult> {
  try {
    const official = parseAtpRankings(await fetchHtml(ATP_RANKINGS_URL));
    if (official.length >= 90) return { players: official, source: "ATP" };
  } catch (error) {
    console.warn("Official ATP rankings unavailable, using fallback", error);
  }

  const fallback = parseTennisCompanionAtpRankings(await fetchHtml(ATP_FALLBACK_RANKINGS_URL));
  if (fallback.length < 90) {
    throw new Error(`ATP fallback rankings incomplete: ${fallback.length}`);
  }
  return { players: fallback, source: "ATP / TennisCompanion" };
}

type WtaRankedPlayer = {
  player?: {
    id?: number;
    fullName?: string;
    countryCode?: string;
    dateOfBirth?: string;
  };
  ranking?: number;
  points?: number;
  tournamentsPlayed?: number;
};

function rankingWeekDate(): string {
  const date = new Date();
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function playerAge(dateOfBirth?: string): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  return age > 0 ? age : undefined;
}

async function fetchWtaRankings(): Promise<TennisRankingPlayer[]> {
  const params = new URLSearchParams({
    page: "0",
    pageSize: "100",
    type: "rankSingles",
    sort: "asc",
    metric: "SINGLES",
    at: rankingWeekDate(),
    name: "",
    nationality: ""
  });
  const response = await fetch(`${WTA_RANKINGS_API}?${params}`, {
    headers: {
      accept: "application/json",
      "user-agent": REQUEST_HEADERS["user-agent"]
    },
    next: { revalidate: 3600 }
  } as RequestInit & { next: { revalidate: number } });
  if (!response.ok) throw new Error(`${WTA_RANKINGS_API} HTTP ${response.status}`);
  const rows = await response.json() as WtaRankedPlayer[];
  return rows
    .map<TennisRankingPlayer | null>(row => {
      const id = row.player?.id;
      const rank = Number(row.ranking);
      const originalName = row.player?.fullName?.trim() || "";
      if (!id || !originalName || rank < 1 || rank > 100) return null;
      return {
        id: `wta:${id}`,
        tour: "WTA",
        rank,
        name: russianTennisName(originalName),
        originalName,
        country: row.player?.countryCode?.toUpperCase() || "",
        points: Number(row.points) || 0,
        age: playerAge(row.player?.dateOfBirth),
        tournaments: Number(row.tournamentsPlayed) || undefined,
        profileUrl: `https://www.wtatennis.com/players/${id}/${slugify(originalName)}`
      };
    })
    .filter((player): player is TennisRankingPlayer => Boolean(player))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 100);
}

async function refreshRankings(): Promise<TennisRankings> {
  const [atpResult, wtaResult] = await Promise.allSettled([
    fetchAtpRankings(),
    fetchWtaRankings()
  ]);
  const atp = atpResult.status === "fulfilled" ? atpResult.value.players : [];
  const wta = wtaResult.status === "fulfilled" ? wtaResult.value : [];
  if (atp.length < 90 || wta.length < 90) {
    throw new Error(`Tennis rankings unavailable: ATP ${atp.length}, WTA ${wta.length}`);
  }
  return {
    atp,
    wta,
    source: `${atpResult.status === "fulfilled" ? atpResult.value.source : "ATP"} / WTA`,
    updatedAt: new Date().toISOString()
  };
}

export async function loadTennisRankings(): Promise<TennisRankings> {
  const cached = rankingCache.__stakeverseeTennisRankings;
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  if (rankingCache.__stakeverseeTennisRankingsPromise) return rankingCache.__stakeverseeTennisRankingsPromise;

  rankingCache.__stakeverseeTennisRankingsPromise = refreshRankings()
    .then(value => {
      rankingCache.__stakeverseeTennisRankings = { ts: Date.now(), value };
      return value;
    })
    .catch(error => {
      if (cached) return cached.value;
      throw error;
    })
    .finally(() => {
      rankingCache.__stakeverseeTennisRankingsPromise = undefined;
    });
  return rankingCache.__stakeverseeTennisRankingsPromise;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: ""
};

function latinName(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map(char => CYRILLIC_TO_LATIN[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phonetic(value: string): string {
  return value
    .replace(/shch/g, "s")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/zh/g, "z")
    .replace(/kh/g, "h")
    .replace(/ts/g, "c")
    .replace(/[kq]/g, "c")
    .replace(/z/g, "s")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/[aeiou]/g, "");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const regular = 1 - editDistance(left, right) / Math.max(left.length, right.length);
  const leftPhonetic = phonetic(left);
  const rightPhonetic = phonetic(right);
  const phoneticScore = leftPhonetic && rightPhonetic
    ? 1 - editDistance(leftPhonetic, rightPhonetic) / Math.max(leftPhonetic.length, rightPhonetic.length)
    : 0;
  return Math.max(regular, phoneticScore);
}

export function splitTennisParticipants(value: string): string[] {
  const parts = value
    .split(/\s*(?:\/|\\|\+|&|\sи\s)\s*/i)
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [value.trim()].filter(Boolean);
}

function matchRankingPlayer(sourceName: string, players: TennisRankingPlayer[]): TennisRankingPlayer | null {
  const source = latinName(sourceName);
  const sourceTokens = source.split(" ").filter(Boolean);
  if (!sourceTokens.length) return null;
  const sourceInitials = sourceTokens.filter(token => token.length === 1);
  const sourceWords = sourceTokens.filter(token => token.length > 1);
  const sourceSurnameCandidates = sourceWords.length ? sourceWords : sourceTokens;
  let best: { player: TennisRankingPlayer; score: number } | null = null;

  for (const player of players) {
    const aliases = Array.from(new Set([player.originalName, player.name].filter(Boolean)));
    for (const alias of aliases) {
      const playerTokens = latinName(alias).split(" ").filter(Boolean);
      if (!playerTokens.length) continue;
      const officialFirst = playerTokens[0];
      const officialSurname = playerTokens[playerTokens.length - 1];
      const surnameScore = Math.max(...sourceSurnameCandidates.map(token => similarity(token, officialSurname)));
      const fullScore = similarity(sourceTokens.join(""), playerTokens.join(""));
      const initialMatches = sourceInitials.length === 0
        || sourceInitials.some(initial => initial === officialFirst.charAt(0));
      const containsFullSurname = sourceTokens.includes(officialSurname);

      // Букмекеры часто отдают «Фамилия И». Без совпадения инициала похожие
      // окончания (Кужмова / Анисимова) нельзя считать одним игроком.
      if (!initialMatches || (!containsFullSurname && surnameScore < 0.84)) continue;
      const score = Math.max(fullScore, surnameScore, containsFullSurname ? 1 : 0);
      if (!best || score > best.score) best = { player, score };
    }
  }

  const threshold = sourceTokens.length === 1 ? 0.9 : 0.84;
  return best && best.score >= threshold ? best.player : null;
}

export function tennisParticipants(
  value: string,
  rankings: TennisRankings,
  preferredTour?: TennisTour
): TennisParticipant[] {
  const players = preferredTour
    ? (preferredTour === "ATP" ? rankings.atp : rankings.wta)
    : [...rankings.atp, ...rankings.wta];
  return splitTennisParticipants(value).map(sourceName => {
    const player = matchRankingPlayer(sourceName, players);
    if (!player) {
      return {
        id: `tennis:unranked:${latinName(sourceName).replace(/\s+/g, "-")}`,
        sourceName,
        name: sourceName,
        tour: null,
        rank: null,
        country: "",
        points: null
      };
    }
    return {
      ...player,
      sourceName
    };
  });
}

export function hasTop100Participant(participants: TennisParticipant[]): boolean {
  return participants.some(player => player.rank !== null && player.rank >= 1 && player.rank <= 100);
}
