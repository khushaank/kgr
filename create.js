/**
 * create.js - Research Studio Editor (Source & Formatted Modes)
 */
const supabaseClient = window.supabaseClient;
let selectedImageFile = null;
let tags = [];
let coAuthors = [];
const MAX_TAGS = 3;

// 1. Initialization & Auth Guard
window.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (!user || error) {
    window.location.href = "auth.html";
    return;
  }

  window.currentUser = user;

  // Check if editing existing blog
  const urlParams = new URLSearchParams(window.location.search);
  const blogId = urlParams.get('id');
  if (blogId) {
    await loadBlogForEditing(blogId, user.id);
  }

  setupImagePreview();
  setupTagSystem();
  setupCollaboratorSystem();
  setupDragDrop();
  setupAutosave(user.id);

  // Set default view
  window.switchMode("source");

  // Action Buttons
  document.getElementById("draft-btn").onclick = () =>
    handleSubmission("draft", user);
  document.getElementById("publish-btn").onclick = () =>
    handleSubmission("published", user);

  // Auto save on close
  window.addEventListener('beforeunload', () => {
    handleSubmission('draft', user);
  });
});

// Load existing blog for editing
async function loadBlogForEditing(blogId, userId) {
  try {
    const { data: blog, error } = await supabaseClient
      .from('blogs')
      .select('*')
      .eq('id', blogId)
      .eq('user_id', userId)
      .single();

    if (error || !blog) {
      alert('Blog not found or access denied.');
      window.location.href = 'contributions.html';
      return;
    }

    // Populate the form
    document.getElementById('title').value = blog.title || '';
    document.getElementById('content').value = blog.content || '';
    document.getElementById('markdown-preview').innerHTML = blog.content || '';

    // Set tags
    tags = blog.tags || [];
    updateTagDisplay();

    // Set image if exists
    if (blog.image_url) {
      selectedImageFile = null; // Reset file
      document.getElementById('image-preview').src = blog.image_url;
      document.getElementById('image-preview').style.display = 'block';
      document.getElementById('image-upload-area').style.display = 'none';
    }

    // Update submit buttons to update instead of create
    document.getElementById("draft-btn").onclick = () => handleUpdate(blogId, "draft", userId);
    document.getElementById("publish-btn").onclick = () => handleUpdate(blogId, "published", userId);

  } catch (err) {
    console.error('Error loading blog:', err);
    alert('Error loading blog for editing.');
  }
}

let currentMode = "source";

// 2. Dual-Mode Switcher
window.switchMode = (mode) => {
  const sourceTab = document.getElementById("source-tab");
  const formattedTab = document.getElementById("formatted-tab");
  const textarea = document.getElementById("content");
  const preview = document.getElementById("markdown-preview");

  currentMode = mode;

  if (mode === "source") {
    sourceTab.classList.add("active");
    formattedTab.classList.remove("active");
    textarea.style.display = "block";
    preview.style.display = "none";
    preview.contentEditable = false;
    // Sync from formatted to source
    if (preview.innerHTML) {
      textarea.value = htmlToMarkdown(preview.innerHTML);
      textarea.dispatchEvent(new Event("input"));
    }
  } else {
    sourceTab.classList.remove("active");
    formattedTab.classList.add("active");
    textarea.style.display = "none";
    preview.style.display = "block";
    preview.contentEditable = true;

    // Sync and render the preview
    let rawContent = textarea.value;
    // Pre-process graph markers for actual charts
    let processedContent = rawContent.replace(
      /:::graph([\s\S]*?):::/g,
      (match, configText) => {
        const id = `chart-${Math.random().toString(36).substr(2, 9)}`;
        return `<div class="chart-wrapper"><canvas id="${id}" class="article-graph" data-config='${configText.trim()}'></canvas></div>`;
      }
    );
    preview.innerHTML = marked.parse(processedContent, { renderer: previewRenderer });
    // Render charts
    initDynamicCharts(preview.querySelectorAll('.article-graph'));
    preview.focus();

    // Add sync listener
    preview.addEventListener('input', () => {
      textarea.value = htmlToMarkdown(preview.innerHTML);
      textarea.dispatchEvent(new Event('input'));
    });
  }
};

