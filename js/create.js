/**
 * create.js - KGR Archive Research Studio Editor
 * Version: 2.1.0 (Integrated)
 * Description: Handles dual-mode editing, AI suggestions, dynamic graphing,
 * metadata management, and Supabase persistence.
 */

// --- 1. GLOBAL CONSTANTS & STATE ---
const supabaseClient = window.supabaseClient;
let selectedImageFile = null;
let tags = [];
let coAuthors = [];
const MAX_TAGS = 3;
let currentMode = "source"; // "source" (Markdown) or "formatted" (Rich Text)
let autosaveTimeout = null;
let isNavigatingAway = false;

// --- 2. INITIALIZATION & AUTH GUARD ---
window.addEventListener("DOMContentLoaded", async () => {
  // Check Authentication Status
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (!user || error) {
    console.error("Auth Failure:", error);
    window.location.href = "auth.html";
    return;
  }

  window.currentUser = user;
  console.log("KGR Studio Initialized for:", user.email);

  // Initial UI Setups
  setupImagePreview();
  setupTagSystem();
  setupCollaboratorSystem();
  setupDragDrop();
  setupAutosave(user.id);
  setupAISuggestionEngine();

  // Check if we are in Edit Mode (via URL ID)
  const urlParams = new URLSearchParams(window.location.search);
  const blogId = urlParams.get("id");

  if (blogId) {
    await loadBlogForEditing(blogId, user.id);

    // Auto-save for EDIT MODE
    window.addEventListener("beforeunload", () => {
      if (!isNavigatingAway) {
        handleUpdate(blogId, "draft", user.id);
      }
    });
  } else {
    initCreateMode(user);

    // Auto-save for CREATE MODE
    window.addEventListener("beforeunload", () => {
      if (!isNavigatingAway) {
        handleSubmission("draft", user);
      }
    });
  }

  window.switchMode("source");
});

/**
 * Sets up buttons and event listeners for creating a new post
 */
function initCreateMode(user) {
  const mainSaveBtn = document.getElementById("main-save-btn");
  const dropdownTrigger = document.getElementById("save-dropdown-trigger");
  const statusDropdown = document.getElementById("save-status-dropdown");
  let currentStatus = "published";

  // Toggle Dropdown
  dropdownTrigger.onclick = (e) => {
    e.stopPropagation();
    statusDropdown.classList.toggle("show");
  };

  document.addEventListener("click", () => {
    statusDropdown.classList.remove("show");
  });

  // Handle Status Selection
  statusDropdown.querySelectorAll("button").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const status = btn.getAttribute("data-status");
      currentStatus = status;
      mainSaveBtn.innerText = status === "published" ? "Publish" : "Save Draft";
      statusDropdown.classList.remove("show");
    };
  });

  mainSaveBtn.onclick = () => handleSubmission(currentStatus, user);

  // Auto-save logic
  window.addEventListener("beforeunload", () => {
    if (!isNavigatingAway) {
      handleSubmission("draft", user);
    }
  });

  // Back to Top Logic
  const btt = document.getElementById("back-to-top");
  if (btt) {
    window.onscroll = () => {
      btt.style.display = window.pageYOffset > 300 ? "flex" : "none";
    };
    btt.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// --- 3. PERSISTENCE LAYER (LOAD/EDIT/UPDATE) ---

/**
 * Fetches blog data from Supabase and populates the editor
 */
async function loadBlogForEditing(blogId, userId) {
  console.log(`Loading archival record: ${blogId}`);
  try {
    const { data: blog, error } = await supabaseClient
      .from("blogs")
      .select("*")
      .eq("id", blogId)
      .eq("user_id", userId)
      .single();

    if (error || !blog) {
      alert("Database Error: Record not found or access restricted.");
      window.location.href = "contributions.html";
      return;
    }

    // 1. Populate Core Fields
    document.getElementById("title").value = blog.title || "";
    document.getElementById("content").value = blog.content || "";

    // 2. Populate Metadata Arrays
    tags = blog.tags || [];
    coAuthors = blog.co_authors || [];

    // 3. Trigger UI Re-renders (Using window scope for global accessibility)
    if (window.updateTagDisplay) window.updateTagDisplay();
    if (window.updateAuthorDisplay) window.updateAuthorDisplay();

    // 4. Handle Thumbnail Preview
    if (blog.image_url) {
      const preview = document.getElementById("image-preview");
      const uploadArea = document.getElementById("image-upload-area");
      const icon = document.querySelector(".thumbnail-box .material-icons");

      preview.src = blog.image_url;
      preview.style.display = "block";
      if (icon) icon.style.display = "none";
      if (uploadArea) uploadArea.classList.add("has-image");
    }

    // 5. Override Button Logic for Update vs Insert
    const mainSaveBtn = document.getElementById("main-save-btn");
    const dropdownTrigger = document.getElementById("save-dropdown-trigger");
    const statusDropdown = document.getElementById("save-status-dropdown");
    let currentStatus = blog.status || "published";

    mainSaveBtn.innerText =
      currentStatus === "published" ? "Update Research" : "Update Draft";

    dropdownTrigger.onclick = (e) => {
      e.stopPropagation();
      statusDropdown.classList.toggle("show");
    };

    statusDropdown.querySelectorAll("button").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const status = btn.getAttribute("data-status");
        currentStatus = status;
        mainSaveBtn.innerText =
          status === "published" ? "Update Research" : "Update Draft";
        statusDropdown.classList.remove("show");
      };
    });

    mainSaveBtn.onclick = () => handleUpdate(blogId, currentStatus, userId);

    // Update beforeunload for edit context
    window.addEventListener("beforeunload", () => {
      handleUpdate(blogId, "draft", userId);
    });
  } catch (err) {
    console.error("Critical loading error:", err);
  }
}

