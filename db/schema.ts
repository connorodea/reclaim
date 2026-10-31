import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One owner-scoped snapshot makes each decision and its audit event atomic.
// Snapshot size is bounded before writes to respect D1's per-row limit.
export const workspaces = sqliteTable('reclaim_workspaces', {
  ownerKey: text('owner_key').primaryKey(),
  mode: text('mode').notNull(),
  revision: integer('revision').notNull().default(0),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
});
