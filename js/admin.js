/**
 * admin.js - KGR Archive Admin Dashboard
 * Self-contained admin panel with full control capabilities
 */

// ================== CONFIGURATION ==================
// Admin email whitelist - add your admin emails here
const ADMIN_EMAILS = [
  "khushaankgupta@gmail.com", // Add your admin emails
];

// ================== STATE ==================
let allUsers = [];
let allArticles = [];
let supabaseClient = null;

// ================== HELPER FUNCTIONS ==================

function formatNumber(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatDate(dateString) {
  if (!dateString) return "---";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRelativeTime(dateString) {
  if (!dateString) return "---";
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

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function showNotification(message, type = "info") {
  const container = document.getElementById("admin-alert-container");
  if (!container) return;

  const icons = {
    error: "error",
    success: "check_circle",
    warning: "warning",
    info: "info",
  };

  container.innerHTML = `
    <div class="admin-alert ${type}">
      <span class="material-icons">${icons[type] || "info"}</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  setTimeout(() => {
    container.innerHTML = "";
  }, 4000);
}

// ================== INITIALIZATION ==================

document.addEventListener("DOMContentLoaded", async () => {
  // Get supabase client from global scope
  supabaseClient = window.supabaseClient;

  if (!supabaseClient) {
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; flex-direction: column; gap: 20px; padding: 20px; text-align: center;">
        <span class="material-icons" style="font-size: 64px; color: var(--error);">error</span>
        <h1>Configuration Error</h1>
        <p style="color: var(--meta);">Supabase client not found. Please check your configuration.</p>
        <a href="index.html" style="color: var(--accent);">Return to Home</a>
      </div>
    `;
    return;
  }

  await checkAdminAccess();
  setupSidebarHandlers();
});

async function checkAdminAccess() {
  try {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
      window.location.href = "auth.html";
      return;
    }

    if (!ADMIN_EMAILS.includes(user.email)) {
      document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; flex-direction: column; gap: 20px; padding: 20px; text-align: center;">
          <span class="material-icons" style="font-size: 64px; color: var(--error);">block</span>
          <h1>Access Denied</h1>
          <p style="color: var(--meta);">You don't have admin privileges.</p>
          <p style="color: var(--meta); font-size: 0.9rem;">Logged in as: ${escapeHtml(
            user.email
          )}</p>
          <a href="index.html" style="color: var(--accent);">Return to Home</a>
        </div>
      `;
      return;
    }

    // User is admin, load dashboard
    await loadDashboardData();
  } catch (err) {
    console.error("Auth check error:", err);
    window.location.href = "auth.html";
  }
}

function setupSidebarHandlers() {
  const menuToggle = document.getElementById("admin-menu-toggle");
  const sidebar = document.getElementById("admin-sidebar");
  const overlay = document.getElementById("admin-sidebar-overlay");
  const collapseBtn = document.getElementById("sidebar-collapse-btn");

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay?.classList.toggle("show");
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener("click", toggleSidebar);
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      sidebar?.classList.remove("open");
      overlay.classList.remove("show");
    });
  }

  // Close sidebar when nav item clicked on mobile
  document.querySelectorAll(".admin-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (window.innerWidth <= 768) {
        sidebar?.classList.remove("open");
        overlay?.classList.remove("show");
      }
    });
  });

  // Restore collapsed state from localStorage
  const isCollapsed =
    localStorage.getItem("admin-sidebar-collapsed") === "true";
  if (isCollapsed && window.innerWidth > 768) {
    sidebar?.classList.add("collapsed");
    // const adminMain = document.querySelector(".admin-main"); // Removed to rely on style.css
  }
}

// Toggle sidebar collapse
function toggleSidebar() {
  const sidebar = document.getElementById("admin-sidebar");

  if (!sidebar) return;

  sidebar.classList.toggle("collapsed");
  const isCollapsed = sidebar.classList.contains("collapsed");

  // Remember state
  localStorage.setItem("admin-sidebar-collapsed", isCollapsed);
}

// ================== DATA LOADING ==================

async function loadDashboardData() {
  showNotification("Loading dashboard data...", "info");

  try {
    await Promise.all([
      loadStats(),
      loadUsers(),
      loadArticles(),
      loadActivity(),
    ]);

    // Render charts after data is loaded
    renderCharts();

    // Update settings info
    updateSettingsInfo();

    showNotification("Dashboard loaded successfully!", "success");
  } catch (err) {
    console.error("Error loading dashboard:", err);
    showNotification("Error loading some data", "error");
  }
}

async function refreshData() {
  showNotification("Refreshing data...", "info");
  // Update last refresh time
  const refreshEl = document.getElementById("last-refresh");
  if (refreshEl) {
    refreshEl.textContent = new Date().toLocaleTimeString();
  }
  await loadDashboardData();
}

async function loadStats() {
  try {
    // Get total users
    const { count: usersCount } = await supabaseClient
      .from("profiles")
      .select("*", { count: "exact", head: true });

    // Get all articles
    const { data: articles } = await supabaseClient
      .from("blogs")
      .select("id, views, status");

    const totalArticles = articles?.length || 0;
    const totalViews =
      articles?.reduce((sum, a) => sum + (a.views || 0), 0) || 0;
    const publishedCount =
      articles?.filter((a) => a.status === "published").length || 0;
    const draftsCount =
      articles?.filter((a) => a.status === "draft").length || 0;

    // Update Dashboard Stats
    const el = (id) => document.getElementById(id);
    if (el("total-users"))
      el("total-users").textContent = formatNumber(usersCount || 0);
    if (el("total-articles"))
      el("total-articles").textContent = formatNumber(totalArticles);
    if (el("total-views"))
      el("total-views").textContent = formatNumber(totalViews);
    if (el("published-count"))
      el("published-count").textContent = formatNumber(publishedCount);
    if (el("drafts-count"))
      el("drafts-count").textContent = formatNumber(draftsCount);
  } catch (err) {
    console.error("Error loading stats:", err);
  }
}

async function loadUsers() {
  try {
    const { data: profiles, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    allUsers = profiles || [];

    // Get article counts per user
    const { data: articles } = await supabaseClient
      .from("blogs")
      .select("user_id, views");

    const userArticleCounts = {};
    const userViewCounts = {};

    articles?.forEach((a) => {
      userArticleCounts[a.user_id] = (userArticleCounts[a.user_id] || 0) + 1;
      userViewCounts[a.user_id] =
        (userViewCounts[a.user_id] || 0) + (a.views || 0);
    });

    allUsers = allUsers.map((u) => ({
      ...u,
      articleCount: userArticleCounts[u.id] || 0,
      totalViews: userViewCounts[u.id] || 0,
    }));

    renderUsersTable(allUsers);
  } catch (err) {
    console.error("Error loading users:", err);
    document.getElementById(
      "users-table-body"
    ).innerHTML = `<tr><td colspan="6" class="empty-state">Error loading users</td></tr>`;
  }
}

async function loadArticles() {
  try {
    // First try with join
    let articles = [];
    const { data, error } = await supabaseClient
      .from("blogs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    articles = data || [];

    allArticles = articles;
    renderArticlesTable(allArticles);
    renderTopArticles(allArticles);
  } catch (err) {
    console.error("Error loading articles:", err);
    document.getElementById(
      "articles-table-body"
    ).innerHTML = `<tr><td colspan="6" class="empty-state">Error loading articles</td></tr>`;
  }
}

async function loadActivity() {
  try {
    const { data: recentBlogs } = await supabaseClient
      .from("blogs")
      .select("id, title, author, created_at, status")
      .order("created_at", { ascending: false })
      .limit(10);

    const activityHtml = recentBlogs?.length
      ? recentBlogs
          .map(
            (blog) => `
        <div class="activity-item">
          <div class="activity-icon">
            <span class="material-icons">${
              blog.status === "published" ? "public" : "edit"
            }</span>
          </div>
          <div class="activity-content">
            <div class="activity-text">
              <strong>${escapeHtml(blog.author || "Unknown")}</strong> 
              ${blog.status === "published" ? "published" : "saved draft"} 
              "<em>${escapeHtml(blog.title)}</em>"
            </div>
            <div class="activity-time">${formatRelativeTime(
              blog.created_at
            )}</div>
          </div>
        </div>
      `
          )
          .join("")
      : '<div class="empty-state"><span class="material-icons">inbox</span><p>No recent activity</p></div>';

    const recentEl = document.getElementById("recent-activity");
    const liveEl = document.getElementById("live-activity-feed");
    if (recentEl) recentEl.innerHTML = activityHtml;
    if (liveEl) liveEl.innerHTML = activityHtml;
  } catch (err) {
    console.error("Error loading activity:", err);
  }
}

// ================== RENDERING ==================

function renderUsersTable(users) {
  const tbody = document.getElementById("users-table-body");
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = users
    .map(
      (user) => `
    <tr>
      <td>
        <div class="user-cell">
          <img src="${
            user.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.full_name || "User"
            )}&background=random`
          }" 
               alt="Avatar" class="user-avatar" 
               onerror="this.src='https://ui-avatars.com/api/?name=User&background=random'">
          <div class="user-info">
            <span class="user-name">${escapeHtml(
              user.full_name || "Unknown"
            )}</span>
            <span class="user-email">${escapeHtml(
              user.email || user.username || "---"
            )}</span>
          </div>
        </div>
      </td>
      <td>${formatDate(user.created_at)}</td>
      <td>${user.articleCount || 0}</td>
      <td>${formatNumber(user.totalViews || 0)}</td>
      <td>
        <span class="status-pill ${user.is_banned ? "banned" : "active"}">
          ${user.is_banned ? "Banned" : "Active"}
        </span>
      </td>
      <td class="actions-cell">
        <button class="action-btn" onclick="viewUser('${
          user.id
        }')" title="View Details">
          <span class="material-icons">visibility</span>
          <span>View</span>
        </button>
        <button class="action-btn danger" onclick="toggleBanUser('${
          user.id
        }', ${!user.is_banned})" title="${user.is_banned ? "Unban" : "Ban"}">
          <span class="material-icons">${
            user.is_banned ? "check_circle" : "block"
          }</span>
          <span>${user.is_banned ? "Unban" : "Ban"}</span>
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderArticlesTable(articles) {
  const tbody = document.getElementById("articles-table-body");
  if (!tbody) return;

  if (!articles.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No articles found</td></tr>`;
    return;
  }

  tbody.innerHTML = articles
    .map(
      (article) => `
    <tr>
      <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(
        article.title
      )}">
        ${escapeHtml(article.title)}
      </td>
      <td>${escapeHtml(article.author || "Unknown")}</td>
      <td>
        <span class="status-pill ${article.status}">
          ${article.status}
        </span>
      </td>
      <td>${formatNumber(article.views || 0)}</td>
      <td>${formatDate(article.created_at)}</td>
      <td class="actions-cell">
        <button class="action-btn" onclick="window.open('view.html?id=${
          article.id
        }', '_blank')" title="Open">
          <span class="material-icons">open_in_new</span>
        </button>
        <button class="action-btn" onclick="toggleArticleStatus('${
          article.id
        }', '${
        article.status === "published" ? "draft" : "published"
      }')" title="${article.status === "published" ? "Unpublish" : "Publish"}">
          <span class="material-icons">${
            article.status === "published" ? "unpublished" : "publish"
          }</span>
          <span>${
            article.status === "published" ? "Unpublish" : "Publish"
          }</span>
        </button>
        <button class="action-btn danger" onclick="deleteArticle('${
          article.id
        }', '${escapeHtml(article.title).replace(
        /'/g,
        "\\'"
      )}')" title="Delete">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderTopArticles(articles) {
  const tbody = document.getElementById("top-articles-body");
  if (!tbody) return;

  const sorted = [...articles]
    .filter((a) => a.status === "published")
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10);

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No published articles</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted
    .map(
      (article, i) => `
    <tr>
      <td style="font-weight: 700; color: var(--accent);">#${i + 1}</td>
      <td>${escapeHtml(article.title)}</td>
      <td>${escapeHtml(article.author || "Unknown")}</td>
      <td>${formatNumber(article.views || 0)}</td>
    </tr>
  `
    )
    .join("");

  // Update top author stat
  const authorCounts = {};
  articles.forEach((a) => {
    const author = a.author || "Unknown";
    authorCounts[author] = (authorCounts[author] || 0) + 1;
  });
  const topAuthor = Object.entries(authorCounts).sort((a, b) => b[1] - a[1])[0];
  const topAuthorEl = document.getElementById("top-author");
  if (topAuthorEl && topAuthor) {
    topAuthorEl.textContent = topAuthor[1];
  }
}

// ================== USER ACTIONS ==================

async function viewUser(userId) {
  const user = allUsers.find((u) => u.id === userId);
  if (!user) {
    showNotification("User not found", "error");
    return;
  }

  // Get user's articles
  const { data: userArticles } = await supabaseClient
    .from("blogs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const publishedCount =
    userArticles?.filter((a) => a.status === "published").length || 0;
  const draftCount =
    userArticles?.filter((a) => a.status === "draft").length || 0;
  const totalViews =
    userArticles?.reduce((sum, a) => sum + (a.views || 0), 0) || 0;

  // Get hidden blogs and followed users
  const hiddenBlogs = user.hidden_blogs || [];
  const followedUsers = user.followed_users || [];

  // Get hidden blog titles
  let hiddenBlogTitles = [];
  if (hiddenBlogs.length > 0) {
    const { data: hiddenData } = await supabaseClient
      .from("blogs")
      .select("id, title")
      .in("id", hiddenBlogs);
    hiddenBlogTitles = hiddenData || [];
  }

  // Get followed user names
  let followedUserNames = [];
  if (followedUsers.length > 0) {
    const { data: followedData } = await supabaseClient
      .from("profiles")
      .select("id, full_name, username")
      .in("id", followedUsers);
    followedUserNames = followedData || [];
  }

  const modalBody = document.getElementById("user-modal-body");
  if (!modalBody) return;

  modalBody.innerHTML = `
    <div class="user-profile-header">
      <img src="${
        user.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          user.full_name || "User"
        )}&background=random`
      }" 
           alt="Avatar" class="user-profile-avatar"
           onerror="this.src='https://ui-avatars.com/api/?name=User&background=random'">
      <div class="user-profile-info">
        <h3>${escapeHtml(user.full_name || "Unknown User")}</h3>
        <p>@${escapeHtml(user.username || "---")}</p>
        <p>${escapeHtml(user.email || "No email")}</p>
        <p style="color: var(--meta);">Joined: ${formatDate(
          user.created_at
        )}</p>
        <p style="margin-top: 8px;">
          <span class="status-pill ${user.is_banned ? "banned" : "active"}">
            ${user.is_banned ? "Banned" : "Active"}
          </span>
        </p>
      </div>
    </div>

    <div class="user-stats-grid">
      <div class="user-stat-item">
        <div class="user-stat-value">${publishedCount}</div>
        <div class="user-stat-label">Published</div>
      </div>
      <div class="user-stat-item">
        <div class="user-stat-value">${draftCount}</div>
        <div class="user-stat-label">Drafts</div>
      </div>
      <div class="user-stat-item">
        <div class="user-stat-value">${formatNumber(totalViews)}</div>
        <div class="user-stat-label">Total Views</div>
      </div>
      <div class="user-stat-item">
        <div class="user-stat-value">${hiddenBlogs.length}</div>
        <div class="user-stat-label">Hidden Articles</div>
      </div>
    </div>

    <!-- Tab Buttons -->
    <div class="tab-buttons">
      <button class="tab-btn active" onclick="switchUserTab('articles', this)">Articles (${
        userArticles?.length || 0
      })</button>
      <button class="tab-btn" onclick="switchUserTab('hidden', this)">Hidden (${
        hiddenBlogs.length
      })</button>
      <button class="tab-btn" onclick="switchUserTab('following', this)">Following (${
        followedUsers.length
      })</button>
    </div>

    <!-- Articles Tab -->
    <div id="tab-articles" class="user-tab-content">
      <div class="admin-table-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Views</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              userArticles?.length
                ? userArticles
                    .map(
                      (a) => `
              <tr>
                <td>${escapeHtml(a.title)}</td>
                <td><span class="status-pill ${a.status}">${
                        a.status
                      }</span></td>
                <td>${a.views || 0}</td>
                <td class="actions-cell">
                  <button class="action-btn" onclick="window.open('view.html?id=${
                    a.id
                  }', '_blank')">
                    <span class="material-icons">open_in_new</span>
                  </button>
                  <button class="action-btn" onclick="toggleArticleStatus('${
                    a.id
                  }', '${
                        a.status === "published" ? "draft" : "published"
                      }'); closeUserModal(); loadArticles();">
                    <span class="material-icons">${
                      a.status === "published" ? "lock" : "public"
                    }</span>
                  </button>
                  <button class="action-btn danger" onclick="deleteArticle('${
                    a.id
                  }', '${escapeHtml(a.title).replace(
                        /'/g,
                        "\\'"
                      )}'); closeUserModal();">
                    <span class="material-icons">delete</span>
                  </button>
                </td>
              </tr>
            `
                    )
                    .join("")
                : `<tr><td colspan="4" class="empty-state">No articles</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Hidden Articles Tab -->
    <div id="tab-hidden" class="user-tab-content" style="display: none;">
      ${
        hiddenBlogTitles.length > 0
          ? `
        <p style="color: var(--meta); margin-bottom: 16px;">Articles this user has hidden from their feed:</p>
        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${hiddenBlogTitles
                .map(
                  (b) => `
                <tr>
                  <td>${escapeHtml(b.title)}</td>
                  <td class="actions-cell">
                    <button class="action-btn" onclick="window.open('view.html?id=${
                      b.id
                    }', '_blank')">
                      <span class="material-icons">open_in_new</span>
                      <span>View</span>
                    </button>
                    <button class="action-btn" onclick="unhideArticleForUser('${userId}', '${
                    b.id
                  }')">
                      <span class="material-icons">visibility</span>
                      <span>Unhide</span>
                    </button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : `
        <div class="empty-state">
          <span class="material-icons">visibility</span>
          <p>No hidden articles</p>
        </div>
      `
      }
    </div>

    <!-- Following Tab -->
    <div id="tab-following" class="user-tab-content" style="display: none;">
      ${
        followedUserNames.length > 0
          ? `
        <p style="color: var(--meta); margin-bottom: 16px;">Users this person is following:</p>
        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${followedUserNames
                .map(
                  (u) => `
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="user-info">
                        <span class="user-name">${escapeHtml(
                          u.full_name || "Unknown"
                        )}</span>
                        <span class="user-email">@${escapeHtml(
                          u.username || "---"
                        )}</span>
                      </div>
                    </div>
                  </td>
                  <td class="actions-cell">
                    <button class="action-btn" onclick="viewUser('${
                      u.id
                    }'); closeUserModal();">
                      <span class="material-icons">person</span>
                      <span>View Profile</span>
                    </button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `
          : `
        <div class="empty-state">
          <span class="material-icons">person_add</span>
          <p>Not following anyone</p>
        </div>
      `
      }
    </div>

    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--card-border); display: flex; gap: 12px; flex-wrap: wrap;">
      <button class="action-btn danger" onclick="toggleBanUser('${userId}', ${!user.is_banned}); closeUserModal();">
        <span class="material-icons">${
          user.is_banned ? "check_circle" : "block"
        }</span>
        <span>${user.is_banned ? "Unban User" : "Ban User"}</span>
      </button>
      <button class="action-btn danger" onclick="deleteUser('${userId}'); closeUserModal();">
        <span class="material-icons">person_remove</span>
        <span>Delete Account</span>
      </button>
    </div>
  `;

  document.getElementById("user-modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

// Tab switching for user modal
function switchUserTab(tabName, btn) {
  // Hide all tabs
  document
    .querySelectorAll(".user-tab-content")
    .forEach((t) => (t.style.display = "none"));
  // Show selected tab
  document.getElementById(`tab-${tabName}`).style.display = "block";
  // Update button states
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

// Unhide article for a user
async function unhideArticleForUser(userId, blogId) {
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return;

  const hiddenBlogs = user.hidden_blogs || [];
  const newHidden = hiddenBlogs.filter((id) => id !== blogId);

  try {
    await supabaseClient
      .from("profiles")
      .update({ hidden_blogs: newHidden })
      .eq("id", userId);

    showNotification("Article unhidden for user", "success");

    // Refresh user data and reopen modal
    await loadUsers();
    viewUser(userId);
  } catch (err) {
    showNotification("Failed to unhide article", "error");
    console.error(err);
  }
}

function closeUserModal() {
  document.getElementById("user-modal")?.classList.remove("show");
  document.body.style.overflow = "";
}

async function toggleBanUser(userId, ban) {
  if (!confirm(`Are you sure you want to ${ban ? "ban" : "unban"} this user?`))
    return;

  showNotification(`${ban ? "Banning" : "Unbanning"} user...`, "info");

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .update({ is_banned: ban })
      .eq("id", userId)
      .select();

    if (error) {
      console.error("Ban error:", error);
      if (error.code === "42501" || error.message.includes("policy")) {
        showNotification(
          "Permission denied. Check Supabase RLS policies for profiles table.",
          "error"
        );
      } else {
        showNotification(`Failed: ${error.message}`, "error");
      }
      return;
    }

    if (!data || data.length === 0) {
      showNotification("User not found or no changes made", "warning");
      return;
    }

    showNotification(
      `User ${ban ? "banned" : "unbanned"} successfully`,
      "success"
    );

    // Update local state
    const userIndex = allUsers.findIndex((u) => u.id === userId);
    if (userIndex !== -1) {
      allUsers[userIndex].is_banned = ban;
    }

    renderUsersTable(allUsers);
  } catch (err) {
    showNotification("Failed to update user status: " + err.message, "error");
    console.error(err);
  }
}

async function deleteUser(userId) {
  const confirmMsg =
    "WARNING: This will delete the user's profile and all their articles.\n\nType 'DELETE' to confirm:";
  const userInput = prompt(confirmMsg);

  if (userInput !== "DELETE") {
    showNotification("Deletion cancelled", "info");
    return;
  }

  showNotification("Deleting user and their content...", "info");

  try {
    // First, try to delete user's articles
    const { error: blogError } = await supabaseClient
      .from("blogs")
      .delete()
      .eq("user_id", userId);

    if (blogError) {
      console.warn("Could not delete blogs:", blogError.message);
      // Continue anyway, profile deletion is more important
    }

    // Delete profile
    const { data, error } = await supabaseClient
      .from("profiles")
      .delete()
      .eq("id", userId)
      .select();

    if (error) {
      console.error("Delete profile error:", error);
      if (error.code === "42501" || error.message.includes("policy")) {
        showNotification(
          "Permission denied. You need to configure Supabase RLS policies to allow admin deletes. See Settings for SQL commands.",
          "error"
        );
      } else {
        showNotification(`Failed: ${error.message}`, "error");
      }
      return;
    }

    showNotification("User deleted successfully", "success");

    // Remove from local state
    allUsers = allUsers.filter((u) => u.id !== userId);
    renderUsersTable(allUsers);
    await loadStats();
  } catch (err) {
    showNotification("Failed to delete user: " + err.message, "error");
    console.error(err);
  }
}

// ================== ARTICLE ACTIONS ==================

async function toggleArticleStatus(articleId, newStatus) {
  try {
    const { error } = await supabaseClient
      .from("blogs")
      .update({ status: newStatus })
      .eq("id", articleId);

    if (error) throw error;

    showNotification(
      `Article ${newStatus === "published" ? "published" : "unpublished"}`,
      "success"
    );
    await loadArticles();
    await loadStats();
  } catch (err) {
    showNotification("Failed to update article status", "error");
    console.error(err);
  }
}

async function deleteArticle(articleId, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

  try {
    const { error } = await supabaseClient
      .from("blogs")
      .delete()
      .eq("id", articleId);

    if (error) throw error;

    showNotification("Article deleted", "success");
    await loadArticles();
    await loadStats();
  } catch (err) {
    showNotification("Failed to delete article", "error");
    console.error(err);
  }
}

// ================== FILTERS ==================

function filterUsers() {
  const search =
    document.getElementById("user-search")?.value.toLowerCase() || "";
  const filter = document.getElementById("user-filter")?.value || "all";

  const filtered = allUsers.filter((u) => {
    const matchesSearch =
      (u.full_name || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search) ||
      (u.username || "").toLowerCase().includes(search);

    const matchesFilter =
      filter === "all" ||
      (filter === "banned" && u.is_banned) ||
      (filter === "active" && !u.is_banned);

    return matchesSearch && matchesFilter;
  });

  renderUsersTable(filtered);
}

function filterArticles() {
  const search =
    document.getElementById("article-search")?.value.toLowerCase() || "";
  const status =
    document.getElementById("article-status-filter")?.value || "all";

  const filtered = allArticles.filter((a) => {
    const matchesSearch =
      (a.title || "").toLowerCase().includes(search) ||
      (a.author || "").toLowerCase().includes(search);

    const matchesStatus = status === "all" || a.status === status;

    return matchesSearch && matchesStatus;
  });

  renderArticlesTable(filtered);
}

// ================== NAVIGATION ==================

function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".admin-content-section").forEach((s) => {
    s.classList.remove("active");
  });

  // Remove active from nav
  document.querySelectorAll(".admin-nav-item").forEach((n) => {
    n.classList.remove("active");
  });

  // Show selected section
  const section = document.getElementById(`${sectionName}-section`);
  if (section) section.classList.add("active");

  // Mark nav as active
  if (event && event.target) {
    event.target.closest(".admin-nav-item")?.classList.add("active");
  }
}