// --- 4. DUAL-MODE SWITCHER (MARKDOWN VS RICH TEXT) ---

window.switchMode = (mode) => {
  const sourceTab = document.getElementById("source-tab");
  const formattedTab = document.getElementById("formatted-tab");
  const textarea = document.getElementById("content");
  const preview = document.getElementById("markdown-preview");

  currentMode = mode;

  if (mode === "source") {
    // Switch to Markdown Editor
    sourceTab.classList.add("active");
    formattedTab.classList.remove("active");
    textarea.style.display = "block";
    preview.style.display = "none";
    preview.contentEditable = false;

    // Sync from Preview (HTML) back to Textarea (Markdown)
    if (preview.innerHTML && preview.innerHTML !== "") {
      textarea.value = htmlToMarkdown(preview.innerHTML);
      textarea.dispatchEvent(new Event("input"));
    }
  } else {
    // Switch to Formatted (Rich Text) Preview
    sourceTab.classList.remove("active");
    formattedTab.classList.add("active");
    textarea.style.display = "none";
    preview.style.display = "block";
    preview.contentEditable = true;

    // Process Content for Markdown Rendering
    let rawContent = textarea.value;

    // Render Graph Syntax (:::graph ... :::)
    let processedContent = rawContent.replace(
      /:::graph([\s\S]*?):::/g,
      (match, configText) => {
        const id = `chart-${Math.random().toString(36).substr(2, 9)}`;
        return `<div class="chart-wrapper"><canvas id="${id}" class="article-graph" data-config='${configText.trim()}'></canvas></div>`;
      }
    );

    // Parse Markdown using marked.js
    preview.innerHTML = marked.parse(processedContent, {
      renderer: previewRenderer,
    });

    // Initialize any charts found in the rendered HTML
    setTimeout(() => {
      initDynamicCharts(preview.querySelectorAll(".article-graph"));
    }, 50);

    preview.focus();

    // Bi-directional sync for real-time rich-text editing
    preview.addEventListener("input", () => {
      textarea.value = htmlToMarkdown(preview.innerHTML);
      textarea.dispatchEvent(new Event("input"));
    });
  }
};

// --- 5. TOOLBAR & FORMATTING COMMANDS ---

