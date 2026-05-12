# Meal Tracker Implementation Tasks

This file is the source of truth for implementation order. It follows the product docs: `masterplan`, `implementation`, `design`, and `app-flow`, with the MVP focused on a local personal meal rating tracker.

## 1. Product Foundation

- [x] Confirm the core product goal: quickly remember which meals to reorder, tolerate, avoid, or rate later.
- [x] Keep scope personal and single-user.
- [x] Exclude non-MVP features: scraping, AI parsing, nutrition analysis, recommendations, accounts, sharing, notifications, and advanced analytics.
- [x] Use a minimal dark interface inspired by the provided futuristic template, without building a marketing-style landing page.

## 2. Local App Foundation

- [x] Create a local project structure.
- [x] Add a Node server entrypoint.
- [x] Add a static frontend shell.
- [x] Add run instructions in `README.md`.
- [x] Start the local app at `http://localhost:4173`.

## 3. Data Storage

- [x] Create persistent local SQLite storage in `data/meals.sqlite`.
- [x] Create a single `meals` table.
- [x] Add required fields, defaults, and enum-style validation.
- [x] Seed the four example meals from the brief.
- [x] Store pasted/uploaded images in `data/uploads/`.
- [x] Remove temporary verification data after user confirmation.
- [x] Remove seeded example/test meals from the active database after user approval.
- [x] Add `ingredients_image_url` and `nutrition_image_url` fields for pasted reference images.
- [x] Add `meal_orders` table for dinner order history by Thursday week.
- [x] Derive latest ordered date and order count from order history.
- [x] Make legacy Last Ordered migration idempotent so restarts do not add extra order rows.

## 4. API

- [x] Add `GET /api/meals` with search, rating, type, status, weekly, season, week, and sort support.
- [x] Add `GET /api/meals/:id`.
- [x] Add `POST /api/meals`.
- [x] Add `PUT /api/meals/:id`.
- [x] Add `PATCH /api/meals/:id/remove`.
- [x] Add `POST /api/uploads/image`.
- [x] Return useful validation errors for invalid input.
- [x] Save and return ingredients and nutritional information image URLs on meal records.
- [x] Add `GET /api/orders` for dinner order table data.
- [x] Add `POST /api/orders` to record an existing dinner meal for a Thursday week.
- [x] Add `PUT /api/orders/:id` to edit an existing dinner order date.
- [x] Add `DELETE /api/orders/:id` to remove a meal from a specific Thursday week.
- [x] Add `PATCH /api/meals/:id/rating` for quick rating updates.

## 5. Core Screens

- [x] Home screen with rating summary cards.
- [x] Recent meals section.
- [x] Meals screen with sticky search/filter/sort controls.
- [x] Compact meal cards with image/placeholder, name, type, rating, notes preview, and last ordered date.
- [x] Meal detail screen with full record fields.
- [x] Add meal screen.
- [x] Edit meal screen.
- [x] Replace Weekly screen/tab with Orders screen/tab.
- [x] Orders screen shows dinner meals as rows and Thursday week dates as columns.
- [x] Orders screen allows adding existing dinner meals directly into the table.
- [x] Orders screen only shows Thursday columns that have order data.
- [x] Orders screen supports sorting a Thursday column so that week's ordered meals appear first.
- [x] Orders screen shows meal rating alongside each dinner meal.
- [x] Orders screen allows meal ratings to be edited directly from the table.
- [x] Improve Orders rating dropdown contrast for selected values and option lists.
- [x] Orders screen uses compact check marks for ordered cells instead of repeating meal names and dates.
- [x] Orders screen supports guarded removal of a meal from a specific Thursday week.
- [x] Keep focus anchored on the selected Orders cell while its remove confirmation is open.
- [x] Preserve Orders table focus and scroll position after choosing Remove or Keep.
- [x] Preserve Orders table focus and scroll position after adding a meal to a Thursday week.
- [x] Preserve Orders table focus and scroll position after sorting by a Thursday column.
- [x] Orders screen Count column can be clicked to sort by total order count.
- [x] Show ingredients and nutritional information images on meal detail screens.
- [x] Meal detail screen shows full order history.
- [x] Meal detail order history shows the order count and avoids repeating the same date twice.
- [x] Add routable Documentation Center pages for overview, architecture, components, data flow, API, and dependencies.

## 6. Meal Form Behaviour

- [x] Default new meals to Dinner, Not rated, and Active.
- [x] Validate meal name as required.
- [x] Validate week number as positive when present.
- [x] Support image URL.
- [x] Support file picker image upload.
- [x] Support drag/drop image upload.
- [x] Support pasted screenshot/snipping-tool image upload.
- [x] Support separate pasted ingredients screenshot upload.
- [x] Support separate pasted nutritional information screenshot upload.
- [x] Fix pasted image targeting so Meal, Ingredients, and Nutritional Information fields do not overwrite each other.
- [x] Add explicit calendar picker button for Last Ordered Date while keeping direct typing.
- [x] Remove editable Last Ordered Date from meal form after order history was introduced.
- [x] Add editable order history dates to the Meal Edit page.
- [x] Refresh `updated_at` on edit.