// ================== UTILITIES ==================

function exportUsers() {
  const csv = [
    ["Name", "Username", "Email", "Articles", "Views", "Joined"].join(","),
    ...allUsers.map((u) =>
      [
        `"${(u.full_name || "").replace(/"/g, '""')}"`,
        u.username || "",
        u.email || "",
        u.articleCount || 0,
        u.totalViews || 0,
        u.created_at || "",
      ].join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kgr-users-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification("Users exported!", "success");
}

function clearLocalData() {
  if (!confirm("Clear all local cache data?")) return;
  localStorage.clear();
  showNotification("Local cache cleared", "success");
}

async function signOutAdmin() {
  if (!confirm("Sign out of admin panel?")) return;
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Close modal on outside click
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("admin-modal")) {
    closeUserModal();
  }
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeUserModal();
  }
});

// ================== CHARTS ==================

let contentChart = null;
let authorsChart = null;
let viewsChart = null;
let engagementChart = null;

function renderCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js not loaded");
    return;
  }

  renderContentChart();
  renderEngagementChart();
  renderAuthorsChart();
  renderViewsChart();
}

function renderEngagementChart() {
  const ctx = document.getElementById("engagementChart");
  if (!ctx) return;

  // Calculate user engagement
  const usersWithArticles = allUsers.filter((u) => u.articleCount > 0).length;
  const usersWithoutArticles = allUsers.filter(
    (u) => !u.articleCount || u.articleCount === 0
  ).length;
  const activeUsers = allUsers.filter((u) => u.totalViews > 100).length;

  // Destroy existing chart
  if (engagementChart) engagementChart.destroy();

  engagementChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Contributors", "Readers Only", "Power Users"],
      datasets: [
        {
          data: [usersWithArticles, usersWithoutArticles, activeUsers],
          backgroundColor: [
            "rgba(62, 166, 255, 0.8)",
            "rgba(155, 89, 182, 0.8)",
            "rgba(46, 204, 113, 0.8)",
          ],
          borderColor: [
            "rgba(62, 166, 255, 1)",
            "rgba(155, 89, 182, 1)",
            "rgba(46, 204, 113, 1)",
          ],
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#aaa",
            font: { size: 11 },
            padding: 15,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage =
                total > 0 ? Math.round((context.parsed / total) * 100) : 0;
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            },
          },
        },
      },
      cutout: "65%",
    },
  });
}

