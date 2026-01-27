import { ApiStatus } from "@constants/apiStatus";
import { IotCommandStatus } from "@prisma/client";

// =============================================================================
// Device Registration
// =============================================================================

export type ChipInfo = {
  model: string;
  revision: number;
  cores: number;
  idf_version: string;
};

export type RegisterDeviceParams = {
  deviceId: string;
  firmwareVersion?: string;
  chipInfo?: ChipInfo;
};

export type RegisterDeviceResponse = {
  status: ApiStatus;
  message: string;
  device: {
    id: string;
    deviceId: string;
    firmwareVersion: string | null;
  };
};

// =============================================================================
// Telemetry
// =============================================================================

export type TelemetryData = {
  deviceId: string;
  freeHeap: number;
  wifiRssi: number;
  uptimeSecs: number;
  wifiSsid?: string;
  ipAddress?: string;
  sensors?: Record<string, unknown>;
};

export type SendTelemetryParams = {
  deviceId: string;
  data: TelemetryData;
};

export type SendTelemetryResponse = {
  status: ApiStatus;
  message: string;
};

// =============================================================================
// Commands
// =============================================================================

export type PendingCommand = {
  id: string;
  action: string;
  params: Record<string, unknown> | null;
};

export type GetPendingCommandsParams = {
  deviceId: string;
};

export type GetPendingCommandsResponse = {
  status: ApiStatus;
  commands: PendingCommand[];
};

export type AckCommandParams = {
  deviceId: string;
  commandId: string;
  success: boolean;
  message?: string;
};

export type AckCommandResponse = {
  status: ApiStatus;
  message: string;
};

// =============================================================================
// Device Status
// =============================================================================

export type DeviceStatusData = {
  online: boolean;
  firmwareVersion: string;
  freeHeap: number;
  wifiSsid: string;
  wifiRssi: number;
  uptimeSecs: number;
};

export type SendStatusParams = {
  deviceId: string;
  status: DeviceStatusData;
};

export type SendStatusResponse = {
  status: ApiStatus;
  message: string;
};

// =============================================================================
// Admin - Send Command to Device
// =============================================================================

export type SendCommandParams = {
  deviceId: string;
  action: string;
  params?: Record<string, unknown>;
  sentBy?: string;
};

export type SendCommandResponse = {
  status: ApiStatus;
  message: string;
  command: {
    id: string;
    action: string;
    status: IotCommandStatus;
  };
};

// =============================================================================
// Admin - List Devices
// =============================================================================

export type DeviceInfo = {
  id: string;
  deviceId: string;
  name: string | null;
  firmwareVersion: string | null;
  status: "online" | "offline" | "provisioning";
  lastSeen: string | null;
  createdAt: string;
};

export type GetDevicesResponse = {
  status: ApiStatus;
  message: string;
  devices: DeviceInfo[];
  total: number;
};

// =============================================================================
// Admin - Get Device Details
// =============================================================================

export type GetDeviceDetailsParams = {
  deviceId: string;
};

export type DeviceDetails = DeviceInfo & {
  recentTelemetry: {
    freeHeap: number;
    wifiRssi: number;
    uptimeSecs: number;
    createdAt: string;
  }[];
  pendingCommands: number;
  metadata: Record<string, unknown> | null;
};

export type GetDeviceDetailsResponse = {
  status: ApiStatus;
  message: string;
  device: DeviceDetails;
};