// 3. Toolbar Formatting & Content Insertion
window.formatText = (type) => {
  if (currentMode === 'formatted') {
    const preview = document.getElementById("markdown-preview");
    preview.focus();
    switch (type) {
      case "bold":
        document.execCommand('bold');
        break;
      case "italic":
        document.execCommand('italic');
        break;
      case "header":
        document.execCommand('formatBlock', false, 'h3');
        break;
      case "list":
        document.execCommand('insertUnorderedList');
        break;
      case "quote":
        document.execCommand('formatBlock', false, 'blockquote');
        break;
      case "link":
        const url = prompt("Enter URL:");
        if (url) document.execCommand('createLink', false, url);
        break;
      case "image":
        const imgUrl = prompt("Enter image URL:");
        if (imgUrl) document.execCommand('insertImage', false, imgUrl);
        break;
    }
  } else {
    const textarea = document.getElementById("content");
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let replacement = "";

    switch (type) {
      case "bold":
        const trimmedBold = selectedText.trim();
        if (trimmedBold.startsWith("**") && trimmedBold.endsWith("**")) {
          replacement = trimmedBold.slice(2, -2);
        } else {
          replacement = `**${selectedText.trim()}**`;
        }
        break;
      case "italic":
        const trimmedItalic = selectedText.trim();
        if (trimmedItalic.startsWith("*") && trimmedItalic.endsWith("*")) {
          replacement = trimmedItalic.slice(1, -1);
        } else {
          replacement = `*${selectedText.trim()}*`;
        }
        break;
      case "header":
        replacement = `\n## ${selectedText}`;
        break;
      case "link":
        replacement = `[${selectedText || "Link Text"}](https://)`;
        break;
      case "list":
        replacement = `\n* ${selectedText}`;
        break;
      case "quote":
        replacement = `\n> ${selectedText}`;
        break;
      case "image":
        const url = prompt("Paste direct image link (URL):");
        if (url)
          replacement = `\n![${selectedText || "Image Description"}](${url})\n`;
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
  const template = `\n:::graph\ntitle: Analysis Results\nlabels: Q1, Q2, Q3, Q4\ndata: 15, 45, 30, 70\ntype: line\n:::\n`;
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
  const url = prompt("Paste YouTube URL:");
  if (url) {
    const videoId = extractYouTubeId(url);
    if (videoId) {
      const embed = `\n<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>\n`;
      textarea.setRangeText(
        embed,
        textarea.selectionStart,
        textarea.selectionEnd,
        "end"
      );
      textarea.dispatchEvent(new Event("input"));
    } else {
      alert("Invalid YouTube URL");
    }
  }
};

// Custom renderer for YouTube links in preview
const previewRenderer = new marked.Renderer();
previewRenderer.link = function(href, title, text) {
  if (typeof href === 'string' && href.includes('youtube.com/watch?v=')) {
    const id = href.split('v=')[1].split('&')[0];
    return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<a href="${href || '#'}" title="${title || ''}">${text}</a>`;
};

function initDynamicCharts(canvases) {
  canvases.forEach((canvas) => {
    const lines = canvas.getAttribute("data-config").split("\n");
    const config = {};
    lines.forEach((line) => {
      const [key, val] = line.split(":");
      if (key && val) config[key.trim().toLowerCase()] = val.trim();
    });

    if (typeof Chart !== "undefined") {
      new Chart(canvas, {
        type: config.type || "line",
        data: {
          labels: config.labels ? config.labels.split(",") : [],
          datasets: [
            {
              label: config.title || "Data Points",
              data: config.data ? config.data.split(",").map(Number) : [],
              backgroundColor: "rgba(62, 166, 255, 0.2)",
              borderColor: "#3ea6ff",
              borderWidth: 2,
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
  return html
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<ul>(.*?)<\/ul>/gi, '$1')
    .replace(/<ol>(.*?)<\/ol>/gi, '$1')
    .replace(/<li>(.*?)<\/li>/gi, '* $1\n')
    .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre><code>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n')
    .replace(/<iframe.*?src="https:\/\/www\.youtube\.com\/embed\/([^"]*)".*?<\/iframe>/gi, (match, id) => `https://www.youtube.com/watch?v=${id}`)
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// 4. AI Suggestion Engine
function setupAISuggestionEngine() {
  const textarea = document.getElementById("content");
  const suggestionsBox = document.getElementById("ai-suggestions");

  textarea.addEventListener("input", () => {
    const text = textarea.value.toLowerCase();
    suggestionsBox.innerHTML = "";

    if (text.includes("data") && !text.includes(":::graph")) {
      addSuggestion("Visualizing this data with a graph?", window.insertGraph);
    }
    if (text.length > 200 && !text.includes("ai result")) {
      addSuggestion("Add an AI-summarized block?", window.insertAIResult);
    }
    if (suggestionsBox.innerHTML === "") {
      suggestionsBox.innerHTML =
        '<p class="hint-text">Keep writing to see AI research tips...</p>';
    }
  });

  function addSuggestion(msg, action) {
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

// 4.1 Drag and Drop for .md files
function setupDragDrop() {
  const textarea = document.getElementById("content");
  const editorContainer = document.querySelector(".editor-container");

  [textarea, editorContainer].forEach(element => {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      element.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      element.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      element.addEventListener(eventName, unhighlight, false);
    });

    element.addEventListener('drop', handleDrop, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight(e) {
    editorContainer.classList.add('drag-over');
  }

  function unhighlight(e) {
    editorContainer.classList.remove('drag-over');
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.md') || file.type === 'text/markdown') {
        const reader = new FileReader();
        reader.onload = (event) => {
          textarea.value = event.target.result;
          textarea.dispatchEvent(new Event('input'));
        };
        reader.readAsText(file);
      } else {
        alert('Please drop a .md file');
      }
    }
  }
}
function setupAutosave(userId) {
  const titleInput = document.getElementById("title");
  const contentTextarea = document.getElementById("content");
  const statusDiv = document.getElementById("autosave-status");

  // Restore from localStorage
  const savedTitle = localStorage.getItem(`kgr_draft_title_${userId}`);
  const savedContent = localStorage.getItem(`kgr_draft_content_${userId}`);
  if (savedTitle) titleInput.value = savedTitle;
  if (savedContent) contentTextarea.value = savedContent;

  let saveTimeout;

  // Autosave on input with debounce
  const saveDraft = () => {
    localStorage.setItem(`kgr_draft_title_${userId}`, titleInput.value);
    localStorage.setItem(`kgr_draft_content_${userId}`, contentTextarea.value);
    statusDiv.textContent = "Draft saved";
    statusDiv.style.color = "#4caf50";
  };

  titleInput.addEventListener("input", () => {
    statusDiv.textContent = "Unsaved changes...";
    statusDiv.style.color = "#ff9800";
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveDraft, 1000);
  });
  contentTextarea.addEventListener("input", () => {
    statusDiv.textContent = "Unsaved changes...";
    statusDiv.style.color = "#ff9800";
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveDraft, 1000);
  });

  // Keyboard shortcut Ctrl+S
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSubmission('draft', window.currentUser);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      formatText('bold');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "i") {
      e.preventDefault();
      formatText('italic');
    }
  });
}

