import { searchContactsSchema, type SearchContactsInput, type SearchContactsResponse } from "./search-contacts.schema";
import type { OdooClient } from "@/lib/odoo";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class SearchContactsTool implements ITool<SearchContactsInput, SearchContactsResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<SearchContactsResponse> {
    const params = searchContactsSchema.parse(input);

    const domain = [
      "|", "|",
      ["name", "ilike", params.query],
      ["email", "ilike", params.query],
      ["phone", "ilike", params.query]
    ];

    const contacts = await this.odooClient.search("res.partner", domain, {
      fields: ["id", "name", "email", "phone", "is_company", "street", "city", "country_id", "website", "create_date"],
      limit: params.limit,
      order: "create_date desc"
    });

    return { contacts };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_search_contacts",
      description: "Search for contacts (customers, suppliers, companies) in Odoo",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query (name, email, or phone)"
          },
          limit: {
            type: "number",
            description: "Maximum number of contacts to return (default: 5, max: 20)"
          }
        },
        required: ["query"]
      }
    };
  }
}
