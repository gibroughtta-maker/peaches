const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadRouter({
  hasEmailForm = false,
  href = "http://127.0.0.1:4173/index.html",
  profile,
  supabase,
}) {
  const listeners = {};
  const assigned = [];
  const replaced = [];
  const form = { addEventListener() {}, querySelector: () => ({ disabled: false }) };
  const elements = [];
  const status = { textContent: "", dataset: {} };
  const context = {
    URL,
    URLSearchParams,
    console,
    document: {
      body: { dataset: {} },
      getElementById(id) {
        if (id === "email-login-form" && hasEmailForm) return form;
        return id === "auth-status" ? status : null;
      },
      querySelectorAll(selector) {
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
  return { assigned, elements, listeners, replaced, status, window: context.window };
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
