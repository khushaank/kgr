/**
 * auth.js - KGR Secure Gateway (MFA Integrated)
 * handles Secure Login, Registration, and Google OAuth
 * * Features:
 * - Username or Email login support
 * - MFA state detection and redirection
 * - Enter-key submission for seamless UX
 * - Robust error handling for database connection
 */

window.addEventListener("DOMContentLoaded", () => {
  // 1. DOM Elements
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authSubtitle = document.getElementById("auth-subtitle");
  const submitBtn = document.getElementById("submit-btn");
  const toggleBtn = document.getElementById("toggle-auth");
  const signupFields = document.querySelectorAll(".signup-only");
  const msg = document.getElementById("auth-msg");
  const googleBtn = document.getElementById("google-btn");

  // Form Inputs
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const fullNameInput = document.getElementById("full-name");
  const usernameInput = document.getElementById("username");

  let isLogin = true;

  // 2. Client Safety Check
  const supabaseClient = window.supabaseClient;

  if (!supabaseClient) {
    console.error(
      "Critical: Supabase Client not found. Ensure configuration is loaded."
    );
    if (msg) showMsg("System error: Database connection failed.", "error");
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  /**
   * 2.1 SECURE MFA MONITOR
   * Automatically detects if a researcher is signed in via OAuth (like Google)
   * and requires a secondary MFA challenge.
   */
  async function checkMFA() {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    if (!session) return; // Not logged in, stay on auth page

    const {
      data: { currentLevel, nextLevel },
    } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();

    // Case A: Identity is partially authorized (AAL1) but requires MFA (AAL2)
    if (currentLevel === "aal1" && nextLevel === "aal2") {
      const { data: factors, error: mfaError } =
        await supabaseClient.auth.mfa.listFactors();

      if (mfaError) {
        console.error("MFA Factor Lookup Error:", mfaError);
        return;
      }

      const activeFactor =
        factors.totp && factors.totp.find((f) => f.status === "verified");

      if (activeFactor) {
        sessionStorage.setItem("mfa_factor_id", activeFactor.id);
        showMsg("MFA Challenge required. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "verify-login.html";
        }, 800);
        return;
      }
    }

    // Case B: Identity is fully authorized (AAL2) or no MFA is set up
    // Allow entry into the KGR Archive
    window.location.href = "index.html";
  }

  // Execute check on load to handle OAuth redirects
  checkMFA();

  /**
   * UI TOGGLE LOGIC
   * Switches between "Authorize Access" (Login) and "Request Registration" (Signup)
   */
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      isLogin = !isLogin;

      // Update Text Content
      authTitle.innerText = isLogin
        ? "Research Access"
        : "Request Registration";
      if (authSubtitle) {
        authSubtitle.innerText = isLogin
          ? "Enter your credentials to access the laboratory database."
          : "Create your researcher identity within the KGR Archive.";
      }
      submitBtn.innerText = isLogin ? "Authorize Access" : "Create Account";

      // Toggle Visibility of Signup-specific fields
      signupFields.forEach((f) => {
        f.style.display = isLogin ? "none" : "block";
      });

      // Update Toggle Link Text
      toggleBtn.innerHTML = isLogin
        ? "Need an account? <span>Request Registration</span>"
        : "Already have an account? <span>Login</span>";

      // Reset error messages on toggle
      msg.style.display = "none";
    };
  }

  /**
   * KEYBOARD NAVIGATION
   * Allows the researcher to hit 'Enter' to submit the form immediately.
   */
  [emailInput, passwordInput, fullNameInput, usernameInput].forEach((input) => {
    if (input) {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleAuthSubmission();
        }
      });
    }
  });

  /**
   * FORM SUBMISSION HANDLER
   */
  if (authForm) {
    authForm.onsubmit = async (e) => {
      e.preventDefault();
      await handleAuthSubmission();
    };
  }

  async function handleAuthSubmission() {
    const emailVal = emailInput.value.trim();
    const passwordVal = passwordInput.value;

    if (!emailVal || !passwordVal) {
      showMsg("Missing credentials. Identification required.", "error");
      return;
    }

    // UI Loading State
    msg.style.display = "block";
    msg.className = "";
    msg.innerText = "Authorizing Identity...";
    submitBtn.disabled = true;

    try {
      if (isLogin) {
        // --- LOGIN LOGIC ---
        let emailToUse = emailVal;

        // Check if input is Username (no @) or Email
        if (!emailVal.includes("@")) {
          const { data, error: userError } = await supabaseClient
            .from("profiles")
            .select("email")
            .eq("username", emailVal.toLowerCase())
            .single();

          if (userError || !data) throw new Error("Researcher ID not found.");
          emailToUse = data.email;
        }

        // Step A: Primary Password Authentication
        const { data: authData, error: authError } =
          await supabaseClient.auth.signInWithPassword({
            email: emailToUse,
            password: passwordVal,
          });

        if (authError) throw authError;

        // Step B: Multi-Factor Authentication (MFA) Check
        const { data: factors, error: mfaError } =
          await supabaseClient.auth.mfa.listFactors();
        if (mfaError) throw mfaError;

        // Look for verified TOTP factors
        const activeFactor =
          factors.totp && factors.totp.find((f) => f.status === "verified");

        if (activeFactor) {
          // SECURE REDIRECT: User must pass the MFA Gateway
          sessionStorage.setItem("mfa_factor_id", activeFactor.id);
          showMsg("MFA Challenge required. Redirecting...", "success");

          setTimeout(() => {
            window.location.href = "verify-login.html";
          }, 800);
        } else {
          // STANDARD REDIRECT: Access granted directly
          window.location.href = "index.html";
        }
      } else {
        // --- SIGNUP LOGIC ---
        const fullName = fullNameInput.value.trim();
        const username = usernameInput.value.trim().toLowerCase();

        if (!fullName || !username) {
          throw new Error("Full name and unique username are required.");
        }

        const { data: signUpData, error: signUpError } =
          await supabaseClient.auth.signUp({
            email: emailVal,
            password: passwordVal,
          });

        if (signUpError) throw signUpError;

        if (!signUpData.user)
          throw new Error("Registration failed. Please try again.");

        // Create Researcher Profile Entry
        const { error: profileError } = await supabaseClient
          .from("profiles")
          .insert([
            {
              id: signUpData.user.id,
              full_name: fullName,
              username: username,
              email: emailVal,
            },
          ]);

        if (profileError) throw profileError;

        showMsg("Identity created. Authorizing access...", "success");
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1500);
      }
    } catch (err) {
      showMsg(err.message, "error");
      submitBtn.disabled = false;
    }
  }
  /**
   * GOOGLE OAUTH LOGIC
   */
  if (googleBtn) {
    googleBtn.onclick = async (e) => {
      e.preventDefault();
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth.html",
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });

      if (error) showMsg(`OAuth Gateway Error: ${error.message}`, "error");
    };
  }

  /**
   * HELPER: UI MESSAGING
   */
  function showMsg(text, type) {
    if (!msg) return;
    msg.style.display = "block";
    msg.innerText = text;
    msg.className = type === "error" ? "msg-error" : "msg-success";
  }
});
