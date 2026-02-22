import xmlrpc from "xmlrpc";
import { logger } from "@/lib/logger";

/**
 * Odoo XML-RPC Service
 * Validates credentials and performs authentication with Odoo instance
 */

export interface OdooConnectionParams {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

export interface OdooAuthResult {
  success: boolean;
  userId?: number;
  error?: string;
}

/**
 * Validates Odoo credentials by attempting authentication
 * Returns userId if successful, null if failed
 */
export async function validateOdooCredentials(
  params: OdooConnectionParams
): Promise<OdooAuthResult> {
  const { url, db, username, apiKey } = params;

  try {
    // Parse Odoo URL to get host and port
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const port = urlObj.port ? parseInt(urlObj.port) : isHttps ? 443 : 80;

    // Create XML-RPC client
    const client = isHttps
      ? xmlrpc.createSecureClient({
          host: urlObj.hostname,
          port,
          path: "/xmlrpc/2/common",
        })
      : xmlrpc.createClient({
          host: urlObj.hostname,
          port,
          path: "/xmlrpc/2/common",
        });

    // Attempt authentication
    const userId = await new Promise<number>((resolve, reject) => {
      client.methodCall(
        "authenticate",
        [db, username, apiKey, {}],
        (error, value) => {
          if (error) {
            reject(error);
          } else if (!value || value === false) {
            reject(new Error("Authentication failed: Invalid credentials"));
          } else {
            resolve(value as number);
          }
        }
      );
    });

    logger.info(
      {
        userId,
        db,
        username,
        url: urlObj.hostname,
      },
      "Odoo credentials validated successfully"
    );

    return {
      success: true,
      userId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.warn(
      {
        err: error,
        db,
        username,
        url,
      },
      "Odoo credential validation failed"
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Creates an Odoo XML-RPC client for API calls
 * Used after authentication to perform operations
 */
export function createOdooClient(
  url: string,
  isObject: boolean = false
): xmlrpc.Client {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === "https:";
  const port = urlObj.port ? parseInt(urlObj.port) : isHttps ? 443 : 80;
  const path = isObject ? "/xmlrpc/2/object" : "/xmlrpc/2/common";

  return isHttps
    ? xmlrpc.createSecureClient({
        host: urlObj.hostname,
        port,
        path,
      })
    : xmlrpc.createClient({
        host: urlObj.hostname,
        port,
        path,
      });
}

/**
 * Test connection to Odoo instance (without authentication)
 * Useful for checking if Odoo server is reachable
 */
export async function testOdooConnection(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const port = urlObj.port ? parseInt(urlObj.port) : isHttps ? 443 : 80;

    const client = isHttps
      ? xmlrpc.createSecureClient({
          host: urlObj.hostname,
          port,
          path: "/xmlrpc/2/common",
        })
      : xmlrpc.createClient({
          host: urlObj.hostname,
          port,
          path: "/xmlrpc/2/common",
        });

    // Call version() method to test connection
    const version = await new Promise<any>((resolve, reject) => {
      client.methodCall("version", [], (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });

    logger.info({ url: urlObj.hostname, version }, "Odoo connection test successful");
    return true;
  } catch (error) {
    logger.warn({ err: error, url }, "Odoo connection test failed");
    return false;
  }
}
