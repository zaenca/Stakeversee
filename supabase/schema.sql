create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_blacklisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  event_name text not null,
  sport text,
  tournament text,
  bookmaker text,
  market text not null,
  selection text not null,
  odds numeric(10, 3) not null,
  stake numeric(12, 2) not null default 0,
  is_freebet boolean not null default false,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'return')),
  profit numeric(12, 2),
  event_starts_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bankroll_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bet_id uuid references public.bets(id) on delete set null,
  amount numeric(12, 2) not null,
  kind text not null check (kind in ('deposit', 'withdrawal', 'stake', 'win', 'loss', 'return', 'adjustment')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.bets enable row level security;
alter table public.bankroll_events enable row level security;

create policy "profiles own rows"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "sources own rows"
  on public.sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bets own rows"
  on public.bets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bankroll own rows"
  on public.bankroll_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Позволяет прикрепить к одной ставке несколько источников
-- (source_id остаётся основным/первым источником, остальные - здесь)
alter table public.bets add column if not exists extra_source_ids uuid[] not null default '{}';

-- ══════════════════════════════════════════════════════════════
-- AI ПРОГНОЗЫ — хранит рекомендации модели по каждому матчу,
-- чтобы позже сверить их с реальными результатами
-- (обучение на ошибках, этап 2).
-- ══════════════════════════════════════════════════════════════
create table if not exists public.ai_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  sport text,
  league text,
  home text not null,
  away text not null,
  odds text,
  recommendation_side text not null check (recommendation_side in ('home', 'draw', 'away')),
  confidence numeric(5, 2) not null,
  starts_at timestamptz,
  actual_result text check (actual_result in ('home', 'draw', 'away')),
  was_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

alter table public.ai_predictions enable row level security;

create policy "ai_predictions own rows"
  on public.ai_predictions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Фиксированная сумма ставки для источника (авто-подстановка в купон при выборе)
alter table public.sources add column if not exists fixed_stake numeric;
