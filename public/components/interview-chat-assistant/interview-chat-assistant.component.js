class SdInterviewChatAssistant extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.sessionId = null;
    this.systemLocked = false;
    this.abortController = null;
    this.isStreaming = false;
  }

  storageKey() {
    return "interviewChatAssistant:lastSessionId";
  }

  async connectedCallback() {
    const html = await fetch(
      "./components/interview-chat-assistant/interview-chat-assistant.component.html"
    ).then((r) => r.text());

    this.shadowRoot.innerHTML = html;

    this.$ = (id) => this.shadowRoot.getElementById(id);

    this.systemPrompt = this.$("systemPrompt");
    this.contextMessageLimit = this.$("contextMessageLimit");
    this.includeTranscript = this.$("includeTranscript");
    this.persistMessages = this.$("persistMessages");
    this.sessionTitle = this.$("sessionTitle");

    this.userPrompt = this.$("userPrompt");
    this.sendBtn = this.$("sendBtn");
    this.stopBtn = this.$("stopBtn");
    this.newSessionBtn = this.$("newSessionBtn");
    this.clearChatBtn = this.$("clearChatBtn");
    this.forgetSessionBtn = this.$("forgetSessionBtn");
    this.resetSessionBtn = this.$("resetSessionBtn");

    this.chatArea = this.$("chatArea");
    this.sessionIdText = this.$("sessionIdText");
    this.statusPill = this.$("statusPill");

    this.resumeSessionId = this.$("resumeSessionId");
    this.resumeSessionBtn = this.$("resumeSessionBtn");

    this.refreshSessionsBtn = this.$("refreshSessionsBtn");
    this.sessionsList = this.$("sessionsList");

    this.sendBtn?.addEventListener("click", () => this.sendStream());
    this.stopBtn?.addEventListener("click", () => this.stopStream());
    this.newSessionBtn?.addEventListener("click", () => this.createNewSession());
    this.clearChatBtn?.addEventListener("click", () => this.clearChat());
    this.forgetSessionBtn?.addEventListener("click", () => this.forgetSession());
    this.resumeSessionBtn?.addEventListener("click", () => this.resumeSessionFromInput());
    this.refreshSessionsBtn?.addEventListener("click", () => this.refreshSessions());
    this.resetSessionBtn?.addEventListener("click", () => this.resetSession());

    this.userPrompt?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendStream();
      }
    });

    this.userPrompt?.addEventListener("input", () => this.autoGrow(this.userPrompt));

    this.renderSession();
    await this.refreshSessions();
    this.restoreSessionFromStorage();
  }

  autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  setStatus(mode, text) {
    if (!this.statusPill) return;
    if (!text) {
      this.statusPill.style.display = "none";
      this.statusPill.className = "statusPill";
      this.statusPill.textContent = "";
      return;
    }
    this.statusPill.style.display = "inline-flex";
    this.statusPill.className = `statusPill ${mode || ""}`.trim();
    this.statusPill.textContent = text;
  }

  renderSession() {
    if (this.sessionIdText) this.sessionIdText.textContent = this.sessionId || "none";
    if (this.systemPrompt) this.systemPrompt.disabled = !!this.systemLocked;
  }

  clearChat() {
    if (!this.chatArea) return;
    this.chatArea.innerHTML =
      '<div class="emptyState" data-empty="1">Start by sending a message. The assistant will stream its response.</div>';
  }

  removeEmptyStateIfAny() {
    if (!this.chatArea) return;
    const el = this.chatArea.querySelector('[data-empty="1"]');
    if (el) el.remove();
  }

  appendMessage(role, text, isAssistant, bubbleId) {
    if (!this.chatArea) return;
    this.removeEmptyStateIfAny();

    const wrap = document.createElement("div");
    wrap.className = "msg";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = role;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${isAssistant ? "assistant" : ""}`.trim();
    bubble.textContent = String(text ?? "");
    if (bubbleId) bubble.setAttribute("data-bubble-id", bubbleId);

    wrap.appendChild(meta);
    wrap.appendChild(bubble);
    this.chatArea.appendChild(wrap);
    this.chatArea.scrollTop = this.chatArea.scrollHeight;
  }

  updateBubbleText(bubbleId, nextText) {
    if (!this.chatArea) return;
    const bubble = this.chatArea.querySelector(`[data-bubble-id="${bubbleId}"]`);
    if (!bubble) return;
    bubble.textContent = nextText;
    this.chatArea.scrollTop = this.chatArea.scrollHeight;
  }

  clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  stopStream() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isStreaming = false;
    if (this.stopBtn) this.stopBtn.disabled = true;
    if (this.sendBtn) this.sendBtn.disabled = false;
    this.setStatus(null, null);
  }

  resetSessionLocal(clearStorage) {
    this.stopStream();
    this.sessionId = null;
    this.systemLocked = false;
    if (clearStorage) localStorage.removeItem(this.storageKey());
    this.renderSession();
    this.setStatus(null, null);
  }

  resetSession() {
    this.resetSessionLocal(true)
    this.clearChat();
    this.systemPrompt.value = "";       // or keep last-used template
    this.refreshSessions();             // optional, but keeps UI consistent
  }

  async createNewSession() {
    try {
      this.setStatus("loading", "Creating session…");
      this.resetSessionLocal(true);
      const sessionId = await this.createSessionOnServer();
      this.sessionId = sessionId;
      this.systemLocked = true;
      localStorage.setItem(this.storageKey(), this.sessionId);
      this.renderSession();
      this.clearChat();
      await this.refreshSessions();
      this.setStatus("success", "Session created");
      setTimeout(() => this.setStatus(null, null), 900);
    } catch (e) {
      this.setStatus("error", "Error");
      alert(e?.message || String(e));
    }
  }

  async forgetSession() {
    const id = this.sessionId;
    if (!id) {
      this.resetSessionLocal(true);
      this.clearChat();
      try {
        await this.refreshSessions();
      } catch {}
      return;
    }

    try {
      this.setStatus("loading", "Deleting session…");
      const res = await fetch(`/api/v1/interview/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to delete session (${res.status})`);
      }
    } catch (e) {
      this.setStatus("error", "Error");
      alert(e?.message || String(e));
    } finally {
      this.resetSessionLocal(true);
      this.clearChat();
      try {
        await this.refreshSessions();
      } catch {}
      this.setStatus("success", "Session deleted");
      setTimeout(() => this.setStatus(null, null), 900);
    }
  }

  async resumeSessionFromInput() {
    const id = String(this.resumeSessionId?.value || "").trim();
    if (!id) return;
    await this.resumeSession(id);
    if (this.resumeSessionId) this.resumeSessionId.value = "";
  }

  async resumeSession(id) {
    this.sessionId = id;
    const sRes = await fetch(`/api/v1/interview/sessions/${this.sessionId}`);
    if (sRes.ok) {
      const s = await sRes.json();
      this.systemPrompt.value = s.systemPrompt || "";   // <-- key line
      this.renderSession();
    }
    this.systemLocked = true;
    localStorage.setItem(this.storageKey(), this.sessionId);
    this.renderSession();
    this.setStatus("loading", "Hydrating…");
    await this.hydrateTranscript();
    this.setStatus("success", "Resumed");
    setTimeout(() => this.setStatus(null, null), 900);
  }

  restoreSessionFromStorage() {
    const saved = localStorage.getItem(this.storageKey());
    if (!saved) return;
    this.resumeSession(saved);
  }

  async createSessionOnServer() {
    const systemPrompt = String(this.systemPrompt?.value || "").trim();
    const title = String(this.sessionTitle?.value || "").trim();

    const contextMessageLimit = this.clampInt(this.contextMessageLimit?.value, 0, 60, 20);

    const body = {
      title: title || undefined,
      systemPrompt: systemPrompt || undefined,
      contextMessageLimit,
      includeTranscript: !!this.includeTranscript?.checked,
      persistMessages: !!this.persistMessages?.checked,
    };

    const res = await fetch("/api/v1/interview/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Failed to create session (${res.status})`);
    }

    const data = await res.json().catch(() => ({}));
    const sessionId = data?.sessionId || data?.id;
    if (!sessionId) throw new Error("Session create returned no sessionId");
    return sessionId;
  }

  async ensureSession() {
    if (this.sessionId) return this.sessionId;
    const sessionId = await this.createSessionOnServer();
    this.sessionId = sessionId;
    this.systemLocked = true;
    localStorage.setItem(this.storageKey(), this.sessionId);
    this.renderSession();
    try {
      await this.refreshSessions();
    } catch {}
    return this.sessionId;
  }

  async sendStream() {
    if (this.isStreaming) return;

    const userText = String(this.userPrompt?.value || "").trim();
    if (!userText) return;

    if (this.userPrompt) {
      this.userPrompt.value = "";
      this.autoGrow(this.userPrompt);
    }

    this.appendMessage("You", userText, false);

    this.setStatus("loading", "Streaming…");
    this.isStreaming = true;
    if (this.sendBtn) this.sendBtn.disabled = true;
    if (this.stopBtn) this.stopBtn.disabled = false;

    const assistantBubbleId = `a_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    this.appendMessage("Assistant", "", true, assistantBubbleId);

    try {
      const sessionId = await this.ensureSession();
      const contextMessageLimit = this.clampInt(this.contextMessageLimit?.value, 0, 60, 20);
      const body = {
        messages: [{ role: "user", content: userText }],
        persistMessages: !!this.persistMessages?.checked,
        includeTranscript: !!this.includeTranscript?.checked,
        contextMessageLimit: contextMessageLimit
      }

      this.abortController = new AbortController();
      const res = await fetch(`/api/v1/interview/sessions/${sessionId}/runs/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Stream failed (${res.status})`);
      }

      if (!res.body) throw new Error("Streaming not supported by browser response body");

      let fullText = "";
      await this.consumeSseStream(res.body, (delta) => {
        fullText += delta;
        this.updateBubbleText(assistantBubbleId, fullText);
      });

      fullText = String(fullText || "").trim();
      if (!fullText) this.updateBubbleText(assistantBubbleId, "[No response]");

      this.setStatus("success", "Done");
      setTimeout(() => this.setStatus(null, null), 900);
    } catch (e) {
      if (String(e?.name || "") === "AbortError") {
        this.updateBubbleText(assistantBubbleId, "[Stopped]");
      } else {
        this.updateBubbleText(assistantBubbleId, `Error: ${e?.message || String(e)}`);
        this.setStatus("error", "Error");
      }
    } finally {
      this.isStreaming = false;
      this.abortController = null;
      if (this.stopBtn) this.stopBtn.disabled = true;
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  async consumeSseStream(readable, onDelta) {
    const reader = readable.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = rawEvent.split("\n");
        let eventName = "message";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) eventName = trimmed.slice(6).trim() || "message";
        }

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") return;

          if (eventName === "meta") continue;

          if (eventName === "error") {
            try {
              const obj = JSON.parse(data);
              const msg = obj?.message || obj?.error || data;
              throw new Error(String(msg || "Stream error"));
            } catch (e) {
              throw e instanceof Error ? e : new Error(String(data || "Stream error"));
            }
          }

          try {
            const obj = JSON.parse(data);
            if (typeof obj?.delta === "string" && obj.delta) onDelta(obj.delta);
            else if (typeof obj?.text === "string" && obj.text) onDelta(obj.text);
            else if (typeof obj === "string" && obj) onDelta(obj);
          } catch {
            onDelta(data);
          }
        }
      }
    }
  }

  async refreshSessions() {
    if (!this.sessionsList) return;

    try {
      const res = await fetch("/api/v1/interview/sessions", { method: "GET" });
      if (!res.ok) throw new Error();

      const data = await res.json().catch(() => null);
      const sessions = data?.sessions || data || [];

      this.sessionsList.innerHTML = "";

      if (!Array.isArray(sessions) || sessions.length === 0) {
        this.sessionsList.innerHTML =
          '<div class="sessionsEmpty" data-empty="1">No sessions yet. Create one or click Refresh.</div>';
        return;
      }

      for (const s of sessions) {
        const id = s.id || s.sessionId;
        const title = s.title || "Untitled";

        const item = document.createElement("div");
        item.className = "sessionItem";

        const meta = document.createElement("div");
        meta.className = "sessionMeta";

        const t = document.createElement("div");
        t.className = "sessionTitle";
        t.textContent = title;

        const sub = document.createElement("div");
        sub.className = "sessionSub";
        sub.textContent = id ? String(id) : "";

        meta.appendChild(t);
        meta.appendChild(sub);

        const actions = document.createElement("div");
        actions.className = "sessionActions";

        const resumeBtn = document.createElement("button");
        resumeBtn.className = "sessionResumeBtn";
        resumeBtn.textContent = "Resume";
        resumeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (id) this.resumeSession(String(id));
        });

        const delBtn = document.createElement("button");
        delBtn.className = "sessionDelBtn";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!id) return;
          await fetch(`/api/v1/interview/sessions/${id}`, { method: "DELETE" });
          if (String(this.sessionId || "") === String(id)) {
            this.resetSessionLocal(true);
            this.clearChat();
          }
          await this.refreshSessions();
        });

        actions.appendChild(resumeBtn);
        actions.appendChild(delBtn);

        item.appendChild(meta);
        item.appendChild(actions);

        item.addEventListener("click", () => {
          if (id) this.resumeSession(String(id));
        });

        this.sessionsList.appendChild(item);
      }
    } catch {
      this.sessionsList.innerHTML =
        '<div class="sessionsEmpty" data-empty="1">Failed to load sessions. Click Refresh.</div>';
    }
  }

  async hydrateTranscript() {
    if (!this.sessionId) return;

    const candidates = [
      `/api/v1/interview/sessions/${this.sessionId}/messages`,
      `/api/v1/interview/sessions/${this.sessionId}/transcript`,
      `/api/v1/interview/sessions/${this.sessionId}?includeTranscript=true`,
    ];

    for (const url of candidates) {
      try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) continue;

        const data = await res.json().catch(() => null);
        if (!data) continue;

        const msgs = data.messages || data.transcript || data?.session?.messages || null;
        if (!Array.isArray(msgs)) continue;

        this.clearChat();

        let hydratedSystem = false;
        for (const m of msgs) {
          const role = String(m.role || "").toLowerCase();
          const content = m.content ?? m.text ?? "";
          if (!content) continue;
          if (role === "user") this.appendMessage("You", content, false);
          else if (role === "assistant") this.appendMessage("Assistant", content, true);
        }

        return;
      } catch {}
    }
  }
}

customElements.define("interview-chat-assistant", SdInterviewChatAssistant);