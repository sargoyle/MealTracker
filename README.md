# Meal Tracker

A personal meal rating tracker with dark-mode UI, Supabase/Postgres persistence, and Supabase Storage image uploads.

## Supabase setup

The runtime API now uses Supabase instead of local SQLite. Create a local `.env.local` file from `.env.example`:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-server-only
SUPABASE_STORAGE_BUCKET=meal-images
```

Important:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is client-safe, but this app still keeps Supabase calls server-side.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed in browser code.
- The service role key is required for server-side Storage uploads.
- In Vercel, add these values as Environment Variables.
- Run the SQL in `supabase/migrations/202605120001_create_meal_tracker_schema.sql` before starting the app against Supabase.

## Run

From this folder:

```powershell
& 'C:\Users\61402\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

Then open:

```text
http://localhost:4173
```

The app stores meal data in Supabase Postgres and uploaded/pasted images in the Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`.

## Backup/export for Supabase migration

To preserve old local SQLite data before importing it to Supabase, create a local export snapshot:

```powershell
& 'C:\Users\61402\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/export-sqlite-backup.js
```

If you have `npm` available on your PATH, this package script does the same thing:

```powershell
npm run export:backup
```

This creates a timestamped folder under `backup/exports/` containing:

- `meals.json` with every meal row.
- `meal_orders.json` with every order-history row.
- `uploads/` with copies of files from `data/uploads/`.
- `uploads-manifest.json` mapping copied upload files back to their source paths.
- `manifest.json` with counts and export metadata.

The export script opens `data/meals.sqlite` read-only and does not delete or alter the old SQLite database or upload folder.

To write an export to a specific folder, pass a path:

```powershell
& 'C:\Users\61402\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/export-sqlite-backup.js backup/exports/my-export-name
```

## Supabase schema preparation

The first Supabase/Postgres migration is in:

```text
supabase/migrations/202605120001_create_meal_tracker_schema.sql
```

Migration notes, Storage bucket planning, RLS recommendations, and dashboard apply instructions are in:

```text
docs/supabase-migration.md
```

The current app runtime expects this schema in Supabase.

## Import existing local data into Supabase

After creating the Supabase schema and bucket, migrate directly from the old local SQLite database and upload folder.

First run a dry run:

```powershell
npm run migrate:supabase:dry-run
```

The dry run prints how many meals, meal orders, and upload files would be migrated without writing to Supabase.

Then run the real migration:

```powershell
npm run migrate:supabase
```

This direct migration script:

- Reads `data/meals.sqlite` in read-only mode.
- Reads upload files from `data/uploads/`.
- Uploads local files to Supabase Storage under `legacy/<filename>`.
- Rewrites old `/uploads/<filename>` image values to Supabase Storage public URLs.
- Upserts `meals` first, then `meal_orders`, preserving existing IDs.
- Is safe to rerun because records are upserted by `id` and Storage uploads use upsert.
- Does not delete or alter `data/meals.sqlite` or `data/uploads/`.

There is also an older export-folder import path if needed:

```powershell
npm run import:supabase
```

Or import a specific export folder:

```powershell
npm run import:supabase -- backup/exports/2026-05-12T09-41-51Z
```

The export-folder import script:

- Reads `meals.json`, `meal_orders.json`, and `uploads-manifest.json`.
- Uploads exported files to Supabase Storage under `legacy/<filename>`.
- Rewrites old `/uploads/<filename>` image references to Supabase Storage public URLs.
- Upserts meals and meal orders while preserving existing IDs.
- Does not delete or alter `data/meals.sqlite` or `data/uploads/`.

## Features

- Home summary cards for Favourite, Fine, Avoid, and Not rated meals.
- Searchable/filterable/sortable meal list.
- Add/edit/detail screens for all meal fields.
- Mark meals as Removed so they disappear from default active lists.
- Orders view showing dinner meals ordered by Thursday week.
- Meal order counts and full order history.
- Paste from snipping tool, drag/drop, file picker, or image URL for meal photos.
- Separate pasted image fields for ingredients and nutritional information.
