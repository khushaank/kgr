/**
 * view.js - Dynamic Research Rendering Engine
 */
marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: true,
  mangle: false,
});

// Custom renderer for YouTube links
const renderer = new marked.Renderer();
renderer.link = function (href, title, text) {
  if (typeof href === "string" && href.includes("youtube.com/watch?v=")) {
    const id = href.split("v=")[1].split("&")[0];
    return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
  }
  return `<a href="${href || "#"}" title="${title || ""}">${text}</a>`;
};
marked.setOptions({ renderer });
async function fetchBlogContent() {
  const params = new URLSearchParams(window.location.search);
  const blogId = params.get("id");
  const container = document.getElementById("full-blog-content");
  const supabaseClient = window.supabaseClient;

  if (!blogId || !supabaseClient) {
    window.location.href = "index.html";
    return;
  }

  const { data: blog, error } = await supabaseClient
    .from("blogs")
    .select("*")
    .eq("id", blogId)
    .single();

  if (error || !blog) {
    container.innerHTML = `<div class="viewer-error">Error: Document not found.</div>`;
    return;
  }

  renderPaper(blog);
}

function calculateReadingTime(text) {
  const words = text.trim().split(/\s+/).length;
  return `${Math.ceil(words / 200)} min read`;
}

function renderPaper(blog) {
  const container = document.getElementById("full-blog-content");
  const readingTime = calculateReadingTime(blog.content);

  // Set page title
  document.title = `${blog.title} | KGR Researches`;

  // 1. Process Graphs before Markdown
  let processedContent = blog.content.replace(
    /:::graph([\s\S]*?):::/g,
    (match, configText) => {
      const id = `chart-${Math.random().toString(36).substr(2, 9)}`;
      return `<div class="chart-wrapper"><canvas id="${id}" class="article-graph" data-config='${configText.trim()}'></canvas></div>`;
    }
  );

  const htmlContent = marked.parse(processedContent);

  container.innerHTML = `
        <header class="viewer-header">
            <h1 class="viewer-title">${blog.title}</h1>
            <div class="viewer-meta">
                <span class="v-author">${blog.author}</span>
                <span class="v-dot">•</span>
                <span class="v-date">${new Date(
                  blog.created_at
                ).toLocaleDateString()}</span>
                <span class="v-dot">•</span>
                <span class="v-time">${readingTime}</span>
            </div>
        </header>

        <nav id="toc-container" class="toc-card"></nav>

        <section class="viewer-content-body" id="article-body">
            ${htmlContent}
        </section>

        <figure class="viewer-image-container">
            <img src="${
              blog.image_url ||
              "https://picsum.photos/seed/" + blog.id + "/1200/800"
            }" 
                 alt="Main Findings Visualization" class="expandable-image" id="research-image">
        </figure>

        <div class="viewer-footer-tag">
            <span>END OF ARCHIVE RECORD</span>
        </div>
    `;

  // Add copy buttons to code blocks
  document.querySelectorAll("#article-body pre").forEach((pre) => {
    const button = document.createElement("button");
    button.className = "copy-code-btn";
    button.innerHTML = '<span class="material-icons">content_copy</span>';
    button.title = "Copy to Clipboard";
    button.onclick = () => {
      navigator.clipboard.writeText(pre.textContent).then(() => {
        button.innerHTML = '<span class="material-icons">check</span>';
        setTimeout(
          () =>
            (button.innerHTML =
              '<span class="material-icons">content_copy</span>'),
          2000
        );
      });
    };
    pre.style.position = "relative";
    pre.appendChild(button);
  });

  generateToC();
  setupImageInteraction();
  initDynamicCharts(); // Render all chart canvases
}

