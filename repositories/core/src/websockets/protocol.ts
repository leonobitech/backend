/**
 * WebSocket Protocol Types for IoT Light Control
 *
 * Messages flow:
 * - Dashboard -> Backend -> Device (commands)
 * - Device -> Backend -> Dashboard (state/telemetry)
 */

// =============================================================================
// Dashboard -> Device Messages (via Backend)
// =============================================================================

export interface SetLightMessage {
  type: "set_light";
  intensity: number; // 0-100
  temperature: number; // 0-100 (0=warm, 100=cool)
}

export interface SetModeMessage {
  type: "set_mode";
  mode: "manual" | "auto";
}

export interface SyncScheduleMessage {
  type: "sync_schedule";
  schedule: SchedulePoint[];
}

export interface RequestStateMessage {
  type: "request_state";
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

// =============================================================================
// Device -> Dashboard Messages (via Backend)
// =============================================================================

export interface LightStateMessage {
  type: "light_state";
  deviceId: string;
  intensity: number;
  temperature: number;
  mode: "manual" | "auto";
}

export interface TelemetryMessage {
  type: "telemetry";
  deviceId: string;
  freeHeap: number;
  wifiRssi: number;
  uptimeSecs: number;
  timestamp: number;
}

export interface AckMessage {
  type: "ack";
  deviceId: string;
  messageId?: string;
  success: boolean;
  error?: string;
}

export interface PongMessage {
  type: "pong";
  deviceId: string;
  timestamp: number;
  serverTimestamp: number;
}

export interface DeviceConnectedMessage {
  type: "device_connected";
  deviceId: string;
}

export interface DeviceDisconnectedMessage {
  type: "device_disconnected";
  deviceId: string;
}

// =============================================================================
// Backend -> Client Messages
// =============================================================================

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface WelcomeMessage {
  type: "welcome";
  connectionId: string;
  serverTime: number;
}

// =============================================================================
// Schedule Types
// =============================================================================

export interface SchedulePoint {
  hour: number; // 0-23
  minute: number; // 0-59
  intensity: number; // 0-100
  temperature: number; // 0-100
}

// =============================================================================
// Union Types
// =============================================================================

export type DashboardToDeviceMessage =
  | SetLightMessage
  | SetModeMessage
  | SyncScheduleMessage
  | RequestStateMessage
  | PingMessage;

export type DeviceToDashboardMessage =
  | LightStateMessage
  | TelemetryMessage
  | AckMessage
  | PongMessage;

export type ServerMessage =
  | ErrorMessage
  | WelcomeMessage
  | DeviceConnectedMessage
  | DeviceDisconnectedMessage;

export type WsMessage =
  | DashboardToDeviceMessage
  | DeviceToDashboardMessage
  | ServerMessage;

// =============================================================================
// Connection Types
// =============================================================================

export type ConnectionType = "device" | "dashboard";

export interface DeviceConnection {
  type: "device";
  deviceId: string;
  dbId: string; // MongoDB ObjectId
  connectedAt: Date;
}

export interface DashboardConnection {
  type: "dashboard";
  userId: string;
  subscribedDevices: Set<string>; // deviceIds watching
  connectedAt: Date;
}

export type ConnectionInfo = DeviceConnection | DashboardConnection;
