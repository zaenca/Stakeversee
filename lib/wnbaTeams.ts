export type WnbaTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "WNBA";
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

export const WNBA_TEAMS: WnbaTeamProfile[] = [
  { id: "atlanta dream", name: "Атланта Дрим", shortName: "Атланта", league: "WNBA", country: "США", logo: "ATL", rank: 1, form: "-", aliases: ["atlanta dream", "atlanta", "атланта дрим", "атланта"] },
  { id: "chicago sky", name: "Чикаго Скай", shortName: "Чикаго", league: "WNBA", country: "США", logo: "CHI", rank: 2, form: "-", aliases: ["chicago sky", "chicago", "чикаго скай", "чикаго"] },
  { id: "connecticut sun", name: "Коннектикут Сан", shortName: "Коннектикут", league: "WNBA", country: "США", logo: "CON", rank: 3, form: "-", aliases: ["connecticut sun", "connecticut", "коннектикут сан", "коннектикут"] },
  { id: "dallas wings", name: "Даллас Уингз", shortName: "Даллас", league: "WNBA", country: "США", logo: "DAL", rank: 4, form: "-", aliases: ["dallas wings", "dallas", "даллас уингз", "даллас вингс", "даллас"] },
  { id: "golden state valkyries", name: "Голден Стэйт Валкириз", shortName: "Голден Стэйт", league: "WNBA", country: "США", logo: "GSV", rank: 5, form: "-", aliases: ["golden state valkyries", "golden state valkyrie", "golden state", "голден стейт валкириз", "голден стэйт валкириз", "голден стейт валькирии", "голден стэйт валькирии", "голден стейт", "голден стэйт", "валкириз"] },
  { id: "indiana fever", name: "Индиана Фивер", shortName: "Индиана", league: "WNBA", country: "США", logo: "IND", rank: 6, form: "-", aliases: ["indiana fever", "indiana", "индиана фивер", "индиана"] },
  { id: "las vegas aces", name: "Лас-Вегас Эйсес", shortName: "Лас-Вегас", league: "WNBA", country: "США", logo: "LVA", rank: 7, form: "-", aliases: ["las vegas aces", "las vegas", "vegas aces", "лас вегас эйсес", "лас-вегас эйсес", "лас вегас"] },
  { id: "los angeles sparks", name: "Лос-Анджелес Спаркс", shortName: "Лос-Анджелес", league: "WNBA", country: "США", logo: "LAS", rank: 8, form: "-", aliases: ["los angeles sparks", "la sparks", "los angeles", "лос анджелес спаркс", "лос-анджелес спаркс", "лос анджелес", "лос-анджелес", "спаркс"] },
  { id: "minnesota lynx", name: "Миннесота Линкс", shortName: "Миннесота", league: "WNBA", country: "США", logo: "MIN", rank: 9, form: "-", aliases: ["minnesota lynx", "minnesota", "миннесота линкс", "миннесота"] },
  { id: "new york liberty", name: "Нью-Йорк Либерти", shortName: "Нью-Йорк", league: "WNBA", country: "США", logo: "NYL", rank: 10, form: "-", aliases: ["new york liberty", "ny liberty", "new york", "нью йорк либерти", "нью-йорк либерти", "нью йорк"] },
  { id: "phoenix mercury", name: "Финикс Меркури", shortName: "Финикс", league: "WNBA", country: "США", logo: "PHX", rank: 11, form: "-", aliases: ["phoenix mercury", "phoenix", "финикс меркури", "финикс"] },
  { id: "portland fire", name: "Портленд Файр", shortName: "Портленд", league: "WNBA", country: "США", logo: "POR", rank: 12, form: "-", aliases: ["portland fire", "portland", "портленд файр", "портленд фаир", "портленд"] },
  { id: "seattle storm", name: "Сиэтл Сторм", shortName: "Сиэтл", league: "WNBA", country: "США", logo: "SEA", rank: 13, form: "-", aliases: ["seattle storm", "seattle", "сиэтл сторм", "сиэтл"] },
  { id: "toronto tempo", name: "Торонто Темпо", shortName: "Торонто", league: "WNBA", country: "США", logo: "TOR", rank: 14, form: "-", aliases: ["toronto tempo", "toronto", "торонто темпо", "торонто"] },
  { id: "washington mystics", name: "Вашингтон Мистикс", shortName: "Вашингтон", league: "WNBA", country: "США", logo: "WAS", rank: 15, form: "-", aliases: ["washington mystics", "washington", "вашингтон мистикс", "вашингтон"] }
];

export function normalizeWnbaTeamName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(women|woman|female|team|club|bc)\b|(^|\s)(ж|бк)(?=\s|$)/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WNBA_TEAM_BY_ALIAS = new Map(
  WNBA_TEAMS.flatMap(team => (
    [team.id, team.name, team.shortName, ...team.aliases]
      .map(alias => [normalizeWnbaTeamName(alias), team] as const)
  ))
);

function teamIdTail(teamId?: string): string {
  return String(teamId || "").split(":").pop() || "";
}

export function resolveWnbaTeam(value: string, teamId?: string): WnbaTeamProfile | null {
  const candidates = [teamIdTail(teamId), value].map(normalizeWnbaTeamName).filter(Boolean);
  for (const candidate of candidates) {
    const exact = WNBA_TEAM_BY_ALIAS.get(candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const contained = Array.from(WNBA_TEAM_BY_ALIAS.entries()).find(([alias]) => (
      alias.length >= 4 && (candidate.includes(alias) || alias.includes(candidate))
    ));
    if (contained) return contained[1];
  }
  return null;
}

export function isWnbaMatchContext(country: string, league: string, home = "", away = ""): boolean {
  const context = normalizeWnbaTeamName(`${country} ${league}`);
  if (/\bwnba\b|women national basketball|женск.*национальн.*баскет/.test(context)) return true;
  return Boolean(resolveWnbaTeam(home) && resolveWnbaTeam(away));
}

export function wnbaTeamId(team: WnbaTeamProfile): string {
  return `basketball:usa:wnba:${team.id}`;
}
