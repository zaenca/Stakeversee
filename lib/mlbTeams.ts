export type MlbTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "MLB";
  country: "США";
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
};

export const MLB_TEAMS: MlbTeamProfile[] = [
  { id: "baltimore orioles", name: "Балтимор Ориолс", shortName: "Балтимор", league: "MLB", country: "США", logo: "/teams/baltimore-orioles.png", rank: 1, form: "-", aliases: ["baltimore orioles", "baltimore", "orioles", "балтимор ориолс", "балтимор", "ориолс"] },
  { id: "boston red sox", name: "Бостон Ред Сокс", shortName: "Бостон", league: "MLB", country: "США", logo: "/teams/boston-red-sox.png", rank: 2, form: "-", aliases: ["boston red sox", "boston", "red sox", "бостон ред сокс", "бостон", "ред сокс"] },
  { id: "new york yankees", name: "Нью-Йорк Янкиз", shortName: "Янкиз", league: "MLB", country: "США", logo: "/teams/new-york-yankees.png", rank: 3, form: "-", aliases: ["new york yankees", "ny yankees", "yankees", "нью йорк янкиз", "нью-йорк янкиз", "янкиз"] },
  { id: "tampa bay rays", name: "Тампа-Бэй Рэйс", shortName: "Тампа-Бэй", league: "MLB", country: "США", logo: "/teams/tampa-bay-rays.png", rank: 4, form: "-", aliases: ["tampa bay rays", "tampa bay", "rays", "тампа бэй рэйс", "тампа-бэй рэйс", "тампа бэй", "рэйс"] },
  { id: "toronto blue jays", name: "Торонто Блю Джейс", shortName: "Торонто", league: "MLB", country: "США", logo: "TOR", rank: 5, form: "-", aliases: ["toronto blue jays", "toronto", "blue jays", "торонто блю джейс", "торонто", "блю джейс"] },
  { id: "chicago white sox", name: "Чикаго Уайт Сокс", shortName: "Уайт Сокс", league: "MLB", country: "США", logo: "/teams/chicago-white-sox.png", rank: 6, form: "-", aliases: ["chicago white sox", "white sox", "chi white sox", "чикаго уайт сокс", "уайт сокс"] },
  { id: "cleveland guardians", name: "Кливленд Гардианс", shortName: "Кливленд", league: "MLB", country: "США", logo: "/teams/cleveland-guardians.png", rank: 7, form: "-", aliases: ["cleveland guardians", "cleveland", "guardians", "кливленд гардианс", "кливленд", "гардианс"] },
  { id: "detroit tigers", name: "Детройт Тайгерс", shortName: "Детройт", league: "MLB", country: "США", logo: "/teams/detroit-tigers.jpg", rank: 8, form: "-", aliases: ["detroit tigers", "detroit", "детройт тайгерс", "детройт"] },
  { id: "kansas city royals", name: "Канзас-Сити Роялс", shortName: "Канзас-Сити", league: "MLB", country: "США", logo: "KC", rank: 9, form: "-", aliases: ["kansas city royals", "kansas city", "kc royals", "royals", "канзас сити роялс", "канзас-сити роялс", "канзас сити", "роялс"] },
  { id: "minnesota twins", name: "Миннесота Твинс", shortName: "Миннесота", league: "MLB", country: "США", logo: "/teams/minnesota-twins.png", rank: 10, form: "-", aliases: ["minnesota twins", "minnesota", "twins", "миннесота твинс", "миннесота", "твинс"] },
  { id: "athletics", name: "Атлетикс", shortName: "Атлетикс", league: "MLB", country: "США", logo: "ATH", rank: 11, form: "-", aliases: ["athletics", "oakland athletics", "oakland", "a's", "атлетикс", "окленд атлетикс", "окленд"] },
  { id: "houston astros", name: "Хьюстон Астрос", shortName: "Хьюстон", league: "MLB", country: "США", logo: "/teams/houston-astros.png", rank: 12, form: "-", aliases: ["houston astros", "houston", "astros", "хьюстон астрос", "хьюстон", "астрос"] },
  { id: "los angeles angels", name: "Лос-Анджелес Энджелс", shortName: "Энджелс", league: "MLB", country: "США", logo: "LAA", rank: 13, form: "-", aliases: ["los angeles angels", "la angels", "angels", "лос анджелес энджелс", "лос-анджелес энджелс", "энджелс"] },
  { id: "seattle mariners", name: "Сиэтл Маринерс", shortName: "Сиэтл", league: "MLB", country: "США", logo: "SEA", rank: 14, form: "-", aliases: ["seattle mariners", "seattle", "mariners", "сиэтл маринерс", "сиэтл", "маринерс"] },
  { id: "texas rangers", name: "Техас Рейнджерс", shortName: "Техас", league: "MLB", country: "США", logo: "/teams/texas-rangers.png", rank: 15, form: "-", aliases: ["texas rangers", "texas", "rangers", "техас рейнджерс", "техас", "рейнджерс"] },
  { id: "atlanta braves", name: "Атланта Брэйвз", shortName: "Атланта", league: "MLB", country: "США", logo: "ATL", rank: 16, form: "-", aliases: ["atlanta braves", "atlanta", "braves", "атланта брэйвз", "атланта брейвз", "атланта", "брэйвз"] },
  { id: "miami marlins", name: "Майами Марлинс", shortName: "Майами", league: "MLB", country: "США", logo: "MIA", rank: 17, form: "-", aliases: ["miami marlins", "miami", "marlins", "майами марлинс", "майами", "марлинс"] },
  { id: "new york mets", name: "Нью-Йорк Метс", shortName: "Метс", league: "MLB", country: "США", logo: "NYM", rank: 18, form: "-", aliases: ["new york mets", "ny mets", "mets", "нью йорк метс", "нью-йорк метс", "метс"] },
  { id: "philadelphia phillies", name: "Филадельфия Филлис", shortName: "Филадельфия", league: "MLB", country: "США", logo: "PHI", rank: 19, form: "-", aliases: ["philadelphia phillies", "philadelphia", "phillies", "филадельфия филлис", "филадельфия", "филлис"] },
  { id: "washington nationals", name: "Вашингтон Нэшионалс", shortName: "Вашингтон", league: "MLB", country: "США", logo: "WSH", rank: 20, form: "-", aliases: ["washington nationals", "washington", "nationals", "вашингтон нэшионалс", "вашингтон нешнлс", "вашингтон", "нэшионалс"] },
  { id: "chicago cubs", name: "Чикаго Кабс", shortName: "Чикаго Кабс", league: "MLB", country: "США", logo: "CHC", rank: 21, form: "-", aliases: ["chicago cubs", "chi cubs", "cubs", "чикаго кабс", "кабс"] },
  { id: "cincinnati reds", name: "Цинциннати Редс", shortName: "Цинциннати", league: "MLB", country: "США", logo: "CIN", rank: 22, form: "-", aliases: ["cincinnati reds", "cincinnati", "reds", "цинциннати редс", "цинциннати", "редс"] },
  { id: "milwaukee brewers", name: "Милуоки Брюэрс", shortName: "Милуоки", league: "MLB", country: "США", logo: "MIL", rank: 23, form: "-", aliases: ["milwaukee brewers", "milwaukee", "brewers", "милуоки брюэрс", "милуоки", "брюэрс"] },
  { id: "pittsburgh pirates", name: "Питтсбург Пайретс", shortName: "Питтсбург", league: "MLB", country: "США", logo: "PIT", rank: 24, form: "-", aliases: ["pittsburgh pirates", "pittsburgh", "pirates", "питтсбург пайретс", "питтсбург", "пайретс"] },
  { id: "st louis cardinals", name: "Сент-Луис Кардиналс", shortName: "Сент-Луис", league: "MLB", country: "США", logo: "STL", rank: 25, form: "-", aliases: ["st louis cardinals", "st. louis cardinals", "st louis", "cardinals", "сент луис кардиналс", "сент-луис кардиналс", "сент луис", "кардиналс"] },
  { id: "arizona diamondbacks", name: "Аризона Даймондбэкс", shortName: "Аризона", league: "MLB", country: "США", logo: "ARI", rank: 26, form: "-", aliases: ["arizona diamondbacks", "arizona", "diamondbacks", "d-backs", "аризона даймондбэкс", "аризона", "даймондбэкс"] },
  { id: "colorado rockies", name: "Колорадо Рокиз", shortName: "Колорадо", league: "MLB", country: "США", logo: "COL", rank: 27, form: "-", aliases: ["colorado rockies", "colorado", "rockies", "колорадо рокиз", "колорадо", "рокиз"] },
  { id: "los angeles dodgers", name: "Лос-Анджелес Доджерс", shortName: "Доджерс", league: "MLB", country: "США", logo: "LAD", rank: 28, form: "-", aliases: ["los angeles dodgers", "la dodgers", "dodgers", "лос анджелес доджерс", "лос-анджелес доджерс", "доджерс"] },
  { id: "san diego padres", name: "Сан-Диего Падрес", shortName: "Сан-Диего", league: "MLB", country: "США", logo: "SD", rank: 29, form: "-", aliases: ["san diego padres", "san diego", "padres", "сан диего падрес", "сан-диего падрес", "сан диего", "падрес"] },
  { id: "san francisco giants", name: "Сан-Франциско Джайентс", shortName: "Сан-Франциско", league: "MLB", country: "США", logo: "SF", rank: 30, form: "-", aliases: ["san francisco giants", "san francisco", "sf giants", "giants", "сан франциско джайентс", "сан-франциско джайентс", "сан франциско", "джайентс"] }
];

