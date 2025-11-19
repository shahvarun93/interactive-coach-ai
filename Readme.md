brew install redis
brew services start redis
redis-cli ping   # should say PONG
redis-cli --tls -u redis://default:AVU4AAIncDIyZWU3MjkxZTRmZmM0ODJjYmQzZWUxY2RiMjYxZmU3MHAyMjE4MTY@exciting-lionfish-21816.upstash.io:6379

###### PROMPTS
8. Using ChatGPT efficiently – do you need specific prompts?

You don’t need magic secret prompts, but a few reusable patterns will give you a big upgrade.

Here are some copy-paste templates you can adapt.

⸻

8.1. “Teach me like a senior dev mentor”

Use this when learning a concept (RAG, sharding, etc.):

Role: You are a senior backend engineer mentoring me (I know Node/TS/Java well).
Task: Explain [TOPIC] so I can use it in real systems.
Context: I’m building a System Design Co-Pilot and want to use this concept correctly.
Constraints:
	•	Use practical examples (Node/TS, Postgres, Redis).
	•	Tie it to FAANG-style system design expectations.
	•	End with 3 short practice questions for me.

⸻

8.2. “Interview me” (System Design)

Act as a FAANG senior engineer interviewing me for a backend role.
Give me a system design problem like [“Design Twitter feed”].
We’ll do it step by step:
	1.	First share the prompt and wait for my response.
	2.	Then ask probing questions like you would in a real interview.
	3.	After I’m done, give me structured feedback:
	•	Score (0–10)
	•	Strengths
	•	Gaps
	•	How a strong FAANG candidate would improve this.

⸻

8.3. “Code buddy with constraints”

When coding a feature:

I’m implementing [feature] in [stack: Node/TS + NestJS + Postgres].
Please:
	•	Suggest a clean architecture and folder structure.
	•	Give me initial code for the most critical parts.
	•	Assume I’ll fill in the boilerplate.
	•	Keep answers focused and not too long.
	•	Point out tradeoffs if you suggest something non-trivial.

8.4. “Critique my design/code”

Here is my design/code for [feature/system]:
Please review it like a principal engineer:
	•	Call out any scalability / reliability issues.
	•	Suggest more robust patterns (caching, queues, DB schema).
	•	Highlight 2–3 things I did well.
	•	Keep feedback specific and actionable.

⸻

8.5. “Summarize my progress & suggest next steps”

Once or twice a week:

Here’s what I did this week to become AI-ready and build my System Design Co-Pilot:
[bullet list]

Please:
	•	Summarize my progress in 3–5 bullets.
	•	Point out any gaps or risks.
	•	Suggest a focused plan for the next 3 days.

This turns me into your “project manager + mentor” automatically.

⸻
🧠 System Design Co-Pilot (working name)

Core idea:
	•	Target user: mid–senior SWE preparing for FAANG / high-scale backend roles
	•	Your app becomes their personal SD practice platform:
	1.	Generates FAANG-style system design questions
	2.	Guides them step-by-step (like a human interviewer)
	3.	Evaluates their answers with structured feedback
	4.	Tracks progress over time (weak areas, improvements)
	5.	Optionally uses a curated knowledge base (RAG) to give hints

•	GenAI: yes, from day 1 (prompts, evaluations, feedback).
•	AI Agents: yes, once we wire tools (DB, Redis, maybe search/docs).
•	Agentic AI: yes, when we build the guided multi-step interview flow.

	•	POST /system-design/generate-prompt → creates session with AI question
	•	POST /system-design/submit-answer → evaluates answer via OpenAI, stores score/feedback
	•	GET /system-design/session/:id → retrieve one session
	•	GET /system-design/user/:userId/sessions → list all sessions for a user
	•	GET /system-design/user/:userId/stats → global stats, hooks ready for topic-based stats
