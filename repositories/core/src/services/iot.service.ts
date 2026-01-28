import prisma from "@config/prisma";
import { CLIENT_KEY_SECRET } from "@config/env";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import { hmacHash } from "@utils/crypto/hmacHash";
import { API_STATUS } from "@constants/apiStatus";
import { IotCommandStatus, Prisma } from "@prisma/client";
import { isDeviceConnected as isDeviceWsConnected } from "@websockets/connectionRegistry";

// =============================================================================
// Constants
// =============================================================================

/**
 * Device is considered offline if no heartbeat received in this time (seconds)
 * AND has no active WebSocket connection.
 * ESP32 sends telemetry every 60 seconds via WebSocket.
 */
const DEVICE_OFFLINE_THRESHOLD_SECONDS = 90;

/**
 * Helper to determine if a device is online.
 * Checks both: active WebSocket connection OR recent lastSeenAt.
 */
const isDeviceOnline = (lastSeenAt: Date | null, deviceId?: string): boolean => {
  // If device has an active WebSocket connection, it's online
  if (deviceId && isDeviceWsConnected(deviceId)) return true;
  // Fallback to lastSeenAt threshold
  if (!lastSeenAt) return false;
  const thresholdMs = DEVICE_OFFLINE_THRESHOLD_SECONDS * 1000;
  return Date.now() - lastSeenAt.getTime() < thresholdMs;
};

import type {
  RegisterDeviceParams,
  RegisterDeviceResponse,
  SendTelemetryParams,
  SendTelemetryResponse,
  GetPendingCommandsParams,
  GetPendingCommandsResponse,
  AckCommandParams,
  AckCommandResponse,
  SendStatusParams,
  SendStatusResponse,
  SendCommandParams,
  SendCommandResponse,
  GetDevicesResponse,
  GetDeviceDetailsParams,
  GetDeviceDetailsResponse,
} from "@custom-types/modules/iot";

// =============================================================================
// Device Authentication Helper
// =============================================================================

export const verifyDeviceApiKey = async (
  deviceId: string,
  apiKey: string
): Promise<{ valid: boolean; device?: { id: string; deviceId: string } }> => {
  const hashedApiKey = hmacHash(apiKey, CLIENT_KEY_SECRET);

  const device = await prisma.iotDevice.findFirst({
    where: {
      deviceId,
      apiKey: hashedApiKey,
    },
    select: {
      id: true,
      deviceId: true,
    },
  });

  if (!device) {
    return { valid: false };
  }

  return { valid: true, device };
};

// =============================================================================
// Device Registration
// =============================================================================

export const registerDevice = async (
  params: RegisterDeviceParams,
  apiKey: string
): Promise<RegisterDeviceResponse> => {
  const { deviceId, firmwareVersion, chipInfo } = params;
  const hashedApiKey = hmacHash(apiKey, CLIENT_KEY_SECRET);

  // Build metadata with chip info if provided
  const metadata = chipInfo ? { chipInfo } : undefined;

  // Check if device exists
  let device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  if (device) {
    // Update existing device
    device = await prisma.iotDevice.update({
      where: { deviceId },
      data: {
        firmwareVersion: firmwareVersion || device.firmwareVersion,
        isOnline: true,
        lastSeenAt: new Date(),
        ...(metadata && { metadata }),
      },
    });
  } else {
    // Create new device
    device = await prisma.iotDevice.create({
      data: {
        deviceId,
        apiKey: hashedApiKey,
        firmwareVersion,
        isOnline: true,
        lastSeenAt: new Date(),
        metadata,
      },
    });
  }

  return {
    status: API_STATUS.SUCCESS,
    message: "Device registered successfully",
    device: {
      id: device.id,
      deviceId: device.deviceId,
      firmwareVersion: device.firmwareVersion,
    },
  };
};

// =============================================================================
// Telemetry
// =============================================================================

