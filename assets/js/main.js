/* Strategic Business Services site configuration.
 * Change owner-controlled values here. Elements that depend on empty values stay hidden.
 */
const SBS_CONFIG = {
  entryOffer: {
    mode: "complimentary", // "complimentary" | "fee" | "off"
    fee: ""
  },
  contact: {
    phone: "",
    phoneHref: "",
    email: "",
    hours: ""
  },
  analytics: {
    ga4MeasurementId: ""
  },
  consentBanner: {
    enabled: false
  },
  endpoints: {
    leadFormEndpoint: "",
    schedulerEmbedUrl: ""
  },
  routing: {
    notFitRevenue: "Under $500K",
    customScopeRevenue: "Over $5M",
    notFitTransactions: "Under 50",
    customScopeTransactions: "Over 1,000",
    customScopeEntities: "3 or more"
  }
};

window.SBS_CONFIG = SBS_CONFIG;

(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;

  function bindText(key, value) {
    doc.querySelectorAll('[data-bind="' + key + '"]').forEach((el) => {
      if (value) {
        el.textContent = value;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  }

  function bindHref(key, value, href) {
    doc.querySelectorAll('[data-bind="' + key + '"]').forEach((el) => {
      if (value && href) {
        el.textContent = value;
        el.setAttribute("href", href);
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  }

  function applyConfig() {
    const offer = SBS_CONFIG.entryOffer;
    let offerText = "";

    if (offer.mode === "complimentary") {
      offerText = "Complimentary";
    } else if (offer.mode === "fee" && offer.fee) {
      offerText = "$" + offer.fee;
    }

    bindText("entryOffer", offerText);
    bindHref("phone", SBS_CONFIG.contact.phone, SBS_CONFIG.contact.phoneHref);
    bindHref(
      "email",
      SBS_CONFIG.contact.email,
      SBS_CONFIG.contact.email ? "mailto:" + SBS_CONFIG.contact.email : ""
    );
    bindText("hours", SBS_CONFIG.contact.hours);

    const mobileCall = doc.querySelector("[data-mobile-call]");
    const mobileBook = doc.querySelector("[data-mobile-book]");
    if (mobileCall && mobileBook) {
      if (SBS_CONFIG.contact.phone && SBS_CONFIG.contact.phoneHref) {
        mobileCall.href = SBS_CONFIG.contact.phoneHref;
        mobileCall.hidden = false;
        mobileBook.classList.remove("mobile-cta__button--full");
      } else {
        mobileCall.hidden = true;
        mobileBook.classList.add("mobile-cta__button--full");
      }
    }

    doc.querySelectorAll("[data-current-year]").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });

    root.classList.add("js");
  }

  function setupMenu() {
    const button = doc.querySelector("[data-menu-toggle]");
    const menu = doc.querySelector("[data-mobile-menu]");
    if (!button || !menu) return;

    const closeMenu = (returnFocus) => {
      button.setAttribute("aria-expanded", "false");
      menu.hidden = true;
      doc.body.classList.remove("menu-open");
      if (returnFocus) button.focus();
    };

    const openMenu = () => {
      button.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      doc.body.classList.add("menu-open");
      const firstLink = menu.querySelector("a");
      if (firstLink) firstLink.focus();
    };

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      if (isOpen) closeMenu(false);
      else openMenu();
    });

    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu(false);
    });

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
        closeMenu(true);
      }
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 64rem)").matches) closeMenu(false);
    });
  }

  function pushEvent(name, parameters) {
    const payload = parameters || {};
    window.dataLayer = window.dataLayer || [];

    if (typeof window.gtag === "function") {
      window.gtag("event", name, payload);
    } else if (SBS_CONFIG.analytics.ga4MeasurementId) {
      window.dataLayer.push({ event: name, ...payload });
    }
  }

  function setupTracking() {
    doc.addEventListener("click", (event) => {
      const tracked = event.target.closest("[data-track]");
      if (!tracked) return;

      const name = tracked.dataset.track;
      const parameters = {};
      if (tracked.dataset.trackLocation) {
        parameters.location = tracked.dataset.trackLocation;
      }

      pushEvent(name, parameters);

      if (tracked.matches('a[href^="tel:"]')) {
        pushEvent("phone_click", { location: tracked.dataset.trackLocation || "unknown" });
      }
    });
  }

  function setupTierSelector() {
    const group = doc.querySelector("[data-tier-tabs]");
    if (!group) return;

    const tabs = Array.from(group.querySelectorAll("[data-tier-tab]"));
    const panels = Array.from(group.querySelectorAll("[data-tier-panel]"));
    if (!tabs.length || !panels.length) return;

    function activate(tab, moveFocus) {
      const tier = tab.dataset.tierTab;

      tabs.forEach((item) => {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      });

      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tierPanel !== tier;
      });

      if (moveFocus) tab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab, false));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;

        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;

        if (nextIndex !== null) {
          event.preventDefault();
          activate(tabs[nextIndex], true);
        }
      });
    });
  }

  function loadAnalytics() {
    const measurementId = SBS_CONFIG.analytics.ga4MeasurementId;
    if (!measurementId) return;

    // Consent banner placeholder:
    // If consentBanner.enabled is true, analytics must be initialized only after
    // the visitor gives the required consent. Confirm legal requirements before launch.
    if (SBS_CONFIG.consentBanner.enabled) return;

    const script = doc.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    doc.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);
  }

  function renderProofModules() {
    const data = window.SBS_PROOF_DATA;
    if (!data) return;

    const section = doc.querySelector("[data-proof-section]");
    const target = doc.querySelector("[data-proof-content]");
    if (!section || !target) return;

    const fragments = [];

    const allowedTestimonials = Array.isArray(data.testimonials)
      ? data.testimonials.filter(
          (item) =>
            item &&
            item.permission === true &&
            item.name &&
            item.company &&
            item.quote
        )
      : [];

    if (allowedTestimonials.length) {
      const block = doc.createElement("div");
      block.className = "proof-grid";
      allowedTestimonials.forEach((item) => {
        const article = doc.createElement("article");
        article.className = "card proof-card";

        const quote = doc.createElement("blockquote");
        quote.textContent = "“" + item.quote + "”";

        const cite = doc.createElement("cite");
        cite.textContent = item.name + ", " + item.company;

        article.append(quote, cite);
        block.appendChild(article);
      });
      fragments.push(block);
    }

    if (Array.isArray(data.credentials) && data.credentials.length) {
      const list = doc.createElement("ul");
      list.className = "credential-list";
      data.credentials.filter(Boolean).forEach((credential) => {
        const item = doc.createElement("li");
        item.textContent = credential;
        list.appendChild(item);
      });
      if (list.children.length) fragments.push(list);
    }

    if (data.sampleReportPreview && data.sampleReportPreview.src) {
      const figure = doc.createElement("figure");
      figure.className = "sample-report";

      const image = doc.createElement("img");
      image.src = data.sampleReportPreview.src;
      image.alt = data.sampleReportPreview.alt || "Sample financial report preview";
      image.width = data.sampleReportPreview.width || 960;
      image.height = data.sampleReportPreview.height || 640;
      image.loading = "lazy";

      figure.appendChild(image);
      fragments.push(figure);
    }

    if (fragments.length) {
      fragments.forEach((fragment) => target.appendChild(fragment));
      section.hidden = false;
    }
  }

  applyConfig();
  setupMenu();
  setupTracking();
  setupTierSelector();
  renderProofModules();
  loadAnalytics();

  // Google Search Console: install and verify before launch.
  // Call-tracking script slot: intentionally empty until a provider is selected.
})();
