"use client";

import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
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
  extra_source_ids: string[] | null;
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

// Все источники, прикреплённые к ставке (основной + дополнительные), без дублей.
// Результат ставки (выигрыш/проигрыш/возврат) учитывается ПОЛНОСТЬЮ в статистике
// КАЖДОГО из этих источников - сумма не делится между ними.
function getBetSourceIds(bet: BetRow): string[] {
  const ids = [bet.source_id, ...(bet.extra_source_ids || [])].filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}

function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —")
    .replace(/\s*(?:\.{2,}|…|â€¦)\s*$/g, "")
    .trim();
  return name || "Источник —";
}

function resultLabel(result: BetRow["result"]): string {
  if (result === "win") return "Выигрыш";
  if (result === "loss") return "Проигрыш";
  if (result === "return") return "Возврат";
  return "Ожидает";
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

const SPORT_ICON_BY_KEY: Record<string, string> = Object.fromEntries(
  sportTabs.filter(tab => tab.key !== "all").map(tab => [tab.key, tab.icon])
);

function getSportIcon(sport: string): string {
  return SPORT_ICON_BY_KEY[sport] ?? "🏆";
}

function getSportLabel(sport: string): string {
  const tab = sportTabs.find(t => t.key === sport);
  return tab ? tab.label : sport;
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
  "Taiwan": "🇹🇼", "Тайвань": "🇹🇼", "TW": "🇹🇼",
  "World": "🌍", "WORLD": "🌍", "INT": "🌍", "International": "🌍",
  "ATP": "🎾", "WTA": "🎾", "ITF": "🎾",
  "Europe": "🇪🇺", "UEFA": "🇪🇺",
};

function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? COUNTRY_FLAGS[country.toUpperCase()] ?? "🌐";
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
  "Belarus": "Беларусь", "Thailand": "Таиланд", "India": "Индия",
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
};

