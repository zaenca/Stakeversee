export type CzechBaseballTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "Экстралига";
  division: "Экстралига";
  country: "Чехия";
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
};

export const CZECH_BASEBALL_TEAMS: CzechBaseballTeamProfile[] = [
  {
    id: "hrosi-brno",
    name: "Хроси Брно",
    shortName: "Хроси",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "HB",
    rank: 1,
    form: "-",
    wins: 16,
    losses: 7,
    pct: ".696",
    gamesBack: "-",
    aliases: ["cardion hrosi brno", "cardion hroši brno", "hrosi brno", "hroši brno", "хроси брно", "хроси"]
  },
  {
    id: "kotlarka-praha",
    name: "Котларка Прага",
    shortName: "Котларка",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "KP",
    rank: 2,
    form: "-",
    wins: 13,
    losses: 10,
    pct: ".565",
    gamesBack: "3",
    aliases: ["kotlarka praha", "kotlářka praha", "котларка прага", "котларка"]
  },
  {
    id: "draci-brno",
    name: "Драци Брно",
    shortName: "Драци",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "DB",
    rank: 3,
    form: "-",
    wins: 13,
    losses: 10,
    pct: ".565",
    gamesBack: "3",
    aliases: ["draci brno", "драци брно", "драци", "draci"]
  },
  {
    id: "sokol-hluboka",
    name: "Сокол Глубока",
    shortName: "Сокол",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "SH",
    rank: 4,
    form: "-",
    wins: 12,
    losses: 11,
    pct: ".522",
    gamesBack: "4",
    aliases: ["sokol hluboka", "sokol hluboká", "сокол глубока", "сокол"]
  },
  {
    id: "trebic-nuclears",
    name: "Тршебич Нуклеарс",
    shortName: "Тршебич",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "TN",
    rank: 5,
    form: "-",
    wins: 12,
    losses: 11,
    pct: ".522",
    gamesBack: "4",
    aliases: ["trebic nuclears", "třebíč nuclears", "тршебич нуклеарс", "тршебич"]
  },
  {
    id: "eagles-praha",
    name: "Иглз Прага",
    shortName: "Иглз",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "EP",
    rank: 6,
    form: "-",
    wins: 10,
    losses: 13,
    pct: ".435",
    gamesBack: "6",
    aliases: ["eagles praha", "eagles prague", "eagles", "иглз прага", "иглз", "иглс прага", "иглс"]
  },
  {
    id: "arrows-ostrava",
    name: "Эрроуз Острава",
    shortName: "Эрроуз",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "AO",
    rank: 7,
    form: "-",
    wins: 9,
    losses: 14,
    pct: ".391",
    gamesBack: "7",
    aliases: ["arrows ostrava", "эрроуз острава", "арроуз острава", "arrows"]
  },
  {
    id: "sabat-praha",
    name: "СаБаТ Прага",
    shortName: "СаБаТ",
    league: "Экстралига",
    division: "Экстралига",
    country: "Чехия",
    logo: "SP",
    rank: 8,
    form: "-",
    wins: 7,
    losses: 16,
    pct: ".304",
    gamesBack: "9",
    aliases: ["sabat praha", "sabat prague", "сабат прага", "сабат"]
  }
];

function normalizeCzechBaseballTeamName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(baseball|team|club|bc)\b|(^|\s)(бк)(?=\s)/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CZECH_BASEBALL_TEAM_BY_ALIAS = new Map(
  CZECH_BASEBALL_TEAMS.flatMap(team => (
    [team.id, team.name, team.shortName, ...team.aliases]
      .map(alias => [normalizeCzechBaseballTeamName(alias), team] as const)
  ))
);

function teamIdTail(teamId?: string): string {
  return String(teamId || "").split(":").pop() || "";
}

export function resolveCzechBaseballTeam(value: string, teamId?: string): CzechBaseballTeamProfile | null {
  const candidates = [teamIdTail(teamId), value].map(normalizeCzechBaseballTeamName).filter(Boolean);

  for (const candidate of candidates) {
    const exact = CZECH_BASEBALL_TEAM_BY_ALIAS.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const contained = Array.from(CZECH_BASEBALL_TEAM_BY_ALIAS.entries()).find(([alias]) => (
      alias.length >= 4 && (candidate.includes(alias) || alias.includes(candidate))
    ));
    if (contained) return contained[1];
  }

  return null;
}

export function isCzechBaseballMatchContext(country: string, league: string, home = "", away = ""): boolean {
  const context = normalizeCzechBaseballTeamName(`${country} ${league}`);
  if (/extraliga|czech|czech republic|чех|экстралига/.test(context)) return true;
  return Boolean(resolveCzechBaseballTeam(home) && resolveCzechBaseballTeam(away));
}

export function czechBaseballTeamId(team: CzechBaseballTeamProfile): string {
  return `baseball:czech:extraliga:${team.id}`;
}