// 5. Metadata (Thumbnail, Tags, Authors)
function setupImagePreview() {
  const imageInput = document.getElementById("image-input");
  const imagePreview = document.getElementById("image-preview");
  const icon = document.querySelector(".thumbnail-box .material-icons");

  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreview.src = event.target.result;
        imagePreview.style.display = "block";
        if (icon) icon.style.display = "none";
      };
      reader.readAsDataURL(file);
    }
  });
}

function setupTagSystem() {
  const tagInput = document.getElementById("tag-input");
  const container = document.getElementById("tag-chip-container");
  const suggestionsDiv = document.getElementById("tag-suggestions");

  let commonTags = [];

  // Fetch common tags from Google-like source (GitHub topics)
  fetch('https://api.github.com/search/topics?q=research&per_page=20')
    .then(res => res.json())
    .then(data => {
      commonTags = data.items ? data.items.map(item => item.name) : [];
    })
    .catch(() => {
      commonTags = ["AI", "Machine Learning", "Data Science", "Physics", "Chemistry", "Biology", "Mathematics", "Computer Science", "Research", "Analysis", "Statistics", "Neuroscience", "Genetics", "Climate", "Environment"];
    });

  tagInput.addEventListener("input", () => {
    const query = tagInput.value.toLowerCase().trim();
    suggestionsDiv.innerHTML = "";
    if (query.length > 0) {
      const matches = commonTags.filter(tag => tag.toLowerCase().includes(query) && !tags.includes(tag.toLowerCase()));
      if (matches.length > 0) {
        suggestionsDiv.style.display = "block";
        matches.slice(0, 5).forEach(tag => {
          const div = document.createElement("div");
          div.textContent = tag;
          div.onclick = () => {
            if (tags.length < MAX_TAGS && !tags.includes(tag.toLowerCase())) {
              tags.push(tag.toLowerCase());
              renderTags();
            }
            tagInput.value = "";
            suggestionsDiv.style.display = "none";
          };
          suggestionsDiv.appendChild(div);
        });
      } else {
        suggestionsDiv.style.display = "none";
      }
    } else {
      suggestionsDiv.style.display = "none";
    }
  });

  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      let val = tagInput.value.trim().toLowerCase().replace(/[#,]/g, "");
      if (val && tags.length < MAX_TAGS && !tags.includes(val)) {
        tags.push(val);
        renderTags();
      }
      tagInput.value = "";
      suggestionsDiv.style.display = "none";
    }
  });

  // Show trending tags
  document.getElementById('show-trending-btn').onclick = () => {
    suggestionsDiv.innerHTML = "";
    suggestionsDiv.style.display = "block";
    commonTags.slice(0, 10).forEach(tag => {
      const div = document.createElement("div");
      div.textContent = tag;
      div.onclick = () => {
        if (tags.length < MAX_TAGS && !tags.includes(tag.toLowerCase())) {
          tags.push(tag.toLowerCase());
          renderTags();
        }
        tagInput.value = "";
        suggestionsDiv.style.display = "none";
      };
      suggestionsDiv.appendChild(div);
    });
  };

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!suggestionsDiv.contains(e.target) && e.target !== tagInput && e.target !== document.getElementById('show-trending-btn')) {
      suggestionsDiv.style.display = 'none';
    }
  });

  function renderTags() {
    container.querySelectorAll(".tag-chip").forEach((el) => el.remove());
    tags.forEach((tag, index) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.innerHTML = `#${tag} <span class="material-icons" onclick="removeTag(${index})">close</span>`;
      container.insertBefore(chip, tagInput);
    });
    document.getElementById(
      "tag-count-indicator"
    ).textContent = `${tags.length}/${MAX_TAGS} tags used`;
  }
  window.removeTag = (index) => {
    tags.splice(index, 1);
    renderTags();
  };
}

