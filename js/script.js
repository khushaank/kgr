/**
 * script.js - KGR Archive Core
 */
// Safety check: grab the client from window
const supabaseClient = window.supabaseClient;

if (!supabaseClient) {
  console.error("Supabase Client is missing! Check script order in HTML.");
}

// Helper: Format view count like YouTube (1K, 1M, etc.)
function formatViewCount(views) {
  const num = Number(views) || 0;
  if (num >= 1000000) {
    return (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + "K";
  }
  return num.toString();
}

// Helper: Relative time like YouTube ("1 hour ago", "2 days ago")
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffYear >= 1)
    return diffYear === 1 ? "1 year ago" : `${diffYear} years ago`;
  if (diffMonth >= 1)
    return diffMonth === 1 ? "1 month ago" : `${diffMonth} months ago`;
  if (diffWeek >= 1)
    return diffWeek === 1 ? "1 week ago" : `${diffWeek} weeks ago`;
  if (diffDay >= 1) return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;
  if (diffHour >= 1)
    return diffHour === 1 ? "1 hour ago" : `${diffHour} hours ago`;
  if (diffMin >= 1)
    return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;
  return "Just now";
}

let allBlogs = [];

// 1. Auth State Listener
supabaseClient.auth.onAuthStateChange((event, session) => {
  updateUI();
  if (event === "SIGNED_IN") {
    fetchBlogs();
  }
});

// 2. Fragment Loading (Header & Footer)
async function loadFragments() {
  const headerHook = document.getElementById("header-hook");
  const footerHook = document.getElementById("footer-hook");

  if (headerHook) {
    try {
      const response = await fetch("header.html");
      const htmlContent = await response.text();
      headerHook.innerHTML = htmlContent;

      // Initialize interactive components after header injection
      setupSearch();
      setupVoiceSearch();
      initHamburger();
      setupMobileSearch();
      setupSearchSuggestions();
      // Initialize Notification System
      setTimeout(() => {
        if (window.NotificationSystem) window.NotificationSystem.init();
      }, 100);
      updateUI();
    } catch (err) {
      console.error("Failed to load header:", err);
    }
  }

  if (footerHook) {
    try {
      const response = await fetch("footer.html");
      footerHook.innerHTML = await response.text();
      setupBackToTop();
    } catch (err) {
      console.error("Failed to load footer:", err);
    }
  }
}

// 4. Data Fetching & Rendering
async function fetchBlogs() {
  const blogContainer = document.getElementById("blog-container");
  if (!blogContainer) return;

  const { data, error } = await supabaseClient
    .from("blogs")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching blogs:", error);
    return;
  }

  allBlogs = data;

  // Get user interests for personalization
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  let interests = [];
  if (user) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("interests")
      .eq("id", user.id)
      .single();
    interests = profile?.interests || [];
  }

  // Fetch author profiles
  const userIds = [
    ...new Set(data.map((blog) => blog.user_id).filter((id) => id)),
  ];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabaseClient
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", userIds);
    profiles.forEach((p) => (profilesMap[p.id] = p));
  }

  // Sort blogs: those matching interests first
  const sortedBlogs = data.sort((a, b) => {
    const aMatch = interests.some((i) => a.tags?.includes(i));
    const bMatch = interests.some((i) => b.tags?.includes(i));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0; // Keep original order if both match or neither
  });

  renderBlogs(sortedBlogs, profilesMap);
}

