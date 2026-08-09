"use client";

import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { type Lang, localeFor, translate, translateBetMarket, translateBetSelectionLine, translateBookmakerLabel, useLanguage } from "@/lib/i18n";
import { inferFootballCountry, isWorldCountry } from "@/lib/footballCountries";
import {
  isKboMatchContext,
  kboTeamId,
  resolveKboTeam,
  type KboTeamProfile
} from "@/lib/kboTeams";
import {
  isMlbMatchContext,
  mlbTeamId,
  resolveMlbTeam,
  type MlbTeamProfile
} from "@/lib/mlbTeams";
import {
  isNpbMatchContext,
  npbTeamId,
  resolveNpbTeam,
  type NpbTeamProfile
} from "@/lib/npbTeams";
import {
  czechBaseballTeamId,
  isCzechBaseballMatchContext,
  resolveCzechBaseballTeam,
  type CzechBaseballTeamProfile
} from "@/lib/czechBaseballTeams";
import {
  isWnbaMatchContext,
  resolveWnbaTeam,
  wnbaTeamId,
  type WnbaTeamProfile
} from "@/lib/wnbaTeams";

type AuthMode = "login" | "register";
type AuthStatus = "idle" | "loading" | "ok" | "error";

type SourceRow = {
  id: string;
  name: string;
  is_blacklisted: boolean;
  fixed_stake: number | null;
};

type SourceStakeMap = Record<string, number | string | null | undefined>;

type ProfileRow = {
  login: string | null;
};

type BetRow = {
  id: string;
  source_id: string | null;
  extra_source_ids: string[] | null;
  event_name: string;
  sport: string | null;
  bookmaker: string | null;
  is_freebet: boolean;
  market: string;
  selection: string;
  odds: number | string;
  stake: number | string;
  source_stakes: SourceStakeMap | null;
  result: "pending" | "win" | "loss" | "return";
  profit: number | string | null;
  settled_at: string | null;
  created_at: string;
};

type BankrollEventRow = {
  id: string;
  bet_id: string | null;
  amount: number | string;
  kind: "deposit" | "withdrawal" | "stake" | "win" | "loss" | "return" | "adjustment";
  note: string | null;
  created_at: string;
};

type MatchRow = {
  id: string;
  sport: string;
  country: string;
  league: string;
  time: string;
  home: string;
  away: string;
  odds: string[];
  bookmakerOdds?: Partial<Record<MatchBookmakerKey, string[]>>;
  bestBookmakers?: string[];
  confidence: number;
  recommendationSide: "home" | "draw" | "away";
  startsAt?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  tennisTour?: TennisTour;
  homePlayers?: TennisParticipant[];
  awayPlayers?: TennisParticipant[];
  standingsOnly?: boolean;
};

type TennisTour = "ATP" | "WTA";

type TennisParticipant = {
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
};

type EsportsTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "COUNTER STRIKE 2";
  country: "Мир";
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
  points?: number;
  change?: string;
  profileUrl?: string;
  kind: "esports";
};

type BaseballTeamCard = KboTeamProfile | MlbTeamProfile | NpbTeamProfile | CzechBaseballTeamProfile;
type LeagueTeamCard = BaseballTeamCard | WnbaTeamProfile;
type TennisPlayerProfile = {
  id: string;
  name: string;
  shortName: string;
  league: TennisTour | "Теннис";
  country: string;
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  points?: number;
  age?: number;
  tournaments?: number;
  profileUrl?: string;
  kind: "tennis";
};

type GenericTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: string;
  country: string;
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
  kind: "generic";
};

type TeamCard = LeagueTeamCard | EsportsTeamProfile | TennisPlayerProfile | GenericTeamProfile;

type MatchBookmakerKey = "best" | "pari" | "fonbet" | "tennisi";

type CouponItem = {
  id: string;
  matchId: string;
  eventName: string;
  sport: string;
  market: string;
  selection: string;
  odds: string;
};

type MatchesStatusState = {
  kind: "idle" | "cache" | "live" | "unavailable";
  count?: number;
};

function matchesStatusLabel(status: MatchesStatusState, t: (text: string) => string): string {
  if (status.kind === "cache") return `${t("Из кэша:")} ${status.count} ${t("матчей")}`;
  if (status.kind === "live") return `${t("Автообновлено:")} ${status.count} ${t("матчей")}`;
  if (status.kind === "unavailable") return t("Линия букмекеров пока не подключена");
  return t("Автообновление каждые 5 минут");
}

const MATCH_CACHE_KEY = "stakeversee:line-matches:v31";
const FAVORITE_TEAMS_KEY = "stakeversee:favorite-teams:v1";
const MATCH_CACHE_FALLBACK_KEYS = [
  MATCH_CACHE_KEY,
  "stakeversee:line-matches:v13",
  "stakeversee:line-matches:v12",
  "stakeversee:line-matches:v11",
  "stakeversee:line-matches:v10",
  "stakeversee:line-matches:v9",
  "stakeversee:line-matches:v8"
];

const MAX_COUPON_ITEMS = 5;
const BASE_BANKROLL = 10000;

const bookmakerOptions = [
  "PARI",
  "Fonbet",
  "TENNISI",
  "Олимп",
  "Мелбет",
  "BetBoom",
  "Winline",
  "Leon",
  "Лига Ставок",
  "Марафон",
  "Тестовая ставка"
];
const RU_TO_LAT: Record<string, string> = {
  "а": "a",
  "б": "b",
  "в": "v",
  "г": "g",
  "д": "d",
  "е": "e",
  "ё": "e",
  "ж": "zh",
  "з": "z",
  "и": "i",
  "й": "y",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "х": "h",
  "ц": "ts",
  "ч": "ch",
  "ш": "sh",
  "щ": "sch",
  "ъ": "",
  "ы": "y",
  "ь": "",
  "э": "e",
  "ю": "yu",
  "я": "ya"
};

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-яё]+/gi, " ")
    .trim();
}

function transliterateRu(value: string): string {
  return normalizeSearchValue(value)
    .split("")
    .map(char => RU_TO_LAT[char] ?? char)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokenGroups(query: string): string[][] {
  return normalizeSearchValue(query)
    .split(/\s+/)
    .filter(Boolean)
    .map(token => Array.from(new Set([token, transliterateRu(token)].filter(Boolean))));
}

function searchHaystack(...parts: string[]): string {
  const normalized = normalizeSearchValue(parts.join(" "));
  const transliterated = transliterateRu(normalized);
  return `${normalized} ${transliterated}`;
}

function compactMatchName(value: string): string {
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

function clientBaseballTeamKey(value: string, teamId?: string): string {
  return clientBaseballTeamCard(value, teamId)?.id || compactMatchName(value);
}

function clientBaseballTeamCard(value: string, teamId?: string): BaseballTeamCard | null {
  const normalizedTeamId = String(teamId || "").toLowerCase();
  if (normalizedTeamId.includes(":japan:") || normalizedTeamId.includes(":npb:")) {
    return resolveNpbTeam(value, teamId) || resolveKboTeam(value, teamId) || resolveMlbTeam(value, teamId) || resolveCzechBaseballTeam(value, teamId);
  }
  if (normalizedTeamId.includes(":usa:") || normalizedTeamId.includes(":mlb:")) {
    return resolveMlbTeam(value, teamId) || resolveKboTeam(value, teamId) || resolveNpbTeam(value, teamId) || resolveCzechBaseballTeam(value, teamId);
  }
  if (normalizedTeamId.includes(":korea:") || normalizedTeamId.includes(":kbo:")) {
    return resolveKboTeam(value, teamId) || resolveMlbTeam(value, teamId) || resolveNpbTeam(value, teamId) || resolveCzechBaseballTeam(value, teamId);
  }
  return resolveKboTeam(value, teamId) || resolveNpbTeam(value, teamId) || resolveMlbTeam(value, teamId) || resolveCzechBaseballTeam(value, teamId);
}

function clientBaseballTeamId(card: BaseballTeamCard): string {
  if (card.league === "KBO") return kboTeamId(card);
  if (card.league === "MLB") return mlbTeamId(card);
  if (card.league === "NPB") return npbTeamId(card);
  return czechBaseballTeamId(card);
}

function clientLeagueTeamCard(value: string, teamId?: string): LeagueTeamCard | null {
  if (teamId?.startsWith("basketball:")) return resolveWnbaTeam(value, teamId);
  if (teamId?.startsWith("baseball:")) return clientBaseballTeamCard(value, teamId);

  const wnbaTeam = resolveWnbaTeam(value, teamId);
  const baseballTeam = clientBaseballTeamCard(value, teamId);
  if (wnbaTeam && !baseballTeam) return wnbaTeam;
  return baseballTeam || wnbaTeam;
}

function clientLeagueTeamId(card: LeagueTeamCard): string {
  return card.league === "WNBA" ? wnbaTeamId(card) : clientBaseballTeamId(card);
}

function favoriteTeamKeyFromParts(sport: string, league: string, name: string, teamId?: string): string {
  return [sport || "sport", league || "league", teamId || compactMatchName(name)]
    .map(part => compactMatchName(String(part)))
    .join(":");
}

function favoriteTeamKeyFromCard(card: TeamCard): string {
  const cardKind = "kind" in card ? card.kind : "";
  if (cardKind === "generic") return card.id;
  const sport = card.league === "WNBA"
    ? "basketball"
    : ["KBO", "MLB", "NPB"].includes(String(card.league)) || String(card.id).startsWith("baseball:")
      ? "baseball"
      : cardKind || String(card.league).toLowerCase();
  return favoriteTeamKeyFromParts(sport, String(card.league), card.name, card.id);
}

function genericTeamCard(match: MatchRow, side: "home" | "away"): GenericTeamProfile {
  const name = side === "home" ? match.home : match.away;
  const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
  const shortName = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0] || "")
    .join("")
    .slice(0, 3)
    .toUpperCase() || "TM";

  return {
    id: favoriteTeamKeyFromParts(match.sport, match.league, name, teamId),
    name,
    shortName,
    league: match.league || match.sport,
    country: match.country || "Мир",
    logo: shortName,
    rank: 0,
    form: "WWWLL",
    aliases: [name],
    kind: "generic"
  };
}

function standingsRowMatchesTeam(row: StandingRow, match: MatchRow, side: "home" | "away"): boolean {
  const targetName = side === "home" ? match.home : match.away;
  const targetId = side === "home" ? match.homeTeamId : match.awayTeamId;
  if (targetId && row.id === targetId) return true;

  const rowLeagueCard = clientLeagueTeamCard(row.team, row.id);
  const targetLeagueCard = clientLeagueTeamCard(targetName, targetId);
  if (rowLeagueCard && targetLeagueCard && clientLeagueTeamId(rowLeagueCard) === clientLeagueTeamId(targetLeagueCard)) return true;

  if (match.sport === "esports") return esportsTeamNamesMatch(row.team, targetName);
  if (match.sport === "tennis") return tennisPlayerNamesMatch(row.team, targetName);

  const rowCompact = compactMatchName(row.team);
  const targetCompact = compactMatchName(targetName);
  const rowSearch = searchHaystack(row.team, row.id, row.originalName || "");
  const targetSearch = searchHaystack(targetName, targetId || "");
  return Boolean(
    rowCompact && targetCompact && (rowCompact === targetCompact || rowCompact.includes(targetCompact) || targetCompact.includes(rowCompact))
  ) || rowSearch.includes(targetSearch) || targetSearch.includes(rowSearch);
}

function normalizeClientMatch(match: MatchRow): MatchRow {
  if (match.sport === "basketball" && isWnbaMatchContext(match.country, match.league, match.home, match.away)) {
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
  if (match.sport === "football" && isWorldCountry(match.country)) {
    const inferredCountry = inferFootballCountry(match.league);
    return { ...match, country: inferredCountry || "World" };
  }
  if (isCounterStrikeMatch(match)) {
    return { ...match, league: normalizeCounterStrikeLeague(match.league) };
  }
  if (match.sport !== "baseball") return match;
  const homeCard = resolveKboTeam(match.home, match.homeTeamId);
  const awayCard = resolveKboTeam(match.away, match.awayTeamId);

  if (isKboMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "South Korea",
      league: "KBO",
      home: homeCard?.name || match.home,
      away: awayCard?.name || match.away,
      homeTeamId: homeCard ? kboTeamId(homeCard) : match.homeTeamId,
      awayTeamId: awayCard ? kboTeamId(awayCard) : match.awayTeamId
    };
  }

  const baseballContext = compactMatchName(`${match.country} ${match.league}`);
  const isNpbReserve = /reserve|резерв|farm|minor/.test(baseballContext)
    && /\bnpb\b|japan|япон|чемпионат японии/.test(baseballContext);
  if (isNpbReserve) {
    return {
      ...match,
      country: "Japan",
      league: "NPB. Резерв",
      homeTeamId: `baseball:japan:npb-reserve:${compactMatchName(match.home)}`,
      awayTeamId: `baseball:japan:npb-reserve:${compactMatchName(match.away)}`
    };
  }

  const npbHomeCard = resolveNpbTeam(match.home, match.homeTeamId);
  const npbAwayCard = resolveNpbTeam(match.away, match.awayTeamId);
  if (isNpbMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "Japan",
      league: "NPB",
      home: npbHomeCard?.name || match.home,
      away: npbAwayCard?.name || match.away,
      homeTeamId: npbHomeCard ? npbTeamId(npbHomeCard) : match.homeTeamId,
      awayTeamId: npbAwayCard ? npbTeamId(npbAwayCard) : match.awayTeamId
    };
  }

  const mlbHomeCard = resolveMlbTeam(match.home, match.homeTeamId);
  const mlbAwayCard = resolveMlbTeam(match.away, match.awayTeamId);
  if (isMlbMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "USA",
      league: "MLB",
      home: mlbHomeCard?.name || match.home,
      away: mlbAwayCard?.name || match.away,
      homeTeamId: mlbHomeCard ? mlbTeamId(mlbHomeCard) : match.homeTeamId,
      awayTeamId: mlbAwayCard ? mlbTeamId(mlbAwayCard) : match.awayTeamId
    };
  }

  const czechHomeCard = resolveCzechBaseballTeam(match.home, match.homeTeamId);
  const czechAwayCard = resolveCzechBaseballTeam(match.away, match.awayTeamId);
  if (isCzechBaseballMatchContext(match.country, match.league, match.home, match.away)) {
    return {
      ...match,
      country: "Czech Republic",
      league: "Экстралига",
      home: czechHomeCard?.name || match.home,
      away: czechAwayCard?.name || match.away,
      homeTeamId: czechHomeCard ? czechBaseballTeamId(czechHomeCard) : match.homeTeamId,
      awayTeamId: czechAwayCard ? czechBaseballTeamId(czechAwayCard) : match.awayTeamId
    };
  }

  const homeKey = clientBaseballTeamKey(match.home, match.homeTeamId);
  const awayKey = clientBaseballTeamKey(match.away, match.awayTeamId);
  const full = compactMatchName(`${match.country} ${match.league}`);
  if (/lmb|mexico|мексик/.test(full)) {
    return {
      ...match,
      country: "Mexico",
      league: "LMB",
      homeTeamId: `baseball:mexico:lmb:${homeKey}`,
      awayTeamId: `baseball:mexico:lmb:${awayKey}`
    };
  }

  return match;
}

function bestClientOdds(bookmakerOdds?: Partial<Record<MatchBookmakerKey, string[]>>): { odds: string[]; labels: string[] } {
  const entries = Object.entries(bookmakerOdds || {}) as Array<[MatchBookmakerKey, string[]]>;
  const odds = [0, 1, 2].map(index => {
    const best = entries
      .map(([bookmaker, values]) => ({ bookmaker, value: String(values?.[index] || "-") }))
      .map(item => ({ ...item, numeric: Number(item.value.replace(",", ".")) }))
      .filter(item => Number.isFinite(item.numeric) && item.numeric > 0)
      .sort((a, b) => b.numeric - a.numeric)[0];
    return best?.value || "-";
  });
  const labels = [0, 1, 2].map(index => {
    const best = entries
      .map(([bookmaker, values]) => ({ bookmaker, value: String(values?.[index] || "-") }))
      .map(item => ({ ...item, numeric: Number(item.value.replace(",", ".")) }))
      .filter(item => Number.isFinite(item.numeric) && item.numeric > 0)
      .sort((a, b) => b.numeric - a.numeric)[0];
    return best ? MATCH_BOOKMAKER_LABELS[best.bookmaker] : "";
  });
  return { odds, labels };
}

function baseballMatchPairKey(match: MatchRow): string | null {
  if (match.sport !== "baseball") return null;
  if (isKboMatchContext(match.country, match.league, match.home, match.away)) {
    const home = resolveKboTeam(match.home, match.homeTeamId);
    const away = resolveKboTeam(match.away, match.awayTeamId);
    return home && away ? `KBO|${[home.id, away.id].sort().join("~")}` : null;
  }
  if (isMlbMatchContext(match.country, match.league, match.home, match.away)) {
    const home = resolveMlbTeam(match.home, match.homeTeamId);
    const away = resolveMlbTeam(match.away, match.awayTeamId);
    return home && away ? `MLB|${[home.id, away.id].sort().join("~")}` : null;
  }
  if (isNpbMatchContext(match.country, match.league, match.home, match.away)) {
    const home = resolveNpbTeam(match.home, match.homeTeamId);
    const away = resolveNpbTeam(match.away, match.awayTeamId);
    return home && away ? `NPB|${[home.id, away.id].sort().join("~")}` : null;
  }
  if (isCzechBaseballMatchContext(match.country, match.league, match.home, match.away)) {
    const home = resolveCzechBaseballTeam(match.home, match.homeTeamId);
    const away = resolveCzechBaseballTeam(match.away, match.awayTeamId);
    return home && away ? `CZECH|${[home.id, away.id].sort().join("~")}` : null;
  }
  return null;
}

function wnbaMatchPairKey(match: MatchRow): string | null {
  if (match.sport !== "basketball" || !isWnbaMatchContext(match.country, match.league, match.home, match.away)) return null;
  const home = resolveWnbaTeam(match.home, match.homeTeamId);
  const away = resolveWnbaTeam(match.away, match.awayTeamId);
  return home && away ? `WNBA|${[home.id, away.id].sort().join("~")}` : null;
}

function footballMatchPairKey(match: MatchRow): string | null {
  if (match.sport !== "football") return null;
  const home = compactMatchName(match.home);
  const away = compactMatchName(match.away);
  return home && away ? [home, away].sort().join("~") : null;
}

function isCounterStrikeMatch(match: MatchRow): boolean {
  return match.sport === "esports" && /\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(match.league);
}

