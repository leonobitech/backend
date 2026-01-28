/**
 * WebSocket Server for IoT Light Control
 *
 * Handles bidirectional communication between:
 * - ESP32 devices (light controllers)
 * - Dashboard clients (web frontend)
 */

import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { parse as parseUrl } from "url";
import { verifyDeviceApiKey } from "@services/iot.service";
import logger from "@utils/logging/logger";
import prisma from "@config/prisma";
import crypto from "crypto";
import {
  deviceSockets,
  dashboardSockets,
} from "./connectionRegistry";

// =============================================================================
// WebSocket Token Store (short-lived tokens for dashboard auth)
// =============================================================================

interface WsToken {
  userId: string;
  createdAt: number;
}

// In-memory store for WebSocket tokens (expire after 30 seconds)
const wsTokenStore = new Map<string, WsToken>();
const WS_TOKEN_EXPIRY_MS = 30_000; // 30 seconds

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of wsTokenStore) {
    if (now - data.createdAt > WS_TOKEN_EXPIRY_MS) {
      wsTokenStore.delete(token);
    }
  }
}, 10_000); // Check every 10 seconds

/**
 * Generate a short-lived token for WebSocket authentication
 * Called from REST endpoint after cookie-based auth
 */
export function generateWsToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  wsTokenStore.set(token, { userId, createdAt: Date.now() });
  return token;
}

/**
 * Validate and consume a WebSocket token
 */
function validateWsToken(token: string): { valid: boolean; userId?: string } {
  const data = wsTokenStore.get(token);
  if (!data) {
    return { valid: false };
  }

  // Check expiry
  if (Date.now() - data.createdAt > WS_TOKEN_EXPIRY_MS) {
    wsTokenStore.delete(token);
    return { valid: false };
  }

  // Consume token (one-time use)
  wsTokenStore.delete(token);
  return { valid: true, userId: data.userId };
}
import type {
  ConnectionInfo,
  DeviceConnection,
  DashboardConnection,
  WsMessage,
  DashboardToDeviceMessage,
  DeviceToDashboardMessage,
  ErrorMessage,
  WelcomeMessage,
  DeviceConnectedMessage,
  DeviceDisconnectedMessage,
} from "./protocol";

// =============================================================================
// Connection Store
// =============================================================================

// Map WebSocket -> ConnectionInfo
const connections = new Map<WebSocket, ConnectionInfo>();

// deviceSockets and dashboardSockets imported from connectionRegistry

// =============================================================================
// Helper Functions
// =============================================================================

