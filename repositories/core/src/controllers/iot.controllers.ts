import { Request, Response } from "express";
import catchErrors from "@utils/http/catchErrors";
import appAssert from "@utils/validation/appAssert";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import { loggerEvent } from "@utils/logging/loggerEvent";
import logger from "@utils/logging/logger";
import { generateWsToken } from "@websockets/server";

import {
  registerDevice,
  saveTelemetry,
  getPendingCommands,
  acknowledgeCommand,
  saveDeviceStatus,
  sendCommandToDevice,
  getAllDevices,
  getDeviceDetails,
  verifyDeviceApiKey,
  createDeviceForUser,
  getDeviceTelemetry,
  getDeviceCommands,
  deleteDevice,
  getDeviceSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  activateSchedule,
  updateLightState,
} from "@services/iot.service";

import type {
  RegisterDeviceResponse,
  SendTelemetryResponse,
  GetPendingCommandsResponse,
  AckCommandResponse,
  SendStatusResponse,
  SendCommandResponse,
  GetDevicesResponse,
  GetDeviceDetailsResponse,
} from "@custom-types/modules/iot";

// =============================================================================
// Device API (called by ESP32)
// =============================================================================

/**
 * POST /api/devices/register
 * Register or update device on startup
 */
export const handleRegister = catchErrors(
  async (req: Request, res: Response<RegisterDeviceResponse>): Promise<void> => {
    const deviceId = req.get("x-device-id");
    const apiKey = req.get("x-api-key");
    const { firmware_version, chip_info } = req.body;

    appAssert(
      deviceId && apiKey,
      HTTP_CODE.BAD_REQUEST,
      "Device ID and API Key are required",
      ERROR_CODE.BAD_REQUEST
    );

    const result = await registerDevice(
      {
        deviceId,
        firmwareVersion: firmware_version,
        chipInfo: chip_info,
      },
      apiKey
    );

    logger.info(`IoT device registered: ${deviceId}`);
    loggerEvent("iot.device.registered", { deviceId }, req, "handleRegister");

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * POST /api/devices/:deviceId/telemetry
 * Save telemetry data from device
 */
export const handleTelemetry = catchErrors(
  async (req: Request, res: Response<SendTelemetryResponse>): Promise<void> => {
    const { deviceId } = req.params;
    const deviceIdHeader = req.get("x-device-id");
    const apiKey = req.get("x-api-key");

    // Verify device
    appAssert(
      deviceIdHeader && apiKey,
      HTTP_CODE.UNAUTHORIZED,
      "Device credentials required",
      ERROR_CODE.UNAUTHORIZED
    );

    appAssert(
      deviceId === deviceIdHeader,
      HTTP_CODE.FORBIDDEN,
      "Device ID mismatch",
      ERROR_CODE.FORBIDDEN
    );

    const { valid } = await verifyDeviceApiKey(deviceId, apiKey);
    appAssert(valid, HTTP_CODE.UNAUTHORIZED, "Invalid device credentials", ERROR_CODE.UNAUTHORIZED);

    const { device_id, free_heap, wifi_rssi, uptime_secs, wifi_ssid, ip_address, sensors } = req.body;

    const result = await saveTelemetry({
      deviceId,
      data: {
        deviceId: device_id || deviceId,
        freeHeap: free_heap,
        wifiRssi: wifi_rssi,
        uptimeSecs: uptime_secs,
        wifiSsid: wifi_ssid,
        ipAddress: ip_address,
        sensors,
      },
    });

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * GET /api/devices/:deviceId/commands/pending
 * Get pending commands for device
 */
export const handleGetPendingCommands = catchErrors(
  async (req: Request, res: Response<GetPendingCommandsResponse>): Promise<void> => {
    const { deviceId } = req.params;
    const deviceIdHeader = req.get("x-device-id");
    const apiKey = req.get("x-api-key");

    // Verify device
    appAssert(
      deviceIdHeader && apiKey,
      HTTP_CODE.UNAUTHORIZED,
      "Device credentials required",
      ERROR_CODE.UNAUTHORIZED
    );

    appAssert(
      deviceId === deviceIdHeader,
      HTTP_CODE.FORBIDDEN,
      "Device ID mismatch",
      ERROR_CODE.FORBIDDEN
    );

    const { valid } = await verifyDeviceApiKey(deviceId, apiKey);
    appAssert(valid, HTTP_CODE.UNAUTHORIZED, "Invalid device credentials", ERROR_CODE.UNAUTHORIZED);

    const result = await getPendingCommands({ deviceId });

    // Return 204 if no commands (optimization for polling)
    if (result.commands.length === 0) {
      res.status(HTTP_CODE.NO_CONTENT).send();
      return;
    }

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * POST /api/devices/:deviceId/commands/:commandId/ack
 * Acknowledge command execution
 */
export const handleAckCommand = catchErrors(
  async (req: Request, res: Response<AckCommandResponse>): Promise<void> => {
    const { deviceId, commandId } = req.params;
    const deviceIdHeader = req.get("x-device-id");
    const apiKey = req.get("x-api-key");

    // Verify device
    appAssert(
      deviceIdHeader && apiKey,
      HTTP_CODE.UNAUTHORIZED,
      "Device credentials required",
      ERROR_CODE.UNAUTHORIZED
    );

    appAssert(
      deviceId === deviceIdHeader,
      HTTP_CODE.FORBIDDEN,
      "Device ID mismatch",
      ERROR_CODE.FORBIDDEN
    );

    const { valid } = await verifyDeviceApiKey(deviceId, apiKey);
    appAssert(valid, HTTP_CODE.UNAUTHORIZED, "Invalid device credentials", ERROR_CODE.UNAUTHORIZED);

    const { success, message } = req.body;

    const result = await acknowledgeCommand({
      deviceId,
      commandId,
      success: success ?? true,
      message,
    });

    loggerEvent(
      "iot.command.acknowledged",
      { deviceId, commandId, success },
      req,
      "handleAckCommand"
    );

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * POST /api/devices/:deviceId/status
 * Update device status
 */
export const handleStatus = catchErrors(
  async (req: Request, res: Response<SendStatusResponse>): Promise<void> => {
    const { deviceId } = req.params;
    const deviceIdHeader = req.get("x-device-id");
    const apiKey = req.get("x-api-key");

    // Verify device
    appAssert(
      deviceIdHeader && apiKey,
      HTTP_CODE.UNAUTHORIZED,
      "Device credentials required",
      ERROR_CODE.UNAUTHORIZED
    );

    appAssert(
      deviceId === deviceIdHeader,
      HTTP_CODE.FORBIDDEN,
      "Device ID mismatch",
      ERROR_CODE.FORBIDDEN
    );

    const { valid } = await verifyDeviceApiKey(deviceId, apiKey);
    appAssert(valid, HTTP_CODE.UNAUTHORIZED, "Invalid device credentials", ERROR_CODE.UNAUTHORIZED);

    const { online, firmware_version, free_heap, wifi_ssid, wifi_rssi, uptime_secs } = req.body;

    const result = await saveDeviceStatus({
      deviceId,
      status: {
        online: online ?? true,
        firmwareVersion: firmware_version,
        freeHeap: free_heap,
        wifiSsid: wifi_ssid,
        wifiRssi: wifi_rssi,
        uptimeSecs: uptime_secs,
      },
    });

    res.status(HTTP_CODE.OK).json(result);
  }
);

// =============================================================================
// Admin API (called by frontend dashboard)
// =============================================================================

/**
 * GET /api/devices
 * List all IoT devices (admin only)
 */
export const handleListDevices = catchErrors(
  async (req: Request, res: Response<GetDevicesResponse>): Promise<void> => {
    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await getAllDevices();

    loggerEvent("iot.devices.listed", { total: result.total }, req, "handleListDevices");

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * GET /api/devices/:deviceId
 * Get device details (admin only)
 */
export const handleGetDevice = catchErrors(
  async (req: Request, res: Response<GetDeviceDetailsResponse>): Promise<void> => {
    const { deviceId } = req.params;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await getDeviceDetails({ deviceId });

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * POST /api/devices/:deviceId/command
 * Send command to device (admin only)
 */
export const handleSendCommand = catchErrors(
  async (req: Request, res: Response<SendCommandResponse>): Promise<void> => {
    const { deviceId } = req.params;
    const { action, params } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    appAssert(action, HTTP_CODE.BAD_REQUEST, "Action is required", ERROR_CODE.BAD_REQUEST);

    const result = await sendCommandToDevice({
      deviceId,
      action,
      params,
      sentBy: req.userId,
    });

    loggerEvent(
      "iot.command.sent",
      { deviceId, action, commandId: result.command.id },
      req,
      "handleSendCommand"
    );

    res.status(HTTP_CODE.CREATED).json(result);
  }
);

/**
 * POST /api/iot/devices/register
 * Create a new device from dashboard (generates credentials)
 */
export const handleCreateDevice = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const { name, type, firmwareVersion, metadata } = req.body;

    appAssert(name, HTTP_CODE.BAD_REQUEST, "Device name is required", ERROR_CODE.BAD_REQUEST);
    appAssert(type, HTTP_CODE.BAD_REQUEST, "Device type is required", ERROR_CODE.BAD_REQUEST);

    const result = await createDeviceForUser({
      name,
      type,
      firmwareVersion,
      metadata,
      ownerId: req.userId,
    });

    loggerEvent(
      "iot.device.created",
      { deviceId: result.device.deviceId, name },
      req,
      "handleCreateDevice"
    );

    res.status(HTTP_CODE.CREATED).json(result);
  }
);

/**
 * GET /api/iot/devices/:deviceId/telemetry
 * Get telemetry history for device
 */
export const handleGetTelemetry = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await getDeviceTelemetry({ deviceId, limit, since });

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * GET /api/iot/devices/:deviceId/commands
 * Get command history for device
 */
export const handleGetCommands = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await getDeviceCommands({ deviceId, limit });

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * DELETE /api/iot/devices/:deviceId
 * Delete a device
 */
export const handleDeleteDevice = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await deleteDevice({ deviceId });

    loggerEvent("iot.device.deleted", { deviceId }, req, "handleDeleteDevice");

    res.status(HTTP_CODE.OK).json(result);
  }
);

// =============================================================================
// Action-based handlers (POST with action in body)
// These allow frontend to send metadata for clientKey validation
// =============================================================================

/**
 * POST /api/iot/devices (with action: "list")
 * List all devices OR create device based on action
 */
export const handleDevicesAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const { action, name, type, firmwareVersion, metadata } = req.body;

    // If action is "list", return all devices
    if (action === "list") {
      const result = await getAllDevices();
      loggerEvent("iot.devices.listed", { total: result.total }, req, "handleDevicesAction");
      res.status(HTTP_CODE.OK).json(result);
      return;
    }

    // Otherwise, treat as device creation
    appAssert(name, HTTP_CODE.BAD_REQUEST, "Device name is required", ERROR_CODE.BAD_REQUEST);
    appAssert(type, HTTP_CODE.BAD_REQUEST, "Device type is required", ERROR_CODE.BAD_REQUEST);

    const result = await createDeviceForUser({
      name,
      type,
      firmwareVersion,
      metadata,
      ownerId: req.userId,
    });

    loggerEvent(
      "iot.device.created",
      { deviceId: result.device.deviceId, name },
      req,
      "handleDevicesAction"
    );

    res.status(HTTP_CODE.CREATED).json(result);
  }
);

/**
 * POST /api/iot/devices/:deviceId (with action: "get" or "delete")
 * Get device details OR delete device based on action
 */
export const handleDeviceAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const { action } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);
    appAssert(action, HTTP_CODE.BAD_REQUEST, "Action is required", ERROR_CODE.BAD_REQUEST);

    if (action === "get") {
      const result = await getDeviceDetails({ deviceId });
      res.status(HTTP_CODE.OK).json(result);
      return;
    }

    if (action === "delete") {
      const result = await deleteDevice({ deviceId });
      loggerEvent("iot.device.deleted", { deviceId }, req, "handleDeviceAction");
      res.status(HTTP_CODE.OK).json(result);
      return;
    }

    appAssert(false, HTTP_CODE.BAD_REQUEST, "Invalid action", ERROR_CODE.BAD_REQUEST);
  }
);

/**
 * POST /api/iot/devices/:deviceId/telemetry (with action: "list")
 * Get telemetry history for device with metadata support
 */
export const handleTelemetryAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const { action, limit = 50, since } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);
    appAssert(action === "list", HTTP_CODE.BAD_REQUEST, "Action must be 'list'", ERROR_CODE.BAD_REQUEST);

    const result = await getDeviceTelemetry({
      deviceId,
      limit: typeof limit === "number" ? limit : 50,
      since: since ? new Date(since) : undefined,
    });

    res.status(HTTP_CODE.OK).json(result);
  }
);

