"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register";
type AuthStatus = "idle" | "loading" | "ok" | "error";

type SourceRow = {
  id: string;
  name: string;
  is_blacklisted: boolean;
};

type BetRow = {
  id: string;
  source_id: string | null;
  event_name: string;
  sport: string | null;
  bookmaker: string | null;
  market: string;
  selection: string;
  odds: number | string;
  stake: number | string;
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
  confidence: number;
  startsAt?: string;
};

type CouponItem = {
  id: string;
  matchId: string;
  eventName: string;
  sport: string;
  market: string;
  selection: string;
  odds: string;
};
const MATCH_CACHE_KEY = "stakeversee:line-matches:v2";

const MAX_COUPON_ITEMS = 5;
const BASE_BANKROLL = 10000;

const bookmakerOptions = [
  "PARI",
  "Fonbet",
  "TENNISI",
  "Мелбет",
  "BetBoom",
  "Winline",
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

function formatEventName(value: string): string {
  return value.replace(/\s+vs\s+/gi, " - ").replace(/\s+-\s+/g, " - ").trim();
}

function betProfitValue(bet: BetRow): number {
  if (bet.profit !== null && bet.profit !== undefined) return Number(bet.profit || 0);

  const stake = Number(bet.stake || 0);
  const odds = Number(bet.odds || 0);
  if (bet.result === "win") return stake * odds - stake;
  if (bet.result === "loss") return -stake;
  return 0;
}

function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —").replace(/\s*\.\.\.\s*$/, "").trim();
  return name || "Источник —";
}

function resultLabel(result: BetRow["result"]): string {
  if (result === "win") return "Выигрыш";
  if (result === "loss") return "Проигрыш";
  if (result === "return") return "Возврат";
  return "Ожидает";
}
function dateKeyFromDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function dateKeyFromIso(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateKeyFromDate(date);
}

function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {
  const key = dateKeyFromDate(day);
  return settledBets
    .filter(bet => dateKeyFromIso(bet.created_at) === key)
    .reduce((sum, bet) => sum + betProfitValue(bet), 0);
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
  { key: "basketball", label: "Баскет", icon: "🏀" },
  { key: "ice-hockey", label: "Хоккей", icon: "🏒" },
  { key: "handball", label: "Гандбол", icon: "🤾" },
  { key: "esports", label: "Кибер", icon: "🎮" },
  { key: "football", label: "Футбол", icon: "⚽" },
  { key: "baseball", label: "Бейсбол", icon: "⚾" }
];

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
    confidence: 64
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
    confidence: 59
  },
  {
    id: "demo-3",
    sport: "basketball",
    country: "US",
    league: "Баскет · NBA",
    time: "02:00",
    home: "Boston Celtics",
    away: "New York Knicks",
    odds: ["1.72", "-", "2.12"],
    confidence: 57
  }
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB"
  }).format(value);
}

