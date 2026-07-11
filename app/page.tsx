import { supabase } from "@/lib/supabase";

const features = [
  {
    title: "Контроль банка",
    text: "Ставки, возвраты, фрибеты, P&L и ROI должны жить в аккаунте, а не в памяти браузера."
  },
  {
    title: "Источники и фильтры",
    text: "Каждый источник, чёрный список и статистика будут храниться централизованно и не потеряются при смене устройства."
  },
  {
    title: "Матчи и результаты",
    text: "Следующий этап — вынести загрузку линий и результатов на сервер, чтобы не упираться в память Opera."
  }
];

export default function Home() {
  const supabaseHost = new URL(supabase.supabaseUrl).host;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Stakeverse</div>
        <div className="brand-caption">control · optimize · profit</div>
        <nav className="nav" aria-label="Основная навигация">
          <button className="active">Панель</button>
          <button>Ставки</button>
          <button>Источники</button>
          <button>Банкролл</button>
          <button>AI анализ</button>
        </nav>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="supabase-ok">
            <span className="status-dot" />
            Supabase подключён: {supabaseHost}
          </div>
          <button className="secondary">Войти</button>
        </header>

        <div className="content">
          <section className="hero">
            <div className="panel hero-copy">
              <div className="eyebrow">Betting command center</div>
              <h1>Stakeverse держит ставки, банк и аналитику под контролем.</h1>
              <p className="lead">
                Первый веб-каркас готовится как замена локальному расширению: аккаунты,
                история ставок, источники, чёрный список и статистика будут храниться
                онлайн и переживать любой браузер, диск и переустановку.
              </p>
              <div className="actions">
                <button className="primary">Начать перенос данных</button>
                <button className="secondary">Схема базы</button>
              </div>
            </div>

            <div className="panel metric-grid" aria-label="Плановые метрики">
              <div className="metric">
                <div className="metric-label">Цель</div>
                <div className="metric-value green">ROI+</div>
              </div>
              <div className="metric">
                <div className="metric-label">Хранилище</div>
                <div className="metric-value cyan">Cloud</div>
              </div>
              <div className="metric">
                <div className="metric-label">Риск потери данных</div>
                <div className="metric-value amber">0</div>
              </div>
            </div>
          </section>

          <section className="section-grid">
            {features.map(feature => (
              <article className="panel feature" key={feature.title}>
                <h2>{feature.title}</h2>
                <p>{feature.text}</p>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