function setupCollaboratorSystem() {
  const authorInput = document.getElementById("author-input");
  const container = document.getElementById("author-chip-container");

  authorInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && authorInput.value.trim()) {
      e.preventDefault();
      const vals = authorInput.value.trim().split(",").map(v => v.trim().replace("@", "")).filter(v => v);
      vals.forEach(val => {
        if (!coAuthors.includes(val)) {
          coAuthors.push(val);
        }
      });
      renderAuthors();
      authorInput.value = "";
    }
  });

  function renderAuthors() {
    container.querySelectorAll(".tag-chip").forEach((el) => el.remove());
    coAuthors.forEach((author, index) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.innerHTML = `@${author} <span class="material-icons" onclick="removeAuthor(${index})">close</span>`;
      container.insertBefore(chip, authorInput);
    });
  }
  window.removeAuthor = (index) => {
    coAuthors.splice(index, 1);
    renderAuthors();
  };
}

// 6. Final Submission
async function handleSubmission(statusStr, user) {
  let title = document.getElementById("title").value.trim();
  if (!title) title = 'Untitled';
  let content;
  if (currentMode === "formatted") {
    content = htmlToMarkdown(document.getElementById("markdown-preview").innerHTML);
  } else {
    content = document.getElementById("content").value.trim();
  }
  const publishBtn = document.getElementById("publish-btn");
  const draftBtn = document.getElementById("draft-btn");

  if (!title || !content) {
    alert("Title and content are required.");
    return;
  }

  publishBtn.disabled = true;
  draftBtn.disabled = true;

  try {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    let finalImageUrl = null;

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

    const { error: dbError } = await supabaseClient.from("blogs").insert([
      {
        title,
        content,
        status: statusStr,
        user_id: user.id,
        author: profile?.username || user.email.split("@")[0],
        image_url: finalImageUrl,
        tags: tags,
        co_authors: coAuthors,
        created_at: new Date(),
      },
    ]);

    if (dbError) throw dbError;
    // Clear drafts after successful submission
    localStorage.removeItem(`kgr_draft_title_${user.id}`);
    localStorage.removeItem(`kgr_draft_content_${user.id}`);
    window.location.href = "index.html";
  } catch (err) {
    alert(`Failed: ${err.message}`);
    publishBtn.disabled = false;
    draftBtn.disabled = false;
  }
}

