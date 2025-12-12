class SystemDesign extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  // Use the connectedCallback lifecycle hook to fetch the template

  async connectedCallback() {
    try {
      const response = await fetch(
        "./components/system-design/system-design.component.html"
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      this.shadowRoot.innerHTML = htmlText;
    } catch (error) {
      console.error("Failed to load external HTML template:", error);
      this.shadowRoot.innerHTML = `<p>Error loading component template.</p>`;
    }
    // ==============================
    // Configuration
    // ==============================
    this.BASE_URL = "http://34.149.127.45";

    this.apiUrl = (path) => this.BASE_URL + path;

    // ==============================
    // DOM Elements
    // ==============================
    const $ = (id) => this.shadowRoot.getElementById(id);
    const qs = (sel) => this.shadowRoot.querySelector(sel);

    this.emailInput = $("emailInput");
    this.loadStatsBtn = $("loadStatsBtn");
    this.globalStatus = $("globalStatus");
    this.globalStatusText = this.globalStatus?.querySelector(
      ".global-status-text"
    );

    this.generateQuestionBtn = $("generateQuestionBtn");
    this.clearQuestionBtn = $("clearQuestionBtn");
    this.questionStatus = $("questionStatus");
    this.questionTextEl = $("questionText");
    this.topicTextEl = $("topicText");
    this.difficultyTextEl = $("difficultyText");
    this.sessionIdTextEl = $("sessionIdText");

    this.answerInput = $("answerInput");
    this.submitAnswerBtn = $("submitAnswerBtn");
    this.answerStatus = $("answerStatus");
    this.lastScoreEl = $("lastScore");

    this.getCoachFeedbackBtn = $("getCoachFeedbackBtn");
    this.coachStatus = $("coachStatus");
    this.coachScoreText = $("coachScoreText");
    this.coachTopicText = $("coachTopicText");
    this.coachDifficultyText = $("coachDifficultyText");
    this.coachSummaryText = $("coachSummaryText");
    this.coachStrengthsList = $("coachStrengthsList");
    this.coachWeaknessesList = $("coachWeaknessesList");
    this.coachNextPractice = $("coachNextPractice");
    this.coachResources = $("coachResources");

    this.studyProfileSummary = $("studyProfileSummary");
    this.studyFocusTopics = $("studyFocusTopics");
    this.studyStepsList = $("studyStepsList");
    this.studyStatus = $("studyStatus");
    this.historyViewPretty = $("historyViewPretty");
    this.historyViewRaw = $("historyViewRaw");
    this.toggleHistoryRawBtn = $("toggleHistoryRawBtn");

    this.clearAnswerBtn = $("clearAnswerBtn");
    this.feedbackBox = $("feedbackBox");

    // ==============================
    // State
    // ==============================
    this.currentSessionId = null;
    this.lastCoachResponse = null;
    this.lastHistoryResponse = null;

    // ==============================
    // Bind Methods
    // ==============================
    this.generatePrompt = this.generatePrompt.bind(this);
    this.submitAnswer = this.submitAnswer.bind(this);
    this.fetchCoachFeedback = this.fetchCoachFeedback.bind(this);
    this.loadStatsAndStudyPlan = this.loadStatsAndStudyPlan.bind(this);

    this.globalOverlay = this.shadowRoot.getElementById("globalOverlay");

    // ==============================
    // Events
    // ==============================
    this.generateQuestionBtn?.addEventListener("click", this.generatePrompt);
    this.clearQuestionBtn?.addEventListener("click", () =>
      this.resetQuestion()
    );
    this.submitAnswerBtn?.addEventListener("click", this.submitAnswer);
    this.getCoachFeedbackBtn?.addEventListener(
      "click",
      this.fetchCoachFeedback
    );
    this.loadStatsBtn?.addEventListener("click", this.loadStatsAndStudyPlan);
    this.toggleHistoryRawBtn?.addEventListener("click", () =>
      this.toggleHistory()
    );
    this.answerInput?.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.submitAnswer();
      }
    });

    this.setGlobalStatus("idle", "Ready");
    this.setCardStatus(this.questionStatus, "idle", "Idle");
    this.setCardStatus(this.answerStatus, "idle", "Waiting for your answer");
    this.setCardStatus(this.coachStatus, "idle", "Idle");
    this.setCardStatus(this.studyStatus, "idle", "Idle");
  }

  // ==============================
  // Helpers
  // ==============================
  safeEmail() {
    const val = (this.emailInput?.value || "").trim();
    if (!val) {
      alert("Please enter your email first.");
      this.emailInput?.focus();
      return null;
    }
    return val;
  }

  setGlobalStatus(mode, message) {
    this.globalStatus?.classList.remove("loading", "error", "success");
    if (mode === "loading") {
      this.globalStatus.classList.add("loading");
      this.globalOverlay?.classList.add("active");
    } else if (mode === "error") {
      this.globalStatus.classList.add("error");
      this.globalOverlay?.classList.remove("active");
    } else {
      this.globalStatus.classList.add("success");
      this.globalOverlay?.classList.remove("active");
    }
    if (this.globalStatusText) this.globalStatusText.textContent = message;
  }

  setCardStatus(el, mode, message) {
    if (!el) return;
    el.classList.remove("loading", "error");
    if (mode === "loading") el.classList.add("loading");
    if (mode === "error") el.classList.add("error");
    const t = el.querySelector(".card-status-text");
    if (t) t.textContent = message;
  }

  setQuestionText(text) {
    if (!this.questionTextEl) return;
    this.questionTextEl.textContent = text;
    this.questionTextEl.classList.toggle(
      "question-empty",
      !text || !text.trim()
    );
  }

  setStudySummaryText(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("question-empty", !text || !text.trim());
  }

  // ==============================
  // API Logic
  // ==============================
  async generatePrompt() {
    const email = this.safeEmail();
    if (!email) return;

    this.setGlobalStatus("loading", "Generating question...");
    this.setCardStatus(
      this.questionStatus,
      "loading",
      "Requesting new prompt..."
    );
    this.generateQuestionBtn.disabled = true;

    try {
      const res = await fetch(
        this.apiUrl("/api/v1/system-design/generate-prompt"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      this.currentSessionId = data.sessionId || null;
      this.topicTextEl.textContent = data.topic || "—";
      this.difficultyTextEl.textContent = data.difficulty || "—";
      this.sessionIdTextEl.textContent = this.currentSessionId || "—";
      this.setQuestionText(data.question || "(No question text returned)");

      this.setCardStatus(this.questionStatus, "idle", "Prompt loaded");
      this.setGlobalStatus("idle", "Question ready.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.questionStatus, "error", "Failed to load prompt");
      this.setGlobalStatus("error", "Error generating question");
      alert("Error generating question:\n" + err.message);
    } finally {
      this.generateQuestionBtn.disabled = false;
    }
  }

  async submitAnswer() {
    if (!this.currentSessionId) {
      alert("Generate a question first.");
      return;
    }
    const answer = (this.answerInput?.value || "").trim();
    if (!answer) {
      alert("Write your answer first.");
      return;
    }

    this.setGlobalStatus("loading", "Submitting answer...");
    this.setCardStatus(this.answerStatus, "loading", "Sending answer...");
    this.submitAnswerBtn.disabled = true;

    try {
      const res = await fetch(
        this.apiUrl("/api/v1/system-design/submit-answer"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: this.currentSessionId, answer }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const score = typeof data.score === "number" ? data.score : null;
      if (data.sessionId) this.currentSessionId = data.sessionId;
      if (score !== null) {
        this.lastScoreEl.textContent = `Score: ${score}`;
        this.lastScoreEl.style.display = "inline-flex";
      } else this.lastScoreEl.style.display = "none";

      this.setCardStatus(this.answerStatus, "idle", "Answer submitted");
      this.setGlobalStatus("idle", "Answer submitted. Ready for feedback.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.answerStatus, "error", "Failed to submit answer");
      this.setGlobalStatus("error", "Error submitting answer");
      alert("Error submitting answer:\n" + err.message);
    } finally {
      this.submitAnswerBtn.disabled = false;
    }
  }

  async fetchCoachFeedback() {
    const email = this.safeEmail();
    if (!email || !this.currentSessionId) {
      alert("You need an active session.");
      return;
    }

    this.setGlobalStatus("loading", "Fetching coach feedback...");
    this.setCardStatus(this.coachStatus, "loading", "Requesting feedback...");
    this.getCoachFeedbackBtn.disabled = true;

    try {
      const res = await fetch(this.apiUrl("/api/v1/system-design/coach"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sessionId: this.currentSessionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.lastCoachResponse = data;

      const f = data.coachFeedback || {};
      this.coachScoreText.textContent = data.score ?? "—";
      this.coachTopicText.textContent = data.topic || "—";
      this.coachDifficultyText.textContent = data.difficulty || "—";
      this.setStudySummaryText(
        this.coachSummaryText,
        f.summary || "No summary provided."
      );

      this.renderListFromArray(
        this.coachStrengthsList,
        f.whatYouDidWell,
        "No strengths returned yet."
      );
      this.renderListFromArray(
        this.coachWeaknessesList,
        f.whatToImproveNextTime,
        "No improvement suggestions yet."
      );

      if (f.nextPracticeSuggestion) {
        const np = f.nextPracticeSuggestion;
        let text =
          typeof np === "string"
            ? np
            : (np.title || "") + "\n" + (np.description || "");
        this.setStudySummaryText(
          this.coachNextPractice,
          text.trim() || "Next practice suggestion available but empty."
        );
      } else
        this.setStudySummaryText(
          this.coachNextPractice,
          "No next practice suggestion."
        );

      this.renderResourceTags(
        this.coachResources,
        f.recommendedResources || data.resources
      );

      this.setCardStatus(this.coachStatus, "idle", "Feedback loaded");
      this.setGlobalStatus("idle", "Coach feedback ready.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.coachStatus, "error", "Failed to fetch feedback");
      this.setGlobalStatus("error", "Error fetching coach feedback");
      alert("Error fetching coach feedback:\n" + err.message);
    } finally {
      this.getCoachFeedbackBtn.disabled = false;
    }
  }

  async loadStatsAndStudyPlan() {
    const email = this.safeEmail();
    if (!email) return;

    this.setGlobalStatus("loading", "Loading history & study plan...");
    this.setCardStatus(this.studyStatus, "loading", "Loading...");
    this.loadStatsBtn.disabled = true;

    try {
      const [historyRes, planRes] = await Promise.all([
        fetch(
          this.apiUrl(
            `/api/v1/users/${encodeURIComponent(email)}/system-design-history`
          )
        ),
        fetch(
          this.apiUrl(
            `/api/v1/users/${encodeURIComponent(
              email
            )}/system-design-study-plan`
          )
        ),
      ]);
      if (!historyRes.ok || !planRes.ok)
        throw new Error("Failed to fetch data");
      const historyData = await historyRes.json();
      const planData = await planRes.json();

      this.lastHistoryResponse = historyData;
      this.renderHistoryPretty(historyData);
      this.historyViewRaw.textContent = JSON.stringify(historyData, null, 2);

      const profileSummary = planData.profileSummary || planData.summary || "";
      const focusTopics = planData.focusTopics || planData.topics;
      const steps = planData.recommendedSteps || planData.steps;
      this.setStudySummaryText(
        this.studyProfileSummary,
        profileSummary || "No profile summary returned."
      );
      this.renderTagRow(this.studyFocusTopics, focusTopics);
      this.renderStepsList(this.studyStepsList, steps);

      this.setCardStatus(this.studyStatus, "idle", "Plan & history loaded");
      this.setGlobalStatus("idle", "Stats updated.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.studyStatus, "error", "Failed to load stats");
      this.setGlobalStatus("error", "Error loading stats");
    } finally {
      this.loadStatsBtn.disabled = false;
    }
  }

  // ==============================
  // Render helpers
  // ==============================
  renderListFromArray(listEl, arr, emptyText) {
    listEl.innerHTML = "";
    if (!Array.isArray(arr) || arr.length === 0) {
      const li = document.createElement("li");
      li.textContent = emptyText;
      li.className = "muted";
      listEl.appendChild(li);
      return;
    }
    arr.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = typeof item === "string" ? item : JSON.stringify(item);
      listEl.appendChild(li);
    });
  }

  renderResourceTags(container, resources) {
    container.innerHTML = "";
    if (!Array.isArray(resources) || resources.length === 0) {
      const span = document.createElement("span");
      span.textContent = "No resources returned.";
      span.className = "muted";
      container.appendChild(span);
      return;
    }
    resources.forEach((r) => {
      const a = document.createElement("a");
      a.className = "tag";
      a.textContent = r.title || r.name || r.label || r.url || "Resource";
      if (r.url) {
        a.href = r.url;
        a.target = "_blank";
      }
      container.appendChild(a);
    });
  }

  renderTagRow(container, topics) {
    container.innerHTML = "";
    if (!Array.isArray(topics) || topics.length === 0) {
      const span = document.createElement("span");
      span.textContent = "No focus topics returned.";
      span.className = "muted";
      container.appendChild(span);
      return;
    }
    topics.forEach((topic) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = topic;
      container.appendChild(tag);
    });
  }

  renderStepsList(listEl, steps) {
    listEl.innerHTML = "";
    if (!Array.isArray(steps) || steps.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No recommended steps returned.";
      li.className = "muted";
      listEl.appendChild(li);
      return;
    }
    steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      listEl.appendChild(li);
    });
  }

  renderHistoryPretty(history) {
    this.historyViewPretty.innerHTML = "";
    const items = Array.isArray(history) ? history : history.sessions || [];
    if (!items || items.length === 0) {
      const div = document.createElement("div");
      div.textContent = "No practice history yet.";
      div.className = "muted";
      this.historyViewPretty.appendChild(div);
      return;
    }
    items.forEach((s) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <div class="history-topic">${s.topic || "Session"}</div>
        <div class="history-meta">
          <span class="pill-score">Score: ${s.score ?? "—"}</span>
          <span class="pill-difficulty">${s.difficulty || "—"}</span>
          <span>${new Date(
            s.createdAt || s.date || Date.now()
          ).toLocaleString()}</span>
        </div>`;
      this.historyViewPretty.appendChild(item);
    });
  }

  // ==============================
  // Misc
  // ==============================
  resetQuestion() {
    this.currentSessionId = null;
    this.topicTextEl.textContent = "—";
    this.difficultyTextEl.textContent = "—";
    this.sessionIdTextEl.textContent = "—";
    this.setQuestionText("Click “Generate Question” to get started.");
    this.setCardStatus(this.questionStatus, "idle", "Idle");
    this.lastScoreEl.style.display = "none";
  }

  toggleHistory() {
    const showRaw = this.historyViewRaw.style.display === "block";
    this.historyViewRaw.style.display = showRaw ? "none" : "block";
    this.historyViewPretty.style.display = showRaw ? "block" : "none";
    this.toggleHistoryRawBtn.textContent = showRaw ? "Raw JSON" : "Pretty View";
  }
}

customElements.define("sd-coach", SystemDesign);