function renderBlogs(blogs, profilesMap = {}) {
  const blogContainer = document.getElementById("blog-container");
  if (!blogContainer) return;

  blogContainer.innerHTML = "";

  if (blogs.length === 0) {
    blogContainer.innerHTML =
      '<p class="loader">No published records found.</p>';
    return;
  }

  // Get hidden blogs from localStorage
  const hiddenBlogs = JSON.parse(localStorage.getItem("hiddenBlogs") || "[]");

  blogs.forEach((blog) => {
    if (hiddenBlogs.includes(blog.id)) return; // Skip hidden blogs

    const imgSrc = blog.image_url
      ? blog.image_url
      : `https://picsum.photos/seed/${blog.id}/320/180`;
    const profile = profilesMap[blog.user_id];
    const authorName = profile?.full_name || blog.author || "Unknown";
    const avatarUrl =
      profile?.avatar_url ||
      `https://ui-avatars.com/api/?name=${authorName}&background=random&color=fff`;
    const formattedViews = formatViewCount(blog.views);
    const relativeTime = formatRelativeTime(blog.created_at);

    const card = document.createElement("div");
    card.className = "yt-card";
    card.innerHTML = `
            <div class="yt-thumbnail">
                <img src="${imgSrc}" alt="Thumbnail" onerror="this.onerror=null;this.src='images/placeholder-landscape.svg';">
            </div>
            <div class="yt-card-info">
                <div class="yt-author-avatar">
                    <img src="${avatarUrl}" alt="Avatar" class="yt-author-avatar-img" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=User&background=random&color=fff';">
                </div>
                <div class="yt-details">
                    <div class="title-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                        <h3 class="yt-title">${blog.title}</h3>
                        <div class="menu-container" style="position: relative;">
                            <button class="menu-dots-btn" onclick="toggleCardMenu(event, '${blog.id}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="menu-${blog.id}" class="card-action-menu">
                                <button onclick="shareArticle(event, '${blog.id}')" class="menu-action">
                                    <span class="material-icons">share</span> Share
                                </button>
                                <button onclick="followArticle(event, '${blog.id}')" class="menu-action">
                                    <span class="material-icons">person_add</span> Follow
                                </button>
                                <button onclick="reportArticle(event, '${blog.id}')" class="menu-action">
                                    <span class="material-icons">flag</span> Report
                                </button>
                                <div class="menu-divider"></div>
                                <button onclick="hideArticle(event, '${blog.id}')" class="menu-action">
                                    <span class="material-icons">visibility_off</span> Hide
                                </button>
                            </div>
                        </div>
                    </div>
                    <p class="yt-meta-author">${authorName}</p>
                    <p class="yt-meta-stats">${formattedViews} views • ${relativeTime}</p>
                </div>
            </div>
        `;
    card.onclick = (e) => {
      if (!e.target.closest(".menu-container")) {
        window.location.href = `view.html?id=${blog.id}`;
      }
    };
    blogContainer.appendChild(card);
  });
}

// Menu functions for blog cards
function toggleCardMenu(event, id) {
  event.stopPropagation();
  const targetMenu = document.getElementById(`menu-${id}`);
  const allMenus = document.querySelectorAll(".card-action-menu");

  const isAlreadyOpen = targetMenu.classList.contains("show");
  allMenus.forEach((m) => m.classList.remove("show"));

  if (!isAlreadyOpen) {
    targetMenu.classList.add("show");
  }
}

function shareArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  const url = `${window.location.origin}/view.html?id=${id}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Link copied to clipboard!");
  });
}

function reportArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  // Close menu
  document
    .querySelectorAll(".card-action-menu")
    .forEach((m) => m.classList.remove("show"));

  // Show report modal
  let modal = document.getElementById("report-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "report-modal";
    modal.className = "ai-modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="ai-modal-content">
      <header class="ai-modal-header">
        <span class="material-icons" style="color: #ff9800">flag</span>
        <h3>Report Article</h3>
        <span class="material-icons close-modal" onclick="closeReportModal()">close</span>
      </header>
      <div class="ai-modal-body">
        <p>Why are you reporting this article?</p>
        <select id="report-reason">
          <option value="">Select a reason</option>
          <option value="spam">Spam or misleading</option>
          <option value="inappropriate">Inappropriate content</option>
          <option value="copyright">Copyright violation</option>
          <option value="other">Other</option>
        </select>
        <textarea id="report-details" placeholder="Additional details (optional)" rows="3"></textarea>
      </div>
      <div class="ai-modal-footer">
        <button class="secondary-btn" onclick="closeReportModal()">Cancel</button>
        <button class="primary-btn" onclick="submitReport('${id}')">Submit Report</button>
      </div>
    </div>`;
  modal.style.display = "flex";
}

