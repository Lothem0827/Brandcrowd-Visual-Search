<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database safety (Supabase)

- **Never delete user data.** No `DELETE`, `TRUNCATE`, or `DROP` on tables or rows holding user data (`profiles`, `boards`, `board_items`, `moodboards`, `follows`, `user_settings`, etc.) unless Carl explicitly asks.
- **Migrations are additive/non-destructive by default.** Add tables/columns; don't remove or rewrite existing data.
- **Back up before any restructure.** If dropping/renaming columns or tables, changing types, or moving data is ever needed:
  1. Back up the affected data first, e.g. `CREATE TABLE <table>_backup_YYYYMMDD AS SELECT * FROM <table>;` and/or export CSV.
  2. Verify the backup row counts match the source.
  3. Only then proceed.
- **Never touch backup tables** such as `board_items_backup`.
