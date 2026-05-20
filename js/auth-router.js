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

  function cleanOrigin(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function signInRedirectTo() {
    const configuredSiteUrl = cleanOrigin(window.PEACHES_CONFIG?.SITE_URL);
    const currentOrigin = cleanOrigin(window.location.origin);
    const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(currentOrigin);
    const productionSiteUrl = "https://peaches-puce.vercel.app";
    const origin = configuredSiteUrl || (localOrigin ? productionSiteUrl : currentOrigin);
    return `${origin}/`;
  }

  function passwordResetRedirectTo() {
    return `${cleanOrigin(signInRedirectTo())}/reset-password.html`;
  }

  function setAuthMode(mode) {
    const nextMode = mode === "register" || mode === "reset" ? mode : "login";
    const buttons = Array.from(document.querySelectorAll("[data-auth-mode]"));
    const confirmGroup = document.getElementById("confirm-password-group");
    const confirmInput = document.getElementById("confirm-password");
    const fullNameGroup = document.getElementById("full-name-group");
    const fullNameInput = document.getElementById("full-name");
    const birthDateGroup = document.getElementById("birth-date-group");
    const birthDateInput = document.getElementById("birth-date");
    const passwordGroup = document.getElementById("password-group");
    const passwordInput = document.getElementById("password");
    const submitButton = document.getElementById("auth-submit");
    const forgotPasswordButton = document.getElementById("forgot-password");
    const backToLoginButton = document.getElementById("back-to-login");
    const copy = document.getElementById("login-copy");
    const note = document.getElementById("role-note");
    const form = document.getElementById("email-login-form");
    const isRegister = nextMode === "register";
    const isReset = nextMode === "reset";

    if (form) form.dataset.authMode = nextMode;
    buttons.forEach((button) => {
      const active = button.dataset.authMode === nextMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (passwordGroup) passwordGroup.hidden = isReset;
    if (fullNameGroup) fullNameGroup.hidden = !isRegister;
    if (birthDateGroup) birthDateGroup.hidden = !isRegister;
    if (fullNameInput) fullNameInput.required = isRegister;
    if (birthDateInput) birthDateInput.required = isRegister;
    if (confirmGroup) confirmGroup.hidden = !isRegister;
    if (confirmInput) confirmInput.required = isRegister;
    if (passwordInput) {
      passwordInput.required = !isReset;
      passwordInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    }
    if (submitButton) {
      submitButton.textContent = isReset ? "Send reset link" : isRegister ? "Register" : "Log in";
    }
    if (forgotPasswordButton) forgotPasswordButton.hidden = isReset;
    if (backToLoginButton) backToLoginButton.hidden = !isReset;
    if (copy && isReset) copy.textContent = "Enter your email and we will send a password reset link";
    if (copy && !isReset) copy.textContent = "Log in or register with your email and password";
    if (note && isReset) note.textContent = "Use the link in your email to open the password reset page and choose a new password.";
    if (note && !isReset) note.textContent = "New to Peaches? Register with your email and we will create your customer account automatically. Staff access is managed by Peaches in Supabase.";
  }

  function initAuthMode() {
    const buttons = Array.from(document.querySelectorAll("[data-auth-mode]"));
    if (!buttons.length) return;
    buttons.forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });
    setAuthMode("login");
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
      const fullNameInput = document.getElementById("full-name");
      const birthDateInput = document.getElementById("birth-date");
      const passwordInput = document.getElementById("password");
      const confirmInput = document.getElementById("confirm-password");
      const email = input?.value.trim();
      const fullName = fullNameInput?.value.trim() || "";
      const birthDate = birthDateInput?.value || "";
      const password = passwordInput?.value || "";
      if (!email) {
        setStatus(form.dataset.authMode === "reset" ? "Enter your email address to reset your password." : "Enter your email address.", "error");
        return;
      }
      if (form.dataset.authMode === "reset") {
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        setStatus("Sending password reset email...", "");
        try {
          const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: passwordResetRedirectTo(),
          });
          if (error) throw error;
          setStatus("Password reset email sent. Open it to set a new password.", "success");
        } catch (error) {
          setStatus(error.message, "error");
        } finally {
          button.disabled = false;
        }
        return;
      }
      if (!password) {
        setStatus("Enter your password.", "error");
        return;
      }
      if (form.dataset.authMode === "register" && !fullName) {
        setStatus("Enter your full name.", "error");
        return;
      }
      if (form.dataset.authMode === "register" && !birthDate) {
        setStatus("Enter your birthday.", "error");
        return;
      }
      if (form.dataset.authMode === "register" && password !== (confirmInput?.value || "")) {
        setStatus("Passwords do not match.", "error");
        return;
      }

      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      setStatus(form.dataset.authMode === "register" ? "Creating your account..." : "Signing in...", "");

      try {
        if (form.dataset.authMode === "register") {
          const { data, error } = await window.supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                birth_date: birthDate,
                full_name: fullName,
                login_intent: "customer",
              },
              emailRedirectTo: signInRedirectTo(),
            },
          });
          if (error) throw error;
          if (data?.session) {
            await routeSignedInUser();
            return;
          }
          setStatus("Check your email to confirm your account, then log in with your password.", "success");
          return;
        }

        const { error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await routeSignedInUser();
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        button.disabled = false;
      }
    });

    const forgotPasswordButton = document.getElementById("forgot-password");
    forgotPasswordButton?.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthMode("reset");
      setStatus("Enter your email address and we will send a password reset link.", "");
    });

    document.getElementById("back-to-login")?.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthMode("login");
      setStatus("", "");
    });
  }

  async function initPasswordReset() {
    const form = document.getElementById("password-reset-form");
    if (!form) return;

    if (!window.supabase?.auth) {
      setStatus("Supabase is not ready. Check the site configuration and reload.", "error");
      return;
    }

    await hydrateSessionFromUrl();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("reset-password")?.value || "";
      const confirmPassword = document.getElementById("reset-password-confirm")?.value || "";
      if (!password) {
        setStatus("Enter a new password.", "error");
        return;
      }
      if (password !== confirmPassword) {
        setStatus("Passwords do not match.", "error");
        return;
      }

      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      setStatus("Updating password...", "");
      try {
        const { error } = await window.supabase.auth.updateUser({ password });
        if (error) throw error;
        setStatus("Password updated. Log in with your new password.", "success");
        if (window.supabase.auth.signOut) {
          const { error: signOutError } = await window.supabase.auth.signOut();
          if (signOutError) throw signOutError;
        }
        window.location.assign("/index.html");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        button.disabled = false;
      }
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
    initAuthMode,
    initEmailLogin,
    initPasswordReset,
    pageForRole,
    passwordResetRedirectTo,
    routeSignedInUser,
    signInRedirectTo,
    signOut,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initAuthMode();
    initEmailLogin().catch((error) => setStatus(error.message, "error"));
    initPasswordReset().catch((error) => setStatus(error.message, "error"));
    guardPageRole().catch(() => window.location.assign("/index.html"));
  });
})();
