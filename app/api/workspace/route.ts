/// <reference types="vite/client" />
import { getWorkspace, mutateWorkspace } from '../../../lib/store.ts';
import { WorkspaceError } from '../../../lib/validation.ts';

export const dynamic = 'force-dynamic';
const RESPONSE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'Vary': 'oai-authenticated-user-id', 'X-Content-Type-Options': 'nosniff' };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: RESPONSE_HEADERS });
}

function identity(request: Request): { userId: string; preview: boolean } {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (userId) return { userId, preview: import.meta.env.DEV };
  // Vite replaces DEV with false in the production Worker. There is no hosted fallback.
  if (import.meta.env.DEV) return { userId: 'isolated-internal-preview', preview: true };
  throw new WorkspaceError('Sign in to access your private workspace.', 401, 'authentication_required');
}

function modeFrom(request: Request): 'demo' | 'live' {
  const mode = new URL(request.url).searchParams.get('mode') ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new WorkspaceError('Workspace mode must be demo or live.');
  return mode;
}

function assertOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new WorkspaceError('This change must originate from the Reclaim workspace.', 403, 'origin_mismatch');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new WorkspaceError('Cross-site writes are not accepted.', 403, 'origin_mismatch');
}

function errorResponse(error: unknown): Response {
  if (error instanceof WorkspaceError) return json({ error: error.message, code: error.code }, error.status);
  // Do not leak SQL, identifiers, request contents, or stack traces to visitors.
  console.error('Reclaim workspace request failed:', error instanceof Error ? error.message : 'Unknown error');
  return json({ error: 'The workspace could not be saved or loaded. Please retry; no partial changes were applied.', code: 'storage_error' }, 503);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = identity(request);
    const mode = modeFrom(request);
    return json({ workspace: await getWorkspace(user.userId, mode), persistence: user.preview ? 'preview' : 'durable', mode });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = identity(request);
    assertOrigin(request);
    const mode = modeFrom(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new WorkspaceError('Send changes as application/json.', 415, 'unsupported_media_type');
    const length = Number(request.headers.get('content-length'));
    if (Number.isFinite(length) && length > 2_000_000) throw new WorkspaceError('This import is too large. Use a smaller batch.', 413, 'request_too_large');
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 2_000_000) throw new WorkspaceError('This import is too large. Use a smaller batch.', 413, 'request_too_large');
    let action: unknown;
    try { action = JSON.parse(body); } catch { throw new WorkspaceError('The request is not valid JSON.', 400, 'invalid_json'); }
    const workspace = await mutateWorkspace(user.userId, mode, action);
    return json({ workspace, persistence: user.preview ? 'preview' : 'durable', mode });
  } catch (error) { return errorResponse(error); }
}
