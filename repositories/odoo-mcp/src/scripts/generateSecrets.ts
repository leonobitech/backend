import { randomBytes } from "node:crypto";

/**
 * Generate secure random secrets for production use
 * Run: npm run generate:secrets
 */

console.log("🔐 Generating secure secrets for odoo-mcp...\n");

// Generate ENCRYPTION_KEY (32 bytes = 64 hex characters)
const encryptionKey = randomBytes(32).toString("hex");
console.log("ENCRYPTION_KEY (for encrypting Odoo credentials in database):");
console.log(encryptionKey);
console.log();

// Generate SESSION_COOKIE_SECRET (at least 32 characters)
const sessionSecret = randomBytes(32).toString("hex");
console.log("SESSION_COOKIE_SECRET (for signing session cookies):");
console.log(sessionSecret);
console.log();

// Generate CLIENT_SECRET (for OAuth2)
const clientSecret = randomBytes(32).toString("hex");
console.log("CLIENT_SECRET (for OAuth2 client authentication):");
console.log(clientSecret);
console.log();

console.log("✅ Copy these values to your .env file");
console.log("⚠️  NEVER commit these secrets to version control!");
console.log("\n📝 Add to .env:");
console.log(`
ENCRYPTION_KEY=${encryptionKey}
SESSION_COOKIE_SECRET=${sessionSecret}
CLIENT_SECRET=${clientSecret}
`);