window.formatText = (type) => {
  if (currentMode === "formatted") {
    // Rich Text Context
    const preview = document.getElementById("markdown-preview");
    preview.focus();
    switch (type) {
      case "bold":
        document.execCommand("bold");
        break;
      case "italic":
        document.execCommand("italic");
        break;
      case "header":
        document.execCommand("formatBlock", false, "h3");
        break;
      case "list":
        document.execCommand("insertUnorderedList");
        break;
      case "quote":
        document.execCommand("formatBlock", false, "blockquote");
        break;
      case "link":
        const url = prompt("Enter Research Reference URL:");
        if (url) document.execCommand("createLink", false, url);
        break;
    }
  } else {
    // Markdown Context
    const textarea = document.getElementById("content");
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = "";

    switch (type) {
      case "bold":
        replacement = `**${selectedText || "bold text"}**`;
        break;
      case "italic":
        replacement = `*${selectedText || "italic text"}*`;
        break;
      case "header":
        replacement = `\n### ${selectedText || "Research Heading"}\n`;
        break;
      case "link":
        replacement = `[${selectedText || "Source"}](${
          prompt("Enter URL:") || "https://"
        })`;
        break;
      case "list":
        replacement = `\n* ${selectedText || "Research point"}`;
        break;
      case "quote":
        replacement = `\n> ${selectedText || "Scientist quote"}`;
        break;
      case "code":
        replacement = `\`${selectedText || "code block"}\``;
        break;
    }

    if (replacement) {
      textarea.setRangeText(replacement, start, end, "select");
      textarea.dispatchEvent(new Event("input"));
      textarea.focus();
    }
  }
};

window.insertGraph = () => {
  const textarea = document.getElementById("content");
  const template = `\n:::graph\ntitle: Data Distribution\nlabels: Mon, Tue, Wed, Thu, Fri\ndata: 12, 19, 3, 5, 2\ntype: bar\n:::\n`;
  textarea.setRangeText(
    template,
    textarea.selectionStart,
    textarea.selectionEnd,
    "end"
  );
  textarea.dispatchEvent(new Event("input"));
};

window.insertYouTube = () => {
  const textarea = document.getElementById("content");
  const url = prompt("Paste Laboratory Video / YouTube URL:");
  if (url) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const embed = `\nhttps://www.youtube.com/watch?v=${videoId}\n`;
      textarea.setRangeText(
        embed,
        textarea.selectionStart,
        textarea.selectionEnd,
        "end"
      );
      textarea.dispatchEvent(new Event("input"));
    }
  }
};

// --- 6. AI SUGGESTION ENGINE ---

function setupAISuggestionEngine() {
  const textarea = document.getElementById("content");
  const suggestionsBox = document.getElementById("ai-suggestions");

  textarea.addEventListener("input", () => {
    const text = textarea.value.toLowerCase();
    suggestionsBox.innerHTML = "";

    // 1. Graph Suggestion
    if (
      text.includes("data") ||
      text.includes("result") ||
      text.includes("analyze")
    ) {
      if (!text.includes(":::graph")) {
        addAISuggestion(
          "Visualize results with a data graph?",
          window.insertGraph
        );
      }
    }

    // 2. Video Suggestion
    if (text.includes("watch") || text.includes("demonstration")) {
      if (!text.includes("youtube")) {
        addAISuggestion("Embed a video demonstration?", window.insertYouTube);
      }
    }

    // 3. Metadata Suggestion
    if (tags.length === 0) {
      addAISuggestion("Add research tags for discovery?", () =>
        document.getElementById("tag-input").focus()
      );
    }

    if (suggestionsBox.innerHTML === "") {
      suggestionsBox.innerHTML =
        '<p class="hint-text">Drafting research... AI assistant is monitoring.</p>';
    }
  });

  function addAISuggestion(msg, action) {
    const pill = document.createElement("div");
    pill.className = "ai-suggest-pill";
    pill.innerHTML = `<span class="material-icons">auto_awesome</span> ${msg}`;
    pill.onclick = (e) => {
      e.preventDefault();
      action();
    };
    suggestionsBox.appendChild(pill);
  }
}

// --- 7. METADATA MANAGEMENT (TAGS & COLLABORATORS) ---

