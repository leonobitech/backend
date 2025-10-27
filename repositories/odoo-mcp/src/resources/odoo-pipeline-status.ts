/**
 * Resource: odoo://pipeline/status
 *
 * Provides real-time CRM pipeline status summary
 *
 * TODO: This resource needs to be refactored to accept user credentials
 * Currently using dummy credentials - will fail when called
 */

import { createOdooClient, type OdooCredentials } from "@/lib/odoo";

/**
 * TEMPORARY: Dummy credentials for compilation
 * This function should accept user credentials as parameter
 */
const DUMMY_CREDENTIALS: OdooCredentials = {
  url: "https://odoo.example.com",
  db: "dummy",
  username: "dummy@example.com",
  apiKey: "dummy_key"
};

export async function getPipelineStatus(): Promise<string> {
  // TODO: Get user credentials from authentication context
  const odoo = createOdooClient(DUMMY_CREDENTIALS);

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
