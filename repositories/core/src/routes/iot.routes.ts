import { Router } from "express";
import {
  handleRegister,
  handleTelemetry,
  handleGetPendingCommands,
  handleAckCommand,
  handleStatus,
  handleListDevices,
  handleGetDevice,
  handleSendCommand,
} from "@controllers/iot.controllers";
import authenticate from "@middlewares/authenticate";
import authorize from "@middlewares/authorize";
import { UserRole } from "@constants/userRole";

const iotRoutes = Router();

// =============================================================================
// Device API - Called by ESP32/IoT devices
// These routes use x-device-id and x-api-key headers for authentication
// =============================================================================

// POST /api/devices/register - Register device on startup
iotRoutes.post("/register", handleRegister);

// POST /api/devices/:deviceId/telemetry - Send telemetry data
iotRoutes.post("/:deviceId/telemetry", handleTelemetry);

// GET /api/devices/:deviceId/commands/pending - Get pending commands
iotRoutes.get("/:deviceId/commands/pending", handleGetPendingCommands);

// POST /api/devices/:deviceId/commands/:commandId/ack - Acknowledge command
iotRoutes.post("/:deviceId/commands/:commandId/ack", handleAckCommand);

// POST /api/devices/:deviceId/status - Send device status
iotRoutes.post("/:deviceId/status", handleStatus);

// =============================================================================
// Admin API - Called by frontend dashboard (requires admin authentication)
// =============================================================================

// GET /api/devices - List all devices (admin only)
iotRoutes.get("/", authenticate, authorize(UserRole.Admin), handleListDevices);

// GET /api/devices/:deviceId - Get device details (admin only)
iotRoutes.get("/:deviceId", authenticate, authorize(UserRole.Admin), handleGetDevice);

// POST /api/devices/:deviceId/command - Send command to device (admin only)
iotRoutes.post("/:deviceId/command", authenticate, authorize(UserRole.Admin), handleSendCommand);

export default iotRoutes;
