// src/services/systemDesignAI.service.ts
/*
This file is the AI brain layer for SD Co-Pilot.
It has 3 jobs:
	1.	Generate a system design question
	2.	Generate coaching feedback after user answers + evaluation
	3.	Suggest the next topic & difficulty based on user stats (agent policy)
*/
import { z } from "zod";
import { responsesClient } from "../ai/openaiClient";
import { GeneratedSDQuestion } from "../interfaces/GeneratedSDQuestion";
import { SystemDesignCoachFeedback } from "../interfaces/SystemDesignCoach";
import { CoachFeedbackArgs } from "../interfaces/CoachFeedbackArgs";
import { UserSystemDesignStats } from "../interfaces/UserSDStats";
import { SystemDesignStudyPlan } from "../interfaces/SystemDesignStudyPlan";

const QuestionResponseSchema = z.object({
  question: z.string().min(1),
});

const CoachFeedbackSchema = z.object({
  summary: z.string(),

  // 🔹 New: recurring patterns across sessions
  consistentPatterns: z.array(z.string()).optional().default([]),

  // 🔹 New: how to fix the user’s mental model
  mentalModelFix: z.array(z.string()).optional().default([]),

  whatYouDidWell: z.array(z.string()),
  whatToImproveNextTime: z.array(z.string()),

  nextPracticeSuggestion: z
    .object({
      suggestedTopic: z.string(),
      suggestedDifficulty: z.enum(["easy", "medium", "hard"]),
      reason: z.string(),
    })
    .optional()
    .nullable(),

  recommendedResources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().nullable().optional(),
        reason: z.string().optional(),
      })
    )
    .optional(),
});

