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

    const contactConfigured = Boolean(SBS_CONFIG.contact.email || SBS_CONFIG.contact.phone);
    doc.querySelectorAll("[data-contact-block]").forEach((el) => {
      el.hidden = !contactConfigured;
    });

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

  function setupNavDropdowns() {
    const dropdowns = Array.from(doc.querySelectorAll(".nav-dropdown"));
    if (!dropdowns.length) return;

    dropdowns.forEach((dropdown) => {
      dropdown.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          dropdown.removeAttribute("open");
          dropdown.querySelector("summary")?.focus();
        }
      });
    });

    doc.addEventListener("click", (event) => {
      dropdowns.forEach((dropdown) => {
        if (!dropdown.contains(event.target)) dropdown.removeAttribute("open");
      });
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

  function renderTeamMembers() {
    const data = window.SBS_PROOF_DATA;
    const grid = doc.querySelector("[data-team-grid]");
    const note = doc.querySelector("[data-team-note]");
    if (!data || !grid || !note || !Array.isArray(data.teamMembers)) return;

    const members = data.teamMembers.filter((member) =>
      member &&
      member.headshot &&
      member.name &&
      member.role &&
      member.bio &&
      member.credentials
    );

    if (!members.length) return;

    members.forEach((member) => {
      const article = doc.createElement("article");
      article.className = "card team-card";

      const image = doc.createElement("img");
      image.src = member.headshot;
      image.alt = member.name + ", " + member.role;
      image.width = 640;
      image.height = 640;
      image.loading = "lazy";

      const body = doc.createElement("div");
      body.className = "team-card__body";

      const name = doc.createElement("h2");
      name.textContent = member.name;

      const role = doc.createElement("p");
      role.className = "team-card__role";
      role.textContent = member.role;

      const bio = doc.createElement("p");
      bio.className = "team-card__bio";
      bio.textContent = member.bio;

      body.append(name, role, bio);

      const credentials = Array.isArray(member.credentials)
        ? member.credentials.filter(Boolean)
        : [member.credentials].filter(Boolean);

      if (credentials.length) {
        const list = doc.createElement("ul");
        list.className = "team-card__credentials";
        credentials.forEach((credential) => {
          const item = doc.createElement("li");
          item.textContent = credential;
          list.appendChild(item);
        });
        body.appendChild(list);
      }

      article.append(image, body);
      grid.appendChild(article);
    });

    grid.hidden = false;
    note.hidden = true;
  }

  function setupConditionalFields() {
    const businessOther = doc.querySelector("[data-business-other]");
    const businessOtherInput = businessOther ? businessOther.querySelector("input") : null;
    const businessRadios = Array.from(doc.querySelectorAll('input[name="business_type"]'));

    function syncBusinessOther() {
      if (!businessOther || !businessOtherInput) return;
      const selected = businessRadios.find((radio) => radio.checked);
      const show = Boolean(selected && selected.value === "Other");
      businessOther.hidden = !show;
      businessOtherInput.required = show;
      if (!show) businessOtherInput.value = "";
    }

    businessRadios.forEach((radio) => radio.addEventListener("change", syncBusinessOther));
    syncBusinessOther();

    const channelOtherToggle = doc.querySelector("[data-channel-other-toggle]");
    const channelOther = doc.querySelector("[data-channel-other]");
    const channelOtherInput = channelOther ? channelOther.querySelector("input") : null;

    function syncChannelOther() {
      if (!channelOtherToggle || !channelOther || !channelOtherInput) return;
      const show = channelOtherToggle.checked;
      channelOther.hidden = !show;
      channelOtherInput.required = show;
      if (!show) channelOtherInput.value = "";
    }

    if (channelOtherToggle) channelOtherToggle.addEventListener("change", syncChannelOther);
    syncChannelOther();
  }

  function getFormPayload(form) {
    const formData = new FormData(form);
    const payload = {};

    for (const [key, value] of formData.entries()) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        payload[key] = Array.isArray(payload[key])
          ? payload[key].concat(value)
          : [payload[key], value];
      } else {
        payload[key] = value;
      }
    }

    return payload;
  }

  function populateAttributionFields(form) {
    const params = new URLSearchParams(window.location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = params.get(key) || "";
    });

    const landingPage = form.elements.namedItem("landing_page");
    const referrer = form.elements.namedItem("referrer");
    const topic = form.elements.namedItem("topic");

    if (landingPage) landingPage.value = window.location.href;
    if (referrer) referrer.value = doc.referrer || "";
    if (topic) topic.value = params.get("topic") || "";
  }

  function setFieldError(field, message) {
    if (!field) return;
    field.setAttribute("aria-invalid", message ? "true" : "false");

    const describedBy = field.getAttribute("aria-describedby");
    if (!describedBy) return;

    const error = doc.getElementById(describedBy);
    if (error) error.textContent = message || "";
  }

  function clearFieldError(field) {
    setFieldError(field, "");
  }

  function setupInlineValidation(form) {
    form.addEventListener("invalid", (event) => {
      const field = event.target;
      let message = "Please complete this field.";

      if (field.type === "email" && field.validity.typeMismatch) {
        message = "Enter a valid email address.";
      } else if (field.type === "url" && field.validity.typeMismatch) {
        message = "Enter a valid website address.";
      }

      if (field.name === "business_type") {
        const error = doc.getElementById("business-type-error");
        if (error) error.textContent = message;
      } else {
        setFieldError(field, message);
      }
    }, true);

    form.addEventListener("input", (event) => {
      if (event.target.matches("input, select, textarea")) clearFieldError(event.target);
    });

    form.addEventListener("change", (event) => {
      if (event.target.matches("input, select, textarea")) clearFieldError(event.target);
      if (event.target.name === "business_type") {
        const error = doc.getElementById("business-type-error");
        if (error) error.textContent = "";
      }
    });
  }

  function getRoutingResult(form) {
    const revenue = form.elements.namedItem("annual_revenue_range").value;
    const businessTypeField = form.querySelector('input[name="business_type"]:checked');
    const businessType = businessTypeField ? businessTypeField.value : "";
    const transactions = form.elements.namedItem("monthly_transactions").value;
    const entities = form.elements.namedItem("legal_entities").value;
    const channelCount = form.querySelectorAll('input[name="sales_channels"]:checked').length;

    if (
      revenue === SBS_CONFIG.routing.notFitRevenue ||
      businessType === "Other" ||
      transactions === SBS_CONFIG.routing.notFitTransactions
    ) {
      return { outcome: "not_a_fit", tier: "" };
    }

    if (
      revenue === SBS_CONFIG.routing.customScopeRevenue ||
      entities === SBS_CONFIG.routing.customScopeEntities ||
      transactions === SBS_CONFIG.routing.customScopeTransactions
    ) {
      return { outcome: "custom_scope", tier: "" };
    }

    const transactionCeilings = {
      "50–100": 100,
      "100–250": 250,
      "250–500": 500,
      "500–1,000": 1000
    };
    const transactionCeiling = transactionCeilings[transactions] || Number.POSITIVE_INFINITY;

    let tier = "Platinum";
    if (transactionCeiling <= 100 && entities === "1" && channelCount <= 1) {
      tier = "Silver";
    } else if (transactionCeiling <= 250 && entities === "1" && channelCount <= 2) {
      tier = "Gold";
    }

    return { outcome: "in_profile", tier };
  }

  function renderScheduler(shell, outcome, tier) {
    if (!shell) return;

    const title = shell.querySelector("[data-scheduler-title]");
    const message = shell.querySelector("[data-scheduler-message]");
    const embed = shell.querySelector("[data-scheduler-embed]");

    if (outcome === "custom_scope") {
      if (title) title.textContent = "Choose a time to talk through a custom scope";
      if (message) message.textContent = "Your business may need a custom scope. Choose a time and we'll walk through it.";
    } else {
      if (title) title.textContent = "Choose a time for your review";
      if (message) {
        message.textContent = "Based on what you shared, " + tier + " looks like the likely fit. We confirm your plan and price in writing after your review.";
      }
    }

    if (embed) {
      embed.replaceChildren();

      if (SBS_CONFIG.endpoints.schedulerEmbedUrl) {
        const frame = doc.createElement("iframe");
        frame.src = SBS_CONFIG.endpoints.schedulerEmbedUrl;
        frame.title = "Schedule your Month-End Close Review";
        frame.width = "960";
        frame.height = "576";
        frame.loading = "lazy";
        embed.appendChild(frame);
      } else {
        const fallback = doc.createElement("p");
        fallback.className = "scheduler-fallback";
        fallback.textContent = "Thank you. We'll be in touch to schedule your review.";
        embed.appendChild(fallback);
      }
    }

    shell.hidden = false;
  }

  function setupSchedulerMessageListener() {
    window.addEventListener("message", (event) => {
      if (!SBS_CONFIG.endpoints.schedulerEmbedUrl) return;

      let expectedOrigin = "";
      try {
        expectedOrigin = new URL(SBS_CONFIG.endpoints.schedulerEmbedUrl).origin;
      } catch (error) {
        return;
      }

      if (event.origin !== expectedOrigin) return;

      /*
       * Scheduling provider integration stub:
       * Replace this event-shape check with the selected provider's documented
       * confirmed-booking event. Do not fire on form submission.
       */
      const confirmed = event.data && event.data.type === "booking_confirmed";
      if (!confirmed) return;

      sessionStorage.setItem("sbs_booking_confirmed", "true");
      pushEvent("booking_confirmed", {
        routing_outcome: sessionStorage.getItem("sbs_routing_outcome") || ""
      });
      window.location.assign("/thank-you/");
    });
  }

  function setupLeadForm() {
    const form = doc.querySelector("[data-lead-form]");
    if (!form) return;

    populateAttributionFields(form);
    setupInlineValidation(form);

    if (SBS_CONFIG.endpoints.leadFormEndpoint) {
      form.action = SBS_CONFIG.endpoints.leadFormEndpoint;
    }

    let formStarted = false;
    const markStarted = () => {
      if (formStarted) return;
      formStarted = true;
      pushEvent("form_start", { location: "book" });
    };

    form.addEventListener("focusin", markStarted);
    form.addEventListener("input", markStarted);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const status = form.querySelector("[data-form-status]");
      const honeypot = form.elements.namedItem("website_confirm");

      if (honeypot && honeypot.value) {
        if (status) status.textContent = "";
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        const invalid = form.querySelector(":invalid");
        if (invalid) invalid.focus();
        return;
      }

      const result = getRoutingResult(form);
      form.elements.namedItem("routing_outcome").value = result.outcome;
      form.elements.namedItem("suggested_tier").value = result.tier;

      sessionStorage.setItem("sbs_routing_outcome", result.outcome);
      sessionStorage.setItem("sbs_suggested_tier", result.tier);
      sessionStorage.removeItem("sbs_booking_confirmed");
      sessionStorage.removeItem("sbs_generate_lead_fired");
      sessionStorage.removeItem("sbs_qualified_submission_fired");

      pushEvent("form_submit", { routing_outcome: result.outcome });

      const payload = getFormPayload(form);

      if (SBS_CONFIG.endpoints.leadFormEndpoint) {
        if (status) status.textContent = "Submitting your information.";

        try {
          const response = await fetch(SBS_CONFIG.endpoints.leadFormEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true
          });

          if (!response.ok) throw new Error("Submission failed");
        } catch (error) {
          if (status) status.textContent = "We couldn't submit your information. Please try again.";
          return;
        }
      }

      if (status) status.textContent = "";

      if (result.outcome === "not_a_fit") {
        window.location.assign("/not-a-fit/");
        return;
      }

      const shell = doc.querySelector("[data-scheduler-shell]");
      renderScheduler(shell, result.outcome, result.tier);
      shell?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function setupOutcomePages() {
    const page = doc.body.dataset.page || "";

    if (page === "not-a-fit") {
      pushEvent("not_a_fit_submission", {
        routing_outcome: sessionStorage.getItem("sbs_routing_outcome") || "not_a_fit"
      });
      return;
    }

    if (page !== "thank-you") return;

    const outcome = sessionStorage.getItem("sbs_routing_outcome") || "";
    const tier = sessionStorage.getItem("sbs_suggested_tier") || "";
    const qualified = outcome === "in_profile" || outcome === "custom_scope";

    if (!qualified) return;

    if (!sessionStorage.getItem("sbs_generate_lead_fired")) {
      pushEvent("generate_lead", { routing_outcome: outcome, suggested_tier: tier });
      sessionStorage.setItem("sbs_generate_lead_fired", "true");
    }

    if (!sessionStorage.getItem("sbs_qualified_submission_fired")) {
      pushEvent("qualified_submission", { routing_outcome: outcome, suggested_tier: tier });
      sessionStorage.setItem("sbs_qualified_submission_fired", "true");
    }

    if (sessionStorage.getItem("sbs_booking_confirmed") !== "true") {
      const section = doc.querySelector("[data-thank-you-scheduler-section]");
      const shell = doc.querySelector("[data-scheduler-shell]");
      if (section) section.hidden = false;
      renderScheduler(shell, outcome, tier);
    }
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
  setupNavDropdowns();
  setupTierSelector();
  setupConditionalFields();
  setupLeadForm();
  setupSchedulerMessageListener();
  setupOutcomePages();
  renderProofModules();
  renderTeamMembers();
  loadAnalytics();

  // Google Search Console: install and verify before launch.
  // Call-tracking script slot: intentionally empty until a provider is selected.
})();