function normalizeCounterStrikeLeague(value: string): string {
  const tournament = value
    .replace(/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/gi, " ")
    .replace(/\s*[-–—·:.]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ["COUNTER STRIKE 2", tournament].filter(Boolean).join(" ");
}

function compactEsportsTeamName(value: string): string {
  const compact = normalizeSearchValue(value)
    .replace(/\b(team|vivo|academy|академия|challengers?|esports?|киберспорт)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    "bc game": "bcg",
    "bc gaming": "bcg",
    "bcg": "bcg",
    "life s a game": "lag",
    "life a game": "lag",
    "keyd stars": "keyd",
    "natus vincere": "navi",
    "virtus pro": "virtus pro"
  };
  return aliases[compact] || compact;
}

function esportsTeamNamesMatch(left: string, right: string): boolean {
  const leftKey = compactEsportsTeamName(left);
  const rightKey = compactEsportsTeamName(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (Math.min(leftKey.length, rightKey.length) < 4) return false;
  return leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function esportsStandingForTeam(team: string, rows: StandingRow[]): StandingRow | null {
  return rows.find(row => esportsTeamNamesMatch(row.team, team)) || null;
}

function esportsTeamCard(team: string, standing?: StandingRow | null): EsportsTeamProfile {
  const canonicalName = standing?.team || team;
  return {
    id: standing?.id || `cs:${compactEsportsTeamName(team)}`,
    name: canonicalName,
    shortName: canonicalName,
    league: "COUNTER STRIKE 2",
    country: "Мир",
    logo: standing?.logo || canonicalName.slice(0, 3).toUpperCase(),
    rank: standing?.rank || 0,
    form: standing?.change || "-",
    aliases: Array.from(new Set([team, canonicalName])).filter(Boolean),
    wins: 0,
    losses: 0,
    pct: "-",
    gamesBack: "-",
    points: standing?.points,
    change: standing?.change,
    profileUrl: standing?.profileUrl,
    kind: "esports"
  };
}

function isEsportsTeamCard(card: TeamCard): card is EsportsTeamProfile {
  return "kind" in card && card.kind === "esports";
}

function isTennisPlayerCard(card: TeamCard): card is TennisPlayerProfile {
  return "kind" in card && card.kind === "tennis";
}

function tennisPlayerCard(player: TennisParticipant | StandingRow): TennisPlayerProfile {
  const isParticipant = "sourceName" in player;
  const name = String("name" in player ? player.name : player.team);
  const tour = (player.tour === "WTA" ? "WTA" : player.tour === "ATP" ? "ATP" : "Теннис");
  const country = String(player.country || "Мир");
  return {
    id: player.id,
    name,
    shortName: name,
    league: tour,
    country,
    logo: name.slice(0, 2).toUpperCase(),
    rank: Number(player.rank || 0),
    form: "-",
    aliases: Array.from(new Set([
      name,
      player.originalName || "",
      isParticipant ? player.sourceName : ""
    ])).filter(Boolean),
    points: player.points === null || player.points === undefined ? undefined : Number(player.points),
    age: player.age,
    tournaments: player.tournaments,
    profileUrl: player.profileUrl,
    kind: "tennis"
  };
}

function tennisPlayerNamesMatch(left: string, right: string): boolean {
  const leftKey = normalizeSearchValue(left);
  const rightKey = normalizeSearchValue(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  const leftParts = leftKey.split(" ");
  const rightParts = rightKey.split(" ");
  const leftSurname = leftParts[leftParts.length - 1] || "";
  const rightSurname = rightParts[rightParts.length - 1] || "";
  return leftSurname.length >= 4 && rightSurname.length >= 4
    && (leftSurname.includes(rightSurname) || rightSurname.includes(leftSurname));
}

function normalizeStandingRows(rows: unknown[]): StandingRow[] {
  return rows.map((value, index) => {
    const row = (value || {}) as Partial<StandingRow> & Record<string, unknown>;
    return {
      id: String(row.id || `${row.team || "team"}-${index}`),
      rank: Number(row.rank || index + 1),
      league: String(row.league || "MLB"),
      division: String(row.division || "Division"),
      team: String(row.team || ""),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      pct: String(row.pct || ".000"),
      gamesBack: String(row.gamesBack || "-"),
      form: String(row.form || "-"),
      points: row.points === undefined ? undefined : Number(row.points),
      change: row.change === undefined ? undefined : String(row.change),
      logo: row.logo === undefined ? undefined : String(row.logo),
      profileUrl: row.profileUrl === undefined ? undefined : String(row.profileUrl),
      originalName: row.originalName === undefined ? undefined : String(row.originalName),
      country: row.country === undefined ? undefined : String(row.country),
      age: row.age === undefined ? undefined : Number(row.age),
      tournaments: row.tournaments === undefined ? undefined : Number(row.tournaments),
      tour: (row.tour === "WTA" ? "WTA" : row.tour === "ATP" ? "ATP" : undefined) as TennisTour | undefined
    };
  }).filter(row => row.team);
}

function formatStandingForm(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "⚪⚪⚪⚪⚪";
  const upper = raw.toUpperCase();
  const win = "🟢";
  const loss = "🔴";
  const draw = "🟡";
  const unknown = "⚪";
  const streak = upper.match(/^([WLDВПН])\s*(\d+)$/);
  if (streak) {
    const [, mark, countValue] = streak;
    const count = Math.min(5, Math.max(1, Number(countValue) || 1));
    const symbol = mark === "W" || mark === "В" ? win : mark === "D" || mark === "Н" ? draw : loss;
    return `${symbol.repeat(count)}${unknown.repeat(5 - count)}`;
  }
  const marks = Array.from(upper.replace(/[^WLDВПН]/g, "")).slice(0, 5);
  if (!marks.length) return raw;
  const symbols = marks.map(mark => {
    if (mark === "W" || mark === "В") return win;
    if (mark === "D" || mark === "Н") return draw;
    return loss;
  });
  return `${symbols.join("")}${unknown.repeat(Math.max(0, 5 - symbols.length))}`;
}

function esportsMatchPairKey(match: MatchRow): string | null {
  if (match.sport !== "esports") return null;
  const home = compactEsportsTeamName(match.home);
  const away = compactEsportsTeamName(match.away);
  return home && away ? [home, away].sort().join("~") : null;
}

function esportsBoFormat(value: string): string | null {
  const match = value.match(/\b(?:bo|best\s+of)\s*(\d+)\b/i);
  return match ? `BO${match[1]}` : null;
}

function esportsDisciplineName(value: string): string {
  if (/\b(league\s+of\s+legends|lol)\b/i.test(value)) return "LoL";
  if (/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/i.test(value)) return "COUNTER STRIKE 2";
  if (/\b(dota\s*2?|дота)\b/i.test(value)) return "Dota 2";
  if (/\b(call\s+of\s+duty|cod)\b/i.test(value)) return "Call of Duty";
  if (/\bvalorant\b/i.test(value)) return "Valorant";
  if (/\boverwatch\b/i.test(value)) return "Overwatch";
  if (/\brainbow\s*six\b/i.test(value)) return "Rainbow Six";
  if (/\bstarcraft\b/i.test(value)) return "StarCraft";
  return "Киберспорт";
}

function esportsLeaguePresentation(value: string): { discipline: string; league: string } {
  const discipline = esportsDisciplineName(value);
  const bo = esportsBoFormat(value);
  let league = value;

  if (discipline === "LoL") league = league.replace(/\b(league\s+of\s+legends|lol)\b/gi, " ");
  if (discipline === "COUNTER STRIKE 2") {
    league = league.replace(/\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:2|go)|кс[\s.:-]*(?:2|го)?)\b/gi, " ");
  }
  if (discipline === "Dota 2") league = league.replace(/\b(dota\s*2?|дота)\b/gi, " ");
  if (discipline === "Call of Duty") league = league.replace(/\b(call\s+of\s+duty|cod)\b/gi, " ");
  if (discipline === "Valorant") league = league.replace(/\bvalorant\b/gi, " ");
  if (discipline === "Overwatch") league = league.replace(/\boverwatch\b/gi, " ");
  if (discipline === "Rainbow Six") league = league.replace(/\brainbow\s*six\b/gi, " ");
  if (discipline === "StarCraft") league = league.replace(/\bstarcraft\b/gi, " ");
  if (bo) league = league.replace(new RegExp(`\\b${bo}\\b`, "gi"), " ");

  const tournament = league
    .replace(/\s*[-–—·:.]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    discipline,
    league: [tournament, bo].filter(Boolean).join(". ")
  };
}

function preferredEsportsLeague(current: string, next: string): string {
  const currentBo = esportsBoFormat(current);
  const nextBo = esportsBoFormat(next);
  if (!currentBo && nextBo) return next;
  if (currentBo && !nextBo) return current;
  return current.length >= next.length ? current : next;
}

function mergeClientMatches(matches: MatchRow[]): MatchRow[] {
  const byKey = new Map<string, MatchRow>();

  matches.map(normalizeClientMatch).forEach(match => {
    const startKey = match.startsAt ? Math.round(new Date(match.startsAt).getTime() / (15 * 60 * 1000)) : compactMatchName(match.time);
    const homeKey = match.sport === "baseball"
      ? clientBaseballTeamKey(match.home, match.homeTeamId)
      : match.sport === "basketball"
        ? resolveWnbaTeam(match.home, match.homeTeamId)?.id || compactMatchName(match.home)
        : compactMatchName(match.home);
    const awayKey = match.sport === "baseball"
      ? clientBaseballTeamKey(match.away, match.awayTeamId)
      : match.sport === "basketball"
        ? resolveWnbaTeam(match.away, match.awayTeamId)?.id || compactMatchName(match.away)
        : compactMatchName(match.away);
    const teamKey = [homeKey, awayKey].sort().join("~");
    const key = [
      match.sport,
      startKey,
      compactMatchName(match.country),
      compactMatchName(match.league),
      teamKey
    ].join("|");
    const baseballPairKey = baseballMatchPairKey(match);
    const existingBaseballKey = baseballPairKey
      ? Array.from(byKey.entries()).find(([, candidate]) => {
          if (baseballMatchPairKey(candidate) !== baseballPairKey) return false;
          const matchStart = match.startsAt ? new Date(match.startsAt).getTime() : 0;
          const candidateStart = candidate.startsAt ? new Date(candidate.startsAt).getTime() : 0;
          return matchStart && candidateStart
            ? Math.abs(matchStart - candidateStart) <= 90 * 60 * 1000
            : compactMatchName(match.time) === compactMatchName(candidate.time);
        })?.[0]
      : undefined;
    const wnbaPairKey = wnbaMatchPairKey(match);
    const existingWnbaKey = wnbaPairKey
      ? Array.from(byKey.entries()).find(([, candidate]) => {
          if (wnbaMatchPairKey(candidate) !== wnbaPairKey) return false;
          const matchStart = match.startsAt ? new Date(match.startsAt).getTime() : 0;
          const candidateStart = candidate.startsAt ? new Date(candidate.startsAt).getTime() : 0;
          return matchStart && candidateStart
            ? Math.abs(matchStart - candidateStart) <= 90 * 60 * 1000
            : compactMatchName(match.time) === compactMatchName(candidate.time);
        })?.[0]
      : undefined;
    const footballPairKey = footballMatchPairKey(match);
    const existingFootballKey = footballPairKey
      ? Array.from(byKey.entries()).find(([, candidate]) => {
          if (footballMatchPairKey(candidate) !== footballPairKey) return false;
          const matchStart = match.startsAt ? new Date(match.startsAt).getTime() : 0;
          const candidateStart = candidate.startsAt ? new Date(candidate.startsAt).getTime() : 0;
          return matchStart && candidateStart
            ? Math.abs(matchStart - candidateStart) <= 3 * 60 * 60 * 1000
            : compactMatchName(match.time) === compactMatchName(candidate.time);
        })?.[0]
      : undefined;
    const esportsPairKey = esportsMatchPairKey(match);
    const existingEsportsKey = esportsPairKey
      ? Array.from(byKey.entries()).find(([, candidate]) => {
          if (esportsMatchPairKey(candidate) !== esportsPairKey) return false;
          const matchStart = match.startsAt ? new Date(match.startsAt).getTime() : 0;
          const candidateStart = candidate.startsAt ? new Date(candidate.startsAt).getTime() : 0;
          return matchStart && candidateStart
            ? Math.abs(matchStart - candidateStart) <= 90 * 60 * 1000
            : compactMatchName(match.time) === compactMatchName(candidate.time);
        })?.[0]
      : undefined;
    const resolvedKey = existingBaseballKey || existingWnbaKey || existingFootballKey || existingEsportsKey || key;
    const current = byKey.get(resolvedKey);

    if (!current) {
      byKey.set(key, match);
      return;
    }

    const bookmakerOdds = { ...current.bookmakerOdds, ...match.bookmakerOdds };
    const best = bestClientOdds(bookmakerOdds);
    const chosen = match.confidence > current.confidence ? match : current;
    const mergedOdds = best.odds.some(odd => odd && odd !== "-") ? best.odds : current.odds;
    const canonicalHome = clientLeagueTeamCard(current.home, current.homeTeamId);
    const canonicalAway = clientLeagueTeamCard(current.away, current.awayTeamId);
    const canonicalLeague = baseballPairKey?.startsWith("KBO|")
      ? "KBO"
      : baseballPairKey?.startsWith("MLB|")
        ? "MLB"
        : baseballPairKey?.startsWith("NPB|")
          ? "NPB"
          : wnbaPairKey
            ? "WNBA"
            : existingEsportsKey
              ? preferredEsportsLeague(current.league, match.league)
              : current.league;
    const canonicalCountry = canonicalLeague === "KBO"
      ? "South Korea"
      : canonicalLeague === "MLB"
        ? "USA"
        : canonicalLeague === "NPB"
          ? "Japan"
          : canonicalLeague === "WNBA"
            ? "USA"
            : existingFootballKey && isWorldCountry(current.country)
              ? match.country
              : current.country;

    byKey.set(resolvedKey, {
      ...current,
      id: `${current.id}+${match.id}`,
      country: canonicalCountry,
      league: canonicalLeague,
      home: canonicalHome?.name || (/[а-яё]/i.test(current.home) ? current.home : match.home),
      away: canonicalAway?.name || (/[а-яё]/i.test(current.away) ? current.away : match.away),
      homeTeamId: canonicalHome ? clientLeagueTeamId(canonicalHome) : current.homeTeamId,
      awayTeamId: canonicalAway ? clientLeagueTeamId(canonicalAway) : current.awayTeamId,
      bookmakerOdds,
      odds: mergedOdds,
      bestBookmakers: best.labels,
      confidence: Math.max(current.confidence, match.confidence),
      recommendationSide: chosen.recommendationSide
    });
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const left = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const right = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return left - right;
  });
}

function formatEventName(value: string): string {
  return value.replace(/\s+vs\s+/gi, " - ").replace(/\s+-\s+/g, " - ").trim();
}

function parseMoneyValue(value: unknown): number {
  const amount = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function isFreebetBet(bet: Pick<BetRow, "is_freebet" | "bookmaker">): boolean {
  return Boolean(bet.is_freebet) || /\s*·\s*Фрибет\s*$/i.test(bet.bookmaker || "");
}

function cleanBookmakerName(bookmaker: string | null): string {
  return (bookmaker || "").replace(/\s*·\s*Фрибет\s*$/i, "").trim();
}

function profitForStake(result: BetRow["result"], stake: number, odds: number, isFreebet = false): number {
  if (result === "win") return stake * odds - stake;
  if (result === "loss") return isFreebet ? 0 : -stake;
  return 0;
}

// Все источники, прикреплённые к ставке (основной + дополнительные), без дублей.
// Результат ставки (выигрыш/проигрыш/возврат) учитывается ПОЛНОСТЬЮ в статистике
// КАЖДОГО из этих источников - сумма не делится между ними.
function getBetSourceIds(bet: BetRow): string[] {
  const ids = [bet.source_id, ...(bet.extra_source_ids || [])].filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}

function getBetSourceStake(bet: BetRow, sourceId: string): number {
  const mappedStake = parseMoneyValue(bet.source_stakes?.[sourceId]);
  return mappedStake > 0 ? mappedStake : parseMoneyValue(bet.stake);
}

function betStakeEntries(bet: BetRow): { sourceId: string; stake: number }[] {
  const sourceIds = getBetSourceIds(bet);
  if (!sourceIds.length) return [{ sourceId: "__no_source__", stake: parseMoneyValue(bet.stake) }];

  return sourceIds.map(sourceId => ({
    sourceId,
    stake: getBetSourceStake(bet, sourceId)
  }));
}

function makeSourceStakeMap(sourceIds: string[], fallbackStake: number, existing?: SourceStakeMap | null): Record<string, number> {
  return sourceIds.reduce<Record<string, number>>((map, sourceId) => {
    const stake = parseMoneyValue(existing?.[sourceId]);
    map[sourceId] = stake > 0 ? stake : fallbackStake;
    return map;
  }, {});
}

function betProfitValue(bet: BetRow): number {
  const odds = Number(bet.odds || 0);
  return betStakeEntries(bet).reduce((sum, entry) => (
    sum + profitForStake(bet.result, entry.stake, odds, isFreebetBet(bet))
  ), 0);
}

function betSourceProfitValue(bet: BetRow, sourceId: string): number {
  const stake = sourceId === "__no_source__" ? parseMoneyValue(bet.stake) : getBetSourceStake(bet, sourceId);
  return profitForStake(bet.result, stake, Number(bet.odds || 0), isFreebetBet(bet));
}

function betTotalStakeValue(bet: BetRow): number {
  return betStakeEntries(bet).reduce((sum, entry) => sum + entry.stake, 0);
}

function betTotalProfitValue(bet: BetRow): number {
  return betProfitValue(bet);
}

// Часовые пояса России + пара популярных зарубежных - для выбора в профиле
const TIMEZONE_OPTIONS: { label: string; offset: number }[] = [
  { label: "Калининград (UTC+2)", offset: 120 },
  { label: "Москва (UTC+3)", offset: 180 },
  { label: "Самара (UTC+4)", offset: 240 },
  { label: "Екатеринбург (UTC+5)", offset: 300 },
  { label: "Омск (UTC+6)", offset: 360 },
  { label: "Красноярск (UTC+7)", offset: 420 },
  { label: "Иркутск (UTC+8)", offset: 480 },
  { label: "Якутск (UTC+9)", offset: 540 },
  { label: "Владивосток (UTC+10)", offset: 600 },
  { label: "Магадан (UTC+11)", offset: 660 },
  { label: "Камчатка (UTC+12)", offset: 720 },
  { label: "UTC+0 (Лондон)", offset: 0 },
  { label: "UTC+1 (Берлин)", offset: 60 }
];
const DEFAULT_TIMEZONE_OFFSET = 180; // Москва
const MATCH_BOOKMAKER_OPTIONS: { key: MatchBookmakerKey; label: string }[] = [
  { key: "best", label: "Лучшие" },
  { key: "pari", label: "PARI" },
  { key: "fonbet", label: "Fonbet" },
  { key: "tennisi", label: "Tennisi" }
];

const MATCH_BOOKMAKER_LABELS: Record<MatchBookmakerKey, string> = {
  best: "Лучшие",
  pari: "PARI",
  fonbet: "Fonbet",
  tennisi: "Tennisi"
};

type MatchTimeWindow = 1 | 2 | 4 | 6 | 8 | 10 | 12 | 24 | 48 | 72 | "all";

const MATCH_TIME_WINDOWS: { value: MatchTimeWindow; label: string }[] = [
  { value: 1, label: "1 час" },
  { value: 2, label: "2 часа" },
  { value: 4, label: "4 часа" },
  { value: 6, label: "6 часов" },
  { value: 8, label: "8 часов" },
  { value: 10, label: "10 часов" },
  { value: 12, label: "12 часов" },
  { value: 24, label: "24 часа" },
  { value: 48, label: "2 дня" },
  { value: 72, label: "3 дня" },
  { value: "all", label: "Всё время" }
];

function getUserTimezoneOffsetMinutes(user: User | null): number {
  const raw = user?.user_metadata?.timezone_offset_minutes;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TIMEZONE_OFFSET;
}

function getUserFlatStake(user: User | null): number {
  const raw = user?.user_metadata?.flat_stake_amount;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getUserAssistantStake(user: User | null): number {
  const raw = user?.user_metadata?.assistant_stake_amount;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatBetTime(createdAt: string, offsetMinutes: number): string {
  const utcMs = new Date(createdAt).getTime();
  if (!Number.isFinite(utcMs)) return "--:--";
  const shifted = new Date(utcMs + offsetMinutes * 60000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —")
    .replace(/\s*(?:\.{2,}|…)\s*$/g, "")
    .trim();
  return name || "Источник —";
}

function normalizeLogin(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function isValidLogin(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,24}$/.test(value);
}

function resultLabel(result: BetRow["result"], lang: Lang): string {
  if (result === "win") return translate("Выигрыш", lang);
  if (result === "loss") return translate("Проигрыш", lang);
  if (result === "return") return translate("Возврат", lang);
  return translate("Ожидает", lang);
}

const features = [
  {
    title: "Контроль банка",
    text: "Ставки, возвраты, фрибеты, P&L и ROI будут жить в аккаунте, а не в памяти браузера."
  },
  {
    title: "Источники и фильтры",
    text: "Источники, чёрный список и статистика будут храниться централизованно и не потеряются при смене устройства."
  },
  {
    title: "Матчи и результаты",
    text: "Следующий этап — перенос загрузки линий, коэффициентов и результатов на сервер."
  }
];

const sportTabs = [
  { key: "all", label: "Все", icon: "⚡" },
  { key: "volleyball", label: "Волейбол", icon: "🏐" },
  { key: "tennis", label: "Теннис", icon: "🎾" },
  { key: "basketball", label: "Баскетбол", icon: "🏀" },
  { key: "ice-hockey", label: "Хоккей", icon: "🏒" },
  { key: "handball", label: "Гандбол", icon: "🤾" },
  { key: "esports", label: "Киберспорт", icon: "🎮" },
  { key: "football", label: "Футбол", icon: "⚽" },
  { key: "baseball", label: "Бейсбол", icon: "⚾" }
];

const SPORT_ICON_BY_KEY: Record<string, string> = Object.fromEntries(
  sportTabs.filter(tab => tab.key !== "all").map(tab => [tab.key, tab.icon])
);

function getSportIcon(sport: string): string {
  return SPORT_ICON_BY_KEY[sport] ?? "🏆";
}

function getSportLabel(sport: string, lang: Lang): string {
  const tab = sportTabs.find(t => t.key === sport);
  return translate(tab ? tab.label : sport, lang);
}

type EsportsDiscipline = {
  key: string;
  label: string;
  icon: string;
};

const ESPORTS_DISCIPLINES: Array<EsportsDiscipline & { pattern: RegExp }> = [
  { key: "cs2", label: "COUNTER STRIKE 2", icon: "🎯", pattern: /\b(counter[\s.:-]*strike(?:[\s.:-]*(?:2|go))?|cs[\s.:-]*(?:go|2)|кс[\s.:-]*(?:го|2)?)\b/i },
  { key: "dota2", label: "Dota 2", icon: "🛡️", pattern: /\bdota\s*2?\b/i },
  { key: "lol", label: "LoL", icon: "⚔️", pattern: /\b(league\s+of\s+legends|lol|lck|lpl|lec|lcs)\b/i },
  { key: "valorant", label: "Valorant", icon: "🔺", pattern: /\bvalorant\b/i },
  { key: "honor-of-kings", label: "Honor of Kings", icon: "👑", pattern: /\b(honor\s+of\s+kings|king\s+of\s+glory|kog)\b/i },
  { key: "call-of-duty", label: "Call of Duty", icon: "🎖️", pattern: /\b(call\s+of\s+duty|cod|cdl)\b/i },
  { key: "mobile-legends", label: "Mobile Legends", icon: "📱", pattern: /\b(mobile\s+legends|mlbb)\b/i },
  { key: "rainbow-six", label: "Rainbow Six", icon: "🛡️", pattern: /\b(rainbow\s+six|r6)\b/i },
  { key: "overwatch", label: "Overwatch", icon: "🦾", pattern: /\boverwatch\b/i },
  { key: "pubg", label: "PUBG", icon: "🪖", pattern: /\bpubg\b/i },
  { key: "starcraft", label: "StarCraft", icon: "🚀", pattern: /\bstarcraft\b/i },
  { key: "rocket-league", label: "Rocket League", icon: "🚗", pattern: /\brocket\s+league\b/i },
  { key: "arena-of-valor", label: "Arena of Valor", icon: "🏰", pattern: /\barena\s+of\s+valor\b/i },
  { key: "wild-rift", label: "Wild Rift", icon: "⚔️", pattern: /\bwild\s+rift\b/i },
  { key: "efootball", label: "EA Sports FC", icon: "⚽", pattern: /\b(ea\s+sports\s+fc|efootball|fifa)\b/i },
  { key: "hearthstone", label: "Hearthstone", icon: "🃏", pattern: /\bhearthstone\b/i },
  { key: "world-of-tanks", label: "World of Tanks", icon: "🪖", pattern: /\bworld\s+of\s+tanks\b/i }
];

function getEsportsDiscipline(match: MatchRow): EsportsDiscipline {
  const source = `${match.league} ${match.country}`;
  const known = ESPORTS_DISCIPLINES.find(discipline => discipline.pattern.test(source));
  if (known) return { key: known.key, label: known.label, icon: known.icon };

  const rawLabel = match.league
    .split(/\s*[.·|]\s*|\s+-\s+/)[0]
    .replace(/\b(?:bo|best\s+of)\s*[135]\b/gi, "")
    .trim();
  const label = rawLabel || "Другое";
  return {
    key: `other:${compactMatchName(label) || "other"}`,
    label,
    icon: "🎮"
  };
}

const COUNTRY_FLAGS: Record<string, string> = {
  "Russia": "🇷🇺", "Россия": "🇷🇺",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Англия": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "GB": "🇬🇧",
  "USA": "🇺🇸", "США": "🇺🇸", "United States": "🇺🇸", "US": "🇺🇸",
  "Germany": "🇩🇪", "Германия": "🇩🇪", "DE": "🇩🇪",
  "France": "🇫🇷", "Франция": "🇫🇷", "FR": "🇫🇷",
  "Spain": "🇪🇸", "Испания": "🇪🇸", "ES": "🇪🇸",
  "Italy": "🇮🇹", "Италия": "🇮🇹", "IT": "🇮🇹",
  "Japan": "🇯🇵", "Япония": "🇯🇵", "JP": "🇯🇵",
  "Brazil": "🇧🇷", "Бразилия": "🇧🇷", "BR": "🇧🇷",
  "Australia": "🇦🇺", "Австралия": "🇦🇺", "AU": "🇦🇺",
  "China": "🇨🇳", "Китай": "🇨🇳", "CN": "🇨🇳",
  "South Korea": "🇰🇷", "Южная Корея": "🇰🇷", "KR": "🇰🇷", "Korea": "🇰🇷",
  "Poland": "🇵🇱", "Польша": "🇵🇱", "PL": "🇵🇱",
  "Turkey": "🇹🇷", "Турция": "🇹🇷", "TR": "🇹🇷",
  "Ukraine": "🇺🇦", "Украина": "🇺🇦", "UA": "🇺🇦",
  "Netherlands": "🇳🇱", "Нидерланды": "🇳🇱", "NL": "🇳🇱",
  "Belgium": "🇧🇪", "Бельгия": "🇧🇪", "BE": "🇧🇪",
  "Portugal": "🇵🇹", "Португалия": "🇵🇹", "PT": "🇵🇹",
  "Argentina": "🇦🇷", "Аргентина": "🇦🇷", "AR": "🇦🇷",
  "Mexico": "🇲🇽", "Мексика": "🇲🇽", "MX": "🇲🇽",
  "Canada": "🇨🇦", "Канада": "🇨🇦", "CA": "🇨🇦",
  "Serbia": "🇷🇸", "Сербия": "🇷🇸", "RS": "🇷🇸",
  "Croatia": "🇭🇷", "Хорватия": "🇭🇷", "HR": "🇭🇷",
  "Czech Republic": "🇨🇿", "Чехия": "🇨🇿", "CZ": "🇨🇿",
  "Romania": "🇷🇴", "Румыния": "🇷🇴", "RO": "🇷🇴",
  "Sweden": "🇸🇪", "Швеция": "🇸🇪", "SE": "🇸🇪",
  "Norway": "🇳🇴", "Норвегия": "🇳🇴", "NO": "🇳🇴",
  "Denmark": "🇩🇰", "Дания": "🇩🇰", "DK": "🇩🇰",
  "Finland": "🇫🇮", "Финляндия": "🇫🇮", "FI": "🇫🇮",
  "Switzerland": "🇨🇭", "Швейцария": "🇨🇭", "CH": "🇨🇭",
  "Austria": "🇦🇹", "Австрия": "🇦🇹", "AT": "🇦🇹",
  "Greece": "🇬🇷", "Греция": "🇬🇷", "GR": "🇬🇷",
  "Hungary": "🇭🇺", "Венгрия": "🇭🇺", "HU": "🇭🇺",
  "Slovakia": "🇸🇰", "Словакия": "🇸🇰", "SK": "🇸🇰",
  "Bulgaria": "🇧🇬", "Болгария": "🇧🇬", "BG": "🇧🇬",
  "Israel": "🇮🇱", "Израиль": "🇮🇱", "IL": "🇮🇱",
  "Kazakhstan": "🇰🇿", "Казахстан": "🇰🇿", "KZ": "🇰🇿",
  "Belarus": "🇧🇾", "Беларусь": "🇧🇾", "BY": "🇧🇾",
  "Thailand": "🇹🇭", "Таиланд": "🇹🇭", "TH": "🇹🇭",
  "India": "🇮🇳", "Индия": "🇮🇳", "IN": "🇮🇳",
  "Bhutan": "🇧🇹", "Бутан": "🇧🇹", "BT": "🇧🇹",
  "Uruguay": "🇺🇾", "Уругвай": "🇺🇾", "UY": "🇺🇾",
  "Taiwan": "🇹🇼", "Тайвань": "🇹🇼", "TW": "🇹🇼",
  "Kyrgyzstan": "🇰🇬", "Кыргызстан": "🇰🇬",
  "Uzbekistan": "🇺🇿", "Узбекистан": "🇺🇿",
  "Paraguay": "🇵🇾", "Парагвай": "🇵🇾",
  "Panama": "🇵🇦", "Панама": "🇵🇦",
  "Ecuador": "🇪🇨", "Эквадор": "🇪🇨",
  "Pakistan": "🇵🇰", "Пакистан": "🇵🇰",
  "Bangladesh": "🇧🇩", "Бангладеш": "🇧🇩",
  "Afghanistan": "🇦🇫", "Афганистан": "🇦🇫",
  "Nepal": "🇳🇵", "Непал": "🇳🇵",
  "Sri Lanka": "🇱🇰", "Шри-Ланка": "🇱🇰",
  "World": "🌍", "WORLD": "🌍", "INT": "🌍", "International": "🌍",
  "ATP": "🎾", "WTA": "🎾", "ITF": "🎾",
  "Europe": "🇪🇺", "UEFA": "🇪🇺",
};

function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? COUNTRY_FLAGS[country.toUpperCase()] ?? "🌐";
}

// Windows/Chrome не рендерит flag-эмодзи (регион. индикаторы) — показывает
// буквенный код страны как текст. Поэтому используем реальные PNG-флаги.
const COUNTRY_ISO: Record<string, string> = {
  "Russia": "ru", "England": "gb-eng", "USA": "us", "Germany": "de",
  "France": "fr", "Spain": "es", "Italy": "it", "Japan": "jp",
  "Brazil": "br", "Australia": "au", "China": "cn", "South Korea": "kr",
  "Korea": "kr", "Poland": "pl", "Turkey": "tr", "Ukraine": "ua",
  "Netherlands": "nl", "Belgium": "be", "Portugal": "pt", "Argentina": "ar",
  "Mexico": "mx", "Canada": "ca", "Serbia": "rs", "Croatia": "hr",
  "Czech Republic": "cz", "Romania": "ro", "Sweden": "se", "Norway": "no",
  "Denmark": "dk", "Finland": "fi", "Switzerland": "ch", "Austria": "at",
  "Greece": "gr", "Hungary": "hu", "Slovakia": "sk", "Bulgaria": "bg",
  "Israel": "il", "Kazakhstan": "kz", "Belarus": "by", "Thailand": "th",
  "India": "in", "Bhutan": "bt", "Uruguay": "uy", "Taiwan": "tw", "New Zealand": "nz", "Indonesia": "id",
  "Iran": "ir", "United Arab Emirates": "ae", "Qatar": "qa", "Chile": "cl",
  "Colombia": "co", "Peru": "pe", "Egypt": "eg", "Morocco": "ma",
  "Tunisia": "tn", "Lithuania": "lt", "Latvia": "lv", "Estonia": "ee",
  "Philippines": "ph", "Saudi Arabia": "sa", "Scotland": "gb-sct",
  "Wales": "gb-wls", "Ireland": "ie", "Slovenia": "si",
  "Bosnia and Herzegovina": "ba", "North Macedonia": "mk", "Albania": "al",
  "Iceland": "is", "Vietnam": "vn", "Malaysia": "my", "Singapore": "sg",
  "Hong Kong": "hk", "Kyrgyzstan": "kg", "Uzbekistan": "uz",
  "Azerbaijan": "az", "Montenegro": "me", "Paraguay": "py", "Ecuador": "ec",
  "Venezuela": "ve", "Guatemala": "gt", "Nicaragua": "ni", "Honduras": "hn",
  "Dominican Republic": "do", "Puerto Rico": "pr", "Panama": "pa",
  "Bolivia": "bo", "Costa Rica": "cr", "El Salvador": "sv", "South Africa": "za",
  "Moldova": "md", "Georgia": "ge", "Armenia": "am", "Kosovo": "xk",
  "Malta": "mt", "Cyprus": "cy", "Algeria": "dz", "Nigeria": "ng",
  "Ghana": "gh", "Kenya": "ke", "Tanzania": "tz", "Jamaica": "jm",
  "Pakistan": "pk", "Bangladesh": "bd", "Afghanistan": "af", "Nepal": "np",
  "Sri Lanka": "lk",
};

const COUNTRY_ISO3: Record<string, string> = {
  USA: "us", BLR: "by", KAZ: "kz", RUS: "ru", CZE: "cz", POL: "pl",
  UKR: "ua", CAN: "ca", JPN: "jp", SUI: "ch", ITA: "it", AUT: "at",
  PHI: "ph", LAT: "lv", GBR: "gb", GRE: "gr", CRO: "hr", ROU: "ro",
  ESP: "es", DEN: "dk", CHN: "cn", INA: "id", BEL: "be", FRA: "fr",
  GER: "de", SRB: "rs", AUS: "au", BRA: "br", ARG: "ar", CHI: "cl",
  COL: "co", BUL: "bg", HUN: "hu", SVK: "sk", SLO: "si", NED: "nl",
  TUN: "tn", EGY: "eg", TUR: "tr", MEX: "mx", NZL: "nz", NOR: "no",
  SWE: "se", FIN: "fi", GEO: "ge", ARM: "am", MDA: "md", EST: "ee",
  LTU: "lt", THA: "th", IND: "in", RSA: "za", UAE: "ae", MAR: "ma",
  CYP: "cy", POR: "pt", BIH: "ba", MKD: "mk", TPE: "tw", HKG: "hk",
  ISR: "il", IRL: "ie", ISL: "is", ALG: "dz", NGR: "ng", UZB: "uz"
};

function getCountryIso(country: string): string | null {
  const normalized = country.trim();
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toLowerCase();
  return COUNTRY_ISO[normalized] ?? COUNTRY_ISO3[normalized.toUpperCase()] ?? null;
}

function WorldGlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="flag-icon flag-icon-world"
      fill="none"
      height={13}
      viewBox="0 0 17 13"
      width={17}
    >
      <rect x="0.5" y="0.5" width="16" height="12" rx="2" fill="#0e4d92" />
      <circle cx="8.5" cy="6.5" r="4.3" stroke="#9fd1ff" strokeWidth="0.6" fill="none" />
      <ellipse cx="8.5" cy="6.5" rx="2" ry="4.3" stroke="#9fd1ff" strokeWidth="0.5" fill="none" />
      <line x1="4.2" y1="6.5" x2="12.8" y2="6.5" stroke="#9fd1ff" strokeWidth="0.5" />
      <line x1="5" y1="4" x2="12" y2="4" stroke="#9fd1ff" strokeWidth="0.4" />
      <line x1="5" y1="9" x2="12" y2="9" stroke="#9fd1ff" strokeWidth="0.4" />
    </svg>
  );
}

function FlagIcon({ country }: { country: string }) {
  const iso = getCountryIso(country);
  if (!iso) {
    return <WorldGlobeIcon />;
  }
  return (
    <img
      alt=""
      className="flag-icon"
      height={13}
      loading="lazy"
      onError={event => { event.currentTarget.style.display = "none"; }}
      src={`https://flagcdn.com/24x18/${iso}.png`}
      width={17}
    />
  );
}

const COUNTRY_RU_NAMES: Record<string, string> = {
  "Russia": "Россия", "England": "Англия", "USA": "США", "Germany": "Германия",
  "France": "Франция", "Spain": "Испания", "Italy": "Италия", "Japan": "Япония",
  "Brazil": "Бразилия", "Australia": "Австралия", "China": "Китай",
  "South Korea": "Южная Корея", "Korea": "Южная Корея", "Poland": "Польша",
  "Turkey": "Турция", "Ukraine": "Украина", "Netherlands": "Нидерланды",
  "Belgium": "Бельгия", "Portugal": "Португалия", "Argentina": "Аргентина",
  "Mexico": "Мексика", "Canada": "Канада", "Serbia": "Сербия",
  "Croatia": "Хорватия", "Czech Republic": "Чехия", "Romania": "Румыния",
  "Sweden": "Швеция", "Norway": "Норвегия", "Denmark": "Дания",
  "Finland": "Финляндия", "Switzerland": "Швейцария", "Austria": "Австрия",
  "Greece": "Греция", "Hungary": "Венгрия", "Slovakia": "Словакия",
  "Bulgaria": "Болгария", "Israel": "Израиль", "Kazakhstan": "Казахстан",
  "Belarus": "Беларусь", "Thailand": "Таиланд", "India": "Индия", "Bhutan": "Бутан", "Uruguay": "Уругвай",
  "Taiwan": "Тайвань", "World": "Мир", "New Zealand": "Новая Зеландия",
  "Indonesia": "Индонезия", "Iran": "Иран", "United Arab Emirates": "ОАЭ",
  "Qatar": "Катар", "Chile": "Чили", "Colombia": "Колумбия", "Peru": "Перу",
  "Egypt": "Египет", "Morocco": "Марокко", "Tunisia": "Тунис",
  "Lithuania": "Литва", "Latvia": "Латвия", "Estonia": "Эстония",
  "Philippines": "Филиппины", "Saudi Arabia": "Саудовская Аравия",
  "Scotland": "Шотландия", "Wales": "Уэльс", "Ireland": "Ирландия",
  "Slovenia": "Словения", "Bosnia and Herzegovina": "Босния и Герцеговина",
  "North Macedonia": "Северная Македония", "Albania": "Албания",
  "Iceland": "Исландия", "Vietnam": "Вьетнам", "Malaysia": "Малайзия",
  "Singapore": "Сингапур", "Hong Kong": "Гонконг",
  "Kyrgyzstan": "Кыргызстан", "Uzbekistan": "Узбекистан",
  "Azerbaijan": "Азербайджан", "Montenegro": "Черногория",
  "Paraguay": "Парагвай", "Ecuador": "Эквадор", "Venezuela": "Венесуэла",
  "Guatemala": "Гватемала", "Nicaragua": "Никарагуа", "Honduras": "Гондурас",
  "Dominican Republic": "Доминиканская Республика", "Puerto Rico": "Пуэрто-Рико",
  "Panama": "Панама", "Bolivia": "Боливия", "Costa Rica": "Коста-Рика",
  "El Salvador": "Сальвадор", "South Africa": "ЮАР", "Moldova": "Молдова",
  "Georgia": "Грузия", "Armenia": "Армения", "Kosovo": "Косово",
  "Malta": "Мальта", "Cyprus": "Кипр", "Algeria": "Алжир",
  "Nigeria": "Нигерия", "Ghana": "Гана", "Kenya": "Кения",
  "Tanzania": "Танзания", "Jamaica": "Ямайка",
  "Pakistan": "Пакистан", "Bangladesh": "Бангладеш",
  "Afghanistan": "Афганистан", "Nepal": "Непал", "Sri Lanka": "Шри-Ланка",
};

function getCountryLabel(country: string, lang: Lang): string {
  if (lang === "en") return country;
  return COUNTRY_RU_NAMES[country] ?? country;
}


const demoMatches: MatchRow[] = [
  {
    id: "demo-1",
    sport: "football",
    country: "INT",
    league: "Мировые · Футбол",
    time: "18:30",
    home: "Arsenal",
    away: "Chelsea",
    odds: ["1.92", "3.55", "4.20"],
    confidence: 64,
    recommendationSide: "home"
  },
  {
    id: "demo-2",
    sport: "tennis",
    country: "WTA",
    league: "Теннис · Singles",
    time: "19:00",
    home: "Елена Рыбакина",
    away: "Марта Костюк",
    odds: ["1.58", "-", "2.46"],
    confidence: 59,
    recommendationSide: "home"
  },
  {
    id: "demo-3",
    sport: "basketball",
    country: "US",
    league: "Баскетбол · NBA",
    time: "02:00",
    home: "Boston Celtics",
    away: "New York Knicks",
    odds: ["1.72", "-", "2.12"],
    confidence: 57,
    recommendationSide: "away"
  }
];

function recommendationSideLabel(match: MatchRow, t: (text: string) => string): string {
  if (match.recommendationSide === "draw") return t("Ничья");
  if (match.recommendationSide === "away") return `${t("Победа")} ${match.away}`;
  return `${t("Победа")} ${match.home}`;
}

function recommendedOutcome(match: MatchRow, odds = match.odds): { market: string; odds: string; selection: string } {
  if (match.recommendationSide === "draw") {
    return {
      market: "Победа",
      odds: odds[1] && odds[1] !== "-" ? odds[1] : "",
      selection: "Ничья"
    };
  }

  if (match.recommendationSide === "away") {
    return {
      market: "Победа",
      odds: odds[2] && odds[2] !== "-" ? odds[2] : "",
      selection: match.away
    };
  }

  return {
    market: "Победа",
    odds: odds[0] && odds[0] !== "-" ? odds[0] : "",
    selection: match.home
  };
}

function matchOddsForBookmaker(match: MatchRow, bookmaker: MatchBookmakerKey): { labels: string[]; odds: string[] } {
  if (bookmaker === "best") {
    return {
      labels: match.bestBookmakers?.length ? match.bestBookmakers : ["Лучшие", "Лучшие", "Лучшие"],
      odds: match.odds
    };
  }

  const odds = match.bookmakerOdds?.[bookmaker] || ["-", "-", "-"];
  const label = MATCH_BOOKMAKER_LABELS[bookmaker];
  return {
    labels: odds.map(odd => (odd && odd !== "-" ? label : "")),
    odds
  };
}

function hasBookmakerOdds(match: MatchRow, bookmaker: MatchBookmakerKey): boolean {
  if (bookmaker === "best") return true;
  const odds = match.bookmakerOdds?.[bookmaker];
  return Boolean(odds?.some(odd => odd && odd !== "-"));
}

function matchBookmakerOptions(match: MatchRow): typeof MATCH_BOOKMAKER_OPTIONS {
  return MATCH_BOOKMAKER_OPTIONS.filter(option => hasBookmakerOdds(match, option.key));
}

function recommendedOutcomeDetails(match: MatchRow, t: (text: string) => string, odds = match.odds, bookmaker = ""): string {
  const outcome = recommendedOutcome(match, odds);
  const label = match.recommendationSide === "draw" ? t("Ничья") : `${t("Победа")} ${outcome.selection}`;
  return `${t("Исход")}: ${label}${outcome.odds ? ` · ${t("кэф")} ×${outcome.odds}${bookmaker ? ` · ${bookmaker}` : ""}` : ""}`;
}

function recommendedOutcomeIndex(match: MatchRow): number {
  if (match.recommendationSide === "draw") return 1;
  if (match.recommendationSide === "away") return 2;
  return 0;
}

function confidenceTier(confidence: number): "hot" | "good" | "neutral" {
  if (confidence >= 70) return "hot";
  if (confidence >= 58) return "good";
  return "neutral";
}

function confidenceTierLabel(tier: "hot" | "good" | "neutral", t: (text: string) => string): string {
  if (tier === "hot") return t("горячо");
  if (tier === "good") return t("хорошо");
  return t("нейтрально");
}

type CurrencyCode = "RUB" | "BYN" | "KZT" | "USD" | "EUR";
type StakeKind = "cash" | "freebet";
type AppTheme = "dark" | "light";

const CURRENCY_OPTIONS: readonly { code: CurrencyCode; label: string }[] = [
  { code: "RUB", label: "Российский рубль" },
  { code: "BYN", label: "Белорусский рубль" },
  { code: "KZT", label: "Тенге" },
  { code: "USD", label: "Доллар США" },
  { code: "EUR", label: "Евро" }
];

function getUserCurrency(user: User | null): CurrencyCode {
  const currency = user?.user_metadata?.currency;
  return CURRENCY_OPTIONS.some(option => option.code === currency) ? currency as CurrencyCode : "RUB";
}

function getUserTheme(user: User | null): AppTheme {
  return user?.user_metadata?.theme === "light" ? "light" : "dark";
}

function currencySymbol(currency: CurrencyCode): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol"
  }).formatToParts(0).find(part => part.type === "currency")?.value || currency;
}