export const saveTelemetry = async (
  params: SendTelemetryParams
): Promise<SendTelemetryResponse> => {
  const { deviceId, data } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Save telemetry (include wifiSsid and ipAddress in sensors JSON)
  const sensorsData = {
    ...(data.sensors as Record<string, unknown> || {}),
    ...(data.wifiSsid && { wifiSsid: data.wifiSsid }),
    ...(data.ipAddress && { ipAddress: data.ipAddress }),
  };

  await prisma.iotTelemetry.create({
    data: {
      deviceId: device.id,
      freeHeap: data.freeHeap,
      wifiRssi: data.wifiRssi,
      uptimeSecs: data.uptimeSecs,
      sensors: Object.keys(sensorsData).length > 0 ? (sensorsData as Prisma.InputJsonValue) : null,
    },
  });

  // Update device last seen
  await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      isOnline: true,
      lastSeenAt: new Date(),
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Telemetry saved",
  };
};

// =============================================================================
// Commands
// =============================================================================

export const getPendingCommands = async (
  params: GetPendingCommandsParams
): Promise<GetPendingCommandsResponse> => {
  const { deviceId } = params;

  // Get device
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Get pending commands
  const commands = await prisma.iotCommand.findMany({
    where: {
      deviceId: device.id,
      status: IotCommandStatus.PENDING,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      action: true,
      params: true,
    },
  });

  // Mark commands as SENT
  if (commands.length > 0) {
    await prisma.iotCommand.updateMany({
      where: {
        id: { in: commands.map((c) => c.id) },
      },
      data: {
        status: IotCommandStatus.SENT,
      },
    });
  }

  // Update device last seen
  await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      isOnline: true,
      lastSeenAt: new Date(),
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    commands: commands.map((c) => ({
      id: c.id,
      action: c.action,
      params: c.params as Record<string, unknown> | null,
    })),
  };
};

