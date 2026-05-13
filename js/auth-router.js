(function () {
  const STAFF_ROLES = new Set(["therapist", "admin"]);

  function pageForRole(role) {
    return STAFF_ROLES.has(role) ? "/staff.html" : "/customer.html";
  }

  function setStatus(message, tone) {
    const el = document.getElementById("auth-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone || "";
  }

  async function currentRole() {
    const profile = await window.getCurrentProfile();
    return profile?.role || null;
  }

  async function routeSignedInUser() {
    if (!window.supabase?.auth) {
      setStatus("Supabase is not ready. Check the site configuration and reload.", "error");
      return false;
    }

    const { data } = await window.supabase.auth.getUser();
    if (!data?.user) return false;

    const role = await currentRole();
    if (!role) {
      setStatus("Your account is signed in, but no profile was found.", "error");
      return true;
    }

    window.location.assign(pageForRole(role));
    return true;
  }

  async function initEmailLogin() {
    const form = document.getElementById("email-login-form");
    if (!form) return;

    await routeSignedInUser();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("email");
      const email = input?.value.trim();
      if (!email) {
        setStatus("Enter your email address.", "error");
        return;
      }

      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      setStatus("Sending secure sign-in link...", "");

      const { error } = await window.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + "/index.html",
        },
      });

      button.disabled = false;
      if (error) {
        setStatus(error.message, "error");
        return;
      }

      setStatus("Check your email. After you sign in, we will open the right app for your account.", "success");
    });
  }

  async function guardPageRole() {
    const requiredRole = document.body.dataset.requiredRole;
    if (!requiredRole) return;
    if (!window.supabase?.auth) return;

    const { data } = await window.supabase.auth.getUser();
    if (!data?.user) {
      window.location.assign("/index.html");
      return;
    }

    const role = await currentRole();
    const allowed = requiredRole === "therapist"
      ? STAFF_ROLES.has(role)
      : role === requiredRole;

    if (!allowed) {
      window.location.assign(pageForRole(role));
    }
  }

  window.PeachesAuth = {
    guardPageRole,
    initEmailLogin,
    pageForRole,
    routeSignedInUser,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initEmailLogin().catch((error) => setStatus(error.message, "error"));
    guardPageRole().catch(() => window.location.assign("/index.html"));
  });
})();