function currencyStakeLabel(currency: CurrencyCode): string {
  return `${currency} ${currencySymbol(currency)}`;
}

function formatMoney(value: number, currency: CurrencyCode = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency
  }).format(value);
}

// Букмекеры с готовым логотипом в public/bookmakers/ - показываются в виде
// круглого значка вместо текстовой плашки. Чтобы добавить нового букмекера,
// достаточно положить файл в public/bookmakers/ и дописать сюда одну строку
// (при необходимости с несколькими вариантами написания - ставки хранят
// название буквально так, как оно выбрано в bookmakerOptions, у Мелбет
// это кириллица, у остальных - латиница).
const BOOKMAKER_LOGOS: Record<string, string> = {
  fonbet: "/bookmakers/fonbet.png",
  melbet: "/bookmakers/melbet.png",
  "мелбет": "/bookmakers/melbet.png",
  winline: "/bookmakers/winline.png",
  leon: "/bookmakers/leon.png",
  "олимп": "/bookmakers/olimp.png",
  olimp: "/bookmakers/olimp.png",
  "лига ставок": "/bookmakers/liga-stavok.png",
  pari: "/bookmakers/pari.png"
};

function getBookmakerLogo(bookmaker: string | null | undefined): string | null {
  const key = bookmaker?.trim().toLowerCase();
  return key ? BOOKMAKER_LOGOS[key] || null : null;
}

function formatCalendarDateLabel(date: Date, lang: Lang) {
  return date.toLocaleDateString(localeFor(lang), {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function isSameLocalDate(value: string | Date, date: Date) {
  const current = value instanceof Date ? value : new Date(value);

  return current.getFullYear() === date.getFullYear()
    && current.getMonth() === date.getMonth()
    && current.getDate() === date.getDate();
}

function safeNormalizeForBetSignature(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

function betLooseSignature(bet: BetRow): string {
  const normalizedEvent = safeNormalizeForBetSignature(bet.event_name || "");
  const normalizedMarket = safeNormalizeForBetSignature(bet.market || "");
  const normalizedSelection = safeNormalizeForBetSignature(bet.selection || "");
  const stake = Math.round(Number(bet.stake || 0) * 100) / 100;
  const odds = Math.round(Number(bet.odds || 0) * 100) / 100;
  return [normalizedEvent, normalizedMarket, normalizedSelection, stake, odds].join("|");
}

function betOutcomeSignature(bet: Pick<BetRow, "event_name" | "market" | "selection">): string {
  const normalizedEvent = safeNormalizeForBetSignature(bet.event_name || "");
  const normalizedMarket = safeNormalizeForBetSignature(bet.market || "");
  const normalizedSelection = safeNormalizeForBetSignature(bet.selection || "");
  return [normalizedEvent, normalizedMarket, normalizedSelection].join("|");
}

function analysisParticipantKey(match: MatchRow, value: string): string {
  const normalized = safeNormalizeForBetSignature(value);
  if (match.sport === "baseball") {
    const parts = normalized.split(" ").filter(Boolean);
    return parts.slice(0, 2).join(" ") || normalized;
  }
  if (match.sport !== "tennis") return normalized;

  const surname = normalized
    .split(" ")
    .filter(part => part.length > 1)[0] || normalized;

  return surname.replace(/[aeiouаеёиоуыэюяьъ]/g, "") || surname;
}

function analysisMatchKey(match: MatchRow): string {
  const startsAt = match.startsAt ? new Date(match.startsAt).getTime() : 0;
  const bucketMinutes = match.sport === "tennis" ? 120 : 60;
  const timeBucket = startsAt ? Math.round(startsAt / (bucketMinutes * 60 * 1000)) : safeNormalizeForBetSignature(match.time || "");
  const participants = [analysisParticipantKey(match, match.home), analysisParticipantKey(match, match.away)].sort().join("~");
  return [match.sport, timeBucket, participants].join("|");
}

function uniqueAnalyzedMatches(matches: MatchRow[]) {
  const byKey = new Map<string, MatchRow>();
  matches.forEach(match => {
    const key = analysisMatchKey(match);
    const current = byKey.get(key);
    if (!current || match.confidence >= current.confidence) {
      byKey.set(key, match);
    }
  });
  return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
}

function uniqueBetsByOutcome(bets: BetRow[]): BetRow[] {
  const latestByOutcome = new Map<string, BetRow>();

  bets.forEach(bet => {
    const signature = betOutcomeSignature(bet);
    const existing = latestByOutcome.get(signature);
    const betTime = new Date(bet.settled_at || bet.created_at).getTime() || 0;
    const existingTime = existing ? new Date(existing.settled_at || existing.created_at).getTime() || 0 : -1;

    if (!existing || betTime >= existingTime) {
      latestByOutcome.set(signature, bet);
    }
  });

  return Array.from(latestByOutcome.values());
}

function uniqueBetsByLooseSignature(bets: BetRow[]): BetRow[] {
  // Only collapse bets into one when they share the same signature AND were
  // created within a few seconds of each other - the signature of an
  // accidental double-submit/double-insert, not two bets a person genuinely
  // placed separately (which can easily share the same event/market/
  // selection/stake/odds, e.g. the same stake size used again later).
  const DUPLICATE_WINDOW_MS = 5000;

  const groups = new Map<string, BetRow[]>();
  bets.forEach(bet => {
    const signature = betLooseSignature(bet);
    const group = groups.get(signature);
    if (group) {
      group.push(bet);
    } else {
      groups.set(signature, [bet]);
    }
  });

  const result: BetRow[] = [];
  groups.forEach(group => {
    if (group.length === 1) {
      result.push(group[0]);
      return;
    }

    const sorted = [...group].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let clusterLatest = sorted[0];
    let clusterAnchorTime = new Date(sorted[0].created_at).getTime() || 0;

    for (let i = 1; i < sorted.length; i++) {
      const bet = sorted[i];
      const betCreatedTime = new Date(bet.created_at).getTime() || 0;

      if (betCreatedTime - clusterAnchorTime <= DUPLICATE_WINDOW_MS) {
        // Same accidental-duplicate cluster - keep whichever record is most up to date
        const clusterLatestUpdate = new Date(clusterLatest.settled_at || clusterLatest.created_at).getTime() || 0;
        const betUpdate = new Date(bet.settled_at || bet.created_at).getTime() || 0;
        if (betUpdate >= clusterLatestUpdate) {
          clusterLatest = bet;
        }
        clusterAnchorTime = betCreatedTime;
      } else {
        // Gap too large to be an accidental duplicate - it's a separate bet
        result.push(clusterLatest);
        clusterLatest = bet;
        clusterAnchorTime = betCreatedTime;
      }
    }

    result.push(clusterLatest);
  });

  return result;
}

function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {
  const uniqueSettled = uniqueBetsByLooseSignature(settledBets);
  return uniqueSettled
    .filter(bet => isSameLocalDate(bet.settled_at || bet.created_at, day))
    .reduce((sum, bet) => sum + betTotalProfitValue(bet), 0);
}

function makeCalendarDays() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - startOffset);

  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      date,
      day: date.getDate(),
      muted: date.getMonth() !== today.getMonth(),
      current: date.toDateString() === today.toDateString()
    };
  });
}

function getUpcomingMatches(matches: MatchRow[], hours = 72) {
  const now = Date.now();
  const horizon = now + hours * 60 * 60 * 1000;

  return matches.filter(match => {
    if (!match.startsAt) return true;

    const startsAt = new Date(match.startsAt).getTime();
    return startsAt > now && startsAt <= horizon;
  });
}

function getFutureMatches(matches: MatchRow[]) {
  const now = Date.now();

  return matches.filter(match => {
    if (!match.startsAt) return true;
    return new Date(match.startsAt).getTime() > now;
  });
}

function getMatchesInTimeWindow(matches: MatchRow[], hours: number | "all") {
  return hours === "all" ? getFutureMatches(matches) : getUpcomingMatches(matches, hours);
}

