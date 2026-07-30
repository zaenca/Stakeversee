import { NextResponse } from "next/server";

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean;
  team?: {
    displayName?: string;
    name?: string;
    shortDisplayName?: string;
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: { type?: { completed?: boolean } };
  }>;
};

type HeadToHeadRow = {
  id: string;
  date: string;
  home: string;
  away: string;
  score: string;
  winner: string;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0"
};

const BASEBALL_LEAGUES: Array<{ pattern: RegExp; label: string; slug: string; seasonStartMonth: number }> = [
  { pattern: /\bmlb\b|major league/i, label: "MLB", slug: "mlb", seasonStartMonth: 3 },
  { pattern: /\bkbo\b|korea|коре/i, label: "KBO", slug: "kbo", seasonStartMonth: 3 },
  { pattern: /\blmb\b|mexic|мексик/i, label: "LMB", slug: "mexican-winter-league", seasonStartMonth: 3 }
];

const BASEBALL_TEAM_ALIASES: [string, string[]][] = [
  ["nc dinos", ["nc dinos", "nk dinos", "нц динос", "нк динос", "диноз", "динос"]],
  ["kt wiz", ["kt wiz", "kt wiz suwon", "кт виз", "кт уиз", "виз"]],
  ["ssg landers", ["ssg landers", "ссг ландерс", "ссг лэндерс", "ssg", "лендерс", "лэндерс", "ландерс"]],
  ["doosan bears", ["doosan bears", "дусан беарс", "дусан", "doosan"]],
  ["lg twins", ["lg twins", "лджи твинс", "лг твинс", "lg"]],
  ["kiwoom heroes", ["kiwoom heroes", "кивум хироуз", "кивум"]],
  ["kia tigers", ["kia tigers", "киа тайгерс", "kia"]],
  ["lotte giants", ["lotte giants", "лотте джайентс", "lotte"]],
  ["samsung lions", ["samsung lions", "самсунг лайонс", "samsung"]],
  ["hanwha eagles", ["hanwha eagles", "ханвха иглс", "ханва иглс", "хануа иглс", "hanwha"]]
];

const BASEBALL_TEAM_ID_BY_ALIAS = new Map(
  BASEBALL_TEAM_ALIASES.flatMap(([id, aliases]) => aliases.map(alias => [normalizedName(alias), id] as const))
);

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ё]/g, "е")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(fc|fk|bc|hc|cf|sc|club|w|women|u\d+)\b|(^|\s)(хк|фк|бк)(?=\s)/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function teamKey(name: string, id?: string | null): string {
  const idTail = (id || "").split(":").pop() || "";
  const normalizedIdTail = normalizedName(idTail);
  if (BASEBALL_TEAM_ID_BY_ALIAS.has(normalizedIdTail)) return BASEBALL_TEAM_ID_BY_ALIAS.get(normalizedIdTail) || normalizedIdTail;

  const normalized = normalizedName(name);
  return BASEBALL_TEAM_ID_BY_ALIAS.get(normalized) || normalized;
}

function espnDates(year: number, startMonth: number): string {
  const start = `${year}${String(startMonth).padStart(2, "0")}01`;
  const end = `${year}1231`;
  return `${start}-${end}`;
}

async function loadScoreboardEvents(slug: string, seasonStartMonth: number): Promise<EspnEvent[]> {
  const year = new Date().getUTCFullYear();
  const years = [year, year - 1];
  const responses = await Promise.allSettled(years.map(async (item) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/${slug}/scoreboard?dates=${espnDates(item, seasonStartMonth)}&limit=1000`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`ESPN ${slug} scoreboard HTTP ${response.status}`);
    const payload = await response.json() as { events?: EspnEvent[] };
    return payload.events || [];
  }));

  return responses.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

function eventToHeadToHeadRow(event: EspnEvent, homeKey: string, awayKey: string): HeadToHeadRow | null {
  const competition = event.competitions?.[0];
  if (!competition?.status?.type?.completed) return null;

  const competitors = competition.competitors || [];
  const teams = competitors.map(item => ({
    ...item,
    key: teamKey(item.team?.displayName || item.team?.name || item.team?.shortDisplayName || "")
  }));
  if (!teams.some(item => item.key === homeKey) || !teams.some(item => item.key === awayKey)) return null;

  const home = teams.find(item => item.homeAway === "home") || teams[0];
  const away = teams.find(item => item.homeAway === "away") || teams[1];
  if (!home || !away) return null;

  const winner = teams.find(item => item.winner);
  return {
    id: String(event.id || `${event.date}-${home.key}-${away.key}`),
    date: String(event.date || ""),
    home: home.team?.displayName || home.team?.name || "",
    away: away.team?.displayName || away.team?.name || "",
    score: `${home.score || "-"}:${away.score || "-"}`,
    winner: winner?.team?.displayName || winner?.team?.name || ""
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport") || "";
  const league = searchParams.get("league") || "";
  const home = searchParams.get("home") || "";
  const away = searchParams.get("away") || "";
  const homeTeamId = searchParams.get("homeTeamId") || "";
  const awayTeamId = searchParams.get("awayTeamId") || "";
  const standingLeague = BASEBALL_LEAGUES.find(item => item.pattern.test(league));

  if (sport !== "baseball" || !standingLeague || !home || !away) {
    return NextResponse.json({ source: "", matches: [] }, { headers: NO_STORE_HEADERS });
  }

  const homeKey = teamKey(home, homeTeamId);
  const awayKey = teamKey(away, awayTeamId);

  try {
    const events = await loadScoreboardEvents(standingLeague.slug, standingLeague.seasonStartMonth);
    const matches = events
      .map(event => eventToHeadToHeadRow(event, homeKey, awayKey))
      .filter((item): item is HeadToHeadRow => Boolean(item))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, 5);

    return NextResponse.json({ sport: "baseball", league: standingLeague.label, source: "ESPN", matches }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Head-to-head route failed", error);
    return NextResponse.json({ sport: "baseball", league: standingLeague.label, source: "ESPN", matches: [] }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
