"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ru" | "en";

const STORAGE_KEY = "stakeverse_lang";

// RU -> EN dictionary. Any Russian string not listed here is shown as-is
// (safe fallback instead of crashing / showing "undefined").
export const translations: Record<string, string> = {
  // ── Top bar / actions ──────────────────────────────────────
  "Сохранить": "Save",
  "Открыть": "Open",
  "Ассистент": "Assistant",
  "AI анализ": "AI analysis",
  "Выйти": "Log out",
  "Линия": "Line",
  "обновляю...": "updating...",
  "Автообновление каждые 5 минут": "Auto-refresh every 5 minutes",
  "Из кэша:": "From cache:",
  "Автообновлено:": "Auto-updated:",
  "матчей": "matches",
  "Часовой пояс": "Time zone",
  "игрок": "player",
  "Игрок": "Player",
  "Основная навигация": "Main navigation",
  "Виды спорта": "Sports",
  "Язык интерфейса": "Interface language",
  "Настройки": "Settings",
  "Аватар": "Avatar",
  "Изменить фото": "Change photo",
  "Язык": "Language",
  "Панель": "Dashboard",
  "Ставки": "Bets",
  "Источники": "Sources",
  "Банкролл": "Bankroll",

  // ── Sports ─────────────────────────────────────────────────
  "Все": "All",
  "Волейбол": "Volleyball",
  "Теннис": "Tennis",
  "Баскет": "Basketball",
  "Хоккей": "Hockey",
  "Гандбол": "Handball",
  "Кибер": "Esports",
  "Футбол": "Football",
  "Бейсбол": "Baseball",

  // ── Match filters ──────────────────────────────────────────
  "Страна:": "Country:",
  "Лига:": "League:",
  "Все страны": "All countries",
  "Все лиги": "All leagues",
  "🔥 Горячие": "🔥 Hot",
  "✅ Хорошие": "✅ Good",
  "⭐ Избранные": "⭐ Favorites",
  "🔍 Поиск...": "🔍 Search...",
  "Матчи не найдены": "No matches found",
  "Загружаю матчи": "Loading matches",
  "форма 5к · вес 3": "form L5 · weight 3",
  "Рекомендация": "Recommendation",
  "Победа": "Win",
  "хорошо": "good",
  "Ничья": "Draw",
  "горячо": "hot",
  "нейтрально": "neutral",
  "⚡ Анализ": "⚡ Analysis",
  "⏳ Анализирую...": "⏳ Analyzing...",
  "✅ Анализ завершён:": "✅ Analysis complete:",
  "Не удалось выполнить анализ.": "Analysis failed.",
  "Ассистент временно недоступен.": "Assistant is temporarily unavailable.",
  "AI Ассистент": "AI Assistant",
  "Закрыть ассистента": "Close assistant",
  "Топ-пики": "Top picks",
  "Value bets": "Value bets",
  "Риски": "Risks",
  "Дай топ-3 самых интересных матча сейчас и объясни почему.": "Give me the top 3 most interesting matches right now and explain why.",
  "Есть ли сейчас явный value bet среди загруженных матчей?": "Is there a clear value bet among the loaded matches right now?",
  "На что обратить внимание — риски и неоднозначные матчи?": "What should I watch out for — risks and ambiguous matches?",
  "Спроси про матчи, попроси топ-пики или разбор конкретной ставки.": "Ask about matches, request top picks, or a breakdown of a specific bet.",
  "думаю…": "thinking…",
  "Спроси про матчи...": "Ask about matches...",
  "П1 · лучший": "1 · best",
  "П2 · лучший": "2 · best",
  "Х": "Draw",
  "✓ В купоне": "✓ In coupon",
  "+ Добавить в купон": "+ Add to coupon",
  "Нажми на карточку матча, чтобы добавить его в купон.": "Click a match card to add it to the coupon.",

  // ── Coupon ─────────────────────────────────────────────────
  "🎫 Купон": "🎫 Coupon",
  "Одиночная ставка": "Single bet",
  "Исход": "Selection",
  "Кэф": "Odds",
  "Ставка ₽": "Stake ₽",
  "Фрибет": "Freebet",
  "Флэт": "Flat",
  "Флэта": "flat",
  "флэта:": "flat:",
  "Текущий флэт:": "Current flat:",
  "Задай фиксированную сумму ставки, чтобы быстро выбирать её в купоне.": "Set a fixed stake amount to quickly pick it in the coupon.",
  "Задай флэт в настройках профиля": "Set a flat stake in profile settings",
  "Сумма флэта ₽": "Flat amount ₽",
  "от банка": "of bank",
  "Процент от текущего баланса": "Percentage of current balance",
  "Возможный выигрыш": "Possible payout",
  "Очистить": "Clear",
  "Сохранить прогноз": "Save prediction",
  "Добавить источник": "Add source",
  "— выберите источник —": "— select a source —",
  "— выберите букмекера —": "— select a bookmaker —",
  "Закрыть": "Close",
  "Название источника": "Source name",
  "Отмена": "Cancel",
  "Добавить": "Add",
  "Тотал": "Total",
  "Фора": "Handicap",
  "Обе забьют": "Both to score",
  "Точный счёт": "Correct score",
  "Инд. тотал": "Player total",
  "Экспресс": "Accumulator",
  "события": "events",

  // ── Bank panel ─────────────────────────────────────────────
  "💰 Банк": "💰 Bank",
  "↺ Пересчитать": "↺ Recalculate",
  "Пересчитать баланс из ставок": "Recalculate balance from bets",
  "Пересчитать баланс из текущих ставок? Устаревшие или задвоенные записи о выигрышах/проигрышах будут заменены на актуальные. Пополнения и выводы не изменятся.":
    "Recalculate the balance from current bets? Stale or duplicate win/loss/return records will be replaced with up-to-date ones. Deposits and withdrawals will not change.",
  "Баланс пересчитан.": "Balance recalculated.",
  "Ставок": "Bets",
  "Выиграно": "Won",
  "Проиграно": "Lost",
  "Баланс": "Balance",
  "Пополнить банк": "Deposit",
  "Вывести из банка": "Withdraw",
  "Без источника": "No source",
  "📊 Статистика": "📊 Statistics",

  // ── Calendar ───────────────────────────────────────────────
  "Календарь прогнозов": "Prediction calendar",
  "Пн": "Mo",
  "Вт": "Tu",
  "Ср": "We",
  "Чт": "Th",
  "Пт": "Fr",
  "Сб": "Sa",
  "Вс": "Su",
  "Ставки за день": "Bets for the day",
  "В этот день ставок нет.": "No bets on this day.",

  // ── Stats modal ────────────────────────────────────────────
  "Статистика источников": "Source statistics",
  "Закрыть статистику": "Close statistics",
  "Рассчитанные ставки": "Settled bets",
  "Источник": "Source",
  "ROI": "ROI",
  "В/П": "W/L",
  "% побед": "Win %",
  "Ср. кэф": "Avg odds",
  "Сумма": "Stake",
  "Средняя": "Average",
  "Все прогнозы": "All predictions",
  "Фиксированная ставка": "Fixed stake",
  "Добавить в чёрный список": "Add to blacklist",
  "Этот источник в чёрном списке и не может быть добавлен снова.": "This source is blacklisted and can't be added again.",
  "Источник с таким названием уже существует.": "A source with this name already exists.",
  "Переименовать источник": "Rename source",
  "Фикс. ставка:": "Fixed stake:",
  "Задать фиксированную ставку для этого источника": "Set a fixed stake for this source",
  "Рассчитанные ставки появятся здесь после выигрыша, проигрыша или возврата.":
    "Settled bets will appear here after a win, loss, or return.",
  "Статистика по букмекерам": "Bookmaker statistics",
  "Букмекер": "Bookmaker",
  "Прибыль": "Profit",
  "Пополнения и выводы": "Deposits and withdrawals",
  "Пополнено": "Deposited",
  "Выведено": "Withdrawn",
  "Итого": "Total",
  "Пополнение": "Deposit",
  "Вывод": "Withdrawal",
  "В купоне максимум": "The coupon allows a maximum of",
  "матчей.": "matches.",
  "Пополнения и выводы появятся здесь после первой операции с балансом.":
    "Deposits and withdrawals will appear here after the first balance change.",
  "Все прогнозы источника": "All predictions from source",
  "У этого источника пока нет прогнозов.": "This source has no predictions yet.",

  // ── Quick bet / sources panel ──────────────────────────────
  "Быстрая ставка": "Quick bet",
  "Добавить в статистику": "Add to statistics",
  "Матч": "Match",
  "Коэффициент": "Odds",
  "Чёрный список и ROI": "Blacklist and ROI",
  "Источники появятся после добавления.": "Sources will appear once added.",

  // ── Auth ───────────────────────────────────────────────────
  "Авторизация": "Sign in",
  "Вход": "Log in",
  "Войти": "Log in",
  "Регистрация": "Register",
  "Создать аккаунт": "Create account",
  "Подождите...": "Please wait...",
  "Имя": "Name",
  "Никнейм": "Nickname",
  "Email": "Email",
  "Пароль": "Password",
  "минимум 6 символов": "minimum 6 characters",
  "Заполни email, пароль и имя для регистрации.": "Fill in email, password, and name to register.",
  "Заполни email, пароль и никнейм для регистрации.": "Fill in email, password, and nickname to register.",
  "Вход выполнен.": "Logged in.",
  "Аккаунт создан. Если Supabase просит подтверждение почты, открой письмо.":
    "Account created. If Supabase asks for email confirmation, check your inbox.",
  "Схема базы готова": "Database schema ready",
  "Production": "Production",
  "Betting command center": "Betting command center",
  "Stakeversee держит ставки, банк и аналитику под контролем.":
    "Stakeversee keeps your bets, bankroll, and analytics under control.",
  "Веб-версия заменит локальное расширение: аккаунты, история ставок, источники, чёрный список, банк и статистика будут храниться онлайн.":
    "The web version will replace the local extension: accounts, bet history, sources, blacklist, bankroll, and statistics will be stored online.",
  "Supabase подключён:": "Supabase connected:",

  // ── Feature cards ──────────────────────────────────────────
  "Контроль банка": "Bankroll control",
  "Ставки, возвраты, фрибеты, P&L и ROI будут жить в аккаунте, а не в памяти браузера.":
    "Bets, returns, freebets, P&L, and ROI will live in your account, not in browser memory.",
  "Источники и фильтры": "Sources and filters",
  "Источники, чёрный список и статистика будут храниться централизованно и не потеряются при смене устройства.":
    "Sources, blacklist, and statistics will be stored centrally and won't be lost when switching devices.",
  "Матчи и результаты": "Matches and results",
  "Следующий этап — перенос загрузки линий, коэффициентов и результатов на сервер.":
    "The next step is moving line, odds, and results loading to the server.",

  // ── Bet card ───────────────────────────────────────────────
  "Время ставки": "Bet time",
  "Отменить редактирование": "Cancel editing",
  "Редактировать прогноз": "Edit prediction",
  "Сумма ₽": "Amount ₽",
  "БК не указан": "Bookmaker not set",
  "Убрать источник": "Remove source",
  "Добавить ещё один источник": "Add another source",
  "Больше источников нет": "No more sources",
  "Выигрыш": "Win",
  "Проигрыш": "Loss",
  "Возврат": "Return",
  "Ожидает": "Pending",

  // ── Bank modal ─────────────────────────────────────────────
  "Пополнение букмекера": "Bookmaker deposit",
  "Вывод от букмекера": "Bookmaker withdrawal",

  // ── Errors / messages ──────────────────────────────────────
  "Ошибка загрузки данных.": "Failed to load data.",
  "Для купона нужны букмекер, источник и сумма ставки или фрибета.":
    "The coupon needs a bookmaker, a source, and a stake or freebet amount.",
  "Для ставки нужны источник, матч, исход, коэффициент и сумма.":
    "The bet needs a source, match, selection, odds, and amount.",
  "Добавь хотя бы один матч в купон.": "Add at least one match to the coupon.",
  "Проверь исходы и коэффициенты в купоне.": "Check the selections and odds in the coupon.",
  "Проверь коэффициент и сумму ставки.": "Check the odds and stake amount.",
  "Укажи сумму движения банка.": "Enter the bankroll transaction amount.",
  "Купон сохранён в ставки.": "Coupon saved to bets.",

  // ── Timezones ──────────────────────────────────────────────
  "Калининград (UTC+2)": "Kaliningrad (UTC+2)",
  "Москва (UTC+3)": "Moscow (UTC+3)",
  "Самара (UTC+4)": "Samara (UTC+4)",
  "Екатеринбург (UTC+5)": "Yekaterinburg (UTC+5)",
  "Омск (UTC+6)": "Omsk (UTC+6)",
  "Красноярск (UTC+7)": "Krasnoyarsk (UTC+7)",
  "Иркутск (UTC+8)": "Irkutsk (UTC+8)",
  "Якутск (UTC+9)": "Yakutsk (UTC+9)",
  "Владивосток (UTC+10)": "Vladivostok (UTC+10)",
  "Магадан (UTC+11)": "Magadan (UTC+11)",
  "Камчатка (UTC+12)": "Kamchatka (UTC+12)",
  "UTC+0 (Лондон)": "UTC+0 (London)",
  "UTC+1 (Берлин)": "UTC+1 (Berlin)",

  // ── Countries ──────────────────────────────────────────────
  "Россия": "Russia",
  "Англия": "England",
  "США": "USA",
  "Германия": "Germany",
  "Франция": "France",
  "Испания": "Spain",
  "Италия": "Italy",
  "Япония": "Japan",
  "Бразилия": "Brazil",
  "Австралия": "Australia",
  "Китай": "China",
  "Южная Корея": "South Korea",
  "Польша": "Poland",
  "Турция": "Turkey",
  "Украина": "Ukraine",
  "Нидерланды": "Netherlands",
  "Бельгия": "Belgium",
  "Португалия": "Portugal",
  "Аргентина": "Argentina",
  "Мексика": "Mexico",
  "Канада": "Canada",
  "Сербия": "Serbia",
  "Хорватия": "Croatia",
  "Чехия": "Czech Republic",
  "Румыния": "Romania",
  "Швеция": "Sweden",
  "Норвегия": "Norway",
  "Дания": "Denmark",
  "Финляндия": "Finland",
  "Швейцария": "Switzerland",
  "Австрия": "Austria",
  "Греция": "Greece",
  "Венгрия": "Hungary",
  "Словакия": "Slovakia",
  "Болгария": "Bulgaria",
  "Израиль": "Israel",
  "Казахстан": "Kazakhstan",
  "Беларусь": "Belarus",
  "Таиланд": "Thailand",
  "Индия": "India",
  "Тайвань": "Taiwan",
  "Мир": "World",
  "Новая Зеландия": "New Zealand",
  "Индонезия": "Indonesia",
  "Иран": "Iran",
  "ОАЭ": "United Arab Emirates",
  "Катар": "Qatar",
  "Чили": "Chile",
  "Колумбия": "Colombia",
  "Перу": "Peru",
  "Египет": "Egypt",
  "Марокко": "Morocco",
  "Тунис": "Tunisia",
  "Литва": "Lithuania",
  "Латвия": "Latvia",
  "Эстония": "Estonia",
  "Филиппины": "Philippines",
  "Саудовская Аравия": "Saudi Arabia",
  "Шотландия": "Scotland",
  "Уэльс": "Wales",
  "Ирландия": "Ireland",
  "Словения": "Slovenia",
  "Босния и Герцеговина": "Bosnia and Herzegovina",
  "Северная Македония": "North Macedonia",
  "Албания": "Albania",
  "Исландия": "Iceland",
  "Вьетнам": "Vietnam",
  "Малайзия": "Malaysia",
  "Сингапур": "Singapore",
  "Гонконг": "Hong Kong",

  // ── League samples ─────────────────────────────────────────
  "Мировые · Футбол": "World · Football",
  "Теннис · Singles": "Tennis · Singles",
  "Баскет · NBA": "Basketball · NBA",
  "Линия букмекеров пока не подключена": "Bookmaker line is not connected yet",
  "Линия букмекеров": "Bookmaker line",
  "Букмекер не указан": "Bookmaker not specified",
  "Тестовая ставка": "Test bet",
  "Семик": "Alex",
};

