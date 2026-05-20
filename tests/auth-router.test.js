const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadRouter({
  hasEmailForm = false,
  hasResetForm = false,
  href = "http://127.0.0.1:4173/index.html",
  profile,
  supabase,
}) {
  const listeners = {};
  const assigned = [];
  const replaced = [];
  const makeElement = (value = "") => ({
    value,
    textContent: "",
    hidden: false,
    disabled: false,
    required: false,
    dataset: {},
    attributes: {},
    classList: { toggle() {} },
    setAttribute(name, nextValue) {
      this.attributes[name] = nextValue;
    },
    addEventListener(_event, handler) {
      this.handler = handler;
    },
  });
  const submitButton = makeElement();
  const form = {
    dataset: {},
    handler: null,
    addEventListener(_event, handler) { this.handler = handler; },
    querySelector: () => submitButton,
  };
  const resetForm = {
    dataset: {},
    handler: null,
    addEventListener(_event, handler) { this.handler = handler; },
    querySelector: () => submitButton,
  };
  const elements = [];
  const authModeButtons = [
    makeElement(),
    makeElement(),
  ];
  authModeButtons[0].dataset.authMode = "login";
  authModeButtons[1].dataset.authMode = "register";
  const email = makeElement("user@example.com");
  const password = makeElement("secret123");
  const confirmPassword = makeElement("secret123");
  const confirmPasswordGroup = makeElement();
  const forgotPassword = makeElement();
  const resetPassword = makeElement("new-secret123");
  const resetPasswordConfirm = makeElement("new-secret123");
  const status = { textContent: "", dataset: {} };
  const context = {
    URL,
    URLSearchParams,
    console,
    document: {
      body: { dataset: {} },
      getElementById(id) {
        if (id === "email-login-form" && hasEmailForm) return form;
        if (id === "password-reset-form" && hasResetForm) return resetForm;
        if (id === "email") return email;
        if (id === "password") return password;
        if (id === "confirm-password") return confirmPassword;
        if (id === "confirm-password-group") return confirmPasswordGroup;
        if (id === "forgot-password") return forgotPassword;
        if (id === "reset-password") return resetPassword;
        if (id === "reset-password-confirm") return resetPasswordConfirm;
        if (id === "auth-submit") return submitButton;
        return id === "auth-status" ? status : null;
      },
      querySelectorAll(selector) {
        if (selector === "[data-auth-mode]") return authModeButtons;
        return selector === "[data-login-intent]" ? elements : [];
      },
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    },
    window: {
      supabase,
      getCurrentProfile: async () => profile,
      location: {
        href,
        origin: "http://127.0.0.1:4173",
        pathname: new URL(href).pathname,
        search: new URL(href).search,
        hash: new URL(href).hash,
        assign(url) {
          assigned.push(url);
        },
      },
      history: {
        replaceState(_state, _title, url) {
          replaced.push(url);
        },
      },
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "auth-router.js"), "utf8"),
    context,
  );
  return {
    assigned,
    authModeButtons,
    elements,
    forgotPassword,
    form,
    listeners,
    replaced,
    resetForm,
    status,
    submitButton,
    window: context.window,
  };
}

test("routeSignedInUser routes from a persisted session when getUser is not ready yet", async () => {
  const { assigned, window } = loadRouter({
    profile: { id: "user-1", role: "customer" },
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: null } }),
        getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
      },
    },
  });

  assert.equal(await window.PeachesAuth.routeSignedInUser(), true);
  assert.deepEqual(assigned, ["/customer.html"]);
});

test("routeSignedInUser treats missing auth session as signed out", async () => {
  const { assigned, status, window } = loadRouter({
    profile: null,
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
        }),
        getSession: async () => ({ data: { session: null } }),
      },
    },
  });

  assert.equal(await window.PeachesAuth.routeSignedInUser(), false);
  assert.deepEqual(assigned, []);
  assert.equal(status.textContent, "");
});


test("hydrateSessionFromUrl exchanges a code callback before routing", async () => {
  const exchanged = [];
  const { assigned, window } = loadRouter({
    href: "http://127.0.0.1:4173/index.html?code=abc123",
    profile: { id: "staff-1", role: "therapist" },
    supabase: {
      auth: {
        exchangeCodeForSession: async (code) => {
          exchanged.push(code);
          return { error: null };
        },
        getUser: async () => ({ data: { user: { id: "staff-1" } } }),
        getSession: async () => ({ data: { session: { user: { id: "staff-1" } } } }),
      },
    },
  });

  await window.PeachesAuth.hydrateSessionFromUrl();
  assert.deepEqual(exchanged, ["abc123"]);
  assert.equal(await window.PeachesAuth.routeSignedInUser(), true);
  assert.deepEqual(assigned, ["/staff.html"]);
});

test("initEmailLogin does not throw when Supabase auth is not ready", async () => {
  const { status, window } = loadRouter({
    hasEmailForm: true,
    profile: null,
    supabase: {},
  });

  await window.PeachesAuth.initEmailLogin();

  assert.equal(status.textContent, "Supabase is not ready. Check the site configuration and reload.");
  assert.equal(status.dataset.tone, "error");
});

