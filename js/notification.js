/**
 * notification.js - KGR Archive Notification System
 * Connects to Supabase to manage real-time notifications.
 */

const NotificationSystem = {
  // Config
  tableName: "notifications",

  // State
  notifications: [],
  unreadCount: 0,
  currentUser: null,

  /**
   * Initialize the notification system
   */
  async init() {
    const supabase = window.supabaseClient;
    if (!supabase) {
      console.error("Supabase client not found in NotificationSystem.");
      return;
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    this.currentUser = user;

    if (this.currentUser) {
      this.setupUI();
      this.fetchNotifications();
      this.subscribeToRealtime();
    } else {
      // Hide bell if not logged in
      const wrapper = document.getElementById("notification-wrapper");
      if (wrapper) wrapper.style.display = "none";
    }
  },

  /**
   * Setup UI Event Listeners
   */
  setupUI() {
    const wrapper = document.getElementById("notification-wrapper");
    const btn = document.getElementById("notification-btn");
    const panel = document.getElementById("notification-panel");

    if (wrapper) wrapper.style.display = "block";

    if (btn) {
      // Remove old listeners by cloning or just overwriting onclick
      // We'll stick to established pattern in script.js which might collision if not careful.
      // Ideally script.js calls NotificationSystem.toggle()
      btn.onclick = (e) => {
        e.stopPropagation();
        this.togglePanel();
      };
    }

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (wrapper && !wrapper.contains(e.target)) {
        if (panel && panel.classList.contains("show")) {
          panel.classList.remove("show");
          btn?.classList.remove("active");
        }
      }
    });
  },

  togglePanel() {
    const panel = document.getElementById("notification-panel");
    const btn = document.getElementById("notification-btn");

    if (!panel) return;

    const isOpening = !panel.classList.contains("show");
    panel.classList.toggle("show");
    btn?.classList.toggle("active");

    if (isOpening) {
      this.markAllAsReadLocally(); // Visual update
      this.markAllAsReadRemote(); // DB update
    }
  },

  /**
   * Fetch notifications from Supabase
   */
  async fetchNotifications() {
    if (!this.currentUser) return;

    const { data, error } = await window.supabaseClient
      .from(this.tableName)
      .select("*")
      .eq("user_id", this.currentUser.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching notifications:", error);
      return;
    }

    this.notifications = data || [];
    this.updateBadge();
    this.render();
  },

  /**
   * Real-time subscription
   */
  subscribeToRealtime() {
    if (!this.currentUser) return;

    window.supabaseClient
      .channel("public:notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: this.tableName,
          filter: `user_id=eq.${this.currentUser.id}`,
        },
        (payload) => {
          console.log("New notification received!", payload);
          this.notifications.unshift(payload.new);
          this.updateBadge();
          this.render();
          this.showToastNotification(payload.new);
        }
      )
      .subscribe();
  },

  /**
   * Send a notification to a specific user
   * @param {string} toUserId
   * @param {string} message
   * @param {string} type - 'info', 'success', 'warning', 'error'
   * @param {string} link - Optional URL
   * @param {string} imageUrl - Optional image
   */
  async send(toUserId, message, type = "info", link = null, imageUrl = null) {
    const { error } = await window.supabaseClient.from(this.tableName).insert([
      {
        user_id: toUserId,
        message: message,
        type: type,
        video_link: link, // mapped to whatever schema user has, assuming 'video_link' or 'link'
        image_url: imageUrl,
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Failed to send notification:", error);
      throw error;
    }
  },

  /**
   * Send notification to ALL users (Admin function)
   * Note: This is client-side heavy. Ideally uses an Edge Function.
   */
  async sendToAll(message, type = "info", link = null) {
    // 1. Fetch all user IDs
    const { data: users, error: userError } = await window.supabaseClient
      .from("profiles")
      .select("id");

    if (userError) throw userError;

    if (!users || users.length === 0) return;

    // 2. Prepare batch insert
    const notifications = users.map((u) => ({
      user_id: u.id,
      message: message,
      type: type,
      video_link: link,
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    // Supabase allows bulk insert
    const { error } = await window.supabaseClient
      .from(this.tableName)
      .insert(notifications);

    if (error) throw error;
  },

  /**
   * Mark all visible notifications as read
   */
  async markAllAsReadRemote() {
    const unreadIds = this.notifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;

    await window.supabaseClient
      .from(this.tableName)
      .update({ is_read: true })
      .in("id", unreadIds);
  },

  markAllAsReadLocally() {
    this.notifications.forEach((n) => (n.is_read = true));
    this.updateBadge();
  },

  updateBadge() {
    const unread = this.notifications.filter((n) => !n.is_read).length;
    const badge = document.getElementById("notification-badge");
    if (badge) {
      badge.textContent = unread;
      badge.style.display = unread > 0 ? "flex" : "none";
    }
  },

  render() {
    const list = document.getElementById("notification-list");
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `
            <div class="notification-empty">
                <span class="material-icons">notifications_none</span>
                <p>No new notifications</p>
            </div>`;
      return;
    }

    list.innerHTML = this.notifications
      .map((n) => this.createNotificationItem(n))
      .join("");
  },

  createNotificationItem(n) {
    const iconMap = {
      info: "info",
      success: "check_circle",
      warning: "warning",
      error: "error",
      like: "thumb_up",
      reply: "reply",
      upload: "upload",
    };

    const icon = iconMap[n.type] || "notifications";
    const time = this.formatTime(n.created_at);
    const readClass = n.is_read ? "" : "unread";
    const link = n.video_link || "#";

    // Using generic image if none provided
    const img =
      n.image_url ||
      `https://ui-avatars.com/api/?name=KGR&background=0f0f0f&color=fff`;

    return `
        <a href="${link}" class="notification-item ${readClass}">
          <img src="${img}" alt="Icon" class="notif-avatar">
          <div class="notif-content">
            <span class="notif-text">${this.escapeHtml(n.message)}</span>
            <span class="notif-time">${time}</span>
          </div>
          ${
            n.type === "upload" || n.image_url
              ? `<img src="${img}" class="notif-thumbnail" style="display:none">`
              : ""
          } 
        </a>
      `;
  },

  formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  },

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  showToastNotification(n) {
    // Re-use existing toast if available or simple alert
    if (typeof showToast === "function") {
      showToast(`New notification: ${n.message}`, "info");
    }
  },
};

// Auto-init if client matches expectations
document.addEventListener("DOMContentLoaded", () => {
  // Wait a brief moment for supabaseClient to be ready in script.js
  setTimeout(() => {
    NotificationSystem.init();
  }, 500);
});
