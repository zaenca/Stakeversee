const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let page = fs.readFileSync(pagePath, "utf8");

function replaceRequired(source, target, replacement, label) {
  if (!source.includes(target)) {
    console.log(`[prebuild-fix] skip ${label}: target not found`);
    return source;
  }
  console.log(`[prebuild-fix] apply ${label}`);
  return source.replace(target, replacement);
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
    }, new Map<string, BankrollEvent>()).values());

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

const pendingBlockPattern = /\n\s*\{pendingRailBets\.length \? \(\s*\n\s*<div className="bank-pending-list"[\s\S]*?\n\s*\) : null\}\s*(?=\n\s*<\/section>)/;
if (pendingBlockPattern.test(page)) {
  page = page.replace(pendingBlockPattern, "");
  console.log("[prebuild-fix] remove duplicate pending rail block");
} else {
  console.log("[prebuild-fix] skip duplicate pending rail block: target not found");
}

fs.writeFileSync(pagePath, page, "utf8");
