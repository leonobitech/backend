import { Router } from "express";
import {
  handleRegister,
  handleTelemetry,
  handleGetPendingCommands,
  handleAckCommand,
  handleStatus,
  handleListDevices,
  handleGetDevice,
  handleGetTelemetry,
  handleGetCommands,
  handleDeleteDevice,
  handleDevicesAction,
  handleDeviceAction,
  handleTelemetryAction,
  handleCommandsAction,
  handleSchedulesAction,
  handleLightStateAction,
  handleGetWsToken,
} from "@controllers/iot.controllers";
import authenticate from "@middlewares/authenticate";

const iotRoutes = Router();

// =============================================================================
// Device API - Called by ESP32/IoT devices
// These routes use x-device-id and x-api-key headers for authentication
// =============================================================================

// POST /api/iot/devices/register - Register device on startup (device API)
iotRoutes.post("/devices/register", handleRegister);

// POST /api/iot/devices/:deviceId/telemetry - Send telemetry data
iotRoutes.post("/devices/:deviceId/telemetry", handleTelemetry);

// GET /api/iot/devices/:deviceId/commands/pending - Get pending commands
iotRoutes.get("/devices/:deviceId/commands/pending", handleGetPendingCommands);

// POST /api/iot/devices/:deviceId/commands/:commandId/ack - Acknowledge command
iotRoutes.post("/devices/:deviceId/commands/:commandId/ack", handleAckCommand);

// POST /api/iot/devices/:deviceId/status - Send device status
iotRoutes.post("/devices/:deviceId/status", handleStatus);

// =============================================================================
// Dashboard API - Called by frontend (requires user authentication)
// =============================================================================

// GET /api/iot/devices - List all devices for user (legacy)
iotRoutes.get("/devices", authenticate, handleListDevices);

// POST /api/iot/devices - List (action: "list") or Create device (with meta)
iotRoutes.post("/devices", authenticate, handleDevicesAction);

// GET /api/iot/devices/:deviceId - Get device details (legacy)
iotRoutes.get("/devices/:deviceId", authenticate, handleGetDevice);

// POST /api/iot/devices/:deviceId - Get (action: "get") or Delete (action: "delete")
iotRoutes.post("/devices/:deviceId", authenticate, handleDeviceAction);

// DELETE /api/iot/devices/:deviceId - Delete a device (legacy)
iotRoutes.delete("/devices/:deviceId", authenticate, handleDeleteDevice);

// GET /api/iot/devices/:deviceId/telemetry - Get telemetry history (legacy)
iotRoutes.get("/devices/:deviceId/telemetry", authenticate, handleGetTelemetry);

// POST /api/iot/devices/:deviceId/telemetry/list - Get telemetry with meta (dashboard)
iotRoutes.post("/devices/:deviceId/telemetry/list", authenticate, handleTelemetryAction);

// GET /api/iot/devices/:deviceId/commands - Get command history (legacy)
iotRoutes.get("/devices/:deviceId/commands", authenticate, handleGetCommands);

// POST /api/iot/devices/:deviceId/commands - List (action: "list") or Send (action: "send") with meta
iotRoutes.post("/devices/:deviceId/commands", authenticate, handleCommandsAction);

// =============================================================================
// WebSocket Authentication - Get token for WS connection
// =============================================================================

// GET /api/iot/ws-token - Get a short-lived token for WebSocket auth
// Uses GET because SameSite=Lax doesn't send cookies with cross-origin POST
iotRoutes.get("/ws-token", authenticate, handleGetWsToken);

// =============================================================================
// Light Control API - Schedule management and light state
// =============================================================================

// POST /api/iot/devices/:deviceId/schedules - CRUD schedules (list, create, update, delete, activate)
iotRoutes.post("/devices/:deviceId/schedules", authenticate, handleSchedulesAction);

// POST /api/iot/devices/:deviceId/light - Update light state (intensity, temperature, mode)
iotRoutes.post("/devices/:deviceId/light", authenticate, handleLightStateAction);

export default iotRoutes;
