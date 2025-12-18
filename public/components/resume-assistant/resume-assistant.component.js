/**
 * Resume Assistant Web Component – Fully Corrected Version
 * --------------------------------------------------------
 * Option 2: Maintain upgraded UI exactly as-is (no visual regressions)
 * but restore ALL correct logic from legacy resume.html.
 *
 * Fixes included:
 * - Correct payloads for analyze + tailor
 * - Correct variable binding in shadow DOM
 * - Complete error handling
 * - Improved bullets rendering + copy logic
 * - Tailored resume rendering + copy/apply/download
 * - Proper loading states
 * - Robust extract-from-file flow with fallbacks
 * - No UI structure changes
 */

class ResumeAssistant extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Internal state
    this.isTailoredByAssistant = false;
    this.lastImprovedBullets = [];
    this.lastTailoredFullText = "";
  }

  async connectedCallback() {
    const url = "./components/resume-assistant/resume-assistant.component.html";
    const html = await fetch(url).then((r) => r.text());

    this.shadowRoot.innerHTML = html;
    await window.attachComponentCss(this.shadowRoot, url);

    // this.baseUrl = "http://34.149.127.45"; // keep dev URL
    this.bindElements();
    this.bindEvents();

    this.setStatus("uploadStatus", "idle", "Waiting for upload");
    this.setStatus("analysisStatus", "idle", "Idle");
  }

  /** Helper: shadow DOM getter */
  $(id) {
    return this.shadowRoot.getElementById(id);
  }

  /** Bind DOM references */
  bindElements() {
    const $ = this.$.bind(this);

    // Inputs
    this.fileInput = $("resumeFileInput");
    this.resumeText = $("resumeText");
    this.targetRole = $("targetRole");
    this.targetCompany = $("targetCompany");
    this.jobDescription = $("jobDescription");

    // Buttons
    this.extractFromFileBtn = $("extractFromFileBtn");
    this.analyzeBtn = $("analyzeResumeBtn");
    this.tailorBtn = $("tailorJobBtn");
    this.clearBtn = $("clearResumeBtn");

    // Status + Output
    this.uploadStatus = $("uploadStatus");
    this.uploadFeedback = $("uploadFeedback");
    this.analysisStatus = $("analysisStatus");
    this.analysisOutput = $("analysisOutput");

    // Improved bullets
    this.improvedBulletsCard = $("improvedBulletsCard");
    this.bulletsList = $("bulletsList");
    this.copyBulletsBtn = $("copyBulletsBtn");
    this.copyStatus = $("copyStatus");

    // Tailored resume
    this.tailoredCard = $("tailoredCard");
    this.tailoredSummary = $("tailoredSummary");
    this.tailoredNotesList = $("tailoredNotesList");
    this.tailoredFullText = $("tailoredFullText");
    this.copyTailoredBtn = $("copyTailoredBtn");
    this.applyTailoredBtn = $("applyTailoredBtn");
    this.downloadTailoredBtn = $("downloadTailoredBtn");
  }

  /** Bind event listeners */
  bindEvents() {
    if (this.fileInput)
      this.fileInput.addEventListener("change", (e) =>
        this.handleFileSelect(e)
      );

    if (this.extractFromFileBtn)
      this.extractFromFileBtn.addEventListener("click", () =>
        this.extractFromFile()
      );

    if (this.analyzeBtn)
      this.analyzeBtn.addEventListener("click", () => this.analyzeResume());

    if (this.tailorBtn)
      this.tailorBtn.addEventListener("click", () => this.tailorToJob());

    if (this.clearBtn)
      this.clearBtn.addEventListener("click", () => this.clearFields());

    if (this.copyBulletsBtn)
      this.copyBulletsBtn.addEventListener("click", () =>
        this.copyImprovedBullets()
      );

    if (this.copyTailoredBtn)
      this.copyTailoredBtn.addEventListener("click", () =>
        this.copyText(this.lastTailoredFullText)
      );

    if (this.applyTailoredBtn)
      this.applyTailoredBtn.addEventListener("click", () =>
        this.applyTailoredToEditor()
      );

    if (this.downloadTailoredBtn)
      this.downloadTailoredBtn.addEventListener("click", () =>
        this.downloadTailoredAsText()
      );
  }

  /** UI helper for card statuses */
  setStatus(id, mode, message) {
    const el = this.$(id);
    if (!el) return;
    const text = el.querySelector(".card-status-text");
    el.classList.remove("loading", "error", "success");

    if (mode === "loading") el.classList.add("loading");
    if (mode === "error") el.classList.add("error");
    if (mode === "success") el.classList.add("success");

    text.textContent = message;
  }

  /** Button loading helper */
  setButtonLoading(btn, isLoading) {
    if (!btn) return;

    if (isLoading) {
      btn.disabled = true;
      if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
      btn.textContent = "Loading...";
    } else {
      btn.disabled = false;
      if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
        delete btn.dataset.originalText;
      }
    }
  }

  /** Handle file selection */
  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    this.setStatus("uploadStatus", "idle", `Selected: ${file.name}`);
    this.uploadFeedback.querySelector(
      "p"
    ).textContent = `Ready to extract: ${file.name}`;
  }

  /** Extract file → text */
  async extractFromFile() {
    const file = this.fileInput.files[0];
    if (!file) return this.showError("Please select a file first.");

    const formData = new FormData();
    formData.append("file", file);

    this.setStatus("uploadStatus", "loading", "Extracting text...");

    try {
      const res = await fetch(`/api/v1/resume/extract-text`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Extraction failed (${res.status})`);

      const data = await res.json();

      // Support legacy fallback fields
      const extracted = data.text || data.plainText || data.extractedText || "";

      this.resumeText.value = extracted;
      this.uploadFeedback.querySelector("p").textContent =
        "Extraction complete.";
      this.setStatus("uploadStatus", "success", "Extraction complete");
    } catch (err) {
      console.error(err);
      this.setStatus("uploadStatus", "error", "Extraction failed");
      this.uploadFeedback.querySelector("p").textContent =
        "Error extracting resume.";
    }
  }

  /** Analyze resume */
  async analyzeResume() {
    const rawText = (this.resumeText.value || "").trim();
    const targetRole = (this.targetRole.value || "").trim();
    const targetCompany = (this.targetCompany.value || "").trim();

    if (!rawText) {
      this.showError("Please paste your resume text before analyzing.");
      this.resumeText.focus();
      return;
    }

    const payload = {
      text: rawText,
      targetRole: targetRole || undefined,
      targetCompany: targetCompany || undefined,
      // If user has applied a tailored resume, tell backend this is a post-tailor pass
      mode: this.isTailoredByAssistant ? "postTailor" : "firstPass",
    };

    this.clearError();
    this.setStatus("analysisStatus", "loading", "Analyzing resume...");
    this.setButtonLoading(this.analyzeBtn, true);

    try {
      const res = await fetch(`/api/v1/resume/analyze-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        console.error("Analyze error:", errBody || res.status);
        const errMessage =
          (errBody && (errBody.error || errBody.message)) ||
          `Failed to analyze resume (status ${res.status}).`;
        this.showError(errMessage);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") {
        throw new Error(
          "Received an unexpected response shape from the server."
        );
      }

      // Render structured analysis into the card
      this.renderAnalysis(data);

      // Improved bullets card is driven from analysis.improvedSampleBullets
      const analysis = data.analysis || data.insights || data || {};
      const improvedBullets =
        analysis.improvedSampleBullets || data.improvedSampleBullets || [];
      this.renderImprovedBullets(improvedBullets);

      this.setStatus("analysisStatus", "success", "Analysis complete");
    } catch (err) {
      console.error(err);
      this.showError(
        err && err.message
          ? err.message
          : "Unexpected error while analyzing resume."
      );
    } finally {
      this.setButtonLoading(this.analyzeBtn, false);
    }
  }

  /** Tailor resume to job description */
  async tailorToJob() {
    const rawText = (this.resumeText.value || "").trim();
    const jobDescription = (this.jobDescription.value || "").trim();
    const targetRole = (this.targetRole.value || "").trim();
    const targetCompany = (this.targetCompany.value || "").trim();

    if (!rawText) {
      this.showError("Please paste your resume text before tailoring.");
      this.resumeText.focus();
      return;
    }

    if (!jobDescription) {
      this.showError(
        "Please paste the target job description before tailoring."
      );
      this.jobDescription.focus();
      return;
    }

    const payload = {
      // matches legacy resume.html
      text: rawText,
      jobDescription,
      targetRole: targetRole || undefined,
      targetCompany: targetCompany || undefined,
    };

    this.isTailoredByAssistant = true;
    this.clearError();
    this.setStatus("analysisStatus", "loading", "Tailoring resume...");
    this.setButtonLoading(this.tailorBtn, true);

    try {
      const res = await fetch(`/api/v1/resume/tailor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        console.error("Tailor error:", errBody || res.status);
        const errMessage =
          (errBody && (errBody.error || errBody.message)) ||
          `Failed to tailor resume (status ${res.status}).`;
        this.showError(errMessage);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") {
        throw new Error(
          "Received an unexpected response shape from the server."
        );
      }

      // data from backend already matches legacy renderTailoredResume contract
      this.renderTailoredResume(data);
      this.setStatus("analysisStatus", "success", "Tailoring complete");
    } catch (err) {
      console.error(err);
      this.showError(
        err && err.message
          ? err.message
          : "Unexpected error while tailoring resume."
      );
    } finally {
      this.setButtonLoading(this.tailorBtn, false);
    }
  }

  /**
   * Render resume analysis with legacy structure (profile, skills,
   * experience, education, projects, issues, suggestions, insights).
   */
  renderAnalysis(data) {
    const output = this.analysisOutput;
    if (!output) return;
    output.innerHTML = "";

    if (!data || Object.keys(data).length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent =
        "No analysis data received. Run Analyze to see strengths, gaps, and suggestions.";
      output.appendChild(p);
      return;
    }

    const analysis = data.analysis || data.insights || data || {};
    const parsed = analysis.parsed || {};
    const issues = Array.isArray(analysis.issues) ? analysis.issues : [];
    const sectionIssues =
      analysis.sectionIssues && typeof analysis.sectionIssues === "object"
        ? analysis.sectionIssues
        : {};
    const suggestions = Array.isArray(analysis.suggestions)
      ? analysis.suggestions
      : [];
    const strengths = analysis.strengths || analysis.whatWentWell || [];
    const weaknesses = analysis.weaknesses || analysis.whatToImprove || [];

    // High-level parsed details
    this.renderProfile(parsed);
    this.renderSkills(parsed.skills || {});
    this.renderExperience(parsed.experience || []);
    this.renderEducation(parsed.education || []);
    this.renderProjects(parsed.projects || []);

    // Issues + suggestions
    this.renderIssues(issues, sectionIssues);
    this.renderSuggestions(suggestions);

    // Optional "Insights" block based on strengths/weaknesses
    if (strengths.length || weaknesses.length) {
      const block = document.createElement("div");
      block.className = "section-block";

      const heading = document.createElement("div");
      heading.className = "section-heading";
      heading.textContent = this.isTailoredByAssistant
        ? "Tailored insights"
        : "Resume insights";
      block.appendChild(heading);

      const ul = document.createElement("ul");
      ul.className = "issues-list";

      strengths.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = `Strength: ${s}`;
        ul.appendChild(li);
      });

      weaknesses.forEach((w) => {
        const li = document.createElement("li");
        li.textContent = `Weakness: ${w}`;
        ul.appendChild(li);
      });

      block.appendChild(ul);
      output.appendChild(block);
    }

    if (!output.childNodes.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent =
        "Analysis completed, but no strengths, gaps, or suggestions were returned.";
      output.appendChild(p);
    }
  }

  renderProfile(parsed) {
    const output = this.analysisOutput;
    if (!output) return;

    const hasBasic =
      parsed && (parsed.name || parsed.headline || parsed.location);
    const hasSummary = parsed && parsed.summary;

    if (!hasBasic && !hasSummary) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Profile";
    block.appendChild(heading);

    const lines = [];

    if (parsed.name) lines.push(parsed.name);
    if (parsed.headline) lines.push(parsed.headline);
    if (parsed.location) lines.push(parsed.location);

    if (lines.length) {
      const p = document.createElement("p");
      p.textContent = lines.join(" · ");
      block.appendChild(p);
    }

    if (hasSummary) {
      const summary = document.createElement("p");
      summary.textContent = parsed.summary;
      block.appendChild(summary);
    }

    output.appendChild(block);
  }

  renderSkills(skills) {
    const output = this.analysisOutput;
    if (!output || !skills || !Object.keys(skills).length) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Skills";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    const addGroup = (label, arr) => {
      if (!arr || !arr.length) return;
      const li = document.createElement("li");
      li.textContent = `${label}: ${arr.join(", ")}`;
      ul.appendChild(li);
    };

    addGroup("Languages", skills.languages);
    addGroup("Frameworks", skills.frameworks);
    addGroup("Databases", skills.databases);
    addGroup("Cloud", skills.cloud);
    addGroup("Tools", skills.tools);
    addGroup("Other", skills.other);

    if (ul.childNodes.length) {
      block.appendChild(ul);
      output.appendChild(block);
    }
  }

  renderExperience(experiences) {
    const output = this.analysisOutput;
    if (!output || !Array.isArray(experiences) || !experiences.length) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Experience";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    experiences.forEach((exp) => {
      if (!exp) return;

      const lineParts = [];

      // Try multiple field names the parser might use
      const role = exp.role || exp.title;
      const company = exp.company || exp.org || exp.employer;
      const location = exp.location || exp.city;

      if (role) lineParts.push(role);
      if (company) lineParts.push(`at ${company}`);
      if (location) lineParts.push(`(${location})`);

      // Build a date / duration label from several possible fields
      let dateLabel = exp.dates || exp.duration;
      if (!dateLabel) {
        const startRaw = exp.start || exp.startDate || exp.start_date;
        const endRaw = exp.end || exp.endDate || exp.end_date;
        if (startRaw || endRaw) {
          const startText = startRaw || "Start";
          const endText = endRaw || "Present";
          dateLabel = `${startText} – ${endText}`;
        }
      }

      if (dateLabel) {
        lineParts.push(`[${dateLabel}]`);
      }

      // Top-level list item for this experience entry
      const li = document.createElement("li");
      li.textContent = lineParts.join(" ");

      // Nested bullets / highlights underneath each experience
      const bullets =
        (Array.isArray(exp.bullets) && exp.bullets) ||
        (Array.isArray(exp.highlights) && exp.highlights) ||
        [];

      if (bullets.length) {
        const subUl = document.createElement("ul");
        subUl.className = "issues-list";
        bullets.forEach((b) => {
          if (!b) return;
          const subLi = document.createElement("li");
          subLi.textContent = String(b);
          subUl.appendChild(subLi);
        });
        li.appendChild(subUl);
      }

      ul.appendChild(li);
    });

    if (ul.childNodes.length) {
      block.appendChild(ul);
      output.appendChild(block);
    }
  }

  renderEducation(education) {
    const output = this.analysisOutput;
    if (!output || !Array.isArray(education) || !education.length) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Education";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    education.forEach((edu) => {
      if (!edu) return;
      const parts = [];
      if (edu.degree) parts.push(edu.degree);
      if (edu.institution) parts.push(`– ${edu.institution}`);
      if (edu.year) parts.push(`(${edu.year})`);

      const li = document.createElement("li");
      li.textContent = parts.join(" ");
      ul.appendChild(li);
    });

    if (ul.childNodes.length) {
      block.appendChild(ul);
      output.appendChild(block);
    }
  }

  renderProjects(projects) {
    const output = this.analysisOutput;
    if (!output || !Array.isArray(projects) || !projects.length) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Projects";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    projects.forEach((proj) => {
      if (!proj) return;
      const parts = [];
      if (proj.name) parts.push(proj.name);
      if (proj.description) parts.push(`– ${proj.description}`);

      const li = document.createElement("li");
      li.textContent = parts.join(" ");
      ul.appendChild(li);
    });

    if (ul.childNodes.length) {
      block.appendChild(ul);
      output.appendChild(block);
    }
  }

  renderIssues(issues, sectionIssues) {
    const output = this.analysisOutput;
    const flatIssues = Array.isArray(issues) ? issues : [];
    const sections =
      sectionIssues && typeof sectionIssues === "object" ? sectionIssues : {};

    if (!output || (!flatIssues.length && !Object.keys(sections).length))
      return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Detected issues";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    flatIssues.forEach((issue) => {
      const li = document.createElement("li");
      li.textContent = issue;
      ul.appendChild(li);
    });

    Object.entries(sections).forEach(([sectionName, problems]) => {
      if (!problems) return;
      const li = document.createElement("li");
      const problemText = Array.isArray(problems)
        ? problems.join(", ")
        : String(problems);
      li.innerHTML = `<strong>${sectionName}:</strong> ${problemText}`;
      ul.appendChild(li);
    });

    if (ul.childNodes.length) {
      block.appendChild(ul);
      output.appendChild(block);
    }
  }

  renderSuggestions(suggestions) {
    const output = this.analysisOutput;
    if (!output || !Array.isArray(suggestions) || !suggestions.length) return;

    const block = document.createElement("div");
    block.className = "section-block";

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "High-impact suggestions";
    block.appendChild(heading);

    const ul = document.createElement("ul");
    ul.className = "issues-list";

    suggestions.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      ul.appendChild(li);
    });

    block.appendChild(ul);
    output.appendChild(block);
  }

  /** Render Improved Sample Bullets */
  renderImprovedBullets(bullets) {
    if (
      !this.improvedBulletsCard ||
      !this.bulletsList ||
      !this.copyBulletsBtn
    ) {
      return;
    }

    const normalized = [];
    if (Array.isArray(bullets)) {
      bullets.forEach((b) => {
        if (!b) return;
        if (typeof b === "string") {
          normalized.push(b);
        } else if (typeof b === "object") {
          const t = b.improved || b.text || b.original;
          if (t) normalized.push(String(t));
        }
      });
    }

    this.lastImprovedBullets = normalized;

    if (!normalized.length) {
      this.improvedBulletsCard.style.display = 'none';
      this.bulletsList.innerHTML = "";
      this.copyBulletsBtn.disabled = true;
      return;
    }

    this.improvedBulletsCard.style.display = 'block';
    this.bulletsList.innerHTML = "";
    normalized.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      this.bulletsList.appendChild(li);
    });
    this.copyBulletsBtn.disabled = false;
  }

  /** Copy improved bullets */
  async copyImprovedBullets() {
    if (!this.lastImprovedBullets || !this.lastImprovedBullets.length) return;

    const text = this.lastImprovedBullets.join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      if (this.copyStatus) {
        this.copyStatus.textContent = "Copied!";
        setTimeout(() => {
          if (this.copyStatus) this.copyStatus.textContent = "";
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      if (this.copyStatus) {
        this.copyStatus.textContent = "Unable to copy.";
        setTimeout(() => {
          if (this.copyStatus) this.copyStatus.textContent = "";
        }, 2000);
      }
    }
  }

  /** Render tailored resume */
  renderTailoredResume(raw) {
    if (!this.tailoredCard) return;

    const data =
      raw && (raw.rewrittenSummary || raw.fullResumeText || raw.notesForUser)
        ? raw
        : raw && raw.tailoredResume
        ? raw.tailoredResume
        : null;

    if (!data) {
      this.tailoredCard.style.display = "none";
      if (this.tailoredSummary) {
        this.tailoredSummary.textContent = "No tailored summary generated yet.";
        this.tailoredSummary.classList.add("muted");
      }
      if (this.tailoredNotesList) {
        this.tailoredNotesList.innerHTML = "";
        const li = document.createElement("li");
        li.textContent = "No tailoring notes yet.";
        li.className = "muted";
        this.tailoredNotesList.appendChild(li);
      }
      if (this.tailoredFullText) {
        this.tailoredFullText.textContent = "No tailored resume generated yet.";
      }
      this.lastTailoredFullText = "";
      if (this.copyTailoredBtn) this.copyTailoredBtn.disabled = true;
      if (this.applyTailoredBtn) this.applyTailoredBtn.disabled = true;
      if (this.downloadTailoredBtn) this.downloadTailoredBtn.disabled = true;
      return;
    }

    this.tailoredCard.style.display = "block";

    const summary =
      data.rewrittenSummary || "No tailored summary generated yet.";
    if (this.tailoredSummary) {
      this.tailoredSummary.textContent = summary;
      if (data.rewrittenSummary) {
        this.tailoredSummary.classList.remove("muted");
      } else {
        this.tailoredSummary.classList.add("muted");
      }
    }

    if (this.tailoredNotesList) {
      this.tailoredNotesList.innerHTML = "";
      const notes = Array.isArray(data.notesForUser)
        ? data.notesForUser
        : data.notesForUser
        ? [data.notesForUser]
        : [];
      if (!notes.length) {
        const li = document.createElement("li");
        li.textContent = "No tailoring notes provided.";
        li.className = "muted";
        this.tailoredNotesList.appendChild(li);
      } else {
        notes.forEach((note) => {
          if (!note) return;
          const li = document.createElement("li");
          li.textContent = String(note);
          this.tailoredNotesList.appendChild(li);
        });
      }
    }

    const fullText = data.fullResumeText || "";
    this.lastTailoredFullText = fullText;
    if (this.tailoredFullText) {
      this.tailoredFullText.textContent =
        fullText || "No tailored resume generated yet.";
    }

    const hasFullText = !!fullText;
    if (this.copyTailoredBtn) this.copyTailoredBtn.disabled = !hasFullText;
    if (this.applyTailoredBtn) this.applyTailoredBtn.disabled = !hasFullText;
    if (this.downloadTailoredBtn)
      this.downloadTailoredBtn.disabled = !hasFullText;
  }

  /** Copy text helper */
  async copyText(text) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  /** Apply tailored resume to editor */
  applyTailoredToEditor() {
    if (!this.lastTailoredFullText) return;
    this.resumeText.value = this.lastTailoredFullText;
    this.isTailoredByAssistant = true;
  }

  /** Download tailored resume */
  downloadTailoredAsText() {
    const text = this.lastTailoredFullText || "";
    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tailored-resume.txt";
    link.click();
  }

  /** Clear everything */
  clearFields() {
    this.resumeText.value = "";
    this.targetRole.value = "";
    this.targetCompany.value = "";
    this.jobDescription.value = "";

    this.analysisOutput.innerHTML =
      "<p class='placeholder'>No analysis yet. Paste your resume and click “Analyze Resume”.</p>";
    if (this.uploadFeedback) {
      const p = this.uploadFeedback.querySelector("p");
      if (p) p.textContent = "No file uploaded yet.";
    }

    this.improvedBulletsCard.style.display = "none";
    this.tailoredCard.style.display = "none";

    this.setStatus("analysisStatus", "idle", "Idle");
    this.setStatus("uploadStatus", "idle", "Waiting for upload");

    this.isTailoredByAssistant = false;
    this.lastImprovedBullets = [];
    this.lastTailoredFullText = "";
  }

  /** Clear analysis-related error/status */
  clearError() {
    // Reset the analysis status chip back to idle;
    // content itself will be overwritten by the next render.
    this.setStatus("analysisStatus", "idle", "Idle");
  }

  /** Show simple (component-scoped) error message */
  showError(msg) {
    console.error("[ResumeAssistant Error]", msg);

    if (this.analysisOutput) {
      this.analysisOutput.innerHTML = `<p style="color: var(--danger); font-weight:600;">${msg}</p>`;
    }

    this.setStatus(
      "analysisStatus",
      "error",
      msg || "An unexpected error occurred."
    );
  }
}

customElements.define("sd-resume-assistant", ResumeAssistant);
