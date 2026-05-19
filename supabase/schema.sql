-- ============================================
-- Mon Coach Bien-Être — Schéma Supabase
-- ============================================

-- Table : profiles
create table if not exists profiles (
  id uuid references auth.users primary key,
  created_at timestamp with time zone default now(),
  first_name text,
  weight_start numeric,
  weight_target numeric,
  height numeric,
  birth_date date,
  gender text,
  profession text,
  treatment text,
  treatment_frequency text,
  knee_issue boolean default false,
  equipment text[],
  fitness_level text default 'sedentaire'
);

-- Table : weight_logs
create table if not exists weight_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  weight numeric not null,
  created_at timestamp with time zone default now(),
  unique(user_id, date)
);

-- Table : journal_entries
create table if not exists journal_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  hygiene jsonb,
  alim jsonb,
  sport jsonb,
  sante jsonb,
  created_at timestamp with time zone default now(),
  unique(user_id, date)
);

-- Table : treatment_logs
create table if not exists treatment_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null,
  treatment_name text,
  done boolean default true,
  notes text,
  created_at timestamp with time zone default now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table profiles enable row level security;
alter table weight_logs enable row level security;
alter table journal_entries enable row level security;
alter table treatment_logs enable row level security;

-- Policies : profiles
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Policies : weight_logs
create policy "Users can view own weight logs"
  on weight_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own weight logs"
  on weight_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own weight logs"
  on weight_logs for update
  using (auth.uid() = user_id);

create policy "Users can delete own weight logs"
  on weight_logs for delete
  using (auth.uid() = user_id);

-- Policies : journal_entries
create policy "Users can view own journal"
  on journal_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own journal"
  on journal_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own journal"
  on journal_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own journal"
  on journal_entries for delete
  using (auth.uid() = user_id);

-- Policies : treatment_logs
create policy "Users can view own treatment logs"
  on treatment_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own treatment logs"
  on treatment_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own treatment logs"
  on treatment_logs for update
  using (auth.uid() = user_id);

create policy "Users can delete own treatment logs"
  on treatment_logs for delete
  using (auth.uid() = user_id);