function initDynamicCharts() {
  document.querySelectorAll(".article-graph").forEach((canvas) => {
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

function generateToC() {
  const article = document.getElementById("article-body");
  const container = document.getElementById("toc-container");
  if (!article || !container) return;

  const headers = article.querySelectorAll("h2, h3");
  if (headers.length < 2) {
    container.style.display = "none";
    return;
  }

  let html = `<div class="toc-header" id="toc-toggle"><h4>Contents</h4><span class="material-icons">expand_more</span></div><ul id="toc-list">`;
  headers.forEach((h, i) => {
    const id = `section-${i}`;
    h.id = id;
    html += `<li class="${
      h.tagName === "H3" ? "toc-sub" : ""
    }"><a href="#${id}">${h.innerText}</a></li>`;
  });
  container.innerHTML = html + `</ul>`;

  document.getElementById("toc-toggle").onclick = () =>
    container.classList.toggle("collapsed");

  // Start collapsed
  container.classList.add("collapsed");
}

function setupImageInteraction() {
  const img = document.getElementById("research-image");
  if (img) img.onclick = () => img.classList.toggle("expanded");
}

function initTextToSpeech() {
  const btn = document.getElementById("speak-btn");
  if (!btn) return;
  let active = false;
  btn.onclick = () => {
    if (active) {
      window.speechSynthesis.cancel();
      btn.innerHTML = '<span class="material-icons">volume_up</span>';
      active = false;
    } else {
      const utterance = new SpeechSynthesisUtterance(
        document.getElementById("article-body").textContent
      );
      utterance.onend = () => {
        btn.innerHTML = '<span class="material-icons">volume_up</span>';
        active = false;
      };
      window.speechSynthesis.speak(utterance);
      btn.innerHTML = '<span class="material-icons">volume_off</span>';
      active = true;
    }
  };
}

function handleBackNavigation() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  // Priority 1: Explicit 'ref' param
  if (ref === "contribution") {
    window.location.href = "contributions.html";
    return;
  }
  if (ref === "setting") {
    window.location.href = "settings.html";
    return;
  }
  if (ref === "viewer") {
    window.location.href = "index.html";
    // Ideally we might go back to previous viewer, requires history tracking
    return;
  }

  // Priority 2: Document Referrer (if internal)
  if (document.referrer && document.referrer.includes(window.location.host)) {
    // If we came from create, maybe dont go back there directly to avoid losing state?
    // actually history.back() is best for "go back to where user came from"
    history.back();
    return;
  }

  // Fallback
  window.location.href = "index.html";
}

// Update the back button label based on context
function updateNavigationUI() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const btnLabel = document.getElementById("back-label");

  if (btnLabel) {
    if (ref === "contribution") btnLabel.textContent = "Back to Contributions";
    else if (ref === "setting") btnLabel.textContent = "Back to Settings";
    else if (
      document.referrer &&
      document.referrer.includes(window.location.host)
    ) {
      btnLabel.textContent = "Go Back";
    } else btnLabel.textContent = "Home";
  }
}

// Focus Mode: Toggle Fullscreen & Body Class
function initFocusMode() {
  const btn = document.getElementById("focus-btn");
  if (!btn) return;

  // Check state on load (e.g. if mistakenly persisted, though less likely with standard fullscreen api)

  btn.onclick = () => {
    document.body.classList.toggle("focus-mode-active");

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      btn.innerHTML = '<span class="material-icons">fullscreen_exit</span>';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        btn.innerHTML = '<span class="material-icons">fullscreen</span>';
      }
    }
  };

  // Listen for fullscreen change (e.g. user pressed ESC)
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("focus-mode-active");
      btn.innerHTML = '<span class="material-icons">fullscreen</span>';
    }
  });
}

// Back to Top: Smooth Scroll
function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;

  window.onscroll = () => {
    if (
      document.body.scrollTop > 300 ||
      document.documentElement.scrollTop > 300
    ) {
      btn.classList.add("show");
    } else {
      btn.classList.remove("show");
    }
  };

  btn.onclick = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };
}

// 5. View Counting Logic
async function incrementViewCount(blogId) {
  const supabaseClient = window.supabaseClient;
  if (!supabaseClient || !blogId) return;

  // Validate UUID format to prevent SQL errors like "invalid input syntax for type uuid"
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(blogId)) {
    // Try to use a stored procedure for atomic increment
    const { error } = await supabaseClient.rpc("increment_view", {
      row_id: blogId,
    });
    if (!error) return; // RPC success
    console.warn("RPC failed, falling back to direct update:", error.message);
  } else {
    console.warn(`Skipping RPC: ID "${blogId}" is not a valid UUID.`);
  }

  // Fallback (Direct Update)
  // This works even for non-UUIDs if the DB column type allows it, or if we skip RPC
  const { data } = await supabaseClient
    .from("blogs")
    .select("views")
    .eq("id", blogId)
    .single();
  if (data) {
    await supabaseClient
      .from("blogs")
      .update({ views: (data.views || 0) + 1 })
      .eq("id", blogId);
  }
}

/* 
   SUPABASE SQL HELP
   Run this in your Supabase SQL Editor to enable view counting:

   -- 1. Add views column
   ALTER TABLE blogs ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;

   -- 2. Create increment function
   CREATE OR REPLACE FUNCTION increment_view(row_id UUID)
   RETURNS VOID AS $$
   BEGIN
     UPDATE blogs
     SET views = views + 1
     WHERE id = row_id;
   END;
   $$ LANGUAGE plpgsql;
*/

document.addEventListener("DOMContentLoaded", () => {
  fetchBlogContent();
  initTextToSpeech();
  updateNavigationUI();
  initFocusMode();
  initBackToTop();

  // Track View
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) incrementViewCount(id);
});
