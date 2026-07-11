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

const demoMatches = [
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

  const [bankrollForm, setBankrollForm] = useState({
    kind: "deposit",
    amount: "",
    note: ""
  });
  const [activeSport, setActiveSport] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  const sourceStats = useMemo(() => {
    return sources.map(source => {
      const sourceBets = bets.filter(bet => bet.source_id === source.id);
      const closed = sourceBets.filter(bet => bet.result !== "pending");
      const profit = closed.reduce((sum, bet) => sum + Number(bet.profit || 0), 0);
      const stake = closed.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);

      return {
        ...source,
        bets: sourceBets.length,
        roi: stake > 0 ? (profit / stake) * 100 : 0
      };
    });
  }, [bets, sources]);

  const activeMatches = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return demoMatches.filter(match => {
      const sportOk = activeSport === "all" || match.sport === activeSport;
      const searchOk = !normalizedSearch
        || match.home.toLowerCase().includes(normalizedSearch)
        || match.away.toLowerCase().includes(normalizedSearch)
        || match.league.toLowerCase().includes(normalizedSearch);

      return sportOk && searchOk;
    });
  }, [activeSport, searchQuery]);

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
        .limit(25),
      supabase
        .from("bankroll_events")
        .select("id,bet_id,amount,kind,note,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30)
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
    const shownMatches = activeMatches.length ? activeMatches : demoMatches.filter(match => activeSport === "all" || match.sport === activeSport);
    const displayedBalance = bankrollStats.balance || 10000;

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
              <span>Ожидание</span>
              <strong>{betStats.pending} матчей</strong>
            </div>
            <div className="meter-track">
              <span style={{ width: `${betStats.total ? Math.min(100, Math.round((betStats.closed / betStats.total) * 100)) : 0}%` }} />
            </div>
            <b>{betStats.total ? Math.round((betStats.closed / betStats.total) * 100) : 0}%</b>
          </div>

          <div className="top-actions">
            <button aria-label="Сохранить" className="icon-button" type="button">💾</button>
            <button aria-label="Открыть" className="icon-button" type="button">📁</button>
            <button className="assistant-button" type="button">🤖 Ассистент</button>
            <button className="refresh-button" type="button">↻ Обновить 24ч</button>
            <button className="lang-button active" type="button">RU</button>
            <button className="lang-button" type="button">ENG</button>
            <button className="logout-button" onClick={handleLogout} type="button">Выйти</button>
          </div>
        </header>

        <section className="workspace-grid">
          <div className="match-board">
            <nav className="sport-tabs" aria-label="Виды спорта">
              {sportTabs.map(tab => {
                const count = tab.key === "all" ? bets.length : bets.filter(bet => bet.sport === tab.key).length;
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
                value={searchQuery}
              />
            </div>

            <div className="matches-area">
              {shownMatches.length ? (
                shownMatches.map(match => (
                  <article className="match-card" key={match.id}>
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
                      <b>VS</b>
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
                      <button type="button">+ Добавить в купон</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-board">
                  <strong>Матчи не найдены</strong>
                  <span>Поменяй фильтр или нажми обновить после подключения линии букмекеров.</span>
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
                    className={`${day.muted ? "muted" : ""} ${day.current ? "current" : ""}`}
                    key={day.date.toISOString()}
                    type="button"
                  >
                    {day.day}
                    {day.current ? <small>+{Math.max(0, Math.round(betStats.profit))}₽</small> : null}
                  </button>
                ))}
              </div>
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
                <span>Баланс</span>
                <strong>{formatMoney(displayedBalance)}</strong>
                <em>ROI {betStats.roi >= 0 ? "+" : ""}{betStats.roi.toFixed(1)}%</em>
              </div>
              <form className="rail-bank-form" onSubmit={handleBankrollSubmit}>
                <select
                  onChange={event => setBankrollForm(current => ({ ...current, kind: event.target.value }))}
                  value={bankrollForm.kind}
                >
                  <option value="deposit">Пополнение</option>
                  <option value="withdrawal">Вывод</option>
                  <option value="adjustment">Коррекция</option>
                </select>
                <input
                  inputMode="decimal"
                  onChange={event => setBankrollForm(current => ({ ...current, amount: event.target.value }))}
                  placeholder="Сумма"
                  value={bankrollForm.amount}
                />
                <button disabled={dataLoading} type="submit">Изменить</button>
              </form>
            </section>

            <section className="rail-panel stats-panel">
              <div className="rail-title">Статистика</div>
              <div className="rail-stat-grid">
                <div><span>Средний кэф</span><strong>{betStats.avgOdds.toFixed(2)}</strong></div>
                <div><span>Закрыто</span><strong>{betStats.closed}</strong></div>
                <div><span>Ожидают</span><strong>{betStats.pending}</strong></div>
                <div><span>P&L</span><strong>{formatMoney(betStats.profit)}</strong></div>
              </div>
              <div className="bets-table rail-bets">
                {bets.slice(0, 5).map(bet => (
                  <div className="bet-row" key={bet.id}>
                    <div>
                      <strong>{bet.event_name}</strong>
                      <span>{bet.market} · {bet.selection}</span>
                    </div>
                    <div className="bet-row-meta">
                      <strong>×{Number(bet.odds).toFixed(2)}</strong>
                      {bet.result === "pending" ? (
                        <div className="settle-actions compact">
                          <button disabled={dataLoading} onClick={() => settleBet(bet, "win")} type="button">В</button>
                          <button disabled={dataLoading} onClick={() => settleBet(bet, "loss")} type="button">П</button>
                          <button disabled={dataLoading} onClick={() => settleBet(bet, "return")} type="button">↩</button>
                        </div>
                      ) : <span>{bet.result}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
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
          {user ? (
            <button className="secondary" onClick={handleLogout}>Выйти</button>
          ) : null}
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
              {user ? (
                <div className="account-card">
                  <div className="eyebrow">Аккаунт активен</div>
                  <h2>{user.user_metadata?.display_name || user.email}</h2>
                  <p>Теперь данные можно писать в Supabase и переносить старую логику частями.</p>
                  <div className="account-meta">
                    <span>Email</span>
                    <strong>{user.email}</strong>
                  </div>
                </div>
              ) : (
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
              )}
            </section>
          </section>

          {user ? (
            <section className="dashboard-grid">
              <article className="panel data-section">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Источники</div>
                    <h2>Чёрный список и названия</h2>
                  </div>
                  <span>{sources.length}</span>
                </div>

                <form className="inline-form" onSubmit={handleSourceSubmit}>
                  <input
                    onChange={event => setSourceName(event.target.value)}
                    placeholder="Например: Smart Bet"
                    value={sourceName}
                  />
                  <button className="secondary" disabled={dataLoading} type="submit">Добавить</button>
                </form>

                <div className="source-list">
                  {sources.length ? sources.map(source => (
                    <button
                      className={`source-chip ${source.is_blacklisted ? "blacklisted" : ""}`}
                      key={source.id}
                      onClick={() => toggleSourceBlacklist(source)}
                      type="button"
                    >
                      <span>{source.name}</span>
                      <strong>{source.is_blacklisted ? "blacklist" : "active"}</strong>
                    </button>
                  )) : <p className="empty">Источников пока нет.</p>}
                </div>
              </article>

              <article className="panel data-section">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Статистика</div>
                    <h2>Онлайн-пул ставок</h2>
                  </div>
                  <span>{betStats.total}</span>
                </div>

                <div className="stat-grid">
                  <div><span>Открыто</span><strong>{betStats.pending}</strong></div>
                  <div><span>Закрыто</span><strong>{betStats.closed}</strong></div>
                  <div><span>Средний кэф</span><strong>{betStats.avgOdds.toFixed(2)}</strong></div>
                  <div><span>ROI</span><strong>{betStats.roi.toFixed(1)}%</strong></div>
                </div>
              </article>

              <article className="panel data-section wide">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Банкролл</div>
                    <h2>Баланс и движения денег</h2>
                  </div>
                  <span>{bankrollStats.totalEvents}</span>
                </div>

                <div className="bankroll-layout">
                  <div className="stat-grid bankroll-stat-grid">
                    <div><span>Баланс</span><strong>{bankrollStats.balance.toFixed(0)} ₽</strong></div>
                    <div><span>P&L ставок</span><strong>{bankrollStats.bettingProfit.toFixed(0)} ₽</strong></div>
                    <div><span>Пополнено</span><strong>{bankrollStats.deposits.toFixed(0)} ₽</strong></div>
                    <div><span>Выведено</span><strong>{bankrollStats.withdrawals.toFixed(0)} ₽</strong></div>
                  </div>

                  <form className="bankroll-form" onSubmit={handleBankrollSubmit}>
                    <select
                      onChange={event => setBankrollForm(current => ({ ...current, kind: event.target.value }))}
                      value={bankrollForm.kind}
                    >
                      <option value="deposit">Пополнение</option>
                      <option value="withdrawal">Вывод</option>
                      <option value="adjustment">Корректировка</option>
                    </select>
                    <input
                      inputMode="decimal"
                      onChange={event => setBankrollForm(current => ({ ...current, amount: event.target.value }))}
                      placeholder="Сумма"
                      value={bankrollForm.amount}
                    />
                    <input
                      onChange={event => setBankrollForm(current => ({ ...current, note: event.target.value }))}
                      placeholder="Комментарий"
                      value={bankrollForm.note}
                    />
                    <button className="secondary" disabled={dataLoading} type="submit">Записать</button>
                  </form>

                  <div className="bankroll-events">
                    {bankrollEvents.length ? bankrollEvents.slice(0, 8).map(event => (
                      <div className="bankroll-event" key={event.id}>
                        <div>
                          <strong>{event.kind}</strong>
                          <span>{event.note || new Date(event.created_at).toLocaleString("ru-RU")}</span>
                        </div>
                        <strong className={Number(event.amount) >= 0 ? "money-positive" : "money-negative"}>
                          {Number(event.amount) >= 0 ? "+" : ""}{Number(event.amount).toFixed(0)} ₽
                        </strong>
                      </div>
                    )) : <p className="empty">Движений банка пока нет.</p>}
                  </div>
                </div>
              </article>

              <article className="panel data-section wide">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Новая ставка</div>
                    <h2>Первая запись в Supabase</h2>
                  </div>
                  {dataLoading ? <span>sync</span> : null}
                </div>

                <form className="bet-form" onSubmit={handleBetSubmit}>
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
                  <select
                    onChange={event => setBetForm(current => ({ ...current, sport: event.target.value }))}
                    value={betForm.sport}
                  >
                    <option value="football">Футбол</option>
                    <option value="tennis">Теннис</option>
                    <option value="basketball">Баскетбол</option>
                    <option value="ice-hockey">Хоккей</option>
                    <option value="volleyball">Волейбол</option>
                    <option value="esports">Киберспорт</option>
                    <option value="baseball">Бейсбол</option>
                  </select>
                  <input
                    onChange={event => setBetForm(current => ({ ...current, bookmaker: event.target.value }))}
                    placeholder="Букмекер"
                    value={betForm.bookmaker}
                  />
                  <input
                    onChange={event => setBetForm(current => ({ ...current, market: event.target.value }))}
                    placeholder="Рынок"
                    value={betForm.market}
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
                  <button className="primary" disabled={dataLoading} type="submit">Сохранить ставку</button>
                </form>

                {dataMessage ? <p className="auth-message error">{dataMessage}</p> : null}
              </article>

              <article className="panel data-section wide">
                <div className="section-head">
                  <div>
                    <div className="eyebrow">Последние ставки</div>
                    <h2>Первые 25 записей</h2>
                  </div>
                </div>

                <div className="bets-table">
                  {bets.length ? bets.map(bet => (
                    <div className="bet-row" key={bet.id}>
                      <div>
                        <strong>{bet.event_name}</strong>
                        <span>
                          {sourceById.get(bet.source_id || "")?.name || "Без источника"} · {bet.market} · {bet.selection}
                        </span>
                      </div>
                      <div className="bet-row-meta">
                        <strong>×{Number(bet.odds).toFixed(2)}</strong>
                        <span>{Number(bet.stake).toFixed(0)} ₽ · {bet.result}</span>
                        {bet.result === "pending" ? (
                          <div className="settle-actions">
                            <button disabled={dataLoading} type="button" onClick={() => settleBet(bet, "win")}>Выигрыш</button>
                            <button disabled={dataLoading} type="button" onClick={() => settleBet(bet, "loss")}>Проигрыш</button>
                            <button disabled={dataLoading} type="button" onClick={() => settleBet(bet, "return")}>Возврат</button>
                          </div>
                        ) : (
                          <span className={`result-badge ${bet.result}`}>
                            {bet.result === "win" ? "Выигрыш" : bet.result === "loss" ? "Проигрыш" : "Возврат"}
                            {bet.profit !== null && bet.profit !== undefined ? ` · ${Number(bet.profit).toFixed(0)} ₽` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  )) : <p className="empty">Ставок пока нет.</p>}
                </div>
              </article>
            </section>
          ) : (
            <section className="section-grid">
              {features.map(feature => (
                <article className="panel feature" key={feature.title}>
                  <h2>{feature.title}</h2>
                  <p>{feature.text}</p>
                </article>
              ))}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
