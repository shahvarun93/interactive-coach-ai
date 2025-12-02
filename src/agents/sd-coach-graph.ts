

import * as usersDao from "../dao/users.dao";
import * as systemDesignDao from "../dao/system-design.dao";
import { getUserSystemDesignStats, buildTopicMistakePatternsForUser } from "../services/system-design.service";
import * as systemDesignResourcesService from "../services/sd-resources.service";
import * as systemDesignAiService from "../services/system-design-ai.service";
import { SDCoachGraphState } from "../interfaces/SystemDesignGraph";
import { SystemDesignCoachResponse } from "../interfaces/SystemDesignCoach";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { SystemDesignSession } from "../interfaces/SystemDesignSession";
import { TopicMistakePatterns } from "../interfaces/TopicMistakes";
import { UserSystemDesignStats } from "../interfaces/UserSDStats";
import { SDResource } from "../interfaces/SDResource";

const CoachState = Annotation.Root({
  email: Annotation<string>(),
  userId: Annotation<string>() || undefined,
  sessionId: Annotation<string>(),
  session: Annotation<SystemDesignSession | null>() || undefined,
  stats: Annotation<UserSystemDesignStats | null>() || undefined,
  topicMistakePatterns: Annotation<TopicMistakePatterns | null>() || undefined,
  ragResources: Annotation<SDResource[] | null>() || undefined,
  coachResponse: Annotation<SystemDesignCoachResponse | null>() || undefined,
  error: Annotation<string | null>() || undefined,
});

export const loadContextNode = async (
  state: SDCoachGraphState
): Promise<SDCoachGraphState> => {
  const { email, sessionId } = state;

  const user = await usersDao.findUserByEmail(email);
  if (!user) {
    return { ...state, error: "USER_NOT_FOUND" };
  }

  const session = await systemDesignDao.findSystemDesignSessionById(sessionId);
  if (!session || session.user_id !== user.id) {
    return { ...state, error: "SESSION_NOT_FOUND" };
  }

  const stats = await getUserSystemDesignStats(user.id);

  const topic = (session as any).topic ?? "general";
  const topicMistakePatterns = await buildTopicMistakePatternsForUser(
    user.id,
    topic,
    5
  );

  // optional: simple topic-based RAG (no embeddings here to keep it light)
  const ragResources = await systemDesignResourcesService.findResourcesForTopic(
    topic,
    5
  );

  return {
    ...state,
    userId: user.id,
    session,
    stats,
    topicMistakePatterns,
    ragResources,
  };
};

export const coachAgentNode = async (
  state: SDCoachGraphState
): Promise<SDCoachGraphState> => {
  if (state.error) return state;
  if (!state.session || !state.stats) {
    return { ...state, error: "MISSING_CONTEXT" };
  }

  const session = state.session;
  const topic = (session as any).topic ?? "general";
  const difficulty = (session as any).difficulty ?? "medium";

  // strengths/weaknesses normalization — same as you do in createCoachFeedbackForSession
  const strengthsArray: string[] = Array.isArray(session.strengths)
    ? session.strengths
    : typeof session.strengths === "string" && session.strengths.startsWith("[")
    ? JSON.parse(session.strengths)
    : session.strengths
    ? [session.strengths]
    : [];

  const weaknessesArray: string[] = Array.isArray(session.weaknesses)
    ? session.weaknesses
    : typeof session.weaknesses === "string" &&
      session.weaknesses.startsWith("[")
    ? JSON.parse(session.weaknesses)
    : session.weaknesses
    ? [session.weaknesses]
    : [];

  const question = (session as any).question ?? (session as any).prompt;
  if (!question || !session.answer || session.score == null) {
    return { ...state, error: "INCOMPLETE_SESSION" };
  }

  const coachFeedback =
    await systemDesignAiService.generateSystemDesignCoachFeedback({
      topic,
      difficulty,
      question,
      answer: session.answer,
      score: session.score,
      strengths: strengthsArray,
      weaknesses: weaknessesArray,
      resources: state.ragResources ?? [],
      topicMistakePatterns: state.topicMistakePatterns ?? {
        sessionsConsidered: 0,
        recurringMistakes: [],
      },
    });

  const resourcesPayload: {
    id: string;
    title: string;
    url: string | null;
    topic: string;
    contentSnippet: string
  }[] =
    (state.ragResources ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url ?? null,
      topic: r.topic ?? '',
      contentSnippet:
        typeof r.content === "string" ? r.content.slice(0, 160) + "..." : "",
    }));

  const coachResponse: SystemDesignCoachResponse = {
    sessionId: session.id,
    topic,
    difficulty,
    score: session.score,
    coachFeedback,
    resources: resourcesPayload,
  };

  return { ...state, coachResponse };
};

export function buildCoachGraph() {
  const graph = new StateGraph(CoachState);

  graph.addNode("loadContext", loadContextNode)
        .addNode("coachAgent", coachAgentNode)
        .addEdge(START, "loadContext")
        .addEdge("loadContext", "coachAgent")
        .addEdge("coachAgent", END);

  return graph.compile();
}

const coachGraphApp = buildCoachGraph();

export async function runCoachGraphForSession(
  email: string,
  sessionId: string
): Promise<SystemDesignCoachResponse> {
  const initialState: SDCoachGraphState = {
    email,
    sessionId,
  };

  // 1) Let LangGraph accept our state, then cast the result back
  const finalState = (await coachGraphApp.invoke(
    initialState as any
  ));

  // 2) Make sure we always pass a string into Error()
  if (finalState.error) {
    const msg = String(finalState.error);
    if (msg === "USER_NOT_FOUND") {
      throw new Error("USER_NOT_FOUND");
    }
    if (msg === "SESSION_NOT_FOUND") {
      throw new Error("SESSION_NOT_FOUND");
    }
    throw new Error(msg);
  }

  // 3) TS: assert that coachResponse really is our strong type
  if (!finalState.coachResponse) {
    throw new Error("COACH_RESPONSE_EMPTY");
  }

  return finalState.coachResponse as SystemDesignCoachResponse;
}