test("initEmailLogin signs out when logout query is present", async () => {
  const signedOut = [];
  const { assigned, replaced, status, window } = loadRouter({
    hasEmailForm: true,
    href: "http://127.0.0.1:4173/index.html?logout=1",
    profile: null,
    supabase: {
      auth: {
        signOut: async () => {
          signedOut.push(true);
          return { error: null };
        },
      },
    },
  });

  await window.PeachesAuth.initEmailLogin();

  assert.deepEqual(signedOut, [true]);
  assert.deepEqual(replaced, ["/index.html"]);
  assert.deepEqual(assigned, []);
  assert.equal(status.textContent, "Signed out. Enter an email address to continue.");
  assert.equal(status.dataset.tone, "success");
});

test("initEmailLogin signs in with email and password", async () => {
  let signedIn = false;
  const calls = [];
  const { assigned, form, window } = loadRouter({
    hasEmailForm: true,
    profile: { id: "user-1", role: "customer" },
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: signedIn ? { id: "user-1" } : null } }),
        getSession: async () => ({ data: { session: signedIn ? { user: { id: "user-1" } } : null } }),
        onAuthStateChange() {},
        signInWithPassword: async (payload) => {
          calls.push(payload);
          signedIn = true;
          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
    },
  });

  window.PeachesAuth.initAuthMode();
  await window.PeachesAuth.initEmailLogin();
  await form.handler({ preventDefault() {} });

  assert.equal(calls[0].email, "user@example.com");
  assert.equal(calls[0].password, "secret123");
  assert.deepEqual(assigned, ["/customer.html"]);
});

test("initEmailLogin registers with email and password and waits for confirmation", async () => {
  const calls = [];
  const { assigned, authModeButtons, form, status, window } = loadRouter({
    hasEmailForm: true,
    profile: null,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: null } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange() {},
        signUp: async (payload) => {
          calls.push(payload);
          return { data: { user: { id: "new-user" }, session: null }, error: null };
        },
      },
    },
  });

  window.PeachesAuth.initAuthMode();
  await window.PeachesAuth.initEmailLogin();
  authModeButtons[1].handler();
  await form.handler({ preventDefault() {} });

  assert.equal(calls[0].email, "user@example.com");
  assert.equal(calls[0].password, "secret123");
  assert.equal(calls[0].options.emailRedirectTo, "https://peaches-puce.vercel.app/");
  assert.deepEqual(assigned, []);
  assert.match(status.textContent, /confirm your account/i);
  assert.equal(status.dataset.tone, "success");
});

test("forgot password sends a reset email to the reset password page", async () => {
  const calls = [];
  const { forgotPassword, status, window } = loadRouter({
    hasEmailForm: true,
    profile: null,
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: null } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange() {},
        resetPasswordForEmail: async (...args) => {
          calls.push(args);
          return { data: {}, error: null };
        },
      },
    },
  });

  await window.PeachesAuth.initEmailLogin();
  await forgotPassword.handler({ preventDefault() {} });

  assert.equal(calls[0][0], "user@example.com");
  assert.equal(calls[0][1].redirectTo, "https://peaches-puce.vercel.app/reset-password.html");
  assert.match(status.textContent, /password reset/i);
  assert.equal(status.dataset.tone, "success");
});

test("reset password page updates the current user's password", async () => {
  const updated = [];
  const signedOut = [];
  const { assigned, resetForm, status, window } = loadRouter({
    hasResetForm: true,
    href: "http://127.0.0.1:4173/reset-password.html?code=reset-code",
    profile: null,
    supabase: {
      auth: {
        exchangeCodeForSession: async () => ({ error: null }),
        updateUser: async (payload) => {
          updated.push(payload);
          return { data: {}, error: null };
        },
        signOut: async () => {
          signedOut.push(true);
          return { error: null };
        },
      },
    },
  });

  await window.PeachesAuth.initPasswordReset();
  await resetForm.handler({ preventDefault() {} });

  assert.equal(updated[0].password, "new-secret123");
  assert.deepEqual(signedOut, [true]);
  assert.deepEqual(assigned, ["/index.html"]);
  assert.match(status.textContent, /updated/i);
  assert.equal(status.dataset.tone, "success");
});

test("login intent changes copy without granting a frontend role", () => {
  const copy = { textContent: "" };
  const note = { textContent: "" };
  const buttons = [];
  const customer = {
    classList: { toggle() {} },
    dataset: { loginIntent: "customer" },
    setAttribute() {},
    addEventListener(_event, handler) { this.handler = handler; },
  };
  const staff = {
    classList: { toggle() {} },
    dataset: { loginIntent: "staff" },
    setAttribute() {},
    addEventListener(_event, handler) { this.handler = handler; },
  };
  buttons.push(customer, staff);

  const { window } = loadRouter({
    profile: null,
    supabase: {},
  });
  window.document.querySelectorAll = (selector) => selector === "[data-login-intent]" ? buttons : [];
  window.document.getElementById = (id) => {
    if (id === "login-copy") return copy;
    if (id === "role-note") return note;
    return null;
  };

  window.PeachesAuth.initLoginIntent();
  staff.handler();

  assert.match(copy.textContent, /staff email/i);
  assert.match(note.textContent, /does not grant access/i);
});
