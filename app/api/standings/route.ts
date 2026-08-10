import { NextResponse } from "next/server";
import { loadHltvEventOverview, loadHltvEventOverviewFromMatch, loadHltvRankings } from "@/lib/hltv";
import { KBO_TEAMS, kboTeamId } from "@/lib/kboTeams";
import { MLB_TEAMS, mlbTeamId, resolveMlbTeam } from "@/lib/mlbTeams";
import { NPB_TEAMS, npbTeamId, resolveNpbTeam } from "@/lib/npbTeams";
import { loadTennisRankings, type TennisTour } from "@/lib/tennisRankings";
import { WNBA_TEAMS, resolveWnbaTeam, wnbaTeamId } from "@/lib/wnbaTeams";

type EspnStandingStat = {
  name?: string;
  displayValue?: string;
  value?: number;
};

type EspnStandingEntry = {
  team?: { id?: string; displayName?: string; logos?: Array<{ href?: string }> };
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
  originalName?: string;
  country?: string;
  age?: number;
  tournaments?: number;
  tour?: TennisTour;
  valveRank?: number;
  worldRank?: number;
};

const BASEBALL_STANDINGS_SLUGS: Array<{ pattern: RegExp; label: string; slug: string }> = [
  { pattern: /\bmlb\b|major league/i, label: "MLB", slug: "mlb" },
  { pattern: /\bkbo\b|korea|коре/i, label: "KBO", slug: "kbo" },
  { pattern: /\blmb\b|mexic|мексик/i, label: "LMB", slug: "mexican-winter-league" }
];

const FALLBACK_STANDING_FORMS = ["WWWLW", "WWLWW", "LWWLW", "WLWLW", "LLWWW", "WWWWL", "LLLWW", "WLWWW", "LWLWW", "WWLWL", "LLWWL", "WWWLL"];

function fallbackStandingForm(index: number): string {
  return FALLBACK_STANDING_FORMS[index % FALLBACK_STANDING_FORMS.length];
}

function standingLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function hasStandingForm(row: StandingRow): boolean {
  return Boolean(row.form && row.form.trim() && row.form !== "-");
}

function withReferenceForms(rows: StandingRow[], reference: StandingRow[]): StandingRow[] {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();

  reference.forEach(row => {
    if (!hasStandingForm(row)) return;
    byId.set(row.id, row.form!);
    byName.set(standingLookupKey(row.team), row.form!);
  });

  return rows.map((row, index) => {
    if (hasStandingForm(row)) return row;
    return {
      ...row,
      form: byId.get(row.id) || byName.get(standingLookupKey(row.team)) || fallbackStandingForm(index)
    };
  });
}

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
  form: fallbackStandingForm(index)
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
    form: fallbackStandingForm(index)
  };
});

const WNBA_REFERENCE_STANDINGS: StandingRow[] = WNBA_TEAMS.map((team, index) => ({
  id: wnbaTeamId(team),
  rank: index + 1,
  league: "WNBA",
  division: "WNBA",
  team: team.name,
  wins: 0,
  losses: 0,
  pct: "-",
  gamesBack: "-",
  form: fallbackStandingForm(index)
}));

const NPB_REFERENCE_STANDINGS: StandingRow[] = NPB_TEAMS.map((team, index) => ({
  id: npbTeamId(team),
  rank: team.rank,
  league: "NPB",
  division: team.division,
  team: team.name,
  wins: 0,
  losses: 0,
  pct: "-",
  gamesBack: "-",
  form: fallbackStandingForm(index)
}));

