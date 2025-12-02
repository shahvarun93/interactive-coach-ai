// src/mcp/system-design-mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import * as usersDao from "../dao/users.dao";
import * as systemDesignService from "../services/system-design.service";
import * as systemDesignResourcesService from "../services/sd-resources.service";
import * as systemDesignLangGraphAgent from "../agents/system-design-langgraph";
import { SDResource } from "../interfaces/SDResource";

const mcpServer = new McpServer({
  name: "sd-copilot-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "sd_recommend_resources",
  {
    description: "Recommend SD resources based on a user's weak topics",
    inputSchema: z.object({
      email: z.string().describe("User email address"),
    }),
  },
  // handler
  async (input: { email: string }) => {
    try {
      const email = String(input.email || "").trim();
      if (!email) {
        return {
          content: [{ type: "text", text: "Missing required field: email" }],
          isError: true,
        };
      }

      const user = await usersDao.findUserByEmail(email);
      if (!user) {
        return {
          content: [
            {
              type: "text",
              text: `No user found for email: ${email}`,
            },
          ],
          isError: true,
        };
      }

      const stats = await systemDesignService.getUserSystemDesignStats(user.id);
      const weakTopics = stats.weakTopics ?? [];

      if (!weakTopics.length) {
        return {
          content: [
            {
              type: "text",
              text: `User ${email} has no clearly weak topics yet. Try a few practice sessions first.`,
            },
          ],
        };
      }

      const resourcesByTopic: Record<
        string,
        { id: string; title: string; url: string | null }[]
      > = {};

      for (const topic of weakTopics) {
        const resources =
          await systemDesignResourcesService.findResourcesForTopic(topic, 3);
        resourcesByTopic[topic] = resources.map((r: SDResource) => ({
          id: r.id,
          title: r.title,
          url: r.url ?? null,
        }));
      }

      // IMPORTANT: Use text, not "json"
      const payload = {
        email,
        weakTopics,
        resourcesByTopic,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (err) {
      console.error("sd_recommend_resources tool error:", err);
      return {
        content: [
          {
            type: "text",
            text: "Internal error while recommending resources. Check MCP server logs.",
          },
        ],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "sd_study_plan",
  {
    description:
      "Generate a personalized system design study plan for the given user email.",
    inputSchema: z.object({
      email: z.string().describe("User email address"),
    }),
  },
  async (input: { email: string }) => {
    console.log("[MCP] sd_study_plan called with", input);
    try {
      const email = String(input.email || "").trim();
      if (!email) {
        return {
          content: [{ type: "text", text: "Missing required field: email" }],
          isError: true,
        };
      }

      const user = await usersDao.findUserByEmail(email);
      if (!user) {
        return {
          content: [
            {
              type: "text",
              text: `No user found for email: ${email}`,
            },
          ],
          isError: true,
        };
      }

      // You already have this service in your app
      const plan =
        await systemDesignService.getSystemDesignPlanForUser(user.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                email,
                studyPlan: plan,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      console.error("sd_study_plan tool error:", err);
      return {
        content: [
          {
            type: "text",
            text:
              "Internal error while generating study plan. Check MCP server logs.",
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: generate next system design question for a user
mcpServer.registerTool(
  "sd_next_question",
  {
    description:
      "Generate the next system design practice question for a user by email, using their history and weak topics.",
    inputSchema: z.object({
      email: z.string().describe("User email address"),
    }),
  },
  async (input: { email: string }) => {
    const email = String(input.email || "").trim();
    if (!email) {
      return {
        content: [{ type: "text", text: "Missing required field: email" }],
        isError: true,
      };
    }

    // This function already knows how to:
    // - ensure the user exists
    // - load stats
    // - pick topic/difficulty
    // - create a new session + question
    const state = await systemDesignLangGraphAgent.runQuestionGraphForEmail(email);

    if (!state.question || !state.sessionId || !state.topic || !state.difficulty) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to generate question for ${email}.`,
          },
        ],
        isError: true,
      };
    }

    const payload = {
      email,
      userId: state.userId,
      sessionId: state.sessionId,
      topic: state.topic,
      difficulty: state.difficulty,
      question: state.question,
      overallLevel: state.stats?.overallLevel ?? null,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});