function setupTagSystem() {
  const tagInput = document.getElementById("tag-input");
  const container = document.getElementById("tag-chip-container");

  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      let val = tagInput.value.trim().toLowerCase().replace(/[#,]/g, "");
      if (val && tags.length < MAX_TAGS && !tags.includes(val)) {
        tags.push(val);
        renderTags();
      }
      tagInput.value = "";
    }
  });

  function renderTags() {
    container.querySelectorAll(".tag-chip").forEach((el) => el.remove());
    tags.forEach((tag, idx) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.innerHTML = `#${tag} <span class="material-icons" onclick="removeTag(${idx})">close</span>`;
      container.insertBefore(chip, tagInput);
    });
    document.getElementById(
      "tag-count-indicator"
    ).textContent = `${tags.length}/${MAX_TAGS}`;
  }

  // Export to Window for global access
  window.updateTagDisplay = renderTags;
  window.removeTag = (idx) => {
    tags.splice(idx, 1);
    renderTags();
  };
}

function setupCollaboratorSystem() {
  const authorInput = document.getElementById("author-input");
  const container = document.getElementById("author-chip-container");

  authorInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = authorInput.value.trim().replace("@", "");
      if (val && !coAuthors.includes(val)) {
        coAuthors.push(val);
        renderAuthors();
      }
      authorInput.value = "";
    }
  });

  function renderAuthors() {
    container.querySelectorAll(".tag-chip").forEach((el) => el.remove());
    coAuthors.forEach((author, idx) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.innerHTML = `@${author} <span class="material-icons" onclick="removeAuthor(${idx})">close</span>`;
      container.insertBefore(chip, authorInput);
    });
  }

  window.updateAuthorDisplay = renderAuthors;
  window.removeAuthor = (idx) => {
    coAuthors.splice(idx, 1);
    renderAuthors();
  };
}

// --- 8. IMAGE & MEDIA LOGIC ---

function setupImagePreview() {
  const input = document.getElementById("image-input");
  const preview = document.getElementById("image-preview");
  const icon = document.querySelector(".thumbnail-box .material-icons");

  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        preview.src = ev.target.result;
        preview.style.display = "block";
        if (icon) icon.style.display = "none";
      };
      reader.readAsDataURL(file);
    }
  });
}

function setupDragDrop() {
  const textarea = document.getElementById("content");
  textarea.addEventListener("dragover", (e) => {
    e.preventDefault();
    textarea.classList.add("drag-active");
  });
  textarea.addEventListener("dragleave", () =>
    textarea.classList.remove("drag-active")
  );
  textarea.addEventListener("drop", (e) => {
    e.preventDefault();
    textarea.classList.remove("drag-active");
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".md") || file.name.endsWith(".txt"))) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        textarea.value = ev.target.result;
        textarea.dispatchEvent(new Event("input"));
      };
      reader.readAsText(file);
    }
  });
}

// --- 9. PERSISTENCE LOGIC (SUBMIT / UPDATE) ---