async function hideArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();

  // Close menu
  document
    .querySelectorAll(".card-action-menu")
    .forEach((m) => m.classList.remove("show"));

  // Save to localStorage for immediate effect
  const hiddenBlogs = JSON.parse(localStorage.getItem("hiddenBlogs") || "[]");
  if (!hiddenBlogs.includes(id)) {
    hiddenBlogs.push(id);
    localStorage.setItem("hiddenBlogs", JSON.stringify(hiddenBlogs));
  }

  // Save to database if user is logged in
  if (window.currentUser) {
    try {
      // Get current hidden_blogs array from profile
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("hidden_blogs")
        .eq("id", window.currentUser.id)
        .single();

      const currentHidden = profile?.hidden_blogs || [];
      if (!currentHidden.includes(id)) {
        currentHidden.push(id);
        await supabaseClient
          .from("profiles")
          .update({ hidden_blogs: currentHidden })
          .eq("id", window.currentUser.id);
      }
    } catch (err) {
      console.log(
        "Could not save to profile, using localStorage:",
        err.message
      );
    }
  }

  showToast("Article hidden from your feed", "success");
  fetchBlogs();
}

async function followArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();

  // Close menu
  document
    .querySelectorAll(".card-action-menu")
    .forEach((m) => m.classList.remove("show"));

  if (!window.currentUser) {
    showToast("Sign in to follow authors", "info");
    return;
  }

  // Find the article to get author info
  const article = allBlogs.find((b) => b.id === id);
  if (!article || !article.user_id) {
    showToast("Could not follow author", "error");
    return;
  }

  try {
    // Get current followed_users array from profile
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("followed_users")
      .eq("id", window.currentUser.id)
      .single();

    const currentFollowed = profile?.followed_users || [];
    if (currentFollowed.includes(article.user_id)) {
      showToast("Already following this author", "info");
      return;
    }

    currentFollowed.push(article.user_id);
    await supabaseClient
      .from("profiles")
      .update({ followed_users: currentFollowed })
      .eq("id", window.currentUser.id);

    showToast("Following " + (article.author || "author") + "!", "success");
  } catch (err) {
    console.error("Follow error:", err);
    showToast("Could not follow author", "error");
  }
}

function closeReportModal() {
  const modal = document.getElementById("report-modal");
  if (modal) modal.style.display = "none";
}

