/**
 * packcompare MCP server. Tools: compare_packages.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema"), which breaks
 * exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schema as an explicit
 * literal, and every tools/call is validated by the core, which
 * names the offending path on invalid input.
 *
 * The dependencies map fragment follows the repoready precedent
 * in this program: the standard string-to-string map fragment
 * additionalProperties {type: "string"}, carried identically in
 * the fixture and in this literal so parity is exact.
 *
 * The diff is pure local computation: no upstream API, no
 * authentication, no configuration, and no package is read or
 * touched — the tool only diffs the supplied snapshots.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { comparePackages, formatPayload, VERSION } from "./packcompare.js";

const TOOLS = [
  {
    name: "compare_packages",
    description:
      "Diff two versions of a package: which files were added, removed, or resized, which dependencies were added, removed, or changed version, how the export list moved, and whether the change is breaking.",
    inputSchema: {
      type: "object" as const,
      properties: {
        before: {
          type: "object",
          description: "The earlier package snapshot: {version, files, dependencies, exports}",
          properties: {
            version: {
              type: "string",
              description: "Package version string",
            },
            files: {
              type: "array",
              description: "Files in this snapshot (may be empty)",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "File path (unique within the snapshot)",
                  },
                  size: {
                    type: "integer",
                    description: "File size in bytes (>= 0)",
                  },
                },
                required: ["path", "size"],
              },
            },
            dependencies: {
              type: "object",
              description: "Dependency name to version string map",
              additionalProperties: { type: "string" },
            },
            exports: {
              type: "array",
              description: "Export paths in this snapshot (may be empty)",
              items: { type: "string" },
            },
          },
          required: ["version", "files", "dependencies", "exports"],
        },
        after: {
          type: "object",
          description: "The later package snapshot: {version, files, dependencies, exports}",
          properties: {
            version: {
              type: "string",
              description: "Package version string",
            },
            files: {
              type: "array",
              description: "Files in this snapshot (may be empty)",
              items: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                    description: "File path (unique within the snapshot)",
                  },
                  size: {
                    type: "integer",
                    description: "File size in bytes (>= 0)",
                  },
                },
                required: ["path", "size"],
              },
            },
            dependencies: {
              type: "object",
              description: "Dependency name to version string map",
              additionalProperties: { type: "string" },
            },
            exports: {
              type: "array",
              description: "Export paths in this snapshot (may be empty)",
              items: { type: "string" },
            },
          },
          required: ["version", "files", "dependencies", "exports"],
        },
      },
      required: ["before", "after"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "packcompare", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "compare_packages") {
      out = comparePackages(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
