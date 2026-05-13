# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initial project setup
- 2026-05-12: Added direct dry-run capable SQLite-to-Supabase migration script for local data and uploads. Files affected: `scripts/migrate-sqlite-to-supabase.js`, `package.json`, `README.md`, `docs/supabase-migration.md`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-12: Added Supabase import script for exported SQLite data and uploaded files. Files affected: `scripts/import-supabase-data.js`, `package.json`, `README.md`, `docs/supabase-migration.md`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-12: Added Supabase/Postgres schema migration and Storage/RLS migration notes. Files affected: `supabase/migrations/202605120001_create_meal_tracker_schema.sql`, `docs/supabase-migration.md`, `README.md`, `docs/rules.md`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`, `public/app.js`.
- 2026-05-12: Added read-only SQLite/export snapshot process for Supabase migration preparation. Files affected: `scripts/export-sqlite-backup.js`, `backup/exports/.gitkeep`, `.gitignore`, `package.json`, `README.md`, `masterplan.md`, `tasks.md`, `docs/masterplan.md`, `docs/rules.md`, `docs/tasks.md`, `docs/changelog.md`, `public/app.js`.
- 2026-05-04: Added changelog documentation structure and rules. Files affected: `docs/changelog.md`, `tasks.md`.
- 2026-05-04: Added in-app Documentation Center routes and pages. Files affected: `public/app.js`, `public/styles.css`, `server.js`, `docs/rules.md`, `docs/changelog.md`, `tasks.md`.

### Changed
- 2026-05-13: Resolved remaining polish decisions by documenting that no local-storage note is needed without a settings/help screen and that duplicate-meal remains deferred until requested. Files affected: `docs/rules.md`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-13: Confirmed PC-focused scope and recorded that LAN/mobile access setup should not be prioritized unless requirements change. Files affected: `docs/rules.md`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-13: Verified the production Vercel deployment reads Supabase meal/order data and migrated Supabase Storage image URLs. Files affected: `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-13: Improved first-time and no-order empty states on Home, Meals, and Orders, and updated the in-app component docs for the empty-state helper. Files affected: `public/app.js`, `public/styles.css`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-13: Locked the Orders table Meal, Rating, and Count columns so only Thursday date columns scroll horizontally. Files affected: `public/app.js`, `public/styles.css`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-13: Migrated existing local SQLite meals, order history, and uploaded images into Supabase. Files affected: `data/meals.sqlite`, `data/uploads/`, Supabase `meals`, `meal_orders`, `meal_with_stats`, and `meal-images` storage.
- 2026-05-12: Replaced runtime SQLite/local upload access with Supabase Postgres REST and Supabase Storage access using Vercel-compatible Supabase environment variables. Files affected: `server.js`, `.env.example`, `package.json`, `README.md`, `masterplan.md`, `tasks.md`, `docs/masterplan.md`, `docs/rules.md`, `docs/tasks.md`, `docs/changelog.md`, `public/app.js`, `docs/supabase-migration.md`.
- 2026-05-10: Completed remaining verification tasks for edit flow, remove flow, pasted screenshot persistence, and mobile usability. Files affected: `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.
- 2026-05-04: Updated project knowledge workflow and added docs-folder masterplan/tasks sources. Files affected: `docs/project-knowledge.md`, `docs/masterplan.md`, `docs/tasks.md`, `docs/rules.md`, `docs/changelog.md`, `tasks.md`, `public/app.js`.

### Fixed
- 2026-05-10: Fixed mobile viewport overflow so the five-item bottom navigation and page actions stay visible. Files affected: `public/styles.css`, `docs/tasks.md`, `tasks.md`, `docs/changelog.md`.

---

**Format for new entries:**
- **Added** for new features
- **Changed** for changes in existing functionality
- **Fixed** for bug fixes
- **Removed** for removed features
- **Security** for security improvements

**Rules:**
- Add a new entry after every completed task or group of related tasks
- Include the date, a short description, and files affected
- This is a historical log — never edit or delete past entries
