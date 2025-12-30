/**
 * contributions.js - KGR Integrated Version
 * Features: Database safety checks, Action Menus, and Deletion Logic
 */

// 1. Core Fetcher with Client Safety
async function fetchUserContributions() {
  const container = document.getElementById("contributions-container");
  if (!container) return;

  // Retrieve the global client
  const supabaseClient = window.supabaseClient;

  if (!supabaseClient) {
    console.error("Supabase Client is missing! Check script order in HTML.");
    container.innerHTML =
      '<div class="loader">Database connection error.</div>';
    return;
  }

  // Show Skeleton Loader immediately
  container.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  try {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      window.location.href = "auth.html";
      return;
    }

    const { data: uploads, error } = await supabaseClient
      .from("blogs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    renderContributions(uploads);
  } catch (err) {
    console.error("Database Error:", err.message);
    container.innerHTML = `<div class="loader">Failed to load: ${err.message}</div>`;
  }
}

// 2. Rendering Logic
function renderContributions(items) {
  const container = document.getElementById("contributions-container");
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML =
      '<p class="loader">No research records found in your archive.</p>';
    return;
  }

  items.forEach((item) => {
    const isDraft = item.status === "draft";
    const card = document.createElement("div");
    card.className = "yt-card contribution-card";

    const thumbUrl = item.image_url || "images/placeholder-landscape.svg";
    const avatarUrl = item.author_avatar || "images/default-avatar.png";
    const dateStr = new Date(item.created_at).toLocaleDateString();

    card.innerHTML = `
      <div class="yt-thumbnail">
        <img src="${thumbUrl}" alt="Thumbnail" onerror="this.onerror=null;this.src='images/placeholder-landscape.svg';">
        <div class="status-selector-wrapper">
          <span class="status-badge ${isDraft ? "draft" : "published"}">${
      isDraft ? "DRAFT" : "PUBLISHED"
    }</span>
        </div>
      </div>

      <div class="yt-card-info">
        <div class="yt-author-avatar">
          <img src="${avatarUrl}" alt="Avatar" class="yt-author-avatar-img" onerror="this.src='https://ui-avatars.com/api/?name=${
      item.author || "User"
    }&background=random'">
        </div>

        <div class="yt-details">
          <h3 class="yt-title" title="${item.title}">${item.title}</h3>
          <div class="yt-meta-block">
            <span class="yt-meta-author">${
              item.author || "Unknown Author"
            }</span>
          </div>
          <div class="yt-meta-block">
            <span class="yt-meta-views">${item.views || 0} views</span>
            <span class="yt-meta-separator">•</span>
            <span class="yt-meta-date">${dateStr}</span>
          </div>
        </div>

        <div class="menu-container">
          <button class="menu-dots-btn" onclick="toggleCardMenu(event, '${
            item.id
          }')">
            <span class="material-icons">more_vert</span>
          </button>
          <div id="menu-${item.id}" class="card-action-menu">
            <button onclick="editArticle(event, '${
              item.id
            }')" class="menu-action">
              <span class="material-icons">edit</span> Edit
            </button>
            <button onclick="shareArticle(event, '${
              item.id
            }')" class="menu-action">
              <span class="material-icons">share</span> Share
            </button>
            <div class="menu-divider"></div>
            <button onclick="updateStatus(event, '${item.id}', '${
      isDraft ? "published" : "draft"
    }')" class="menu-action">
              <span class="material-icons">${
                isDraft ? "public" : "lock"
              }</span> ${isDraft ? "Publish" : "Unpublish"}
            </button>
            <button onclick="confirmDelete(event, '${
              item.id
            }', '${item.title.replace(
      /'/g,
      "\\'"
    )}')" class="menu-action delete-text">
              <span class="material-icons">delete</span> Delete
            </button>
          </div>
        </div>
      </div>`;

    card.onclick = (e) => {
      if (
        !e.target.closest(".menu-container") &&
        !e.target.closest(".status-selector-wrapper")
      ) {
        window.location.href = `view.html?id=${item.id}`;
      }
    };
    container.appendChild(card);
  });
}

// 3. Delete Confirmation UI
function confirmDelete(event, id, title) {
  event.preventDefault();
  event.stopPropagation();

  // Close any open menus
  document
    .querySelectorAll(".card-action-menu")
    .forEach((m) => m.classList.remove("show"));

  let modal = document.getElementById("delete-confirm-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "delete-confirm-modal";
    modal.className = "ai-modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="ai-modal-content">
      <header class="ai-modal-header">
        <span class="material-icons" style="color: #ff4d4d">warning</span>
        <h3>Delete Research?</h3>
        <span class="material-icons close-modal" onclick="closeDeleteModal()">close</span>
      </header>
      <div class="ai-modal-body">
        <p>Permanently remove <strong>"${title}"</strong> from the KGR Archive?</p>
      </div>
      <div class="ai-modal-footer">
        <button class="secondary-btn" onclick="closeDeleteModal()">Cancel</button>
        <button class="primary-btn delete-btn-confirm" onclick="executeDelete('${id}')">Delete</button>
      </div>
    </div>`;
  modal.style.display = "flex";
}

// 4. Database Deletion Execution
async function executeDelete(id) {
  const supabaseClient = window.supabaseClient;
  const { error } = await supabaseClient.from("blogs").delete().eq("id", id);

  if (error) {
    console.error("Delete Error:", error.message);
    alert("Permission denied or database error.");
  } else {
    closeDeleteModal();
    fetchUserContributions(); // Refresh the list
  }
}

// 4.1 Update Status logic
async function updateStatus(event, id, newStatus) {
  event.stopPropagation();
  const supabaseClient = window.supabaseClient;

  const { error } = await supabaseClient
    .from("blogs")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) {
    console.error("Status Update Error:", error.message);
    alert("Failed to update status.");
  } else {
    // Show a small toast or just refresh
    console.log(`Status updated to ${newStatus}`);
    // Optional: add a visual confirmation
    const select = event.target;
    select.style.borderColor = "var(--success)";
    setTimeout(() => {
      select.style.borderColor = "";
      fetchUserContributions(); // Refresh to update badges if any
    }, 1000);
  }
}

// 5. Menu Interaction logic
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

function closeDeleteModal() {
  const modal = document.getElementById("delete-confirm-modal");
  if (modal) modal.style.display = "none";
}

function editArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  window.location.href = `create.html?id=${id}`;
}

function shareArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  const url = `${window.location.origin}/view.html?id=${id}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Link copied to clipboard!");
  });
}

function followArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  alert("Followed!");
}

// Close menus when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-container")) {
    document
      .querySelectorAll(".card-action-menu")
      .forEach((m) => m.classList.remove("show"));
  }
});

// 6. Initialization
document.addEventListener("DOMContentLoaded", fetchUserContributions);
