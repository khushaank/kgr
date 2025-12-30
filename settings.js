/**
 * settings.js - KGR Archive Researcher Management (Unified Controller)
 * Handles Section Switching, Profile Updates, 2FA Lifecycle, and Deletion Requests
 */

document.addEventListener("DOMContentLoaded", () => {
  const supabaseClient = window.supabaseClient;
  let currentUser = null;
  let avatarFile = null;
  let isUsernameAvailable = true;

  // Identity Elements
  const settingsForm = document.getElementById("settings-form");
  const avatarInput = document.getElementById("avatar-input");
  const avatarPreview = document.getElementById("avatar-preview");
  const saveBtn = document.getElementById("save-settings");
  const usernameInput = document.getElementById("set-username");
  const statusIcon = document.getElementById("username-status");
  const usernameMsg = document.getElementById("username-msg");

  // 2FA & Google Elements
  const enable2FABtn = document.getElementById("enable-2fa-btn");
  const disable2FABtn = document.getElementById("disable-2fa-btn");
  const verify2FABtn = document.getElementById("verify-2fa-btn");
  const qrContainer = document.getElementById("2fa-qr");
  const googleStatusText = document.getElementById("google-link-status");
  const googleUnlinkBtn = document.getElementById("google-unlink-btn");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const newPasswordInput = document.getElementById("new-password");

  /**
   * 1. INITIALIZATION
   */
  async function initSettingsPage() {
    const {
      data: { user },
      error,
    } = await supabaseClient.auth.getUser();
    if (error || !user) {
      window.location.href = "auth.html";
      return;
    }
    currentUser = user;

    setupSidebarNavigation();
    await loadResearcherProfile(user);
    check2FAStatus(user);
    checkGoogleLinking(user);
    setupUsernameCheck();
    setupDeleteAccountRequest();
    setupThemeInitializer();

    if (document.getElementById("raw-user-id"))
      document.getElementById("raw-user-id").innerText = user.id;

    setupPasswordSecurity();
    setupMobileBackToTop();
  }

  function setupPasswordSecurity() {
    const passInput = document.getElementById("new-password");
    const bar = document.querySelector("#password-strength .strength-bar");
    const text = document.querySelector("#password-strength .strength-text");

    if (!passInput) return;

    passInput.oninput = () => {
      const val = passInput.value;
      let score = 0;
      if (val.length > 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      bar.className = "strength-bar";
      if (val === "") {
        text.innerText = "Enter a password";
      } else if (score < 2) {
        bar.classList.add("strength-weak");
        text.innerText = "Security Level: Weak";
      } else if (score < 4) {
        bar.classList.add("strength-medium");
        text.innerText = "Security Level: Medium";
      } else {
        bar.classList.add("strength-strong");
        text.innerText = "Security Level: Strong";
      }
    };
  }

  function setupMobileBackToTop() {
    const btt = document.getElementById("back-to-top");
    if (btt) {
      window.onscroll = () => {
        btt.style.display = window.pageYOffset > 400 ? "flex" : "none";
      };
      btt.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /**
   * 2. SECTION SWITCHING (Single Page Logic)
   */
  function setupSidebarNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".settings-content");
    const backBtn = document.getElementById("mobile-back-btn");

    navItems.forEach((item) => {
      item.onclick = () => {
        const target = item.getAttribute("data-section");
        navItems.forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
        sections.forEach((s) => (s.style.display = "none"));
        document.getElementById(target).style.display = "block";
        if (window.innerWidth <= 768)
          document.body.classList.add("viewing-setting");
      };
    });

    if (backBtn)
      backBtn.onclick = () => document.body.classList.remove("viewing-setting");
  }

  /**
   * 3. PROFILE & IDENTITY FALLBACK
   */
  async function loadResearcherProfile(user) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const name =
      profile?.full_name || user.user_metadata?.full_name || "Researcher";
    const username =
      profile?.username || user.email?.split("@")[0].toLowerCase() || "user";
    const avatar =
      profile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=random&color=fff`;

    document.getElementById("set-fullname").value = name;
    usernameInput.value = username;
    avatarPreview.src = avatar;
    if (typeof window.updateUI === "function") window.updateUI();
  }

  /**
   * 4. USERNAME AVAILABILITY (Debounced)
   */
  function setupUsernameCheck() {
    const checkAvailability = debounce(async (username) => {
      if (username.length < 3) return;
      const { data } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      if (data && data.username !== currentUser.username) {
        statusIcon.innerHTML =
          '<span class="material-icons" style="color: var(--error)">cancel</span>';
        usernameMsg.innerText = "Taken";
        usernameMsg.style.color = "var(--error)";
        isUsernameAvailable = false;
      } else {
        statusIcon.innerHTML =
          '<span class="material-icons" style="color: var(--success)">check_circle</span>';
        usernameMsg.innerText = "Available";
        usernameMsg.style.color = "var(--success)";
        isUsernameAvailable = true;
      }
    }, 500);

    usernameInput.oninput = (e) => {
      statusIcon.innerHTML = '<div class="spinner-small"></div>';
      checkAvailability(e.target.value.trim());
    };
  }

  /**
   * 5. GOOGLE UNLINKING
   */
  function checkGoogleLinking(user) {
    const googleId = user.identities?.find((id) => id.provider === "google");
    if (googleId) {
      googleStatusText.textContent = "Connected";
      googleStatusText.style.color = "var(--success)";
      if (user.identities.length > 1) {
        googleUnlinkBtn.disabled = false;
        googleUnlinkBtn.onclick = async () => {
          if (!confirm("Unlink Google? Ensure you have a password set."))
            return;
          const { error } = await supabaseClient.auth.unlinkIdentity(
            googleId.id
          );
          if (!error) window.location.reload();
        };
      }
    } else {
      googleStatusText.textContent = "Not Connected";
    }
  }

  /**
   * 6. DELETE ACCOUNT REQUEST (Email Trigger)
   */
  function setupDeleteAccountRequest() {
    const deleteBtn = document.getElementById("request-deletion-btn");
    if (!deleteBtn) return;
    deleteBtn.onclick = () => {
      const name = document.getElementById("set-fullname").value;
      const user = usernameInput.value;
      const recipient = "khushaankgupta@gmail.com";
      const subject = encodeURIComponent(
        "Account Deletion Request - KGR Archive"
      );
      const body = encodeURIComponent(
        `${name} (@${user}) wants to delete his account and wants all existing account data stored with KGR-Researches to be permanently deleted.`
      );
      window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    };
  }

  /**
   * 7. PROFILE SAVING (UPSERT)
   */
  settingsForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!isUsernameAvailable) return;
    saveBtn.disabled = true;
    saveBtn.innerText = "Authorizing...";

    let avatarUrl = avatarPreview.src;
    if (avatarFile) {
      const filePath = `${currentUser.id}/avatar_${Date.now()}`;
      await supabaseClient.storage
        .from("avatars")
        .upload(filePath, avatarFile, { upsert: true });
      avatarUrl = supabaseClient.storage.from("avatars").getPublicUrl(filePath)
        .data.publicUrl;
    }

    // Removed 'updated_at' to resolve Schema Cache error
    const { error } = await supabaseClient.from("profiles").upsert({
      id: currentUser.id,
      full_name: document.getElementById("set-fullname").value,
      username: usernameInput.value.toLowerCase(),
      avatar_url: avatarUrl,
    });

    if (!error) {
      alert("Identity Verified.");
      if (window.updateUI) window.updateUI();
    }
    saveBtn.disabled = false;
    saveBtn.innerText = "Authorize Changes";
  };

  /**
   * 8. MFA LOGIC (Fixed Flicker)
   */
  async function check2FAStatus() {
    const { data: factors } = await supabaseClient.auth.mfa.listFactors();
    const verified = factors?.totp?.some((f) => f.status === "verified");
    enable2FABtn.style.display = verified ? "none" : "inline-block";
    disable2FABtn.style.display = verified ? "inline-block" : "none";
    qrContainer.style.display = "none"; // Ensures QR stays hidden on reload
  }

  enable2FABtn.onclick = async () => {
    const { data, error } = await supabaseClient.auth.mfa.enroll({
      factorType: "totp",
    });
    if (!error) {
      qrContainer.style.display = "block";
      document.getElementById("qr-code").src = data.totp.qr_code;
      verify2FABtn.dataset.factorId = data.id;
    }
  };

  verify2FABtn.onclick = async () => {
    const factorId = verify2FABtn.dataset.factorId;
    const code = document.getElementById("2fa-code").value.trim();
    const { data: challenge } = await supabaseClient.auth.mfa.challenge({
      factorId,
    });
    const { error } = await supabaseClient.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (!error) {
      alert("MFA Enabled.");
      window.location.reload();
    }
  };

  /**
   * 9. THEME SELECTOR LOGIC
   */
  window.setTheme = (themeName) => {
    if (window.applyTheme) {
      window.applyTheme(themeName);

      // Update UI selection state
      document.querySelectorAll(".theme-option").forEach((opt) => {
        opt.style.borderColor = "var(--card-border)";
        opt.classList.remove("active");
      });

      const activeOpt = document.getElementById(`theme-${themeName}`);
      if (activeOpt) {
        activeOpt.style.borderColor = "var(--accent)";
        activeOpt.classList.add("active");
      }
    }
  };

  function setupThemeInitializer() {
    const savedTheme = localStorage.getItem("kgr_theme") || "default";
    window.setTheme(savedTheme);
  }

  /**
   * 10. PASSWORD MANAGEMENT
   */
  if (changePasswordBtn) {
    changePasswordBtn.onclick = async () => {
      const newPassword = newPasswordInput.value;
      if (newPassword.length < 8) {
        alert("Security Error: Password must be at least 8 characters.");
        return;
      }

      changePasswordBtn.disabled = true;
      changePasswordBtn.innerText = "Authorizing...";

      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        alert(`Failed to update password: ${error.message}`);
      } else {
        alert("Password updated successfully.");
        newPasswordInput.value = "";
      }
      changePasswordBtn.disabled = false;
      changePasswordBtn.innerText = "Update Password";
    };
  }

  // Helpers
  function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }
  avatarInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      avatarFile = file;
      avatarPreview.src = URL.createObjectURL(file);
    }
  };
  window.togglePassword = (id) => {
    const i = document.getElementById(id);
    i.type = i.type === "password" ? "text" : "password";
  };

  initSettingsPage();
});