/**
 * POST /api/iot/devices/:deviceId/commands (with action: "list" or "send")
 * Get command history or send command with metadata support
 */
export const handleCommandsAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const { action, limit = 20, command, params } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);
    appAssert(action, HTTP_CODE.BAD_REQUEST, "Action is required", ERROR_CODE.BAD_REQUEST);

    if (action === "list") {
      const result = await getDeviceCommands({
        deviceId,
        limit: typeof limit === "number" ? limit : 20,
      });
      res.status(HTTP_CODE.OK).json(result);
      return;
    }

    if (action === "send") {
      appAssert(command, HTTP_CODE.BAD_REQUEST, "Command is required", ERROR_CODE.BAD_REQUEST);

      const result = await sendCommandToDevice({
        deviceId,
        action: command,
        params,
        sentBy: req.userId,
      });

      loggerEvent(
        "iot.command.sent",
        { deviceId, command, commandId: result.command.id },
        req,
        "handleCommandsAction"
      );

      res.status(HTTP_CODE.CREATED).json(result);
      return;
    }

    appAssert(false, HTTP_CODE.BAD_REQUEST, "Invalid action", ERROR_CODE.BAD_REQUEST);
  }
);

// =============================================================================
// Schedule Management (called by frontend dashboard)
// =============================================================================

