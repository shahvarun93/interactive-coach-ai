// src/agents/system-design-graph.ts

import { UserSystemDesignStats } from "../interfaces/UserSDStats"; // adjust path if needed
import * as usersService from "../services/users.service";
import * as systemDesignService from "../services/system-design.service";

import { Annotation, StateGraph } from "@langchain/langgraph";
import { RunnableLambda } from "@langchain/core/runnables";

const SDState = Annotation.Root({
  email: Annotation<string>(),
  userId: Annotation<string | undefined>(),
  stats: Annotation<UserSystemDesignStats | undefined>(),
  topic: Annotation<string | undefined>(),
  difficulty: Annotation<("easy" | "medium" | "hard") | undefined>(),
  sessionId: Annotation<string | undefined>(),
  question: Annotation<string | undefined>(),
  done: Annotation<boolean | undefined>(),
});

export type SDGraphState = typeof SDState.State;

// ----------------------
// Node implementations
// ----------------------

// Note: Each node now returns a *partial* update, not the full SDGraphState.
// LangGraph will merge these into the existing state object.

const loadUserAndStatsNode = new RunnableLambda({
  func: async (state: SDGraphState): Promise<Partial<SDGraphState>> => {
    if (!state.email) {
      throw new Error("SDGraphState.email is required");
    }

    let user = await usersService.findUserByEmail(state.email);
    if (!user) {
      user = await usersService.createUser(state.email);
    }

    const stats = await systemDesignService.getUserSystemDesignStats(user.id);

    return {
      userId: user.id,
      stats,
    };
  },
});

const chooseTopicAndDifficultyNode = new RunnableLambda({
  func: async (state: SDGraphState): Promise<Partial<SDGraphState>> => {
    if (!state.stats) {
      throw new Error(
        "SDGraphState.stats is required. Did you run loadUserAndStats first?"
      );
    }

    const { topic, difficulty } =
      await systemDesignService.chooseNextTopicAndDifficultyForUser(
        state.stats.userId
      );

    return {
      topic,
      difficulty,
    };
  },
});

const generateQuestionNode = new RunnableLambda({
  func: async (state: SDGraphState): Promise<Partial<SDGraphState>> => {
    if (!state.userId) {
      throw new Error("generateQuestion: userId is required on state");
    }
    if (!state.topic || !state.difficulty) {
      throw new Error(
        "generateQuestion: topic and difficulty must be set before calling this node"
      );
    }

    const { session, question } =
      await systemDesignService.createAISystemDesignSessionForUser(
        state.userId,
        state.difficulty,
        state.topic
      );

    return {
      sessionId: session.id,
      question: question ?? session.prompt ?? "",
    };
  },
});
// ----------------------
// Build and compile graph
// ----------------------

function buildQuestionGraph() {
  const workflow = new StateGraph(SDState)
    .addNode("loadUserAndStats", loadUserAndStatsNode)
    .addNode("chooseTopicAndDifficulty", chooseTopicAndDifficultyNode)
    .addNode("generateQuestion", generateQuestionNode)
    .addEdge("__start__", "loadUserAndStats")
    .addEdge("loadUserAndStats", "chooseTopicAndDifficulty")
    .addEdge("chooseTopicAndDifficulty", "generateQuestion")
    .addEdge("generateQuestion", "__end__");

  return workflow.compile();
} 

// Singleton compiled app
const questionGraphApp = buildQuestionGraph();

// Public entrypoint used by your route
export async function runQuestionGraphForEmail(
  email: string
): Promise<SDGraphState> {
  const initialState: SDGraphState = {
    email,
    userId: undefined,
    stats: undefined,
    topic: undefined,
    difficulty: undefined,
    sessionId: undefined,
    question: undefined,
    done: undefined,
  };

  const result = await questionGraphApp.invoke(initialState);

  // If you want a `done` flag in the state, you can either:
  // 1) Add a final node that sets done: true, or
  // 2) Just mark it here in the returned value:
  return {
    ...result,
    done: true,
  };
}

// Public entrypoint for evaluation / coach flow.
// Used by POST /api/v1/system-design/coach
export async function runSystemDesignEvaluationGraph(args: {
  email: string;
  sessionId: string;
}) {
  const { email, sessionId } = args;

  if (!email || !sessionId) {
    throw new Error("email and sessionId are required");
  }

  // 1) Find or create user
  let user = await usersService.findUserByEmail(email);
  if (!user) {
    user = await usersService.createUser(email);
  }

  // 2) Run your existing coach pipeline in the service layer
  //    (adjust this call to match your actual signature/return type)
  const coachResponse = await systemDesignService.createCoachFeedbackForSession(
    email,
    sessionId
  );
  // I’m assuming coachResult looks like:
  // { score: number; coachFeedback: SystemDesignCoachResponse; ... }

  // 3) Optionally refresh stats (so UI can show updated aggregates)
  const stats = await systemDesignService.getUserSystemDesignStats(user.id);

  // 4) Return a shape that /coach route already expects
  return {
    email,
    sessionId,
    score: coachResponse.score,
    coachFeedback: coachResponse.coachFeedback ?? coachResponse, // depending on how you typed SystemDesignCoachResponse
    stats,
  };
}