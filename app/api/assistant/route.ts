import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IncomingMatch = {
  away: string;
  confidence: number;
  home: string;
  league: string;
  odds: string[];
  recommendationSide: "home" | "draw" | "away";
  sport: string;
};

type HistoryEntry = {
  role: "user" | "assistant";
  text: string;
};

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function recommendationText(match: IncomingMatch): string {
  if (match.recommendationSide === "draw") return "Ничья";
  if (match.recommendationSide === "away") return `Победа ${match.away}`;
  return `Победа ${match.home}`;
}

function buildMatchesContext(matches: IncomingMatch[]): string {
  if (!matches.length) return "Матчи ещё не загружены.";

  return matches
    .map((match) => {
      const odds = match.odds.join(" / ");
      return `[${match.sport}] ${match.home} — ${match.away} (${match.league}) | кэфы П1/Х/П2: ${odds} | рекомендация: ${recommendationText(match)} ${match.confidence}%`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY не настроен на сервере. Добавь его в Environment Variables на Vercel." },
      { status: 500 }
    );
  }

  let body: { history?: HistoryEntry[]; matches?: IncomingMatch[]; message?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const message = String(body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "Пустое сообщение." }, { status: 400 });
  }

  const matches = Array.isArray(body.matches) ? body.matches.slice(0, 30) : [];
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  const systemPrompt = `Ты — AI-аналитик внутри приложения Stakeversee для анализа спортивных ставок.
Твоя задача: помогать пользователю принимать обоснованные решения по ставкам на основе данных о текущих матчах.

ДАННЫЕ МАТЧЕЙ (топ-${matches.length} по уверенности модели, вероятность взята из коэффициентов букмекера с учётом маржи):
${buildMatchesContext(matches)}

ПРАВИЛА:
- Отвечай на русском, кратко и по делу
- Используй **жирный** для ключевых выводов
- Для топ-пиков указывай: матч, рекомендуемый исход, вероятность, короткое обоснование
- Никогда не давай гарантий на исход — вероятность есть вероятность
- Если данных недостаточно для ответа — честно скажи об этом
- Максимум 220 слов на ответ`;

  const anthropicMessages = [
    ...history.map((entry) => ({
      content: entry.text,
      role: entry.role === "assistant" ? "assistant" : "user"
    })),
    { content: message, role: "user" }
  ];

  try {
    const response = await fetch(ANTHROPIC_URL, {
      body: JSON.stringify({
        max_tokens: 1024,
        messages: anthropicMessages,
        model: ANTHROPIC_MODEL,
        system: systemPrompt
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      method: "POST"
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error", response.status, errorText);
      return NextResponse.json({ error: "Ассистент временно недоступен." }, { status: 502 });
    }

    const data = await response.json();
    const reply = Array.isArray(data?.content)
      ? data.content
          .filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text)
          .join("\n")
      : "";

    return NextResponse.json({ reply: reply || "Не удалось получить ответ." });
  } catch (error) {
    console.error("Assistant route failed", error);
    return NextResponse.json({ error: "Ассистент временно недоступен." }, { status: 500 });
  }
}
