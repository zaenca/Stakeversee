export type NpbTeamProfile = {
  id: string;
  name: string;
  shortName: string;
  league: "NPB";
  division: "Центральная лига" | "Тихоокеанская лига";
  country: "Япония";
  logo: string;
  rank: number;
  form: string;
  aliases: string[];
  wins?: number;
  losses?: number;
  pct?: string;
  gamesBack?: string;
};

export const NPB_TEAMS: NpbTeamProfile[] = [
  {
    id: "hanshin tigers",
    name: "Хансин Тайгерс",
    shortName: "Хансин",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "/teams/hanshin-tigers.png",
    rank: 1,
    form: "-",
    aliases: ["hanshin tigers", "hanshin", "tigers", "хансин тайгерс", "хансин", "ханшин тайгерс", "ханшин", "тайгерс"]
  },
  {
    id: "yomiuri giants",
    name: "Ёмиури Джайентс",
    shortName: "Ёмиури",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "YG",
    rank: 2,
    form: "-",
    aliases: ["yomiuri giants", "yomiuri", "ёмиури джайентс", "ёмиури", "йомиури джайентс", "йомиури"]
  },
  {
    id: "tokyo yakult swallows",
    name: "Токио Якульт Суоллоуз",
    shortName: "Якульт",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "YS",
    rank: 3,
    form: "-",
    aliases: ["tokyo yakult swallows", "yakult swallows", "tokyo yakult", "токио якульт суоллоуз", "якульт суоллоуз", "якульт"]
  },
  {
    id: "yokohama dena baystars",
    name: "Йокогама ДеНА Бэйстарс",
    shortName: "Йокогама",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "DB",
    rank: 4,
    form: "-",
    aliases: ["yokohama dena baystars", "dena baystars", "yokohama baystars", "йокогама дена бэйстарс", "йокогама бейстарс", "дена бэйстарс"]
  },
  {
    id: "hiroshima toyo carp",
    name: "Хиросима Тойо Карп",
    shortName: "Хиросима",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "HC",
    rank: 5,
    form: "-",
    aliases: ["hiroshima toyo carp", "hiroshima carp", "hiroshima", "хиросима тойо карп", "хиросима карп", "хиросима"]
  },
  {
    id: "chunichi dragons",
    name: "Тюничи Дрэгонс",
    shortName: "Тюничи",
    league: "NPB",
    division: "Центральная лига",
    country: "Япония",
    logo: "CD",
    rank: 6,
    form: "-",
    aliases: ["chunichi dragons", "chunichi", "тюничи дрэгонс", "тюничи", "чуничи драгонс", "чуничи"]
  },
  {
    id: "fukuoka softbank hawks",
    name: "Фукуока Софтбанк Хоукс",
    shortName: "Софтбанк",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "/teams/softbank-hawks.png",
    rank: 1,
    form: "-",
    aliases: ["fukuoka softbank hawks", "softbank hawks", "fukuoka hawks", "фукуока софтбанк хоукс", "софтбанк хоукс", "фукуока хоукс", "фукуока софтбанк хокс", "софтбанк хокс", "фукуока хокс"]
  },
  {
    id: "saitama seibu lions",
    name: "Сайтама Сэйбу Лайонс",
    shortName: "Сэйбу",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "SL",
    rank: 2,
    form: "-",
    aliases: ["saitama seibu lions", "saitama lions", "seibu lions", "сайтама сэйбу лайонс", "сайтама сейбу лайонс", "сайтама лайонс", "сэйбу лайонс", "сейбу лайонс", "сайтама"]
  },
  {
    id: "hokkaido nippon ham fighters",
    name: "Хоккайдо Ниппон-Хэм Файтерс",
    shortName: "Ниппон-Хэм",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "NF",
    rank: 3,
    form: "-",
    aliases: ["hokkaido nippon ham fighters", "nippon ham fighters", "nippon-ham fighters", "хоккайдо ниппон хэм файтерс", "ниппон хэм файтерс", "ниппон-хэм файтерс"]
  },
  {
    id: "orix buffaloes",
    name: "Орикс Баффалос",
    shortName: "Орикс",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "OB",
    rank: 4,
    form: "-",
    aliases: ["orix buffaloes", "orix buffalos", "orix", "орикс баффалос", "орикс буффалос", "орикс"]
  },
  {
    id: "chiba lotte marines",
    name: "Чиба Лотте Маринс",
    shortName: "Чиба Лотте",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "CM",
    rank: 5,
    form: "-",
    aliases: ["chiba lotte marines", "chiba marines", "lotte marines", "chiba lotte", "чиба лотте маринс", "тиба лотте маринс", "чиба маринс", "тиба маринс", "чиба мэринс", "тиба мэринс", "лотте маринс", "лотте мэринс"]
  },
  {
    id: "tohoku rakuten golden eagles",
    name: "Тохоку Ракутен Голден Иглс",
    shortName: "Ракутен",
    league: "NPB",
    division: "Тихоокеанская лига",
    country: "Япония",
    logo: "RE",
    rank: 6,
    form: "-",
    aliases: ["tohoku rakuten golden eagles", "rakuten golden eagles", "tohoku rakuten", "тохоку раку-тен голден иглс", "тохоку ракутен голден иглс", "ракутен голден иглс", "ракутен"]
  }
];

function normalizeNpbTeamName(value: string): string {
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

const NPB_TEAM_BY_ALIAS = new Map(
  NPB_TEAMS.flatMap(team => (
    [team.id, team.name, team.shortName, ...team.aliases]
      .map(alias => [normalizeNpbTeamName(alias), team] as const)
  ))
);

function teamIdTail(teamId?: string): string {
  return String(teamId || "").split(":").pop() || "";
}

export function resolveNpbTeam(value: string, teamId?: string): NpbTeamProfile | null {
  const candidates = [teamIdTail(teamId), value].map(normalizeNpbTeamName).filter(Boolean);

  for (const candidate of candidates) {
    const exact = NPB_TEAM_BY_ALIAS.get(candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const contained = Array.from(NPB_TEAM_BY_ALIAS.entries()).find(([alias]) => (
      alias.length >= 4 && (candidate.includes(alias) || alias.includes(candidate))
    ));
    if (contained) return contained[1];
  }

  return null;
}

export function isNpbMatchContext(country: string, league: string, home = "", away = ""): boolean {
  const context = normalizeNpbTeamName(`${country} ${league}`);
  if (/reserve|резерв|farm|minor/.test(context)) return false;
  if (/\bnpb\b|japan|япон|чемпионат японии/.test(context)) return true;
  return Boolean(resolveNpbTeam(home) && resolveNpbTeam(away));
}

export function npbTeamId(team: NpbTeamProfile): string {
  return `baseball:japan:npb:${team.id}`;
}
