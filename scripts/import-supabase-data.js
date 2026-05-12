import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url));

loadLocalEnv();

const supabaseUrl = stripTrailingSlash(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "meal-images";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function requireSupabaseConfig() {
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for import.");
}

function latestExportDir() {
  const exportsDir = join(projectDir, "backup", "exports");
  const dirs = readdirSync(exportsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(exportsDir, entry.name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error("No export folders found under backup/exports.");
  return dirs[0];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function publicStorageUrl(objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(storageBucket)}/${encodedPath}`;
}

function storagePathForLegacyUpload(value) {
  if (!value || !value.startsWith("/uploads/")) return null;
  return `legacy/${value.split("/").pop()}`;
}

function mapImageUrl(value) {
  const objectPath = storagePathForLegacyUpload(value);
  return objectPath ? publicStorageUrl(objectPath) : value;
}

function contentTypeFor(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function supabaseRest(path, { method = "GET", query = {}, body, prefer = "return=minimal" } = {}) {
  requireSupabaseConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `Supabase import request failed (${response.status}).`;
    try {
      const data = JSON.parse(text);
      message = data.message || data.hint || data.details || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

async function uploadFile(sourcePath, objectPath) {
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(storageBucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": contentTypeFor(sourcePath),
      "x-upsert": "true",
    },
    body: readFileSync(sourcePath),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage upload failed for ${basename(sourcePath)} (${response.status}): ${text}`);
  }
}

function normalizeMeal(meal) {
  return {
    ...meal,
    image_url: mapImageUrl(meal.image_url),
    ingredients_image_url: mapImageUrl(meal.ingredients_image_url),
    nutrition_image_url: mapImageUrl(meal.nutrition_image_url),
  };
}

const exportDir = resolve(projectDir, process.argv[2] || latestExportDir());
const mealsPath = join(exportDir, "meals.json");
const ordersPath = join(exportDir, "meal_orders.json");
const uploadsManifestPath = join(exportDir, "uploads-manifest.json");

for (const path of [mealsPath, ordersPath, uploadsManifestPath]) {
  if (!existsSync(path)) throw new Error(`Missing export file: ${path}`);
}

const meals = readJson(mealsPath).map(normalizeMeal);
const mealOrders = readJson(ordersPath);
const uploads = readJson(uploadsManifestPath);

console.log(`Import source: ${exportDir}`);
console.log(`Uploading ${uploads.length} files to Supabase Storage bucket "${storageBucket}"...`);

for (const upload of uploads) {
  const sourcePath = join(exportDir, upload.exported_relative_path);
  await uploadFile(sourcePath, `legacy/${upload.file_name}`);
}

console.log(`Upserting ${meals.length} meals...`);
await supabaseRest("meals", {
  method: "POST",
  query: { on_conflict: "id" },
  body: meals,
  prefer: "resolution=merge-duplicates,return=minimal",
});

console.log(`Upserting ${mealOrders.length} meal orders...`);
await supabaseRest("meal_orders", {
  method: "POST",
  query: { on_conflict: "id" },
  body: mealOrders,
  prefer: "resolution=merge-duplicates,return=minimal",
});

console.log("Supabase import complete.");