export const MLB_TEAM_BY_ID = new Map(MLB_TEAMS.map(team => [team.id, team] as const));

export function normalizeMlbTeamName(value: string): string {
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

const MLB_TEAM_BY_ALIAS = new Map(
  MLB_TEAMS.flatMap(team => (
    [team.id, team.name, team.shortName, ...team.aliases]
      .map(alias => [normalizeMlbTeamName(alias), team] as const)
  ))
);

function teamIdTail(teamId?: string): string {
  return String(teamId || "").split(":").pop() || "";
}

export function resolveMlbTeam(value: string, teamId?: string): MlbTeamProfile | null {
  const candidates = [teamIdTail(teamId), value].map(normalizeMlbTeamName).filter(Boolean);

  for (const candidate of candidates) {
    const exact = MLB_TEAM_BY_ALIAS.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const contained = Array.from(MLB_TEAM_BY_ALIAS.entries()).find(([alias]) => (
      alias.length >= 4 && (candidate.includes(alias) || alias.includes(candidate))
    ));
    if (contained) return contained[1];
  }

  return null;
}

export function isMlbMatchContext(country: string, league: string, home = "", away = ""): boolean {
  const context = normalizeMlbTeamName(`${country} ${league}`);
  if (/\bmlb\b|major league|главн.*лига/.test(context)) return true;
  return Boolean(resolveMlbTeam(home) && resolveMlbTeam(away));
}

export function mlbTeamId(team: MlbTeamProfile): string {
  return `baseball:usa:mlb:${team.id}`;
}
