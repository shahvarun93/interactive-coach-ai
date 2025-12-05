# System Design Co‑Pilot

An AI‑powered **system design interview coach**, **study planner**, and **resume assistant** built with Node.js, TypeScript, Postgres, and the OpenAI API.

The goal of this project is to simulate a realistic FAANG‑style system design prep experience:

- generate tailored system design questions,
- evaluate your answers with structured feedback,
- track your strengths and weaknesses over time,
- recommend resources and a personalized study plan.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [API Overview](#api-overview)
- [Front‑End UI](#front-end-ui)
- [Environment & Setup](#environment--setup)
- [Development Scripts](#development-scripts)
- [How the AI Pieces Work](#how-the-ai-pieces-work)
- [Roadmap](#roadmap)

---

## Overview

System Design Co‑Pilot is a full‑stack application that helps you prepare for system design interviews by acting as:

- a **question generator** that adapts to your weak and strong areas,
- an **AI evaluator** that scores and critiques your design answers,
- a **coach** that spots recurring patterns in your mistakes and suggests how to fix your mental model, and
- a **study planner** that converts your stats into an actionable plan with recommended resources.
- a **resume assistant** that analyzes and tailors your resume for system design–heavy backend roles.

The stack is intentionally close to what you’d expect in a modern backend/AI service:

- **Backend:** Node.js, TypeScript, Express‑style routing
- **Database:** Postgres (Supabase‑hosted)
- **Cache:** Redis / Upstash (used to cache AI outputs like coach feedback and study plans)
- **AI:** OpenAI API with strict JSON responses validated via Zod
- **Frontend:** Simple HTML/JS client (`public/index.html`) for manual exploration

---

## Key Features

### 1. System Design Question Generator

- Generates **topic‑ and difficulty‑aware** system design questions.
- Topics include things like caching, feeds, messaging queues, rate limiting, search, payments, observability, etc.
- Difficulty is tracked (`easy | medium | hard`) and can evolve based on performance.

### 2. AI Answer Evaluation

- You write a free‑form answer to a system design prompt.
- The backend calls the OpenAI API to produce structured feedback:
  - `score` (0–10)
  - `strengths` (what went well)
  - `weaknesses` (gaps in the answer)

This is stored as a `system_design_session` for later stats and analysis.

### 3. Coaching with Patterns & Mental Model Fixes

For a given session, the **coach** endpoint returns:

- A short **summary** of how you did.
- **What you did well** in this specific answer.
- **What to improve next time**.
- **Consistent patterns** across sessions for this topic (e.g., “you often forget failure modes”).
- **Mental model fixes**: concrete bullet points on how you should change your thinking for this topic.
- **Next practice suggestion** (topic + difficulty + reason).
- **Recommended resources** pulled from the internal knowledge base.

This is essentially an “AI senior engineer” giving recurring feedback shaped by your history, not just the latest answer.

### 4. User System Design Stats

The stats endpoint summarizes a user’s practice over time, including:

- total sessions
- answered sessions
- average score
- last practice time
- overall level (`strong | needs_improvement | limited_data`)
- per‑topic stats:
  - number of sessions
  - average score
  - topic label (`strong | weak`)

This is used by both the coach and the study planner.

### 5. Study Plan Generator

The **study plan** endpoint uses:

- user stats (overall + per‑topic),
- lists of weak/strong topics,
- and topic‑specific resources

to generate a JSON study plan:

- `profileSummary`
- `focusTopics`
- `recommendedSequence` (steps with topic + difficulty + goals)
- `practiceSuggestions` (concrete actions)

The UI renders this nicely and turns referenced resources into clickable links.

### 6. System Design Resources (RAG with pgvector)

The project defines a small set of **system design resources** in `sd_resources`:

- Caching Strategy Cheat Sheet  
- Designing a Global Feed  
- Messaging Queue Trade‑offs  
- Rate Limiting Cookbook  
- Search Ranking Primer  
- Payments Consistency Notes  
- Observability for SD Interviews  

Each resource has:

- `title`
- `topic`
- `url` (served from `public/*.html`)
- `content` / snippet

These are used as a **knowledge base**:

- The coach can reference them when giving feedback.
- The study plan can point to them as next‑step material.
- The UI shows them as links (no raw `.html` filenames).

The backend also supports **semantic retrieval** using embeddings + pgvector:

- A seed script writes these resources into `sd_resources` and can attach embeddings to each row (when OpenAI quota allows).
- At runtime, the coach and study plan build a small query (topic + question/weaknesses or topic + stats) and:
  - embed it via OpenAI,
  - run a pgvector similarity search to pick the most relevant resources for that topic,
  - fall back to simple topic filtering if embeddings are missing.

### 7. Resume Assistant (Analysis & Tailoring)

The resume assistant lives alongside the system design coach and focuses on making your profile read like a strong backend / system design engineer:

- **Resume analysis**: parses your resume into structured sections (header, summary, skills, experience, education, projects).
- **Issue detection**: highlights missing signals for senior / FAANG‑style roles (lack of impact, weak system design keywords, no leadership, etc.).
- **Improved bullets**: suggests stronger, impact‑driven bullets for key experience lines.
- **Job‑specific tailoring**: given a job description + target role, generates an ATS‑friendly, tailored version of your summary and experience while preserving truthfulness.
- **Uses the same OpenAI JSON + Zod pipeline** as the system design agents, so responses are strongly typed and safe to render.

---

## Architecture

At a high level the system looks like this:

- **Client (Browser)**
  - `public/index.html` with vanilla JS
  - Calls REST endpoints to:
    - create/find user by email
    - get next question
    - submit answer
    - fetch coach feedback
    - fetch user stats
    - generate a study plan

- **API Server (Node.js + TypeScript)**
  - Express‑style routes under `/api/v1`
  - Route modules:
    - `routes/users.ts`
    - `routes/system-design.ts`
  - Service layer:
    - `users.service.ts`
    - `system-design.service.ts`
    - `system-design-ai.service.ts`
    - `sd-resources.service.ts`
  - DAO layer:
    - `users.dao.ts`
    - `system-design.dao.ts`
    - `sd-resources.dao.ts`
  - Infra:
    - `db.ts` (Postgres connection + query helper)
    - `redis` (Upstash-backed cache for AI responses and plans)

- **Database (Postgres)**
  - `users_tbl`
  - `system_design_sessions`
  - `sd_resources`
  - (Optionally) future table(s) for embeddings

- **AI Integration**
  - `openAiClient` / `responsesClient` wrapper
  - Strongly typed JSON outputs checked via Zod schemas
  - Different prompts & schemas for:
    - question generation
    - answer evaluation
    - coaching
    - study plan

---

## Data Model

### `users_tbl`

Minimal user record keyed by email:

- `id` (UUID, primary key)
- `email` (unique)
- timestamps

### `system_design_sessions`

One row per question/answer session:

- `id` (UUID)
- `user_id` (FK → `users_tbl.id`)
- `topic` (text, e.g. `caching`, `queues`)
- `difficulty` (`easy | medium | hard`)
- `question` (text)
- `answer` (text, nullable until user submits)
- `score` (numeric, nullable)
- `strengths` (JSON/text array)
- `weaknesses` (JSON/text array)
- `created_at`, `updated_at`

### `sd_resources`

System design knowledge base:

- `id` (UUID)
- `title` (text)
- `topic` (text)
- `url` (text, served from `public/*.html`)
- `content` or `content_snippet` (text)
- (future) `embedding` (vector) for pgvector

These tables are managed via SQL in Postgres (e.g., Supabase) and accessed via the DAO layer.

---

## API Overview

Base path: `/api/v1`

### Users

- `POST /api/v1/users`
  - Create or find user by email.
  - Request body: `{ "email": "user@example.com" }`
  - Response: user record (id, email, timestamps).

- `GET /api/v1/users/:email/system-design-stats`
  - Returns aggregated system design stats for this user.

- `GET /api/v1/users/:email/system-design-study-plan`
  - Returns AI‑generated study plan JSON for this user.

### System Design

- `POST /api/v1/system-design/session`
  - Creates a new session (question) for a user.
  - Can support simple modes like:
    - user asks for a topic + difficulty, or
    - “auto” topic based on weak areas.

- `GET /api/v1/system-design/session/:id`
  - Fetch full session details (question, answer, score, etc.).

- `POST /api/v1/system-design/submit-answer`
  - Submits an answer for a session and runs AI evaluation.
  - Returns updated session with `score`, `strengths`, and `weaknesses`.

- `POST /api/v1/system-design/coach`
  - Takes `email` + `sessionId`.
  - Calls AI to generate:
    - summary
    - what you did well
    - what to improve next time
    - consistent patterns
    - mental model fixes
    - next practice suggestion
    - recommended resources

---

## Front‑End UI


The UI is a single HTML page (`public/index.html`) with minimal styling and vanilla JS.

It supports:

- entering your email (used as the identity key),
- generating the next system design question,
- typing your answer,
- submitting to get:
  - AI score
  - strengths/weaknesses
  - coach feedback
- viewing your system design stats,
- generating a study plan,
- clicking into recommended resources (served from `public/*.html`).

The UI is intentionally simple: it’s designed to showcase the backend + AI flows, not be a polished production UI.

### Resume Assistant UI (`public/resume.html`)

There is a separate single‑page UI for the resume assistant:

- **Analyze Resume**  
  - Paste plain‑text resume content or upload a PDF/DOCX.  
  - Optionally provide a target role and target company.  
  - Calls the backend to run `resume-ai.service` and returns:
    - parsed structure (name, headline, skills, experience, education),
    - issues & gaps,
    - section‑level issues,
    - improved sample bullets.

- **Tailor to Job**  
  - Uses your pasted/uploaded resume plus a job description to:
    - rewrite the summary toward the target role,
    - reshape skills to better match the stack,
    - rewrite experience bullets to emphasize relevant impact,
    - return a full, ATS‑ready resume text block you can copy out.

- **Upload support**  
  - `/api/v1/resume/extract-text` accepts file uploads (PDF/DOCX) using `multer`.  
  - The server uses `pdf-parse` and `mammoth` to extract text safely on the backend before sending it to the OpenAI API.
## MCP Integration (Cursor / Claude / ChatGPT Desktop)

This project also exposes its core capabilities as **Model Context Protocol (MCP) servers** so that tools like Cursor, Claude Desktop, and (eventually) ChatGPT Desktop can call into your backend with natural language.

### System Design MCP (`src/mcp/system-design-mcp.ts`)

The **system design MCP server** (commonly configured with an ID like `sd-copilot-mcp`) exposes tools that let an LLM act as a thin client over your existing APIs and services:

- `sd_recommend_resources` – given a user email, returns weak topics plus recommended system design resources grouped by topic.
- `sd_next_question` – given a user email, returns the next practice question, topic, difficulty, and session ID using the same logic as `/system-design` in the API.
- `sd_study_plan` – given a user email, returns the AI‑generated study plan JSON (profile summary, focus topics, recommended sequence, practice suggestions).

Typical usage from an MCP‑aware client (e.g., Cursor):

- Configure the MCP server to run `npm run mcp:sd`.
- In a chat, say something like:  
  _“Use the system design MCP to generate my next question for `test@example.com` and then summarize how I should approach it.”_  
  The client will:
  - detect that `sd_next_question` is the right tool,
  - call it with `{ "email": "test@example.com" }`,
  - feed the JSON result back into the LLM for explanation.

### Resume MCP (`src/mcp/resume-analyze-mcp.ts`)

The **resume MCP server** exposes tools to analyze and tailor resumes without going through the browser UI:

- One tool for **resume analysis** (takes `resumeText`, optional `targetRole`, optional `targetCompany`, optional `jobDescription`) and returns the same `ResumeAnalysis` JSON used by the web UI.
- One tool for **resume tailoring** (takes `resumeText` + `jobDescription` + optional targeting fields) and returns:
  - `rewrittenSummary`
  - `rewrittenSkills`
  - `rewrittenExperience`
  - `notesForUser`
  - `fullResumeText` (ATS‑friendly draft)

Example natural‑language usage in an MCP client:

- _“Analyze this resume text for a Senior Backend role at a FinTech in Austin using the resume MCP.”_
- _“Tailor my existing resume to this job description using the resume tailoring MCP tool.”_

The client interprets these instructions, chooses the right MCP tool, and passes structured arguments (e.g., JSON with `resumeText` and `jobDescription`), then uses the JSON response to drive further reasoning or UI.

---

## Environment & Setup

### Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm
- A Postgres instance (e.g., Supabase)
- (Optional) Redis / Upstash
- An OpenAI API key

### Environment Variables

Create a `.env` file in the project root, with values like:

```bash
# Postgres connection string
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Redis (Upstash, used for caching AI outputs)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Optional debug flags
CACHE_DEBUG=0
AI_LOG_DEBUG=0

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
```

### Install Dependencies

```bash
npm install
# or
pnpm install
```

Make sure your Postgres database has the tables described in the **Data Model** section (these can be created via SQL migrations / Supabase SQL editor).

---

## Development Scripts

Common scripts (names may vary based on your `package.json`):

```bash
# Start the dev server (ts-node)
npm run dev

# Seed system design resources (sd_resources)
npm run seed:sd
```

The seed script populates `sd_resources` with initial entries and (optionally) embeddings or content snippets.

---

## How the AI Pieces Work

### 1. OpenAI client & JSON responses

The project wraps the OpenAI API in a small client that:

- enforces **model selection** (`gpt-4.1-mini`, etc.),
- expects **structured JSON outputs**,
- validates outputs with **Zod schemas** (e.g., `CoachFeedbackSchema`, `StudyPlanSchema`),
- surfaces typed results back to the service layer.

This ensures that the rest of the app deals with proper TypeScript types instead of arbitrary strings.

### 2. Agents (by responsibility)

While not using a formal agent framework, the project defines clear “agent‑like” responsibilities:

- **Question Agent**  
  Picks topic + difficulty and generates a system design prompt.

- **Evaluator Agent**  
  Takes question + answer and produces score + strengths + weaknesses.

- **Coach Agent**  
  Uses:
  - current session,
  - user stats,
  - topic mistake patterns,
  - and resources
  to produce:
  - summary,
  - improvement advice,
  - consistent patterns,
  - mental model fixes,
  - next practice suggestion,
  - recommended resources.

- **Study Plan Agent**  
  Uses aggregated stats + resources to create a multi‑step study plan (focus topics, sequence, practice suggestions).

These are implemented as service functions that call the OpenAI client with specific prompts and schemas.

### 3. RAG (semantic retrieval with pgvector)

**Current behavior:**

- `sd_resources` stores labeled notes per topic, along with an optional `embedding` column (pgvector).
- A seed script populates `sd_resources` and, when OpenAI quota is available, generates embeddings for each resource.
- For the **coach**:
  - query text includes topic, question, and user weaknesses / mistake patterns.
- For the **study plan**:
  - query text includes topic, overall level, and average score.

At runtime:

1. Build a query string from topic + context (question, weaknesses, stats).
2. Create an embedding using OpenAI.
3. Run a pgvector similarity search:

   ```sql
   SELECT id, title, topic, url, content, created_at
   FROM sd_resources
   WHERE topic = $1
     AND embedding IS NOT NULL
   ORDER BY embedding <-> $2::vector
   LIMIT $3;
   ```

4. Use the top results to:
   - provide grounded references for the coach feedback, and
   - inform the weak‑topic resources in the study plan.

If embeddings are missing or an error occurs, the system gracefully falls back to simple topic‑based resource selection.

**Future enhancements:**

- Add more resources (and richer content) per topic.
- Support multi‑topic retrieval in a single call.
- Add UI to browse the underlying knowledge base directly.

---

## Roadmap

A few planned / potential enhancements:

- **Extend RAG with pgvector**
  - ✅ Initial embeddings + semantic search for coach and study plan.
  - ⏩ Expand coverage (more resources, multi‑topic queries, richer snippets).

- **History UI & Session History API**
  - Paginated list of sessions per user.
  - Detail view: question, answer, score, coach feedback.
  - Trend charts over time (scores per topic).

- **Redis Caching**
  - ✅ Cache study plans per user keyed by latest practice time.
  - ✅ Cache coach feedback per session/score so repeated requests are free.
  - ⏩ Refine TTLs and invalidation strategies as the app scales.

- **Auth & Multi‑user Deployment**
  - Simple auth (e.g., magic link or OAuth) instead of free‑text email.
  - Hosted deployment (Render/Fly/Railway/etc.) behind a custom domain.

- **Agent Framework & MCP Integration**
  - The current design already has clear “agents by responsibility” (question, evaluator, coach, study planner, resume assistant).
  - ✅ Initial MCP servers for:
    - system design (study plan, next question, resource recommendations),
    - resume analysis & tailoring.
  - ⏩ Future: deeper LangGraph integration and richer MCP tool coverage (e.g., full session history, interactive chat‑style coaching).

---

This project is meant to be both a **learning playground** for AI‑powered system design coaching and a **demonstration** of how to build an end‑to‑end, production‑flavored AI feature with a real backend, database, and UI.

#Kubernetes Instruction:
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
|