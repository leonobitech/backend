/**
 * Resource: odoo://pipeline/status
 *
 * Provides real-time CRM pipeline status summary
 */

import { createOdooClient, type OdooCredentials } from "@/lib/odoo";
import { prisma } from "@/config/database";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Load user's Odoo credentials from database
 */
async function loadUserCredentials(userId: string): Promise<OdooCredentials | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        odooUrl: true,
        odooDb: true,
        odooUsername: true,
        odooApiKey: true,
      },
    });

    if (!user || !user.odooUrl || !user.odooDb || !user.odooUsername || !user.odooApiKey) {
      return null;
    }

    return {
      url: decrypt(user.odooUrl),
      db: decrypt(user.odooDb),
      username: decrypt(user.odooUsername),
      apiKey: decrypt(user.odooApiKey),
    };
  } catch (error) {
    logger.error({ userId, error }, "[getPipelineStatus] Failed to load credentials");
    return null;
  }
}

export async function getPipelineStatus(userId: string): Promise<string> {
  // Load user's credentials
  const credentials = await loadUserCredentials(userId);

  if (!credentials) {
    return `# Odoo CRM Pipeline Status\n\n**Error**: No Odoo credentials configured.\n\nPlease register with your Odoo credentials to use this resource.`;
  }

  const odoo = createOdooClient(credentials);

  const opportunities = await odoo.search("crm.lead", [["type", "=", "opportunity"]], {
    fields: ["stage_id", "expected_revenue"],
    limit: 1000
  });

  const byStage: Record<string, { count: number; revenue: number }> = {};
  let totalRevenue = 0;

  for (const opp of opportunities) {
    const stageName = opp.stage_id?.[1] || "Unknown";
    if (!byStage[stageName]) byStage[stageName] = { count: 0, revenue: 0 };
    byStage[stageName].count++;
    byStage[stageName].revenue += opp.expected_revenue || 0;
    totalRevenue += opp.expected_revenue || 0;
  }

  let summary = `# Odoo CRM Pipeline Status\n\n`;
  summary += `**Total Opportunities:** ${opportunities.length}\n`;
  summary += `**Total Expected Revenue:** $${totalRevenue.toLocaleString()}\n\n`;
  summary += `## By Stage:\n\n`;

  for (const [stage, data] of Object.entries(byStage)) {
    summary += `- **${stage}**: ${data.count} deals, $${data.revenue.toLocaleString()}\n`;
  }

  return summary;
}