function getCountryLabel(country: string): string {
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
    .reduce((sum, bet) => sum + Number(bet.profit || 0), 0);
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

type SourceDropdownProps = {
  onAddSource: () => void;
  onChange: (sourceId: string) => void;
  placeholder?: string;
  roiById: Map<string, number>;
  sources: SourceRow[];
  value: string;
};

function SourceDropdownField({ onAddSource, onChange, placeholder, roiById, sources, value }: SourceDropdownProps) {
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

  const selected = sources.find(source => source.id === value);
  const selectedRoi = selected ? roiById.get(selected.id) : undefined;

  return (
    <div className="source-dropdown" ref={rootRef}>
      <button
        className="source-dropdown-trigger"
        onClick={() => setOpen(current => !current)}
        type="button"
      >
        <span className="source-dropdown-trigger-label">
          {selected ? selected.name : (placeholder || "— выберите источник —")}
        </span>
        {selected && selectedRoi !== undefined ? (
          <span className={`source-dropdown-roi ${selectedRoi >= 0 ? "positive" : "negative"}`}>
            {selectedRoi >= 0 ? "+" : ""}{selectedRoi.toFixed(1)}%
          </span>
        ) : null}
        <span className="source-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="source-dropdown-menu" role="listbox">
          <button
            className="source-dropdown-item add-source"
            onClick={() => {
              onAddSource();
              setOpen(false);
            }}
            type="button"
          >
            + Добавить источник
          </button>
          {sources.map(source => {
            const roi = roiById.get(source.id);
            return (
              <button
                className={`source-dropdown-item ${source.id === value ? "active" : ""}`}
                key={source.id}
                onClick={() => {
                  onChange(source.id);
                  setOpen(false);
                }}
                role="option"
                aria-selected={source.id === value}
                type="button"
              >
                <span className="source-dropdown-item-label">{source.name}</span>
                {roi !== undefined ? (
                  <span className={`source-dropdown-roi ${roi >= 0 ? "positive" : "negative"}`}>
                    {roi >= 0 ? "+" : ""}{roi.toFixed(1)}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type FilterOption = {
  count?: number;
  flag?: string;
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
          {selected ? `${selected.flag ? selected.flag + " " : ""}${selected.label}` : `${placeholderIcon} ${placeholderLabel}`}
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
                {option.flag ? `${option.flag} ` : ""}{option.label}
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
          {value || (placeholder || "— выберите букмекера —")}
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
              <span className="source-dropdown-item-label">{bookmaker}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type EditBetForm = {
  event_name: string;
  bookmaker: string;
  odds: string;
  stake: string;
};

type BetCardProps = {
  bet: BetRow;
  dataLoading: boolean;
  editForm: EditBetForm | null;
  editingBetId: string | null;
  extraMeta?: string;
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
};

function BetCard({
  bet,
  dataLoading,
  editForm,
  editingBetId,
  extraMeta,
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
  sourcePickerOpen
}: BetCardProps) {
  const stake = Number(bet.stake || 0);
  const odds = Number(bet.odds || 0);
  const isEditing = editingBetId === bet.id && !!editForm;
  const cardRef = useRef<HTMLElement | null>(null);
  const attachedSourceIds = getBetSourceIds(bet);
  const pickableSources = sourceOptions.filter(source => !attachedSourceIds.includes(source.id));

  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <article className={`calendar-bet-card ${bet.result} ${highlighted ? "highlighted" : ""}`} ref={cardRef}>
      <button
        className="calendar-bet-edit-btn"
        onClick={() => (isEditing ? onCancelEdit() : onStartEdit(bet))}
        title={isEditing ? "Отменить редактирование" : "Редактировать прогноз"}
        type="button"
      >
        {isEditing ? "✕" : "✏️"}
      </button>

      {isEditing && editForm ? (
        <div className="calendar-bet-edit-form">
          <input
            onChange={event => {
              const nextValue = event.target.value;
              setEditForm(current => (current ? { ...current, event_name: nextValue } : current));
            }}
            placeholder="Матч"
            value={editForm.event_name}
          />
          <div className="calendar-bet-edit-row">
            <input
              inputMode="decimal"
              onChange={event => {
                const nextValue = event.target.value;
                setEditForm(current => (current ? { ...current, odds: nextValue } : current));
              }}
              placeholder="Коэффициент"
              value={editForm.odds}
            />
            <input
              inputMode="decimal"
              onChange={event => {
                const nextValue = event.target.value;
                setEditForm(current => (current ? { ...current, stake: nextValue } : current));
              }}
              placeholder="Сумма ₽"
              value={editForm.stake}
            />
          </div>
          <BookmakerDropdownField
            onChange={bookmaker => setEditForm(current => (current ? { ...current, bookmaker } : current))}
            options={bookmakerOptions}
            placeholder="Букмекер"
            value={editForm.bookmaker}
          />
          <div className="calendar-bet-edit-actions">
            <button disabled={dataLoading} onClick={onCancelEdit} type="button">Отмена</button>
            <button disabled={dataLoading} onClick={onSaveEdit} type="button">Сохранить</button>
          </div>
        </div>
      ) : (
        <>
          <div className="calendar-bet-main">
            <strong>{formatEventName(bet.event_name)}</strong>
            <span>{bet.market} · {bet.selection} · ×{odds.toFixed(2)}</span>
          </div>
          <div className="calendar-bet-meta">
            {extraMeta ? <span>{extraMeta}</span> : null}
            <span>{formatMoney(stake)}</span>
            <span>{bet.bookmaker || "БК не указан"}</span>
          </div>
          <div className="calendar-bet-sources">
            {attachedSourceIds.length ? attachedSourceIds.map(sourceId => (
              <span className="calendar-bet-source-tag" key={sourceId}>
                {sourceDisplayName(sourceById.get(sourceId)?.name)}
                <button
                  aria-label="Убрать источник"
                  onClick={() => onRemoveSource(sourceId)}
                  type="button"
                >
                  ✕
                </button>
              </span>
            )) : <span className="calendar-bet-source-tag empty">Без источника</span>}

            <div className="calendar-bet-source-add">
              <button
                aria-label="Добавить источник"
                className="calendar-bet-add-source-btn"
                onClick={onToggleSourcePicker}
                title="Добавить ещё один источник"
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
                  )) : <span className="empty">Больше источников нет</span>}
                </div>
              ) : null}
            </div>
          </div>
          {bet.result === "pending" ? (
            <div className="calendar-bet-actions">
              <button disabled={dataLoading} onClick={() => onSettle(bet, "win")} type="button">Выигрыш</button>
              <button disabled={dataLoading} onClick={() => onSettle(bet, "loss")} type="button">Проигрыш</button>
              <button disabled={dataLoading} onClick={() => onSettle(bet, "return")} type="button">Возврат</button>
            </div>
          ) : (
            <div className="calendar-bet-result">
              {bet.result === "win" ? "Выигрыш" : bet.result === "loss" ? "Проигрыш" : "Возврат"}
              <strong>{formatMoney(Number(bet.profit || 0))}</strong>
            </div>
          )}
        </>
      )}
    </article>
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
  const [sourceBetsOpen, setSourceBetsOpen] = useState<string | null>(null);
  const [editingBetId, setEditingBetId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditBetForm | null>(null);
  const [highlightBetId, setHighlightBetId] = useState<string | null>(null);
  const [sourcePickerForBetId, setSourcePickerForBetId] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("all");
  const [leagueFilter, setLeagueFilter] = useState("all");
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
    const normalizedEvents = Array.from(bankrollEvents.reduce((map, event) => {
      const isBetSettlement = Boolean(event.bet_id) && ["win", "loss", "return"].includes(event.kind);
      map.set(isBetSettlement ? "bet:" + event.bet_id : "event:" + event.id, event);
      return map;
    }, new Map<string, BankrollEventRow>()).values());

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
        events.set(event.bet_id, event);
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
      avgStake: number;
      bets: number;
      id: string;
      is_blacklisted: boolean;
      losses: number;
      name: string;
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
        avgStake: 0,
        bets: 0,
        id,
        is_blacklisted: isBlacklisted,
        losses: 0,
        name: sourceDisplayName(name || "Без источника"),
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
        stat.bets += 1;
        stat.stake += Number(bet.stake || 0);
        stat.profit += betProfitValue(bet);

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
          avgStake: stat.bets ? stat.stake / stat.bets : 0,
          roi: stat.stake ? (stat.profit / stat.stake) * 100 : 0,
          winrate: winLossTotal ? (stat.wins / winLossTotal) * 100 : 0
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
  }, [settledBets, sources]);

  const bookmakerStats = useMemo(() => {
    const grouped = new Map<string, {
      avgStake: number;
      bets: number;
      id: string;
      losses: number;
      name: string;
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
        avgStake: 0,
        bets: 0,
        id: name,
        losses: 0,
        name,
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
      stat.stake += Number(bet.stake || 0);
      stat.profit += betProfitValue(bet);

      if (bet.result === "win") stat.wins += 1;
      if (bet.result === "loss") stat.losses += 1;
      if (bet.result === "return") stat.returns += 1;
    }

    return Array.from(grouped.values())
      .map(stat => {
        const winLossTotal = stat.wins + stat.losses;
        return {
          ...stat,
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

  const sourceRoiById = useMemo(
    () => new Map(sourceStats.map(stat => [stat.id, stat.roi])),
    [sourceStats]
  );

  const activeMatches = useMemo(() => {
    const queryGroups = searchTokenGroups(searchQuery);
    const upcomingMatches = getUpcomingMatches(lineMatches);

    return upcomingMatches.filter(match => {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const countryOk = countryFilter === "all" || match.country === countryFilter;
      const leagueOk = leagueFilter === "all" || match.league === leagueFilter;
      const haystack = searchHaystack(match.home, match.away, match.league, match.country);
      const searchOk =
        !queryGroups.length ||
        queryGroups.every(group => group.some(token => haystack.includes(token)));

      return sportOk && countryOk && leagueOk && searchOk;
    });
  }, [activeSport, countryFilter, leagueFilter, lineMatches, searchQuery]);

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

  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of getUpcomingMatches(lineMatches)) {
      const c = match.country;
      if (c) counts.set(c, (counts.get(c) || 0) + 1);
    }
    return counts;
  }, [lineMatches]);

  const leagueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of getUpcomingMatches(lineMatches)) {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const countryOk = countryFilter === "all" || match.country === countryFilter;
      if (!sportOk || !countryOk) continue;
      const l = match.league;
      if (l) counts.set(l, (counts.get(l) || 0) + 1);
    }
    return counts;
  }, [activeSport, countryFilter, lineMatches]);

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
        .select("id,source_id,extra_source_ids,event_name,sport,bookmaker,market,selection,odds,stake,result,profit,settled_at,created_at")
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
        amount: profit,
        kind: result,
        note: `${bet.event_name} · ${bet.market} · ${bet.selection}`
      });

      if (bankrollError) {
        setDataMessage(bankrollError.message);
      } else {
        const localSettlementEvent: BankrollEventRow = {
          id: `local-${bet.id}-${settledAt}`,
          bet_id: bet.id,
          amount: profit,
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
    setEditingBetId(bet.id);
    setEditForm({
      event_name: formatEventName(bet.event_name),
      bookmaker: bet.bookmaker || "",
      odds: String(bet.odds ?? ""),
      stake: String(bet.stake ?? "")
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
    const stake = parseFloat(editForm.stake.replace(",", ".")) || 0;
    const eventName = editForm.event_name.trim() || bet.event_name;
    const bookmaker = editForm.bookmaker.trim();

    if (odds <= 0 || stake < 0) {
      setDataMessage("Проверь коэффициент и сумму ставки.");
      return;
    }

    setDataLoading(true);

    const payload: {
      event_name: string;
      bookmaker: string | null;
      odds: number;
      stake: number;
      profit?: number;
    } = {
      event_name: eventName,
      bookmaker: bookmaker || null,
      odds,
      stake
    };

    // Ставка уже рассчитана - пересчитываем выплату под новые кэф/сумму
    if (bet.result === "win") payload.profit = stake * odds - stake;
    else if (bet.result === "loss") payload.profit = -stake;
    else if (bet.result === "return") payload.profit = 0;

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
      setEditingBetId(null);
      setEditForm(null);
      await loadWorkspaceData(user.id);
    }

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
    const payload: { source_id?: string; extra_source_ids?: string[] } = !bet.source_id
      ? { source_id: sourceId }
      : { extra_source_ids: [...(bet.extra_source_ids || []), sourceId] };

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

    let payload: { source_id?: string | null; extra_source_ids?: string[] };
    if (bet.source_id === sourceId) {
      // Основной источник убирают - продвигаем первый дополнительный на его место
      const extras = bet.extra_source_ids || [];
      payload = { source_id: extras[0] || null, extra_source_ids: extras.slice(1) };
    } else {
      payload = { extra_source_ids: (bet.extra_source_ids || []).filter(id => id !== sourceId) };
    }

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

  if (user) {
    const userName = user.user_metadata?.display_name || user.email?.split("@")[0] || "Игрок";
    const shownMatches = activeMatches;
    const displayedBalance = BASE_BANKROLL + bankrollStats.balance;
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
                <MatchFilterDropdown
                  onChange={value => { setCountryFilter(value); setLeagueFilter("all"); }}
                  options={Array.from(countryCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([country, count]) => ({
                      count,
                      flag: getCountryFlag(country),
                      label: getCountryLabel(country),
                      value: country
                    }))}
                  placeholderIcon="🌍"
                  placeholderLabel="Все страны"
                  value={countryFilter}
                />
              </label>
              <label>
                <span>Лига:</span>
                <MatchFilterDropdown
                  onChange={setLeagueFilter}
                  options={Array.from(leagueCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([league, count]) => ({ count, label: league, value: league }))}
                  placeholderIcon="🏆"
                  placeholderLabel="Все лиги"
                  value={leagueFilter}
                />
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
                className="match-search-input"
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="🔍 Поиск..."
                spellCheck={false}
                value={searchQuery}
              />
            </div>

            <div className="matches-area">
              {shownMatches.length ? (
                shownMatches.map(match => (
                  <article className={`match-card ${couponItems.some(item => item.matchId === match.id) ? "in-coupon" : ""}`} key={match.id}>
                    <div className="match-meta">
                      <span>{getCountryFlag(match.country)} {getCountryLabel(match.country)}</span>
                      <span className="match-meta-sport" title={getSportLabel(match.sport)}>{getSportIcon(match.sport)} {getSportLabel(match.sport)}</span>
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
                  <SourceDropdownField
                    onAddSource={() => setSourcePopupOpen(true)}
                    onChange={sourceId => setBetForm(current => ({ ...current, sourceId }))}
                    placeholder="Источник"
                    roiById={sourceRoiById}
                    sources={sources.filter(source => !source.is_blacklisted)}
                    value={betForm.sourceId}
                  />
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
                      {dayProfit !== 0 ? <small>{dayProfit > 0 ? "+" : ""}{dayProfit}{"\u20bd"}</small> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {couponOpen || couponItems.length ? (
              <section className="quick-coupon-card open">
                <button className="coupon-head" onClick={() => setCouponOpen(current => !current)} type="button">
                  <span>🎫 Купон</span>
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
                    <SourceDropdownField
                      onAddSource={() => setSourcePopupOpen(true)}
                      onChange={sourceId => setCouponDraft(current => ({ ...current, sourceId }))}
                      roiById={sourceRoiById}
                      sources={sources.filter(source => !source.is_blacklisted)}
                      value={couponDraft.sourceId}
                    />
                    <BookmakerDropdownField
                      onChange={bookmaker => setCouponDraft(current => ({ ...current, bookmaker }))}
                      options={bookmakerOptions}
                      value={couponDraft.bookmaker}
                    />
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
              </section>
            ) : null}

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
              {pendingRailBets.length ? (
                <div className="bank-bet-list">
                  {pendingRailBets.map(bet => {
                    const sourceNames = getBetSourceIds(bet).map(id => sourceDisplayName(sourceById.get(id)?.name));
                    const sourceLabel = sourceNames.length ? sourceNames.join(" + ") : "Без источника";

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
                        <strong>{formatEventName(bet.event_name)}</strong>
                        <span>{bet.bookmaker || "\u2014"}</span>
                        <em>{sourceLabel}</em>
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
            </section>

            <section className="rail-panel stats-entry-panel">
              <button
                className="bank-stat-button"
                onClick={() => setStatsOpen(true)}
                type="button"
              >
                📊 Статистика
              </button>
            </section>

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
                          sourceOptions={sources.filter(source => !source.is_blacklisted)}
                          sourcePickerOpen={sourcePickerForBetId === bet.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="calendar-bets-empty">В этот день ставок нет.</div>
                  )}
                </section>
              </div>
            ) : null}
          </aside>

          {statsOpen ? (
            <div className="stats-modal-backdrop" onMouseDown={() => setStatsOpen(false)} role="presentation">
              <section
                aria-label="Статистика источников"
                aria-modal="true"
                className="rail-panel stats-panel"
                onMouseDown={event => event.stopPropagation()}
                role="dialog"
              >
                <div className="rail-title">Статистика источников</div>
                <button className="stats-modal-close" aria-label="Закрыть статистику" onClick={() => setStatsOpen(false)} type="button">×</button>
                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>Рассчитанные ставки</strong>
                    <span>{settledBets.length}</span>
                  </div>
                  <div className="source-stat-list">
                    {sourceStats.length ? sourceStats.map(source => (
                      <article className={`source-stat-card ${source.is_blacklisted ? "blacklisted" : ""}`} key={source.id}>
                        <div className="source-stat-top">
                          <strong>{source.name}</strong>
                          <span className={source.roi >= 0 ? "roi-positive" : "roi-negative"}>ROI {source.roi >= 0 ? "+" : ""}{source.roi.toFixed(1)}%</span>
                        </div>
                        <div className="source-stat-grid">
                          <div><span>Ставок</span><strong>{source.bets}</strong></div>
                          <div><span>В/П</span><strong>{source.wins}/{source.losses}</strong></div>
                          <div><span>Winrate</span><strong>{source.winrate.toFixed(0)}%</strong></div>
                          <div><span>Возврат</span><strong>{source.returns}</strong></div>
                          <div><span>Сумма</span><strong>{formatMoney(source.stake)}</strong></div>
                          <div><span>Средняя</span><strong>{formatMoney(source.avgStake)}</strong></div>
                        </div>
                        <button
                          className="source-stat-view-button"
                          onClick={() => setSourceBetsOpen(source.id)}
                          type="button"
                        >
                          Все прогнозы
                        </button>
                      </article>
                    )) : <span className="empty">Рассчитанные ставки появятся здесь после выигрыша, проигрыша или возврата.</span>}
                  </div>
                </div>

                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>Статистика по букмекерам</strong>
                    <span>{bookmakerStats.length}</span>
                  </div>
                  <div className="source-stat-list">
                    {bookmakerStats.length ? bookmakerStats.map(bookmaker => (
                      <article className="source-stat-card" key={bookmaker.id}>
                        <div className="source-stat-top">
                          <strong>{bookmaker.name}</strong>
                          <span className={bookmaker.roi >= 0 ? "roi-positive" : "roi-negative"}>ROI {bookmaker.roi >= 0 ? "+" : ""}{bookmaker.roi.toFixed(1)}%</span>
                        </div>
                        <div className="source-stat-grid">
                          <div><span>Ставок</span><strong>{bookmaker.bets}</strong></div>
                          <div><span>В/П</span><strong>{bookmaker.wins}/{bookmaker.losses}</strong></div>
                          <div><span>Winrate</span><strong>{bookmaker.winrate.toFixed(0)}%</strong></div>
                          <div><span>Возврат</span><strong>{bookmaker.returns}</strong></div>
                          <div><span>Сумма</span><strong>{formatMoney(bookmaker.stake)}</strong></div>
                          <div><span>Прибыль</span><strong className={bookmaker.profit >= 0 ? "roi-positive-text" : "roi-negative-text"}>{formatMoney(bookmaker.profit)}</strong></div>
                        </div>
                      </article>
                    )) : <span className="empty">Рассчитанные ставки появятся здесь после выигрыша, проигрыша или возврата.</span>}
                  </div>
                </div>

                <div className="stats-block">
                  <div className="stats-block-head">
                    <strong>Пополнения и выводы</strong>
                    <span>{bankrollAdjustments.length}</span>
                  </div>
                  <div className="bankroll-summary-grid">
                    <div>
                      <span>Пополнено</span>
                      <strong className="roi-positive-text">{formatMoney(bankrollStats.deposits)}</strong>
                    </div>
                    <div>
                      <span>Выведено</span>
                      <strong className="roi-negative-text">{formatMoney(bankrollStats.withdrawals)}</strong>
                    </div>
                    <div>
                      <span>Итого</span>
                      <strong className={bankrollStats.deposits - bankrollStats.withdrawals >= 0 ? "roi-positive-text" : "roi-negative-text"}>
                        {formatMoney(bankrollStats.deposits - bankrollStats.withdrawals)}
                      </strong>
                    </div>
                  </div>
                  <div className="bankroll-adjustments-list">
                    {bankrollAdjustments.length ? bankrollAdjustments.map(event => (
                      <div className="bankroll-adjustment-row" key={event.id}>
                        <span className="bankroll-adjustment-date">
                          {new Date(event.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        <span className="bankroll-adjustment-note">{event.note || (event.kind === "deposit" ? "Пополнение" : "Вывод")}</span>
                        <strong className={event.kind === "deposit" ? "roi-positive-text" : "roi-negative-text"}>
                          {event.kind === "deposit" ? "+" : ""}{formatMoney(Number(event.amount || 0))}
                        </strong>
                      </div>
                    )) : <span className="empty">Пополнения и выводы появятся здесь после первой операции с балансом.</span>}
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {sourceBetsOpen ? (
            <div className="calendar-bets-backdrop" role="presentation">
              <section className="calendar-bets-modal" role="dialog" aria-modal="true" aria-label="Все прогнозы источника">
                <div className="calendar-bets-head">
                  <div>
                    <span>Все прогнозы</span>
                    <strong>{sourceStats.find(source => source.id === sourceBetsOpen)?.name || "Источник"}</strong>
                  </div>
                  <button
                    aria-label="Закрыть"
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
                          dataLoading={dataLoading}
                          editForm={editForm}
                          editingBetId={editingBetId}
                          extraMeta={formatCalendarDateLabel(betDate)}
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
                          sourceOptions={sources.filter(source => !source.is_blacklisted)}
                          sourcePickerOpen={sourcePickerForBetId === bet.id}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="calendar-bets-empty">У этого источника пока нет прогнозов.</div>
                )}
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