function sendJson(ws: WebSocket, data: WsMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function sendError(ws: WebSocket, code: string, message: string) {
  const error: ErrorMessage = { type: "error", code, message };
  sendJson(ws, error);
}

function broadcastToDeviceSubscribers(deviceId: string, message: WsMessage) {
  // Send to all dashboard clients watching this device
  for (const [ws, conn] of connections) {
    if (conn.type === "dashboard" && conn.subscribedDevices.has(deviceId)) {
      sendJson(ws, message);
    }
  }
}

// =============================================================================
// Device Authentication
// =============================================================================

async function authenticateDevice(
  deviceId: string,
  apiKey: string
): Promise<{ valid: boolean; dbId?: string }> {
  try {
    const result = await verifyDeviceApiKey(deviceId, apiKey);
    if (result.valid && result.device) {
      return { valid: true, dbId: result.device.id };
    }
    return { valid: false };
  } catch (error) {
    logger.error("Device auth error:", error);
    return { valid: false };
  }
}

// =============================================================================
// Dashboard Authentication
// =============================================================================

async function authenticateDashboard(
  cookie: string | undefined
): Promise<{ valid: boolean; userId?: string }> {
  if (!cookie) return { valid: false };

  try {
    // Parse cookies from cookie string
    const cookies = cookie.split(";").reduce(
      (acc, c) => {
        const [key, val] = c.trim().split("=");
        if (key && val) acc[key] = val;
        return acc;
      },
      {} as Record<string, string>
    );

    const accessKey = cookies["accessKey"];
    const clientKey = cookies["clientKey"];

    if (!accessKey || !clientKey) return { valid: false };

    // Find token in Redis/DB using existing service
    const { findAccessTokenOrThrow } = await import("@utils/auth/tokenRedis");

    // Create minimal meta for the lookup
    const meta: RequestMeta = {
      ipAddress: "websocket",
      deviceInfo: { browser: "unknown", os: "unknown", device: "unknown" },
      userAgent: "WebSocket Dashboard",
      language: "",
      platform: "",
      timezone: "",
      screenResolution: "",
      label: "ws-dashboard",
      path: "/ws/iot/dashboard",
      method: "WS",
      host: "",
    };

    const tokenResult = await findAccessTokenOrThrow(
      accessKey,
      clientKey,
      meta,
      true // useFallback
    );

    if (tokenResult.userId) {
      return { valid: true, userId: tokenResult.userId };
    }

    return { valid: false };
  } catch (error) {
    logger.error("Dashboard auth error:", error);
    return { valid: false };
  }
}

// =============================================================================
// Message Handlers
// =============================================================================

function handleDeviceMessage(ws: WebSocket, conn: DeviceConnection, data: unknown) {
  const message = data as DeviceToDashboardMessage;

  switch (message.type) {
    case "light_state":
      // Broadcast light state to subscribed dashboards
      broadcastToDeviceSubscribers(conn.deviceId, {
        ...message,
        deviceId: conn.deviceId,
      });
      break;

    case "telemetry":
      // Broadcast telemetry to subscribed dashboards
      broadcastToDeviceSubscribers(conn.deviceId, {
        ...message,
        deviceId: conn.deviceId,
      });

      // Update lastSeenAt in DB so REST API also reflects online status
      prisma.iotDevice
        .update({
          where: { id: conn.dbId },
          data: { lastSeenAt: new Date() },
        })
        .catch((err) => logger.error("Failed to update lastSeenAt on telemetry:", err));
      break;

    case "ack":
      // Broadcast ack to subscribed dashboards
      broadcastToDeviceSubscribers(conn.deviceId, {
        ...message,
        deviceId: conn.deviceId,
      });
      break;

    case "pong":
      // Respond to ping with server timestamp
      broadcastToDeviceSubscribers(conn.deviceId, {
        ...message,
        deviceId: conn.deviceId,
        serverTimestamp: Date.now(),
      });
      break;

    default:
      logger.warn(`Unknown device message type: ${(message as WsMessage).type}`);
  }
}

function handleDashboardMessage(ws: WebSocket, conn: DashboardConnection, data: unknown) {
  const message = data as DashboardToDeviceMessage & { deviceId?: string };

  // Dashboard messages need a target deviceId
  const targetDeviceId = message.deviceId;
  if (!targetDeviceId) {
    sendError(ws, "MISSING_DEVICE_ID", "deviceId required for this message");
    return;
  }

  // Subscribe to device updates if not already
  conn.subscribedDevices.add(targetDeviceId);

  // Find device socket
  const deviceWs = deviceSockets.get(targetDeviceId);
  if (!deviceWs) {
    sendError(ws, "DEVICE_OFFLINE", `Device ${targetDeviceId} is not connected`);
    return;
  }

  // Forward message to device (without deviceId, device knows who it is)
  const { deviceId: _, ...messageWithoutDeviceId } = message;
  sendJson(deviceWs, messageWithoutDeviceId as WsMessage);
}

// =============================================================================
// Connection Handlers
// =============================================================================

function handleConnection(ws: WebSocket, connectionInfo: ConnectionInfo) {
  connections.set(ws, connectionInfo);

  if (connectionInfo.type === "device") {
    deviceSockets.set(connectionInfo.deviceId, ws);

    // Notify subscribed dashboards that device connected
    const connectedMsg: DeviceConnectedMessage = {
      type: "device_connected",
      deviceId: connectionInfo.deviceId,
    };
    broadcastToDeviceSubscribers(connectionInfo.deviceId, connectedMsg);

    // Update device online status in DB
    prisma.iotDevice
      .update({
        where: { id: connectionInfo.dbId },
        data: { isOnline: true, lastSeenAt: new Date() },
      })
      .catch((err) => logger.error("Failed to update device online status:", err));

    logger.info(`Device connected: ${connectionInfo.deviceId}`);
  } else {
    // Dashboard connection
    let userSockets = dashboardSockets.get(connectionInfo.userId);
    if (!userSockets) {
      userSockets = new Set();
      dashboardSockets.set(connectionInfo.userId, userSockets);
    }
    userSockets.add(ws);

    logger.info(`Dashboard connected: user ${connectionInfo.userId}`);
  }

  // Send welcome message
  const welcome: WelcomeMessage = {
    type: "welcome",
    connectionId: `${connectionInfo.type}-${Date.now()}`,
    serverTime: Date.now(),
  };
  sendJson(ws, welcome);
}

function handleDisconnection(ws: WebSocket) {
  const conn = connections.get(ws);
  if (!conn) return;

  if (conn.type === "device") {
    deviceSockets.delete(conn.deviceId);

    // Notify subscribed dashboards that device disconnected
    const disconnectedMsg: DeviceDisconnectedMessage = {
      type: "device_disconnected",
      deviceId: conn.deviceId,
    };
    broadcastToDeviceSubscribers(conn.deviceId, disconnectedMsg);

    // Update device offline status in DB
    prisma.iotDevice
      .update({
        where: { id: conn.dbId },
        data: { isOnline: false },
      })
      .catch((err) => logger.error("Failed to update device offline status:", err));

    logger.info(`Device disconnected: ${conn.deviceId}`);
  } else {
    // Dashboard disconnection
    const userSockets = dashboardSockets.get(conn.userId);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        dashboardSockets.delete(conn.userId);
      }
    }

    logger.info(`Dashboard disconnected: user ${conn.userId}`);
  }

  connections.delete(ws);
}

