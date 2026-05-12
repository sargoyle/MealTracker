# Project Rules & Decisions

This file is the single source of truth for all project-wide decisions. Update it immediately when any decision is made.

## How to use this file

- Every architecture choice, naming convention, or design pattern we agree on goes here
- Every business rule or constraint gets documented here
- If a decision overrides a previous one, update the entry (don't duplicate)
- Group entries by category for easy scanning

## Categories to track:

- **Architecture** - Tech stack choices, folder structure, state management approach
- **Naming Conventions** - Component names, file names, database columns, API routes
- **Design Patterns** - Reusable patterns, component composition rules, styling approach
- **Business Logic** - Validation rules, access control, feature flags, pricing logic
- **Integrations** - Third-party services, API keys needed, webhook configurations

Keep entries concise. One line per decision when possible.

## Architecture

- The app is a local Node server with static frontend files in `public/`, SQLite data in `data/meals.sqlite`, and uploads in `data/uploads/`.
- In-app documentation is served as real routable pages under `/docs` and `/docs/*`, with server fallback to `public/index.html` for non-API app routes.
- Supabase migration preparation uses `scripts/export-sqlite-backup.js` to create read-only JSON/upload snapshots under `backup/exports/`.

## Naming Conventions

- API routes use `/api/...`; app documentation routes use `/docs/...`.

## Design Patterns

- Documentation pages reuse the existing dark UI system, left app navigation, mobile bottom navigation, and a docs-specific sidebar/content layout.
- Frontend pages are rendered by JavaScript helper functions in `public/app.js`, not framework components.

## Business Logic

- Documentation workflow requires reading and maintaining `docs/masterplan.md`, `docs/tasks.md`, `docs/rules.md`, `docs/changelog.md`, and the live `/docs` pages before and after implementation work.
- Assistant responses must begin with `Checking knowledge base...` before any other text.
- Documentation Center content should reflect the current local MVP scope and be updated when routes, APIs, schema, dependencies, or major components change.
- Backup/export must preserve existing meal and meal order IDs and must not alter `data/meals.sqlite` or `data/uploads/`.

## Integrations

- No third-party services are used for the MVP; data and documentation stay local to this PC.
