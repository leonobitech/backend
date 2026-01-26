import prisma from "@config/prisma";
import { CLIENT_KEY_SECRET } from "@config/env";
import { HTTP_CODE } from "@constants/httpCode";
import { ERROR_CODE } from "@constants/errorCode";
import appAssert from "@utils/validation/appAssert";
import { hmacHash } from "@utils/crypto/hmacHash";
import { API_STATUS } from "@constants/apiStatus";
import { IotCommandStatus, Prisma } from "@prisma/client";

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
  const { deviceId, firmwareVersion } = params;
  const hashedApiKey = hmacHash(apiKey, CLIENT_KEY_SECRET);

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

  // Save telemetry
  await prisma.iotTelemetry.create({
    data: {
      deviceId: device.id,
      freeHeap: data.freeHeap,
      wifiRssi: data.wifiRssi,
      uptimeSecs: data.uptimeSecs,
      sensors: (data.sensors as Prisma.InputJsonValue) || null,
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
    sensors: Record<string, unknown> | null;
    battery: number | null;
    rssi: number | null;
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
      sensors: t.sensors as Record<string, unknown> | null,
      battery: null, // Add if field exists
      rssi: t.wifiRssi,
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
      isOnline: d.isOnline,
      lastSeenAt: d.lastSeenAt?.toISOString() || null,
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
      isOnline: device.isOnline,
      lastSeenAt: device.lastSeenAt?.toISOString() || null,
      createdAt: device.createdAt.toISOString(),
      recentTelemetry: device.telemetry.map((t) => ({
        freeHeap: t.freeHeap,
        wifiRssi: t.wifiRssi,
        uptimeSecs: t.uptimeSecs,
        createdAt: t.createdAt.toISOString(),
      })),
      pendingCommands: device.commands.length,
    },
  };
};