// =============================================================================
// WebSocket Server Setup
// =============================================================================

export function createWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  server.on("upgrade", async (request, socket, head) => {
    const { pathname, query } = parseUrl(request.url || "", true);

    // Route: /ws/iot/device - ESP32 devices
    if (pathname === "/ws/iot/device") {
      const deviceId = query.device_id as string;
      const apiKey = query.api_key as string;

      if (!deviceId || !apiKey) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const auth = await authenticateDevice(deviceId, apiKey);
      if (!auth.valid || !auth.dbId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const conn: DeviceConnection = {
          type: "device",
          deviceId,
          dbId: auth.dbId!,
          connectedAt: new Date(),
        };
        wss.emit("connection", ws, request, conn);
      });
      return;
    }

    // Route: /ws/iot/dashboard - Web dashboard
    if (pathname === "/ws/iot/dashboard") {
      // Try token auth first (for browsers that don't send cookies on WS)
      const wsToken = query.token as string | undefined;
      let auth: { valid: boolean; userId?: string };

      if (wsToken) {
        // Token-based auth (from /api/iot/ws-token endpoint)
        auth = validateWsToken(wsToken);
        if (auth.valid) {
          logger.info(`Dashboard connected via token: user ${auth.userId}`);
        }
      } else {
        // Fallback to cookie-based auth
        auth = await authenticateDashboard(request.headers.cookie);
      }

      if (!auth.valid || !auth.userId) {
        logger.warn("Dashboard WebSocket auth failed", {
          hasToken: !!wsToken,
          hasCookie: !!request.headers.cookie,
        });
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const conn: DashboardConnection = {
          type: "dashboard",
          userId: auth.userId!,
          subscribedDevices: new Set(),
          connectedAt: new Date(),
        };
        wss.emit("connection", ws, request, conn);
      });
      return;
    }

    // Unknown path
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  });

  // Handle connections
  wss.on("connection", (ws: WebSocket, _request: unknown, conn: ConnectionInfo) => {
    handleConnection(ws, conn);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        const connectionInfo = connections.get(ws);

        if (!connectionInfo) {
          sendError(ws, "NOT_AUTHENTICATED", "Connection not authenticated");
          return;
        }

        if (connectionInfo.type === "device") {
          handleDeviceMessage(ws, connectionInfo, message);
        } else {
          handleDashboardMessage(ws, connectionInfo, message);
        }
      } catch (error) {
        logger.error("Failed to parse WebSocket message:", error);
        sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
      }
    });

    ws.on("close", () => {
      handleDisconnection(ws);
    });

    ws.on("error", (error) => {
      logger.error("WebSocket error:", error);
      handleDisconnection(ws);
    });
  });

  logger.info("WebSocket server initialized");
  logger.info("  - Device endpoint: /ws/iot/device?device_id=XXX&api_key=YYY");
  logger.info("  - Dashboard endpoint: /ws/iot/dashboard (requires auth cookie)");

  return wss;
}

// =============================================================================
// Utility Exports
// =============================================================================

export {
  isDeviceConnected,
  getConnectedDevices,
} from "./connectionRegistry";

export function sendToDevice(deviceId: string, message: WsMessage): boolean {
  const ws = deviceSockets.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendJson(ws, message);
    return true;
  }
  return false;
}
