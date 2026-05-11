# Project Knowledge

These rules apply to all future Meal Tracker work.

## Response Rules

- Before beginning any response, say: `Checking knowledge base...`
- Then greet Sara naturally.
- After completing implementation tasks, tell Sara:
  1. What was completed
  2. How to test it
  3. What the next step is

## Documentation Rules

- Always read and maintain these documentation sources before making changes:
  1. `docs/masterplan.md` - project vision and goals
  2. `docs/tasks.md` - current task list and progress
  3. `docs/rules.md` - architecture decisions, naming conventions, and business rules
  4. `docs/changelog.md` - historical log of all changes made
  5. Live `/docs` pages - architecture, components, data flow, API, and dependencies
- Log completed changes in `docs/changelog.md`.
- If a decision was made, update `docs/rules.md`.
- Mark completed work in `docs/tasks.md`.
- If a change affects architecture, components, data flow, APIs, or dependencies, update the relevant `/docs` page in the app.

## Product Direction

- Meal Tracker is a personal, PC-only meal rating app.
- The core feature is remembering which meals are Favourite, Fine, Avoid, or Not rated.
- Prioritize the meal list, filtering, notes, and dinner order history by Thursday week.
- Do not add backup/export, scraping, AI parsing, nutrition analysis, recommendations, accounts, sharing, notifications, or advanced analytics in the MVP.