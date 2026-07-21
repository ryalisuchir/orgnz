-- Allow each class/category to sync to its own Notion database.
-- Notion Calendar colors are per-database, so one database per class is
-- required to get distinct event colors in the calendar view.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS notion_database_id text;
