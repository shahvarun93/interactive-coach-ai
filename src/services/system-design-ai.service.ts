// src/services/systemDesignAI.service.ts
import { openai } from '../llm/open-ai-client';
import { GeneratedSDQuestion } from '../interfaces/GeneratedSDQuestion';  
import { SystemDesignCoachFeedback } from '../interfaces/SystemDesignCoach';
import { CoachFeedbackArgs } from '../interfaces/CoachFeedbackArgs';

// Effect of generateSystemDesignQuestion:
// 	•	You’ll get different system design questions across calls, even with the same difficulty + topic.
// 	•	They’ll still be roughly on-topic (caching, queues, etc.) because:
// 	•	system prompt constraints them, and
// 	•	top_p cuts off the super-unlikely weird stuff.

// If you notice it’s too wild / inconsistent:
// 	•	Try temperature: 0.7 and keep top_p: 0.9
// 	•	Or leave top_p unset (defaults to 1.0) and just tune temperature.

export async function generateSystemDesignQuestion(
  difficulty: 'easy' | 'medium' | 'hard',
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

  const topicText = topic
    ? ` about ${topic} in a large-scale system`
    : '';

  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Generate a ${difficulty} FAANG-style system design interview question${topicText}. Make this question different from typical textbook examples.`,
      },
    ],
    temperature: 0.9,  // single knob for variety
    // top_p omitted → defaults to 1.0
  });

  const question =
    response.choices[0]?.message?.content?.trim() ??
    'Design a URL shortener like TinyURL for 100M daily active users.';

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
  } = args;

  const systemPrompt = `
You are a senior system design interview coach helping a software engineer prepare for FAANG / big-tech interviews.

You receive:
- The system design question.
- The candidate's answer.
- An auto-evaluated score (0–10).
- Lists of strengths and weaknesses.

Your job:
1. Summarize where the candidate stands for THIS answer in 2–3 sentences.
2. Highlight 2–4 things they did well (concrete, not generic).
3. Highlight 2–4 specific improvements they should make next time for THIS kind of problem.
4. Optionally suggest the next topic + difficulty they should practice and why.

Output STRICTLY as JSON with the following shape:

{
  "summary": string,
  "whatYouDidWell": string[],
  "whatToImproveNextTime": string[],
  "nextPracticeSuggestion": {
    "suggestedTopic": string,
    "suggestedDifficulty": "easy" | "medium" | "hard",
    "reason": string
  }
}

If you cannot compute a field, still include it but keep it short and honest.
  `.trim();

  const userPrompt = `
SYSTEM DESIGN QUESTION:
${question}

CANDIDATE ANSWER:
${answer}

AUTO-EVALUATION:
- Topic: ${topic}
- Difficulty: ${difficulty}
- Score: ${score} / 10
- Strengths: ${strengths.join('; ') || 'None recorded'}
- Weaknesses: ${weaknesses.join('; ') || 'None recorded'}
  `.trim();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini', // or gpt-4o / gpt-4o-mini depending on what you use elsewhere
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0].message.content ?? '{}';

  let parsed: SystemDesignCoachFeedback;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse coach JSON:', err, 'raw:', raw);
    parsed = {
      summary: 'The coach model failed to return valid JSON. Please try again.',
      whatYouDidWell: [],
      whatToImproveNextTime: [],
      nextPracticeSuggestion: undefined,
    };
  }

  return parsed;
}