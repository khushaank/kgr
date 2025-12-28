/**
 * nav-algorithm.js
 * Automatically appends 'ref' parameters to all internal links and saves navigation history to Supabase.
 * Fixed to use the global window.supabaseClient instance.
 */

(function () {
  document.addEventListener("DOMContentLoaded", async () => {
    // Access the shared client from window
    const client = window.supabaseClient;

    if (!client) {
      console.error(
        "nav-algorithm.js: supabaseClient not found on window. Ensure supabase-config.js loads first."
      );
      return;
    }

    // 1. Identify current page context
    const path = window.location.pathname;
    let currentRef = "home";

    if (path.includes("contributions")) currentRef = "contribution";
    if (path.includes("settings")) currentRef = "setting";
    if (path.includes("view")) currentRef = "viewer";

    // Save navigation history to Supabase
    try {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (user) {
        await client.from("nav_history").insert([
          {
            user_id: user.id,
            page: currentRef,
            timestamp: new Date().toISOString(),
            url: window.location.href,
          },
        ]);
      }
    } catch (err) {
      console.error("Navigation logging failed:", err);
    }

    // 2. Algorithm: Find all internal links and append the current context as a reference
    const links = document.querySelectorAll("a");

    links.forEach((link) => {
      const href = link.getAttribute("href");

      // Only modify internal links that aren't external (http) or anchors (#)
      if (href && !href.startsWith("http") && !href.startsWith("#")) {
        const separator = href.includes("?") ? "&" : "?";
        link.setAttribute("href", `${href}${separator}ref=${currentRef}`);
      }
    });

    console.log(`Navigation Tracking Initialized: Source = ${currentRef}`);
  });
})();
