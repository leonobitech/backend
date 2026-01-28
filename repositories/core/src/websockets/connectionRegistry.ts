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
