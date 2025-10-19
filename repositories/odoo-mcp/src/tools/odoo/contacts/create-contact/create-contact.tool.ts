import { createContactSchema, type CreateContactInput, type CreateContactResponse } from "./create-contact.schema";
import type { OdooClient } from "@/adapters/out/external/odoo/OdooClient";
import { ITool, ToolDefinition } from "@/tools/base/Tool.interface";

export class CreateContactTool implements ITool<CreateContactInput, CreateContactResponse> {
  constructor(private readonly odooClient: OdooClient) {}

  async execute(input: unknown): Promise<CreateContactResponse> {
    const params = createContactSchema.parse(input);

    const values: Record<string, any> = {
      name: params.name,
      is_company: params.isCompany || false
    };

    if (params.email) values.email = params.email;
    if (params.phone) values.phone = params.phone;
    if (params.mobile) values.mobile = params.mobile;
    if (params.street) values.street = params.street;
    if (params.city) values.city = params.city;
    if (params.website) values.website = params.website;

    const contactId = await this.odooClient.create("res.partner", values);

    return {
      contactId,
      message: `Contact "${params.name}" created successfully`
    };
  }

  definition(): ToolDefinition {
    return {
      name: "odoo_create_contact",
      description: "Create a new contact (customer/supplier) in Odoo",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Contact/company name (required)"
          },
          email: {
            type: "string",
            description: "Email address"
          },
          phone: {
            type: "string",
            description: "Phone number"
          },
          mobile: {
            type: "string",
            description: "Mobile number"
          },
          isCompany: {
            type: "boolean",
            description: "Whether this is a company (true) or individual (false)"
          },
          street: {
            type: "string",
            description: "Street address"
          },
          city: {
            type: "string",
            description: "City"
          },
          website: {
            type: "string",
            description: "Website URL"
          }
        },
        required: ["name"]
      }
    };
  }
}