## 7. Filtering And Decision Support

- [x] Hide Removed meals by default.
- [x] Filter by Favourite, Fine, Avoid, and Not rated.
- [x] Filter by Dinner, Breakfast, and Lunch.
- [x] Filter by Active, Removed, and All.
- [x] Sort by meal name.
- [x] Sort by last ordered date.
- [x] Sort by meal order count.
- [x] Sort by rating.
- [x] Default meal-name sort keeps Favourite, Fine, and Not rated together alphabetically, with Avoid meals at the bottom.
- [x] Add collapsible Meals page filter controls to reduce vertical space.
- [x] Make Avoid meals visually obvious.

## 8. Responsive Dark UI

- [x] Apply dark background, dark cards, subtle borders, and emerald accent.
- [x] Use compact spacing and scannable meal rows.
- [x] Use bottom navigation on mobile.
- [x] Keep desktop navigation as a left sidebar.
- [x] Avoid decorative landing-page sections.
- [x] Do a visual pass in the in-app browser on desktop width.
- [x] Do a visual pass in the in-app browser on mobile width.
- [x] Adjust spacing, text wrapping, or card density from visual QA findings.

## 9. Verification

- [x] Verify server syntax.
- [x] Verify frontend syntax.
- [x] Verify homepage responds.
- [x] Verify meal API returns seeded meals.
- [x] Verify add-meal defaults.
- [x] Verify required meal name validation.
- [x] Verify Favourite filter.
- [x] Verify search by meal name.
- [x] Verify legacy Weekly Autumn week 4 data before Weekly was removed.
- [x] Verify Orders API returns Thursday week headers.
- [x] Verify Meals API can sort by order count.
- [x] Verify Orders API returns only Thursday week headers with data.
- [x] Verify Orders API can update an existing order date.
- [x] Verify Documentation Center routes respond at `/docs` and `/docs/architecture`.
- [x] Verify edit flow manually in browser.
- [x] Verify mark-as-removed flow manually in browser.
- [x] Verify pasted screenshot persists after refresh.
- [x] Verify mobile browser usability.

## 10. Next Polish Pass

- [ ] Add clearer empty states for first-time use and no weekly matches.
- [ ] Add a small “data stored locally” note in settings/help if a settings screen is added.
- [ ] Consider a one-click “duplicate meal” action later for similar weekly items.
- [ ] Keep usage focused on this PC; do not prioritize LAN/mobile access setup unless the requirement changes.

## 11. Project Operating Rules

- [x] Create `/docs` folder for project documentation.
- [x] Add project knowledge rules requiring every response to begin with `Hi Sara`.
- [x] Record that `/docs` must be read before future changes.
- [x] Add local `masterplan.md` as a source of truth.
- [x] Record that `masterplan.md` and `tasks.md` are the source of truth.
- [x] Add `docs/rules.md` as the source of truth for project-wide decisions.
- [x] Add `docs/changelog.md` as the historical log for completed changes.
- [x] Record that completed tasks must be marked done in `tasks.md`.
- [x] Record that completion updates must include what was completed, how to test it, and the next step.
- [x] Record Documentation Center architecture and design decisions in `docs/rules.md`.
- [x] Create `docs/masterplan.md` and `docs/tasks.md` as maintained knowledge-base sources.
- [x] Record the `Checking knowledge base...` response rule and post-task documentation workflow.

## 12. Folder Organization

- [x] Create `C:\Users\61402\Documents\Meal Tracker` as the project folder.
- [x] Copy the app, docs, database, and uploaded image storage into the `Meal Tracker` folder.
- [x] Keep the app intended for PC-only local use.
- [ ] Remove the old `C:\Users\61402\Documents\New project` folder after it is no longer locked.

## 13. Supabase Migration Preparation

- [x] Add a safe local export script for SQLite meals, meal orders, and upload files.
- [ ] Create Supabase Postgres schema for meals and order history.
- [ ] Create Supabase Storage bucket plan for meal, ingredients, and nutrition images.
- [ ] Import exported local data into Supabase without changing existing IDs.
- [ ] Replace SQLite data access with Supabase/Postgres data access.
- [ ] Replace local upload storage with Supabase Storage.
- [ ] Verify Vercel deployment with Supabase-backed data and uploads.

## Clarifying Questions

- Resolved: temporary test meal and probe files have been removed.
- Resolved: no backup/export in the MVP.
- Resolved: app is intended for use on this PC only.
