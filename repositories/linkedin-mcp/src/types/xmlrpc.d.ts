/**
 * Type definitions for xmlrpc module
 * Since @types/xmlrpc doesn't exist, we define the minimal types we need
 */

declare module "xmlrpc" {
  export interface ClientOptions {
    url: string;
    host?: string;
    port?: number;
    path?: string;
    cookies?: boolean;
    headers?: Record<string, string>;
    rejectUnauthorized?: boolean;
  }

  export interface Client {
    methodCall(
      method: string,
      params: any[],
      callback: (error: Error | null, value: any) => void
    ): void;
  }

  export function createClient(options: ClientOptions): Client;
  export function createSecureClient(options: ClientOptions): Client;
}
