class SdHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.loadStyles();
  }

  // Use the connectedCallback lifecycle hook to fetch the template
  async connectedCallback() {
    try {
      // Fetch the external HTML file content
      const response = await fetch("./components/header/header.component.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      this.shadowRoot.innerHTML = htmlText;
      // Inject the fetched HTML content into the Shadow DOM

      // Now that the DOM is loaded, get attributes and populate content
      const activeLink = this.getAttribute("active") || "home";
      this.resetActiveLinkSelection(activeLink);

      this.shadowRoot.querySelector("#home").addEventListener("click", () => {
        const event = new CustomEvent("sd-home-create", {
          bubbles: true, // Allows event to bubble up to the document level
          composed: true, // Allows event to pass through Shadow DOM boundaries
          detail: { targetId: this.id }, // Pass data up to the parent controller
        });
        this.dispatchEvent(event);
      });
      this.shadowRoot
        .querySelector("#sd-tutor")
        .addEventListener("click", () => {
          const event = new CustomEvent("sd-coach-create", {
            bubbles: true, // Allows event to bubble up to the document level
            composed: true, // Allows event to pass through Shadow DOM boundaries
            detail: { targetId: this.id }, // Pass data up to the parent controller
          });
          this.dispatchEvent(event);
        });
      this.shadowRoot
        .querySelector("#coding-tutor")
        .addEventListener("click", () => {
          const event = new CustomEvent("coding-tutor-create", {
            bubbles: true,
            composed: true,
          });
          this.dispatchEvent(event);
        });
      this.shadowRoot
        .querySelector("#resume-assistant")
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

  resetActiveLinkSelection(activeLink) {
    const navItems = this.shadowRoot.getElementById("navItems");
    this.resetNavItems(navItems);
    this.selectNavItems(navItems, activeLink);
  }

  resetNavItems(navItems) {
    if (!navItems) return;

    for (let child of navItems.children) {
      if (child.classList.contains("active")) {
        child.classList.remove("active");
      }
    }
  }

  selectNavItems(navItems, id) {
    if (!navItems) return;

    for (let child of navItems.children) {
      if (child.id === id) {
        child.classList.add("active");
      }
    }
  }
}

customElements.define("sd-header", SdHeader);
