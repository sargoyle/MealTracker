-- Meal Tracker Supabase/Postgres schema.
-- Safe to apply before changing the app runtime.
-- Existing SQLite UUID strings can be imported directly into these uuid columns.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  meal_name text not null check (char_length(meal_name) <= 200),
  meal_type text not null default 'Dinner' check (meal_type in ('Dinner', 'Breakfast', 'Lunch')),
  image_url text,
  ingredients_image_url text,
  nutrition_image_url text,
  description text,
  rating text not null default 'Not rated' check (rating in ('Favourite', 'Fine', 'Avoid', 'Not rated')),
  notes text,
  last_ordered_date date,
  season text check (season is null or season in ('Autumn', 'Winter', 'Spring', 'Summer')),
  week_number integer check (week_number is null or week_number > 0),
  day_available text check (
    day_available is null
    or day_available in ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
  ),
  status text not null default 'Active' check (status in ('Active', 'Removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_orders (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  ordered_week_start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_orders_meal_week_unique unique (meal_id, ordered_week_start_date)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_meals_updated_at on public.meals;
create trigger set_meals_updated_at
before update on public.meals
for each row
execute function public.set_updated_at();

drop trigger if exists set_meal_orders_updated_at on public.meal_orders;
create trigger set_meal_orders_updated_at
before update on public.meal_orders
for each row
execute function public.set_updated_at();

create index if not exists meals_status_idx on public.meals (status);
create index if not exists meals_rating_idx on public.meals (rating);
create index if not exists meals_meal_type_idx on public.meals (meal_type);
create index if not exists meals_status_rating_idx on public.meals (status, rating);
create index if not exists meals_status_meal_type_idx on public.meals (status, meal_type);
create index if not exists meals_season_week_idx on public.meals (season, week_number);
create index if not exists meals_name_lower_idx on public.meals (lower(meal_name));
create index if not exists meals_name_trgm_idx on public.meals using gin (lower(meal_name) gin_trgm_ops);
create index if not exists meals_default_sort_idx
  on public.meals ((case rating when 'Avoid' then 1 else 0 end), lower(meal_name));
create index if not exists meals_active_dinner_sort_idx
  on public.meals (status, meal_type, (case rating when 'Avoid' then 1 else 0 end), lower(meal_name));

create index if not exists meal_orders_meal_date_desc_idx
  on public.meal_orders (meal_id, ordered_week_start_date desc);
create index if not exists meal_orders_date_desc_idx
  on public.meal_orders (ordered_week_start_date desc);

create or replace view public.meal_with_stats as
select
  m.id,
  m.meal_name,
  m.meal_type,
  m.image_url,
  m.ingredients_image_url,
  m.nutrition_image_url,
  m.description,
  m.rating,
  m.notes,
  coalesce(max(o.ordered_week_start_date), m.last_ordered_date) as last_ordered_date,
  m.season,
  m.week_number,
  m.day_available,
  m.status,
  m.created_at,
  m.updated_at,
  count(o.id)::integer as order_count
from public.meals m
left join public.meal_orders o on o.meal_id = m.id
group by m.id;

comment on table public.meals is 'Meal Tracker meal library migrated from local SQLite.';
comment on table public.meal_orders is 'Dinner order history, one row per meal per Thursday week.';
comment on view public.meal_with_stats is 'Compatibility view for list/detail pages that need derived last_ordered_date and order_count.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-images',
  'meal-images',
  true,
  12000000,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS recommendation:
-- Do not enable row level security until the app has an agreed authentication model.
-- For a server-only Vercel API using the Supabase service role key, RLS can remain disabled initially.
-- If the browser later talks directly to Supabase, enable RLS and add owner-based or private single-user policies before exposing keys.
