const fs = require("fs");
const path = require("path");

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const cssPath = path.join(root, "app", "globals.css");

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function note(label, changed) {
  console.log(`[prebuild-fix] ${changed ? "apply" : "skip"}: ${label}`);
}

function replaceBlock(source, start, end, replacement, label) {
  const from = source.indexOf(start);
  if (from < 0) {
    note(`${label} (start not found)`, false);
    return source;
  }
  const to = source.indexOf(end, from);
  if (to < 0) {
    note(`${label} (end not found)`, false);
    return source;
  }
  const next = source.slice(0, from) + replacement + source.slice(to + end.length);
  note(label, next !== source);
  return next;
}

function insertBefore(source, marker, insertion, guard, label) {
  if (source.includes(guard)) {
    note(label, false);
    return source;
  }
  const index = source.indexOf(marker);
  if (index < 0) {
    note(`${label} (marker not found)`, false);
    return source;
  }
  note(label, true);
  return source.slice(0, index) + insertion + source.slice(index);
}

function replaceAll(source, from, to, label) {
  const next = source.split(from).join(to);
  note(label, next !== source);
  return next;
}

let page = read(pagePath);
let css = read(cssPath);

if (!page) {
  console.log("[prebuild-fix] app/page.tsx not found");
  process.exit(0);
}

page = replaceBlock(
  page,
  "function sourceDisplayName(value?: string | null): string {",
  "\n}\n\nfunction formatEventName",
  `function sourceDisplayName(value?: string | null): string {
  let name = (value || "Источник —").trim();
  while (name.endsWith(".") || name.endsWith("…")) {
    name = name.slice(0, -1).trim();
  }
  if (name.endsWith("â€¦")) {
    name = name.slice(0, -3).trim();
  }
  return name || "Источник —";
}

function formatEventName`,
  "source names without ellipsis"
);

page = replaceBlock(
  page,
  "function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {",
  "\n}\n\nfunction makeCalendarDays",
  `function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {
  const uniqueSettled = uniqueBetsByLooseSignature(settledBets);
  return uniqueSettled
    .filter(bet => isSameLocalDate(bet.settled_at || bet.created_at, day))
    .reduce((sum, bet) => sum + Number(bet.profit || 0), 0);
}

function makeCalendarDays`,
  "calendar profit from unique settled bets"
);

const helperBlock = `function betLooseSignature(bet: BetRow): string {
  const normalizedEvent = normalizeText(bet.event_name || "");
  const normalizedMarket = normalizeText(bet.market || "");
  const normalizedSelection = normalizeText(bet.selection || "");
  const amount = Math.round(Number(bet.amount || 0) * 100) / 100;
  const odds = Math.round(Number(bet.odds || 0) * 100) / 100;
  return [normalizedEvent, normalizedMarket, normalizedSelection, amount, odds].join("|");
}

function uniqueBetsByLooseSignature(bets: BetRow[]): BetRow[] {
  const bySignature = new Map<string, BetRow>();
  bets.forEach(bet => {
    const signature = betLooseSignature(bet);
    const previous = bySignature.get(signature);
    if (!previous) {
      bySignature.set(signature, bet);
      return;
    }
    const previousTime = new Date(previous.settled_at || previous.created_at).getTime() || 0;
    const currentTime = new Date(bet.settled_at || bet.created_at).getTime() || 0;
    if (currentTime >= previousTime) {
      bySignature.set(signature, bet);
    }
  });
  return Array.from(bySignature.values());
}

`;

page = insertBefore(
  page,
  "function makeCalendarDays(): CalendarDay[] {",
  helperBlock,
  "function betLooseSignature(bet: BetRow): string",
  "bet signature helpers"
);

page = replaceBlock(
  page,
  "  const bankrollStats = useMemo(() => {",
  "  }, [bankrollEvents]);",
  `  const bankrollStats = useMemo(() => {
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
  }, [bankrollEvents]);`,
  "bankroll stats dedupe settlements"
);

