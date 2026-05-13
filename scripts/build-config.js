const fs = require("node:fs");
const path = require("node:path");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  process.exit(1);
}

const out = `window.PEACHES_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)}
};
`;

fs.writeFileSync(path.join(__dirname, "..", "js", "config.js"), out);
console.log("Generated js/config.js");