async function submitReport(id) {
  const reason = document.getElementById("report-reason").value;
  const details = document.getElementById("report-details").value;

  if (!reason) {
    showToast("Please select a reason for reporting", "error");
    return;
  }

  try {
    // Try to save report to database
    if (window.currentUser) {
      await supabaseClient.from("reports").insert([
        {
          blog_id: id,
          user_id: window.currentUser.id,
          reason: reason,
          details: details,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (err) {
    // Reports table might not exist, that's okay
    console.log("Report logged locally:", { id, reason, details });
  }

  closeReportModal();
  showToast(
    "Report submitted. Thank you for helping keep KGR Archive safe.",
    "success"
  );
}

// Toast notification system
function showToast(message, type = "info") {
  // Remove existing toast
  const existingToast = document.querySelector(".kgr-toast");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.className = `kgr-toast kgr-toast-${type}`;

  const icons = {
    success: "check_circle",
    error: "error",
    info: "info",
    warning: "warning",
  };

  toast.innerHTML = `
    <span class="material-icons">${icons[type] || "info"}</span>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Close menus when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-container")) {
    document
      .querySelectorAll(".card-action-menu")
      .forEach((m) => m.classList.remove("show"));
  }
});

// 5. YouTube-Style Search Logic
function setupSearch() {
  const searchBar = document.getElementById("search-bar");
  const searchBtn = document.getElementById("search-btn");
  const suggestionsBox = document.getElementById("search-suggestions");

  if (!searchBar) return;

  searchBar.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      performSearch(searchBar.value);
    }
  });

  if (searchBtn) {
    searchBtn.onclick = () => performSearch(searchBar.value);
  }

  searchBar.oninput = (e) => {
    const term = e.target.value.toLowerCase().replace("#", "");
    if (term.length > 0) {
      showSuggestions(term);
    } else {
      if (suggestionsBox) suggestionsBox.style.display = "none";
      renderBlogs(allBlogs);
    }
  };
}

function showSuggestions(term) {
  const suggestionsBox = document.getElementById("search-suggestions");
  const searchBar = document.getElementById("search-bar");
  if (!suggestionsBox) return;

  suggestionsBox.innerHTML = "";
  suggestionsBox.style.display = "block";

  // Add sign-in prompt for non-signed users
  if (!window.currentUser) {
    const signInItem = document.createElement("div");
    signInItem.className = "suggestion-item sign-in-prompt";
    signInItem.innerHTML = `<span class="material-icons">login</span> Sign in for personalized search`;
    signInItem.onclick = () => (window.location.href = "auth.html");
    suggestionsBox.appendChild(signInItem);
  }

  if (term.length > 3) {
    const askItem = document.createElement("div");
    askItem.className = "suggestion-item ai-ask";
    askItem.innerHTML = `<span class="material-icons">auto_awesome</span> Ask KGR AI: "${term}..."`;
    askItem.onclick = () => askKGR_AI(term);
    suggestionsBox.appendChild(askItem);
  }

  const matches = allBlogs
    .filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        (b.tags && b.tags.some((t) => t.toLowerCase().includes(term)))
    )
    .slice(0, 8);

  matches.forEach((match) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `<span class="material-icons">search</span> ${match.title}`;
    item.onclick = () => {
      searchBar.value = match.title;
      performSearch(match.title);
    };
    suggestionsBox.appendChild(item);
  });

  if (suggestionsBox.children.length === 0) {
    suggestionsBox.style.display = "none";
  }
}

function performSearch(term) {
  const suggestionsBox = document.getElementById("search-suggestions");
  if (suggestionsBox) suggestionsBox.style.display = "none";

  const cleanTerm = term.toLowerCase().replace("#", "");
  const filtered = allBlogs.filter((b) => {
    const matchesTitle = b.title.toLowerCase().includes(cleanTerm);
    const matchesTags =
      b.tags && b.tags.some((tag) => tag.toLowerCase().includes(cleanTerm));
    return matchesTitle || matchesTags;
  });

  renderBlogs(filtered);
}

// 6. AI "Search to Ask" Logic
async function askKGR_AI(query) {
  const suggestionsBox = document.getElementById("search-suggestions");
  if (suggestionsBox) suggestionsBox.style.display = "none";

  const cleanQuery = query.toLowerCase();
  const contextMatches = allBlogs.filter(
    (b) =>
      b.title.toLowerCase().includes(cleanQuery) ||
      b.content.toLowerCase().includes(cleanQuery) ||
      (b.tags && b.tags.some((t) => t.toLowerCase().includes(cleanQuery)))
  );

  if (contextMatches.length === 0) {
    showAIModal(
      "I couldn't find any specific data in the KGR Archive to answer that question accurately."
    );
    return;
  }

  const topContext = contextMatches.slice(0, 3);
  let summary = `Based on current KGR database records:\n\n`;

  topContext.forEach((match, index) => {
    const snippet = match.content.substring(0, 150) + "...";
    summary += `${index + 1}. ${match.title}: ${snippet}\n\n`;
  });

  summary += `\nWould you like me to open these specific papers for deeper analysis?`;
  showAIModal(summary, topContext);
}

function showAIModal(text, matches = []) {
  let modal = document.getElementById("ai-response-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "ai-response-modal";
    modal.className = "ai-modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
        <div class="ai-modal-content">
            <header class="ai-modal-header">
                <span class="material-icons ai-sparkle">auto_awesome</span>
                <h3>KGR Research Assistant</h3>
                <span class="material-icons close-modal" onclick="this.closest('.ai-modal').style.display='none'">close</span>
            </header>
            <div class="ai-modal-body">
                <p style="white-space: pre-wrap;">${text}</p>
            </div>
            ${
              matches.length > 0
                ? `
                <div class="ai-modal-footer">
                    <button class="primary-btn" onclick="renderBlogs(allBlogs.filter(b => ${JSON.stringify(
                      matches.map((m) => m.id)
                    )}.includes(b.id))); document.getElementById('ai-response-modal').style.display='none';">
                        View Cited Papers
                    </button>
                </div>
            `
                : ""
            }
        </div>
    `;
  modal.style.display = "flex";
}

// 7. Voice, Hamburger & Mobile Search Logic
function setupVoiceSearch() {
  const voiceBtn = document.getElementById("voice-ask-btn");
  const searchBar = document.getElementById("search-bar");
  if (!voiceBtn) return;

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";

  voiceBtn.onclick = (e) => {
    e.preventDefault();
    voiceBtn.style.color = "#ff4d4d";
    recognition.start();
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    searchBar.value = transcript;
    performSearch(transcript);
  };

  recognition.onend = () => {
    voiceBtn.style.color = "white";
  };
}

function initHamburger() {
  const burger = document.getElementById("hamburger-menu");
  const drawer = document.getElementById("side-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!burger) return;

  burger.onclick = (e) => {
    e.stopPropagation();
    drawer.classList.toggle("open");
    overlay.classList.toggle("show");
  };

  document.addEventListener("click", (e) => {
    if (drawer && !drawer.contains(e.target) && !burger.contains(e.target)) {
      drawer.classList.remove("open");
      overlay.classList.remove("show");
    }
  });
}

// script.js - Refined Mobile Search Logic
function setupMobileSearch() {
  const triggerBtn = document.getElementById("mobile-search-trigger");
  const backBtn = document.getElementById("mobile-search-back");
  const searchBar = document.getElementById("search-bar");

  if (triggerBtn && backBtn) {
    triggerBtn.addEventListener("click", () => {
      // Enter search mode
      document.body.classList.add("mobile-search-active");

      // Force focus so the keyboard pops up immediately
      setTimeout(() => {
        searchBar.focus();
      }, 150);
    });

    backBtn.addEventListener("click", () => {
      // Exit search mode and restore hamburger/logo
      document.body.classList.remove("mobile-search-active");
      searchBar.value = "";
      renderBlogs(allBlogs);

      const suggestionsBox = document.getElementById("search-suggestions");
      if (suggestionsBox) suggestionsBox.style.display = "none";
    });
  }
}

/**
 * updateUI - Synchronizes the header and identity elements across the archive.
 * Standardizes the fallback logic for avatars to ensure Google images appear correctly.
 */
async function updateUI() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  window.currentUser = user;

  const addBtn = document.getElementById("add-btn");
  const profileBtn = document.getElementById("profile-btn");
  const greetingText = document.getElementById("greeting-text");
  const drawerSettings = document.getElementById("drawer-settings");

  if (user) {
    // 1. Attempt to fetch the researcher's database profile
    let { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // 2. Silent Auto-create: Ensure Google researchers always have a profile entry
    if (!profile && user.app_metadata.provider === "google") {
      const { data: newProfile } = await supabaseClient
        .from("profiles")
        .insert([
          {
            id: user.id,
            full_name: user.user_metadata.full_name,
            username:
              user.email.split("@")[0].toLowerCase() +
              Math.floor(Math.random() * 1000),
            email: user.email,
            avatar_url: user.user_metadata.avatar_url, // Capture Google image on first link
          },
        ])
        .select()
        .single();
      profile = newProfile;
    }

    // 3. THE FIX: Standardized Identity Fallback Logic
    // Tier 1: DB Profile | Tier 2: Google Metadata | Tier 3: UI-Avatar Fallback
    const name =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.email.split("@")[0];
    const username = profile?.username || user.email.split("@")[0];

    const avatarUrl =
      profile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=random&color=fff`;

    // 4. Update Header Greeting
    if (greetingText) {
      greetingText.textContent = `Hi, ${name.split(" ")[0]}`;
    }

    if (addBtn) addBtn.style.display = "flex";

    // 5. Update Profile Button (Header)
    if (profileBtn) {
      profileBtn.innerHTML = `<img src="${avatarUrl}" style="width:32px; height:32px; border-radius:50%; object-fit: cover; border: 1px solid var(--card-border);">`;
      profileBtn.onclick = (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById("profile-dropdown");
        if (dropdown) dropdown.classList.toggle("show");
      };
    }

    // 6. Update Dropdown/Sidebar Identity Elements
    if (document.getElementById("user-name"))
      document.getElementById("user-name").textContent = name;
    if (document.getElementById("user-email"))
      document.getElementById("user-email").textContent = `@${username}`;
    if (document.getElementById("dropdown-profile-img"))
      document.getElementById("dropdown-profile-img").src = avatarUrl;
    if (drawerSettings) drawerSettings.style.display = "block";

    // 6.5 Show Admin Link for Admin Users
    const ADMIN_EMAILS = ["khushaankgupta@gmail.com"]; // Admin whitelist
    const adminLink = document.getElementById("admin-link");
    if (adminLink && ADMIN_EMAILS.includes(user.email)) {
      adminLink.style.display = "flex";
    }

    // 7. Setup Sign Out
    const signOutBtn = document.getElementById("sign-out-btn");
    if (signOutBtn) {
      signOutBtn.onclick = async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.href = "index.html";
      };
    }
  } else {
    // --- SIGNED-OUT STATE ---
    if (addBtn) addBtn.style.display = "none";
    if (drawerSettings) drawerSettings.style.display = "none";
    if (profileBtn) {
      profileBtn.innerHTML = `
        <div class="signin-pill">
          <span class="material-icons">account_circle</span>
          <span>Sign in</span>
        </div>`;
      profileBtn.onclick = () => (window.location.href = "auth.html");
    }
    if (greetingText) greetingText.textContent = "Hi, Researcher";
  }
}
// 9. Global Listeners & Page Init
document.addEventListener("click", (e) => {
  const profileDropdown = document.getElementById("profile-dropdown");
  const profileBtn = document.getElementById("profile-btn");
  const suggestionsBox = document.getElementById("search-suggestions");

  if (
    profileDropdown &&
    profileBtn &&
    !profileDropdown.contains(e.target) &&
    !profileBtn.contains(e.target)
  ) {
    profileDropdown.classList.remove("show");
  }

  if (
    suggestionsBox &&
    !document.querySelector(".search-container").contains(e.target)
  ) {
    suggestionsBox.style.display = "none";
  }
});
/**
 * Advanced Search Suggestions: Trending and Live Filter logic
 * Eliminates the "blank box" by defaulting to trending results.
 */
function setupSearchSuggestions() {
  const searchBar = document.getElementById("search-bar");
  const suggestionsBox = document.getElementById("search-suggestions");
  const mobileBackBtn = document.getElementById("mobile-search-back");

  if (!searchBar || !suggestionsBox) return;

  // 1. Show Trending (4 items) immediately on focus
  searchBar.addEventListener("focus", () => {
    const query = searchBar.value.trim().toLowerCase();
    if (query === "") {
      showTrending(4);
    } else {
      renderLiveSuggestions(query);
    }
  });

  // 2. Live input logic: No character minimum
  searchBar.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query.length > 0) {
      renderLiveSuggestions(query);
    } else {
      showTrending(4);
    }
  });

  // 3. Mobile Back Button FIX: Close box and remove active state
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener("click", () => {
      suggestionsBox.classList.remove("active");
      document.body.classList.remove("mobile-search-active");
      searchBar.value = "";
      searchBar.blur();
    });
  }

  // 4. Click outside to close
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-container")) {
      suggestionsBox.classList.remove("active");
    }
  });
}

function showTrending(count) {
  // Select latest 4 papers as trending
  const trendingItems = allBlogs.slice(0, count);
  renderSuggestionList(trendingItems, true);
}

function renderLiveSuggestions(term) {
  const matches = allBlogs
    .filter((b) => b.title.toLowerCase().includes(term))
    .slice(0, 6);

  // FIX: If no matches found, show Trending instead of a blank box
  if (matches.length === 0) {
    showTrending(4);
  } else {
    renderSuggestionList(matches, false);
  }
}

function renderSuggestionList(items, isTrending) {
  const suggestionsBox = document.getElementById("search-suggestions");
  const searchBar = document.getElementById("search-bar");

  // Safety check: If for some reason there are no items, hide the box
  if (!items || items.length === 0) {
    suggestionsBox.classList.remove("active");
    return;
  }

  suggestionsBox.innerHTML = "";
  suggestionsBox.classList.add("active");

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";

    // Icon + Title + Thumbnail on Right side
    div.innerHTML = `
            <span class="material-icons suggest-icon">${
              isTrending ? "history" : "search"
            }</span>
            <div class="suggest-text">${item.title}</div>
            <img src="${
              item.image_url || "images/KGR.png"
            }" class="suggest-thumb">
        `;

    div.onclick = () => {
      searchBar.value = item.title;
      window.location.href = `view.html?id=${item.id}`;
    };
    suggestionsBox.appendChild(div);
  });
}
window.addEventListener("DOMContentLoaded", () => {
  loadFragments();
  fetchBlogs();
});
/**
 * Global Theme Algorithm - Support for Default, Grey, and White
 */
function applyTheme(themeName) {
  // Remove all existing theme classes
  document.body.classList.remove("theme-grey-scale", "theme-white");
  document.documentElement.classList.remove("theme-grey-scale", "theme-white");

  if (themeName !== "default") {
    document.body.classList.add(`theme-${themeName}`);
    document.documentElement.classList.add(`theme-${themeName}`);
  }

  localStorage.setItem("kgr_theme", themeName);
  console.log(`Theme updated to: ${themeName}`);
}

// Shortcut functions for your buttons
function applyGreyTheme() {
  applyTheme("grey-scale");
}
function applyWhiteTheme() {
  applyTheme("white");
}
function resetTheme() {
  applyTheme("default");
}

// Instant Load Logic
(function () {
  const savedTheme = localStorage.getItem("kgr_theme");
  if (savedTheme && savedTheme !== "default") {
    document.documentElement.classList.add(`theme-${savedTheme}`);
    // Body class will be added via DOMContentLoaded if not immediately available
  }
})();

window.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("kgr_theme");
  if (savedTheme && savedTheme !== "default") {
    document.body.classList.add(`theme-${savedTheme}`);
  }
  // --- Scroll Shadow Effect Logic ---
  // This listens for when the user scrolls the page
  window.addEventListener("scroll", () => {
    // Finds the main navigation or the studio navigation
    const header =
      document.querySelector(".main-nav") ||
      document.querySelector(".create-nav");

    if (header) {
      if (window.scrollY > 10) {
        // Adds the styling class when you scroll down
        header.classList.add("header-scrolled");
      } else {
        // Removes it when you are back at the very top
        header.classList.remove("header-scrolled");
      }
    }
  });
});
// 12. Global UI Logic
function setupBackToTop() {
  const btt = document.getElementById("back-to-top");
  if (!btt) return;

  window.addEventListener("scroll", () => {
    if (window.pageYOffset > 300) {
      btt.style.display = "flex";
    } else {
      btt.style.display = "none";
    }
  });

  btt.onclick = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };
}

// 13. Notification System Bridge
function toggleNotifications() {
  if (window.NotificationSystem) {
    window.NotificationSystem.togglePanel();
  }
}
// initNotifications and loadMockNotifications removed.