const resolvedBetsBlock = `  const settlementEventsByBetId = useMemo(() => {
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

`;

page = insertBefore(
  page,
  "  const calendarDays = useMemo(() => makeCalendarDays(), []);",
  resolvedBetsBlock,
  "const settlementEventsByBetId = useMemo",
  "resolved/pending bets derived state"
);

page = replaceBlock(
  page,
  "  const calendarBets = useMemo(() => {",
  "  }, [bets, calendarDateOpen]);",
  `  const calendarBets = useMemo(() => {
    if (!calendarDateOpen) return [];

    return resolvedBets
      .filter(bet => isSameLocalDate(bet.settled_at || bet.created_at, calendarDateOpen))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [resolvedBets, calendarDateOpen]);`,
  "calendar bets use resolved state"
);

page = replaceBlock(
  page,
  "  const sourceStats = useMemo(() => {",
  "  }, [bets, sources]);",
  `  const sourceStats = useMemo(() => {
    return sources.map(source => {
      const sourceBets = resolvedBets.filter(bet => bet.source_id === source.id);
      const settledSourceBets = sourceBets.filter(bet => bet.result !== "pending");
      const profit = settledSourceBets.reduce((sum, bet) => sum + Number(bet.profit || 0), 0);
      const stake = settledSourceBets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
      const wins = settledSourceBets.filter(bet => bet.result === "win").length;
      const avgOdds = sourceBets.length
        ? sourceBets.reduce((sum, bet) => sum + Number(bet.odds || 0), 0) / sourceBets.length
        : 0;

      return {
        ...source,
        avgOdds,
        bets: sourceBets.length,
        losses: settledSourceBets.filter(bet => bet.result === "loss").length,
        pending: sourceBets.filter(bet => bet.result === "pending").length,
        profit,
        roi: stake ? (profit / stake) * 100 : 0,
        stake,
        wins
      };
    }).sort((a, b) => b.bets - a.bets || b.profit - a.profit);
  }, [resolvedBets, sources]);`,
  "source stats use resolved bets"
);

page = replaceAll(
  page,
  "const hasBets = bets.some(bet => isSameLocalDate(bet.created_at, day.date));",
  "const hasBets = resolvedBets.some(bet => isSameLocalDate(bet.settled_at || bet.created_at, day.date));",
  "calendar has bets uses resolved dates"
);

if (!page.includes("const pendingRailBets = pendingBets.slice(0, 5);")) {
  page = replaceAll(
    page,
    "const displayedBalance = BASE_BANKROLL + bankrollStats.balance;",
    "const displayedBalance = BASE_BANKROLL + bankrollStats.balance;\n    const pendingRailBets = pendingBets.slice(0, 5);",
    "pending rail variable"
  );
} else {
  note("pending rail variable", false);
}

page = replaceAll(
  page,
  "<span>{bets.length}</span>",
  "<span>{pendingRailBets.length}</span>",
  "bank rail count uses pending"
);
page = replaceAll(
  page,
  "{bets.slice(0, 30).map(bet => {",
  "{pendingRailBets.map(bet => {",
  "bank rail list uses pending"
);
page = replaceAll(
  page,
  "{bets.slice(0, 5).map(bet => {",
  "{pendingRailBets.map(bet => {",
  "compact bank rail list uses pending"
);
page = replaceAll(
  page,
  "{!bets.length ? <span className=\"empty\">Ставки появятся после сохранения прогноза.</span> : null}",
  "{!pendingRailBets.length ? <span className=\"empty\">Ставки появятся после сохранения прогноза.</span> : null}",
  "bank rail empty state uses pending"
);

write(pagePath, page);

// NOTE: the old forced-no-truncate CSS override for .bank-bet-row chips was
// removed - it caused long bookmaker/source labels (e.g. multiple sources
// joined with " + ") to overflow past the card edge instead of truncating.
// Proper ellipsis truncation now lives directly in app/globals.css.
note("bank rail CSS readable chips", false);

write(cssPath, css);
