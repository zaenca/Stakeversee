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

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "RUB"
  }).format(value);
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function getDayBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);

  return { start, end };
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
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dateTitle = useMemo(() => selectedDate ? formatDateLabel(selectedDate) : "", [selectedDate]);

  async function loadBets(date: Date) {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id || null;
    setUserId(currentUserId);

    if (!currentUserId) {
      setBets([]);
      setSourceNames({});
      setLoading(false);
      return;
    }

    const { start, end } = getDayBounds(date);
    const { data: betRows } = await supabase
      .from("bets")
      .select("id,source_id,event_name,sport,bookmaker,market,selection,odds,stake,result,profit,settled_at,created_at")
      .eq("user_id", currentUserId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

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
    const stake = Number(bet.stake || 0);
    const odds = Number(bet.odds || 0);
    const profit = result === "win" ? stake * odds - stake : result === "loss" ? -stake : 0;
    const settledAt = new Date().toISOString();

    const { error } = await supabase
      .from("bets")
      .update({ result, profit, settled_at: settledAt })
      .eq("id", bet.id)
      .eq("user_id", userId);

    if (!error) {
      await supabase.from("bankroll_events").insert({
        user_id: userId,
        amount: profit,
        kind: result,
        note: `${bet.event_name} · ${bet.market} · ${bet.selection}`
      });
    }

    if (selectedDate) await loadBets(selectedDate);
    window.dispatchEvent(new CustomEvent("stakeversee:bets-updated"));
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
                      <strong>{bet.event_name}</strong>
                      <span>{bet.market} · {bet.selection} · ×{odds.toFixed(2)}</span>
                    </div>
                    <b>{formatMoney(stake)}</b>
                  </div>

                  <div className="calendar-bets-row meta">
                    <span>{bet.bookmaker || "БК не указан"}</span>
                    <span>{sourceName || "Источник не указан"}</span>
                    <span>{bet.sport || "Спорт"}</span>
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
