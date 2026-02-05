class CodingTutor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    const htmlUrl = "./components/coding/coding.component.html";
    try {
      const response = await fetch(htmlUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      this.shadowRoot.innerHTML = htmlText;
      this.attachStyles();
    } catch (error) {
      console.error("Failed to load coding template:", error);
      this.shadowRoot.innerHTML = `<p>Error loading component template.</p>`;
      return;
    }

    this.apiUrl = (path) => path;

    const $ = (id) => this.shadowRoot.getElementById(id);

    this.emailInput = $("emailInput");
    this.loadHistoryBtn = $("loadHistoryBtn");
    this.globalStatus = $("globalStatus");
    this.globalStatusText = this.globalStatus?.querySelector(".card-status-text");

    this.generateQuestionBtn = $("generateQuestionBtn");
    this.clearQuestionBtn = $("clearQuestionBtn");
    this.questionStatus = $("questionStatus");
    this.questionTextEl = $("questionText");
    this.topicTextEl = $("topicText");
    this.difficultyTextEl = $("difficultyText");
    this.sessionIdTextEl = $("sessionIdText");

    this.languageSelect = $("languageSelect");
    this.codeInput = $("codeInput");
    this.submitCodeBtn = $("submitCodeBtn");
    this.clearCodeBtn = $("clearCodeBtn");
    this.answerStatus = $("answerStatus");
    this.lastScoreEl = $("lastScore");

    this.evaluationStatus = $("evaluationStatus");
    this.evalSummary = $("evalSummary");
    this.evalCorrectness = $("evalCorrectness");
    this.evalTime = $("evalTime");
    this.evalSpace = $("evalSpace");
    this.evalStrengths = $("evalStrengths");
    this.evalWeaknesses = $("evalWeaknesses");
    this.evalIssues = $("evalIssues");
    this.evalSuggestions = $("evalSuggestions");

    this.historyStatus = $("historyStatus");
    this.historyViewPretty = $("historyViewPretty");
    this.historyViewRaw = $("historyViewRaw");
    this.toggleHistoryRawBtn = $("toggleHistoryRawBtn");

    this.globalOverlay = this.shadowRoot.getElementById("globalOverlay");

    this.currentSessionId = null;

    this.generateQuestionBtn?.addEventListener("click", () => this.generatePrompt());
    this.clearQuestionBtn?.addEventListener("click", () => this.resetQuestion());
    this.submitCodeBtn?.addEventListener("click", () => this.submitSolution());
    this.clearCodeBtn?.addEventListener("click", () => this.clearCode());
    this.loadHistoryBtn?.addEventListener("click", () => this.loadHistory());
    this.toggleHistoryRawBtn?.addEventListener("click", () => this.toggleHistory());

    this.codeInput?.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.submitSolution();
      }
    });

    this.setGlobalStatus("idle", "Ready");
    this.setCardStatus(this.questionStatus, "idle", "Idle");
    this.setCardStatus(this.answerStatus, "idle", "Waiting for your solution");
    this.setCardStatus(this.evaluationStatus, "idle", "Idle");
    this.setCardStatus(this.historyStatus, "idle", "Idle");
  }

  attachStyles() {
    if (this.shadowRoot.querySelector('link[data-coding-style="base"]')) return;

    const base = document.createElement("link");
    base.rel = "stylesheet";
    base.href = "/css/styles.css";
    base.setAttribute("data-coding-style", "base");

    const comp = document.createElement("link");
    comp.rel = "stylesheet";
    comp.href = "/components/coding/coding.component.css";
    comp.setAttribute("data-coding-style", "component");

    this.shadowRoot.prepend(comp);
    this.shadowRoot.prepend(base);
  }

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
      this.globalStatus?.classList.add("loading");
      this.globalOverlay?.classList.add("active");
    } else if (mode === "error") {
      this.globalStatus?.classList.add("error");
      this.globalOverlay?.classList.remove("active");
    } else {
      this.globalStatus?.classList.add("success");
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
    this.questionTextEl.classList.toggle("question-empty", !text || !text.trim());
  }

  resetQuestion() {
    this.currentSessionId = null;
    this.topicTextEl.textContent = "—";
    this.difficultyTextEl.textContent = "—";
    this.sessionIdTextEl.textContent = "—";
    this.setQuestionText("Click Generate Question to get started.");
    this.setCardStatus(this.questionStatus, "idle", "Idle");
    this.lastScoreEl.style.display = "none";
  }

  clearCode() {
    if (this.codeInput) this.codeInput.value = "";
  }

  async generatePrompt() {
    const email = this.safeEmail();
    if (!email) return;

    this.setGlobalStatus("loading", "Generating question...");
    this.setCardStatus(this.questionStatus, "loading", "Requesting new prompt...");
    this.generateQuestionBtn.disabled = true;

    try {
      const res = await fetch(this.apiUrl("/api/v1/coding/generate-prompt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          language: this.languageSelect?.value || "JavaScript",
        }),
      });
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

  async submitSolution() {
    if (!this.currentSessionId) {
      alert("Generate a question first.");
      return;
    }
    const code = (this.codeInput?.value || "").trim();
    if (!code) {
      alert("Paste your solution first.");
      return;
    }

    this.setGlobalStatus("loading", "Submitting solution...");
    this.setCardStatus(this.answerStatus, "loading", "Sending code...");
    this.setCardStatus(this.evaluationStatus, "loading", "Evaluating...");
    this.submitCodeBtn.disabled = true;

    try {
      const res = await fetch(this.apiUrl("/api/v1/coding/submit-solution"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.currentSessionId,
          code,
          language: this.languageSelect?.value || "JavaScript",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const evaluation = data.evaluation || {};
      const score = typeof evaluation.score === "number" ? evaluation.score : null;
      if (score !== null) {
        this.lastScoreEl.textContent = `Score: ${score}`;
        this.lastScoreEl.style.display = "inline-flex";
      } else {
        this.lastScoreEl.style.display = "none";
      }

      this.evalSummary.textContent = evaluation.summary || "No summary returned.";
      this.evalCorrectness.textContent = evaluation.correctness || "—";
      this.evalTime.textContent = evaluation.timeComplexity || "—";
      this.evalSpace.textContent = evaluation.spaceComplexity || "—";

      this.renderListFromArray(this.evalStrengths, evaluation.strengths, "No strengths returned.");
      this.renderListFromArray(this.evalWeaknesses, evaluation.weaknesses, "No weaknesses returned.");
      this.renderListFromArray(this.evalIssues, evaluation.issues, "No issues returned.");
      this.renderListFromArray(this.evalSuggestions, evaluation.suggestions, "No suggestions returned.");

      this.setCardStatus(this.answerStatus, "idle", "Solution submitted");
      this.setCardStatus(this.evaluationStatus, "idle", "Evaluation ready");
      this.setGlobalStatus("idle", "Feedback ready.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.answerStatus, "error", "Failed to submit solution");
      this.setCardStatus(this.evaluationStatus, "error", "Failed to evaluate");
      this.setGlobalStatus("error", "Error submitting solution");
      alert("Error submitting solution:\n" + err.message);
    } finally {
      this.submitCodeBtn.disabled = false;
    }
  }

  async loadHistory() {
    const email = this.safeEmail();
    if (!email) return;

    this.setGlobalStatus("loading", "Loading history...");
    this.setCardStatus(this.historyStatus, "loading", "Loading...");
    this.loadHistoryBtn.disabled = true;

    try {
      const res = await fetch(
        this.apiUrl(`/api/v1/coding/history/${encodeURIComponent(email)}`)
      );
      if (!res.ok) throw new Error(await res.text());
      const historyData = await res.json();

      this.renderHistoryPretty(historyData);
      this.historyViewRaw.textContent = JSON.stringify(historyData, null, 2);

      this.setCardStatus(this.historyStatus, "idle", "History loaded");
      this.setGlobalStatus("idle", "History updated.");
    } catch (err) {
      console.error(err);
      this.setCardStatus(this.historyStatus, "error", "Failed to load history");
      this.setGlobalStatus("error", "Error loading history");
    } finally {
      this.loadHistoryBtn.disabled = false;
    }
  }

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

  renderHistoryPretty(history) {
    this.historyViewPretty.innerHTML = "";
    const items = history.items || history.sessions || [];
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
          <span>${new Date(s.createdAt || Date.now()).toLocaleString()}</span>
        </div>`;
      this.historyViewPretty.appendChild(item);
    });
  }

  toggleHistory() {
    const showRaw = this.historyViewRaw.style.display === "block";
    this.historyViewRaw.style.display = showRaw ? "none" : "block";
    this.historyViewPretty.style.display = showRaw ? "block" : "none";
    this.toggleHistoryRawBtn.textContent = showRaw ? "Raw JSON" : "Pretty View";
  }
}

customElements.define("coding-tutor", CodingTutor);