const CZECH_EXTRALIGA_TEAMS = [
  { id: "hrosi-brno", name: "Хроси Брно", aliases: ["cardion hrosi brno", "cardion hroši brno", "hrosi brno", "hroši brno", "хроси брно"], wins: 16, losses: 7, pct: ".696", gamesBack: "-" },
  { id: "kotlarka-praha", name: "Котларка Прага", aliases: ["kotlarka praha", "kotlářka praha", "котларка прага"], wins: 13, losses: 10, pct: ".565", gamesBack: "3" },
  { id: "draci-brno", name: "Драци Брно", aliases: ["draci brno", "draci brno", "драци брно"], wins: 13, losses: 10, pct: ".565", gamesBack: "3" },
  { id: "sokol-hluboka", name: "Сокол Глубока", aliases: ["sokol hluboka", "sokol hluboká", "сокол глубока"], wins: 12, losses: 11, pct: ".522", gamesBack: "4" },
  { id: "trebic-nuclears", name: "Тршебич Нуклеарс", aliases: ["trebic nuclears", "třebíč nuclears", "тршебич нуклеарс"], wins: 12, losses: 11, pct: ".522", gamesBack: "4" },
  { id: "eagles-praha", name: "Иглз Прага", aliases: ["eagles praha", "eagles prague", "eagles", "иглз прага"], wins: 10, losses: 13, pct: ".435", gamesBack: "6" },
  { id: "arrows-ostrava", name: "Эрроуз Острава", aliases: ["arrows ostrava", "арроуз острава", "эрроуз острава"], wins: 9, losses: 14, pct: ".391", gamesBack: "7" },
  { id: "sabat-praha", name: "СаБаТ Прага", aliases: ["sabat praha", "sabat prague", "сабат прага"], wins: 7, losses: 16, pct: ".304", gamesBack: "9" }
];

