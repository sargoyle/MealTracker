-- Add meal provider and archive support to existing Supabase projects.
-- Apply once in the Supabase SQL Editor before deploying code that filters by archive.

alter table public.meals
  add column if not exists meal_provider text;

alter table public.meals
  add column if not exists archive boolean not null default false;

-- Sara's existing imported meals are Lite n Easy records.
update public.meals
set meal_provider = 'Lite n Easy';

create index if not exists meals_archive_idx on public.meals (archive);

drop index if exists public.meals_active_dinner_sort_idx;
create index if not exists meals_active_dinner_sort_idx
  on public.meals (status, meal_type, archive, (case rating when 'Avoid' then 1 else 0 end), lower(meal_name));

drop view if exists public.meal_with_stats;

create view public.meal_with_stats as
select
  m.id,
  m.meal_name,
  m.meal_provider,
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
  m.archive,
  m.created_at,
  m.updated_at,
  count(o.id)::integer as order_count
from public.meals m
left join public.meal_orders o on o.meal_id = m.id
group by m.id;

comment on column public.meals.meal_provider is 'Free-text company/provider the meal is ordered from.';
comment on column public.meals.archive is 'True when a meal is no longer available and should be hidden from Orders by default.';
comment on view public.meal_with_stats is 'Compatibility view for list/detail pages that need derived last_ordered_date, order_count, provider, and archive fields.';

notify pgrst, 'reload schema';
