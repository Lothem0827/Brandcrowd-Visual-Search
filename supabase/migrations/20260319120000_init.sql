-- Gridd: auth profiles, boards, moodboards, follows, catalogue, LLM caches, settings

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,32}$'),
  constraint profiles_handle_unique unique (handle)
);

create index profiles_handle_idx on public.profiles (handle);

-- ---------------------------------------------------------------------------
-- Boards
-- ---------------------------------------------------------------------------
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  is_public boolean not null default false,
  slug text not null,
  kind text not null default 'custom' check (kind in ('saved', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boards_owner_slug_unique unique (owner_id, slug)
);

create index boards_owner_idx on public.boards (owner_id);
create index boards_public_idx on public.boards (is_public) where is_public = true;

create table public.board_items (
  board_id uuid not null references public.boards (id) on delete cascade,
  template_id text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (board_id, template_id)
);

create index board_items_template_idx on public.board_items (template_id);

-- ---------------------------------------------------------------------------
-- Moodboards
-- ---------------------------------------------------------------------------
create table public.moodboards (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  query text not null default '',
  titles jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  selected integer not null default 0,
  harmony text not null default 'analogous',
  overrides jsonb not null default '{}'::jsonb,
  inspo_ids jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  slug text not null,
  is_draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moodboards_owner_slug_unique unique (owner_id, slug)
);

create index moodboards_owner_idx on public.moodboards (owner_id);
create index moodboards_public_idx on public.moodboards (is_public) where is_public = true;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id);

-- ---------------------------------------------------------------------------
-- User settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  grid jsonb not null default '{"columns":6,"gap":12,"radius":12}'::jsonb,
  last_used_board_id uuid references public.boards (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Template catalogue
-- ---------------------------------------------------------------------------
create table public.templates (
  template_id text primary key,
  slug text not null,
  category text not null default 'Instagram Post',
  industry text not null default 'Other',
  topic text not null default 'General',
  name text not null,
  display_title text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index templates_category_idx on public.templates (category);
create index templates_industry_idx on public.templates (industry);

create table public.template_details (
  template_id text primary key references public.templates (template_id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LLM caches
-- ---------------------------------------------------------------------------
create table public.llm_interpret_cache (
  cache_key text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table public.llm_moodboard_titles_cache (
  cache_key text primary key,
  titles jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger boards_updated_at before update on public.boards
  for each row execute function public.set_updated_at();
create trigger moodboards_updated_at before update on public.moodboards
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

create or replace function public.slugify(input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(coalesce(input, ''));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := trim(both '-' from s);
  if s = '' then
    s := 'item';
  end if;
  return left(s, 48);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate text;
  n integer := 0;
  meta_name text;
  meta_avatar text;
begin
  meta_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'user');
  meta_avatar := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
  base_handle := public.slugify(meta_name);
  base_handle := replace(base_handle, '-', '_');
  if length(base_handle) < 3 then
    base_handle := 'user';
  end if;
  base_handle := left(base_handle, 24);
  candidate := base_handle;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    candidate := left(base_handle, 24) || '_' || n::text;
  end loop;

  insert into public.profiles (id, handle, display_name, avatar_url)
  values (new.id, candidate, meta_name, meta_avatar);

  insert into public.user_settings (user_id) values (new.id);

  insert into public.boards (owner_id, name, kind, slug)
  values (new.id, 'Saved', 'saved', 'saved');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_items enable row level security;
alter table public.moodboards enable row level security;
alter table public.follows enable row level security;
alter table public.user_settings enable row level security;
alter table public.templates enable row level security;
alter table public.template_details enable row level security;
alter table public.llm_interpret_cache enable row level security;
alter table public.llm_moodboard_titles_cache enable row level security;

-- Profiles
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Boards
create policy "boards_select_own_or_public" on public.boards
  for select using (auth.uid() = owner_id or is_public = true);
create policy "boards_insert_own" on public.boards
  for insert with check (auth.uid() = owner_id);
create policy "boards_update_own" on public.boards
  for update using (auth.uid() = owner_id);
create policy "boards_delete_own" on public.boards
  for delete using (auth.uid() = owner_id and kind <> 'saved');

-- Board items
create policy "board_items_select" on public.board_items
  for select using (
    exists (
      select 1 from public.boards b
      where b.id = board_id and (b.owner_id = auth.uid() or b.is_public = true)
    )
  );
create policy "board_items_insert_own" on public.board_items
  for insert with check (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );
create policy "board_items_update_own" on public.board_items
  for update using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );
create policy "board_items_delete_own" on public.board_items
  for delete using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  );

-- Moodboards
create policy "moodboards_select_own_or_public" on public.moodboards
  for select using (auth.uid() = owner_id or (is_public = true and is_draft = false));
create policy "moodboards_insert_own" on public.moodboards
  for insert with check (auth.uid() = owner_id);
create policy "moodboards_update_own" on public.moodboards
  for update using (auth.uid() = owner_id);
create policy "moodboards_delete_own" on public.moodboards
  for delete using (auth.uid() = owner_id);

-- Follows
create policy "follows_select_all" on public.follows for select using (true);
create policy "follows_insert_self" on public.follows
  for insert with check (auth.uid() = follower_id);
create policy "follows_delete_self" on public.follows
  for delete using (auth.uid() = follower_id);

-- User settings
create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id);

-- Catalogue: public read
create policy "templates_select_all" on public.templates for select using (true);
create policy "template_details_select_all" on public.template_details for select using (true);

-- LLM caches: public read (writes via service role bypass RLS)
create policy "llm_interpret_cache_select" on public.llm_interpret_cache for select using (true);
create policy "llm_moodboard_titles_cache_select" on public.llm_moodboard_titles_cache for select using (true);
