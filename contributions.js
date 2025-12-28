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

    card.innerHTML = `
      <div class="yt-thumbnail">
        <img src="${
          item.image_url || "https://picsum.photos/seed/" + item.id + "/320/180"
        }" alt="Thumbnail">
        ${isDraft ? `<span class="status-badge badge-draft">DRAFT</span>` : ""}
      </div>
      <div class="yt-card-info" style="overflow: visible;">
        <div class="yt-details" style="overflow: visible;">
          <div class="title-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; overflow: visible;">
            <h3 class="yt-title" style="flex: 1; margin: 0;">${item.title}</h3>
            <div class="menu-container" style="position: relative; flex-shrink: 0;">
              <button class="menu-dots-btn" onclick="toggleCardMenu(event, '${
                item.id
              }')">
                <span class="material-icons">more_vert</span>
              </button>
              <div id="menu-${item.id}" class="card-action-menu">
                <button onclick="editArticle(event, '${item.id}')" class="menu-action">
                  <span class="material-icons">edit</span> Edit
                </button>
                <button onclick="followArticle(event, '${item.id}')" class="menu-action">
                  <span class="material-icons">person_add</span> Follow
                </button>
                <button onclick="shareArticle(event, '${
                  item.id
                }')" class="menu-action">
                  <span class="material-icons">share</span> Share
                </button>
                <div class="menu-divider"></div>
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
          </div>
          <p class="yt-meta-stats" style="margin-top: 4px;">${new Date(
            item.created_at
          ).toLocaleDateString()}</p>
        </div>
      </div>`;

    card.onclick = (e) => {
      if (!e.target.closest(".menu-container")) {
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
    alert('Link copied to clipboard!');
  });
}

function followArticle(event, id) {
  event.preventDefault();
  event.stopPropagation();
  alert('Followed!');
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
