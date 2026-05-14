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

  function initLoginIntent() {
    const buttons = Array.from(document.querySelectorAll("[data-login-intent]"));
    const copy = document.getElementById("login-copy");
    const note = document.getElementById("role-note");
    if (!buttons.length || !copy || !note) return;

    const content = {
      customer: {
        copy: "Enter your email to access your rewards",
        note: "New to Peaches? We will create your account automatically after first sign-in. Staff access is assigned by Peaches in Supabase.",
      },
      staff: {
        copy: "Use your staff email. Access opens only after Peaches assigns your staff record.",
        note: "Selecting Staff does not grant access. Staff status is checked from Supabase after sign-in; everyone else opens as a customer.",
      },
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const intent = button.dataset.loginIntent === "staff" ? "staff" : "customer";
        buttons.forEach((item) => {
          const active = item === button;
          item.classList.toggle("active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        copy.textContent = content[intent].copy;
        note.textContent = content[intent].note;
      });
    });
  }

  async function currentRole() {
    const profile = await window.getCurrentProfile();
    return profile?.role || null;
  }

  async function hydrateSessionFromUrl() {
    if (!window.supabase?.auth) return;

    const params = new URLSearchParams(window.location.search || "");
    const code = params.get("code");
    if (code && window.supabase.auth.exchangeCodeForSession) {
      const { error } = await window.supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      window.history?.replaceState?.({}, "", window.location.origin + window.location.pathname);
    }
  }

  async function handleLogoutRequest() {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("logout") !== "1") return false;

    if (window.supabase?.auth?.signOut) {
      const { error } = await window.supabase.auth.signOut();
      if (error) throw error;
    }

    window.history?.replaceState?.({}, "", "/index.html");
    setStatus("Signed out. Enter an email address to continue.", "success");
    return true;
  }

  async function signOut() {
    if (window.supabase?.auth?.signOut) {
      const { error } = await window.supabase.auth.signOut();
      if (error) throw error;
    }
    window.location.assign("/index.html");
  }

  async function currentUser() {
    const { data: userData, error: userError } = await window.supabase.auth.getUser();
    if (userError && userError.name !== "AuthSessionMissingError") throw userError;
    if (userData?.user) return userData.user;

    const { data: sessionData, error: sessionError } = await window.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    return sessionData?.session?.user || null;
  }

  async function routeSignedInUser() {
    if (!window.supabase?.auth) {
      setStatus("Supabase is not ready. Check the site configuration and reload.", "error");
      return false;
    }

    const user = await currentUser();
    if (!user) return false;

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

    if (await handleLogoutRequest()) return;
    await hydrateSessionFromUrl();
    await routeSignedInUser();

    if (!window.supabase?.auth) return;

    window.supabase.auth.onAuthStateChange?.((_event, session) => {
      if (session?.user) {
        routeSignedInUser().catch((error) => setStatus(error.message, "error"));
      }
    });

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

    if (await handleLogoutRequest()) return;
    await hydrateSessionFromUrl();
    const user = await currentUser();
    if (!user) {
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
    hydrateSessionFromUrl,
    initLoginIntent,
    initEmailLogin,
    pageForRole,
    routeSignedInUser,
    signOut,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initLoginIntent();
    initEmailLogin().catch((error) => setStatus(error.message, "error"));
    guardPageRole().catch(() => window.location.assign("/index.html"));
  });
})();