export function translate(text: string, lang: Lang): string {
  if (lang === "ru") return text;
  return translations[text] ?? text;
}

export function localeFor(lang: Lang): string {
  return lang === "en" ? "en-US" : "ru-RU";
}

export function translateBetMarket(market: string, lang: Lang): string {
  if (lang === "ru") return market;
  const expressMatch = market.match(/^Экспресс · (\d+) события$/);
  if (expressMatch) {
    const count = expressMatch[1];
    return `Accumulator · ${count} events`;
  }
  return translations[market] ?? market;
}

export function translateBookmakerLabel(bookmaker: string, lang: Lang): string {
  if (lang === "ru") return bookmaker;
  if (bookmaker.endsWith(" · Фрибет")) {
    return `${bookmaker.slice(0, -" · Фрибет".length)} · Freebet`;
  }
  return translations[bookmaker] ?? bookmaker;
}

export function translateBetSelectionLine(selection: string, lang: Lang): string {
  // Used for express-bet selection strings like "Победа: Team A | Тотал: 2.5"
  if (lang === "ru") return selection;
  return selection
    .split(" | ")
    .map(part => {
      const idx = part.indexOf(": ");
      if (idx === -1) return part;
      const market = part.slice(0, idx);
      const rest = part.slice(idx + 2);
      return `${translations[market] ?? market}: ${rest}`;
    })
    .join(" | ");
}


type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "ru",
  setLang: () => {},
  t: (text: string) => text,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ru");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "ru") setLangState(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value: LanguageContextValue = {
    lang,
    setLang: setLangState,
    t: (text: string) => translate(text, lang),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