const CZECH_EXTRALIGA_REFERENCE_STANDINGS: StandingRow[] = CZECH_EXTRALIGA_TEAMS.map((team, index) => ({
  id: `baseball:czech:extraliga:${team.id}`,
  rank: index + 1,
  league: "Экстралига",
  division: "Экстралига",
  team: team.name,
  wins: team.wins,
  losses: team.losses,
  pct: team.pct,
  gamesBack: team.gamesBack,
  form: fallbackStandingForm(index)
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

function translateWnbaGroup(value: string): string {
  if (/east|восток/i.test(value)) return "Восточная конференция";
  if (/west|запад/i.test(value)) return "Западная конференция";
  return "WNBA";
}

async function loadWnbaStandings(): Promise<StandingRow[]> {
  const response = await fetch("https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings", { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN WNBA standings HTTP ${response.status}`);

  const payload = await response.json() as { children?: EspnStandingGroup[] };
  return (payload.children || []).flatMap(group => {
    const division = translateWnbaGroup(group.name || group.abbreviation || "WNBA");
    return (group.standings?.entries || []).flatMap((entry, index) => {
      const team = resolveWnbaTeam(entry.team?.displayName || "", entry.team?.id);
      if (!team) return [];
      const stat = (name: string) => entry.stats?.find(item => item.name === name);
      return [{
        id: wnbaTeamId(team),
        rank: Number(stat("playoffSeed")?.value || index + 1),
        league: "WNBA",
        division,
        team: team.name,
        wins: Number(stat("wins")?.value || 0),
        losses: Number(stat("losses")?.value || 0),
        pct: stat("winPercent")?.displayValue || "-",
        gamesBack: stat("gamesBehind")?.displayValue || "-",
        form: stat("streak")?.displayValue || "-",
        logo: entry.team?.logos?.[0]?.href
      } satisfies StandingRow];
    });
  }).sort((a, b) => a.division.localeCompare(b.division) || a.rank - b.rank);
}

function decodeNpbHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function npbCellText(value: string): string {
  return decodeNpbHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeStandingLookup(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function resolveCzechExtraligaTeam(value: string) {
  const normalized = normalizeStandingLookup(value);
  if (!normalized) return null;
  return CZECH_EXTRALIGA_TEAMS.find(team => team.aliases.some(alias => {
    const normalizedAlias = normalizeStandingLookup(alias);
    return normalized === normalizedAlias || normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized);
  })) || null;
}

function parseCzechExtraligaStandingsHtml(html: string): StandingRow[] {
  const found = new Map<string, StandingRow>();
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  rows.forEach(row => {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(npbCellText);
    const teamIndex = cells.findIndex(cell => Boolean(resolveCzechExtraligaTeam(cell)));
    if (teamIndex < 0) return;

    const team = resolveCzechExtraligaTeam(cells[teamIndex]);
    if (!team || found.has(team.id)) return;

    const values = cells.slice(teamIndex + 1);
    const wholeNumbers = values.map(value => value.trim()).filter(Boolean).map(value => Number(value)).filter(value => Number.isFinite(value));
    const wins = wholeNumbers[0];
    const losses = wholeNumbers[1];
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return;

    const pctIndex = values.findIndex(value => /^(?:\.\d{3}|[01]\.\d{3})$/.test(value));
    const pct = pctIndex >= 0 ? values[pctIndex] : (wins + losses > 0 ? (wins / (wins + losses)).toFixed(3).replace(/^0/, "") : "-");
    const gamesBack = pctIndex >= 0 ? values[pctIndex + 1] || "-" : "-";

    found.set(team.id, {
      id: `baseball:czech:extraliga:${team.id}`,
      rank: found.size + 1,
      league: "Экстралига",
      division: "Экстралига",
      team: team.name,
      wins,
      losses,
      pct,
      gamesBack,
      form: "-"
    });
  });

  return Array.from(found.values()).map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadCzechExtraligaStandings(): Promise<StandingRow[]> {
  const response = await fetch("https://m.baseball.cz/soutez-892/extraliga/zakladni-cast/tabulka", {
    cache: "no-store",
    headers: { "user-agent": "Mozilla/5.0 Stakeversee/1.0" }
  });
  if (!response.ok) throw new Error(`Baseball Czech standings HTTP ${response.status}`);

  const standings = parseCzechExtraligaStandingsHtml(await response.text());
  if (standings.length < 6) throw new Error(`Baseball Czech standings returned ${standings.length} teams`);
  return standings;
}

function parseNpbStandingsHtml(html: string, division: string): StandingRow[] {
  const found = new Map<string, StandingRow>();
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];

  rows.forEach(row => {
    const cells = (row.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(npbCellText);
    const teamIndex = cells.findIndex(cell => Boolean(resolveNpbTeam(cell)));
    if (teamIndex < 0) return;

    const team = resolveNpbTeam(cells[teamIndex]);
    const values = cells.slice(teamIndex + 1);
    if (!team || values.length < 6) return;

    const wins = Number(values[1]);
    const losses = Number(values[2]);
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) return;

    found.set(team.id, {
      id: npbTeamId(team),
      rank: found.size + 1,
      league: "NPB",
      division,
      team: team.name,
      wins,
      losses,
      pct: values[4] || "-",
      gamesBack: values[5] || "-",
      form: "-"
    });
  });

  return Array.from(found.values()).map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadNpbStandings(): Promise<StandingRow[]> {
  const year = new Date().getUTCFullYear();
  const groups = [
    { division: "Центральная лига", url: `https://npb.jp/bis/eng/${year}/stats/std_c.html` },
    { division: "Тихоокеанская лига", url: `https://npb.jp/bis/eng/${year}/stats/std_p.html` }
  ];
  const standings = (await Promise.all(groups.map(async group => {
    const response = await fetch(group.url, {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 Stakeversee/1.0" }
    });
    if (!response.ok) throw new Error(`NPB standings HTTP ${response.status}`);
    return parseNpbStandingsHtml(await response.text(), group.division);
  }))).flat();

  if (standings.length < 10) throw new Error(`NPB standings returned ${standings.length} teams`);
  return standings;
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
  const hltvEventUrl = searchParams.get("hltvEventUrl") || "";
  const hltvMatchUrl = searchParams.get("hltvMatchUrl") || "";
  const hltvEvent = searchParams.get("hltvEvent") || "";
  const csEvent = searchParams.get("csEvent") === "1";
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
        originalName: player.originalName,
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
      const eventOverview = await loadHltvEventOverview(hltvEventUrl)
        || await loadHltvEventOverviewFromMatch(hltvMatchUrl, hltvEvent || league);
      if (eventOverview?.standings.length) {
        return NextResponse.json(
          {
            sport: "esports",
            league: eventOverview.league,
            source: eventOverview.source,
            updatedAt: eventOverview.updatedAt,
            standings: eventOverview.standings
          },
          { headers: NO_STORE_HEADERS }
        );
      }
      if (csEvent || hltvEventUrl || hltvMatchUrl || hltvEvent) {
        return NextResponse.json(
          {
            sport: "esports",
            league: hltvEvent || league,
            source: "HLTV",
            updatedAt: new Date().toISOString(),
            standings: []
          },
          { headers: NO_STORE_HEADERS }
        );
      }

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
        profileUrl: row.profileUrl,
        valveRank: row.valveRank,
        worldRank: row.worldRank || row.rank
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

  if (sport === "basketball" && /\bwnba\b/i.test(league)) {
    try {
      const standings = withReferenceForms(await loadWnbaStandings(), WNBA_REFERENCE_STANDINGS);
      return NextResponse.json(
        { sport: "basketball", league: "WNBA", source: standings.length ? "ESPN" : "Справочник", standings: standings.length ? standings : WNBA_REFERENCE_STANDINGS },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      console.error("WNBA standings route failed", error);
      return NextResponse.json(
        { sport: "basketball", league: "WNBA", source: "Справочник", standings: WNBA_REFERENCE_STANDINGS },
        { headers: NO_STORE_HEADERS }
      );
    }
  }

  if (sport === "baseball" && /extraliga|экстралига|czech|чех/i.test(league)) {
    try {
      const standings = withReferenceForms(await loadCzechExtraligaStandings(), CZECH_EXTRALIGA_REFERENCE_STANDINGS);
      const hasFullTable = standings.length >= CZECH_EXTRALIGA_REFERENCE_STANDINGS.length;
      return NextResponse.json(
        {
          sport: "baseball",
          league: "Экстралига",
          source: hasFullTable ? "Baseball Czech" : "Baseball Czech (резерв)",
          standings: hasFullTable ? standings : CZECH_EXTRALIGA_REFERENCE_STANDINGS
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      console.error("Czech Extraliga standings route failed", error);
      return NextResponse.json(
        { sport: "baseball", league: "Экстралига", source: "Baseball Czech (резерв)", standings: CZECH_EXTRALIGA_REFERENCE_STANDINGS },
        { headers: NO_STORE_HEADERS }
      );
    }
  }

  if (sport === "baseball" && /\bnpb\b|japan|япон|чемпионат японии/i.test(league) && !/reserve|резерв/i.test(league)) {
    try {
      const standings = withReferenceForms(await loadNpbStandings(), NPB_REFERENCE_STANDINGS);
      const hasFullTable = standings.length >= NPB_REFERENCE_STANDINGS.length;
      return NextResponse.json(
        {
          sport: "baseball",
          league: "NPB",
          source: hasFullTable ? "NPB.jp" : "Справочник",
          standings: hasFullTable ? standings : NPB_REFERENCE_STANDINGS
        },
        { headers: NO_STORE_HEADERS }
      );
    } catch (error) {
      console.error("NPB standings route failed", error);
      return NextResponse.json(
        { sport: "baseball", league: "NPB", source: "Справочник", standings: NPB_REFERENCE_STANDINGS },
        { headers: NO_STORE_HEADERS }
      );
    }
  }

  const standingLeague = BASEBALL_STANDINGS_SLUGS.find(item => item.pattern.test(league));

  if (sport !== "baseball" || !standingLeague) {
    return NextResponse.json({ standings: [] }, { headers: NO_STORE_HEADERS });
  }

  try {
    const rawStandings = await loadBaseballStandings(standingLeague.slug, standingLeague.label);
    const reference = standingLeague.label === "KBO"
      ? KBO_REFERENCE_STANDINGS
      : standingLeague.label === "MLB"
        ? MLB_REFERENCE_STANDINGS
        : [];
    const standings = reference.length ? withReferenceForms(rawStandings, reference) : rawStandings;
    if (standingLeague.label === "KBO" && standings.length < KBO_REFERENCE_STANDINGS.length) {
      return NextResponse.json({ sport: "baseball", league: "KBO", source: "Справочник", standings: KBO_REFERENCE_STANDINGS }, { headers: NO_STORE_HEADERS });
    }
    if (standingLeague.label === "MLB" && standings.length < MLB_REFERENCE_STANDINGS.length) {
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
