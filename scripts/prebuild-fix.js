const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const cssPath = path.join(process.cwd(), "app", "globals.css");
let page = fs.readFileSync(pagePath, "utf8");
let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

function replaceRequired(source, target, replacement, label) {
  if (!source.includes(target)) {
    console.log(`[prebuild-fix] skip ${label}: target not found`);
    return source;
  }
  console.log(`[prebuild-fix] apply ${label}`);
  return source.replace(target, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    console.log(`[prebuild-fix] skip ${label}: pattern not found`);
    return source;
  }
  console.log(`[prebuild-fix] apply ${label}`);
  return source.replace(pattern, replacement);
}

const oldBankrollStats = `  const bankrollStats = useMemo(() => {
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
  }, [bankrollEvents]);`;

const newBankrollStats = `  const bankrollStats = useMemo(() => {
    const normalizedEvents = Array.from(bankrollEvents.reduce((map, event) => {
      const isBetSettlement = Boolean(event.bet_id) && ["win", "loss", "return"].includes(event.kind);
      map.set(isBetSettlement ? \`bet:\${event.bet_id}\` : \`event:\${event.id}\`, event);
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
  }, [bankrollEvents]);`;

page = replaceRequired(page, oldBankrollStats, newBankrollStats, "dedupe bankroll settlement events");

const oldSettleInsert = `    } else {
      const { error: bankrollError } = await supabase.from("bankroll_events").insert({`;
const newSettleInsert = `    } else {
      const { error: cleanupError } = await supabase
        .from("bankroll_events")
        .delete()
        .eq("user_id", user.id)
        .eq("bet_id", bet.id);

      if (cleanupError) {
        setDataMessage(cleanupError.message);
        setDataLoading(false);
        return;
      }

      const { error: bankrollError } = await supabase.from("bankroll_events").insert({`;
page = replaceRequired(page, oldSettleInsert, newSettleInsert, "prevent duplicate bankroll event per bet");

const helpersTarget = `function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {
  return settledBets
    .filter(bet => isSameLocalDate(bet.created_at, day))
    .reduce((sum, bet) => sum + betProfitValue(bet), 0);
}`;
const helpersReplacement = `${helpersTarget}

function betSignature(bet: BetRow): string {
  return [
    formatEventName(bet.event_name),
    bet.market,
    bet.selection,
    bet.bookmaker,
    bet.source_id,
    bet.stake,
    bet.odds
  ].join("|").toLowerCase();
}

function uniqueBetsBySignature(bets: BetRow[]): BetRow[] {
  const bySignature = new Map<string, BetRow>();

  bets.forEach(bet => {
    const signature = betSignature(bet);
    const current = bySignature.get(signature);

    if (!current || new Date(bet.created_at).getTime() < new Date(current.created_at).getTime()) {
      bySignature.set(signature, bet);
    }
  });

  return Array.from(bySignature.values());
}`;
if (!page.includes("function betSignature(bet: BetRow): string")) {
  page = replaceRequired(page, helpersTarget, helpersReplacement, "add bet signature helpers");
} else {
  page = page.replace("    bet.event_name,\n    bet.market,", "    formatEventName(bet.event_name),\n    bet.market,");
  console.log("[prebuild-fix] refresh bet signature helper");
}

const pendingVarsPattern = /    const pendingBets = bets\.filter\(bet => bet\.result === "pending"\);\s*\n    const settledBets = bets\.filter\(bet => bet\.result !== "pending" && bet\.settled_at\);\s*\n    const pendingRailBets = pendingBets\.slice\(0, 5\);/;
const pendingVarsReplacement = `    const settledBets = uniqueBetsBySignature(bets.filter(bet => bet.result !== "pending" && bet.settled_at));
    const settledSignatures = new Set(settledBets.map(bet => betSignature(bet)));
    const pendingBets = uniqueBetsBySignature(
      bets.filter(bet => bet.result === "pending" && !settledSignatures.has(betSignature(bet)))
    );
    const pendingRailBets = pendingBets.slice(0, 5);`;
page = replacePattern(page, pendingVarsPattern, pendingVarsReplacement, "hide settled duplicate bets from bank rail");

const oldSourceName = `function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —").replace(/\\s*(?:\\.{3}|…)\\s*$/, "").trim();
  return name || "Источник —";
}`;
const newSourceName = `function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —")
    .replace(/\\s*(?:\\.{3}|…)\\s*$/, "")
    .replace(/\\s+$/, "")
    .trim();
  return name || "Источник —";
}`;
page = replaceRequired(page, oldSourceName, newSourceName, "trim source display name");

const pendingBlockPattern = /\n\s*\{pendingRailBets\.length \? \(\s*\n\s*<div className="bank-pending-list"[\s\S]*?\n\s*\) : null\}\s*(?=\n\s*<\/section>)/;
if (pendingBlockPattern.test(page)) {
  page = page.replace(pendingBlockPattern, "");
  console.log("[prebuild-fix] remove duplicate pending rail block");
} else {
  console.log("[prebuild-fix] skip duplicate pending rail block: target not found");
}

if (css) {
  css = replacePattern(
    css,
    /\.bank-bet-row \{[\s\S]*?\n\}/,
    `.bank-bet-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--line);
  border-radius: 7px;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) max-content max-content;
  min-height: 38px;
  padding: 8px 9px;
}`,
    "bank rail columns"
  );

  css = replacePattern(
    css,
    /\.bank-bet-row em \{[\s\S]*?\n\}/,
    `.bank-bet-row em {
  border-color: rgba(139, 92, 246, 0.32);
  color: #d9c8ff;
  max-width: none;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
}`,
    "show full source chip"
  );
}

fs.writeFileSync(pagePath, page, "utf8");
if (css) fs.writeFileSync(cssPath, css, "utf8");
