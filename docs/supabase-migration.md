# Supabase Migration Notes

These notes prepare and support Meal Tracker's Vercel-compatible Supabase storage runtime.

## Current Source Data

- SQLite database: `data/meals.sqlite`
- Latest export folder inspected: `backup/exports/2026-05-12T09-41-51Z`
- Exported tables:
  - `meals.json`: 19 rows
  - `meal_orders.json`: 30 rows
  - `uploads-manifest.json`: 67 uploaded image files

The current SQLite IDs are UUID strings, so the Supabase schema uses `uuid` primary keys while still allowing imports to preserve existing IDs.

## SQL Migration

Apply this file in Supabase:

```text
supabase/migrations/202605120001_create_meal_tracker_schema.sql
```

It creates:

- `public.meals`
- `public.meal_orders`
- `public.meal_with_stats`
- `updated_at` triggers
- indexes for current filters, sorting, order history, and name search

## How To Apply In Supabase

Option 1, Supabase dashboard:

1. Open the Supabase project.
2. Go to SQL Editor.
3. Open `supabase/migrations/202605120001_create_meal_tracker_schema.sql`.
4. Paste the full SQL into the editor.
5. Run it once.
6. Confirm `meals`, `meal_orders`, and `meal_with_stats` exist in the `public` schema.

Option 2, Supabase CLI later:

```powershell
supabase db push
```

Use this only after the Supabase CLI and project linking are set up.

## Storage Bucket Plan

Create one Supabase Storage bucket:

| Bucket | Access | Purpose |
|---|---|---|
| `meal-images` | Public read recommended for the current unchanged UI | Stores meal photos, ingredients screenshots, and nutrition screenshots |

Recommended object paths:

```text
meal-images/legacy/<filename>                       # imported historical uploads
meal-images/meals/<meal-id>/meal/<filename>
meal-images/meals/<meal-id>/ingredients/<filename>
meal-images/meals/<meal-id>/nutrition/<filename>
```

During import:

1. Use `uploads-manifest.json` to find each source upload.
2. Upload each file from the exported `uploads/` folder into `meal-images`.
3. Update `image_url`, `ingredients_image_url`, and `nutrition_image_url` to either Supabase Storage object paths or signed/public URLs.

The current UI expects normal image URLs in `image_url`, `ingredients_image_url`, and `nutrition_image_url`, so the runtime stores Supabase Storage public URLs after upload. A private bucket with signed URLs is a stronger privacy model, but it would need extra server-side URL refresh handling so edit forms do not accidentally save expiring signed URLs.

## RLS Recommendations

For the first Vercel migration, keep database access server-side through API routes and Supabase server credentials. Do not expose the service role key in browser code.

Recommended initial approach:

- Keep table RLS disabled while only trusted server API code accesses Supabase.
- Use `SUPABASE_SERVICE_ROLE_KEY` only on the server for inserts, updates, deletes, and Storage uploads.
- Use a public-read `meal-images` bucket for the current UI, or switch to private/signed URLs in a later privacy hardening task.

If the browser later talks directly to Supabase:

- Enable RLS on `meals` and `meal_orders`.
- Add explicit authenticated-user policies.
- Add matching Storage policies for `meal-images`.
- Avoid public write policies.

## Runtime Environment Variables

Set these locally in `.env.local` and in Vercel Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-server-only
SUPABASE_STORAGE_BUCKET=meal-images
```

`SUPABASE_SERVICE_ROLE_KEY` is required for server-side Storage uploads and must never be exposed in frontend code.

## Import Existing Exported Data

After the SQL migration has run, prefer the direct local SQLite migration:

```powershell
npm run migrate:supabase:dry-run
npm run migrate:supabase
```

The direct migration reads `data/meals.sqlite` read-only, uploads files from `data/uploads/` to `meal-images/legacy/<filename>`, rewrites `/uploads/<filename>` image values to Supabase Storage public URLs, and upserts `meals` before `meal_orders`.

An export-folder import path is still available if needed:

```powershell
npm run import:supabase
```

Or import a specific export folder:

```powershell
npm run import:supabase -- backup/exports/2026-05-12T09-41-51Z
```

The export import script uploads exported files to `meal-images/legacy/<filename>`, rewrites old `/uploads/<filename>` fields to Supabase public URLs, and upserts `meals` before `meal_orders` so foreign keys are preserved.

## Assumptions

- Existing IDs in exported JSON are valid UUID values.
- `last_ordered_date` and `ordered_week_start_date` values are `YYYY-MM-DD` dates.
- SQLite timestamp strings can be imported into Postgres `timestamptz`.
- `last_ordered_date` is kept for compatibility, though the app now derives the latest ordered date from `meal_orders`.
