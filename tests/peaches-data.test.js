const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDataLayer() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "js", "peaches-data.js"), "utf8"),
    context,
  );
  return context.window.PeachesData;
}

function tableClient(rowsByTable, calls) {
  return {
    select() {
      return this;
    },
    eq(column, value) {
      this.filters.push({ column, value });
      return this;
    },
    order(column, options) {
      this.orders.push({ column, options });
      return this;
    },
    limit(value) {
      this.limitValue = value;
      return this;
    },
    maybeSingle() {
      const rows = rowsByTable[this.table] || [];
      const row = rows.find((candidate) =>
        this.filters.every((filter) => candidate[filter.column] === filter.value),
      );
      return Promise.resolve({ data: row || null, error: null });
    },
    then(resolve) {
      let rows = [...(rowsByTable[this.table] || [])];
      for (const filter of this.filters) {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      }
      if (this.limitValue) rows = rows.slice(0, this.limitValue);
      calls.push({ table: this.table, filters: this.filters, orders: this.orders });
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
}

function fakeSupabase(rowsByTable, user) {
  const calls = [];
  const rpcCalls = [];
  return {
    calls,
    rpcCalls,
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    from(table) {
      return {
        table,
        filters: [],
        orders: [],
        ...tableClient(rowsByTable, calls),
      };
    },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      return Promise.resolve({ data: { id: "tx-1" }, error: null });
    },
  };
}

test("current profile resolves staff against the live Supabase schema", async () => {
  const PeachesData = loadDataLayer();
  const supabase = fakeSupabase(
    {
      staff: [{ id: "user-1", full_name: "Sophie", role: "therapist" }],
      customers: [],
    },
    { id: "user-1", email: "sophie@example.com" },
  );

  const profile = await PeachesData.create(supabase).getCurrentProfile();

  assert.deepEqual(plain(profile), {
    id: "user-1",
    role: "therapist",
    display_name: "Sophie",
    email: "sophie@example.com",
  });
}
);

test("current profile resolves customers without requiring a profiles table", async () => {
  const PeachesData = loadDataLayer();
  const supabase = fakeSupabase(
    {
      staff: [],
      customers: [{ id: "user-2", full_name: "Emma Clarke", points: 340 }],
    },
    { id: "user-2", email: "emma@example.com" },
  );

  const profile = await PeachesData.create(supabase).getCurrentProfile();

  assert.equal(profile.role, "customer");
  assert.equal(profile.display_name, "Emma Clarke");
});

test("staff point changes are written through the add_points RPC", async () => {
  const PeachesData = loadDataLayer();
  const supabase = fakeSupabase({}, { id: "staff-1", email: "sophie@example.com" });

  await PeachesData.create(supabase).addPoints({
    customerId: "customer-1",
    delta: 50,
    note: "Hollywood Wax",
  });

  assert.deepEqual(plain(supabase.rpcCalls), [
    {
      name: "add_points",
      params: {
        p_customer_id: "customer-1",
        p_delta: 50,
        p_note: "Hollywood Wax",
        p_type: "earn",
        p_voucher_id: null,
      },
    },
  ]);
});
