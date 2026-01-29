/**
 * Shared registry for tracking active WebSocket device connections.
 * Separated from server.ts to avoid circular dependencies with services.
 */

import { WebSocket } from "ws";

// Map deviceId -> WebSocket (for quick device lookup)
export const deviceSockets = new Map<string, WebSocket>();

// Map userId -> Set<WebSocket> (users can have multiple dashboard tabs)
export const dashboardSockets = new Map<string, Set<WebSocket>>();

export function isDeviceConnected(deviceId: string): boolean {
  return deviceSockets.has(deviceId);
}

export function getConnectedDevices(): string[] {
  return Array.from(deviceSockets.keys());
}

/**
 * Close all dashboard WebSocket connections for a specific user.
 * Used when user logs out or session is revoked.
 */
export function closeAllDashboardSockets(
  userId: string,
  reason: "token_expired" | "session_revoked" | "logout" = "logout"
): number {
  const userSockets = dashboardSockets.get(userId);
  if (!userSockets || userSockets.size === 0) return 0;

  let closed = 0;
  for (const ws of userSockets) {
    try {
      // Send session_expired message before closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "session_expired", reason }));
        ws.close(4001, "Session expired");
        closed++;
      }
    } catch {
      // Socket may already be closing
    }
  }

  return closed;
}
