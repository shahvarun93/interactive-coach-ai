class Home extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.loadStyles();
  }

  // Use the connectedCallback lifecycle hook to fetch the template
  async connectedCallback() {
    try {
      // Fetch the external HTML file content
      const response = await fetch("./components/home/home.component.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      this.shadowRoot.innerHTML = htmlText;
      this.shadowRoot
        .querySelector("#open-copilot-component")
        .addEventListener("click", () => {
          const event = new CustomEvent("sd-coach-create", {
            bubbles: true, // Allows event to bubble up to the document level
            composed: true, // Allows event to pass through Shadow DOM boundaries
            detail: { targetId: this.id }, // Pass data up to the parent controller
          });
          this.dispatchEvent(event);
        });
      this.shadowRoot
        .querySelector("#open-resume-component")
        .addEventListener("click", () => {
          const event = new CustomEvent("sd-resume-create", {
            bubbles: true, // Allows event to bubble up to the document level
            composed: true, // Allows event to pass through Shadow DOM boundaries
            detail: { targetId: this.id }, // Pass data up to the parent controller
          });
          this.dispatchEvent(event);
        });
      this.shadowRoot
        .querySelector("#interview-chat-assistant")
        .addEventListener("click", () => {
          const event = new CustomEvent("interview-chat-assistant-create", {
            bubbles: true,
            composed: true,
          });
          this.dispatchEvent(event);
        });
    } catch (error) {
      console.error("Failed to load external HTML template:", error);
      this.shadowRoot.innerHTML = `<p>Error loading component template.</p>`;
    }
  }

  async loadStyles() {
    // Fetch the same CSS file used by the parent page
    const response = await fetch("/css/styles.css");
    const cssText = await response.text();

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);

    // Adopt the stylesheet in the Shadow DOM
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }
}

customElements.define("sd-home", Home);
