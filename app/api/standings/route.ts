import { NextResponse } from "next/server";
import { loadHltvRankings } from "@/lib/hltv";
import { KBO_TEAMS, kboTeamId } from "@/lib/kboTeams";
import { MLB_TEAMS, mlbTeamId, resolveMlbTeam } from "@/lib/mlbTeams";
import { loadTennisRankings, type TennisTour } from "@/lib/tennisRankings";

type EspnStandingStat = {
  name?: string;
  displayValue?: string;
  value?: number;
};

type EspnStandingEntry = {
  team?: { id?: string; displayName?: string };
  stats?: EspnStandingStat[];
};

type EspnStandingGroup = {
  abbreviation?: string;
  name?: string;
  standings?: { entries?: EspnStandingEntry[] };
};

type StandingRow = {
  id: string;
  rank: number;
  league: string;
  division: string;
  team: string;
  wins: number;
  losses: number;
  pct: string;
  gamesBack: string;
  form?: string;
  points?: number;
  change?: string;
  logo?: string;
  profileUrl?: string;
  country?: string;
  age?: number;
  tournaments?: number;
  tour?: TennisTour;
};

const BASEBALL_STANDINGS_SLUGS: Array<{ pattern: RegExp; label: string; slug: string }> = [
  { pattern: /\bmlb\b|major league/i, label: "MLB", slug: "mlb" },
  { pattern: /\bkbo\b|korea|коре/i, label: "KBO", slug: "kbo" },
  { pattern: /\blmb\b|mexic|мексик/i, label: "LMB", slug: "mexican-winter-league" }
];

const KBO_REFERENCE_STANDINGS: StandingRow[] = KBO_TEAMS.map((team, index) => ({
  id: kboTeamId(team),
  rank: index + 1,
  league: "KBO",
  division: "",
  team: team.name,
  wins: 0,
  losses: 0,
  pct: "-",
  gamesBack: "-",
  form: "-"
}));

const MLB_REFERENCE_STANDINGS: StandingRow[] = MLB_TEAMS.map((team, index) => {
  const league = index < 15 ? "Американская лига" : "Национальная лига";
  return {
    id: mlbTeamId(team),
    rank: (index % 15) + 1,
    league,
    division: league,
    team: team.name,
    wins: 0,
    losses: 0,
    pct: "-",
    gamesBack: "-",
    form: "-"
  };
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0"
};

async function loadBaseballStandings(slug: string, fallbackLeague: string): Promise<StandingRow[]> {
  const response = await fetch(`https://site.api.espn.com/apis/v2/sports/baseball/${slug}/standings`, { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN ${slug} standings HTTP ${response.status}`);

  const payload = await response.json() as { children?: EspnStandingGroup[] };
  return (payload.children || []).flatMap(group => {
    const rawLeague = group.name || group.abbreviation || fallbackLeague;
    const league = fallbackLeague === "MLB" ? translateMlbGroup(rawLeague) : fallbackLeague;
    return (group.standings?.entries || []).map((entry, index) => {
      const stat = (name: string) => entry.stats?.find(item => item.name === name);
      const sourceName = entry.team?.displayName || "";
      const mlbTeam = fallbackLeague === "MLB" ? resolveMlbTeam(sourceName) : null;
      return {
        id: mlbTeam ? mlbTeamId(mlbTeam) : String(entry.team?.id || entry.team?.displayName || `${league}-${index}`),
        rank: Number(stat("playoffSeed")?.value || index + 1),
        league,
        division: league,
        team: mlbTeam?.name || sourceName || "Команда",
        wins: Number(stat("wins")?.value || 0),
        losses: Number(stat("losses")?.value || 0),
        pct: stat("winPercent")?.displayValue || ".000",
        gamesBack: stat("gamesBehind")?.displayValue || "-",
        form: stat("streak")?.displayValue || "-"
      };
    });
  }).sort((a, b) => a.league.localeCompare(b.league) || a.rank - b.rank);
}

function translateMlbGroup(value: string): string {
  const normalized = value.toLowerCase();
  const league = /national|\bnl\b/.test(normalized) ? "Национальная лига" : "Американская лига";
  if (/east|восток/.test(normalized)) return `${league} · Восточный дивизион`;
  if (/central|центр/.test(normalized)) return `${league} · Центральный дивизион`;
  if (/west|запад/.test(normalized)) return `${league} · Западный дивизион`;
  return league;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport");
  const league = searchParams.get("league") || "";
  const tour: TennisTour = searchParams.get("tour")?.toUpperCase() === "WTA" ? "WTA" : "ATP";
  const counterStrike = sport === "esports" && /\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(league);

  if (sport === "tennis") {
    try {
      const rankings = await loadTennisRankings();
      const players = tour === "WTA" ? rankings.wta : rankings.atp;
      const standings: StandingRow[] = players.map(player => ({
        id: player.id,
        rank: player.rank,
        league: tour,
        division: "Топ-100",
        team: player.name,
        wins: 0,
        losses: 0,
        pct: "-",
        gamesBack: "-",
        form: "-",
        points: player.points,
        profileUrl: player.profileUrl,
        country: player.country,
        age: player.age,
        tournaments: player.tournaments,
        tour
      }));
      return NextResponse.json(
        {
          sport: "tennis",
          league: `${tour} · Топ-100`,
          source: tour,
          updatedAt: rankings.updatedAt,
          standings
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      console.error(`${tour} standings route failed`, error);
      return NextResponse.json(
        { sport: "tennis", league: `${tour} · Топ-100`, source: tour, standings: [] },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }
  }

  if (counterStrike) {
    try {
      const ranking = await loadHltvRankings();
      const standings: StandingRow[] = ranking.rows.map(row => ({
        id: row.id,
        rank: row.rank,
        league: "COUNTER STRIKE 2",
        division: "топ-100",
        team: row.team,
        wins: 0,
        losses: 0,
        pct: "-",
        gamesBack: "-",
        form: row.change,
        points: row.points,
        change: row.change,
        logo: row.logo,
        profileUrl: row.profileUrl
      }));
      return NextResponse.json(
        {
          sport: "esports",
          league: "COUNTER STRIKE 2 · топ-100",
          source: ranking.source,
          updatedAt: ranking.updatedAt,
          standings
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      console.error("COUNTER STRIKE 2 standings route failed", error);
      return NextResponse.json(
        { sport: "esports", league: "COUNTER STRIKE 2 · топ-100", source: "HLTV", standings: [] },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }
  }

  const standingLeague = BASEBALL_STANDINGS_SLUGS.find(item => item.pattern.test(league));

  if (sport !== "baseball" || !standingLeague) {
    return NextResponse.json({ standings: [] }, { headers: NO_STORE_HEADERS });
  }

  try {
    const standings = await loadBaseballStandings(standingLeague.slug, standingLeague.label);
    if (standingLeague.label === "KBO" && standings.length === 0) {
      return NextResponse.json({ sport: "baseball", league: "KBO", source: "Справочник", standings: KBO_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    if (standingLeague.label === "MLB" && standings.length === 0) {
      return NextResponse.json({ sport: "baseball", league: "MLB", source: "Справочник", standings: MLB_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ sport: "baseball", league: standingLeague.label, source: "ESPN", standings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Standings route failed", error);
    if (standingLeague.label === "KBO") {
      return NextResponse.json({ sport: "baseball", league: "KBO", source: "Справочник", standings: KBO_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    if (standingLeague.label === "MLB") {
      return NextResponse.json({ sport: "baseball", league: "MLB", source: "Справочник", standings: MLB_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ league: standingLeague.label, source: "ESPN", standings: [] }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
