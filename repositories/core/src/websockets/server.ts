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

// Map deviceId -> WebSocket (for quick device lookup)
const deviceSockets = new Map<string, WebSocket>();

// Map userId -> Set<WebSocket> (users can have multiple dashboard tabs)
const dashboardSockets = new Map<string, Set<WebSocket>>();

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
    const meta = {
      ip: "websocket",
      userAgent: "WebSocket Dashboard",
      path: "/ws/iot/dashboard",
      method: "WS",
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
      const auth = await authenticateDashboard(request.headers.cookie);
      if (!auth.valid || !auth.userId) {
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

export function getConnectedDevices(): string[] {
  return Array.from(deviceSockets.keys());
}

export function isDeviceConnected(deviceId: string): boolean {
  return deviceSockets.has(deviceId);
}

export function sendToDevice(deviceId: string, message: WsMessage): boolean {
  const ws = deviceSockets.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendJson(ws, message);
    return true;
  }
  return false;
}