async function handleSubmission(statusStr, user) {
  // Prevent the auto-save from firing during the redirect
  isNavigatingAway = true;

  const title =
    document.getElementById("title").value.trim() || "Untitled Archival Record";
  const content = document.getElementById("content").value.trim();

  if (!content) {
    alert("Integrity Error: Research body cannot be empty.");
    isNavigatingAway = false; // Re-enable auto-save if we stop here
    return;
  }

  const btn =
    statusStr === "published"
      ? document.getElementById("publish-btn")
      : document.getElementById("draft-btn");

  btn.disabled = true;
  btn.textContent = "...Archiving";

  try {
    let finalImageUrl = null;

    // Upload Thumbnail if selected
    if (selectedImageFile) {
      const path = `${user.id}/thumb_${Date.now()}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("blog-images")
        .upload(path, selectedImageFile);

      if (uploadError) throw uploadError;

      finalImageUrl = supabaseClient.storage
        .from("blog-images")
        .getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabaseClient.from("blogs").insert([
      {
        title,
        content,
        status: statusStr,
        user_id: user.id,
        author: user.email.split("@")[0],
        image_url: finalImageUrl,
        tags,
        co_authors: coAuthors,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;

    // Clean up LocalStorage
    localStorage.removeItem(`kgr_draft_title_${user.id}`);
    localStorage.removeItem(`kgr_draft_content_${user.id}`);

    window.location.href =
      statusStr === "published" ? "index.html" : "contributions.html";
  } catch (err) {
    console.error("Archival Failed:", err);
    alert(`Failed to archive: ${err.message}`);
    isNavigatingAway = false; // Error occurred, turn auto-save back on
    const mainSaveBtn = document.getElementById("main-save-btn");
    mainSaveBtn.disabled = false;
    mainSaveBtn.textContent =
      statusStr === "published" ? "Update Research" : "Update Draft";
  }
}

async function handleUpdate(blogId, statusStr, userId) {
  // Prevent the auto-save from firing during the redirect
  isNavigatingAway = true;

  const title =
    document.getElementById("title").value.trim() || "Untitled Archival Record";
  const content = document.getElementById("content").value.trim();

  // UI Feedback: Disable buttons while processing
  const mainSaveBtn = document.getElementById("main-save-btn");
  const originalText = mainSaveBtn.innerText;

  if (!content) {
    alert("Research body cannot be empty.");
    isNavigatingAway = false; // Re-enable auto-save if we stop here
    return;
  }

  mainSaveBtn.disabled = true;
  mainSaveBtn.innerText = "Saving...";

  try {
    let finalImageUrl = null;

    // Handle image: If a NEW file was picked, upload it.
    if (selectedImageFile) {
      const path = `${userId}/thumb_${Date.now()}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("blog-images")
        .upload(path, selectedImageFile);

      if (uploadError) throw uploadError;

      finalImageUrl = supabaseClient.storage
        .from("blog-images")
        .getPublicUrl(path).data.publicUrl;
    }

    // PERFORM THE UPDATE
    const { error: dbError } = await supabaseClient
      .from("blogs")
      .update({
        title: title,
        content: content,
        status: statusStr,
        image_url: finalImageUrl || undefined, // undefined prevents overwriting with null if no new image
        tags: tags,
        co_authors: coAuthors,
        updated_at: new Date().toISOString(),
      })
      .eq("id", blogId)
      .eq("user_id", userId);

    if (dbError) throw dbError;

    // Clear local cache
    localStorage.removeItem(`kgr_draft_title_${userId}`);
    localStorage.removeItem(`kgr_draft_content_${userId}`);

    // Success redirect
    window.location.href = "contributions.html";
  } catch (err) {
    console.error("Update Failed:", err);
    alert(`Failed to update: ${err.message}`);
    mainSaveBtn.disabled = false;
    mainSaveBtn.innerText = originalText;
    isNavigatingAway = false; // Error occurred, turn auto-save back on
  }
}

// --- 10. HELPER UTILITIES ---

function setupAutosave(userId) {
  const status = document.getElementById("autosave-status");
  document.getElementById("content").addEventListener("input", (e) => {
    status.textContent = "Changes detected...";
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => {
      localStorage.setItem(`kgr_draft_content_${userId}`, e.target.value);
      status.textContent = "Securely cached";
    }, 2000);
  });
}

function initDynamicCharts(canvases) {
  canvases.forEach((canvas) => {
    const lines = canvas.getAttribute("data-config").split("\n");
    const config = {};
    lines.forEach((l) => {
      const [k, v] = l.split(":");
      if (k && v) config[k.trim().toLowerCase()] = v.trim();
    });

    if (window.Chart) {
      new Chart(canvas, {
        type: config.type || "line",
        data: {
          labels: config.labels ? config.labels.split(",") : ["A", "B", "C"],
          datasets: [
            {
              label: config.title || "Research Data",
              data: config.data
                ? config.data.split(",").map(Number)
                : [10, 20, 30],
              borderColor: "#3ea6ff",
              backgroundColor: "rgba(62, 166, 255, 0.1)",
              tension: 0.4,
            },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    }
  });
}

function htmlToMarkdown(html) {
  // Basic Markdown converter for rich text sync
  return html
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<h3>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, "> $1\n")
    .replace(/<li>(.*?)<\/li>/gi, "* $1\n")
    .replace(/<p>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "") // Strip remaining HTML
    .trim();
}

function extractYouTubeId(url) {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

const previewRenderer = new marked.Renderer();
previewRenderer.link = (href, title, text) => {
  if (href.includes("youtube.com")) {
    const id = extractYouTubeId(href);
    return `<iframe width="100%" height="315" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
};

function handleWindowResize() {
  const editor = document.querySelector(".editor-container");
  if (window.innerWidth < 768) {
    editor.classList.add("mobile-view");
  } else {
    editor.classList.remove("mobile-view");
  }
}

window.addEventListener("resize", handleWindowResize);
