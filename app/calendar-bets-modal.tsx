"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type BetResult = "pending" | "win" | "loss" | "return";

type BetRow = {
  id: string;
  user_id?: string;
  source_id: string | null;
  event_name: string;
  sport: string | null;
  bookmaker: string | null;
  market: string;
  selection: string;
  odds: number | string;
  stake: number | string;
  result: BetResult;
  profit: number | string | null;
  settled_at: string | null;
  created_at: string;
};

type SourceRow = {
  id: string;
  name: string;
};

type DaySummary = {
  profit: number;
  settled: number;
};

const monthNames: Record<string, number> = {
  январь: 0,
  января: 0,
  january: 0,
  февраль: 1,
  февраля: 1,
  february: 1,
  март: 2,
  марта: 2,
  march: 2,
  апрель: 3,
  апреля: 3,
  april: 3,
  май: 4,
  мая: 4,
  may: 4,
  июнь: 5,
  июня: 5,
  june: 5,
  июль: 6,
  июля: 6,
  july: 6,
  август: 7,
  августа: 7,
  august: 7,
  сентябрь: 8,
  сентября: 8,
  september: 8,
  октябрь: 9,
  октября: 9,
  october: 9,
  ноябрь: 10,
  ноября: 10,
  november: 10,
  декабрь: 11,
  декабря: 11,
  december: 11
};

const sportNames: Record<string, string> = {
  football: "Футбол",
  soccer: "Футбол",
  tennis: "Теннис",
  basketball: "Баскетбол",
  baseball: "Бейсбол",
  volleyball: "Волейбол",
  "ice-hockey": "Хоккей",
  hockey: "Хоккей",
  handball: "Гандбол",
  esports: "Киберспорт"
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB"
  }).format(value);
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);

  return { start, end };
}