function formatMatchDateTime(match: MatchRow, lang: Lang) {
  if (!match.startsAt) return match.time;
  const date = new Date(match.startsAt);
  if (Number.isNaN(date.getTime())) return match.time;

  const day = `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  const time = date.toLocaleTimeString(localeFor(lang), { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function readCachedMatches() {
  if (typeof window === "undefined") return [];

  for (const key of MATCH_CACHE_FALLBACK_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as { matches?: MatchRow[] };
      const matches = getFutureMatches(mergeClientMatches(Array.isArray(parsed.matches) ? parsed.matches : []));
      if (matches.length) return matches;
    } catch {
      continue;
    }
  }

  return [];
}

function writeCachedMatches(matches: MatchRow[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MATCH_CACHE_KEY,
      JSON.stringify({
        matches: getFutureMatches(matches),
        updatedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn("Match cache could not be updated", error);
  }
}

type SourceDropdownProps = {
  currency: CurrencyCode;
  onAddSource: () => void;
  onChange: (sourceId: string) => void;
  placeholder?: string;
  roiById: Map<string, { roi: number; profit: number }>;
  sources: SourceRow[];
  value: string;
};

function SourceDropdownField({ currency, onAddSource, onChange, placeholder, roiById, sources, value }: SourceDropdownProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const closeDropdown = () => {
    setOpen(false);
    setSourceSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const selected = sources.find(source => source.id === value);
  const selectedStat = selected ? roiById.get(selected.id) : undefined;
  const normalizedSourceSearch = sourceSearch.trim().toLocaleLowerCase("ru");
  const filteredSources = normalizedSourceSearch
    ? sources.filter(source => source.name.toLocaleLowerCase("ru").includes(normalizedSourceSearch))
    : sources;

  return (
    <div className="source-dropdown" ref={rootRef}>
      <button
        className="source-dropdown-trigger"
        onClick={() => {
          if (open) closeDropdown();
          else setOpen(true);
        }}
        type="button"
      >
        <span className="source-dropdown-trigger-label">
          {selected ? selected.name : (placeholder || t("— выберите источник —"))}
        </span>
        {selected && selectedStat ? (
          <span className={`source-dropdown-roi ${selectedStat.roi >= 0 ? "positive" : "negative"}`}>
            {selectedStat.roi >= 0 ? "+" : ""}{selectedStat.roi.toFixed(1)}%
            <small>{selectedStat.profit >= 0 ? "+" : ""}{formatMoney(selectedStat.profit, currency)}</small>
          </span>
        ) : null}
        <span className="source-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="source-dropdown-menu" role="listbox">
          <div className="source-dropdown-search-wrap">
            <input
              aria-label={t("Поиск источника")}
              autoComplete="off"
              className="source-dropdown-search"
              onChange={event => setSourceSearch(event.target.value)}
              placeholder={t("Поиск источника...")}
              type="search"
              value={sourceSearch}
            />
          </div>
          <button
            className="source-dropdown-item add-source"
            onClick={() => {
              onAddSource();
              closeDropdown();
            }}
            type="button"
          >
            + {t("Добавить источник")}
          </button>
          {filteredSources.map(source => {
            const stat = roiById.get(source.id);
            return (
              <button
                className={`source-dropdown-item ${source.id === value ? "active" : ""}`}
                key={source.id}
                onClick={() => {
                  onChange(source.id);
                  closeDropdown();
                }}
                role="option"
                aria-selected={source.id === value}
                type="button"
              >
                <span className="source-dropdown-item-label">{source.name}</span>
                {stat ? (
                  <span className={`source-dropdown-roi ${stat.roi >= 0 ? "positive" : "negative"}`}>
                    {stat.roi >= 0 ? "+" : ""}{stat.roi.toFixed(1)}%
                    <small>{stat.profit >= 0 ? "+" : ""}{formatMoney(stat.profit, currency)}</small>
                  </span>
                ) : null}
              </button>
            );
          })}
          {!filteredSources.length ? (
            <div className="source-dropdown-empty">{t("Источники не найдены")}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type FilterOption = {
  count?: number;
  flag?: ReactNode;
  label: string;
  value: string;
};

type MatchFilterDropdownProps = {
  onChange: (value: string) => void;
  options: FilterOption[];
  placeholderIcon: string;
  placeholderLabel: string;
  value: string;
};

function MatchFilterDropdown({ onChange, options, placeholderIcon, placeholderLabel, value }: MatchFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const selected = options.find(option => option.value === value);

  return (
    <div className="match-filter-dropdown" ref={rootRef}>
      <button
        className="source-dropdown-trigger"
        onClick={() => setOpen(current => !current)}
        type="button"
      >
        <span className="source-dropdown-trigger-label">
          {selected ? (
            <>
              {selected.flag}
              {selected.flag ? " " : ""}
              {selected.label}
            </>
          ) : (
            `${placeholderIcon} ${placeholderLabel}`
          )}
        </span>
        <span className="source-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="source-dropdown-menu match-filter-dropdown-menu" role="listbox">
          {options.map(option => (
            <button
              className={`source-dropdown-item ${option.value === value ? "active" : ""}`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              aria-selected={option.value === value}
              type="button"
            >
              <span className="source-dropdown-item-label">
                {option.flag}
                {option.flag ? " " : ""}
                {option.label}
              </span>
              {option.count !== undefined ? (
                <span className="match-filter-dropdown-count">{option.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type BookmakerDropdownProps = {
  onChange: (bookmaker: string) => void;
  options: string[];
  placeholder?: string;
  value: string;
};

function BookmakerDropdownField({ onChange, options, placeholder, value }: BookmakerDropdownProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="source-dropdown" ref={rootRef}>
      <button
        className="source-dropdown-trigger"
        onClick={() => setOpen(current => !current)}
        type="button"
      >
        <span className="source-dropdown-trigger-label">
          {getBookmakerLogo(value) ? (
            <span className="bookmaker-select-logo">
              <img alt="" src={getBookmakerLogo(value)!} />
            </span>
          ) : null}
          {value ? t(value) : (placeholder || t("— выберите букмекера —"))}
        </span>
        <span className="source-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="source-dropdown-menu" role="listbox">
          {options.map(bookmaker => (
            <button
              className={`source-dropdown-item ${bookmaker === value ? "active" : ""}`}
              key={bookmaker}
              onClick={() => {
                onChange(bookmaker);
                setOpen(false);
              }}
              role="option"
              aria-selected={bookmaker === value}
              type="button"
            >
              <span className="source-dropdown-item-label">
                {getBookmakerLogo(bookmaker) ? (
                  <span className="bookmaker-select-logo">
                    <img alt="" src={getBookmakerLogo(bookmaker)!} />
                  </span>
                ) : null}
                {t(bookmaker)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type StatsSortField = "name" | "roi" | "bets" | "wins" | "winrate" | "avgOdds" | "stake" | "avgStake" | "profit";

type SortableThProps = {
  field: StatsSortField;
  label: string;
  onSort: (field: StatsSortField) => void;
  sort: { field: StatsSortField; direction: "asc" | "desc" };
};

function SortableTh({ field, label, onSort, sort }: SortableThProps) {
  const active = sort.field === field;
  return (
    <th
      className={active ? "active" : ""}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} {active ? (sort.direction === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

type EditBetForm = {
  event_name: string;
  bookmaker: string;
  is_freebet: boolean;
  odds: string;
  source_stakes: Record<string, string>;
  stake: string;
  result: BetRow["result"];
};

type BetCardProps = {
  bet: BetRow;
  currency: CurrencyCode;
  dataLoading: boolean;
  editForm: EditBetForm | null;
  editingBetId: string | null;
  extraMeta?: string;
  focusedSourceId?: string | null;
  highlighted?: boolean;
  onAddSource: (sourceId: string) => void;
  onCancelEdit: () => void;
  onRemoveSource: (sourceId: string) => void;
  onSaveEdit: () => void;
  onSettle: (bet: BetRow, result: "win" | "loss" | "return") => void;
  onStartEdit: (bet: BetRow) => void;
  onToggleSourcePicker: () => void;
  setEditForm: Dispatch<SetStateAction<EditBetForm | null>>;
  sourceById: Map<string, SourceRow>;
  sourceOptions: SourceRow[];
  sourcePickerOpen: boolean;
  timezoneOffsetMinutes: number;
};

function BetCard({
  bet,
  currency,
  dataLoading,
  editForm,
  editingBetId,
  extraMeta,
  focusedSourceId,
  highlighted,
  onAddSource,
  onCancelEdit,
  onRemoveSource,
  onSaveEdit,
  onSettle,
  onStartEdit,
  onToggleSourcePicker,
  setEditForm,
  sourceById,
  sourceOptions,
  sourcePickerOpen,
  timezoneOffsetMinutes
}: BetCardProps) {
  const { lang, t } = useLanguage();
  const odds = Number(bet.odds || 0);
  const freebet = isFreebetBet(bet);
  const isEditing = editingBetId === bet.id && !!editForm;
  const cardRef = useRef<HTMLElement | null>(null);
  const attachedSourceIds = getBetSourceIds(bet);
  const pickableSources = sourceOptions.filter(source => !attachedSourceIds.includes(source.id));
  const sourceScoped = focusedSourceId && (
    focusedSourceId === "__no_source__" ? !attachedSourceIds.length : attachedSourceIds.includes(focusedSourceId)
  );
  const displayedStake = sourceScoped && focusedSourceId
    ? (focusedSourceId === "__no_source__" ? parseMoneyValue(bet.stake) : getBetSourceStake(bet, focusedSourceId))
    : betTotalStakeValue(bet);
  const displayedProfit = sourceScoped && focusedSourceId
    ? betSourceProfitValue(bet, focusedSourceId)
    : betTotalProfitValue(bet);

  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <article className={`calendar-bet-card ${bet.result} ${highlighted ? "highlighted" : ""}`} ref={cardRef}>
      <div className="calendar-bet-top-actions">
        <span className="calendar-bet-time" title={t("Время ставки")}>{formatBetTime(bet.created_at, timezoneOffsetMinutes)}</span>
        <button
          className="calendar-bet-edit-btn"
          onClick={() => (isEditing ? onCancelEdit() : onStartEdit(bet))}
          title={isEditing ? t("Отменить редактирование") : t("Редактировать прогноз")}
          type="button"
        >
          {isEditing ? "✕" : "✏️"}
        </button>
      </div>

      {isEditing && editForm ? (
        <div className="calendar-bet-edit-form">
          <input
            onChange={event => {
              const nextValue = event.target.value;
              setEditForm(current => (current ? { ...current, event_name: nextValue } : current));
            }}
            placeholder={t("Матч")}
            value={editForm.event_name}
          />
          <div className="calendar-bet-edit-row">
            <input
              inputMode="decimal"
              onChange={event => {
                const nextValue = event.target.value;
                setEditForm(current => (current ? { ...current, odds: nextValue } : current));
              }}
              placeholder={t("Коэффициент")}
              value={editForm.odds}
            />
            <input
              inputMode="decimal"
              onChange={event => {
                const nextValue = event.target.value;
                setEditForm(current => (current ? { ...current, stake: nextValue } : current));
              }}
              placeholder={`${t("Сумма")} ${currencySymbol(currency)}`}
              style={attachedSourceIds.length ? { display: "none" } : undefined}
              value={editForm.stake}
            />
          </div>
          {attachedSourceIds.length ? (
            <div className="calendar-bet-source-stake-editor">
              {attachedSourceIds.map(sourceId => (
                <label className="calendar-bet-source-stake-field" key={sourceId}>
                  <span>{sourceDisplayName(sourceById.get(sourceId)?.name)}</span>
                  <input
                    inputMode="decimal"
                    onChange={event => {
                      const nextValue = event.target.value;
                      setEditForm(current => current ? {
                        ...current,
                        source_stakes: {
                          ...current.source_stakes,
                          [sourceId]: nextValue
                        }
                      } : current);
                    }}
                    placeholder={`${t("Сумма")} ${currencySymbol(currency)}`}
                    value={editForm.source_stakes[sourceId] ?? editForm.stake}
                  />
                </label>
              ))}
            </div>
          ) : null}
          <div className="calendar-bet-edit-row">
            <BookmakerDropdownField
              onChange={bookmaker => setEditForm(current => (current ? { ...current, bookmaker } : current))}
              options={bookmakerOptions}
              placeholder={t("Букмекер")}
              value={editForm.bookmaker}
            />
            <select
              aria-label={t("Тип ставки")}
              className="calendar-bet-edit-type"
              onChange={event => {
                const is_freebet = event.target.value === "freebet";
                setEditForm(current => (current ? { ...current, is_freebet } : current));
              }}
              value={editForm.is_freebet ? "freebet" : "cash"}
            >
              <option value="cash">{currencyStakeLabel(currency)}</option>
              <option value="freebet">{t("Фрибет")}</option>
            </select>
          </div>
          <div className="calendar-bet-edit-result-row">
            {(["win", "loss", "return", "pending"] as const).map(option => (
              <button
                className={`edit-result-btn ${option} ${editForm.result === option ? "active" : ""}`}
                key={option}
                onClick={() => setEditForm(current => (current ? { ...current, result: option } : current))}
                type="button"
              >
                {option === "win" ? t("Выигрыш") : option === "loss" ? t("Проигрыш") : option === "return" ? t("Возврат") : t("Ожидает")}
              </button>
            ))}
          </div>
          <div className="calendar-bet-edit-actions">
            <button disabled={dataLoading} onClick={onCancelEdit} type="button">{t("Отмена")}</button>
            <button disabled={dataLoading} onClick={onSaveEdit} type="button">{t("Сохранить")}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="calendar-bet-main">
            <strong>{formatEventName(bet.event_name)}</strong>
            <span>{translateBetMarket(bet.market, lang)} · {translateBetSelectionLine(bet.selection, lang)} · ×{odds.toFixed(2)}</span>
          </div>
          <div className="calendar-bet-meta">
            {extraMeta ? <span>{extraMeta}</span> : null}
            <span>{formatMoney(displayedStake, currency)}{freebet ? ` ${t("Фрибет")}` : ""}</span>
            <span>{bet.bookmaker ? translateBookmakerLabel(cleanBookmakerName(bet.bookmaker), lang) : t("БК не указан")}</span>
          </div>
          <div className="calendar-bet-sources">
            {attachedSourceIds.length ? attachedSourceIds.map(sourceId => (
              <span className="calendar-bet-source-tag" key={sourceId}>
                <small className="calendar-bet-source-stake">
                  {formatMoney(getBetSourceStake(bet, sourceId), currency)}{freebet ? ` ${t("Фрибет")}` : ""}
                </small>
                {sourceDisplayName(sourceById.get(sourceId)?.name)}
                <button
                  aria-label={t("Убрать источник")}
                  onClick={() => onRemoveSource(sourceId)}
                  type="button"
                >
                  ✕
                </button>
              </span>
            )) : <span className="calendar-bet-source-tag empty">{t("Без источника")}</span>}

            <div className="calendar-bet-source-add">
              <button
                aria-label={t("Добавить источник")}
                className="calendar-bet-add-source-btn"
                onClick={onToggleSourcePicker}
                title={t("Добавить ещё один источник")}
                type="button"
              >
                +
              </button>
              {sourcePickerOpen ? (
                <div className="calendar-bet-source-picker" role="listbox">
                  {pickableSources.length ? pickableSources.map(source => (
                    <button
                      key={source.id}
                      onClick={() => onAddSource(source.id)}
                      role="option"
                      type="button"
                    >
                      {source.name}
                    </button>
                  )) : <span className="empty">{t("Больше источников нет")}</span>}
                </div>
              ) : null}
            </div>
          </div>
          {bet.result === "pending" ? (
            <div className="calendar-bet-actions">
              <button disabled={dataLoading} onClick={() => onSettle(bet, "win")} type="button">{t("Выигрыш")}</button>
              <button disabled={dataLoading} onClick={() => onSettle(bet, "loss")} type="button">{t("Проигрыш")}</button>
              <button disabled={dataLoading} onClick={() => onSettle(bet, "return")} type="button">{t("Возврат")}</button>
            </div>
          ) : (
            <div className="calendar-bet-result">
              {bet.result === "win" ? t("Выигрыш") : bet.result === "loss" ? t("Проигрыш") : t("Возврат")}
              <strong>{formatMoney(displayedProfit, currency)}</strong>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function Home() {
  const { lang, setLang, t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState("");
  const [profileLogin, setProfileLogin] = useState("");
  const [profileResolved, setProfileResolved] = useState(false);
  const [loginDraft, setLoginDraft] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginSaving, setLoginSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [repeatPasswordInput, setRepeatPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);

  const [sources, setSources] = useState<SourceRow[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [bankrollEvents, setBankrollEvents] = useState<BankrollEventRow[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  const [betForm, setBetForm] = useState({
    sourceId: "",
    eventName: "",
    sport: "football",
    bookmaker: "",
    market: "Победа",
    selection: "",
    odds: "",
    stake: ""
  });

  const [couponItems, setCouponItems] = useState<CouponItem[]>([]);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponDraft, setCouponDraft] = useState({
    bookmaker: "",
    sourceId: "",
    stake: "",
    stakeType: "cash" as StakeKind
  });
  const [sourcePopupOpen, setSourcePopupOpen] = useState(false);
  const [bankrollForm, setBankrollForm] = useState({
    kind: "deposit",
    amount: "",
    note: ""
  });
  const [activeSport, setActiveSport] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>([]);
  const [matchTimeWindow, setMatchTimeWindow] = useState<MatchTimeWindow>(24);
  const [searchQuery, setSearchQuery] = useState("");
  const [bankEditorOpen, setBankEditorOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [calendarDateOpen, setCalendarDateOpen] = useState<Date | null>(null);
  const [sourceBetsOpen, setSourceBetsOpen] = useState<string | null>(null);
  const [allPendingBetsOpen, setAllPendingBetsOpen] = useState(false);
  const [sourceSort, setSourceSort] = useState<{ field: StatsSortField; direction: "asc" | "desc" }>({ field: "roi", direction: "desc" });
  const [bookmakerSort, setBookmakerSort] = useState<{ field: StatsSortField; direction: "asc" | "desc" }>({ field: "roi", direction: "desc" });
  const [editingBetId, setEditingBetId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditBetForm | null>(null);
  const [highlightBetId, setHighlightBetId] = useState<string | null>(null);
  const [sourcePickerForBetId, setSourcePickerForBetId] = useState<string | null>(null);
  const [fixedStakePopoverFor, setFixedStakePopoverFor] = useState<string | null>(null);
  const [sourceFixedStakeInput, setSourceFixedStakeInput] = useState("");
  const [renamingSourceId, setRenamingSourceId] = useState<string | null>(null);
  const [renameSourceInput, setRenameSourceInput] = useState("");
  const [statsPopoverPos, setStatsPopoverPos] = useState<{ left: number; top: number } | null>(null);

  function toggleFixedStakePopover(sourceId: string, anchor: HTMLElement) {
    setFixedStakePopoverFor(current => {
      if (current === sourceId) return null;
      const source = sources.find(row => row.id === sourceId);
      setSourceFixedStakeInput(source?.fixed_stake ? String(source.fixed_stake) : "");
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 220));
      setStatsPopoverPos({ left, top: rect.bottom + 4 });
      return sourceId;
    });
    setRenamingSourceId(null);
  }

  function toggleRenameSourcePopover(sourceId: string, anchor: HTMLElement) {
    setRenamingSourceId(current => {
      if (current === sourceId) return null;
      const source = sources.find(row => row.id === sourceId);
      setRenameSourceInput(source?.name || "");
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 360));
      setStatsPopoverPos({ left, top: rect.bottom + 4 });
      return sourceId;
    });
    setFixedStakePopoverFor(null);
  }

  useEffect(() => {
    if (!fixedStakePopoverFor && !renamingSourceId) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".stats-fixed-stake-wrap") && !target.closest(".stats-popover-floating")) {
        setFixedStakePopoverFor(null);
      }
      if (!target.closest(".stats-rename-wrap") && !target.closest(".stats-popover-floating")) {
        setRenamingSourceId(null);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [fixedStakePopoverFor, renamingSourceId]);

  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const settingsSourceStakeRefs = useRef<Record<string, HTMLInputElement>>({});
  const [flatStakeInput, setFlatStakeInput] = useState("");
  const [couponStakePercent, setCouponStakePercent] = useState("");
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false);

  useEffect(() => {
    if (settingsPanelOpen) {
      const current = getUserFlatStake(user);
      setFlatStakeInput(current > 0 ? String(current) : "");
    }
  }, [settingsPanelOpen, user]);

  useEffect(() => {
    if (!profileLogin || couponDraft.sourceId) return;
    const loginSource = sources.find(source => (
      !source.is_blacklisted && source.name.trim().toLowerCase() === profileLogin.trim().toLowerCase()
    ));
    if (loginSource) {
      setCouponDraft(current => ({ ...current, sourceId: loginSource.id }));
    }
  }, [couponDraft.sourceId, profileLogin, sources]);
  const [countryFilter, setCountryFilter] = useState("all");
  const [tennisTourFilter, setTennisTourFilter] = useState<"all" | TennisTour>("all");
  const [disciplineFilter, setDisciplineFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");

  function selectSport(nextSport: string) {
    setActiveSport(nextSport);
    setCountryFilter("all");
    setTennisTourFilter("all");
    setDisciplineFilter("all");
    setLeagueFilter("all");
    setMatchFilter("all");
    setSearchQuery("");
  }

  const [lineMatches, setLineMatches] = useState<MatchRow[]>([]);
  const [matchBookmakerChoice, setMatchBookmakerChoice] = useState<Record<string, MatchBookmakerKey>>({});
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [standingsRows, setStandingsRows] = useState<StandingRow[]>([]);
  const [standingsPage, setStandingsPage] = useState(1);
  const [counterStrikeRankings, setCounterStrikeRankings] = useState<StandingRow[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsMessage, setStandingsMessage] = useState("");
  const [standingsMatch, setStandingsMatch] = useState<MatchRow | null>(null);
  const [standingsSource, setStandingsSource] = useState("");
  const [standingsTitle, setStandingsTitle] = useState("");
  const [teamCardOpen, setTeamCardOpen] = useState(false);
  const [selectedTeamCard, setSelectedTeamCard] = useState<TeamCard | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesStatus, setMatchesStatus] = useState<MatchesStatusState>({ kind: "idle" });
  const [analyzing, setAnalyzing] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantTab, setAssistantTab] = useState<"settings" | "analysis" | "stats">("settings");
  const [analyzedMatches, setAnalyzedMatches] = useState<MatchRow[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantStakeInput, setAssistantStakeInput] = useState("");
  const [assistantStakeSaving, setAssistantStakeSaving] = useState(false);
  const [assistantSettingsMessage, setAssistantSettingsMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_TEAMS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setFavoriteTeams(Array.isArray(parsed) ? parsed.filter(value => typeof value === "string") : []);
    } catch {
      setFavoriteTeams([]);
    }
  }, []);

  function toggleFavoriteTeam(key: string) {
    setFavoriteTeams(current => {
      const next = current.includes(key) ? current.filter(value => value !== key) : [...current, key];
      try {
        window.localStorage.setItem(FAVORITE_TEAMS_KEY, JSON.stringify(next));
      } catch {
        // Favorite filtering still works for the current session.
      }
      return next;
    });
  }

  useEffect(() => {
    if (assistantOpen) {
      const current = getUserAssistantStake(user);
      setAssistantStakeInput(current > 0 ? String(current) : "");
    }
  }, [assistantOpen, user]);

  useEffect(() => {
    if (!user) {
      setCounterStrikeRankings([]);
      return;
    }

    let cancelled = false;
    void fetch("/api/standings?sport=esports&league=COUNTER%20STRIKE%202", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("ranking unavailable")))
      .then(payload => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.standings) ? payload.standings : [];
        setCounterStrikeRankings(normalizeStandingRows(rows));
      })
      .catch(() => {
        if (!cancelled) setCounterStrikeRankings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const supabaseHost = useMemo(() => {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.local").host;
  }, []);

  const sourceById = useMemo(() => {
    return new Map(sources.map(source => [source.id, source]));
  }, [sources]);

  const couponSourceOptions = useMemo(() => {
    const activeSources = sources.filter(source => !source.is_blacklisted);
    const loginKey = profileLogin.trim().toLowerCase();
    if (!loginKey) return activeSources;

    return [...activeSources].sort((a, b) => {
      const aIsProfile = a.name.trim().toLowerCase() === loginKey;
      const bIsProfile = b.name.trim().toLowerCase() === loginKey;
      if (aIsProfile && !bIsProfile) return -1;
      if (!aIsProfile && bIsProfile) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [profileLogin, sources]);

  const betStats = useMemo(() => {
    const closed = bets.filter(bet => bet.result !== "pending");
    const pending = bets.length - closed.length;
    const avgOdds = bets.length
      ? bets.reduce((sum, bet) => sum + Number(bet.odds || 0), 0) / bets.length
      : 0;
    const totalStake = closed.reduce((sum, bet) => sum + betTotalStakeValue(bet), 0);
    const profit = closed.reduce((sum, bet) => sum + betTotalProfitValue(bet), 0);
    const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;

    return {
      avgOdds,
      closed: closed.length,
      pending,
      profit,
      roi,
      total: bets.length
    };
  }, [bets]);

  const couponTotalOdds = useMemo(() => {
    if (!couponItems.length) return 0;

    return couponItems.reduce((total, item) => {
      const odds = Number(item.odds.replace(",", "."));
      return odds > 1 ? total * odds : total;
    }, 1);
  }, [couponItems]);

  const couponStake = Number(couponDraft.stake.replace(",", ".")) || 0;
  const couponPotentialWin = couponTotalOdds > 1
    ? couponStake * (couponDraft.stakeType === "freebet" ? couponTotalOdds - 1 : couponTotalOdds)
    : 0;
  const bankrollStats = useMemo(() => {
    const map = new Map<string, BankrollEventRow>();
    bankrollEvents.forEach(event => {
      const isBetSettlement = Boolean(event.bet_id) && ["win", "loss", "return"].includes(event.kind);
      const key = isBetSettlement ? "bet:" + event.bet_id : "event:" + event.id;
      const existing = map.get(key);
      // Оставляем самую свежую запись по каждой ставке (не первую в порядке
      // перебора) - иначе устаревший дубликат может навсегда перекрыть
      // актуальный пересчёт результата ставки.
      if (!existing || new Date(event.created_at).getTime() >= new Date(existing.created_at).getTime()) {
        map.set(key, event);
      }
    });
    const normalizedEvents = Array.from(map.values());

    const balance = normalizedEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0);
    const deposits = normalizedEvents
      .filter(event => event.kind === "deposit")
      .reduce((sum, event) => sum + Number(event.amount || 0), 0);
    const withdrawals = normalizedEvents
      .filter(event => event.kind === "withdrawal")
      .reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);
    const bettingProfit = normalizedEvents
      .filter(event => ["win", "loss", "return"].includes(event.kind))
      .reduce((sum, event) => sum + Number(event.amount || 0), 0);

    return {
      balance,
      bettingProfit,
      deposits,
      totalEvents: normalizedEvents.length,
      withdrawals
    };
  }, [bankrollEvents]);

  const settlementEventsByBetId = useMemo(() => {
    const events = new Map<string, BankrollEventRow>();
    bankrollEvents.forEach(event => {
      if (event.bet_id && ["win", "loss", "return"].includes(event.kind)) {
        const existing = events.get(event.bet_id);
        if (!existing || new Date(event.created_at).getTime() >= new Date(existing.created_at).getTime()) {
          events.set(event.bet_id, event);
        }
      }
    });
    return events;
  }, [bankrollEvents]);

  const resolvedBets = useMemo(() => {
    return bets.map(bet => {
      const settlement = settlementEventsByBetId.get(bet.id);
      if (!settlement || bet.result !== "pending") return bet;
      const settlementKind = (settlement.kind === "return" ? "return" : settlement.kind === "win" ? "win" : "loss") as BetRow["result"];
      return {
        ...bet,
        profit: Number(settlement.amount || 0),
        result: settlementKind,
        settled_at: settlement.created_at
      };
    });
  }, [bets, settlementEventsByBetId]);

  const settledBets = useMemo(() => (
    resolvedBets.filter(bet => bet.result !== "pending" && bet.settled_at)
  ), [resolvedBets]);

  const pendingBets = useMemo(() => {
    const settledSignatures = new Set(settledBets.map(bet => betLooseSignature(bet)));
    return uniqueBetsByLooseSignature(
      resolvedBets.filter(bet => (
        bet.result === "pending"
        && !settlementEventsByBetId.has(bet.id)
        && !settledSignatures.has(betLooseSignature(bet))
      ))
    );
  }, [resolvedBets, settledBets, settlementEventsByBetId]);

  const assistantSettledBets = useMemo(() => (
    uniqueBetsByOutcome(settledBets)
      .slice()
      .sort((a, b) => new Date(b.settled_at || b.created_at).getTime() - new Date(a.settled_at || a.created_at).getTime())
  ), [settledBets]);

  const assistantForecastStats = useMemo(() => {
    const stake = assistantSettledBets.reduce((sum, bet) => sum + betTotalStakeValue(bet), 0);
    const oddsSum = assistantSettledBets.reduce((sum, bet) => sum + Number(bet.odds || 0), 0);
    const profit = assistantSettledBets.reduce((sum, bet) => sum + betTotalProfitValue(bet), 0);

    return {
      avgOdds: assistantSettledBets.length ? oddsSum / assistantSettledBets.length : 0,
      losses: assistantSettledBets.filter(bet => bet.result === "loss").length,
      profit,
      roi: stake > 0 ? (profit / stake) * 100 : 0,
      returns: assistantSettledBets.filter(bet => bet.result === "return").length,
      stake,
      total: assistantSettledBets.length,
      wins: assistantSettledBets.filter(bet => bet.result === "win").length
    };
  }, [assistantSettledBets]);

  const calendarDays = useMemo(() => makeCalendarDays(), []);

  const calendarBets = useMemo(() => {
    if (!calendarDateOpen) return [];

    return resolvedBets
      .filter(bet => isSameLocalDate(bet.created_at, calendarDateOpen))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [resolvedBets, calendarDateOpen]);

  const sourceBetsList = useMemo(() => {
    if (!sourceBetsOpen) return [];

    return resolvedBets
      .filter(bet => {
        const ids = getBetSourceIds(bet);
        return sourceBetsOpen === "__no_source__" ? !ids.length : ids.includes(sourceBetsOpen);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [resolvedBets, sourceBetsOpen]);

  const sourceStats = useMemo(() => {
    const sourceMeta = new Map(sources.map(source => [source.id, source]));
    const grouped = new Map<string, {
      avgOdds: number;
      avgStake: number;
      bets: number;
      id: string;
      is_blacklisted: boolean;
      losses: number;
      name: string;
      oddsSum: number;
      profit: number;
      returns: number;
      roi: number;
      stake: number;
      winrate: number;
      wins: number;
    }>();

    const ensureSource = (id: string, name: string, isBlacklisted: boolean) => {
      const current = grouped.get(id);
      if (current) return current;

      const next = {
        avgOdds: 0,
        avgStake: 0,
        bets: 0,
        id,
        is_blacklisted: isBlacklisted,
        losses: 0,
        name: sourceDisplayName(name || "Без источника"),
        oddsSum: 0,
        profit: 0,
        returns: 0,
        roi: 0,
        stake: 0,
        winrate: 0,
        wins: 0
      };
      grouped.set(id, next);
      return next;
    };

    for (const bet of settledBets) {
      const ids = getBetSourceIds(bet);
      const targetIds = ids.length ? ids : ["__no_source__"];

      for (const sourceId of targetIds) {
        const source = sourceId !== "__no_source__" ? sourceMeta.get(sourceId) : null;
        const stat = ensureSource(
          source?.id || sourceId,
          source?.name || (sourceId !== "__no_source__" ? "Источник" : "Без источника"),
          Boolean(source?.is_blacklisted)
        );

        // Полная сумма/результат ставки засчитывается КАЖДОМУ источнику -
        // не делится между ними, даже если их несколько на одной ставке.
        const sourceStake = sourceId === "__no_source__" ? parseMoneyValue(bet.stake) : getBetSourceStake(bet, sourceId);
        stat.bets += 1;
        stat.stake += sourceStake;
        stat.profit += profitForStake(bet.result, sourceStake, Number(bet.odds || 0));
        stat.oddsSum += Number(bet.odds || 0);

        if (bet.result === "win") stat.wins += 1;
        if (bet.result === "loss") stat.losses += 1;
        if (bet.result === "return") stat.returns += 1;
      }
    }

    return Array.from(grouped.values())
      .map(stat => {
        const winLossTotal = stat.wins + stat.losses;
        return {
          ...stat,
          avgOdds: stat.bets ? stat.oddsSum / stat.bets : 0,
          avgStake: stat.bets ? stat.stake / stat.bets : 0,
          roi: stat.stake ? (stat.profit / stat.stake) * 100 : 0,
          winrate: winLossTotal ? (stat.wins / winLossTotal) * 100 : 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
  }, [settledBets, sources]);

  const bookmakerStats = useMemo(() => {
    const grouped = new Map<string, {
      avgOdds: number;
      avgStake: number;
      bets: number;
      id: string;
      losses: number;
      name: string;
      oddsSum: number;
      profit: number;
      returns: number;
      roi: number;
      stake: number;
      winrate: number;
      wins: number;
    }>();

    const ensureBookmaker = (name: string) => {
      const current = grouped.get(name);
      if (current) return current;

      const next = {
        avgOdds: 0,
        avgStake: 0,
        bets: 0,
        id: name,
        losses: 0,
        name,
        oddsSum: 0,
        profit: 0,
        returns: 0,
        roi: 0,
        stake: 0,
        winrate: 0,
        wins: 0
      };
      grouped.set(name, next);
      return next;
    };

    for (const bet of settledBets) {
      const name = (bet.bookmaker || "").trim() || "Букмекер не указан";
      const stat = ensureBookmaker(name);

      stat.bets += 1;
      stat.stake += betTotalStakeValue(bet);
      stat.profit += betTotalProfitValue(bet);
      stat.oddsSum += Number(bet.odds || 0);

      if (bet.result === "win") stat.wins += 1;
      if (bet.result === "loss") stat.losses += 1;
      if (bet.result === "return") stat.returns += 1;
    }

    return Array.from(grouped.values())
      .map(stat => {
        const winLossTotal = stat.wins + stat.losses;
        return {
          ...stat,
          avgOdds: stat.bets ? stat.oddsSum / stat.bets : 0,
          avgStake: stat.bets ? stat.stake / stat.bets : 0,
          roi: stat.stake ? (stat.profit / stat.stake) * 100 : 0,
          winrate: winLossTotal ? (stat.wins / winLossTotal) * 100 : 0
        };
      })
      .sort((a, b) => b.bets - a.bets);
  }, [settledBets]);

  const bankrollAdjustments = useMemo(() => {
    const normalizedEvents = Array.from(bankrollEvents.reduce((map, event) => {
      const isBetSettlement = Boolean(event.bet_id) && ["win", "loss", "return"].includes(event.kind);
      map.set(isBetSettlement ? "bet:" + event.bet_id : "event:" + event.id, event);
      return map;
    }, new Map<string, BankrollEventRow>()).values());

    return normalizedEvents
      .filter(event => event.kind === "deposit" || event.kind === "withdrawal")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bankrollEvents]);

  function toggleColumnSort(
    setSort: Dispatch<SetStateAction<{ field: StatsSortField; direction: "asc" | "desc" }>>,
    field: StatsSortField
  ) {
    setSort(current => (
      current.field === field
        ? { field, direction: current.direction === "desc" ? "asc" : "desc" }
        : { field, direction: "desc" }
    ));
  }

  function applyStatsSort<T extends {
    avgOdds: number;
    avgStake: number;
    bets: number;
    name: string;
    profit?: number;
    roi: number;
    stake: number;
    winrate: number;
    wins: number;
  }>(list: T[], sort: { field: StatsSortField; direction: "asc" | "desc" }): T[] {
    const sorted = [...list];
    sorted.sort((a, b) => {
      let diff: number;
      if (sort.field === "name") diff = a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
      else if (sort.field === "profit") diff = (a.profit ?? 0) - (b.profit ?? 0);
      else diff = (a[sort.field] as number) - (b[sort.field] as number);
      return sort.direction === "asc" ? diff : -diff;
    });
    return sorted;
  }

  const sortedSourceStats = useMemo(
    () => applyStatsSort(sourceStats.filter(source => !source.is_blacklisted), sourceSort),
    [sourceStats, sourceSort]
  );

  const blacklistedSourceStats = useMemo(
    () => sourceStats
      .filter(source => source.is_blacklisted)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [sourceStats]
  );

  const sortedBookmakerStats = useMemo(
    () => applyStatsSort(bookmakerStats, bookmakerSort),
    [bookmakerStats, bookmakerSort]
  );

  const sourceRoiById = useMemo(
    () => new Map(sourceStats.map(stat => [stat.id, { roi: stat.roi, profit: stat.profit }])),
    [sourceStats]
  );

  const activeMatches = useMemo(() => {
    const queryGroups = searchTokenGroups(searchQuery);
    const upcomingMatches = getMatchesInTimeWindow(lineMatches, matchTimeWindow);

    return upcomingMatches.filter(match => {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const countryOk =
        activeSport === "esports" ||
        activeSport === "tennis" ||
        countryFilter === "all" ||
        match.country === countryFilter;
      const tennisTourOk =
        activeSport !== "tennis" ||
        tennisTourFilter === "all" ||
        match.tennisTour === tennisTourFilter;
      const disciplineOk =
        activeSport !== "esports" ||
        disciplineFilter === "all" ||
        getEsportsDiscipline(match).key === disciplineFilter;
      const leagueOk = leagueFilter === "all" || match.league === leagueFilter;
      const tierOk =
        matchFilter === "all" ||
        (matchFilter === "fav" && (
          favoriteTeams.includes(favoriteTeamKeyFromParts(match.sport, match.league, match.home, match.homeTeamId)) ||
          favoriteTeams.includes(favoriteTeamKeyFromParts(match.sport, match.league, match.away, match.awayTeamId))
        ));
      const haystack = searchHaystack(match.home, match.away, match.league, match.country);
      const searchOk =
        !queryGroups.length ||
        queryGroups.every(group => group.some(token => haystack.includes(token)));

      return sportOk && countryOk && tennisTourOk && disciplineOk && leagueOk && tierOk && searchOk;
    });
  }, [activeSport, countryFilter, disciplineFilter, favoriteTeams, leagueFilter, matchFilter, lineMatches, matchTimeWindow, searchQuery, tennisTourFilter]);

  const matchCounts = useMemo(() => {
    const upcomingMatches = getMatchesInTimeWindow(lineMatches, matchTimeWindow);
    const counts = new Map<string, number>();

    for (const match of upcomingMatches) {
      counts.set(match.sport, (counts.get(match.sport) || 0) + 1);
    }

    return {
      all: upcomingMatches.length,
      bySport: counts
    };
  }, [lineMatches, matchTimeWindow]);

  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of getMatchesInTimeWindow(lineMatches, matchTimeWindow)) {
      const c = match.country;
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return counts;
  }, [lineMatches, matchTimeWindow]);

  const tennisTourCounts = useMemo(() => {
    const counts = new Map<TennisTour, number>();
    for (const match of getMatchesInTimeWindow(lineMatches, matchTimeWindow)) {
      if (match.sport !== "tennis" || !match.tennisTour) continue;
      counts.set(match.tennisTour, (counts.get(match.tennisTour) || 0) + 1);
    }
    return counts;
  }, [lineMatches, matchTimeWindow]);

  const disciplineCounts = useMemo(() => {
    const counts = new Map<string, EsportsDiscipline & { count: number }>();
    for (const match of getMatchesInTimeWindow(lineMatches, matchTimeWindow)) {
      if (match.sport !== "esports") continue;
      const discipline = getEsportsDiscipline(match);
      const existing = counts.get(discipline.key);
      if (existing) existing.count += 1;
      else counts.set(discipline.key, { ...discipline, count: 1 });
    }
    return counts;
  }, [lineMatches, matchTimeWindow]);

  const leagueCounts = useMemo(() => {
    const counts = new Map<string, { count: number; country: string; league: string; sport: string }>();
    for (const match of getMatchesInTimeWindow(lineMatches, matchTimeWindow)) {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const contextOk = activeSport === "esports"
        ? disciplineFilter === "all" || getEsportsDiscipline(match).key === disciplineFilter
        : activeSport === "tennis"
          ? tennisTourFilter === "all" || match.tennisTour === tennisTourFilter
          : countryFilter === "all" || match.country === countryFilter;
      if (!sportOk || !contextOk) continue;
      const l = match.league;
      if (!l) continue;
      // Ключ включает вид спорта, иначе одноимённые лиги разных видов спорта
      // (например "Премьер-лига" в футболе и в другом спорте) схлопнутся в
      // одну запись с неоднозначной иконкой вида спорта.
      const key = `${match.sport}::${l}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { count: 1, country: match.country || "World", league: l, sport: match.sport });
    }
    return counts;
  }, [activeSport, countryFilter, disciplineFilter, lineMatches, matchTimeWindow, tennisTourFilter]);

  const standingsGroups = useMemo(() => {
    const groups = new Map<string, StandingRow[]>();
    standingsRows.forEach(row => {
      const key = `${row.league} · ${row.division}`;
      const groupKey = row.division && row.division !== row.league ? key : row.league;
      const group = groups.get(groupKey);
      if (group) group.push(row);
      else groups.set(groupKey, [row]);
    });
    return Array.from(groups.entries()).map(([title, rows]) => ({
      title,
      rows: rows.slice().sort((a, b) => a.rank - b.rank)
    }));
  }, [standingsRows]);

  const counterStrikeStandingsOpen = Boolean(standingsMatch && isCounterStrikeMatch(standingsMatch));
  const tennisStandingsOpen = standingsMatch?.sport === "tennis";
  const pagedStandingsOpen = counterStrikeStandingsOpen || tennisStandingsOpen;
  const standingsPageCount = pagedStandingsOpen ? Math.max(1, Math.ceil(standingsRows.length / 10)) : 1;
  const visibleStandingsGroups = useMemo(() => {
    if (!pagedStandingsOpen) return standingsGroups;
    const start = (standingsPage - 1) * 10;
    return standingsGroups.map(group => ({ ...group, rows: group.rows.slice(start, start + 10) })).filter(group => group.rows.length);
  }, [pagedStandingsOpen, standingsGroups, standingsPage]);
  const selectedCounterStrikeTeams = useMemo(() => {
    if (!counterStrikeStandingsOpen || !standingsMatch) return [];
    return [standingsMatch.home, standingsMatch.away].map(team => ({
      requestedName: team,
      standing: esportsStandingForTeam(team, standingsRows)
    }));
  }, [counterStrikeStandingsOpen, standingsMatch, standingsRows]);
  const selectedTennisPlayers = useMemo(() => {
    if (!tennisStandingsOpen || !standingsMatch) return [];
    const players = [...(standingsMatch.homePlayers || []), ...(standingsMatch.awayPlayers || [])];
    return players.map(player => ({
      player,
      standing: standingsRows.find(row => (
        row.id === player.id || tennisPlayerNamesMatch(row.team, player.name)
      )) || null
    }));
  }, [standingsMatch, standingsRows, tennisStandingsOpen]);

  useEffect(() => {
    setStandingsPage(current => Math.min(Math.max(1, current), standingsPageCount));
  }, [standingsPageCount]);

  const visibleAnalyzedMatches = useMemo(() => uniqueAnalyzedMatches(analyzedMatches), [analyzedMatches]);

  async function refreshMatchesWindow() {
    const cachedMatches = readCachedMatches();
    if (cachedMatches.length) {
      setLineMatches(cachedMatches);
      setMatchesStatus({ kind: "cache", count: cachedMatches.length });
    }

    setMatchesLoading(true);

    try {
      const requestHours = matchTimeWindow === "all" ? 24 * 365 : Number(matchTimeWindow);
      const response = await fetch(`/api/matches?hours=${requestHours}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cachedMatches.length) setLineMatches([]);
        setMatchesStatus({ kind: "unavailable" });
        return;
      }

      const payload = await response.json();
      const rawMatches = Array.isArray(payload) ? payload : Array.isArray(payload?.matches) ? payload.matches : [];
      const normalizedMatches: MatchRow[] = mergeClientMatches(rawMatches
        .map((match: Partial<MatchRow> & Record<string, unknown>, index: number) => {
          const startsAt = typeof match.startsAt === "string" ? match.startsAt : undefined;
          const startsAtTime = startsAt ? new Date(startsAt) : null;
          const odds = Array.isArray(match.odds) ? match.odds.map(String) : ["-", "-", "-"];

          return {
            id: String(match.id || `line-${index}`),
            sport: String(match.sport || "football"),
            country: String(match.country || "INT"),
            league: String(match.league || "Линия букмекеров"),
            time:
              typeof match.time === "string"
                ? match.time
                : startsAtTime
                  ? startsAtTime.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                  : "--:--",
            home: String(match.home || ""),
            away: String(match.away || ""),
            odds: [odds[0] || "-", odds[1] || "-", odds[2] || "-"],
            bookmakerOdds: typeof match.bookmakerOdds === "object" && match.bookmakerOdds ? match.bookmakerOdds as MatchRow["bookmakerOdds"] : undefined,
            bestBookmakers: Array.isArray(match.bestBookmakers) ? match.bestBookmakers.map(String) : undefined,
            confidence: Number(match.confidence || 0),
            recommendationSide: (["home", "draw", "away"].includes(String(match.recommendationSide)) ? match.recommendationSide : "home") as MatchRow["recommendationSide"],
            startsAt,
            homeTeamId: match.homeTeamId ? String(match.homeTeamId) : undefined,
            awayTeamId: match.awayTeamId ? String(match.awayTeamId) : undefined,
            tennisTour: match.tennisTour === "WTA" ? "WTA" : match.tennisTour === "ATP" ? "ATP" : undefined,
            homePlayers: Array.isArray(match.homePlayers)
              ? (match.homePlayers as TennisParticipant[]).map(player => ({
                  ...player,
                  id: String(player.id),
                  sourceName: String(player.sourceName),
                  name: String(player.name),
                  tour: player.tour === "WTA" ? "WTA" : player.tour === "ATP" ? "ATP" : null,
                  rank: player.rank === null ? null : Number(player.rank),
                  country: String(player.country || ""),
                  points: player.points === null ? null : Number(player.points)
                }))
              : undefined,
            awayPlayers: Array.isArray(match.awayPlayers)
              ? (match.awayPlayers as TennisParticipant[]).map(player => ({
                  ...player,
                  id: String(player.id),
                  sourceName: String(player.sourceName),
                  name: String(player.name),
                  tour: player.tour === "WTA" ? "WTA" : player.tour === "ATP" ? "ATP" : null,
                  rank: player.rank === null ? null : Number(player.rank),
                  country: String(player.country || ""),
                  points: player.points === null ? null : Number(player.points)
                }))
              : undefined
          };
        })
        .filter((match: MatchRow) => match.home && match.away));

      if (!normalizedMatches.length && cachedMatches.length) {
        setLineMatches(cachedMatches);
        setMatchesStatus({ kind: "cache", count: cachedMatches.length });
        return;
      }

      const upcomingMatches = getMatchesInTimeWindow(normalizedMatches, matchTimeWindow);
      setLineMatches(getFutureMatches(normalizedMatches));
      setMatchesStatus({ kind: "live", count: normalizedMatches.length });
      if (normalizedMatches.length) writeCachedMatches(normalizedMatches);
      await analyzeMatches(upcomingMatches);
    } catch {
      if (!cachedMatches.length) setLineMatches([]);
      setMatchesStatus({ kind: "unavailable" });
    } finally {
      setMatchesLoading(false);
    }
  }

  // ── АНАЛИЗ: пересчитывает рекомендации по свежим коэффициентам и
  // сохраняет прогнозы в базу, чтобы позже сверить их с результатами
  // (обучение на ошибках — этап 2).
  async function openStandings(match: MatchRow) {
    const matchTitle = match.away ? `${match.home} — ${match.away}` : match.home;
    const defaultTennisTour = match.tennisTour
      || ([...(match.homePlayers || []), ...(match.awayPlayers || [])].find(player => player.tour)?.tour)
      || "ATP";
    setStandingsOpen(true);
    setStandingsMatch(match);
    setStandingsPage(1);
    setStandingsSource("");
    setStandingsTitle(`${match.league} · ${matchTitle}`);
    setStandingsLoading(true);
    setStandingsMessage("");

    try {
      const params = new URLSearchParams({
        sport: match.sport,
        league: match.league
      });
      if (match.sport === "tennis") params.set("tour", defaultTennisTour);
      const response = await fetch(`/api/standings?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("standings unavailable");
      const payload = await response.json();
      setStandingsSource(String(payload?.source || ""));
      setStandingsTitle(`${String(payload?.league || match.league)} · ${matchTitle}`);
      const rows = Array.isArray(payload?.standings) ? payload.standings : [];
      const normalizedRows = normalizeStandingRows(rows);
      setStandingsRows(normalizedRows);
      if (isCounterStrikeMatch(match)) {
        setCounterStrikeRankings(normalizedRows);
        const firstSelectedIndex = normalizedRows.findIndex(row => (
          esportsTeamNamesMatch(row.team, match.home) || esportsTeamNamesMatch(row.team, match.away)
        ));
        setStandingsPage(firstSelectedIndex >= 0 ? Math.floor(firstSelectedIndex / 10) + 1 : 1);
      } else if (match.sport === "tennis") {
        const selectedIds = new Set([...(match.homePlayers || []), ...(match.awayPlayers || [])].map(player => player.id));
        const firstSelectedIndex = normalizedRows.findIndex(row => selectedIds.has(row.id));
        setStandingsPage(firstSelectedIndex >= 0 ? Math.floor(firstSelectedIndex / 10) + 1 : 1);
      }
    } catch {
      setStandingsRows([]);
      setStandingsMessage(t("Турнирная таблица сейчас недоступна."));
    } finally {
      setStandingsLoading(false);
    }

  }

  async function openTeamProfile(card: TeamCard, standing?: StandingRow) {
    const initialCard = standing
      ? {
          ...card,
          rank: standing.rank,
          form: standing.form || "-",
          wins: standing.wins,
          losses: standing.losses,
          pct: standing.pct,
          gamesBack: standing.gamesBack,
          points: standing.points,
          change: standing.change,
          logo: standing.logo || card.logo,
          profileUrl: standing.profileUrl
        }
      : card;
    setSelectedTeamCard(initialCard);
    setStandingsOpen(false);
    setTeamCardOpen(true);

    if (standing || isEsportsTeamCard(card) || isTennisPlayerCard(card) || ("kind" in card && card.kind === "generic")) return;

    try {
      const profileSport = card.league === "WNBA" ? "basketball" : "baseball";
      const response = await fetch(`/api/standings?sport=${profileSport}&league=${encodeURIComponent(card.league)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const rows = Array.isArray(payload?.standings) ? payload.standings : [];
      const teamStanding = rows.find((row: Partial<StandingRow>) => (
        row.id === clientLeagueTeamId(card)
        || clientLeagueTeamCard(String(row.team || ""), String(row.id || ""))?.id === card.id
      ));
      if (!teamStanding) return;
      setSelectedTeamCard(current => current?.id === card.id ? {
        ...current,
        rank: Number(teamStanding.rank || current.rank),
        form: String(teamStanding.form || "-"),
        wins: Number(teamStanding.wins || 0),
        losses: Number(teamStanding.losses || 0),
        pct: String(teamStanding.pct || "-"),
        gamesBack: String(teamStanding.gamesBack || "-")
      } : current);
    } catch {
      // The offline team profile remains available if live standings cannot be loaded.
    }
  }

  function openTeamCard(match: MatchRow, side: "home" | "away") {
    const name = side === "home" ? match.home : match.away;
    if (isCounterStrikeMatch(match)) {
      const standing = esportsStandingForTeam(name, counterStrikeRankings);
      void openTeamProfile(esportsTeamCard(name, standing), standing || undefined);
      return;
    }

    const teamId = side === "home" ? match.homeTeamId : match.awayTeamId;
    const card = clientLeagueTeamCard(name, teamId);
    void openTeamProfile(card || genericTeamCard(match, side));
  }

  function openTeamCardStandings(card: TeamCard) {
    if (isEsportsTeamCard(card) || isTennisPlayerCard(card) || ("kind" in card && card.kind === "generic")) return;
    const sport = card.league === "WNBA" ? "basketball" : "baseball";
    setTeamCardOpen(false);
    void openStandings({
      id: `team-standings-${card.id}`,
      sport,
      country: card.country,
      league: card.league,
      time: "",
      home: card.name,
      away: "",
      odds: [],
      confidence: 0,
      recommendationSide: "home",
      homeTeamId: clientLeagueTeamId(card),
      standingsOnly: true
    });
  }

  function openTennisPlayer(player: TennisParticipant) {
    void openTeamProfile(tennisPlayerCard(player));
  }

  async function analyzeMatches(matches: MatchRow[], openAssistant = false) {
    if (analyzing) return;
    if (!matches.length) return;
    setAnalyzing(true);
    setDataMessage("");

    try {
      const uniqueMatches = uniqueAnalyzedMatches(matches);

      if (user) {
        const rows = uniqueMatches.map(match => ({
          away: match.away,
          confidence: match.confidence,
          home: match.home,
          league: match.league,
          match_id: analysisMatchKey(match),
          odds: match.odds.join("/"),
          recommendation_side: match.recommendationSide,
          sport: match.sport,
          starts_at: match.startsAt || null,
          user_id: user.id
        }));

        if (rows.length) {
          const { error } = await supabase
            .from("ai_predictions")
            .upsert(rows, { onConflict: "user_id,match_id" });
          if (error) console.error("ai_predictions upsert failed", error.message);
        }
      }

      setAnalyzedMatches(current => {
        return uniqueAnalyzedMatches([...current, ...uniqueMatches]);
      });
      if (openAssistant) setAssistantOpen(true);

      setDataMessage(`${t("✅ Анализ завершён:")} ${matches.length} ${t("матчей")}`);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : t("Не удалось выполнить анализ."));
    } finally {
      setAnalyzing(false);
    }
  }

  // ── АССИСТЕНТ: отправляет вопрос пользователя + контекст текущих
  // матчей в /api/assistant (сервер сам обращается к Anthropic API,
  // ключ никогда не попадает в браузер).
  async function sendAssistantMessage(presetText?: string) {
    const text = (presetText ?? assistantInput).trim();
    if (!text || assistantLoading) return;

    setAssistantMessages(current => [...current, { role: "user", text }]);
    setAssistantInput("");
    setAssistantLoading(true);

    try {
      const topMatches = [...activeMatches]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 25)
        .map(match => ({
          away: match.away,
          confidence: match.confidence,
          home: match.home,
          league: match.league,
          odds: match.odds,
          recommendationSide: match.recommendationSide,
          sport: match.sport
        }));

      const response = await fetch("/api/assistant", {
        body: JSON.stringify({ history: assistantMessages, matches: topMatches, message: text }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || t("Ассистент временно недоступен."));
      }

      setAssistantMessages(current => [...current, { role: "assistant", text: String(payload.reply || "") }]);
    } catch (error) {
      const replyText = error instanceof Error ? error.message : t("Ассистент временно недоступен.");
      setAssistantMessages(current => [...current, { role: "assistant", text: replyText }]);
    } finally {
      setAssistantLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
        setPasswordEditorOpen(true);
        setSettingsPanelOpen(true);
        setPasswordMessage("Введи новый пароль два раза, чтобы завершить восстановление.");
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    refreshMatchesWindow();
    const timer = window.setInterval(refreshMatchesWindow, 5 * 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [user, matchTimeWindow]);

  useEffect(() => {
    if (!user?.email) {
      setSources([]);
      setBets([]);
      setBankrollEvents([]);
      setProfileLogin("");
      setProfileResolved(false);
      setLoginDraft("");
      setLoginMessage("");
      setPasswordRecoveryMode(false);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setRepeatPasswordInput("");
      setPasswordMessage("");
      setPasswordEditorOpen(false);
      return;
    }

    let cancelled = false;
    setProfileLogin("");
    setProfileResolved(false);
    void syncUserProfile(user).finally(() => {
      if (!cancelled) setProfileResolved(true);
    });
    loadWorkspaceData(user.id);

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function syncUserProfile(currentUser: User) {
    if (!currentUser.email) return;

    const fallbackName = currentUser.user_metadata?.display_name || currentUser.email.split("@")[0];
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        id: currentUser.id,
        email: currentUser.email,
        display_name: fallbackName
      }, { onConflict: "id" })
      .select("login")
      .single<ProfileRow>();

    if (error) {
      setLoginMessage(error.message);
      setLoginDraft(fallbackName);
      return;
    }

    const login = data?.login || "";
    setProfileLogin(login);
    setLoginDraft(login || fallbackName);
    setLoginMessage("");
    if (login) {
      await ensureLoginSource(currentUser.id, login);
    }
  }

  async function ensureLoginSource(userId: string, login: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("sources")
      .upsert({ user_id: userId, name: login }, { onConflict: "user_id,name" })
      .select("id")
      .single();

    if (error) {
      setDataMessage(error.message);
      return null;
    }

    if (data?.id) {
      setCouponDraft(current => current.sourceId ? current : { ...current, sourceId: data.id });
      return data.id;
    }

    return null;
  }

  async function loadWorkspaceData(userId: string) {
    setDataLoading(true);
    setDataMessage("");

    const [sourcesResult, betsResult, bankrollResult] = await Promise.all([
      supabase
        .from("sources")
        .select("id,name,is_blacklisted,fixed_stake")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("bets")
        .select("id,source_id,extra_source_ids,source_stakes,event_name,sport,bookmaker,is_freebet,market,selection,odds,stake,result,profit,settled_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("bankroll_events")
        .select("id,bet_id,amount,kind,note,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000)
    ]);

    if (sourcesResult.error || betsResult.error || bankrollResult.error) {
      setDataMessage(
        sourcesResult.error?.message
        || betsResult.error?.message
        || bankrollResult.error?.message
        || t("Ошибка загрузки данных.")
      );
    } else {
      setSources((sourcesResult.data || []) as SourceRow[]);
      setBets((betsResult.data || []) as BetRow[]);
      setBankrollEvents((bankrollResult.data || []) as BankrollEventRow[]);
    }

    setDataLoading(false);
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanEmail || !password || (mode === "register" && !cleanName)) {
      setStatus("error");
      setMessage(t("Заполни email, пароль и никнейм для регистрации."));
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("ok");
      setMessage(t("Вход выполнен."));
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: cleanName
        }
      }
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (data.session && data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: cleanEmail,
        display_name: cleanName
      });
    }

    setStatus("ok");
    setMessage(t("Аккаунт создан. Если Supabase просит подтверждение почты, открой письмо."));
  }

  async function sendPasswordReset() {
    const cleanEmail = (user?.email || email).trim();
    if (!cleanEmail) {
      setStatus("error");
      setMessage("Укажи email, чтобы отправить письмо для смены пароля.");
      return;
    }

    setResetSending(true);
    setStatus("loading");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      if (user) setPasswordMessage(error.message);
    } else {
      setStatus("ok");
      setMessage("Письмо для смены пароля отправлено на почту.");
      if (user) setPasswordMessage("Письмо для смены пароля отправлено на почту.");
    }

    setResetSending(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setStatus("idle");
    setMessage("");
  }

  async function handleSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const name = sourceName.trim();
    if (!name) return;

    const blacklistedMatch = sources.find(
      source => source.is_blacklisted && source.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (blacklistedMatch) {
      window.alert(t("Этот источник в чёрном списке и не может быть добавлен снова."));
      return;
    }

    setDataLoading(true);
    const { error } = await supabase
      .from("sources")
      .upsert({ user_id: user.id, name }, { onConflict: "user_id,name" });

    if (error) {
      setDataMessage(error.message);
    } else {
      setSourceName("");
      await loadWorkspaceData(user.id);
    }
    setDataLoading(false);
  }

  async function toggleSourceBlacklist(source: SourceRow) {
    if (!user) return;

    setDataLoading(true);
    const { error } = await supabase
      .from("sources")
      .update({ is_blacklisted: !source.is_blacklisted })
      .eq("id", source.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      await loadWorkspaceData(user.id);
    }
    setDataLoading(false);
  }

  async function saveSourceFixedStake(sourceId: string, amount: number | null) {
    if (!user) return;

    setDataLoading(true);
    const { error } = await supabase
      .from("sources")
      .update({ fixed_stake: amount })
      .eq("id", sourceId)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      setSources(current => current.map(source => (
        source.id === sourceId ? { ...source, fixed_stake: amount } : source
      )));
    }
    setFixedStakePopoverFor(null);
    setDataLoading(false);
  }

  async function saveSourceRename(sourceId: string, rawName: string) {
    if (!user) return;
    const name = rawName.trim();
    if (!name) return;

    const duplicate = sources.find(
      source => source.id !== sourceId && source.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      window.alert(
        duplicate.is_blacklisted
          ? t("Этот источник в чёрном списке и не может быть добавлен снова.")
          : t("Источник с таким названием уже существует.")
      );
      return;
    }

    setDataLoading(true);
    const { error } = await supabase
      .from("sources")
      .update({ name })
      .eq("id", sourceId)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      setSources(current => current.map(source => (
        source.id === sourceId ? { ...source, name } : source
      )));
    }
    setRenamingSourceId(null);
    setDataLoading(false);
  }

  async function handleBetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const odds = Number(betForm.odds.replace(",", "."));
    const stake = Number(betForm.stake.replace(",", "."));

    if (!betForm.sourceId || !betForm.eventName.trim() || !betForm.selection.trim() || !odds || !stake) {
      setDataMessage(t("Для ставки нужны источник, матч, исход, коэффициент и сумма."));
      return;
    }

    setDataLoading(true);
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      source_id: betForm.sourceId,
      event_name: betForm.eventName.trim(),
      sport: betForm.sport.trim() || null,
      bookmaker: betForm.bookmaker.trim() || null,
      market: betForm.market.trim() || "Исход",
      selection: betForm.selection.trim(),
      odds,
      stake,
      source_stakes: { [betForm.sourceId]: stake },
      result: "pending"
    });

    if (error) {
      setDataMessage(error.message);
    } else {
      setBetForm({
        sourceId: betForm.sourceId,
        eventName: "",
        sport: betForm.sport,
        bookmaker: betForm.bookmaker,
        market: "Победа",
        selection: "",
        odds: "",
        stake: ""
      });
      await loadWorkspaceData(user.id);
    }
    setDataLoading(false);
  }

  function buildCouponItem(match: MatchRow, bookmaker: MatchBookmakerKey): CouponItem {
    const view = matchOddsForBookmaker(match, bookmaker);
    const outcome = recommendedOutcome(match, view.odds);

    return {
      id: `${match.id}-${Date.now()}`,
      matchId: match.id,
      eventName: `${match.home} - ${match.away}`,
      sport: match.sport,
      market: "Победа",
      selection: outcome.selection,
      odds: outcome.odds
    };
  }

  function toggleCouponMatch(match: MatchRow, bookmaker: MatchBookmakerKey = "best") {
    setCouponItems(current => {
      if (current.some(item => item.matchId === match.id)) {
        return current.filter(item => item.matchId !== match.id);
      }

      if (current.length >= MAX_COUPON_ITEMS) {
        setDataMessage(`${t("В купоне максимум")} ${MAX_COUPON_ITEMS} ${t("матчей.")}`);
        return current;
      }

      setCouponOpen(true);
      setDataMessage("");
      const assistantStake = getUserAssistantStake(user);
      if (assistantStake > 0) {
        setCouponDraft(draft => ({ ...draft, stake: String(assistantStake) }));
      }
      return [...current, buildCouponItem(match, bookmaker)];
    });
  }

  function updateCouponItem(id: string, patch: Partial<CouponItem>) {
    setCouponItems(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function saveCoupon() {
    if (!user) return;

    const activeStake = Number(couponDraft.stake.replace(",", ".")) || 0;
    const isFreebet = couponDraft.stakeType === "freebet";

    if (!couponItems.length) {
      setDataMessage(t("Добавь хотя бы один матч в купон."));
      return;
    }

    if (!couponDraft.bookmaker || !couponDraft.sourceId || activeStake <= 0) {
      setDataMessage(t("Для купона нужны букмекер, источник и сумма ставки или фрибета."));
      return;
    }

    const invalid = couponItems.some(item => {
      const odds = Number(item.odds.replace(",", "."));
      return !item.selection.trim() || !odds || odds < 1.01;
    });

    if (invalid) {
      setDataMessage(t("Проверь исходы и коэффициенты в купоне."));
      return;
    }

    const existingOutcomeSignatures = new Set(resolvedBets.map(bet => betOutcomeSignature(bet)));
    const duplicateOutcome = couponItems.find(item => existingOutcomeSignatures.has(betOutcomeSignature({
      event_name: item.eventName,
      market: item.market,
      selection: item.selection
    })));

    if (duplicateOutcome) {
      setDataMessage(`${t("Этот исход уже сохранён:")} ${duplicateOutcome.eventName} · ${duplicateOutcome.market} ${duplicateOutcome.selection}`);
      return;
    }

    const payload = couponItems.length === 1
      ? {
          event_name: couponItems[0].eventName,
          sport: couponItems[0].sport,
          market: couponItems[0].market || "Исход",
          selection: couponItems[0].selection,
          odds: Number(couponItems[0].odds.replace(",", "."))
        }
      : {
          event_name: couponItems.map(item => item.eventName).join(" + "),
          sport: "express",
          market: `Экспресс · ${couponItems.length} события`,
          selection: couponItems.map(item => `${item.market}: ${item.selection}`).join(" | "),
          odds: Number(couponTotalOdds.toFixed(2))
        };

    setDataLoading(true);
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      source_id: couponDraft.sourceId,
      bookmaker: couponDraft.bookmaker,
      is_freebet: isFreebet,
      stake: activeStake,
      source_stakes: { [couponDraft.sourceId]: activeStake },
      result: "pending",
      ...payload
    });

    if (error) {
      setDataMessage(error.message);
    } else {
      setCouponItems([]);
      setCouponDraft(current => ({ ...current, stake: "" }));
      setCouponOpen(false);
      setDataMessage(t("Купон сохранён в ставки."));
      await loadWorkspaceData(user.id);
    }

    setDataLoading(false);
  }

  async function handleCouponSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const name = sourceName.trim();
    if (!name) return;

    const blacklistedMatch = sources.find(
      source => source.is_blacklisted && source.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (blacklistedMatch) {
      window.alert(t("Этот источник в чёрном списке и не может быть добавлен снова."));
      return;
    }

    setDataLoading(true);
    const { data, error } = await supabase
      .from("sources")
      .upsert({ user_id: user.id, name }, { onConflict: "user_id,name" })
      .select("id")
      .single();

    if (error) {
      setDataMessage(error.message);
    } else {
      setSourceName("");
      setSourcePopupOpen(false);
      if (data?.id) {
        setCouponDraft(current => ({ ...current, sourceId: data.id }));
      }
      await loadWorkspaceData(user.id);
    }
    setDataLoading(false);
  }
  async function handleBankrollSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const rawAmount = Number(bankrollForm.amount.replace(",", "."));
    if (!rawAmount) {
      setDataMessage(t("Укажи сумму движения банка."));
      return;
    }

    const amount = bankrollForm.kind === "withdrawal" ? -Math.abs(rawAmount) : rawAmount;

    setDataLoading(true);
    const { error } = await supabase.from("bankroll_events").insert({
      user_id: user.id,
      amount,
      kind: bankrollForm.kind,
      note: bankrollForm.note.trim() || null
    });

    if (error) {
      setDataMessage(error.message);
    } else {
      setBankrollForm({
        kind: bankrollForm.kind,
        amount: "",
        note: ""
      });
      setBankEditorOpen(false);
      await loadWorkspaceData(user.id);
    }

    setDataLoading(false);
  }

  async function settleBet(bet: BetRow, result: "win" | "loss" | "return") {
    if (!user) return;

    const stake = parseMoneyValue(bet.stake);
    const odds = Number(bet.odds || 0);
    const profit = profitForStake(result, stake, odds, isFreebetBet(bet));
    const bankrollAmount = betTotalProfitValue({ ...bet, result });
    const settledAt = new Date().toISOString();

    setDataLoading(true);
    const { error } = await supabase
      .from("bets")
      .update({
        result,
        profit,
        settled_at: settledAt
      })
      .eq("id", bet.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      const { error: bankrollError } = await supabase.from("bankroll_events").insert({
        user_id: user.id,
        bet_id: bet.id,
        amount: bankrollAmount,
        kind: result,
        note: `${bet.event_name} · ${bet.market} · ${bet.selection}`
      });

      if (bankrollError) {
        setDataMessage(bankrollError.message);
      } else {
        const localSettlementEvent: BankrollEventRow = {
          id: `local-${bet.id}-${settledAt}`,
          bet_id: bet.id,
          amount: bankrollAmount,
          kind: result,
          note: `${bet.event_name} - ${bet.market} - ${bet.selection}`,
          created_at: settledAt
        };

        setBets(current => current.map(currentBet => (
          currentBet.id === bet.id
            ? {
                ...currentBet,
                profit,
                result,
                settled_at: settledAt
              }
            : currentBet
        )));
        setBankrollEvents(current => [
          ...current.filter(event => !(event.bet_id === bet.id && ["win", "loss", "return"].includes(event.kind))),
          localSettlementEvent
        ]);
        setDataMessage("");
      }

      await loadWorkspaceData(user.id);
    }

    setDataLoading(false);
  }

  function startEditBet(bet: BetRow) {
    const sourceIds = getBetSourceIds(bet);
    const fallbackStake = parseMoneyValue(bet.stake);
    setEditingBetId(bet.id);
    setEditForm({
      event_name: formatEventName(bet.event_name),
      bookmaker: cleanBookmakerName(bet.bookmaker),
      is_freebet: isFreebetBet(bet),
      odds: String(bet.odds ?? ""),
      stake: String(bet.stake ?? ""),
      source_stakes: sourceIds.reduce<Record<string, string>>((map, sourceId) => {
        map[sourceId] = String(getBetSourceStake(bet, sourceId) || fallbackStake || "");
        return map;
      }, {}),
      result: bet.result
    });
  }

  function cancelEditBet() {
    setEditingBetId(null);
    setEditForm(null);
  }

  async function saveEditBet() {
    if (!user || !editingBetId || !editForm) return;
    const bet = resolvedBets.find(row => row.id === editingBetId);
    if (!bet) return;

    const odds = parseFloat(editForm.odds.replace(",", ".")) || 0;
    const sourceIds = getBetSourceIds(bet);
    const fallbackStake = parseMoneyValue(editForm.stake);
    const sourceStakes = sourceIds.length
      ? sourceIds.reduce<Record<string, number>>((map, sourceId) => {
          const stake = parseMoneyValue(editForm.source_stakes[sourceId]);
          map[sourceId] = stake > 0 ? stake : fallbackStake;
          return map;
        }, {})
      : {};
    const primaryStake = sourceIds.length ? (sourceStakes[sourceIds[0]] || 0) : fallbackStake;
    const eventName = editForm.event_name.trim() || bet.event_name;
    const bookmaker = cleanBookmakerName(editForm.bookmaker);
    const result = editForm.result;

    if (odds <= 0 || primaryStake < 0 || Object.values(sourceStakes).some(stake => stake < 0)) {
      setDataMessage(t("Проверь коэффициент и сумму ставки."));
      return;
    }

    setDataLoading(true);

    const nextBetForTotals: BetRow = {
      ...bet,
      odds,
      stake: primaryStake,
      source_stakes: sourceStakes,
      is_freebet: editForm.is_freebet,
      result
    };
    const profit = result === "pending" ? null : profitForStake(result, primaryStake, odds, editForm.is_freebet);
    const bankrollAmount = result === "pending" ? null : betTotalProfitValue(nextBetForTotals);
    const settledAt = result === "pending" ? null : (bet.settled_at || new Date().toISOString());

    const payload: {
      event_name: string;
      bookmaker: string | null;
      is_freebet: boolean;
      odds: number;
      stake: number;
      source_stakes: Record<string, number>;
      result: BetRow["result"];
      profit: number | null;
      settled_at: string | null;
    } = {
      event_name: eventName,
      bookmaker: bookmaker || null,
      is_freebet: editForm.is_freebet,
      odds,
      stake: primaryStake,
      source_stakes: sourceStakes,
      result,
      profit,
      settled_at: settledAt
    };

    const { error } = await supabase
      .from("bets")
      .update(payload)
      .eq("id", bet.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
      setDataLoading(false);
      return;
    }

    // Убираем прежнюю запись расчёта банка по этой ставке (если исход менялся)
    await supabase
      .from("bankroll_events")
      .delete()
      .eq("bet_id", bet.id)
      .in("kind", ["win", "loss", "return"]);

    let localSettlementEvent: BankrollEventRow | null = null;

    if (result !== "pending") {
      const insertedAt = settledAt || new Date().toISOString();
      const { error: bankrollError } = await supabase.from("bankroll_events").insert({
        user_id: user.id,
        bet_id: bet.id,
        amount: bankrollAmount ?? 0,
        kind: result,
        note: `${eventName} · ${bet.market} · ${bet.selection}`
      });

      if (bankrollError) {
        setDataMessage(bankrollError.message);
      } else {
        localSettlementEvent = {
          id: `local-${bet.id}-${insertedAt}`,
          bet_id: bet.id,
          amount: bankrollAmount ?? 0,
          kind: result,
          note: `${eventName} - ${bet.market} - ${bet.selection}`,
          created_at: insertedAt
        };
      }
    }

    setBets(current => current.map(currentBet => (
      currentBet.id === bet.id ? { ...currentBet, ...payload } : currentBet
    )));

    setBankrollEvents(current => {
      const filtered = current.filter(event => !(event.bet_id === bet.id && ["win", "loss", "return"].includes(event.kind)));
      return localSettlementEvent ? [...filtered, localSettlementEvent] : filtered;
    });

    setDataMessage("");
    setEditingBetId(null);
    setEditForm(null);
    await loadWorkspaceData(user.id);

    setDataLoading(false);
  }

  // ── Пересчёт банка ──────────────────────────────────────────
  // Пересобирает bankroll_events для расчётов ставок (win/loss/return)
  // из текущего состояния таблицы bets - источника истины.
  // Убирает устаревшие/задвоенные записи, из-за которых баланс мог
  // разойтись с ROI (см. правку дедупликации выше).
  // Пополнения/выводы (deposit/withdrawal) не затрагиваются.
  async function recalculateBankroll() {
    if (!user) return;
    const confirmed = window.confirm(
      t("Пересчитать баланс из текущих ставок? Устаревшие или задвоенные записи о выигрышах/проигрышах будут заменены на актуальные. Пополнения и выводы не изменятся.")
    );
    if (!confirmed) return;

    setDataLoading(true);

    const { data: allBets, error: betsError } = await supabase
      .from("bets")
      .select("id,source_id,extra_source_ids,source_stakes,event_name,sport,bookmaker,is_freebet,market,selection,odds,stake,result,profit,settled_at,created_at")
      .eq("user_id", user.id)
      .neq("result", "pending")
      .limit(5000);

    if (betsError) {
      setDataMessage(betsError.message);
      setDataLoading(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("bankroll_events")
      .delete()
      .eq("user_id", user.id)
      .in("kind", ["win", "loss", "return"]);

    if (deleteError) {
      setDataMessage(deleteError.message);
      setDataLoading(false);
      return;
    }

    const rows = (allBets || []).map(row => {
      const result = row.result as "win" | "loss" | "return";
      const profit = betTotalProfitValue({ ...(row as BetRow), result });

      return {
        user_id: user.id,
        bet_id: row.id,
        amount: profit,
        kind: result,
        note: `${row.event_name} · ${row.market} · ${row.selection}`,
        created_at: row.settled_at || row.created_at
      };
    });

    if (rows.length) {
      const { error: insertError } = await supabase.from("bankroll_events").insert(rows);
      if (insertError) {
        setDataMessage(insertError.message);
        setDataLoading(false);
        return;
      }
    }

    setDataMessage(t("Баланс пересчитан."));
    await loadWorkspaceData(user.id);
    setDataLoading(false);
  }

  async function addSourceToBet(bet: BetRow, sourceId: string) {
    if (!user) return;
    const currentIds = getBetSourceIds(bet);
    if (currentIds.includes(sourceId)) {
      setSourcePickerForBetId(null);
      return;
    }

    setDataLoading(true);

    // Если у ставки ещё нет ни одного источника - новый становится основным,
    // иначе добавляется как дополнительный (оба получают полный результат ставки).
    const nextSourceIds = !bet.source_id ? [sourceId] : [...currentIds, sourceId];
    const source = sources.find(row => row.id === sourceId);
    const addedStake = parseMoneyValue(source?.fixed_stake) || parseMoneyValue(bet.stake);
    const source_stakes = {
      ...makeSourceStakeMap(currentIds, parseMoneyValue(bet.stake), bet.source_stakes),
      [sourceId]: addedStake
    };
    const payload: { source_id?: string; extra_source_ids?: string[]; source_stakes: Record<string, number> } = !bet.source_id
      ? { source_id: sourceId, source_stakes: makeSourceStakeMap(nextSourceIds, addedStake, source_stakes) }
      : { extra_source_ids: [...(bet.extra_source_ids || []), sourceId], source_stakes };

    const { error } = await supabase
      .from("bets")
      .update(payload)
      .eq("id", bet.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      setBets(current => current.map(currentBet => (
        currentBet.id === bet.id ? { ...currentBet, ...payload } : currentBet
      )));
      setDataMessage("");
    }

    setSourcePickerForBetId(null);
    setDataLoading(false);
  }

  async function removeSourceFromBet(bet: BetRow, sourceId: string) {
    if (!user) return;
    setDataLoading(true);

    let payload: { source_id?: string | null; extra_source_ids?: string[]; source_stakes: Record<string, number> };
    let nextSourceIds: string[];
    if (bet.source_id === sourceId) {
      // Основной источник убирают - продвигаем первый дополнительный на его место
      const extras = bet.extra_source_ids || [];
      nextSourceIds = extras;
      payload = { source_id: extras[0] || null, extra_source_ids: extras.slice(1), source_stakes: {} };
    } else {
      nextSourceIds = getBetSourceIds(bet).filter(id => id !== sourceId);
      payload = { extra_source_ids: (bet.extra_source_ids || []).filter(id => id !== sourceId), source_stakes: {} };
    }
    payload.source_stakes = makeSourceStakeMap(nextSourceIds, parseMoneyValue(bet.stake), bet.source_stakes);

    const { error } = await supabase
      .from("bets")
      .update(payload)
      .eq("id", bet.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      setBets(current => current.map(currentBet => (
        currentBet.id === bet.id ? { ...currentBet, ...payload } : currentBet
      )));
      setDataMessage("");
    }

    setDataLoading(false);
  }

  async function saveTimezone(offsetMinutes: number) {
    if (!user) return;
    setTimezonePickerOpen(false);
    const { data, error } = await supabase.auth.updateUser({
      data: { timezone_offset_minutes: offsetMinutes }
    });
    if (error) {
      setDataMessage(error.message);
    } else if (data.user) {
      setUser(data.user);
    }
  }

  async function saveCurrency(currency: CurrencyCode) {
    if (!user) return;
    const { data, error } = await supabase.auth.updateUser({ data: { currency } });
    if (error) {
      setDataMessage(error.message);
    } else if (data.user) {
      setUser(data.user);
      setDataMessage("");
    }
  }

  async function saveTheme(theme: AppTheme) {
    if (!user) return;
    const { data, error } = await supabase.auth.updateUser({ data: { theme } });
    if (error) {
      setDataMessage(error.message);
    } else if (data.user) {
      setUser(data.user);
      setDataMessage("");
    }
  }

  async function saveAvatar(file: File) {
    if (!user) return;
    // Уменьшаем и обрезаем до квадрата на клиенте, чтобы не хранить в
    // user_metadata оригинал в полном размере (у Supabase Auth есть лимит
    // на объём metadata, да и загружать/показывать мелкий аватар быстрее).
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        img.onload = () => {
          const size = 160;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas недоступен")); return; }
          const scale = Math.max(size / img.width, size / img.height);
          const drawWidth = img.width * scale;
          const drawHeight = img.height * scale;
          ctx.drawImage(img, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

    const { data, error } = await supabase.auth.updateUser({
      data: { avatar_url: dataUrl }
    });
    if (error) {
      setDataMessage(error.message);
    } else if (data.user) {
      setUser(data.user);
    }
  }

  async function saveFlatStake(amount: number) {
    if (!user) return;
    const { data, error } = await supabase.auth.updateUser({
      data: { flat_stake_amount: amount }
    });
    if (error) {
      setDataMessage(error.message);
    } else if (data.user) {
      setUser(data.user);
    }
  }

  async function saveAssistantStake() {
    if (!user) return;

    const amount = Number(assistantStakeInput.replace(",", ".")) || 0;
    if (amount <= 0) {
      setAssistantSettingsMessage("Укажи фиксированную сумму больше 0.");
      return;
    }

    setAssistantStakeSaving(true);
    setAssistantSettingsMessage("");

    const { data, error } = await supabase.auth.updateUser({
      data: { assistant_stake_amount: amount }
    });

    if (error) {
      setAssistantSettingsMessage(error.message);
    } else {
      if (data.user) setUser(data.user);
      setAssistantSettingsMessage("Фиксированная сумма для прогнозов ассистента сохранена.");
    }

    setAssistantStakeSaving(false);
  }

  async function saveLogin() {
    if (!user?.email) return;

    const login = normalizeLogin(loginDraft);
    setLoginMessage("");

    if (!isValidLogin(login)) {
      setLoginMessage("Логин: 3-24 символа, латинские буквы, цифры, _ или -.");
      return;
    }

    setLoginSaving(true);

    const { data: existing, error: existingError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("login", login)
      .neq("id", user.id)
      .maybeSingle();

    if (existingError) {
      setLoginMessage(existingError.message);
      setLoginSaving(false);
      return;
    }

    if (existing) {
      setLoginMessage("Этот логин уже занят. Придумай другой.");
      setLoginSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        display_name: login,
        login
      }, { onConflict: "id" });

    if (profileError) {
      setLoginMessage(profileError.message);
      setLoginSaving(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.updateUser({
      data: { display_name: login }
    });

    if (authError) {
      setLoginMessage(authError.message);
      setLoginSaving(false);
      return;
    }

    setProfileLogin(login);
    setLoginDraft(login);
    if (authData.user) setUser(authData.user);
    await ensureLoginSource(user.id, login);
    await loadWorkspaceData(user.id);
    setLoginMessage("Логин сохранён. Он добавлен первым источником купона.");
    setLoginSaving(false);
  }

  async function changePassword() {
    if (!user?.email) return;

    setPasswordMessage("");

    if (!passwordRecoveryMode && !currentPasswordInput) {
      setPasswordMessage("Заполни текущий пароль.");
      return;
    }

    if (!newPasswordInput || !repeatPasswordInput) {
      setPasswordMessage("Введи новый пароль два раза.");
      return;
    }

    if (newPasswordInput.length < 6) {
      setPasswordMessage("Новый пароль должен быть минимум 6 символов.");
      return;
    }

    if (newPasswordInput !== repeatPasswordInput) {
      setPasswordMessage("Новые пароли не совпадают.");
      return;
    }

    setPasswordSaving(true);

    if (!passwordRecoveryMode) {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPasswordInput
      });

      if (authError) {
        setPasswordMessage("Текущий пароль введён неверно.");
        setPasswordSaving(false);
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPasswordInput });

    if (error) {
      setPasswordMessage(error.message);
    } else {
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setRepeatPasswordInput("");
      setPasswordRecoveryMode(false);
      setPasswordEditorOpen(false);
      setPasswordMessage("Пароль успешно изменён.");
    }

    setPasswordSaving(false);
  }

  if (user) {
    const userName = user.user_metadata?.display_name || user.email?.split("@")[0] || t("Игрок");
    const avatarUrl: string | null = user.user_metadata?.avatar_url || null;
    const timezoneOffsetMinutes = getUserTimezoneOffsetMinutes(user);
    const profileCurrency = getUserCurrency(user);
    const profileTheme = getUserTheme(user);
    const flatStake = getUserFlatStake(user);
    const shownMatches = activeMatches;
    const displayedBalance = BASE_BANKROLL + bankrollStats.balance;
    const pendingRailBets = allPendingBetsOpen ? pendingBets : pendingBets.slice(0, 5);
    const loginRequired = profileResolved && !profileLogin;
    const selectedTimezone = TIMEZONE_OPTIONS.find(tz => tz.offset === timezoneOffsetMinutes) || TIMEZONE_OPTIONS[1];
    const selectedTeamFavoriteKey = selectedTeamCard ? favoriteTeamKeyFromCard(selectedTeamCard) : "";
    const selectedTeamFavorite = selectedTeamFavoriteKey ? favoriteTeams.includes(selectedTeamFavoriteKey) : false;

    return (
      <main className={`workspace-shell theme-${profileTheme}`}>
        <header className="workspace-topbar">
          <div className="workspace-brand">
            <img alt="Stakeversee" className="workspace-logo" src="/logo.png" />
          </div>

          <div className="profile-pill" onClick={() => setSettingsPanelOpen(true)}>
            {avatarUrl ? (
              <img alt="" className="profile-pill-avatar" src={avatarUrl} />
            ) : (
              <span>{userName.slice(0, 1).toUpperCase()}</span>
            )}
            <div>
              <strong>{userName}</strong>
              <small>{TIMEZONE_OPTIONS.find(tz => tz.offset === timezoneOffsetMinutes)?.label ? t(TIMEZONE_OPTIONS.find(tz => tz.offset === timezoneOffsetMinutes)!.label) : t("игрок")}</small>
            </div>
          </div>

          <div className="sync-meter">
            <div>
              <span>{t("Линия")}</span>
              <strong>{matchesLoading ? t("обновляю...") : matchesStatusLabel(matchesStatus, t)}</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${matchesLoading ? 42 : matchCounts.all ? 100 : 0}%` }} />
            </div>
            <b>{matchCounts.all} {t("матчей")}</b>
          </div>

          <div className="top-actions">
            <button className="assistant-button" onClick={() => setAssistantOpen(true)} type="button">🤖 {t("Ассистент")}</button>
            <button className="logout-button" onClick={handleLogout} type="button">{t("Выйти")}</button>
          </div>
        </header>

        {settingsPanelOpen || loginRequired ? (
          <div className="settings-modal-backdrop" onMouseDown={() => { if (!loginRequired) setSettingsPanelOpen(false); }} role="presentation">
            <section
              aria-label={t("Настройки")}
              aria-modal="true"
              className="settings-modal"
              onMouseDown={event => event.stopPropagation()}
              role="dialog"
            >
              <div className="settings-modal-head">
                <strong>{t("Настройки")}</strong>
                {!loginRequired ? (
                  <button aria-label={t("Закрыть")} onClick={() => setSettingsPanelOpen(false)} type="button">×</button>
                ) : null}
              </div>

              <div className="settings-section">
                <div className="settings-section-title">{t("Профиль")}</div>
                <div className="settings-avatar-row">
                  <div className="settings-avatar-wrap">
                    {avatarUrl ? (
                      <img alt="" className="settings-avatar-preview" src={avatarUrl} />
                    ) : (
                      <span className="settings-avatar-preview settings-avatar-preview-empty">{userName.slice(0, 1).toUpperCase()}</span>
                    )}
                    <input
                      accept="image/*"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) saveAvatar(file);
                        event.target.value = "";
                      }}
                      ref={avatarInputRef}
                      style={{ display: "none" }}
                      type="file"
                    />
                    <button
                      aria-label={t("Изменить фото")}
                      className="settings-avatar-edit-btn"
                      onClick={() => avatarInputRef.current?.click()}
                      title={t("Изменить фото")}
                      type="button"
                    >
                      ✏️
                    </button>
                  </div>
                  <div className="settings-profile-meta">
                    {profileLogin ? (
                      <strong className="settings-avatar-name">{profileLogin}</strong>
                    ) : (
                      <div className="settings-inline-login">
                        <input
                          autoFocus={loginRequired}
                          onChange={event => setLoginDraft(event.target.value)}
                          placeholder="Semik"
                          value={loginDraft}
                        />
                        <button
                          className="settings-avatar-upload-btn"
                          disabled={loginSaving}
                          onClick={saveLogin}
                          type="button"
                        >
                          {loginSaving ? "Проверяю..." : "Сохранить"}
                        </button>
                      </div>
                    )}
                    <span className="settings-profile-email">{user.email}</span>
                    {loginMessage && !profileLogin ? <span className="settings-login-message">{loginMessage}</span> : null}
                  </div>
                </div>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">{t("Валюта")}</div>
                <select
                  aria-label={t("Валюта")}
                  className="settings-currency-select"
                  onChange={event => saveCurrency(event.target.value as CurrencyCode)}
                  value={profileCurrency}
                >
                  {CURRENCY_OPTIONS.map(option => (
                    <option key={option.code} value={option.code}>
                      {t(option.label)} ({currencySymbol(option.code)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">Тема</div>
                <button
                  aria-checked={profileTheme === "light"}
                  aria-label="Тема"
                  className={`settings-theme-toggle ${profileTheme}`}
                  onClick={() => saveTheme(profileTheme === "light" ? "dark" : "light")}
                  role="switch"
                  type="button"
                >
                  <span className="settings-theme-option">Темная</span>
                  <span className="settings-theme-option">Светлая</span>
                  <span aria-hidden="true" className="settings-theme-thumb" />
                </button>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">Пароль</div>
                <div className="settings-password-actions">
                  <button
                    className="settings-avatar-upload-btn"
                    onClick={() => setPasswordEditorOpen(open => !open)}
                    type="button"
                  >
                    {passwordEditorOpen || passwordRecoveryMode ? "Скрыть смену пароля" : "Изменить пароль"}
                  </button>
                  <button
                    className="settings-secondary-button"
                    disabled={resetSending}
                    onClick={sendPasswordReset}
                    type="button"
                  >
                    {resetSending ? "Отправляю..." : "Забыли пароль?"}
                  </button>
                </div>
                {passwordRecoveryMode ? (
                  <div className="settings-flat-hint">Режим восстановления: введи новый пароль два раза.</div>
                ) : null}
                {passwordEditorOpen || passwordRecoveryMode ? (
                  <div className="settings-password-grid">
                    {!passwordRecoveryMode ? (
                      <input
                        autoComplete="current-password"
                        onChange={event => setCurrentPasswordInput(event.target.value)}
                        placeholder="Текущий пароль"
                        type="password"
                        value={currentPasswordInput}
                      />
                    ) : null}
                    <input
                      autoComplete="new-password"
                      onChange={event => setNewPasswordInput(event.target.value)}
                      placeholder="Новый пароль"
                      type="password"
                      value={newPasswordInput}
                    />
                    <input
                      autoComplete="new-password"
                      onChange={event => setRepeatPasswordInput(event.target.value)}
                      placeholder="Повтори новый пароль"
                      type="password"
                      value={repeatPasswordInput}
                    />
                    <button
                      className="settings-avatar-upload-btn"
                      disabled={passwordSaving}
                      onClick={changePassword}
                      type="button"
                    >
                      {passwordSaving ? "Сохраняю..." : "Сохранить пароль"}
                    </button>
                  </div>
                ) : null}
                {passwordMessage ? <div className="settings-flat-hint settings-login-message">{passwordMessage}</div> : null}
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">{t("Флэт")}</div>
                <div className="settings-flat-row">
                  <input
                    inputMode="decimal"
                    onChange={event => setFlatStakeInput(event.target.value)}
                    placeholder={`${t("Сумма флэта")} ${currencySymbol(profileCurrency)}`}
                    value={flatStakeInput}
                  />
                  <button
                    className="settings-avatar-upload-btn"
                    onClick={() => {
                      const amount = Number(flatStakeInput.replace(",", ".")) || 0;
                      saveFlatStake(amount);
                    }}
                    type="button"
                  >
                    {t("Сохранить")}
                  </button>
                </div>
                {flatStake > 0 ? (
                  <div className="settings-flat-hint">{t("Текущий флэт:")} {formatMoney(flatStake, profileCurrency)} · ½ {t("флэта:")} {formatMoney(flatStake / 2, profileCurrency)}</div>
                ) : (
                  <div className="settings-flat-hint">{t("Задай фиксированную сумму ставки, чтобы быстро выбирать её в купоне.")}</div>
                )}
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">{t("Фиксированная ставка")}</div>
                <div className="settings-flat-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                  {t("Задай фиксированную ставку для конкретного источника - она подставится в купон при его выборе.")}
                </div>
                {couponSourceOptions.length ? (
                  <div className="settings-source-stake-list">
                    {couponSourceOptions.map(source => (
                      <div className="settings-source-stake-row" key={source.id}>
                        <span title={t(source.name)}>{t(source.name)}</span>
                        <input
                          defaultValue={source.fixed_stake ? String(source.fixed_stake) : ""}
                          inputMode="decimal"
                          onKeyDown={event => {
                            if (event.key !== "Enter") return;
                            const raw = (event.target as HTMLInputElement).value;
                            const amount = Number(raw.replace(",", "."));
                            saveSourceFixedStake(source.id, Number.isFinite(amount) && amount > 0 ? amount : null);
                          }}
                          placeholder={`${t("Сумма")} ${currencySymbol(profileCurrency)}`}
                          ref={element => { if (element) settingsSourceStakeRefs.current[source.id] = element; }}
                        />
                        <button
                          onClick={() => {
                            const raw = settingsSourceStakeRefs.current[source.id]?.value || "";
                            const amount = Number(raw.replace(",", "."));
                            saveSourceFixedStake(source.id, Number.isFinite(amount) && amount > 0 ? amount : null);
                          }}
                          type="button"
                        >
                          {t("Сохранить")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="settings-flat-hint">{t("Источники появятся после добавления.")}</div>
                )}
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">{t("Язык")}</div>
                <button
                  aria-checked={lang === "en"}
                  aria-label={t("Язык интерфейса")}
                  className={`lang-toggle ${lang}`}
                  onClick={() => setLang(lang === "ru" ? "en" : "ru")}
                  role="switch"
                  type="button"
                >
                  <span className="lang-toggle-option">RU</span>
                  <span className="lang-toggle-option">EN</span>
                  <span className="lang-toggle-thumb" aria-hidden="true" />
                </button>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-section-title">{t("Часовой пояс")}</div>
                <button
                  aria-expanded={timezonePickerOpen}
                  className="settings-timezone-current"
                  onClick={() => setTimezonePickerOpen(current => !current)}
                  type="button"
                >
                  <span>{t(selectedTimezone.label)}</span>
                  <strong>{timezonePickerOpen ? "Скрыть" : "Изменить"}</strong>
                </button>
                {timezonePickerOpen ? (
                  <div className="settings-timezone-list" role="listbox">
                    {TIMEZONE_OPTIONS.map(tz => (
                      <button
                        className={tz.offset === timezoneOffsetMinutes ? "active" : ""}
                        key={tz.offset}
                        onClick={() => saveTimezone(tz.offset)}
                        role="option"
                        aria-selected={tz.offset === timezoneOffsetMinutes}
                        type="button"
                      >
                        {t(tz.label)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <section className="workspace-grid">
          <div className="match-board">
            <nav className="sport-tabs" aria-label={t("Виды спорта")}>
              {sportTabs.map(tab => {
                const count = tab.key === "all" ? matchCounts.all : matchCounts.bySport.get(tab.key) || 0;
                return (
                  <button
                    className={activeSport === tab.key ? "active" : ""}
                    key={tab.key}
                    onClick={() => selectSport(tab.key)}
                    type="button"
                  >
                    <span>{tab.icon}</span>
                    <strong>{t(tab.label)}</strong>
                    <em>{count}</em>
                  </button>
                );
              })}
            </nav>

            <div className="match-filters">
              {activeSport === "esports" ? (
                <label>
                  <span>{t("Дисциплина:")}</span>
                  <MatchFilterDropdown
                    onChange={value => { setDisciplineFilter(value); setLeagueFilter("all"); }}
                    options={[
                      {
                        count: Array.from(disciplineCounts.values()).reduce((sum, discipline) => sum + discipline.count, 0),
                        flag: "🎮",
                        label: "Все дисциплины",
                        value: "all"
                      },
                      ...Array.from(disciplineCounts.values())
                        .sort((a, b) => {
                          const orderA = ESPORTS_DISCIPLINES.findIndex(item => item.key === a.key);
                          const orderB = ESPORTS_DISCIPLINES.findIndex(item => item.key === b.key);
                          if (orderA !== orderB) {
                            if (orderA === -1) return 1;
                            if (orderB === -1) return -1;
                            return orderA - orderB;
                          }
                          return a.label.localeCompare(b.label, lang === "en" ? "en" : "ru");
                        })
                        .map(discipline => ({
                          count: discipline.count,
                          flag: discipline.icon,
                          label: discipline.label,
                          value: discipline.key
                        }))
                    ]}
                    placeholderIcon="🎮"
                    placeholderLabel={t("Все дисциплины")}
                    value={disciplineFilter}
                  />
                </label>
              ) : activeSport === "tennis" ? (
                <label>
                  <span>{t("Тур:")}</span>
                  <MatchFilterDropdown
                    onChange={value => {
                      setTennisTourFilter(value === "ATP" || value === "WTA" ? value : "all");
                      setLeagueFilter("all");
                    }}
                    options={[
                      {
                        count: (tennisTourCounts.get("ATP") || 0) + (tennisTourCounts.get("WTA") || 0),
                        flag: "🎾",
                        label: "ATP / WTA",
                        value: "all"
                      },
                      ...([
                        { tour: "ATP" as TennisTour, label: "ATP · Мужчины" },
                        { tour: "WTA" as TennisTour, label: "WTA · Женщины" }
                      ]).map(item => ({
                        count: tennisTourCounts.get(item.tour) || 0,
                        flag: "🎾",
                        label: t(item.label),
                        value: item.tour
                      }))
                    ]}
                    placeholderIcon="🎾"
                    placeholderLabel="ATP / WTA"
                    value={tennisTourFilter}
                  />
                </label>
              ) : (
                <label>
                  <span>{t("Страна:")}</span>
                  <MatchFilterDropdown
                    onChange={value => { setCountryFilter(value); setLeagueFilter("all"); }}
                    options={[
                      {
                        count: Array.from(countryCounts.values()).reduce((sum, count) => sum + count, 0),
                        flag: "🌍",
                        label: "Все страны",
                        value: "all"
                      },
                      ...Array.from(countryCounts.entries())
                        .map(([country, count]) => ({
                          count,
                          flag: <FlagIcon country={country} />,
                          label: getCountryLabel(country, lang),
                          value: country
                        }))
                        .sort((a, b) => a.label.localeCompare(b.label, lang === "en" ? "en" : "ru"))
                    ]}
                    placeholderIcon="🌍"
                    placeholderLabel={t("Все страны")}
                    value={countryFilter}
                  />
                </label>
              )}
              <label>
                <span>{t("Лига:")}</span>
                <MatchFilterDropdown
                  onChange={setLeagueFilter}
                  options={[
                    {
                      count: Array.from(leagueCounts.values()).reduce((sum, info) => sum + info.count, 0),
                      flag: "🏆",
                      label: "Все лиги",
                      value: "all"
                    },
                    ...Array.from(leagueCounts.values())
                      .sort((infoA, infoB) => {
                        const sportCmp = sportTabs.findIndex(tab => tab.key === infoA.sport) - sportTabs.findIndex(tab => tab.key === infoB.sport);
                        if (sportCmp !== 0) return sportCmp;
                        const countryCmp = getCountryLabel(infoA.country, lang).localeCompare(getCountryLabel(infoB.country, lang), lang === "en" ? "en" : "ru");
                        if (countryCmp !== 0) return countryCmp;
                        return infoA.league.localeCompare(infoB.league, lang === "en" ? "en" : "ru");
                      })
                      .map(info => ({
                        count: info.count,
                        flag: <FlagIcon country={info.country} />,
                        label: `${getSportIcon(info.sport)} ${getCountryLabel(info.country, lang)} \u2014 ${t(info.league)}`,
                        value: info.league
                      }))
                  ]}
                  placeholderIcon="🏆"
                  placeholderLabel={t("Все лиги")}
                  value={leagueFilter}
                />
              </label>

              <label>
                <span>{t("Время до матча:")}</span>
                <select
                  onChange={event => {
                    const raw = event.target.value;
                    setMatchTimeWindow(raw === "all" ? "all" : Number(raw) as MatchTimeWindow);
                  }}
                  value={String(matchTimeWindow)}
                >
                  {MATCH_TIME_WINDOWS.map(option => (
                    <option key={String(option.value)} value={String(option.value)}>{t(option.label)}</option>
                  ))}
                </select>
              </label>

              <div className="filter-buttons">
                {[
                  ["all", "Все"],
                  ["fav", "⭐ Избранные"]
                ].map(([key, label]) => (
                  <button
                    className={matchFilter === key ? "active" : ""}
                    key={key}
                    onClick={() => setMatchFilter(key)}
                    type="button"
                  >
                    {t(label)}
                  </button>
                ))}
              </div>

              <input
                className="match-search-input"
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={t("🔍 Поиск...")}
                spellCheck={false}
                value={searchQuery}
              />

            </div>

            <div className="matches-area">
              {shownMatches.length ? (
                shownMatches.map(match => {
                  const availableBookmakers = matchBookmakerOptions(match);
                  const preferredBookmaker = matchBookmakerChoice[match.id] || "best";
                  const selectedBookmaker = availableBookmakers.some(option => option.key === preferredBookmaker) ? preferredBookmaker : "best";
                  const oddsView = matchOddsForBookmaker(match, selectedBookmaker);
                  const hasDrawOdds = Boolean(oddsView.odds[1] && oddsView.odds[1] !== "-");
                  const recommendedSource = oddsView.labels[recommendedOutcomeIndex(match)] || MATCH_BOOKMAKER_LABELS[selectedBookmaker];
                  const counterStrikeMatch = isCounterStrikeMatch(match);
                  const homeEsportsStanding = counterStrikeMatch ? esportsStandingForTeam(match.home, counterStrikeRankings) : null;
                  const awayEsportsStanding = counterStrikeMatch ? esportsStandingForTeam(match.away, counterStrikeRankings) : null;
                  const homeLeagueCard = clientLeagueTeamCard(match.home, match.homeTeamId);
                  const awayLeagueCard = clientLeagueTeamCard(match.away, match.awayTeamId);
                  const homeTeamClickable = Boolean(homeLeagueCard || counterStrikeMatch || match.home);
                  const awayTeamClickable = Boolean(awayLeagueCard || counterStrikeMatch || match.away);
                  const homeFavoriteKey = favoriteTeamKeyFromParts(match.sport, match.league, match.home, match.homeTeamId);
                  const awayFavoriteKey = favoriteTeamKeyFromParts(match.sport, match.league, match.away, match.awayTeamId);
                  const homeFavorite = favoriteTeams.includes(homeFavoriteKey);
                  const awayFavorite = favoriteTeams.includes(awayFavoriteKey);
                  const esportsLeague = match.sport === "esports" ? esportsLeaguePresentation(match.league) : null;
                  const homeTennisPlayers = match.sport === "tennis" ? match.homePlayers || [] : [];
                  const awayTennisPlayers = match.sport === "tennis" ? match.awayPlayers || [] : [];

                  return (
                  <article className={`match-card ${couponItems.some(item => item.matchId === match.id) ? "in-coupon" : ""}`} key={match.id}>
                    <div className={`match-meta ${esportsLeague ? "match-meta-esports" : ""}`}>
                      <time>{formatMatchDateTime(match, lang)}</time>
                      {match.sport !== "tennis" ? <span className="match-meta-country"><FlagIcon country={match.country} /> {getCountryLabel(match.country, lang)}</span> : null}
                      <span className="match-meta-sport" title={getSportLabel(match.sport, lang)}>{getSportIcon(match.sport)} {getSportLabel(match.sport, lang)}</span>
                      {esportsLeague ? <span className="match-meta-discipline">{t(esportsLeague.discipline)}</span> : null}
                      <strong>{t(esportsLeague?.league || match.league)}</strong>
                      {match.sport === "baseball" || match.sport === "tennis" || isCounterStrikeMatch(match) || wnbaMatchPairKey(match) ? (
                        <button className="match-standings-button" onClick={() => openStandings(match)} type="button">{t("Таблица")}</button>
                      ) : null}
                    </div>

                    <div className="match-odds-row">
                      <label className="match-bookmaker-select">
                        <span>{t("БК")}</span>
                        <select
                          onChange={event => setMatchBookmakerChoice(current => ({ ...current, [match.id]: event.target.value as MatchBookmakerKey }))}
                          value={selectedBookmaker}
                        >
                          {availableBookmakers.map(option => (
                            <option key={option.key} value={option.key}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className={`odds-strip ${hasDrawOdds ? "" : "odds-strip-two-way"}`}>
                        <button type="button">
                          <strong>{oddsView.odds[0]}</strong>
                          {oddsView.labels[0] ? <em>{oddsView.labels[0]}</em> : null}
                          <span>{selectedBookmaker === "best" ? t("П1 · лучший") : t("П1")}</span>
                        </button>
                        {hasDrawOdds ? (
                          <button type="button">
                            <strong>{oddsView.odds[1]}</strong>
                            {oddsView.labels[1] ? <em>{oddsView.labels[1]}</em> : null}
                            <span>{t("Х")}</span>
                          </button>
                        ) : null}
                        <button type="button">
                          <strong>{oddsView.odds[2]}</strong>
                          {oddsView.labels[2] ? <em>{oddsView.labels[2]}</em> : null}
                          <span>{selectedBookmaker === "best" ? t("П2 · лучший") : t("П2")}</span>
                        </button>
                      </div>
                    </div>

                    <div className="match-teams">
                      <div>
                        {homeTennisPlayers.length ? (
                          <div className="tennis-participants">
                            {homeTennisPlayers.map(player => (
                              <button className="match-team-button" key={player.id} onClick={() => openTennisPlayer(player)} type="button">
                                <strong>{player.name}</strong>
                                {player.rank ? <em className="match-team-ranking">{player.tour} #{player.rank}</em> : null}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="match-team-title">
                            {homeTeamClickable ? (
                              <button className="match-team-button" onClick={() => openTeamCard(match, "home")} title={match.homeTeamId ? `${t("ID команды")}: ${match.homeTeamId}` : undefined} type="button">
                                <strong>{match.home}</strong>
                                {homeEsportsStanding ? <em className="match-team-ranking">HLTV #{homeEsportsStanding.rank}</em> : null}
                              </button>
                            ) : (
                              <strong title={match.homeTeamId ? `${t("ID команды")}: ${match.homeTeamId}` : undefined}>{match.home}</strong>
                            )}
                            <button
                              aria-label={homeFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                              className={`favorite-team-button ${homeFavorite ? "active" : ""}`}
                              onClick={() => toggleFavoriteTeam(homeFavoriteKey)}
                              title={homeFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                              type="button"
                            >
                              ★
                            </button>
                          </div>
                        )}
                        <span>{homeTennisPlayers.length
                          ? homeTennisPlayers.filter(player => player.rank).map(player => `${player.tour} #${player.rank}`).join(" · ")
                          : homeEsportsStanding ? `Очки HLTV: ${homeEsportsStanding.points ?? "-"} · ${formatStandingForm(homeEsportsStanding.form)}`
                            : formatStandingForm(homeLeagueCard?.form)}</span>
                      </div>
                      <b>-</b>
                      <div>
                        {awayTennisPlayers.length ? (
                          <div className="tennis-participants">
                            {awayTennisPlayers.map(player => (
                              <button className="match-team-button" key={player.id} onClick={() => openTennisPlayer(player)} type="button">
                                <strong>{player.name}</strong>
                                {player.rank ? <em className="match-team-ranking">{player.tour} #{player.rank}</em> : null}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="match-team-title">
                            {awayTeamClickable ? (
                              <button className="match-team-button" onClick={() => openTeamCard(match, "away")} title={match.awayTeamId ? `${t("ID команды")}: ${match.awayTeamId}` : undefined} type="button">
                                <strong>{match.away}</strong>
                                {awayEsportsStanding ? <em className="match-team-ranking">HLTV #{awayEsportsStanding.rank}</em> : null}
                              </button>
                            ) : (
                              <strong title={match.awayTeamId ? `${t("ID команды")}: ${match.awayTeamId}` : undefined}>{match.away}</strong>
                            )}
                            <button
                              aria-label={awayFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                              className={`favorite-team-button ${awayFavorite ? "active" : ""}`}
                              onClick={() => toggleFavoriteTeam(awayFavoriteKey)}
                              title={awayFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                              type="button"
                            >
                              ★
                            </button>
                          </div>
                        )}
                        <span>{awayTennisPlayers.length
                          ? awayTennisPlayers.filter(player => player.rank).map(player => `${player.tour} #${player.rank}`).join(" · ")
                          : awayEsportsStanding ? `Очки HLTV: ${awayEsportsStanding.points ?? "-"} · ${formatStandingForm(awayEsportsStanding.form)}`
                            : formatStandingForm(awayLeagueCard?.form)}</span>
                      </div>
                    </div>

                    <div className={`recommendation-card tier-${confidenceTier(match.confidence)}`}>
                      <div>
                        <span>{t("Рекомендация")}</span>
                        <strong>{recommendationSideLabel(match, t)}</strong>
                        <small>{recommendedOutcomeDetails(match, t, oddsView.odds, recommendedSource)}</small>
                      </div>
                      <div>
                        <strong>{match.confidence}%</strong>
                        <span>{confidenceTierLabel(confidenceTier(match.confidence), t)}</span>
                      </div>
                    </div>

                    <div className="match-footer">
                      <div className="probability-bar">
                        <span style={{ width: `${match.confidence}%` }} />
                      </div>
                      <button onClick={() => toggleCouponMatch(match, selectedBookmaker)} type="button">{couponItems.some(item => item.matchId === match.id) ? t("✓ В купоне") : t("+ Добавить в купон")}</button>
                    </div>
                  </article>
                  );
                })
              ) : (
                <div className="empty-board">
                  {matchesLoading ? (
                    <div className="matches-loading-indicator" role="status" aria-label={t("Идёт загрузка матчей")}>
                      <img src="/loading-matches.gif" alt="" />
                    </div>
                  ) : searchQuery.trim() ? (
                    <>
                      <strong>{t("По этому запросу матчи не найдены")}</strong>
                      <span>{t("Возможно, поиск ограничивает выдачу.")}</span>
                      <button onClick={() => setSearchQuery("")} type="button">{t("Очистить поиск")}</button>
                    </>
                  ) : (
                    <strong>{t("Матчи не найдены")}</strong>
                  )}
                </div>
              )}
            </div>

            <section className="workspace-bottom">
              <article className="quick-card">
                <div className="compact-head">
                  <div>
                    <span>{t("Быстрая ставка")}</span>
                    <strong>{t("Добавить в статистику")}</strong>
                  </div>
                </div>
                <form className="compact-bet-form" onSubmit={handleBetSubmit}>
                  <SourceDropdownField
                    currency={profileCurrency}
                    onAddSource={() => setSourcePopupOpen(true)}
                    onChange={sourceId => setBetForm(current => ({ ...current, sourceId }))}
                    placeholder={t("Источник")}
                    roiById={sourceRoiById}
                    sources={couponSourceOptions}
                    value={betForm.sourceId}
                  />
                  <input
                    onChange={event => setBetForm(current => ({ ...current, eventName: event.target.value }))}
                    placeholder={t("Матч")}
                    value={betForm.eventName}
                  />
                  <input
                    onChange={event => setBetForm(current => ({ ...current, selection: event.target.value }))}
                    placeholder={t("Исход")}
                    value={betForm.selection}
                  />
                  <input
                    inputMode="decimal"
                    onChange={event => setBetForm(current => ({ ...current, odds: event.target.value }))}
                    placeholder={t("Кэф")}
                    value={betForm.odds}
                  />
                  <input
                    inputMode="decimal"
                    onChange={event => setBetForm(current => ({ ...current, stake: event.target.value }))}
                    placeholder={`${t("Сумма")} ${currencySymbol(profileCurrency)}`}
                    value={betForm.stake}
                  />
                  <button disabled={dataLoading} type="submit">{t("Добавить")}</button>
                </form>
              </article>

              <article className="quick-card">
                <div className="compact-head">
                  <div>
                    <span>{t("Источники")}</span>
                    <strong>{t("Чёрный список и ROI")}</strong>
                  </div>
                </div>
                <form className="source-form compact-source-form" onSubmit={handleSourceSubmit}>
                  <input
                    onChange={event => setSourceName(event.target.value)}
                    placeholder={t("Название источника")}
                    value={sourceName}
                  />
                  <button disabled={dataLoading} type="submit">{t("Добавить")}</button>
                </form>
                <div className="compact-source-list">
                  {sourceStats.slice(0, 5).map(source => (
                    <button
                      className={source.is_blacklisted ? "blacklisted" : ""}
                      key={source.id}
                      onClick={() => {
                        const actualSource = sources.find(row => row.id === source.id);
                        if (actualSource) toggleSourceBlacklist(actualSource);
                      }}
                      type="button"
                    >
                      <span>{t(source.name)}</span>
                      <strong>{source.roi.toFixed(1)}%</strong>
                    </button>
                  ))}
                  {!sourceStats.length ? <span className="empty">{t("Источники появятся после добавления.")}</span> : null}
                </div>
              </article>
            </section>

            {dataMessage ? <div className="workspace-message">{dataMessage}</div> : null}
          </div>

          <aside className="right-rail">
            <section className="rail-panel calendar-panel">
              <div className="rail-title">{t("Календарь прогнозов")}</div>
              <div className="calendar-head">
                <button type="button">‹</button>
                <strong>{new Date().toLocaleDateString(localeFor(lang), { month: "long", year: "numeric" })}</strong>
                <button type="button">›</button>
              </div>
              <div className="weekdays">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <span key={day}>{t(day)}</span>)}
              </div>
              <div className="calendar-grid">
                {calendarDays.map(day => {
                  const dayProfit = Math.round(calendarProfitForDate(day.date, settledBets));
                  const hasBets = resolvedBets.some(bet => isSameLocalDate(bet.created_at, day.date));
                  const profitClass = dayProfit > 0 ? "positive" : dayProfit < 0 ? "negative" : "";

                  return (
                    <button
                      className={[
                        day.muted ? "muted" : "",
                        day.current ? "current" : "",
                        hasBets ? "has-bets" : "",
                        profitClass ? `has-profit ${profitClass}` : ""
                      ].filter(Boolean).join(" ")}
                      key={day.date.toISOString()}
                      onClick={() => setCalendarDateOpen(day.date)}
                      type="button"
                    >
                      {day.day}
                      {dayProfit !== 0 ? <small>{dayProfit > 0 ? "+" : ""}{formatMoney(dayProfit, profileCurrency)}</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {couponOpen || couponItems.length ? (
              <section className="quick-coupon-card open">
                <button className="coupon-head" onClick={() => setCouponOpen(current => !current)} type="button">
                  <span>{t("🎫 Купон")}</span>
                  <strong>{couponItems.length} / {MAX_COUPON_ITEMS}</strong>
                </button>

                <div className="coupon-body">
                  {couponItems.length ? couponItems.map((item, index) => (
                    <div className="coupon-item" key={item.id}>
                      <div className="coupon-item-head">
                        <span>{index + 1}.</span>
                        <strong>{item.eventName}</strong>
                        <button onClick={() => setCouponItems(current => current.filter(row => row.id !== item.id))} type="button">×</button>
                      </div>
                      <div className="coupon-item-grid">
                        <select
                          onChange={event => updateCouponItem(item.id, { market: event.target.value })}
                          value={item.market}
                        >
                          <option value="Победа">{t("Победа")}</option>
                          <option value="Фора">{t("Фора")}</option>
                          <option value="Тотал">{t("Тотал")}</option>
                          <option value="Обе забьют">{t("Обе забьют")}</option>
                          <option value="Точный счёт">{t("Точный счёт")}</option>
                          <option value="Инд. тотал">{t("Инд. тотал")}</option>
                        </select>
                        <input
                          onChange={event => updateCouponItem(item.id, { selection: event.target.value })}
                          placeholder={t("Исход")}
                          value={item.selection}
                        />
                        <input
                          inputMode="decimal"
                          onChange={event => updateCouponItem(item.id, { odds: event.target.value })}
                          placeholder={t("Кэф")}
                          value={item.odds}
                        />
                      </div>
                    </div>
                  )) : <div className="coupon-empty">{t("Нажми на карточку матча, чтобы добавить его в купон.")}</div>}

                  <div className="coupon-controls">
                    <SourceDropdownField
                      currency={profileCurrency}
                      onAddSource={() => setSourcePopupOpen(true)}
                      onChange={sourceId => {
                        const selectedSource = sources.find(source => source.id === sourceId);
                        setCouponDraft(current => ({
                          ...current,
                          sourceId,
                          stake: selectedSource?.fixed_stake ? String(selectedSource.fixed_stake) : ""
                        }));
                      }}
                      roiById={sourceRoiById}
                      sources={couponSourceOptions}
                      value={couponDraft.sourceId}
                    />
                    <BookmakerDropdownField
                      onChange={bookmaker => setCouponDraft(current => ({ ...current, bookmaker }))}
                      options={bookmakerOptions}
                      value={couponDraft.bookmaker}
                    />
                    <div className="coupon-stake-combined">
                      <input
                        inputMode="decimal"
                        onChange={event => setCouponDraft(current => ({ ...current, stake: event.target.value }))}
                        placeholder={`${t("Сумма")} ${currencySymbol(profileCurrency)}`}
                        value={couponDraft.stake}
                      />
                      <select
                        aria-label={t("Тип ставки")}
                        onChange={event => setCouponDraft(current => ({
                          ...current,
                          stakeType: event.target.value as StakeKind
                        }))}
                        value={couponDraft.stakeType}
                      >
                        <option value="cash">{currencySymbol(profileCurrency)}</option>
                        <option value="freebet">{t("Фрибет")}</option>
                      </select>
                    </div>
                  </div>

                  <div className="coupon-stake-quickpick">
                    <button
                      disabled={flatStake <= 0}
                      onClick={() => setCouponDraft(current => ({ ...current, stake: String(flatStake) }))}
                      title={flatStake > 0 ? formatMoney(flatStake, profileCurrency) : t("Задай флэт в настройках профиля")}
                      type="button"
                    >
                      {t("Флэт")}
                    </button>
                    <button
                      disabled={flatStake <= 0}
                      onClick={() => setCouponDraft(current => ({ ...current, stake: String(Math.round((flatStake / 2) * 100) / 100) }))}
                      title={flatStake > 0 ? formatMoney(flatStake / 2, profileCurrency) : t("Задай флэт в настройках профиля")}
                      type="button"
                    >
                      ½ {t("Флэта")}
                    </button>
                    <div className="coupon-stake-percent">
                      <input
                        inputMode="decimal"
                        onChange={event => setCouponStakePercent(event.target.value)}
                        placeholder="%"
                        value={couponStakePercent}
                      />
                      <button
                        onClick={() => {
                          const percent = Number(couponStakePercent.replace(",", ".")) || 0;
                          if (percent <= 0) return;
                          const amount = Math.round(displayedBalance * (percent / 100) * 100) / 100;
                          setCouponDraft(current => ({ ...current, stake: String(amount) }));
                        }}
                        title={t("Процент от текущего баланса")}
                        type="button"
                      >
                        % {t("от банка")}
                      </button>
                    </div>
                  </div>

                  <div className="coupon-summary">
                    <div>
                      <span>{couponItems.length === 1 ? t("Одиночная ставка") : `${t("Экспресс")} · ${couponItems.length} ${t("события")}`}</span>
                      <strong>{couponTotalOdds > 1 ? `× ${couponTotalOdds.toFixed(2)}` : "—"}</strong>
                    </div>
                    <div>
                      <span>{t("Возможный выигрыш")}</span>
                      <strong>{couponPotentialWin > 0 ? formatMoney(couponPotentialWin, profileCurrency) : "—"}</strong>
                    </div>
                  </div>

                  <div className="coupon-actions">
                    <button onClick={() => setCouponItems([])} type="button">{t("Очистить")}</button>
                    <button disabled={dataLoading} onClick={saveCoupon} type="button">{t("Сохранить прогноз")}</button>
                  </div>

                  {sourcePopupOpen ? (
                    <div className="coupon-source-popover" role="dialog" aria-label={t("Добавить источник")}>
                      <form className="coupon-source-form" onSubmit={handleCouponSourceSubmit}>
                        <div className="bank-modal-head">
                          <strong>{t("Добавить источник")}</strong>
                          <button
                            aria-label={t("Закрыть")}
                            onClick={() => setSourcePopupOpen(false)}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          autoFocus
                          onChange={event => setSourceName(event.target.value)}
                          placeholder={t("Название источника")}
                          value={sourceName}
                        />
                        <div className="bank-modal-actions">
                          <button onClick={() => setSourcePopupOpen(false)} type="button">{t("Отмена")}</button>
                          <button disabled={dataLoading} type="submit">{t("Добавить")}</button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="rail-panel bank-panel">
              <div className="bank-head">
                <strong>{t("💰 Банк")}</strong>
                <button disabled={dataLoading} onClick={recalculateBankroll} type="button" title={t("Пересчитать баланс из ставок")}>{t("↺ Пересчитать")}</button>
              </div>
              <div className="bank-stats">
                <div><span>{t("Ставок")}</span><strong>{betStats.total}</strong></div>
                <div><span>{t("Выиграно")}</span><strong>{bets.filter(bet => bet.result === "win").length}</strong></div>
                <div><span>{t("Проиграно")}</span><strong>{bets.filter(bet => bet.result === "loss").length}</strong></div>
              </div>
              <div className="bank-balance">
                <div>
                  <span>{t("Баланс")}</span>
                  <strong>{formatMoney(displayedBalance, profileCurrency)}</strong>
                </div>
                <div className="bank-actions">
                  <button
                    aria-label={t("Пополнить банк")}
                    className="bank-action bank-plus"
                    onClick={() => {
                      setBankrollForm(current => ({ ...current, amount: "", kind: "deposit", note: "Пополнение букмекера" }));
                      setBankEditorOpen(true);
                    }}
                    type="button"
                  >
                    +
                  </button>
                  <button
                    aria-label={t("Вывести из банка")}
                    className="bank-action bank-minus"
                    onClick={() => {
                      setBankrollForm(current => ({ ...current, amount: "", kind: "withdrawal", note: "Вывод от букмекера" }));
                      setBankEditorOpen(true);
                    }}
                    type="button"
                  >
                    -
                  </button>
                </div>
                <em>ROI {betStats.roi >= 0 ? "+" : ""}{betStats.roi.toFixed(1)}%</em>
              </div>
              {pendingRailBets.length ? (
                <div className={`bank-bet-list ${allPendingBetsOpen ? "expanded" : ""}`}>
                  {pendingRailBets.map(bet => {
                    const sourceNames = getBetSourceIds(bet).map(id => sourceDisplayName(sourceById.get(id)?.name));
                    const sourceLabel = sourceNames.length ? sourceNames.map(name => t(name)).join(" + ") : t("Без источника");

                    return (
                      <div
                        className="bank-bet-row"
                        key={bet.id}
                        onClick={() => {
                          setCalendarDateOpen(new Date(bet.created_at));
                          setHighlightBetId(bet.id);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <strong title={formatEventName(bet.event_name)}>{formatEventName(bet.event_name)}</strong>
                        <div className="bank-bet-badges">
                          {getBookmakerLogo(bet.bookmaker) ? (
                            <span className="bank-bet-bookmaker-logo" title={bet.bookmaker || ""}>
                              <img alt={bet.bookmaker || ""} src={getBookmakerLogo(bet.bookmaker)!} />
                            </span>
                          ) : (
                            <span>{bet.bookmaker ? translateBookmakerLabel(bet.bookmaker, lang) : "\u2014"}</span>
                          )}
                          <span className="bank-bet-odds">×{Number(bet.odds || 0).toFixed(2)}</span>
                          <em>{sourceLabel}</em>
                          <div className="calendar-bet-source-add" onClick={event => event.stopPropagation()}>
                            <button
                              aria-label={t("Добавить источник")}
                              className="calendar-bet-add-source-btn"
                              onClick={() => setSourcePickerForBetId(current => (current === bet.id ? null : bet.id))}
                              title={t("Добавить ещё один источник")}
                              type="button"
                            >
                              +
                            </button>
                            {sourcePickerForBetId === bet.id ? (
                              <div className="calendar-bet-source-picker" role="listbox">
                                {sources.filter(source => !source.is_blacklisted && !getBetSourceIds(bet).includes(source.id)).length ? (
                                  sources
                                    .filter(source => !source.is_blacklisted && !getBetSourceIds(bet).includes(source.id))
                                    .map(source => (
                                      <button
                                        key={source.id}
                                        onClick={() => addSourceToBet(bet, source.id)}
                                        role="option"
                                        type="button"
                                      >
                                        {source.name}
                                      </button>
                                    ))
                                ) : <span className="empty">{t("Больше источников нет")}</span>}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {pendingBets.length > 5 ? (
                <button
                  aria-label={allPendingBetsOpen ? "Свернуть список" : "Показать все прогнозы"}
                  className="bank-bet-expand-btn"
                  onClick={() => setAllPendingBetsOpen(current => !current)}
                  title={allPendingBetsOpen ? "Свернуть список" : "Показать все прогнозы"}
                  type="button"
                >
                  {allPendingBetsOpen ? "▴" : "▾"}
                </button>
              ) : null}
              {bankEditorOpen ? (
                <div className="bank-modal-backdrop" role="presentation">
                  <form className="bank-modal" onSubmit={handleBankrollSubmit}>
                    <div className="bank-modal-head">
                      <strong>{t(bankrollForm.kind === "withdrawal" ? "Вывод от букмекера" : "Пополнение букмекера")}</strong>
                      <button
                        aria-label={t("Закрыть")}
                        onClick={() => setBankEditorOpen(false)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      autoFocus
                      inputMode="decimal"
                      onChange={event => setBankrollForm(current => ({ ...current, amount: event.target.value }))}
                      placeholder={`${t("Сумма")} ${currencySymbol(profileCurrency)}`}
                      value={bankrollForm.amount}
                    />
                    <div className="bank-modal-actions">
                      <button onClick={() => setBankEditorOpen(false)} type="button">{t("Отмена")}</button>
                      <button disabled={dataLoading} type="submit">{t("Сохранить")}</button>
                    </div>
                  </form>
                </div>
              ) : null}
            </section>

            <section className="rail-panel stats-entry-panel">
              <button
                className="bank-stat-button"
                onClick={() => setStatsOpen(true)}
                type="button"
              >
                {t("📊 Статистика")}
              </button>
            </section>

            {calendarDateOpen ? (
              <div className="calendar-bets-backdrop" role="presentation">
                <section className="calendar-bets-modal" role="dialog" aria-modal="true" aria-label={t("Ставки за день")}>
                  <div className="calendar-bets-head">
                    <div>
                      <span>{t("Ставки за день")}</span>
                      <strong>{formatCalendarDateLabel(calendarDateOpen, lang)}</strong>
                    </div>
                    <button
                      aria-label={t("Закрыть")}
                      onClick={() => {
                        setCalendarDateOpen(null);
                        setHighlightBetId(null);
                      }}
                      type="button"
                    >
                      ×
                    </button>
                  </div>

                  {calendarBets.length ? (
                    <div className="calendar-bets-list">
                      {calendarBets.map(bet => (
                        <BetCard
                          bet={bet}
                          currency={profileCurrency}
                          dataLoading={dataLoading}
                          editForm={editForm}
                          editingBetId={editingBetId}
                          highlighted={bet.id === highlightBetId}
                          key={bet.id}
                          onAddSource={sourceId => addSourceToBet(bet, sourceId)}
                          onCancelEdit={cancelEditBet}
                          onRemoveSource={sourceId => removeSourceFromBet(bet, sourceId)}
                          onSaveEdit={saveEditBet}
                          onSettle={settleBet}
                          onStartEdit={startEditBet}
                          onToggleSourcePicker={() => setSourcePickerForBetId(current => (current === bet.id ? null : bet.id))}
                          setEditForm={setEditForm}
                          sourceById={sourceById}
                          sourceOptions={couponSourceOptions}
                          sourcePickerOpen={sourcePickerForBetId === bet.id}
                          timezoneOffsetMinutes={timezoneOffsetMinutes}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="calendar-bets-empty">{t("В этот день ставок нет.")}</div>
                  )}
                </section>
              </div>
            ) : null}
          </aside>

          {statsOpen ? (
            <div className="stats-modal-backdrop" onMouseDown={() => setStatsOpen(false)} role="presentation">
              <section
                aria-label={t("Статистика источников")}
                aria-modal="true"
                className="rail-panel stats-panel"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
              >
                <div className="rail-title">{t("Статистика источников")}</div>
                <button className="stats-modal-close" aria-label={t("Закрыть статистику")} onClick={() => setStatsOpen(false)} type="button">×</button>

                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>{t("Рассчитанные ставки")}</strong>
                    <span>{settledBets.length}</span>
                  </div>
                  {sortedSourceStats.length ? (
                    <div className="stats-table-wrap">
                      <table className="stats-table">
                        <thead>
                          <tr>
                            <SortableTh field="name" label={t("Источник")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="roi" label={t("ROI")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="bets" label={t("Ставок")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="wins" label={t("В/П")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="winrate" label={t("% побед")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="avgOdds" label={t("Ср. кэф")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="stake" label={t("Сумма")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <SortableTh field="avgStake" label={t("Средняя")} onSort={f => toggleColumnSort(setSourceSort, f)} sort={sourceSort} />
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSourceStats.map(source => (
                            <tr className={source.is_blacklisted ? "blacklisted" : ""} key={source.id}>
                              <td className="stats-table-name">
                                <div className="stats-source-name-cell">
                                  <span>{t(source.name)}</span>
                                  <div className="stats-rename-wrap">
                                    <button
                                      aria-label={t("Переименовать источник")}
                                      className="stats-rename-btn"
                                      onClick={event => toggleRenameSourcePopover(source.id, event.currentTarget)}
                                      title={t("Переименовать источник")}
                                      type="button"
                                    >
                                      ✏️
                                    </button>
                                    {renamingSourceId === source.id && statsPopoverPos ? (
                                      <div
                                        className="stats-fixed-stake-popover stats-popover-floating stats-rename-popover"
                                        onClick={event => event.stopPropagation()}
                                        style={{ left: statsPopoverPos.left, top: statsPopoverPos.top }}
                                      >
                                        <input
                                          autoFocus
                                          onChange={event => setRenameSourceInput(event.target.value)}
                                          onKeyDown={event => {
                                            if (event.key === "Enter") saveSourceRename(source.id, renameSourceInput);
                                          }}
                                          placeholder={t("Название источника")}
                                          value={renameSourceInput}
                                        />
                                        <button
                                          onClick={() => saveSourceRename(source.id, renameSourceInput)}
                                          type="button"
                                        >
                                          {t("Сохранить")}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="stats-fixed-stake-wrap">
                                    <button
                                      aria-label={t("Фиксированная ставка")}
                                      className={`stats-fixed-stake-btn ${sources.find(row => row.id === source.id)?.fixed_stake ? "set" : ""}`}
                                      onClick={event => toggleFixedStakePopover(source.id, event.currentTarget)}
                                      title={
                                        sources.find(row => row.id === source.id)?.fixed_stake
                                          ? `${t("Фикс. ставка:")} ${formatMoney(Number(sources.find(row => row.id === source.id)?.fixed_stake), profileCurrency)}`
                                          : t("Задать фиксированную ставку для этого источника")
                                      }
                                      type="button"
                                    >
                                      +
                                    </button>
                                    {fixedStakePopoverFor === source.id && statsPopoverPos ? (
                                      <div
                                        className="stats-fixed-stake-popover stats-popover-floating"
                                        onClick={event => event.stopPropagation()}
                                        style={{ left: statsPopoverPos.left, top: statsPopoverPos.top }}
                                      >
                                        <input
                                          autoFocus
                                          inputMode="decimal"
                                          onChange={event => setSourceFixedStakeInput(event.target.value)}
                                          placeholder={`${t("Сумма")} ${currencySymbol(profileCurrency)}`}
                                          value={sourceFixedStakeInput}
                                        />
                                        <button
                                          onClick={() => {
                                            const amount = Number(sourceFixedStakeInput.replace(",", "."));
                                            saveSourceFixedStake(source.id, Number.isFinite(amount) && amount > 0 ? amount : null);
                                          }}
                                          type="button"
                                        >
                                          {t("Сохранить")}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <button
                                    aria-label={t("Добавить в чёрный список")}
                                    className="stats-blacklist-btn"
                                    onClick={() => {
                                      const actualSource = sources.find(row => row.id === source.id);
                                      if (actualSource) toggleSourceBlacklist(actualSource);
                                    }}
                                    title={t("Добавить в чёрный список")}
                                    type="button"
                                  >
                                    🚫
                                  </button>
                                </div>
                              </td>
                              <td>
                                <span className={source.roi >= 0 ? "roi-positive" : "roi-negative"}>{source.roi >= 0 ? "+" : ""}{source.roi.toFixed(1)}%</span>
                                <span className={`stats-roi-amount ${source.profit >= 0 ? "roi-positive-text" : "roi-negative-text"}`}>{source.profit >= 0 ? "+" : ""}{formatMoney(source.profit, profileCurrency)}</span>
                              </td>
                              <td>{source.bets}</td>
                              <td>{source.wins}/{source.losses}</td>
                              <td>{source.winrate.toFixed(0)}%</td>
                              <td>{source.avgOdds.toFixed(2)}</td>
                              <td>{formatMoney(source.stake, profileCurrency)}</td>
                              <td>{formatMoney(source.avgStake, profileCurrency)}</td>
                              <td>
                                <button
                                  className="source-stat-view-button"
                                  onClick={() => setSourceBetsOpen(source.id)}
                                  type="button"
                                >
                                  {t("Все прогнозы")}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <span className="empty">{t("Рассчитанные ставки появятся здесь после выигрыша, проигрыша или возврата.")}</span>}
                </div>

                {blacklistedSourceStats.length ? (
                  <div className="stats-block stats-block-blacklist">
                    <div className="stats-block-head">
                      <strong>{t("🚫 Чёрный список")}</strong>
                      <span>{blacklistedSourceStats.length}</span>
                    </div>
                    <div className="stats-blacklist-list">
                      {blacklistedSourceStats.map(source => (
                        <div className="stats-blacklist-row" key={source.id}>
                          <span className="stats-blacklist-name">{t(source.name)}</span>
                          <span className={source.roi >= 0 ? "roi-positive" : "roi-negative"}>
                            {source.roi >= 0 ? "+" : ""}{source.roi.toFixed(1)}%
                          </span>
                          <span className="stats-blacklist-bets">{source.bets} {t("ставок")}</span>
                          <button
                            className="stats-blacklist-restore-btn"
                            onClick={() => {
                              const actualSource = sources.find(row => row.id === source.id);
                              if (actualSource) toggleSourceBlacklist(actualSource);
                            }}
                            title={t("Убрать из чёрного списка")}
                            type="button"
                          >
                            {t("↺ Восстановить")}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>{t("Статистика по букмекерам")}</strong>
                    <span>{bookmakerStats.length}</span>
                  </div>
                  {sortedBookmakerStats.length ? (
                    <div className="stats-table-wrap">
                      <table className="stats-table">
                        <thead>
                          <tr>
                            <SortableTh field="name" label={t("Букмекер")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="roi" label={t("ROI")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="bets" label={t("Ставок")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="wins" label={t("В/П")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="winrate" label={t("% побед")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="avgOdds" label={t("Ср. кэф")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                            <SortableTh field="stake" label={t("Сумма")} onSort={f => toggleColumnSort(setBookmakerSort, f)} sort={bookmakerSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedBookmakerStats.map(bookmaker => (
                            <tr key={bookmaker.id}>
                              <td className="stats-table-name">{translateBookmakerLabel(bookmaker.name, lang)}</td>
                              <td>
                                <span className={bookmaker.roi >= 0 ? "roi-positive" : "roi-negative"}>{bookmaker.roi >= 0 ? "+" : ""}{bookmaker.roi.toFixed(1)}%</span>
                                <span className={`stats-roi-amount ${bookmaker.profit >= 0 ? "roi-positive-text" : "roi-negative-text"}`}>{bookmaker.profit >= 0 ? "+" : ""}{formatMoney(bookmaker.profit, profileCurrency)}</span>
                              </td>
                              <td>{bookmaker.bets}</td>
                              <td>{bookmaker.wins}/{bookmaker.losses}</td>
                              <td>{bookmaker.winrate.toFixed(0)}%</td>
                              <td>{bookmaker.avgOdds.toFixed(2)}</td>
                              <td>{formatMoney(bookmaker.stake, profileCurrency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <span className="empty">{t("Рассчитанные ставки появятся здесь после выигрыша, проигрыша или возврата.")}</span>}
                </div>

                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>{t("Пополнения и выводы")}</strong>
                    <span>{bankrollAdjustments.length}</span>
                  </div>
                  <div className="bankroll-summary-grid">
                    <div>
                      <span>{t("Пополнено")}</span>
                      <strong className="roi-positive-text">{formatMoney(bankrollStats.deposits, profileCurrency)}</strong>
                    </div>
                    <div>
                      <span>{t("Выведено")}</span>
                      <strong className="roi-negative-text">{formatMoney(bankrollStats.withdrawals, profileCurrency)}</strong>
                    </div>
                    <div>
                      <span>{t("Итого")}</span>
                      <strong className={bankrollStats.deposits - bankrollStats.withdrawals >= 0 ? "roi-positive-text" : "roi-negative-text"}>
                        {formatMoney(bankrollStats.deposits - bankrollStats.withdrawals, profileCurrency)}
                      </strong>
                    </div>
                  </div>
                  <div className="bankroll-adjustments-list">
                    {bankrollAdjustments.length ? bankrollAdjustments.map(event => (
                      <div className="bankroll-adjustment-row" key={event.id}>
                        <span className="bankroll-adjustment-date">
                          {new Date(event.created_at).toLocaleDateString(localeFor(lang), { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        <span className="bankroll-adjustment-note">{event.note ? t(event.note) : t(event.kind === "deposit" ? "Пополнение" : "Вывод")}</span>
                        <strong className={event.kind === "deposit" ? "roi-positive-text" : "roi-negative-text"}>
                          {event.kind === "deposit" ? "+" : ""}{formatMoney(Number(event.amount || 0), profileCurrency)}
                        </strong>
                      </div>
                    )) : <span className="empty">{t("Пополнения и выводы появятся здесь после первой операции с балансом.")}</span>}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {sourceBetsOpen ? (
            <div className="calendar-bets-backdrop" role="presentation">
              <section className="calendar-bets-modal" role="dialog" aria-modal="true" aria-label={t("Все прогнозы источника")}>
                <div className="calendar-bets-head">
                  <div>
                    <span>{t("Все прогнозы")}</span>
                    <strong>{t(sourceStats.find(source => source.id === sourceBetsOpen)?.name || "Источник")}</strong>
                  </div>
                  <button
                    aria-label={t("Закрыть")}
                    onClick={() => setSourceBetsOpen(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>

                {sourceBetsList.length ? (
                  <div className="calendar-bets-list">
                    {sourceBetsList.map(bet => {
                      const betDate = new Date(bet.created_at);

                      return (
                        <BetCard
                          bet={bet}
                          currency={profileCurrency}
                          dataLoading={dataLoading}
                          editForm={editForm}
                          editingBetId={editingBetId}
                          extraMeta={formatCalendarDateLabel(betDate, lang)}
                          focusedSourceId={sourceBetsOpen}
                          highlighted={bet.id === highlightBetId}
                          key={bet.id}
                          onAddSource={sourceId => addSourceToBet(bet, sourceId)}
                          onCancelEdit={cancelEditBet}
                          onRemoveSource={sourceId => removeSourceFromBet(bet, sourceId)}
                          onSaveEdit={saveEditBet}
                          onSettle={settleBet}
                          onStartEdit={startEditBet}
                          onToggleSourcePicker={() => setSourcePickerForBetId(current => (current === bet.id ? null : bet.id))}
                          setEditForm={setEditForm}
                          sourceById={sourceById}
                          sourceOptions={couponSourceOptions}
                          sourcePickerOpen={sourcePickerForBetId === bet.id}
                          timezoneOffsetMinutes={timezoneOffsetMinutes}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="calendar-bets-empty">{t("У этого источника пока нет прогнозов.")}</div>
                )}
              </section>
            </div>
          ) : null}

          {teamCardOpen && selectedTeamCard ? (
            <div className="assistant-modal-backdrop" onMouseDown={() => setTeamCardOpen(false)} role="presentation">
              <section
                aria-label={t("Карточка команды")}
                aria-modal="true"
                className="rail-panel team-card-panel"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
              >
                <button className="stats-modal-close team-card-close" aria-label={t("Закрыть")} onClick={() => setTeamCardOpen(false)} type="button">×</button>
                <div className="team-card-hero">
                  <div className="team-card-logo">
                    {selectedTeamCard.logo.startsWith("http") || selectedTeamCard.logo.startsWith("/") ? <img alt="" src={selectedTeamCard.logo} /> : selectedTeamCard.logo}
                    <button
                      aria-label={selectedTeamFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                      className={`favorite-team-button team-card-favorite ${selectedTeamFavorite ? "active" : ""}`}
                      onClick={() => toggleFavoriteTeam(selectedTeamFavoriteKey)}
                      title={selectedTeamFavorite ? t("Убрать из избранного") : t("Добавить в избранное")}
                      type="button"
                    >
                      ★
                    </button>
                  </div>
                  <div>
                    <span>{selectedTeamCard.country} · {selectedTeamCard.league}</span>
                    <h2>{selectedTeamCard.name}</h2>
                    <small>ID: {selectedTeamCard.id}</small>
                  </div>
                </div>
                <div className="team-card-stats">
                  <button className="team-card-stat-button" onClick={() => openTeamCardStandings(selectedTeamCard)} type="button">
                    <span>{t("Место")}</span>
                    <strong>{selectedTeamCard.rank > 0 ? selectedTeamCard.rank : "-"}</strong>
                  </button>
                  <div>
                    <span>{t("Форма")}</span>
                    <strong className="team-form-lights">{formatStandingForm(selectedTeamCard.form)}</strong>
                  </div>
                  <div>
                    <span>{t("Лига")}</span>
                    <strong>{selectedTeamCard.league}</strong>
                  </div>
                  {isTennisPlayerCard(selectedTeamCard) ? (
                    <>
                      <div>
                        <span>{t("Очки")}</span>
                        <strong>{selectedTeamCard.points ?? "-"}</strong>
                      </div>
                      <div>
                        <span>{t("Возраст")}</span>
                        <strong>{selectedTeamCard.age ?? "-"}</strong>
                      </div>
                      <div>
                        <span>{t("Турниров")}</span>
                        <strong>{selectedTeamCard.tournaments ?? "-"}</strong>
                      </div>
                    </>
                  ) : isEsportsTeamCard(selectedTeamCard) ? (
                    <>
                      <div>
                        <span>Очки HLTV</span>
                        <strong>{selectedTeamCard.points ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Изменение</span>
                        <strong>{selectedTeamCard.change || "-"}</strong>
                      </div>
                      <div>
                        <span>Топ</span>
                        <strong>100</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span>{t("Побед")}</span>
                        <strong>{selectedTeamCard.wins ?? "-"}</strong>
                      </div>
                      <div>
                        <span>{t("Поражений")}</span>
                        <strong>{selectedTeamCard.losses ?? "-"}</strong>
                      </div>
                      <div>
                        <span>{t("Поб. %")}</span>
                        <strong>{selectedTeamCard.pct || "-"}</strong>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {standingsOpen ? (
            <div className="assistant-modal-backdrop" onMouseDown={() => setStandingsOpen(false)} role="presentation">
              <section
                aria-label={t("Турнирная таблица")}
                aria-modal="true"
                className="rail-panel standings-panel"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
              >
                <div className="rail-title">📊 {t("Турнирная таблица")} {standingsTitle}</div>
                {standingsSource ? <div className="standings-source">{t("Источник")}: {standingsSource}</div> : null}
                <button className="stats-modal-close" aria-label={t("Закрыть таблицу")} onClick={() => setStandingsOpen(false)} type="button">×</button>
                {standingsLoading ? (
                  <div className="assistant-empty-hint">{t("Загружаю таблицу...")}</div>
                ) : standingsGroups.length ? (
                  <>
                    {counterStrikeStandingsOpen ? (
                      <div className="standings-selected-teams">
                        {selectedCounterStrikeTeams.map(({ requestedName, standing }) => {
                          const card = esportsTeamCard(requestedName, standing);
                          return (
                            <button key={requestedName} onClick={() => void openTeamProfile(card, standing || undefined)} type="button">
                              <span>{standing ? `#${standing.rank}` : "—"}</span>
                              <strong>{standing?.team || requestedName}</strong>
                              <small>{standing?.points ? `${standing.points} ${t("очков")}` : t("Нет в рейтинге")}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    {tennisStandingsOpen ? (
                      <div className="standings-selected-teams">
                        {selectedTennisPlayers.map(({ player, standing }) => {
                          const card = tennisPlayerCard(standing || player);
                          return (
                            <button key={`${player.id}-${player.sourceName}`} onClick={() => void openTeamProfile(card, standing || undefined)} type="button">
                              <span>{standing ? `#${standing.rank}` : "—"}</span>
                              <strong>{standing?.team || player.name}</strong>
                              <small>{standing ? `${standing.points ?? "-"} ${t("очков")}` : t("Нет в этом рейтинге")}</small>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="standings-groups">
                    {visibleStandingsGroups.map(group => (
                      <section className="standings-group" key={group.title}>
                        <h3>{group.title}</h3>
                        <div className="standings-table">
                          {tennisStandingsOpen ? (
                            <div className="standings-row standings-row-tennis standings-head">
                              <span>#</span>
                              <span>{t("Игрок")}</span>
                              <span>{t("Страна")}</span>
                              <span>{t("Очки")}</span>
                            </div>
                          ) : standingsMatch && isCounterStrikeMatch(standingsMatch) ? (
                            <div className="standings-row standings-row-esports standings-head">
                              <span>#</span>
                              <span>{t("Команда")}</span>
                              <span>{t("Очки HLTV")}</span>
                              <span>{t("Изменение")}</span>
                            </div>
                          ) : (
                            <div className="standings-row standings-head">
                              <span>#</span>
                              <span>{t("Команда")}</span>
                              <span>{t("В")}</span>
                              <span>{t("П")}</span>
                              <span>{t("Поб. %")}</span>
                              <span>{t("Форма")}</span>
                            </div>
                          )}
                          {group.rows.map(row => {
                            const rowTeamCard = clientLeagueTeamCard(row.team, row.id);
                            const counterStrikeRow = Boolean(standingsMatch && isCounterStrikeMatch(standingsMatch));
                            const tennisRow = Boolean(standingsMatch?.sport === "tennis");
                            const selectedPlayerIds = new Set(selectedTennisPlayers.map(item => item.player.id));
                            const highlighted = Boolean(standingsMatch) && (tennisRow
                              ? selectedPlayerIds.has(row.id) || selectedTennisPlayers.some(item => tennisPlayerNamesMatch(row.team, item.player.name))
                              : counterStrikeRow
                              ? esportsTeamNamesMatch(row.team, standingsMatch!.home) || esportsTeamNamesMatch(row.team, standingsMatch!.away)
                              : standingsRowMatchesTeam(row, standingsMatch!, "home") || standingsRowMatchesTeam(row, standingsMatch!, "away"));
                            const rowEsportsCard = counterStrikeRow ? esportsTeamCard(row.team, row) : null;
                            const rowTennisCard = tennisRow ? tennisPlayerCard(row) : null;

                            return (
                            <div className={`standings-row ${counterStrikeRow ? "standings-row-esports" : ""} ${tennisRow ? "standings-row-tennis" : ""} ${highlighted ? "highlighted" : ""}`} key={row.id}>
                              <span>{row.rank}</span>
                              {rowTennisCard ? (
                                <button className="standings-team-button" onClick={() => void openTeamProfile(rowTennisCard, row)} type="button">
                                  <strong>{row.team}</strong>
                                </button>
                              ) : rowEsportsCard ? (
                                <button className="standings-team-button" onClick={() => void openTeamProfile(rowEsportsCard, row)} type="button">
                                  <strong>{row.team}</strong>
                                </button>
                              ) : rowTeamCard ? (
                                <button className="standings-team-button" onClick={() => void openTeamProfile(rowTeamCard, row)} type="button">
                                  <strong>{rowTeamCard.name}</strong>
                                </button>
                              ) : <strong>{row.team}</strong>}
                              {tennisRow ? (
                                <>
                                  <span className="standings-country-flag" title={row.country || undefined}>
                                    {row.country ? <FlagIcon country={row.country} /> : "-"}
                                  </span>
                                  <span>{row.points ?? "-"}</span>
                                </>
                              ) : counterStrikeRow ? (
                                <>
                                  <span>{row.points ?? "-"}</span>
                                  <span>{row.change || "-"}</span>
                                </>
                              ) : (
                                <>
                                  <span>{row.wins}</span>
                                  <span>{row.losses}</span>
                                  <span>{row.pct}</span>
                                  <span className="standings-form">{formatStandingForm(row.form)}</span>
                                </>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                    </div>
                    {pagedStandingsOpen && standingsPageCount > 1 ? (
                      <nav className="standings-pagination" aria-label={t("Страницы рейтинга")}>
                        <button
                          aria-label={t("Предыдущая страница")}
                          disabled={standingsPage === 1}
                          onClick={() => setStandingsPage(page => Math.max(1, page - 1))}
                          type="button"
                        >
                          ‹
                        </button>
                        {Array.from({ length: standingsPageCount }, (_, index) => index + 1).map(page => (
                          <button
                            aria-current={page === standingsPage ? "page" : undefined}
                            className={page === standingsPage ? "active" : ""}
                            key={page}
                            onClick={() => setStandingsPage(page)}
                            type="button"
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          aria-label={t("Следующая страница")}
                          disabled={standingsPage === standingsPageCount}
                          onClick={() => setStandingsPage(page => Math.min(standingsPageCount, page + 1))}
                          type="button"
                        >
                          ›
                        </button>
                      </nav>
                    ) : null}
                  </>
                ) : (
                  <div className="assistant-empty-hint">{standingsMessage || t("Турнирная таблица сейчас недоступна.")}</div>
                )}
              </section>
            </div>
          ) : null}

          {assistantOpen ? (
            <div className="assistant-modal-backdrop" onMouseDown={() => setAssistantOpen(false)} role="presentation">
              <section
                aria-label={t("AI Ассистент")}
                aria-modal="true"
                className="rail-panel assistant-panel"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
              >
                <div className="rail-title">🤖 {t("AI Ассистент")}</div>
                <button className="stats-modal-close" aria-label={t("Закрыть ассистента")} onClick={() => setAssistantOpen(false)} type="button">×</button>

                <div className="assistant-tabs">
                  {[
                    ["settings", "Настройки"],
                    ["analysis", "Анализ"],
                    ["stats", "Статистика"]
                  ].map(([key, label]) => (
                    <button
                      className={assistantTab === key ? "active" : ""}
                      key={key}
                      onClick={() => setAssistantTab(key as "settings" | "analysis" | "stats")}
                      type="button"
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>

                {assistantTab === "analysis" ? (
                  <>
                    <div className="assistant-section-head">
                      <span>{analyzing ? t("Анализирую линию...") : `${visibleAnalyzedMatches.length} ${t("матчей")}`}</span>
                    </div>

                    <div className="assistant-feed">
                      {visibleAnalyzedMatches.length ? (
                        visibleAnalyzedMatches.map(match => (
                          <div className={`assistant-feed-item tier-${confidenceTier(match.confidence)}`} key={analysisMatchKey(match)}>
                            <div className="assistant-feed-teams">
                              <span>{match.home}</span>
                              <span className="assistant-feed-vs">—</span>
                              <span>{match.away}</span>
                            </div>
                            <div className="assistant-feed-meta">
                              <span>{formatMatchDateTime(match, lang)}</span>
                              <span className="assistant-feed-league">{match.league}</span>
                              <span className="assistant-feed-odds">{match.odds.filter(odd => odd && odd !== "-").join(" / ")}</span>
                            </div>
                            <div className="assistant-feed-rec">
                              <strong>{recommendedOutcomeDetails(match, t)}</strong>
                              <span>{match.confidence}%</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="assistant-empty-hint">
                          {t("Анализ запустится автоматически после загрузки актуальных матчей.")}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                {assistantTab === "stats" ? (
                  <div className="assistant-stats">
                    <div className="assistant-stat-grid">
                      <div><span>{t("Прогнозов")}</span><strong>{assistantForecastStats.total}</strong></div>
                      <div><span>{t("Выиграло")}</span><strong className="roi-positive-text">{assistantForecastStats.wins}</strong></div>
                      <div><span>{t("Проиграло")}</span><strong className="roi-negative-text">{assistantForecastStats.losses}</strong></div>
                      <div><span>{t("Средний кэф")}</span><strong>{assistantForecastStats.avgOdds.toFixed(2)}</strong></div>
                      <div><span>{t("ROI")}</span><strong className={assistantForecastStats.roi >= 0 ? "roi-positive-text" : "roi-negative-text"}>{assistantForecastStats.roi.toFixed(1)}%</strong></div>
                      <div><span>{t("Профит")}</span><strong className={assistantForecastStats.profit >= 0 ? "roi-positive-text" : "roi-negative-text"}>{formatMoney(assistantForecastStats.profit, profileCurrency)}</strong></div>
                    </div>

                    <div className="assistant-feed assistant-stats-list">
                      {assistantSettledBets.length ? (
                        assistantSettledBets.map(bet => (
                          <div className={`assistant-feed-item assistant-stat-bet result-${bet.result}`} key={bet.id}>
                            <div className="assistant-feed-teams">
                              <span>{bet.event_name}</span>
                            </div>
                            <div className="assistant-feed-meta">
                              <span>{t("Ставка")}: {translateBetMarket(bet.market, lang)} {translateBetSelectionLine(bet.selection, lang)}</span>
                              <span className="assistant-feed-odds">×{Number(bet.odds || 0).toFixed(2)}</span>
                            </div>
                            <div className="assistant-feed-rec">
                              <strong>
                                {bet.result === "win" ? t("Прогноз выиграл") : bet.result === "loss" ? t("Прогноз проиграл") : t("Возврат")}
                              </strong>
                              <span className={betTotalProfitValue(bet) >= 0 ? "roi-positive-text" : "roi-negative-text"}>{formatMoney(betTotalProfitValue(bet), profileCurrency)}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="assistant-empty-hint">{t("Здесь появится статистика после завершения ставок.")}</div>
                      )}
                    </div>
                  </div>
                ) : null}

                {assistantTab === "settings" ? (
                  <>
                    <div className="assistant-settings">
                      <div className="assistant-setting-card">
                        <span>{t("Фиксированная ставка")}</span>
                        <strong>{getUserAssistantStake(user) > 0 ? formatMoney(getUserAssistantStake(user), profileCurrency) : t("Не задана")}</strong>
                        <p>{t("Эта сумма будет автоматически подставляться в купон для прогнозов AI ассистента. Перед сохранением купона её можно изменить вручную.")}</p>
                      </div>
                      <label className="assistant-setting-field">
                        {t("Сумма ставки")}
                        <input
                          inputMode="decimal"
                          onChange={event => setAssistantStakeInput(event.target.value)}
                          placeholder={`${t("Например")} 100 ${currencySymbol(profileCurrency)}`}
                          value={assistantStakeInput}
                        />
                      </label>
                      <button
                        className="assistant-save-settings"
                        disabled={assistantStakeSaving}
                        onClick={saveAssistantStake}
                        type="button"
                      >
                        {assistantStakeSaving ? t("Сохраняю...") : t("Сохранить сумму")}
                      </button>
                      {assistantSettingsMessage ? <div className="assistant-settings-message">{assistantSettingsMessage}</div> : null}
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Stakeversee</div>
        <div className="brand-caption">bankroll · line · sources</div>
        <nav className="nav" aria-label={t("Основная навигация")}>
          <button className="active">{t("Панель")}</button>
          <button>{t("Ставки")}</button>
          <button>{t("Источники")}</button>
          <button>{t("Банкролл")}</button>
          <button>{t("AI анализ")}</button>
        </nav>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="supabase-ok">
            <span className="status-dot" />
            {t("Supabase подключён:")} {supabaseHost}
          </div>
          <div className="topbar-note">{t("Единый кабинет для дисциплины ставок")}</div>
        </header>

        <div className="content">
          <section className="hero">
            <div className="panel hero-copy">
              <div className="eyebrow">{t("Betting command center")}</div>
              <h1>{t("Stakeversee держит банк, линию и источники в одном рабочем окне.")}</h1>
              <p className="lead">
                {t("Сохраняй прогнозы, отслеживай ROI по источникам, собирай купон из линии и не теряй историю при смене устройства.")}
              </p>
              <div className="actions">
                <a className="primary link-button" href="https://stakeversee.vercel.app">
                  {t("Открыть production")}
                </a>
                <button className="secondary" type="button">{t("Схема базы готова")}</button>
              </div>
              <div className="hero-metrics" aria-label={t("Ключевые возможности")}>
                <div>
                  <span>{t("ROI")}</span>
                  <strong>+12.4%</strong>
                </div>
                <div>
                  <span>{t("Источники")}</span>
                  <strong>8</strong>
                </div>
                <div>
                  <span>{t("Матчи")}</span>
                  <strong>72h</strong>
                </div>
              </div>
            </div>

            <section className="panel auth-panel" aria-label={t("Авторизация")}>
              <div className="auth-card-head">
                <div>
                  <span>{t("Личный кабинет")}</span>
                  <strong>{mode === "login" ? t("Вход в Stakeversee") : t("Новый аккаунт")}</strong>
                </div>
              </div>
                  <div className="auth-tabs">
                    <button
                      className={mode === "login" ? "active" : ""}
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      {t("Вход")}
                    </button>
                    <button
                      className={mode === "register" ? "active" : ""}
                      onClick={() => setMode("register")}
                      type="button"
                    >
                      {t("Регистрация")}
                    </button>
                  </div>

                  <form className="auth-form" onSubmit={handleAuth}>
                    {mode === "register" ? (
                      <label>
                        {t("Никнейм")}
                        <input
                          autoComplete="nickname"
                          onChange={event => setDisplayName(event.target.value)}
                          placeholder={t("Семик")}
                          value={displayName}
                        />
                      </label>
                    ) : null}

                    <label>
                      {t("Email")}
                      <input
                        autoComplete="email"
                        onChange={event => setEmail(event.target.value)}
                        placeholder="you@mail.com"
                        type="email"
                        value={email}
                      />
                    </label>

                    <label>
                      {t("Пароль")}
                      <input
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={6}
                        onChange={event => setPassword(event.target.value)}
                        placeholder={t("минимум 6 символов")}
                        type="password"
                        value={password}
                      />
                    </label>

                    {mode === "login" ? (
                      <button
                        className="forgot-password-button"
                        disabled={resetSending || status === "loading"}
                        onClick={sendPasswordReset}
                        type="button"
                      >
                        {resetSending ? "Отправляю..." : "Забыл пароль?"}
                      </button>
                    ) : null}

                    <button className="primary" disabled={status === "loading"} type="submit">
                      {status === "loading"
                        ? t("Подождите...")
                        : mode === "login"
                          ? t("Войти")
                          : t("Создать аккаунт")}
                    </button>

                    {message ? <p className={`auth-message ${status}`}>{message}</p> : null}
                  </form>
            </section>
          </section>

          <section className="panel product-preview" aria-label={t("Превью кабинета")}>
            <div className="preview-column preview-main">
              <div className="preview-head">
                <span>{t("Линия сегодня")}</span>
                <strong>{t("Контроль до ставки")}</strong>
              </div>
              <div className="preview-match">
                <div>
                  <span>18:30 · Tennis</span>
                  <strong>ATP Challenger</strong>
                </div>
                <div className="preview-odds">
                  <button type="button">1.82</button>
                  <button type="button">2.05</button>
                </div>
              </div>
              <div className="preview-match">
                <div>
                  <span>21:00 · CS2</span>
                  <strong>Counter Strike 2</strong>
                </div>
                <div className="preview-odds">
                  <button type="button">1.67</button>
                  <button type="button">2.28</button>
                </div>
              </div>
            </div>
            <div className="preview-column">
              <div className="preview-head">
                <span>{t("Банкролл")}</span>
                <strong>10 000 ₽</strong>
              </div>
              <div className="preview-bars">
                <span style={{ width: "72%" }} />
                <span style={{ width: "48%" }} />
                <span style={{ width: "84%" }} />
              </div>
            </div>
            <div className="preview-column">
              <div className="preview-head">
                <span>{t("Источники")}</span>
                <strong>{t("ROI по каждому")}</strong>
              </div>
              <div className="preview-source-row"><span>Semik</span><strong>+18.1%</strong></div>
              <div className="preview-source-row negative"><span>Test line</span><strong>-4.2%</strong></div>
            </div>
          </section>

          <section className="section-grid">
            {features.map(feature => (
              <article className="panel feature" key={feature.title}>
                <h2>{t(feature.title)}</h2>
                <p>{t(feature.text)}</p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
