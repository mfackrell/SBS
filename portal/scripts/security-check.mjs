import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const failures = [];

async function walk(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);

    if (entry.isDirectory()) {
      await walk(url);
      continue;
    }

    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;

    const source = await readFile(url, "utf8");
    const path = relative(new URL("..", root).pathname, url.pathname);

    if (source.includes("signUp(")) {
      failures.push(`${path}: public signUp() call found`);
    }

    if (source.includes("dangerouslySetInnerHTML")) {
      failures.push(`${path}: dangerouslySetInnerHTML found`);
    }

    if (source.includes('"use client"') || source.includes("'use client'")) {
      if (source.includes("SUPABASE_SERVICE_ROLE_KEY") || source.includes("createAdminSupabaseClient")) {
        failures.push(`${path}: server credential/admin client referenced from a client module`);
      }
    }
  }
}

await walk(root);

const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy"]) {
  if (!nextConfig.includes(header)) failures.push(`next.config.ts: missing ${header}`);
}

if (failures.length) {
  console.error("Security source check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security source check passed.");
