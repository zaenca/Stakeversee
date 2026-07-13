const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");

function log(message) {
  console.log(`[prebuild-helper-fix] ${message}`);
}

if (!fs.existsSync(pagePath)) {
  log("app/page.tsx not found");
  process.exit(0);
}

let page = fs.readFileSync(pagePath, "utf8");
let changed = false;

function insertBefore(marker, text, label) {
  const index = page.indexOf(marker);
  if (index < 0) {
    log(`${label}: marker not found`);
    return;
  }
  page = page.slice(0, index) + text + page.slice(index);
  changed = true;
  log(`${label}: applied`);
}

if (page.includes("new Map<string, BankrollEvent>()")) {
  page = page.split("new Map<string, BankrollEvent>()").join("new Map<string, BankrollEventRow>()");
  changed = true;
  log("BankrollEvent map type fixed");
}

if (!page.includes("function uniqueBetsByLooseSignature")) {
  if (!page.includes("function betLooseSignature")) {
    insertBefore(
      "function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {",
      `function betLooseSignature(bet: BetRow): string {
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

`,
      "bet signature helpers"
    );
  } else {
    insertBefore(
      "function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {",
      `function uniqueBetsByLooseSignature(bets: BetRow[]): BetRow[] {
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

`,
      "unique bet signature helper"
    );
  }
} else {
  log("unique bet signature helper already present");
}

if (changed) {
  fs.writeFileSync(pagePath, page, "utf8");
}
