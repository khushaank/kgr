// nav-algorithm.js - Advanced Navigation Tracking & History
// Uses MutationObserver to handle dynamic content (SPA-like behavior)

(function () {
  const ALGORITHM_CONFIG = {
    paramName: "ref",
    historyTable: "nav_history",
  };

  function getCurrentRef() {
    const path = window.location.pathname;
    if (path.includes("contributions")) return "contribution";
    if (path.includes("settings")) return "setting";
    if (path.includes("view")) return "viewer";
    if (path.includes("create")) return "editor";
    return "home";
  }

  function processLinks(root = document) {
    const currentRef = getCurrentRef();
    const links = root.querySelectorAll("a");

    links.forEach((link) => {
      // Prevent double-processing
      if (link.dataset.navProcessed) return;

      const href = link.getAttribute("href");
      if (
        href &&
        !href.startsWith("http") &&
        !href.startsWith("#") &&
        !href.startsWith("javascript:") &&
        !href.includes(`ref=`)
      ) {
        const separator = href.includes("?") ? "&" : "?";
        link.setAttribute(
          "href",
          `${href}${separator}${ALGORITHM_CONFIG.paramName}=${currentRef}`
        );
        link.dataset.navProcessed = "true";
      }
    });
  }

  async function logNavigation() {
    const client = window.supabaseClient;
    if (!client) return; // Silent fail if no auth

    try {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (user) {
        await client.from(ALGORITHM_CONFIG.historyTable).insert([
          {
            user_id: user.id,
            page: getCurrentRef(),
            timestamp: new Date().toISOString(),
            url: window.location.href,
          },
        ]);
      }
    } catch {
      // Ignore logging errors
    }
  }

  // Initialization
  document.addEventListener("DOMContentLoaded", () => {
    // 1. Log current visit
    logNavigation();

    // 2. Initial link processing
    processLinks();

    // 3. Setup MutationObserver for dynamic content (like contribution cards)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          processLinks(mutation.target);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
})();