function renderContentChart() {
  const ctx = document.getElementById("contentChart");
  if (!ctx) return;

  const published = allArticles.filter((a) => a.status === "published").length;
  const drafts = allArticles.filter((a) => a.status === "draft").length;

  // Destroy existing chart
  if (contentChart) contentChart.destroy();

  contentChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Published", "Drafts"],
      datasets: [
        {
          data: [published, drafts],
          backgroundColor: [
            "rgba(46, 204, 113, 0.8)",
            "rgba(230, 126, 34, 0.8)",
          ],
          borderColor: ["rgba(46, 204, 113, 1)", "rgba(230, 126, 34, 1)"],
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#aaa",
            font: { size: 12 },
            padding: 20,
          },
        },
      },
      cutout: "70%",
    },
  });
}

function renderAuthorsChart() {
  const ctx = document.getElementById("authorsChart");
  if (!ctx) return;

  // Count articles per author
  const authorCounts = {};
  allArticles.forEach((a) => {
    const author = a.author || "Unknown";
    authorCounts[author] = (authorCounts[author] || 0) + 1;
  });

  // Sort and take top 5
  const sorted = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Destroy existing chart
  if (authorsChart) authorsChart.destroy();

  authorsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map((s) => s[0]),
      datasets: [
        {
          label: "Articles",
          data: sorted.map((s) => s[1]),
          backgroundColor: [
            "rgba(102, 126, 234, 0.8)",
            "rgba(155, 89, 182, 0.8)",
            "rgba(62, 166, 255, 0.8)",
            "rgba(46, 204, 113, 0.8)",
            "rgba(247, 183, 51, 0.8)",
          ],
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#aaa" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#aaa" },
        },
      },
    },
  });
}

