import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../../mcp/server.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "serve",
  description: "Start the MCP server (stdio transport)",
  group: "system",
  options: [
    { flags: "--stdio", description: "Use stdio transport (default)", default: true },
  ],
  handler: serveCommand,
};

async function serveCommand(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
