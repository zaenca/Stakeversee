import { NextResponse } from "next/server";

type ApiMatch = {
  id: string;
  sport: string;
  country: string;
  league: string;
  home: string;
  away: string;
  odds: string[];
  confidence: number;
  startsAt: string;
};

const matchTemplates = [
  {
    sport: "football",
    country: "GB",
    league: "Англия · Премьер-лига",
    home: "Арсенал",
    away: "Челси",
    odds: ["1.92", "3.55", "4.20"],
    confidence: 64
  },
  {
    sport: "football",
    country: "ES",
    league: "Испания · Примера",
    home: "Барселона",
    away: "Валенсия",
    odds: ["1.46", "4.60", "6.80"],
    confidence: 68
  },
  {
    sport: "tennis",
    country: "WTA",
    league: "WTA · Страсбург",
    home: "Елена Рыбакина",
    away: "Марта Костюк",
    odds: ["1.58", "-", "2.46"],
    confidence: 59
  },
  {
    sport: "tennis",
    country: "ATP",
    league: "ATP · Галле",
    home: "Даниил Медведев",
    away: "Александр Зверев",
    odds: ["1.84", "-", "1.98"],
    confidence: 56
  },
  {
    sport: "basketball",
    country: "US",
    league: "Баскетбол · NBA",
    home: "Бостон Селтикс",
    away: "Нью-Йорк Никс",
    odds: ["1.72", "-", "2.12"],
    confidence: 57
  },
  {
    sport: "basketball",
    country: "ES",
    league: "Испания · ACB",
    home: "Реал Мадрид",
    away: "Барселона",
    odds: ["1.66", "-", "2.24"],
    confidence: 61
  },
  {
    sport: "ice-hockey",
    country: "RU",
    league: "Хоккей · КХЛ",
    home: "СКА",
    away: "ЦСКА",
    odds: ["2.05", "4.10", "2.95"],
    confidence: 55
  },
  {
    sport: "ice-hockey",
    country: "US",
    league: "Хоккей · NHL",
    home: "Нью-Йорк Рейнджерс",
    away: "Бостон Брюинз",
    odds: ["2.18", "4.25", "2.70"],
    confidence: 54
  },
  {
    sport: "volleyball",
    country: "IT",
    league: "Италия · Суперлига",
    home: "Перуджа",
    away: "Трентино",
    odds: ["1.78", "-", "2.06"],
    confidence: 58
  },
  {
    sport: "volleyball",
    country: "PL",
    league: "Польша · ПлюсЛига",
    home: "Закса",
    away: "Ястшембски",
    odds: ["2.02", "-", "1.82"],
    confidence: 53
  },
  {
    sport: "handball",
    country: "DE",
    league: "Германия · Бундеслига",
    home: "Киль",
    away: "Фленсбург",
    odds: ["1.91", "8.50", "2.18"],
    confidence: 57
  },
  {
    sport: "esports",
    country: "INT",
    league: "CS2 · BLAST",
    home: "MOUZ",
    away: "G2 Esports",
    odds: ["1.86", "-", "1.94"],
    confidence: 62
  },
  {
    sport: "esports",
    country: "INT",
    league: "Dota 2 · DreamLeague",
    home: "Team Spirit",
    away: "PARIVISION",
    odds: ["1.74", "-", "2.08"],
    confidence: 60
  },
  {
    sport: "baseball",
    country: "US",
    league: "Бейсбол · MLB",
    home: "Нью-Йорк Янкиз",
    away: "Бостон Ред Сокс",
    odds: ["1.82", "-", "2.02"],
    confidence: 56
  },
  {
    sport: "baseball",
    country: "US",
    league: "Бейсбол · MLB",
    home: "Лос-Анджелес Доджерс",
    away: "Сан-Франциско Джайентс",
    odds: ["1.64", "-", "2.28"],
    confidence: 63
  }
];

function getStartDate(index: number) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 45 + index * 95);
  return date;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = Number(searchParams.get("hours") || 72);
  const now = Date.now();
  const horizon = now + Math.max(1, hours) * 60 * 60 * 1000;

  const matches: ApiMatch[] = matchTemplates
    .map((match, index) => {
      const startsAt = getStartDate(index);
      return {
        ...match,
        id: `${match.sport}-${index}-${startsAt.toISOString().slice(0, 10)}`,
        startsAt: startsAt.toISOString()
      };
    })
    .filter(match => {
      const start = new Date(match.startsAt).getTime();
      return start > now && start <= horizon;
    });

  return NextResponse.json(
    {
      hours,
      matches,
      updatedAt: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=240, stale-while-revalidate=60"
      }
    }
  );
}
