# Meal Tracker

A local personal meal rating tracker with dark-mode UI, SQLite persistence, and pasted/uploaded meal images.

## Run

From this folder:

```powershell
& 'C:\Users\61402\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

Then open:

```text
http://localhost:4173
```

The app stores meal data in `data/meals.sqlite` and uploaded/pasted images in `data/uploads/`.

## Backup/export for Supabase migration

Before changing the app runtime or moving data to Supabase, create a local export snapshot:

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

The export script opens `data/meals.sqlite` read-only and does not delete or alter the SQLite database or upload folder.

To write an export to a specific folder, pass a path:

```powershell
& 'C:\Users\61402\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/export-sqlite-backup.js backup/exports/my-export-name
```

## Features

- Home summary cards for Favourite, Fine, Avoid, and Not rated meals.
- Searchable/filterable/sortable meal list.
- Add/edit/detail screens for all meal fields.
- Mark meals as Removed so they disappear from default active lists.
- Orders view showing dinner meals ordered by Thursday week.
- Meal order counts and full order history.
- Paste from snipping tool, drag/drop, file picker, or image URL for meal photos.
- Separate pasted image fields for ingredients and nutritional information.
