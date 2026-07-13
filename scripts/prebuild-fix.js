const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const cssPath = path.join(process.cwd(), "app", "globals.css");
let page = fs.readFileSync(pagePath, "utf8");
let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";

function log(label, changed) {
  console.log(`[prebuild-fix] ${changed ? "apply" : "skip"} ${label}`);
}

function replacePage(pattern, replacement, label) {
  const next = page.replace(pattern, replacement);
  log(label, next !== page);
  page = next;
}

function replaceCss(pattern, replacement, label) {
  if (!css) return;
  const next = css.replace(pattern, replacement);
  log(label, next !== css);
  css = next;
}

replacePage(/new Map<string, BankrollEvent>\(\)/g, "new Map<string, BankrollEventRow>()", "bankroll event row type");

replacePage(
  /function sourceDisplayName\(value\?: string \| null\): string \{[\s\S]*?\n\}/,
  `function sourceDisplayName(value?: string | null): string {
  const name = (value || "Источник —")
    .replace(/\\s*(?:\\.{2,}|…|â€¦)\\s*$/g, "")
    .replace(/\\s+$/g, "")
    .trim();
  return name || "Источник —";
}`,
  "source name without ellipsis"
);

replacePage(/\[\s*\n\s*bet\.event_name,\s*\n\s*bet\.market,/g, "[\n    formatEventName(bet.event_name),\n    bet.market,", "normalized bet signature");

const looseHelpers = `
function betLooseSignature(bet: BetRow): string {
  return [
    formatEventName(bet.event_name),
    bet.market,
    bet.selection,
    bet.bookmaker,
    bet.source_id
  ].join("|").toLowerCase();
}

function uniqueBetsByLooseSignature(bets: BetRow[]): BetRow[] {
  const bySignature = new Map<string, BetRow>();

  bets.forEach(bet => {
    const signature = betLooseSignature(bet);
    const current = bySignature.get(signature);

    if (!current || new Date(bet.created_at).getTime() < new Date(current.created_at).getTime()) {
      bySignature.set(signature, bet);
    }
  });

  return Array.from(bySignature.values());
}
`;

if (!page.includes("function betLooseSignature(bet: BetRow): string")) {
  replacePage(/\nfunction makeCalendarDays\(\)/, `${looseHelpers}\nfunction makeCalendarDays()`, "loose bet dedupe helpers");
}

replacePage(
  /function calendarProfitForDate\(day: Date, settledBets: BetRow\[\]\): number \{[\s\S]*?\n\}/,
  `function calendarProfitForDate(day: Date, settledBets: BetRow[]): number {
  return uniqueBetsByLooseSignature(settledBets)
    .filter(bet => isSameLocalDate(bet.created_at, day))
    .reduce((sum, bet) => sum + betProfitValue(bet), 0);
}`,
  "calendar unique settled profit"
);

replacePage(
  /\s*const settledBets = [^;]+;\s*\n\s*const settledSignatures = [^;]+;\s*\n\s*const pendingBets = uniqueBetsBySignature\([\s\S]*?\n\s*\);\s*\n\s*const pendingRailBets = pendingBets\.slice\(0, 5\);/,
  `    const settledBets = uniqueBetsByLooseSignature(bets.filter(bet => bet.result !== "pending" && bet.settled_at));
    const settledSignatures = new Set(settledBets.map(bet => betLooseSignature(bet)));
    const pendingBets = uniqueBetsByLooseSignature(
      bets.filter(bet => bet.result === "pending" && !settledSignatures.has(betLooseSignature(bet)))
    );
    const pendingRailBets = pendingBets.slice(0, 5);`,
  "pending rail excludes settled bets"
);

replacePage(
  /\s*const pendingBets = bets\.filter\(bet => bet\.result === "pending"\);\s*\n\s*const pendingRailBets = pendingBets\.slice\(0, 5\);/,
  `    const settledBets = uniqueBetsByLooseSignature(bets.filter(bet => bet.result !== "pending" && bet.settled_at));
    const settledSignatures = new Set(settledBets.map(bet => betLooseSignature(bet)));
    const pendingBets = uniqueBetsByLooseSignature(
      bets.filter(bet => bet.result === "pending" && !settledSignatures.has(betLooseSignature(bet)))
    );
    const pendingRailBets = pendingBets.slice(0, 5);`,
  "pending rail legacy variables"
);

replacePage(
  /const normalizedEvents = Array\.from\(bankrollEvents\.reduce\(\(map, event\) => \{[\s\S]*?new Map<string, BankrollEventRow>\(\)\)\.values\(\)\);/,
  `const normalizedEvents = Array.from(bankrollEvents.reduce((map, event) => {
      const isBetSettlement = Boolean(event.bet_id) && ["win", "loss", "return"].includes(event.kind);
      map.set(isBetSettlement ? \`bet:\${event.bet_id}\` : \`event:\${event.id}\`, event);
      return map;
    }, new Map<string, BankrollEventRow>()).values());`,
  "dedupe bankroll settlement events"
);

replaceCss(
  /\.bank-bet-row \{[\s\S]*?\n\}/,
  `.bank-bet-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--line);
  border-radius: 7px;
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto auto;
  min-height: 38px;
  padding: 8px 9px;
}`,
  "bank rail compact row"
);

replaceCss(
  /\.bank-bet-row em \{[\s\S]*?\n\}/,
  `.bank-bet-row em {
  border-color: rgba(139, 92, 246, 0.32);
  color: #d9c8ff;
  max-width: none;
  min-width: 0;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}`,
  "bank rail full source chip"
);

fs.writeFileSync(pagePath, page, "utf8");
if (css) fs.writeFileSync(cssPath, css, "utf8");
