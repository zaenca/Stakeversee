export type HltvRankingRow = {
  id: string;
  rank: number;
  team: string;
  points: number;
  change: string;
  logo?: string;
  profileUrl?: string;
};

export type HltvRankingData = {
  source: string;
  updatedAt: string;
  rows: HltvRankingRow[];
};

export type HltvUpcomingMatch = {
  id: string;
  startsAt: number;
  home: string;
  away: string;
  format: string;
  event: string;
};

const HLTV_RANKING_URL = "https://www.hltv.org/ranking/teams";
const HLTV_MATCHES_URL = "https://www.hltv.org/matches";
const CS_API_RANKING_URL = "https://api.csapi.de/rankings/";
const RANKING_TTL = 6 * 60 * 60 * 1000;
const MATCHES_TTL = 10 * 60 * 1000;

const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  referer: "https://www.hltv.org/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
};

const hltvCache = globalThis as typeof globalThis & {
  __stakeverseeHltvRankings?: { ts: number; data: HltvRankingData };
  __stakeverseeHltvMatches?: { ts: number; rows: HltvUpcomingMatch[] };
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function classText(segment: string, className: string): string {
  const match = segment.match(new RegExp(
    `<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i"
  ));
  return stripTags(match?.[1] || "");
}

function classTexts(segment: string, className: string): string[] {
  const pattern = new RegExp(
    `<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "gi"
  );
  return Array.from(segment.matchAll(pattern), match => stripTags(match[1])).filter(Boolean);
}

function attributeFromTag(tag: string, attribute: string): string {
  return decodeHtml(tag.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"))?.[1] || "");
}

function normalizeChange(value: string): string {
  if (!value || value === "-") return "0";
  if (/new team/i.test(value)) return "NEW";
  return value;
}

export function normalizeHltvTeamName(value: string): string {
  const normalized = decodeHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/\b(team|esports?|gaming|club)\b/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliases: Record<string, string> = {
    "navi": "natus vincere",
    "vp": "virtus pro",
    "virtuspro": "virtus pro",
    "team liquid": "liquid",
    "team spirit": "spirit",
    "faze clan": "faze",
    "the mongolz": "mongolz"
  };
  return aliases[normalized] || normalized;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1]
        : Math.min(previous[rightIndex - 1], previous[rightIndex], current[rightIndex - 1]) + 1;
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

export function areHltvTeamNamesSimilar(left: string, right: string): boolean {
  const a = normalizeHltvTeamName(left);
  const b = normalizeHltvTeamName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length >= 4 && longer.split(" ").includes(shorter)) return true;
  return editDistance(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.25));
}

export function parseHltvRankingHtml(html: string): HltvRankingRow[] {
  return html
    .split(/(?=<[^>]+class=["'][^"']*\branked-team\b)/i)
    .filter(segment => /\branked-team\b/i.test(segment))
    .map(segment => {
      const rank = Number(classText(segment, "position").replace("#", ""));
      const team = classText(segment, "name");
      const points = Number(classText(segment, "points").replace(/[()]/g, "").split(/\s+/)[0]);
      const change = normalizeChange(classText(segment, "change"));
      const profileTag = segment.match(/<a[^>]*class=["'][^"']*\bmoreLink\b[^"']*["'][^>]*>/i)?.[0] || "";
      const profilePath = attributeFromTag(profileTag, "href");
      const logoTag = segment.match(/<img[^>]*class=["'][^"']*\bteam-logo\b[^"']*["'][^>]*>/i)?.[0] || "";
      const logo = attributeFromTag(logoTag, "src") || attributeFromTag(logoTag, "data-src");
      const id = profilePath.match(/\/team\/(\d+)\//i)?.[1] || normalizeHltvTeamName(team);
      return {
        id: `hltv:${id}`,
        rank,
        team,
        points: Number.isFinite(points) ? points : 0,
        change,
        logo: logo || undefined,
        profileUrl: profilePath ? new URL(profilePath, "https://www.hltv.org").toString() : undefined
      };
    })
    .filter(row => row.rank > 0 && row.rank <= 100 && row.team)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 100);
}

export function parseHltvMatchesHtml(html: string): HltvUpcomingMatch[] {
  return html
    .split(/(?=<[^>]+class=["'][^"']*\b(?:upcomingMatch|liveMatch-container)\b)/i)
    .filter(segment => /\b(?:upcomingMatch|liveMatch-container)\b/i.test(segment))
    .map(segment => {
      const teams = classTexts(segment, "matchTeamName");
      const matchLink = segment.match(/<a[^>]+href=["'][^"']*\/matches\/\d+\/[^"']*["'][^>]*>/i)?.[0] || "";
      const href = attributeFromTag(matchLink, "href");
      const startsAt = Number(
        segment.match(/\bdata-unix=["'](\d+)["']/i)?.[1]
        || segment.match(/\bdata-zonedgrouping-entry-unix=["'](\d+)["']/i)?.[1]
        || 0
      );
      const eventLogo = segment.match(/<img[^>]*class=["'][^"']*\bmatchEventLogo\b[^"']*["'][^>]*>/i)?.[0] || "";
      return {
        id: href.match(/\/matches\/(\d+)\//i)?.[1] || `${startsAt}-${teams.join("-")}`,
        startsAt,
        home: teams[0] || "",
        away: teams[1] || "",
        format: classText(segment, "matchMeta").toUpperCase(),
        event: attributeFromTag(eventLogo, "title")
      };
    })
    .filter(row => row.home && row.away && /\bBO[135]\b/i.test(row.format));
}

function parseFallbackRanking(payload: unknown): HltvRankingRow[] {
  const object = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const candidates = Array.isArray(payload)
    ? payload
    : [object.rankings, object.data, object.teams, object.results].find(Array.isArray) || [];

  return (candidates as Array<Record<string, unknown>>)
    .map((row, index) => {
      const teamObject = row.team && typeof row.team === "object" ? row.team as Record<string, unknown> : {};
      const team = String(teamObject.name || row.team_name || row.name || row.team || "");
      const rank = Number(row.rank || row.position || row.place || index + 1);
      const id = String(teamObject.id || row.team_id || row.id || normalizeHltvTeamName(team));
      return {
        id: `cs-api:${id}`,
        rank,
        team,
        points: Number(row.points || row.rating || row.score || 0),
        change: normalizeChange(String(row.change || row.movement || "0")),
        logo: String(teamObject.logo || row.logo || row.image || "") || undefined,
        profileUrl: undefined
      };
    })
    .filter(row => row.rank > 0 && row.rank <= 100 && row.team)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 100);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(6_000)
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

async function fetchHltvRanking(): Promise<HltvRankingData> {
  try {
    const html = await fetchText(HLTV_RANKING_URL);
    const rows = parseHltvRankingHtml(html);
    if (rows.length < 20) throw new Error("HLTV ranking markup was not available");
    return { source: "HLTV", updatedAt: new Date().toISOString(), rows };
  } catch (hltvError) {
    console.error("HLTV ranking request failed", hltvError);
    const response = await fetch(CS_API_RANKING_URL, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": REQUEST_HEADERS["user-agent"] },
      signal: AbortSignal.timeout(6_000)
    });
    if (!response.ok) throw new Error(`CS API ranking HTTP ${response.status}`);
    const rows = parseFallbackRanking(await response.json());
    if (!rows.length) throw new Error("CS API returned an empty ranking");
    return { source: "CS API (резерв)", updatedAt: new Date().toISOString(), rows };
  }
}

export async function loadHltvRankings(): Promise<HltvRankingData> {
  const cached = hltvCache.__stakeverseeHltvRankings;
  if (cached && Date.now() - cached.ts < RANKING_TTL) return cached.data;
  try {
    const data = await fetchHltvRanking();
    hltvCache.__stakeverseeHltvRankings = { ts: Date.now(), data };
    return data;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
  }
}

export async function loadHltvUpcomingMatches(): Promise<HltvUpcomingMatch[]> {
  const cached = hltvCache.__stakeverseeHltvMatches;
  if (cached && Date.now() - cached.ts < MATCHES_TTL) return cached.rows;
  try {
    const rows = parseHltvMatchesHtml(await fetchText(HLTV_MATCHES_URL));
    hltvCache.__stakeverseeHltvMatches = { ts: Date.now(), rows };
    return rows;
  } catch (error) {
    console.error("HLTV matches request failed", error);
    return cached?.rows || [];
  }
}

export function findHltvRanking(team: string, rows: HltvRankingRow[]): HltvRankingRow | null {
  return rows.find(row => areHltvTeamNamesSimilar(team, row.team)) || null;
}
