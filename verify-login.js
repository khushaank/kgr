/**
 * verify-login.js - KGR Secure MFA Verification Gateway
 * * This script manages the secondary authentication layer for the KGR Archive.
 * Features:
 * - Automatic challenge ID generation to prevent verification errors.
 * - 'Enter' key support for instant authorization.
 * - Automatic focus on the OTP field for speed.
 * - Session safety checks and error handling.
 */

window.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Supabase Client and DOM Elements
  const supabaseClient = window.supabaseClient;
  const confirmBtn = document.getElementById("confirm-mfa-btn");
  const otpInput = document.getElementById("login-otp");
  const msg = document.getElementById("auth-msg");

  // Safety check for global Supabase instance
  if (!supabaseClient) {
    console.error("Critical: Supabase Client not found.");
    return;
  }

  // 2. Validate Multi-Factor Authentication State
  // We retrieve the factor ID stored during the primary login step in auth.js
  const factorId = sessionStorage.getItem("mfa_factor_id");

  if (!factorId) {
    showMsg(
      "Security Error: No active MFA session found. Redirecting...",
      "error"
    );
    setTimeout(() => {
      window.location.href = "auth.html";
    }, 2000);
    return;
  }

  // 3. User Experience Enhancements
  // Automatically focus the OTP input so the researcher can type immediately
  if (otpInput) {
    otpInput.focus();
  }

  /**
   * ENTER KEY SUPPORT
   * Detects the 'Enter' key within the OTP input field to trigger authorization.
   */
  if (otpInput && confirmBtn) {
    otpInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // Prevent page refresh or unintended form behavior
        confirmBtn.click(); // Trigger the primary verification logic
      }
    });
  }

  // 4. Secondary Verification Logic
  confirmBtn.onclick = async () => {
    const code = otpInput.value.trim();

    // Basic validation: ensure the researcher entered 6 digits
    if (code.length !== 6) {
      showMsg("Authorization Failed: Please enter the 6-digit code.", "error");
      return;
    }

    // UI Feedback: Disable button to prevent duplicate challenge requests
    confirmBtn.disabled = true;
    confirmBtn.innerText = "Authorizing Access...";

    try {
      /**
       * STEP A: Create the MFA Challenge
       * * Supabase requires an active challenge ID for verification.
       * Attempting to verify a code without first creating a challenge will
       * result in a "Challenge ID not found" error.
       */
      const { data: challengeData, error: challengeError } =
        await supabaseClient.auth.mfa.challenge({ factorId });

      if (challengeError) throw challengeError;

      const challengeId = challengeData.id;

      /**
       * STEP B: Verify the OTP against the Challenge ID
       * * This finalizes the authorization. If successful, Supabase updates
       * the JWT to reflect an 'mfa' Authentication Method Reference (AMR).
       */
      const { error: verifyError } = await supabaseClient.auth.mfa.verify({
        factorId,
        challengeId: challengeId,
        code: code,
      });

      if (verifyError) throw verifyError;

      // SUCCESS: Finalize session and move to the Archive
      showMsg("Identity Authorized. Synchronizing KGR Archive...", "success");

      // Clean up the temporary factor storage
      sessionStorage.removeItem("mfa_factor_id");

      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
    } catch (err) {
      // HANDLE ERRORS: Reset UI so the researcher can try again
      showMsg(`Authorization Error: ${err.message}`, "error");
      confirmBtn.disabled = false;
      confirmBtn.innerText = "Authorize Session";

      // Clear the input and refocus for convenience
      otpInput.value = "";
      otpInput.focus();
    }
  };

  /**
   * Helper function for UI notifications
   * @param {string} text - Message content
   * @param {string} type - 'error' or 'success' for CSS styling
   */
  function showMsg(text, type) {
    if (!msg) return;
    msg.style.display = "block";
    msg.innerText = text;
    msg.className = type === "error" ? "msg-error" : "msg-success";
  }
});
