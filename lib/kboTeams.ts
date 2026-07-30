export type KboTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "KBO";
  country: "Южная Корея";
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
};

export const KBO_TEAMS: KboTeamProfile[] = [
  { id: "lg twins", name: "ЛГ Твинс", shortName: "ЛГ", league: "KBO", country: "Южная Корея", logo: "LG", rank: 1, form: "-", aliases: ["lg twins", "лджи твинс", "лг твинс", "элджи твинс", "эл джи твинс", "эл джи", "lg"] },
  { id: "hanwha eagles", name: "Ханвха Иглс", shortName: "Ханвха", league: "KBO", country: "Южная Корея", logo: "HE", rank: 2, form: "-", aliases: ["hanwha eagles", "hanwha eagle", "ханвха иглс", "ханвха иглз", "ханва иглс", "ханва иглз", "хануа иглс", "хануя иглс", "ханвха", "ханва", "hanwha"] },
  { id: "lotte giants", name: "Лотте Джайентс", shortName: "Лотте", league: "KBO", country: "Южная Корея", logo: "LT", rank: 3, form: "-", aliases: ["lotte giants", "lotte giant", "лотте джайентс", "лотте джаинтс", "лотте гигантс", "лотте", "lotte"] },
  { id: "ssg landers", name: "ССГ Ландерс", shortName: "ССГ", league: "KBO", country: "Южная Корея", logo: "SSG", rank: 4, form: "-", aliases: ["ssg landers", "ssg lander", "ссг ландерс", "ссг лэндерс", "ссг лендерс", "ssg", "лендерс", "лэндерс", "ландерс"] },
  { id: "kia tigers", name: "КИА Тайгерс", shortName: "КИА", league: "KBO", country: "Южная Корея", logo: "KIA", rank: 5, form: "-", aliases: ["kia tigers", "kia tiger", "киа тайгерс", "киа тигерс", "киа", "kia"] },
  { id: "kt wiz", name: "КТ Виз", shortName: "КТ", league: "KBO", country: "Южная Корея", logo: "KT", rank: 6, form: "-", aliases: ["kt wiz", "kt wiz suwon", "кт виз", "кт уиз", "кей ти виз", "виз"] },
  { id: "samsung lions", name: "Самсунг Лайонс", shortName: "Самсунг", league: "KBO", country: "Южная Корея", logo: "SL", rank: 7, form: "-", aliases: ["samsung lions", "samsung lion", "самсунг лайонс", "самсунг лионс", "самсунг", "samsung"] },
  { id: "nc dinos", name: "НК Динос", shortName: "НК", league: "KBO", country: "Южная Корея", logo: "NC", rank: 8, form: "-", aliases: ["nc dinos", "nc dino", "nk dinos", "нц динос", "нк динос", "эн си динос", "диноз", "динос"] },
  { id: "doosan bears", name: "Дусан Беарс", shortName: "Дусан", league: "KBO", country: "Южная Корея", logo: "DB", rank: 9, form: "-", aliases: ["doosan bears", "doosan bear", "дусан беарс", "дусан бэрс", "дусан", "doosan"] },
  { id: "kiwoom heroes", name: "Кивум Хироус", shortName: "Кивум", league: "KBO", country: "Южная Корея", logo: "KH", rank: 10, form: "-", aliases: ["kiwoom heroes", "kiwoom hero", "кивум хироуз", "кивум хироус", "кивум хирос", "кивум", "kiwoom"] }
];

export const KBO_TEAM_BY_ID = new Map(KBO_TEAMS.map(team => [team.id, team] as const));

export function normalizeKboTeamName(value: string): string {
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

const KBO_TEAM_BY_ALIAS = new Map(
  KBO_TEAMS.flatMap(team => (
    [team.id, team.name, team.shortName, ...team.aliases]
      .map(alias => [normalizeKboTeamName(alias), team] as const)
  ))
);

function teamIdTail(teamId?: string): string {
  return String(teamId || "").split(":").pop() || "";
}

export function resolveKboTeam(value: string, teamId?: string): KboTeamProfile | null {
  const candidates = [teamIdTail(teamId), value].map(normalizeKboTeamName).filter(Boolean);

  for (const candidate of candidates) {
    const exact = KBO_TEAM_BY_ALIAS.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const contained = Array.from(KBO_TEAM_BY_ALIAS.entries()).find(([alias]) => (
      alias.length >= 4 && (candidate.includes(alias) || alias.includes(candidate))
    ));
    if (contained) return contained[1];
  }

  return null;
}

export function isKboMatchContext(country: string, league: string, home = "", away = ""): boolean {
  const context = normalizeKboTeamName(`${country} ${league}`);
  if (/kbo|korea|коре|чемпионат южн коре/.test(context)) return true;
  return Boolean(resolveKboTeam(home) && resolveKboTeam(away));
}

export function kboTeamId(team: KboTeamProfile): string {
  return `baseball:south korea:kbo:${team.id}`;
}
