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

## Features

- Home summary cards for Favourite, Fine, Avoid, and Not rated meals.
- Searchable/filterable/sortable meal list.
- Add/edit/detail screens for all meal fields.
- Mark meals as Removed so they disappear from default active lists.
- Orders view showing dinner meals ordered by Thursday week.
- Meal order counts and full order history.
- Paste from snipping tool, drag/drop, file picker, or image URL for meal photos.
- Separate pasted image fields for ingredients and nutritional information.