function formatCalendarDateLabel(date: Date) {
  return date.toLocaleDateString("ru-RU", {
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

function readCachedMatches() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MATCH_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as { matches?: MatchRow[] };
    return getUpcomingMatches(Array.isArray(parsed.matches) ? parsed.matches : []);
  } catch {
    return [];
  }
}

function writeCachedMatches(matches: MatchRow[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    MATCH_CACHE_KEY,
    JSON.stringify({
      matches: getUpcomingMatches(matches),
      updatedAt: new Date().toISOString()
    })
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState("");

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
    freebet: ""
  });
  const [sourcePopupOpen, setSourcePopupOpen] = useState(false);
  const [bankrollForm, setBankrollForm] = useState({
    kind: "deposit",
    amount: "",
    note: ""
  });
  const [activeSport, setActiveSport] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bankEditorOpen, setBankEditorOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [calendarDateOpen, setCalendarDateOpen] = useState<Date | null>(null);
  const [lineMatches, setLineMatches] = useState<MatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesStatus, setMatchesStatus] = useState("Автообновление каждые 5 минут");

  const supabaseHost = useMemo(() => {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.local").host;
  }, []);

  const sourceById = useMemo(() => {
    return new Map(sources.map(source => [source.id, source]));
  }, [sources]);

  const betStats = useMemo(() => {
    const closed = bets.filter(bet => bet.result !== "pending");
    const pending = bets.length - closed.length;
    const avgOdds = bets.length
      ? bets.reduce((sum, bet) => sum + Number(bet.odds || 0), 0) / bets.length
      : 0;
    const totalStake = closed.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
    const profit = closed.reduce((sum, bet) => {
      if (bet.profit !== null && bet.profit !== undefined) {
        return sum + Number(bet.profit || 0);
      }

      const stake = Number(bet.stake || 0);
      const odds = Number(bet.odds || 0);
      if (bet.result === "win") return sum + stake * odds - stake;
      if (bet.result === "loss") return sum - stake;
      return sum;
    }, 0);
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

  const couponRealStake = Number(couponDraft.stake.replace(",", ".")) || 0;
  const couponFreebet = Number(couponDraft.freebet.replace(",", ".")) || 0;
  const couponPotentialWin = couponTotalOdds > 1
    ? couponRealStake * couponTotalOdds + couponFreebet * (couponTotalOdds - 1)
    : 0;
  const bankrollStats = useMemo(() => {
    const balance = bankrollEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0);
    const deposits = bankrollEvents
      .filter(event => event.kind === "deposit")
      .reduce((sum, event) => sum + Number(event.amount || 0), 0);
    const withdrawals = bankrollEvents
      .filter(event => event.kind === "withdrawal")
      .reduce((sum, event) => sum + Math.abs(Number(event.amount || 0)), 0);
    const bettingProfit = bankrollEvents
      .filter(event => ["win", "loss", "return"].includes(event.kind))
      .reduce((sum, event) => sum + Number(event.amount || 0), 0);

    return {
      balance,
      bettingProfit,
      deposits,
      totalEvents: bankrollEvents.length,
      withdrawals
    };
  }, [bankrollEvents]);

  const calendarDays = useMemo(() => makeCalendarDays(), []);

  const calendarBets = useMemo(() => {
    if (!calendarDateOpen) return [];

    return bets
      .filter(bet => isSameLocalDate(bet.created_at, calendarDateOpen))
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime());
  }, [bets, calendarDateOpen]);

  const sourceStats = useMemo(() => {
    return sources.map(source => {
      const sourceBets = bets.filter(bet => bet.source_id === source.id);
      const closed = sourceBets.filter(bet => bet.result !== "pending");
      const profit = closed.reduce((sum, bet) => sum + betProfitValue(bet), 0);
      const stake = closed.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
      const totalStake = sourceBets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
      const avgOdds = sourceBets.length
        ? sourceBets.reduce((sum, bet) => sum + Number(bet.odds || 0), 0) / sourceBets.length
        : 0;

      return {
        ...source,
        avgOdds,
        bets: sourceBets.length,
        losses: sourceBets.filter(bet => bet.result === "loss").length,
        pending: sourceBets.filter(bet => bet.result === "pending").length,
        profit,
        returns: sourceBets.filter(bet => bet.result === "return").length,
        roi: stake > 0 ? (profit / stake) * 100 : 0,
        stake: totalStake,
        wins: sourceBets.filter(bet => bet.result === "win").length
      };
    }).sort((first, second) => second.bets - first.bets || first.name.localeCompare(second.name, "ru"));
  }, [bets, sources]);

  const activeMatches = useMemo(() => {
    const queryGroups = searchTokenGroups(searchQuery);
    const upcomingMatches = getUpcomingMatches(lineMatches);

    return upcomingMatches.filter(match => {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const haystack = searchHaystack(match.home, match.away, match.league, match.country);
      const searchOk =
        !queryGroups.length ||
        queryGroups.every(group => group.some(token => haystack.includes(token)));

      return sportOk && searchOk;
    });
  }, [activeSport, lineMatches, searchQuery]);

  const matchCounts = useMemo(() => {
    const upcomingMatches = getUpcomingMatches(lineMatches);
    const counts = new Map<string, number>();

    for (const match of upcomingMatches) {
      counts.set(match.sport, (counts.get(match.sport) || 0) + 1);
    }

    return {
      all: upcomingMatches.length,
      bySport: counts
    };
  }, [lineMatches]);

  async function refreshMatchesWindow() {
    const cachedMatches = readCachedMatches();
    if (cachedMatches.length) {
      setLineMatches(cachedMatches);
      setMatchesStatus(`Из кэша: ${cachedMatches.length} матчей`);
    }

    setMatchesLoading(true);

    try {
      const response = await fetch("/api/matches?hours=72", { cache: "no-store" });
      if (!response.ok) {
        if (!cachedMatches.length) setLineMatches([]);
        setMatchesStatus("Линия букмекеров пока не подключена");
        return;
      }

      const payload = await response.json();
      const rawMatches = Array.isArray(payload) ? payload : Array.isArray(payload?.matches) ? payload.matches : [];
      const normalizedMatches: MatchRow[] = rawMatches
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
            confidence: Number(match.confidence || 0),
            startsAt
          };
        })
        .filter((match: MatchRow) => match.home && match.away);

      writeCachedMatches(normalizedMatches);
      setLineMatches(getUpcomingMatches(normalizedMatches));
      setMatchesStatus(`Автообновлено: ${normalizedMatches.length} матчей`);
    } catch {
      if (!cachedMatches.length) setLineMatches([]);
      setMatchesStatus("Линия букмекеров пока не подключена");
    } finally {
      setMatchesLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
  }, [user]);

  useEffect(() => {
    if (!user?.email) {
      setSources([]);
      setBets([]);
      setBankrollEvents([]);
      return;
    }

    supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.display_name || user.email.split("@")[0]
    }).then();

    loadWorkspaceData(user.id);
  }, [user]);

  async function loadWorkspaceData(userId: string) {
    setDataLoading(true);
    setDataMessage("");

    const [sourcesResult, betsResult, bankrollResult] = await Promise.all([
      supabase
        .from("sources")
        .select("id,name,is_blacklisted")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase
        .from("bets")
        .select("id,source_id,event_name,sport,bookmaker,market,selection,odds,stake,result,profit,settled_at,created_at")
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
        || "Ошибка загрузки данных."
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
      setMessage("Заполни email, пароль и имя для регистрации.");
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
      setMessage("Вход выполнен.");
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
    setMessage("Аккаунт создан. Если Supabase просит подтверждение почты, открой письмо.");
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

  async function handleBetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const odds = Number(betForm.odds.replace(",", "."));
    const stake = Number(betForm.stake.replace(",", "."));

    if (!betForm.sourceId || !betForm.eventName.trim() || !betForm.selection.trim() || !odds || !stake) {
      setDataMessage("Для ставки нужны источник, матч, исход, коэффициент и сумма.");
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

  function buildCouponItem(match: MatchRow): CouponItem {
    return {
      id: `${match.id}-${Date.now()}`,
      matchId: match.id,
      eventName: `${match.home} - ${match.away}`,
      sport: match.sport,
      market: "Победа",
      selection: match.home,
      odds: match.odds[0] && match.odds[0] !== "-" ? match.odds[0] : ""
    };
  }

  function toggleCouponMatch(match: MatchRow) {
    setCouponItems(current => {
      if (current.some(item => item.matchId === match.id)) {
        return current.filter(item => item.matchId !== match.id);
      }

      if (current.length >= MAX_COUPON_ITEMS) {
        setDataMessage(`В купоне максимум ${MAX_COUPON_ITEMS} матчей.`);
        return current;
      }

      setCouponOpen(true);
      setDataMessage("");
      return [...current, buildCouponItem(match)];
    });
  }

  function updateCouponItem(id: string, patch: Partial<CouponItem>) {
    setCouponItems(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function saveCoupon() {
    if (!user) return;

    const stake = Number(couponDraft.stake.replace(",", ".")) || 0;
    const freebet = Number(couponDraft.freebet.replace(",", ".")) || 0;
    const activeStake = stake > 0 ? stake : freebet;

    if (!couponItems.length) {
      setDataMessage("Добавь хотя бы один матч в купон.");
      return;
    }

    if (!couponDraft.bookmaker || !couponDraft.sourceId || activeStake <= 0) {
      setDataMessage("Для купона нужны букмекер, источник и сумма ставки или фрибета.");
      return;
    }

    const invalid = couponItems.some(item => {
      const odds = Number(item.odds.replace(",", "."));
      return !item.selection.trim() || !odds || odds < 1.01;
    });

    if (invalid) {
      setDataMessage("Проверь исходы и коэффициенты в купоне.");
      return;
    }

    const bookmaker = freebet > 0 && stake <= 0 ? `${couponDraft.bookmaker} · Фрибет` : couponDraft.bookmaker;
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
      bookmaker,
      stake: activeStake,
      result: "pending",
      ...payload
    });

    if (error) {
      setDataMessage(error.message);
    } else {
      setCouponItems([]);
      setCouponDraft(current => ({ ...current, stake: "", freebet: "" }));
      setCouponOpen(false);
      setDataMessage("Купон сохранён в ставки.");
      await loadWorkspaceData(user.id);
    }

    setDataLoading(false);
  }

  async function handleCouponSourceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const name = sourceName.trim();
    if (!name) return;

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
      setDataMessage("Укажи сумму движения банка.");
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

    const stake = Number(bet.stake || 0);
    const odds = Number(bet.odds || 0);
    const profit = result === "win" ? stake * odds - stake : result === "loss" ? -stake : 0;

    setDataLoading(true);
    const { error } = await supabase
      .from("bets")
      .update({
        result,
        profit,
        settled_at: new Date().toISOString()
      })
      .eq("id", bet.id)
      .eq("user_id", user.id);

    if (error) {
      setDataMessage(error.message);
    } else {
      const { error: bankrollError } = await supabase.from("bankroll_events").insert({
        user_id: user.id,
        bet_id: bet.id,
        amount: profit,
        kind: result,
        note: `${bet.event_name} · ${bet.market} · ${bet.selection}`
      });

      if (bankrollError) {
        setDataMessage(bankrollError.message);
      } else {
        setDataMessage("");
      }

      await loadWorkspaceData(user.id);
    }

    setDataLoading(false);
  }

  if (user) {
    const userName = user.user_metadata?.display_name || user.email?.split("@")[0] || "Игрок";
    const shownMatches = activeMatches;
    const displayedBalance = BASE_BANKROLL + bankrollStats.balance;
    const pendingBets = bets.filter(bet => bet.result === "pending");
    const settledBets = bets.filter(bet => bet.result !== "pending" && bet.settled_at);
    const pendingRailBets = pendingBets.slice(0, 5);

    return (
      <main className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-brand">Stakeversee</div>

          <div className="profile-pill">
            <span>{userName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{userName}</strong>
              <small>игрок</small>
            </div>
          </div>

          <div className="sync-meter">
            <div>
              <span>Линия</span>
              <strong>{matchesLoading ? "обновляю..." : matchesStatus}</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${matchesLoading ? 42 : matchCounts.all ? 100 : 0}%` }} />
            </div>
            <b>{matchCounts.all} матчей</b>
          </div>

          <div className="top-actions">
            <button aria-label="Сохранить" className="icon-button" type="button">💾</button>
            <button aria-label="Открыть" className="icon-button" type="button">📁</button>
            <button className="assistant-button" type="button">🤖 Ассистент</button>
            <button className="lang-button active" type="button">RU</button>
            <button className="lang-button" type="button">ENG</button>
            <button className="logout-button" onClick={handleLogout} type="button">Выйти</button>
          </div>
        </header>

        <section className="workspace-grid">
          <div className="match-board">
            <nav className="sport-tabs" aria-label="Виды спорта">
              {sportTabs.map(tab => {
                const count = tab.key === "all" ? matchCounts.all : matchCounts.bySport.get(tab.key) || 0;
                return (
                  <button
                    className={activeSport === tab.key ? "active" : ""}
                    key={tab.key}
                    onClick={() => setActiveSport(tab.key)}
                    type="button"
                  >
                    <span>{tab.icon}</span>
                    <strong>{tab.label}</strong>
                    <em>{count}</em>
                  </button>
                );
              })}
            </nav>

            <div className="match-filters">
              <label>
                <span>Страна:</span>
                <select>
                  <option>🌐 Все страны</option>
                  <option>🇷🇺 Россия</option>
                  <option>🇺🇸 США</option>
                  <option>🇬🇧 Англия</option>
                </select>
              </label>
              <label>
                <span>Лига:</span>
                <select>
                  <option>🏆 Все лиги</option>
                  <option>Топовые лиги</option>
                  <option>Избранные</option>
                </select>
              </label>

              <div className="filter-buttons">
                {[
                  ["all", "Все"],
                  ["hot", "🔥 Горячие"],
                  ["good", "✅ Хорошие"],
                  ["fav", "⭐ Избранные"]
                ].map(([key, label]) => (
                  <button
                    className={matchFilter === key ? "active" : ""}
                    key={key}
                    onClick={() => setMatchFilter(key)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <input
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="🔍 Команда, лига..."
                spellCheck={false}
                value={searchQuery}
              />
            </div>

            <div className="matches-area">
              {shownMatches.length ? (
                shownMatches.map(match => (
                  <article className={`match-card ${couponItems.some(item => item.matchId === match.id) ? "in-coupon" : ""}`} key={match.id}>
                    <div className="match-meta">
                      <span>{match.country}</span>
                      <strong>{match.league}</strong>
                      <time>{match.time}</time>
                    </div>

                    <div className="odds-strip">
                      <button type="button">
                        <strong>{match.odds[0]}</strong>
                        <span>П1 · лучший</span>
                      </button>
                      <button type="button">
                        <strong>{match.odds[1]}</strong>
                        <span>Х</span>
                      </button>
                      <button type="button">
                        <strong>{match.odds[2]}</strong>
                        <span>П2 · лучший</span>
                      </button>
                    </div>

                    <div className="match-teams">
                      <div>
                        <strong>{match.home}</strong>
                        <span>форма 5к · вес 3</span>
                      </div>
                      <b>-</b>
                      <div>
                        <strong>{match.away}</strong>
                        <span>форма 5к · вес 3</span>
                      </div>
                    </div>

                    <div className="recommendation-card">
                      <div>
                        <span>Рекомендация</span>
                        <strong>Победа {match.home}</strong>
                      </div>
                      <div>
                        <strong>{match.confidence}%</strong>
                        <span>хорошо</span>
                      </div>
                    </div>

                    <div className="match-footer">
                      <div className="probability-bar">
                        <span style={{ width: `${match.confidence}%` }} />
                      </div>
                      <button onClick={() => toggleCouponMatch(match)} type="button">{couponItems.some(item => item.matchId === match.id) ? "✓ В купоне" : "+ Добавить в купон"}</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-board">
                  <strong>{matchesLoading ? "Загружаю матчи" : "Матчи не найдены"}</strong>
                </div>
              )}
            </div>

            <section className="workspace-bottom">
              <article className="quick-card">
                <div className="compact-head">
                  <div>
                    <span>Быстрая ставка</span>
                    <strong>Добавить в статистику</strong>
                  </div>
                </div>
                <form className="compact-bet-form" onSubmit={handleBetSubmit}>
                  <select
                    onChange={event => setBetForm(current => ({ ...current, sourceId: event.target.value }))}
                    value={betForm.sourceId}
                  >
                    <option value="">Источник</option>
                    {sources.filter(source => !source.is_blacklisted).map(source => (
                      <option key={source.id} value={source.id}>{source.name}</option>
                    ))}
                  </select>
                  <input
                    onChange={event => setBetForm(current => ({ ...current, eventName: event.target.value }))}
                    placeholder="Матч"
                    value={betForm.eventName}
                  />
                  <input
                    onChange={event => setBetForm(current => ({ ...current, selection: event.target.value }))}
                    placeholder="Исход"
                    value={betForm.selection}
                  />
                  <input
                    inputMode="decimal"
                    onChange={event => setBetForm(current => ({ ...current, odds: event.target.value }))}
                    placeholder="Кэф"
                    value={betForm.odds}
                  />
                  <input
                    inputMode="decimal"
                    onChange={event => setBetForm(current => ({ ...current, stake: event.target.value }))}
                    placeholder="Сумма"
                    value={betForm.stake}
                  />
                  <button disabled={dataLoading} type="submit">Добавить</button>
                </form>
              </article>

              <article className="quick-card">
                <div className="compact-head">
                  <div>
                    <span>Источники</span>
                    <strong>Чёрный список и ROI</strong>
                  </div>
                </div>
                <form className="source-form compact-source-form" onSubmit={handleSourceSubmit}>
                  <input
                    onChange={event => setSourceName(event.target.value)}
                    placeholder="Название источника"
                    value={sourceName}
                  />
                  <button disabled={dataLoading} type="submit">Добавить</button>
                </form>
                <div className="compact-source-list">
                  {sourceStats.slice(0, 5).map(source => (
                    <button
                      className={source.is_blacklisted ? "blacklisted" : ""}
                      key={source.id}
                      onClick={() => toggleSourceBlacklist(source)}
                      type="button"
                    >
                      <span>{source.name}</span>
                      <strong>{source.roi.toFixed(1)}%</strong>
                    </button>
                  ))}
                  {!sourceStats.length ? <span className="empty">Источники появятся после добавления.</span> : null}
                </div>
              </article>
            </section>

            {dataMessage ? <div className="workspace-message">{dataMessage}</div> : null}
          </div>

          <aside className="right-rail">
            <section className="rail-panel calendar-panel">
              <div className="rail-title">Календарь прогнозов</div>
              <div className="calendar-head">
                <button type="button">‹</button>
                <strong>{new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</strong>
                <button type="button">›</button>
              </div>
              <div className="weekdays">
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(day => <span key={day}>{day}</span>)}
              </div>
              <div className="calendar-grid">
                {calendarDays.map(day => (
                  <button
                    className={`${day.muted ? "muted" : ""} ${day.current ? "current" : ""} ${bets.some(bet => isSameLocalDate(bet.created_at, day.date)) ? "has-bets" : ""}`}
                    key={day.date.toISOString()}
                    onClick={() => setCalendarDateOpen(day.date)}
                    type="button"
                  >
                    {day.day}
                    {day.current ? <small>+{Math.max(0, Math.round(betStats.profit))}₽</small> : null}
                  </button>
                ))}
              </div>
            </section>

            <section className={`quick-coupon-card ${couponOpen || couponItems.length ? "open" : ""}`}>
              <button className="coupon-head" onClick={() => setCouponOpen(current => !current)} type="button">
                <span>🎫 Купон</span>
                <strong>{couponItems.length} / {MAX_COUPON_ITEMS}</strong>
              </button>

              {couponOpen || couponItems.length ? (
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
                          <option value="Победа">Победа</option>
                          <option value="Фора">Фора</option>
                          <option value="Тотал">Тотал</option>
                          <option value="Обе забьют">Обе забьют</option>
                          <option value="Точный счёт">Точный счёт</option>
                          <option value="Инд. тотал">Инд. тотал</option>
                        </select>
                        <input
                          onChange={event => updateCouponItem(item.id, { selection: event.target.value })}
                          placeholder="Исход"
                          value={item.selection}
                        />
                        <input
                          inputMode="decimal"
                          onChange={event => updateCouponItem(item.id, { odds: event.target.value })}
                          placeholder="Кэф"
                          value={item.odds}
                        />
                      </div>
                    </div>
                  )) : <div className="coupon-empty">Нажми на карточку матча, чтобы добавить его в купон.</div>}

                  <div className="coupon-controls">
                    <select
                      onChange={event => setCouponDraft(current => ({ ...current, bookmaker: event.target.value }))}
                      value={couponDraft.bookmaker}
                    >
                      <option value="">— выберите букмекера —</option>
                      {bookmakerOptions.map(bookmaker => <option key={bookmaker} value={bookmaker}>{bookmaker}</option>)}
                    </select>
                    <select
                      onChange={event => {
                        if (event.target.value === "__add_source__") {
                          setSourcePopupOpen(true);
                          return;
                        }
                        setCouponDraft(current => ({ ...current, sourceId: event.target.value }));
                      }}
                      value={couponDraft.sourceId}
                    >
                      <option value="">— выберите источник —</option>
                      <option value="__add_source__">+ Добавить источник</option>
                      {sources.filter(source => !source.is_blacklisted).map(source => (
                        <option key={source.id} value={source.id}>{source.name}</option>
                      ))}
                    </select>
                    <input
                      inputMode="decimal"
                      onChange={event => setCouponDraft(current => ({ ...current, stake: event.target.value }))}
                      placeholder="Ставка ₽"
                      value={couponDraft.stake}
                    />
                    <input
                      inputMode="decimal"
                      onChange={event => setCouponDraft(current => ({ ...current, freebet: event.target.value }))}
                      placeholder="Фрибет"
                      value={couponDraft.freebet}
                    />
                  </div>

                  <div className="coupon-summary">
                    <div>
                      <span>{couponItems.length === 1 ? "Одиночная ставка" : `Экспресс · ${couponItems.length} события`}</span>
                      <strong>{couponTotalOdds > 1 ? `× ${couponTotalOdds.toFixed(2)}` : "—"}</strong>
                    </div>
                    <div>
                      <span>Возможный выигрыш</span>
                      <strong>{couponPotentialWin > 0 ? formatMoney(couponPotentialWin) : "—"}</strong>
                    </div>
                  </div>

                  <div className="coupon-actions">
                    <button onClick={() => setCouponItems([])} type="button">Очистить</button>
                    <button disabled={dataLoading} onClick={saveCoupon} type="button">Сохранить прогноз</button>
                  </div>

                  {sourcePopupOpen ? (
                    <div className="coupon-source-popover" role="dialog" aria-label="Добавить источник">
                      <form className="coupon-source-form" onSubmit={handleCouponSourceSubmit}>
                        <div className="bank-modal-head">
                          <strong>Добавить источник</strong>
                          <button
                            aria-label="Закрыть"
                            onClick={() => setSourcePopupOpen(false)}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          autoFocus
                          onChange={event => setSourceName(event.target.value)}
                          placeholder="Название источника"
                          value={sourceName}
                        />
                        <div className="bank-modal-actions">
                          <button onClick={() => setSourcePopupOpen(false)} type="button">Отмена</button>
                          <button disabled={dataLoading} type="submit">Добавить</button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="rail-panel bank-panel">
              <div className="bank-head">
                <strong>💰 Банк</strong>
                <button type="button">↺ Сброс</button>
              </div>
              <div className="bank-stats">
                <div><span>Ставок</span><strong>{betStats.total}</strong></div>
                <div><span>Выиграно</span><strong>{bets.filter(bet => bet.result === "win").length}</strong></div>
                <div><span>Проиграно</span><strong>{bets.filter(bet => bet.result === "loss").length}</strong></div>
              </div>
              <div className="bank-balance">
                <div>
                  <span>Баланс</span>
                  <strong>{formatMoney(displayedBalance)}</strong>
                </div>
                <div className="bank-actions">
                  <button
                    aria-label="Пополнить банк"
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
                    aria-label="Вывести из банка"
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
              {bets.length ? (
                <div className="bank-bet-list">
                  {bets.slice(0, 5).map(bet => {
                    const sourceName = bet.source_id ? sourceById.get(bet.source_id)?.name : "";

                    return (
                      <div className="bank-bet-row" key={bet.id}>
                        <strong>{bet.event_name}</strong>
                        <span>{bet.bookmaker || "—"}</span>
                        <em>{sourceName || "—"}</em>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {bankEditorOpen ? (
                <div className="bank-modal-backdrop" role="presentation">
                  <form className="bank-modal" onSubmit={handleBankrollSubmit}>
                    <div className="bank-modal-head">
                      <strong>{bankrollForm.kind === "withdrawal" ? "Вывод от букмекера" : "Пополнение букмекера"}</strong>
                      <button
                        aria-label="Закрыть"
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
                      placeholder="Сумма"
                      value={bankrollForm.amount}
                    />
                    <div className="bank-modal-actions">
                      <button onClick={() => setBankEditorOpen(false)} type="button">Отмена</button>
                      <button disabled={dataLoading} type="submit">Сохранить</button>
                    </div>
                  </form>
                </div>
              ) : null}
              {pendingRailBets.length ? (
                <div className="bank-pending-list" aria-label="Ожидающие ставки">
                  {pendingRailBets.map(bet => {
                    const sourceName = bet.source_id ? sourceById.get(bet.source_id)?.name : "";

                    return (
                      <div className="bank-pending-card" key={bet.id}>
                        <strong>{formatEventName(bet.event_name)}</strong>
                        <div className="bank-pending-meta">
                          <span>{bet.bookmaker || "БК —"}</span>
                          <em>{sourceDisplayName(sourceName)}</em>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="rail-panel stats-entry-panel">
              <button
                className="bank-stat-button"
                onClick={() => setStatsOpen(current => !current)}
                type="button"
              >
                📊 Статистика
              </button>
            </section>

            {statsOpen ? <section className="rail-panel stats-panel">
              <div className="rail-title">Статистика</div>
              <div className="rail-stat-grid">
                <div><span>Средний кэф</span><strong>{betStats.avgOdds.toFixed(2)}</strong></div>
                <div><span>Закрыто</span><strong>{betStats.closed}</strong></div>
                <div><span>Ожидают</span><strong>{betStats.pending}</strong></div>
                <div><span>P&L</span><strong>{formatMoney(betStats.profit)}</strong></div>
              </div>

              <div className="stats-block">
                <div className="stats-block-head">
                  <strong>Источники</strong>
                  <span>{sourceStats.length}</span>
                </div>
                <div className="source-stat-list">
                  {sourceStats.length ? sourceStats.map(source => (
                    <article className={"source-stat-card " + (source.is_blacklisted ? "blacklisted" : "")} key={source.id}>
                      <div className="source-stat-top">
                        <strong>{source.name}</strong>
                        <span>ROI {source.roi >= 0 ? "+" : ""}{source.roi.toFixed(1)}%</span>
                      </div>
                      <div className="source-stat-grid">
                        <div><span>Ставок</span><strong>{source.bets}</strong></div>
                        <div><span>В/П</span><strong>{source.wins}/{source.losses}</strong></div>
                        <div><span>Сумма</span><strong>{formatMoney(source.stake)}</strong></div>
                        <div><span>P&L</span><strong>{formatMoney(source.profit)}</strong></div>
                      </div>
                    </article>
                  )) : <span className="empty">Источники появятся после ставок.</span>}
                </div>
              </div>

              <div className="stats-block">
                <div className="stats-block-head">
                  <strong>Матчи</strong>
                  <span>{bets.length}</span>
                </div>
                <div className="bets-table rail-bets">
                  {bets.slice(0, 30).map(bet => {
                    const sourceName = bet.source_id ? sourceById.get(bet.source_id)?.name : "";
                    const profit = betProfitValue(bet);

                    return (
                      <div className="rail-bet-card" key={bet.id}>
                        <div className="rail-bet-main">
                          <strong>{formatEventName(bet.event_name)}</strong>
                          <span>{bet.market} · {bet.selection} · {formatMoney(Number(bet.stake || 0))} · ×{Number(bet.odds).toFixed(2)}</span>
                        </div>
                        <div className="rail-bet-meta">
                          <span>{bet.bookmaker || "БК —"}</span>
                          <em>{sourceDisplayName(sourceName)}</em>
                          <strong className={"result-pill " + bet.result}>
                            {resultLabel(bet.result)}
                            {bet.result !== "pending" ? " · " + formatMoney(profit) : ""}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                  {!bets.length ? <span className="empty">Ставки появятся после сохранения прогноза.</span> : null}
                </div>
              </div>
            </section> : null}

            {calendarDateOpen ? (
              <div className="calendar-bets-backdrop" role="presentation">
                <section className="calendar-bets-modal" role="dialog" aria-modal="true" aria-label="Ставки за день">
                  <div className="calendar-bets-head">
                    <div>
                      <span>Ставки за день</span>
                      <strong>{formatCalendarDateLabel(calendarDateOpen)}</strong>
                    </div>
                    <button
                      aria-label="Закрыть"
                      onClick={() => setCalendarDateOpen(null)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>

                  {calendarBets.length ? (
                    <div className="calendar-bets-list">
                      {calendarBets.map(bet => {
                        const sourceName = bet.source_id ? sourceById.get(bet.source_id)?.name : "";
                        const stake = Number(bet.stake || 0);
                        const odds = Number(bet.odds || 0);

                        return (
                          <article className={`calendar-bet-card ${bet.result}`} key={bet.id}>
                            <div className="calendar-bet-main">
                              <strong>{bet.event_name}</strong>
                              <span>{bet.market} · {bet.selection} · ×{odds.toFixed(2)}</span>
                            </div>
                            <div className="calendar-bet-meta">
                              <span>{formatMoney(stake)}</span>
                              <span>{bet.bookmaker || "БК не указан"}</span>
                              <span>{sourceName || "Источник не указан"}</span>
                            </div>
                            {bet.result === "pending" ? (
                              <div className="calendar-bet-actions">
                                <button disabled={dataLoading} onClick={() => settleBet(bet, "win")} type="button">Выигрыш</button>
                                <button disabled={dataLoading} onClick={() => settleBet(bet, "loss")} type="button">Проигрыш</button>
                                <button disabled={dataLoading} onClick={() => settleBet(bet, "return")} type="button">Возврат</button>
                              </div>
                            ) : (
                              <div className="calendar-bet-result">
                                {bet.result === "win" ? "Выигрыш" : bet.result === "loss" ? "Проигрыш" : "Возврат"}
                                <strong>{formatMoney(Number(bet.profit || 0))}</strong>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="calendar-bets-empty">В этот день ставок нет.</div>
                  )}
                </section>
              </div>
            ) : null}
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Stakeversee</div>
        <div className="brand-caption">control · optimize · profit</div>
        <nav className="nav" aria-label="Основная навигация">
          <button className="active">Панель</button>
          <button>Ставки</button>
          <button>Источники</button>
          <button>Банкролл</button>
          <button>AI анализ</button>
        </nav>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="supabase-ok">
            <span className="status-dot" />
            Supabase подключён: {supabaseHost}
          </div>
        </header>

        <div className="content">
          <section className="hero">
            <div className="panel hero-copy">
              <div className="eyebrow">Betting command center</div>
              <h1>Stakeversee держит ставки, банк и аналитику под контролем.</h1>
              <p className="lead">
                Веб-версия заменит локальное расширение: аккаунты, история ставок,
                источники, чёрный список, банк и статистика будут храниться онлайн.
              </p>
              <div className="actions">
                <a className="primary link-button" href="https://stakeversee.vercel.app">
                  Production
                </a>
                <button className="secondary">Схема базы готова</button>
              </div>
            </div>

            <section className="panel auth-panel" aria-label="Авторизация">
              <>
                  <div className="auth-tabs">
                    <button
                      className={mode === "login" ? "active" : ""}
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      Вход
                    </button>
                    <button
                      className={mode === "register" ? "active" : ""}
                      onClick={() => setMode("register")}
                      type="button"
                    >
                      Регистрация
                    </button>
                  </div>

                  <form className="auth-form" onSubmit={handleAuth}>
                    {mode === "register" ? (
                      <label>
                        Имя
                        <input
                          autoComplete="name"
                          onChange={event => setDisplayName(event.target.value)}
                          placeholder="Семик"
                          value={displayName}
                        />
                      </label>
                    ) : null}

                    <label>
                      Email
                      <input
                        autoComplete="email"
                        onChange={event => setEmail(event.target.value)}
                        placeholder="you@mail.com"
                        type="email"
                        value={email}
                      />
                    </label>

                    <label>
                      Пароль
                      <input
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={6}
                        onChange={event => setPassword(event.target.value)}
                        placeholder="минимум 6 символов"
                        type="password"
                        value={password}
                      />
                    </label>

                    <button className="primary" disabled={status === "loading"} type="submit">
                      {status === "loading"
                        ? "Подождите..."
                        : mode === "login"
                          ? "Войти"
                          : "Создать аккаунт"}
                    </button>

                    {message ? <p className={`auth-message ${status}`}>{message}</p> : null}
                  </form>
              </>
            </section>
          </section>
          <section className="section-grid">
            {features.map(feature => (
              <article className="panel feature" key={feature.title}>
                <h2>{feature.title}</h2>
                <p>{feature.text}</p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