function renderViewsChart() {
  const ctx = document.getElementById("viewsChart");
  if (!ctx) return;

  // Get top 5 articles by views (reduced for grid fit)
  const sorted = [...allArticles]
    .filter((a) => a.status === "published")
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  // Destroy existing chart
  if (viewsChart) viewsChart.destroy();

  viewsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map((a) => {
        const title = a.title || "Untitled";
        return title.length > 20 ? title.substring(0, 18) + "..." : title;
      }),
      datasets: [
        {
          label: "Views",
          data: sorted.map((a) => a.views || 0),
          backgroundColor: [
            "rgba(252, 74, 26, 0.8)",
            "rgba(247, 183, 51, 0.8)",
            "rgba(46, 204, 113, 0.8)",
            "rgba(62, 166, 255, 0.8)",
            "rgba(155, 89, 182, 0.8)",
          ],
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y", // Horizontal bars
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "#aaa" },
          beginAtZero: true,
        },
        y: {
          grid: { display: false },
          ticks: {
            color: "#aaa",
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ================== SETTINGS FUNCTIONS ==================

async function updateSettingsInfo() {
  // Update admin email display
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (user) {
    const adminEmailEl = document.getElementById("admin-email");
    if (adminEmailEl) adminEmailEl.textContent = user.email;
  }

  // Update last refresh
  const refreshEl = document.getElementById("last-refresh");
  if (refreshEl) {
    refreshEl.textContent = new Date().toLocaleTimeString();
  }
}

function exportAllData() {
  const data = {
    exportedAt: new Date().toISOString(),
    users: allUsers.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      username: u.username,
      email: u.email,
      articleCount: u.articleCount,
      totalViews: u.totalViews,
      is_banned: u.is_banned,
      created_at: u.created_at,
    })),
    articles: allArticles.map((a) => ({
      id: a.id,
      title: a.title,
      author: a.author,
      status: a.status,
      views: a.views,
      created_at: a.created_at,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kgr-export-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification("Data exported as JSON!", "success");
}

// ================== NOTIFICATION CENTER ==================

function toggleRecipientField() {
  const recipientType = document.getElementById("notif-recipient").value;
  const idGroup = document.getElementById("recipient-id-group");
  if (idGroup) {
    idGroup.style.display = recipientType === "specific" ? "block" : "none";
    if (recipientType === "specific") {
      setupUserSearch();
    }
  }
}

function setupUserSearch() {
  const input = document.getElementById("user-search-input");
  const resultsBox = document.getElementById("user-search-results");

  if (!input || !resultsBox) return;

  // Debounce helper
  let timeout = null;

  input.oninput = (e) => {
    clearTimeout(timeout);
    const term = e.target.value.toLowerCase().trim();

    if (!term) {
      resultsBox.classList.remove("show");
      return;
    }

    timeout = setTimeout(() => {
      const matches = allUsers
        .filter(
          (u) =>
            (u.full_name && u.full_name.toLowerCase().includes(term)) ||
            (u.email && u.email.toLowerCase().includes(term)) ||
            (u.username && u.username.toLowerCase().includes(term)) ||
            (u.id && u.id.includes(term))
        )
        .slice(0, 5); // Limit to 5 results

      if (matches.length > 0) {
        resultsBox.innerHTML = matches
          .map(
            (u) => `
                  <div class="search-result-item" onclick="selectNotifUser('${
                    u.id
                  }', '${escapeHtml(u.full_name || u.email).replace(
              /'/g,
              "\\'"
            )}')">
                      <img src="${
                        u.avatar_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          u.full_name || "U"
                        )}`
                      }" class="search-result-avatar">
                      <div class="search-result-info">
                          <span class="search-result-name">${escapeHtml(
                            u.full_name || "Unknown"
                          )}</span>
                          <span class="search-result-meta">@${escapeHtml(
                            u.username
                          )} (${u.email})</span>
                      </div>
                  </div>
              `
          )
          .join("");
        resultsBox.classList.add("show");
      } else {
        resultsBox.innerHTML = `<div class="search-result-item" style="cursor: default; color: var(--meta);">No users found</div>`;
        resultsBox.classList.add("show");
      }
    }, 300);
  };

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    // Must use e.target.closest to check if click is inside the group
    if (!e.target.closest("#recipient-id-group")) {
      resultsBox.classList.remove("show");
    }
  });
}

function selectNotifUser(id, name) {
  const input = document.getElementById("user-search-input");
  const hiddenId = document.getElementById("notif-user-id");
  const resultsBox = document.getElementById("user-search-results");

  if (input) input.value = name;
  if (hiddenId) hiddenId.value = id;
  if (resultsBox) resultsBox.classList.remove("show");
}

async function sendAdminNotification() {
  const recipientType = document.getElementById("notif-recipient").value;
  // Use hidden ID if specific
  const userId = document.getElementById("notif-user-id").value;
  const type = document.getElementById("notif-type").value;
  const message = document.getElementById("notif-message").value;
  const link = document.getElementById("notif-link").value;

  if (!message) {
    showNotification("Please enter a message", "warning");
    return;
  }

  showNotification("Sending notification...", "info");

  try {
    if (recipientType === "specific") {
      if (!userId) {
        showNotification("Please select a User from the search", "warning");
        return;
      }
      await NotificationSystem.send(userId, message, type, link);
      showNotification("Notification sent to user!", "success");
    } else {
      // Broadcast
      await NotificationSystem.sendToAll(message, type, link);
      showNotification("Broadcast sent to all users!", "success");
    }

    // Clear form
    document.getElementById("notif-message").value = "";
    document.getElementById("notif-link").value = "";
    if (document.getElementById("user-search-input"))
      document.getElementById("user-search-input").value = "";
    document.getElementById("notif-user-id").value = "";
  } catch (err) {
    console.error("Send error:", err);
    showNotification("Failed to send notification: " + err.message, "error");
  }
}