/**
 * POST /api/iot/devices/:deviceId/schedules
 * Manage schedules - list, create, update, delete, activate
 */
export const handleSchedulesAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const { action, scheduleId, name, description, points, isActive } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);
    appAssert(action, HTTP_CODE.BAD_REQUEST, "Action is required", ERROR_CODE.BAD_REQUEST);

    switch (action) {
      case "list": {
        const result = await getDeviceSchedules({ deviceId });
        res.status(HTTP_CODE.OK).json(result);
        return;
      }

      case "create": {
        appAssert(name, HTTP_CODE.BAD_REQUEST, "Schedule name is required", ERROR_CODE.BAD_REQUEST);
        appAssert(
          Array.isArray(points) && points.length > 0,
          HTTP_CODE.BAD_REQUEST,
          "Schedule points are required",
          ERROR_CODE.BAD_REQUEST
        );

        const result = await createSchedule({
          deviceId,
          name,
          description,
          points,
        });

        loggerEvent(
          "iot.schedule.created",
          { deviceId, scheduleId: result.schedule.id, name },
          req,
          "handleSchedulesAction"
        );

        res.status(HTTP_CODE.CREATED).json(result);
        return;
      }

      case "update": {
        appAssert(scheduleId, HTTP_CODE.BAD_REQUEST, "Schedule ID is required", ERROR_CODE.BAD_REQUEST);

        const result = await updateSchedule({
          scheduleId,
          name,
          description,
          points,
        });

        loggerEvent(
          "iot.schedule.updated",
          { deviceId, scheduleId },
          req,
          "handleSchedulesAction"
        );

        res.status(HTTP_CODE.OK).json(result);
        return;
      }

      case "delete": {
        appAssert(scheduleId, HTTP_CODE.BAD_REQUEST, "Schedule ID is required", ERROR_CODE.BAD_REQUEST);

        const result = await deleteSchedule({ scheduleId });

        loggerEvent(
          "iot.schedule.deleted",
          { deviceId, scheduleId },
          req,
          "handleSchedulesAction"
        );

        res.status(HTTP_CODE.OK).json(result);
        return;
      }

      case "activate": {
        appAssert(scheduleId, HTTP_CODE.BAD_REQUEST, "Schedule ID is required", ERROR_CODE.BAD_REQUEST);

        const result = await activateSchedule({ deviceId, scheduleId });

        loggerEvent(
          "iot.schedule.activated",
          { deviceId, scheduleId },
          req,
          "handleSchedulesAction"
        );

        res.status(HTTP_CODE.OK).json(result);
        return;
      }

      default:
        appAssert(false, HTTP_CODE.BAD_REQUEST, "Invalid action", ERROR_CODE.BAD_REQUEST);
    }
  }
);

/**
 * POST /api/iot/devices/:deviceId/light
 * Update light state - intensity, temperature, mode
 */
export const handleLightStateAction = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    const { deviceId } = req.params;
    const { intensity, temperature, mode } = req.body;

    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const result = await updateLightState({
      deviceId,
      intensity,
      temperature,
      mode,
    });

    res.status(HTTP_CODE.OK).json(result);
  }
);

// =============================================================================
// WebSocket Authentication
// =============================================================================

/**
 * POST /api/iot/ws-token
 * Generate a short-lived token for WebSocket authentication
 * This is needed because Safari doesn't send cookies on cross-subdomain WebSocket
 */
export const handleGetWsToken = catchErrors(
  async (req: Request, res: Response): Promise<void> => {
    appAssert(req.userId, HTTP_CODE.UNAUTHORIZED, "Authentication required", ERROR_CODE.UNAUTHORIZED);

    const token = generateWsToken(req.userId);

    logger.info(`WebSocket token generated for user ${req.userId}`);

    res.status(HTTP_CODE.OK).json({ token });
  }
);