const StudyPlanSchema = z.object({
  profileSummary: z.string(),
  focusTopics: z.array(z.string()).default([]),
  recommendedSequence: z
    .array(
      z.object({
        step: z.number(),
        topic: z.string(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        goals: z.array(z.string()).default([]),
      })
    )
    .default([]),
  practiceSuggestions: z.array(z.string()).default([]),
});

export type StudyPlanResponse = z.infer<typeof StudyPlanSchema>;

type CoachFeedbackResponse = z.infer<typeof CoachFeedbackSchema>;
const NextTopicSchema = z.object({
  topic: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  reason: z.string().min(1),
});
export type NextTopicSuggestion = z.infer<typeof NextTopicSchema>;

// Effect of generateSystemDesignQuestion:
// 	•	You’ll get different system design questions across calls, even with the same difficulty + topic.
// 	•	They’ll still be roughly on-topic (caching, queues, etc.) because:
// 	•	system prompt constraints them, and
// 	•	top_p cuts off the super-unlikely weird stuff.

// If you notice it’s too wild / inconsistent:
// 	•	Try temperature: 0.7 and keep top_p: 0.9
// 	•	Or leave top_p unset (defaults to 1.0) and just tune temperature.

export async function generateSystemDesignQuestion(
  difficulty: "easy" | "medium" | "hard",
  topic: string | null
): Promise<GeneratedSDQuestion> {
  // •	System prompt = defines the world & rules
  // → “FAANG-style SD questions, no answers, web-scale, etc.”
  //   •	Temperature = controls how adventurous the model is inside that world
  // → higher = more variety, lower = more predictable.
  const systemPrompt = `
You are a senior backend engineer interviewing candidates for FAANG-style system design roles.
Your job is to generate DIFFERENT realistic system design interview questions over time.

Requirements:
- Tailor each question to the given difficulty: easy, medium, or hard.
- Focus on web-scale backends (feeds, messaging, search, payments, caching, queues, etc.).
- Vary the scenario, constraints, and domain so that two calls with the same topic are not identical.
- Do NOT answer the question, only ask it.
- Do NOT include any extra explanation, intro, or bullets.
Return exactly the question text only.
`;

  // const userPrompt = `Generate a ${difficulty} system design question.`;
  //   const topicText = topic
  //     ? ` about ${topic} in a large-scale system`
  //     : '';

  //     // not using it as an ID, just as a “randomness hint” in the prompt to nudge the model to vary its output between calls.
  //     const randomnessHint = Math.random().toString(36).slice(2, 8); //really want to push the model away from repeating itself, you can give it a harmless randomness hint: toString(36) is base36
  //     // temperature and top_p says “Be pretty creative, but don’t go completely off into the weeds — keep choices within the top 90% of probable continuations.”
  //     const response = await openai.chat.completions.create({
  //     model: 'gpt-4.1-mini',
  //     messages: [
  //       { role: 'system', content: systemPrompt },
  //       {
  //         role: 'user',
  //         content: `Generate a ${difficulty} FAANG-style system design interview question${topicText}.
  // Randomness hint: ${randomnessHint}. Make sure the question is realistic and not identical to previous ones.`
  //       },
  //     ],
  //     // •	Model is conservative.
  //     // •	Tends to pick the highest-probability token almost all the time.
  //     // •	Output is more deterministic, stable, “precise”, but repetitive.
  //     // •	Medium temperature (around 0.7)
  //     // •	Good balance of coherence + variation.
  //     // •	Useful default for many tasks.
  //     // •	High temperature (0.9–1.0)
  //     // •	Model is more “creative” / diverse.
  //     // •	Will more often pick lower-probability tokens.
  //     // •	Great for brainstorming / varied questions, but can be less consistent.
  //     temperature: 0.9,  // little more randomness 	•	Lower temperature (e.g. 0.1–0.3)
  // //     This is nucleus sampling:
  // // 	•	The model has a probability distribution over possible next tokens.
  // // 	•	Instead of considering all tokens, it:
  // // 	•	sorts tokens by probability (most likely → least)
  // // 	•	keeps only the smallest set whose cumulative probability ≤ top_p
  // // 	•	samples within that subset.

  // // Intuition:
  // // 	•	top_p = 1.0
  // // 	•	Use the full distribution (no filtering); temperature alone controls randomness.
  // // 	•	top_p = 0.9
  // // 	•	“Only consider the top ~90% of probability mass, ignore the long tail.”
  // // 	•	This cuts off extremely unlikely tokens, even at higher temperature.
  //     top_p: 0.9,
  //     // top_p trims the tail of unlikely tokens. It can help avoid very weird outputs at high temperature
  //   });

  const topicText = topic ? ` about ${topic} in a large-scale system` : "";

  let question =
    "Design a URL shortener like TinyURL for 100M daily active users.";

  try {
    const payload = await responsesClient.openAiClientJsonResponse({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\nRespond strictly with compact JSON: {"question":"<text>"}.`,
        },
        {
          role: "user",
          content: `Generate a ${difficulty} FAANG-style system design interview question${topicText}. Make this question different from typical textbook examples.`,
        },
      ],
      temperature: 0.9,
      schema: QuestionResponseSchema,
    });
    question = payload.question.trim();
  } catch (err) {
    console.error("Failed to generate SD question via OpenAI Responses:", err);
  }

  return { question, difficulty };
}

export async function generateSystemDesignCoachFeedback(
  args: CoachFeedbackArgs
): Promise<SystemDesignCoachFeedback> {
  const {
    topic,
    difficulty,
    question,
    answer,
    score,
    strengths,
    weaknesses,
    resources = [],
    topicMistakePatterns,
  } = args;

  const systemPrompt = `
You are an experienced backend and system design interview coach.

You help candidates improve their answers to system design questions across:
- different difficulty levels (easy, medium, hard), and
- different scales (small internal tools up to large global systems).

Important:
- "difficulty" describes how deep and nuanced the reasoning should be
  (number of components, trade-offs discussed, edge cases considered),
  NOT strictly how large the system's user base or QPS must be.
- A question at EASY difficulty can still mention a large-scale scenario,
  but expects a simpler, higher-level answer.
- A question at HARD difficulty expects deeper trade-offs and more rigorous handling of scale, reliability, and failures, even if the example system is relatively small.

You will receive:
- A system design question and the candidate's answer.
- An auto-evaluation for THIS session (score, strengths, weaknesses).
- topicMistakePatterns: a summary of recurring mistakes for this topic across the candidate's recent sessions.
- A list of learning resources (articles/notes) you can point them to.

Your job:
1. Summarize how the candidate did on THIS answer in 2–4 sentences.
2. Identify and list recurring patterns across sessions (if any) based on topicMistakePatterns.recurringMistakes.
3. Explain how the candidate should adjust their mental model for this topic (e.g., caching, queues, rate limiting) in a few concrete, practical bullets.
4. Highlight what they did well in this answer.
5. Highlight what to improve next time, grounded in sound system design principles:
   - For EASY: focus on fundamentals (requirements, APIs, data modeling, basic correctness),
     and optionally introduce scale only at a high level.
   - For MEDIUM: add more attention to read/write patterns, background jobs, caching,
     and reasonable growth in users/traffic.
   - For HARD: require deeper treatment of trade-offs (availability vs consistency, partitioning,
     failure modes, backpressure, observability), appropriate to the scenario described.
6. Suggest the next topic + difficulty to practice, consistent with the candidate's score and mistakes.
7. Optionally recommend 1–3 resources (by id/title/url from the provided list) that best address the weaknesses.

Tone guidelines:
- Be direct but supportive, like a mentor who wants the candidate to get better.
- Calibrate expectations to the stated difficulty and the scenario in the question;
  do not insist on global-scale details when the question clearly focuses on fundamentals.
- Ground your feedback in general best practices for backend and distributed systems,
  not in internal policies of any specific real-world company.
- Focus on principles and patterns.

Output STRICTLY as JSON with the following shape:
{
  "summary": string,
  "consistentPatterns": string[],        // recurring issues across sessions, if any
  "mentalModelFix": string[],           // concrete guidance on how to think differently
  "whatYouDidWell": string[],
  "whatToImproveNextTime": string[],
  "nextPracticeSuggestion": {
    "suggestedTopic": string,
    "suggestedDifficulty": "easy" | "medium" | "hard",
    "reason": string
  } | null,
  "recommendedResources": [
    {
      "id": string,
      "title": string,
      "url": string | null,
      "reason": string
    }
  ]
}

Rules:
- If topicMistakePatterns.recurringMistakes is non-empty, you MUST reflect those in "consistentPatterns".
- "mentalModelFix" should be actionable, topic-specific advice that would help the candidate avoid these mistakes in the future.
- All fields must be present; use [] for empty arrays and null for missing nextPracticeSuggestion.
`.trim();

  const resourcesSummary =
    resources.length > 0
      ? resources.map((r) => ({
          id: r.id,
          title: r.title,
          url: r.url ?? null,
          contentPreview:
            typeof (r as any).content === "string"
              ? (r as any).content.substring(0, 200)
              : "",
        }))
      : [];

  const userPayload = {
    topic,
    difficulty,
    question,
    answer,
    score,
    strengths,
    weaknesses,
    resources: resourcesSummary,
    topicMistakePatterns,
  };

  const userPrompt = JSON.stringify(userPayload, null, 2);

  try {
    const payload =
      await responsesClient.openAiClientJsonResponse<CoachFeedbackResponse>({
        model: "gpt-4.1-mini",
        temperature: 0.4, //	•	Coaching should be consistent and grounded, not creative. 	•	Low temp = less hallucination.
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        schema: CoachFeedbackSchema,
      });

    // Map recommended resource IDs back to full resource objects
    const recommendedResources =
      payload.recommendedResources && resources.length > 0
        ? payload.recommendedResources
            .map((rec) => {
              const resource = resources.find((r) => r.id === rec.id);
              return resource
                ? {
                    id: resource.id,
                    title: resource.title,
                    url: resource.url,
                  }
                : null;
            })
            .filter(
              (r): r is { id: string; title: string; url: string | null } =>
                r !== null
            )
        : undefined;

    const normalized: SystemDesignCoachFeedback = {
      summary: payload.summary,
      consistentPatterns: payload.consistentPatterns ?? [],
      mentalModelFix: payload.mentalModelFix ?? [],
      whatYouDidWell: payload.whatYouDidWell,
      whatToImproveNextTime: payload.whatToImproveNextTime,
      nextPracticeSuggestion: payload.nextPracticeSuggestion ?? undefined,
      recommendedResources,
    };

    return normalized;
  } catch (err) {
    console.error(
      "Failed to generate coach feedback via OpenAI Responses:",
      err
    );
    const fallback: SystemDesignCoachFeedback = {
      summary: "The coach model failed to return valid JSON. Please try again.",
      whatYouDidWell: [],
      whatToImproveNextTime: [],
      nextPracticeSuggestion: undefined,
    };
    return fallback;
  }
}

export async function aiSuggestNextTopic(
  stats: UserSystemDesignStats
): Promise<NextTopicSuggestion> {
  const systemPrompt = `
You are the System Design Co-Pilot planning agent. Read prior stats and decide the next practice topic plus difficulty.
Policy:
- Prioritize weak topics (avg score < overall avg or labeled weak) until they improve.
- When strengths dominate, push difficulty higher on strongest topics for stretch reps.
- Reference concrete stats (scores, counts, labels) in your explanation.
- Avoid repeating the identical topic twice if multiple weak topics exist.
Return strict JSON with topic, difficulty, reason.
`.trim();

  return responsesClient.openAiClientJsonResponse({
    model: "gpt-4.1-mini",
    temperature: 0.3, // Topic selection should be stable policy, not random creativity.
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(stats),
      },
    ],
    schema: NextTopicSchema,
  });
}

export async function generateSystemDesignStudyPlan(args: {
  stats: any; // your UserSystemDesignStats type if you have it
  resourcesByTopic: Record<
    string,
    { id: string; title: string; url: string | null }[]
  >;
}) {
  const { stats, resourcesByTopic } = args;

  const systemPrompt = `
You are an experienced system design tutor.

You will receive:
- aggregate stats about a candidate's system design practice (overall level, topics, scores),
- lists of weak and strong topics,
- and a small set of recommended resources per topic (each resource has a title and url).

Your job:
1. Summarize the candidate's current profile in 2–4 sentences.
2. Choose 1–3 "focusTopics" that will give the best leverage for improvement.
3. Build a short "recommendedSequence" of study steps (3–6 steps), where each step has:
   - step: number
   - topic: string
   - difficulty: "easy" | "medium" | "hard"
   - goals: concrete learning goals for that step.
4. Provide a small list of "practiceSuggestions" with concrete actions (e.g. how many problems to solve, what to pay attention to).

Important rules about resources:
- You MAY reference resources from resourcesByTopic in practiceSuggestions.
- If you reference a resource, you MUST include both its title and its exact url
  from the input. Use the pattern: "Review \\"<title>\\" (<url>) ...".
- Do NOT invent new resources or fake URLs; only use resources actually present in resourcesByTopic.

Output STRICTLY as JSON following this schema:
{
  "profileSummary": string,
  "focusTopics": string[],
  "recommendedSequence": [
    {
      "step": number,
      "topic": string,
      "difficulty": "easy" | "medium" | "hard",
      "goals": string[]
    }
  ],
  "practiceSuggestions": string[]
}
`.trim();

  const userPayload = {
    stats,
    resourcesByTopic,
  };

  const result =
    await responsesClient.openAiClientJsonResponse<StudyPlanResponse>({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      schema: StudyPlanSchema,
    });

  return {
    profileSummary: result.profileSummary,
    focusTopics: result.focusTopics ?? [],
    recommendedSequence: result.recommendedSequence ?? [],
    practiceSuggestions: result.practiceSuggestions ?? [],
  } as SystemDesignStudyPlan;
}