function getSportName(value: string | null) {
  if (!value) return "Спорт";
  return sportNames[value.toLowerCase()] || value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEventName(value: string) {
  return value
    .replace(/\s+vs\s+/gi, " - ")
    .replace(/\s+v\s+/gi, " - ")
    .replace(/\s+против\s+/gi, " - ")
    .replace(/\s+-\s+/g, " - ")
    .trim();
}

function getBetProfit(bet: BetRow, nextResult = bet.result) {
  const savedProfit = Number(bet.profit || 0);
  if (nextResult !== "pending" && bet.profit !== null && bet.profit !== undefined) return savedProfit;

  const stake = Number(bet.stake || 0);
  const odds = Number(bet.odds || 0);
  if (nextResult === "win") return stake * odds - stake;
  if (nextResult === "loss") return -stake;
  if (nextResult === "return") return 0;
  return 0;
}

function parseCalendarDate(button: HTMLButtonElement) {
  const dayMatch = button.textContent?.match(/\d{1,2}/);
  if (!dayMatch) return null;

  const panel = button.closest(".calendar-panel");
  const header = panel?.querySelector(".calendar-head strong")?.textContent?.toLowerCase() || "";
  const year = Number(header.match(/20\d{2}/)?.[0] || new Date().getFullYear());
  const monthEntry = Object.entries(monthNames).find(([label]) => header.includes(label));
  const month = monthEntry?.[1] ?? new Date().getMonth();

  return new Date(year, month, Number(dayMatch[0]), 12, 0, 0, 0);
}

export function CalendarBetsModal() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({});
  const [daySummary, setDaySummary] = useState<Record<string, DaySummary>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const dateTitle = useMemo(() => selectedDate ? formatDateLabel(selectedDate) : "", [selectedDate]);

  async function loadDaySummary(currentUserId: string) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 1, 0, 0, 0, 0);

    const { data: rows } = await supabase
      .from("bets")
      .select("created_at,result,profit,stake,odds")
      .eq("user_id", currentUserId)
      .neq("result", "pending")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    const summary = ((rows || []) as BetRow[]).reduce<Record<string, DaySummary>>((acc, bet) => {
      const key = formatDateKey(new Date(bet.created_at));
      const current = acc[key] || { profit: 0, settled: 0 };
      current.profit += getBetProfit(bet);
      current.settled += 1;
      acc[key] = current;
      return acc;
    }, {});

    setDaySummary(summary);
  }

  async function loadBets(date: Date) {
    setLoading(true);
    setErrorText("");
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id || null;
    setUserId(currentUserId);

    if (!currentUserId) {
      setBets([]);
      setSourceNames({});
      setDaySummary({});
      setLoading(false);
      return;
    }

    void loadDaySummary(currentUserId);

    const { start, end } = getDayBounds(date);
    const { data: betRows, error } = await supabase
      .from("bets")
      .select("id,source_id,event_name,sport,bookmaker,market,selection,odds,stake,result,profit,settled_at,created_at")
      .eq("user_id", currentUserId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      setErrorText(error.message);
      setBets([]);
      setSourceNames({});
      setLoading(false);
      return;
    }

    const loadedBets = (betRows || []) as BetRow[];
    setBets(loadedBets);

    const sourceIds = Array.from(new Set(loadedBets.map(bet => bet.source_id).filter(Boolean))) as string[];
    if (!sourceIds.length) {
      setSourceNames({});
      setLoading(false);
      return;
    }

    const { data: sourceRows } = await supabase
      .from("sources")
      .select("id,name")
      .in("id", sourceIds);

    const names = ((sourceRows || []) as SourceRow[]).reduce<Record<string, string>>((acc, source) => {
      acc[source.id] = source.name;
      return acc;
    }, {});

    setSourceNames(names);
    setLoading(false);
  }

  async function settleBet(bet: BetRow, result: Exclude<BetResult, "pending">) {
    if (!userId || loading) return;

    setLoading(true);
    setErrorText("");
    const profit = getBetProfit(bet, result);
    const settledAt = new Date().toISOString();

    setBets(current => current.map(item => item.id === bet.id ? { ...item, result, profit, settled_at: settledAt } : item));

    const { error } = await supabase
      .from("bets")
      .update({ result, profit, settled_at: settledAt })
      .eq("id", bet.id)
      .eq("user_id", userId);

    if (error) {
      setErrorText(error.message);
      setBets(current => current.map(item => item.id === bet.id ? bet : item));
      setLoading(false);
      return;
    }

    const { error: bankrollError } = await supabase.from("bankroll_events").insert({
      user_id: userId,
      amount: profit,
      kind: result,
      note: `${formatEventName(bet.event_name)} · ${bet.market} · ${bet.selection}`
    });

    if (bankrollError) setErrorText(bankrollError.message);

    if (selectedDate) await loadBets(selectedDate);
    await loadDaySummary(userId);
    window.dispatchEvent(new CustomEvent("stakeversee:bets-updated"));
    window.dispatchEvent(new CustomEvent("stakeversee:bankroll-updated"));
    setLoading(false);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest(".calendar-grid button") as HTMLButtonElement | null;
      if (!button) return;

      const nextDate = parseCalendarDate(button);
      if (!nextDate) return;

      setSelectedDate(nextDate);
      void loadBets(nextDate);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id || null;
      if (!active || !currentUserId) return;
      setUserId(currentUserId);
      await loadDaySummary(currentUserId);
    }

    void bootstrap();
    const timer = window.setInterval(bootstrap, 15000);
    const onUpdated = () => void bootstrap();
    window.addEventListener("stakeversee:bets-updated", onUpdated);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("stakeversee:bets-updated", onUpdated);
    };
  }, []);

  useEffect(() => {
    const buttons = Array.from(document.querySelectorAll(".calendar-grid button")) as HTMLButtonElement[];

    buttons.forEach(button => {
      button.classList.remove("stakeversee-day-win", "stakeversee-day-loss", "stakeversee-day-even");
      button.querySelector(".calendar-day-profit")?.remove();

      const date = parseCalendarDate(button);
      if (!date) return;

      const summary = daySummary[formatDateKey(date)];
      if (!summary || !summary.settled) return;

      const marker = document.createElement("small");
      marker.className = "calendar-day-profit";
      marker.textContent = formatSignedMoney(summary.profit);
      button.appendChild(marker);

      if (summary.profit > 0) button.classList.add("stakeversee-day-win");
      else if (summary.profit < 0) button.classList.add("stakeversee-day-loss");
      else button.classList.add("stakeversee-day-even");
    });
  }, [daySummary]);

  if (!selectedDate) return null;

  return (
    <div className="calendar-bets-overlay" role="presentation">
      <section aria-label="Ставки за день" aria-modal="true" className="calendar-bets-dialog" role="dialog">
        <header className="calendar-bets-titlebar">
          <div>
            <span>Ставки за день</span>
            <strong>{dateTitle}</strong>
          </div>
          <button aria-label="Закрыть" onClick={() => setSelectedDate(null)} type="button">×</button>
        </header>

        {errorText ? <div className="calendar-bets-error">{errorText}</div> : null}
        {loading && !bets.length ? <div className="calendar-bets-empty">Загрузка ставок...</div> : null}

        {!loading && !bets.length ? <div className="calendar-bets-empty">В этот день ставок нет.</div> : null}

        {bets.length ? (
          <div className="calendar-bets-list">
            {bets.map(bet => {
              const stake = Number(bet.stake || 0);
              const odds = Number(bet.odds || 0);
              const sourceName = bet.source_id ? sourceNames[bet.source_id] : "";

              return (
                <article className={`calendar-bets-card ${bet.result}`} key={bet.id}>
                  <div className="calendar-bets-row main">
                    <div>
                      <strong>{formatEventName(bet.event_name)}</strong>
                      <span>{bet.market} · {bet.selection} · ×{odds.toFixed(2)}</span>
                    </div>
                    <b>{formatMoney(stake)}</b>
                  </div>

                  <div className="calendar-bets-row meta">
                    <span>{bet.bookmaker || "БК не указан"}</span>
                    <span>{sourceName || "Источник не указан"}</span>
                    <span>{getSportName(bet.sport)}</span>
                  </div>

                  {bet.result === "pending" ? (
                    <div className="calendar-bets-actions">
                      <button disabled={loading} onClick={() => settleBet(bet, "win")} type="button">Выигрыш</button>
                      <button disabled={loading} onClick={() => settleBet(bet, "loss")} type="button">Проигрыш</button>
                      <button disabled={loading} onClick={() => settleBet(bet, "return")} type="button">Возврат</button>
                    </div>
                  ) : (
                    <div className="calendar-bets-result">
                      <span>{bet.result === "win" ? "Выигрыш" : bet.result === "loss" ? "Проигрыш" : "Возврат"}</span>
                      <strong>{formatMoney(Number(bet.profit || 0))}</strong>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
