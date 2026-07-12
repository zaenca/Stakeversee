"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

type RailBet = {
  id: string;
  source_id: string | null;
  event_name: string;
  bookmaker: string | null;
};

type SourceName = {
  id: string;
  name: string;
};

export function BankBetMirror() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [bets, setBets] = useState<RailBet[]>([]);
  const [sourceNames, setSourceNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    function ensureHost() {
      const balance = document.querySelector(".bank-panel .bank-balance");
      if (!balance) return;

      let nextHost = document.querySelector(".bank-bet-mirror-host") as HTMLElement | null;
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.className = "bank-bet-mirror-host";
        balance.insertAdjacentElement("afterend", nextHost);
      }

      setHost(nextHost);
    }

    ensureHost();
    const timer = window.setInterval(ensureHost, 1000);

    return () => {
      window.clearInterval(timer);
      document.querySelector(".bank-bet-mirror-host")?.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBets() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        if (active) {
          setBets([]);
          setSourceNames(new Map());
        }
        return;
      }

      const { data: betRows } = await supabase
        .from("bets")
        .select("id,source_id,event_name,bookmaker")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      const nextBets = (betRows || []) as RailBet[];
      const sourceIds = Array.from(
        new Set(nextBets.map(bet => bet.source_id).filter((id): id is string => Boolean(id)))
      );

      let nextSourceNames = new Map<string, string>();
      if (sourceIds.length) {
        const { data: sourceRows } = await supabase
          .from("sources")
          .select("id,name")
          .in("id", sourceIds);

        nextSourceNames = new Map((sourceRows || []).map(source => {
          const row = source as SourceName;
          return [row.id, row.name];
        }));
      }

      if (active) {
        setBets(nextBets);
        setSourceNames(nextSourceNames);
      }
    }

    loadBets();
    const timer = window.setInterval(loadBets, 2500);
    const { data } = supabase.auth.onAuthStateChange(() => loadBets());

    return () => {
      active = false;
      window.clearInterval(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  if (!host || !bets.length) return null;

  return createPortal(
    <div className="bank-bet-mirror-list" aria-label="Последние ставки">
      {bets.map(bet => (
        <div className="bank-bet-mirror-row" key={bet.id}>
          <strong>{bet.event_name}</strong>
          <span>{bet.bookmaker || "-"}</span>
          <em>{bet.source_id ? sourceNames.get(bet.source_id) || "-" : "-"}</em>
        </div>
      ))}
    </div>,
    host
  );
}
