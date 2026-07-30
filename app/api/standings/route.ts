import { NextResponse } from "next/server";
import { KBO_TEAMS, kboTeamId } from "@/lib/kboTeams";

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
    const league = group.name || group.abbreviation || fallbackLeague;
    return (group.standings?.entries || []).map((entry, index) => {
      const stat = (name: string) => entry.stats?.find(item => item.name === name);
      return {
        id: String(entry.team?.id || entry.team?.displayName || `${league}-${index}`),
        rank: Number(stat("playoffSeed")?.value || index + 1),
        league,
        division: league,
        team: entry.team?.displayName || "Team",
        wins: Number(stat("wins")?.value || 0),
        losses: Number(stat("losses")?.value || 0),
        pct: stat("winPercent")?.displayValue || ".000",
        gamesBack: stat("gamesBehind")?.displayValue || "-",
        form: stat("streak")?.displayValue || "-"
      };
    });
  }).sort((a, b) => a.league.localeCompare(b.league) || a.rank - b.rank);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport");
  const league = searchParams.get("league") || "";
  const standingLeague = BASEBALL_STANDINGS_SLUGS.find(item => item.pattern.test(league));

  if (sport !== "baseball" || !standingLeague) {
    return NextResponse.json({ standings: [] }, { headers: NO_STORE_HEADERS });
  }

  try {
    const standings = await loadBaseballStandings(standingLeague.slug, standingLeague.label);
    if (standingLeague.label === "KBO" && standings.length === 0) {
      return NextResponse.json({ sport: "baseball", league: "KBO", source: "Reference", standings: KBO_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ sport: "baseball", league: standingLeague.label, source: "ESPN", standings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Standings route failed", error);
    if (standingLeague.label === "KBO") {
      return NextResponse.json({ sport: "baseball", league: "KBO", source: "Reference", standings: KBO_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ league: standingLeague.label, source: "ESPN", standings: [] }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
