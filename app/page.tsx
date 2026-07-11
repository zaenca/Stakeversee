"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "register";
type AuthStatus = "idle" | "loading" | "ok" | "error";

const features = [
  {
    title: "Контроль банка",
    text: "Ставки, возвраты, фрибеты, P&L и ROI будут жить в аккаунте, а не в памяти браузера."
  },
  {
    title: "Источники и фильтры",
    text: "Источники, чёрный список и статистика будут храниться централизованно и не потеряются при смене устройства."
  },
  {
    title: "Матчи и результаты",
    text: "Следующий этап — перенос загрузки линий, коэффициентов и результатов на сервер."
  }
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState("");

  const supabaseHost = useMemo(() => {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.local").host;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.display_name || user.email.split("@")[0]
    }).then();
  }, [user]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanEmail || !password || (mode === "register" && !cleanName)) {
      setStatus("error");
      setMessage("Заполни email, пароль и имя для регистрации.");
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("ok");
      setMessage("Вход выполнен.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: cleanName
        }
      }
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (data.session && data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: cleanEmail,
        display_name: cleanName
      });
    }

    setStatus("ok");
    setMessage("Аккаунт создан. Если Supabase просит подтверждение почты, открой письмо.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setStatus("idle");
    setMessage("");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Stakeversee</div>
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
          {user ? (
            <button className="secondary" onClick={handleLogout}>Выйти</button>
          ) : null}
        </header>

        <div className="content">
          <section className="hero">
            <div className="panel hero-copy">
              <div className="eyebrow">Betting command center</div>
              <h1>Stakeversee держит ставки, банк и аналитику под контролем.</h1>
              <p className="lead">
                Веб-версия заменит локальное расширение: аккаунты, история ставок,
                источники, чёрный список, банк и статистика будут храниться онлайн.
              </p>
              <div className="actions">
                <a className="primary link-button" href="https://stakeversee.vercel.app">
                  Production
                </a>
                <button className="secondary">Схема базы готова</button>
              </div>
            </div>

            <section className="panel auth-panel" aria-label="Авторизация">
              {user ? (
                <div className="account-card">
                  <div className="eyebrow">Аккаунт активен</div>
                  <h2>{user.user_metadata?.display_name || user.email}</h2>
                  <p>Теперь можно подключать перенос ставок, источников и банка в Supabase.</p>
                  <div className="account-meta">
                    <span>Email</span>
                    <strong>{user.email}</strong>
                  </div>
                </div>
              ) : (
                <>
                  <div className="auth-tabs">
                    <button
                      className={mode === "login" ? "active" : ""}
                      onClick={() => setMode("login")}
                      type="button"
                    >
                      Вход
                    </button>
                    <button
                      className={mode === "register" ? "active" : ""}
                      onClick={() => setMode("register")}
                      type="button"
                    >
                      Регистрация
                    </button>
                  </div>

                  <form className="auth-form" onSubmit={handleAuth}>
                    {mode === "register" ? (
                      <label>
                        Имя
                        <input
                          autoComplete="name"
                          onChange={event => setDisplayName(event.target.value)}
                          placeholder="Семик"
                          value={displayName}
                        />
                      </label>
                    ) : null}

                    <label>
                      Email
                      <input
                        autoComplete="email"
                        onChange={event => setEmail(event.target.value)}
                        placeholder="you@mail.com"
                        type="email"
                        value={email}
                      />
                    </label>

                    <label>
                      Пароль
                      <input
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={6}
                        onChange={event => setPassword(event.target.value)}
                        placeholder="минимум 6 символов"
                        type="password"
                        value={password}
                      />
                    </label>

                    <button className="primary" disabled={status === "loading"} type="submit">
                      {status === "loading"
                        ? "Подождите..."
                        : mode === "login"
                          ? "Войти"
                          : "Создать аккаунт"}
                    </button>

                    {message ? <p className={`auth-message ${status}`}>{message}</p> : null}
                  </form>
                </>
              )}
            </section>
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
