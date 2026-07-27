import { NextResponse } from "next/server";

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
};

const MLB_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0"
};

async function loadMlbStandings(): Promise<StandingRow[]> {
  const response = await fetch(MLB_STANDINGS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN MLB standings HTTP ${response.status}`);

  const payload = await response.json() as { children?: EspnStandingGroup[] };
  return (payload.children || []).flatMap(group => {
    const league = group.name || group.abbreviation || "MLB";
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
        gamesBack: stat("gamesBehind")?.displayValue || "-"
      };
    });
  }).sort((a, b) => a.league.localeCompare(b.league) || a.rank - b.rank);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport");
  const league = searchParams.get("league");

  if (sport !== "baseball" || (league && !/mlb/i.test(league))) {
    return NextResponse.json({ standings: [] }, { headers: NO_STORE_HEADERS });
  }

  try {
    const standings = await loadMlbStandings();
    return NextResponse.json({ sport: "baseball", league: "MLB", standings }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Standings route failed", error);
    return NextResponse.json({ standings: [] }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
