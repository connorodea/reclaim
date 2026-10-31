import { env } from 'cloudflare:workers';
import type { Workspace } from './types.ts';
import { createDemoWorkspace, createEmptyWorkspace } from './seed.ts';
import { applyWorkspaceAction, checkWorkspaceCapacity, WorkspaceError } from './validation.ts';

type Mode = 'demo' | 'live';
type SnapshotRow = { revision: number; payload: string };

function database(): D1Database {
  if (!env.DB) throw new WorkspaceError('Persistent storage is not available. No changes have been saved.', 503, 'storage_unavailable');
  return env.DB;
}

function ownerKey(userId: string, mode: Mode): string {
  return JSON.stringify([userId, mode]);
}

function decode(row: SnapshotRow): Workspace {
  const workspace = JSON.parse(row.payload) as Workspace;
  if (workspace.revision !== row.revision) throw new WorkspaceError('The workspace version could not be verified. Please reload.', 503, 'storage_consistency');
  return workspace;
}

export async function getWorkspace(userId: string, mode: Mode): Promise<Workspace> {
  const db = database();
  const key = ownerKey(userId, mode);
  let row = await db.prepare('SELECT revision, payload FROM reclaim_workspaces WHERE owner_key = ?').bind(key).first<SnapshotRow>();
  if (!row) {
    const initial = mode === 'demo' ? createDemoWorkspace() : createEmptyWorkspace();
    const payload = checkWorkspaceCapacity(initial);
    await db.prepare('INSERT OR IGNORE INTO reclaim_workspaces (owner_key, mode, revision, payload, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(key, mode, initial.revision, payload, initial.updatedAt).run();
    row = await db.prepare('SELECT revision, payload FROM reclaim_workspaces WHERE owner_key = ?').bind(key).first<SnapshotRow>();
  }
  if (!row) throw new WorkspaceError('Could not load the workspace. Please retry.', 503, 'storage_unavailable');
  return decode(row);
}

export async function mutateWorkspace(userId: string, mode: Mode, action: unknown): Promise<Workspace> {
  const current = await getWorkspace(userId, mode);
  const next = applyWorkspaceAction(current, action, mode);
  const payload = checkWorkspaceCapacity(next);
  const result = await database().prepare('UPDATE reclaim_workspaces SET revision = ?, payload = ?, updated_at = ? WHERE owner_key = ? AND revision = ?')
    .bind(next.revision, payload, next.updatedAt, ownerKey(userId, mode), current.revision).run();
  if (result.meta.changes !== 1) throw new WorkspaceError('The workspace changed in another tab. Refresh and try again.', 409, 'revision_conflict');
  return next;
}