export const acknowledgeCommand = async (
  params: AckCommandParams
): Promise<AckCommandResponse> => {
  const { deviceId, commandId, success, message } = params;

  // Get device
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Update command
  const command = await prisma.iotCommand.findFirst({
    where: {
      id: commandId,
      deviceId: device.id,
    },
  });

  appAssert(command, HTTP_CODE.NOT_FOUND, "Command not found", ERROR_CODE.NOT_FOUND);

  await prisma.iotCommand.update({
    where: { id: commandId },
    data: {
      status: success ? IotCommandStatus.EXECUTED : IotCommandStatus.FAILED,
      result: message,
      acknowledgedAt: new Date(),
      executedAt: success ? new Date() : null,
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Command acknowledged",
  };
};

// =============================================================================
// Device Status
// =============================================================================

export const saveDeviceStatus = async (
  params: SendStatusParams
): Promise<SendStatusResponse> => {
  const { deviceId, status } = params;

  // Get device
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Update device with status info
  await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      firmwareVersion: status.firmwareVersion,
      isOnline: status.online,
      lastSeenAt: new Date(),
    },
  });

  // Also save as telemetry
  await prisma.iotTelemetry.create({
    data: {
      deviceId: device.id,
      freeHeap: status.freeHeap,
      wifiRssi: status.wifiRssi,
      uptimeSecs: status.uptimeSecs,
      sensors: { wifiSsid: status.wifiSsid },
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Status updated",
  };
};

// =============================================================================
// Admin Functions
// =============================================================================

/**
 * Create a new device from the dashboard
 * Generates secure deviceId and apiKey
 */
export const createDeviceForUser = async (params: {
  name: string;
  type: string;
  firmwareVersion?: string;
  metadata?: Record<string, unknown>;
  ownerId: string;
}): Promise<{
  status: string;
  message: string;
  device: {
    id: string;
    deviceId: string;
    name: string;
    type: string;
  };
  credentials: {
    deviceId: string;
    apiKey: string;
  };
}> => {
  const { name, type, firmwareVersion, metadata, ownerId } = params;

  // Generate secure deviceId (16 chars hex)
  const crypto = await import("crypto");
  const deviceId = crypto.randomBytes(8).toString("hex");

  // Generate secure apiKey (32 chars hex)
  const apiKey = crypto.randomBytes(16).toString("hex");

  // Hash the apiKey for storage
  const hashedApiKey = hmacHash(apiKey, CLIENT_KEY_SECRET);

  // Create device
  const device = await prisma.iotDevice.create({
    data: {
      deviceId,
      apiKey: hashedApiKey,
      name,
      type,
      firmwareVersion: firmwareVersion || null,
      metadata: (metadata as Prisma.InputJsonValue) || null,
      ownerId,
      isOnline: false,
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Device created successfully",
    device: {
      id: device.id,
      deviceId: device.deviceId,
      name: device.name || "",
      type: device.type || "",
    },
    credentials: {
      deviceId,
      apiKey, // Return plain apiKey only once!
    },
  };
};

/**
 * Get telemetry history for a device
 */
export const getDeviceTelemetry = async (params: {
  deviceId: string;
  limit?: number;
  since?: Date;
}): Promise<{
  status: string;
  telemetry: Array<{
    id: string;
    timestamp: string;
    freeHeap: number;
    wifiRssi: number;
    uptimeSecs: number;
    sensors: Record<string, unknown> | null;
    createdAt: string;
  }>;
}> => {
  const { deviceId, limit = 50, since } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  const telemetry = await prisma.iotTelemetry.findMany({
    where: {
      deviceId: device.id,
      ...(since && { createdAt: { gte: since } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    status: API_STATUS.SUCCESS,
    telemetry: telemetry.map((t) => ({
      id: t.id,
      timestamp: t.createdAt.toISOString(),
      freeHeap: t.freeHeap,
      wifiRssi: t.wifiRssi,
      uptimeSecs: t.uptimeSecs,
      sensors: t.sensors as Record<string, unknown> | null,
      createdAt: t.createdAt.toISOString(),
    })),
  };
};

/**
 * Get command history for a device
 */
export const getDeviceCommands = async (params: {
  deviceId: string;
  limit?: number;
}): Promise<{
  status: string;
  commands: Array<{
    id: string;
    command: string;
    payload: Record<string, unknown> | null;
    status: string;
    sentAt: string | null;
    acknowledgedAt: string | null;
    createdAt: string;
  }>;
}> => {
  const { deviceId, limit = 20 } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  const commands = await prisma.iotCommand.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    status: API_STATUS.SUCCESS,
    commands: commands.map((c) => ({
      id: c.id,
      command: c.action,
      payload: c.params as Record<string, unknown> | null,
      status: c.status.toLowerCase(),
      sentAt: null,
      acknowledgedAt: c.acknowledgedAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
};

/**
 * Delete a device
 */
export const deleteDevice = async (params: {
  deviceId: string;
}): Promise<{ status: string; message: string }> => {
  const { deviceId } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Delete telemetry, commands, and device
  await prisma.iotTelemetry.deleteMany({ where: { deviceId: device.id } });
  await prisma.iotCommand.deleteMany({ where: { deviceId: device.id } });
  await prisma.iotDevice.delete({ where: { id: device.id } });

  return {
    status: API_STATUS.SUCCESS,
    message: "Device deleted",
  };
};

export const sendCommandToDevice = async (
  params: SendCommandParams
): Promise<SendCommandResponse> => {
  const { deviceId, action, params: cmdParams, sentBy } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Create command
  const command = await prisma.iotCommand.create({
    data: {
      deviceId: device.id,
      action,
      params: (cmdParams as Prisma.InputJsonValue) || null,
      sentBy,
      status: IotCommandStatus.PENDING,
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Command queued",
    command: {
      id: command.id,
      action: command.action,
      status: command.status,
    },
  };
};

export const getAllDevices = async (): Promise<GetDevicesResponse> => {
  const devices = await prisma.iotDevice.findMany({
    orderBy: {
      lastSeenAt: "desc",
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Devices retrieved",
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      name: d.name,
      firmwareVersion: d.firmwareVersion,
      status: isDeviceOnline(d.lastSeenAt, d.deviceId) ? "online" : "offline",
      lastSeen: d.lastSeenAt?.toISOString() || null,
      createdAt: d.createdAt.toISOString(),
    })),
    total: devices.length,
  };
};

export const getDeviceDetails = async (
  params: GetDeviceDetailsParams
): Promise<GetDeviceDetailsResponse> => {
  const { deviceId } = params;

  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
    include: {
      telemetry: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      commands: {
        where: { status: IotCommandStatus.PENDING },
      },
    },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  return {
    status: API_STATUS.SUCCESS,
    message: "Device details retrieved",
    device: {
      id: device.id,
      deviceId: device.deviceId,
      name: device.name,
      firmwareVersion: device.firmwareVersion,
      status: isDeviceOnline(device.lastSeenAt, device.deviceId) ? "online" : "offline",
      lastSeen: device.lastSeenAt?.toISOString() || null,
      createdAt: device.createdAt.toISOString(),
      recentTelemetry: device.telemetry.map((t) => ({
        freeHeap: t.freeHeap,
        wifiRssi: t.wifiRssi,
        uptimeSecs: t.uptimeSecs,
        createdAt: t.createdAt.toISOString(),
      })),
      pendingCommands: device.commands.length,
      metadata: device.metadata as Record<string, unknown> | null,
    },
  };
};

// =============================================================================
// Light Schedule Functions
// =============================================================================

export interface SchedulePoint {
  hour: number;
  minute: number;
  intensity: number;
  temperature: number;
}

/**
 * Get all schedules for a device
 */
export const getDeviceSchedules = async (params: {
  deviceId: string;
}): Promise<{
  status: string;
  schedules: Array<{
    id: string;
    name: string;
    description: string | null;
    points: SchedulePoint[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}> => {
  const { deviceId } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  const schedules = await prisma.lightSchedule.findMany({
    where: { deviceId: device.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    status: API_STATUS.SUCCESS,
    schedules: schedules.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      points: s.points as unknown as SchedulePoint[],
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
};

/**
 * Create a new schedule for a device
 */
export const createSchedule = async (params: {
  deviceId: string;
  name: string;
  description?: string;
  points: SchedulePoint[];
}): Promise<{
  status: string;
  schedule: {
    id: string;
    name: string;
    description: string | null;
    points: SchedulePoint[];
    isActive: boolean;
  };
}> => {
  const { deviceId, name, description, points } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Validate points
  for (const point of points) {
    appAssert(
      point.hour >= 0 && point.hour <= 23,
      HTTP_CODE.BAD_REQUEST,
      "Hour must be between 0 and 23",
      ERROR_CODE.BAD_REQUEST
    );
    appAssert(
      point.minute >= 0 && point.minute <= 59,
      HTTP_CODE.BAD_REQUEST,
      "Minute must be between 0 and 59",
      ERROR_CODE.BAD_REQUEST
    );
    appAssert(
      point.intensity >= 0 && point.intensity <= 100,
      HTTP_CODE.BAD_REQUEST,
      "Intensity must be between 0 and 100",
      ERROR_CODE.BAD_REQUEST
    );
    appAssert(
      point.temperature >= 0 && point.temperature <= 100,
      HTTP_CODE.BAD_REQUEST,
      "Temperature must be between 0 and 100",
      ERROR_CODE.BAD_REQUEST
    );
  }

  const schedule = await prisma.lightSchedule.create({
    data: {
      deviceId: device.id,
      name,
      description: description || null,
      points: points as unknown as Prisma.InputJsonValue,
      isActive: false,
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      description: schedule.description,
      points: schedule.points as unknown as SchedulePoint[],
      isActive: schedule.isActive,
    },
  };
};

/**
 * Update an existing schedule
 */
export const updateSchedule = async (params: {
  scheduleId: string;
  name?: string;
  description?: string;
  points?: SchedulePoint[];
}): Promise<{
  status: string;
  schedule: {
    id: string;
    name: string;
    description: string | null;
    points: SchedulePoint[];
    isActive: boolean;
  };
}> => {
  const { scheduleId, name, description, points } = params;

  const schedule = await prisma.lightSchedule.findUnique({
    where: { id: scheduleId },
  });

  appAssert(schedule, HTTP_CODE.NOT_FOUND, "Schedule not found", ERROR_CODE.NOT_FOUND);

  // Validate points if provided
  if (points) {
    for (const point of points) {
      appAssert(
        point.hour >= 0 && point.hour <= 23,
        HTTP_CODE.BAD_REQUEST,
        "Hour must be between 0 and 23",
        ERROR_CODE.BAD_REQUEST
      );
      appAssert(
        point.minute >= 0 && point.minute <= 59,
        HTTP_CODE.BAD_REQUEST,
        "Minute must be between 0 and 59",
        ERROR_CODE.BAD_REQUEST
      );
      appAssert(
        point.intensity >= 0 && point.intensity <= 100,
        HTTP_CODE.BAD_REQUEST,
        "Intensity must be between 0 and 100",
        ERROR_CODE.BAD_REQUEST
      );
      appAssert(
        point.temperature >= 0 && point.temperature <= 100,
        HTTP_CODE.BAD_REQUEST,
        "Temperature must be between 0 and 100",
        ERROR_CODE.BAD_REQUEST
      );
    }
  }

  const updated = await prisma.lightSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(points && { points: points as unknown as Prisma.InputJsonValue }),
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    schedule: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      points: updated.points as unknown as SchedulePoint[],
      isActive: updated.isActive,
    },
  };
};

/**
 * Delete a schedule
 */
export const deleteSchedule = async (params: {
  scheduleId: string;
}): Promise<{ status: string; message: string }> => {
  const { scheduleId } = params;

  const schedule = await prisma.lightSchedule.findUnique({
    where: { id: scheduleId },
  });

  appAssert(schedule, HTTP_CODE.NOT_FOUND, "Schedule not found", ERROR_CODE.NOT_FOUND);

  await prisma.lightSchedule.delete({ where: { id: scheduleId } });

  return {
    status: API_STATUS.SUCCESS,
    message: "Schedule deleted",
  };
};

/**
 * Activate a schedule (deactivates all others for the device)
 */
export const activateSchedule = async (params: {
  deviceId: string;
  scheduleId: string;
}): Promise<{
  status: string;
  message: string;
  schedule: {
    id: string;
    name: string;
    points: SchedulePoint[];
  };
}> => {
  const { deviceId, scheduleId } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  const schedule = await prisma.lightSchedule.findUnique({
    where: { id: scheduleId },
  });

  appAssert(schedule, HTTP_CODE.NOT_FOUND, "Schedule not found", ERROR_CODE.NOT_FOUND);
  appAssert(
    schedule.deviceId === device.id,
    HTTP_CODE.FORBIDDEN,
    "Schedule does not belong to this device",
    ERROR_CODE.FORBIDDEN
  );

  // Deactivate all other schedules for this device
  await prisma.lightSchedule.updateMany({
    where: { deviceId: device.id },
    data: { isActive: false },
  });

  // Activate the selected schedule
  const activated = await prisma.lightSchedule.update({
    where: { id: scheduleId },
    data: { isActive: true },
  });

  // Update device with active schedule reference and set to auto mode
  await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      activeScheduleId: scheduleId,
      lightMode: "auto",
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    message: "Schedule activated",
    schedule: {
      id: activated.id,
      name: activated.name,
      points: activated.points as unknown as SchedulePoint[],
    },
  };
};

/**
 * Update device light state
 */
export const updateLightState = async (params: {
  deviceId: string;
  intensity?: number;
  temperature?: number;
  mode?: "manual" | "auto";
}): Promise<{
  status: string;
  lightState: {
    intensity: number;
    temperature: number;
    mode: string;
  };
}> => {
  const { deviceId, intensity, temperature, mode } = params;

  // Get device by deviceId string
  const device = await prisma.iotDevice.findUnique({
    where: { deviceId },
  });

  appAssert(device, HTTP_CODE.NOT_FOUND, "Device not found", ERROR_CODE.NOT_FOUND);

  // Validate values
  if (intensity !== undefined) {
    appAssert(
      intensity >= 0 && intensity <= 100,
      HTTP_CODE.BAD_REQUEST,
      "Intensity must be between 0 and 100",
      ERROR_CODE.BAD_REQUEST
    );
  }
  if (temperature !== undefined) {
    appAssert(
      temperature >= 0 && temperature <= 100,
      HTTP_CODE.BAD_REQUEST,
      "Temperature must be between 0 and 100",
      ERROR_CODE.BAD_REQUEST
    );
  }

  const updated = await prisma.iotDevice.update({
    where: { id: device.id },
    data: {
      ...(intensity !== undefined && { lightIntensity: intensity }),
      ...(temperature !== undefined && { lightTemperature: temperature }),
      ...(mode && { lightMode: mode }),
    },
  });

  return {
    status: API_STATUS.SUCCESS,
    lightState: {
      intensity: updated.lightIntensity,
      temperature: updated.lightTemperature,
      mode: updated.lightMode,
    },
  };
};