async function handleUpdate(blogId, statusStr, userId) {
  let title = document.getElementById("title").value.trim();
  if (!title) title = 'Untitled';
  let content;
  if (currentMode === "formatted") {
    content = htmlToMarkdown(document.getElementById("markdown-preview").innerHTML);
  } else {
    content = document.getElementById("content").value.trim();
  }
  const publishBtn = document.getElementById("publish-btn");
  const draftBtn = document.getElementById("draft-btn");

  if (!title || !content) {
    alert("Title and content are required.");
    return;
  }

  publishBtn.disabled = true;
  draftBtn.disabled = true;

  try {
    let finalImageUrl = null;

    if (selectedImageFile) {
      const path = `${userId}/thumb_${Date.now()}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("blog-images")
        .upload(path, selectedImageFile);
      if (uploadError) throw uploadError;
      finalImageUrl = supabaseClient.storage
        .from("blog-images")
        .getPublicUrl(path).data.publicUrl;
    } else {
      // Keep existing image if no new file selected
      const { data: existingBlog } = await supabaseClient
        .from('blogs')
        .select('image_url')
        .eq('id', blogId)
        .single();
      finalImageUrl = existingBlog?.image_url;
    }

    const { error: dbError } = await supabaseClient
      .from("blogs")
      .update({
        title,
        content,
        status: statusStr,
        image_url: finalImageUrl,
        tags: tags,
        co_authors: coAuthors,
        updated_at: new Date(),
      })
      .eq('id', blogId)
      .eq('user_id', userId);

    if (dbError) throw dbError;
    // Clear drafts after successful update
    localStorage.removeItem(`kgr_draft_title_${userId}`);
    localStorage.removeItem(`kgr_draft_content_${userId}`);
    window.location.href = "contributions.html";
  } catch (err) {
    alert(`Failed: ${err.message}`);
    publishBtn.disabled = false;
    draftBtn.disabled = false;
  }
}
