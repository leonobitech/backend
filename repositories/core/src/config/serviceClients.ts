import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SERVICE_CLIENTS } from "@config/env";

interface ParsedServiceClient {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  name?: string;
  active: boolean;
}

export interface ServiceClient {
  id: string;
  name?: string;
  scopes: string[];
  active: boolean;
  secretHash: Buffer;
}

const serviceClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  name: z.string().optional(),
  active: z.boolean().optional().default(true),
});

const parseConfig = (): ServiceClient[] => {
  if (!SERVICE_CLIENTS) {
    return [];
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(SERVICE_CLIENTS);
  } catch (error) {
    throw new Error("Invalid SERVICE_CLIENTS JSON configuration");
  }

  const clients = z.array(serviceClientSchema).parse(parsedJson) as ParsedServiceClient[];

  return clients.map((client) => {
    const secretHash = createHash("sha256").update(client.clientSecret).digest();
    return {
      id: client.clientId,
      name: client.name,
      scopes: Array.from(new Set(client.scopes)),
      active: client.active,
      secretHash,
    };
  });
};

const serviceClients = parseConfig();

export const getServiceClientById = (clientId: string): ServiceClient | undefined => {
  return serviceClients.find((client) => client.id === clientId);
};

export const verifyClientSecret = (client: ServiceClient, secret: string): boolean => {
  const providedHash = createHash("sha256").update(secret).digest();
  try {
    return timingSafeEqual(client.secretHash, providedHash);
  } catch {
    return false;
  }
};

export const listServiceClients = (): Array<Pick<ServiceClient, "id" | "name" | "scopes" | "active">> =>
  serviceClients.map(({ id, name, scopes, active }) => ({ id, name, scopes, active }));
