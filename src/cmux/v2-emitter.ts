/**
 * V2Emitter — direct V2 JSON-RPC call builder for SSH/TCP relay sessions.
 *
 * Channel strategy (revised):
 *   Tab title       = session topic (stable, set once — like AI workspace name)
 *   Workspace title = live status line (changes frequently: "Working: Bash: npm test | 3 tools 23%")
 *   Workspace color = phase color (only changes on phase transitions, not every tool)
 *   Notifications   = done/error/permission alerts
 *   Mark unread     = attention for permission/error
 *   Flash           = urgent visual attention
 *   Pin/Unpin       = keep workspace visible while working
 */

export interface V2RpcCall {
  method: string;
  params: Record<string, unknown>;
}

/** Colors matching the status phases. */
export const V2_COLORS: Record<string, string> = {
  ready: '#50C878',
  thinking: '#FFD700',
  working: '#4C8DFF',
  waiting: '#FF6B35',
  compacting: '#9B59B6',
  done: '#50C878',
  error: '#FF4444',
};

export class V2Emitter {
  // ---- Tab title (stable session topic — set rarely) ----

  setTabTitle(title: string): V2RpcCall {
    return { method: 'tab.action', params: { action: 'rename', title } };
  }

  clearTabTitle(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'clear_name' } };
  }

  // ---- Workspace color (phase indicator — only on transitions) ----

  setWorkspaceColor(color: string): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'set-color', color } };
  }

  clearWorkspaceColor(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'clear-color' } };
  }

  // ---- Workspace title (live status line — changes frequently) ----

  setWorkspaceTitle(title: string): V2RpcCall {
    return { method: 'workspace.rename', params: { title } };
  }

  clearWorkspaceTitle(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'clear_name' } };
  }

  // ---- Notifications ----

  notify(surfaceId: string, title: string, subtitle: string, body: string): V2RpcCall {
    return {
      method: 'notification.create_for_surface',
      params: { surface_id: surfaceId, title, subtitle, body },
    };
  }

  notifyBroadcast(title: string, subtitle: string, body: string): V2RpcCall {
    return { method: 'notification.create', params: { title, subtitle, body } };
  }

  clearNotifications(): V2RpcCall {
    return { method: 'notification.clear', params: {} };
  }

  // ---- Attention indicators ----

  markTabUnread(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'mark_unread' } };
  }

  markWorkspaceUnread(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'mark_unread' } };
  }

  markRead(): V2RpcCall {
    return { method: 'tab.action', params: { action: 'mark_read' } };
  }

  flash(surfaceId: string): V2RpcCall {
    return { method: 'surface.trigger_flash', params: { surface_id: surfaceId } };
  }

  // ---- Workspace pin ----

  pin(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'pin' } };
  }

  unpin(): V2RpcCall {
    return { method: 'workspace.action', params: { action: 'unpin' } };
  }

  // ---- Focus detection ----

  identifyCall(): V2RpcCall {
    return { method: 'system.identify', params: {} };
  }
}

// ---- Helpers ----

/**
 * Format the live workspace title status line.
 * During work: "Working: Bash: npm test | main* | 5 tools 33%"
 * On done: "Done | main*"
 * Ready: "Ready | main*"
 */
export function formatWorkspaceStatus(
  phase: string,
  detail?: string,
  gitBranch?: string | null,
  gitDirty?: boolean,
  toolCount?: number,
  progress?: number,
): string {
  const parts: string[] = [];

  // Phase + detail
  if (detail) {
    parts.push(`${phase}: ${detail}`);
  } else {
    parts.push(phase);
  }

  // Git branch
  if (gitBranch) {
    parts.push(gitDirty ? `${gitBranch}*` : gitBranch);
  }

  // Progress
  if (toolCount !== undefined && toolCount > 0 && progress !== undefined) {
    const pct = Math.round(progress * 100);
    const label = toolCount === 1 ? '1 tool' : `${toolCount} tools`;
    parts.push(`${label} ${pct}%`);
  }

  return parts.join(' | ');
}
