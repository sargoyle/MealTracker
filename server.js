import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

loadLocalEnv();

const supabaseUrl = stripTrailingSlash(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "meal-images";

const enums = {
  meal_type: ["Dinner", "Breakfast", "Lunch"],
  rating: ["Favourite", "Fine", "Avoid", "Not rated"],
  season: ["Autumn", "Winter", "Spring", "Summer"],
  day_available: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  status: ["Active", "Removed"],
};

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(__dirname, file);
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
  if (!supabaseKey) throw new Error("Supabase API key is not configured.");
}

function cleanOptional(value) {
  return value === "" || value === undefined ? null : value;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Order date is invalid.");
  return new Date(year, month - 1, day);
}

function getThursdayWeekStart(value) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) throw new Error("Order date is invalid.");
  const day = date.getDay();
  const daysSinceThursday = (day + 3) % 7;
  date.setDate(date.getDate() - daysSinceThursday);
  return toIsoDate(date);
}

function validateMeal(payload, partial = false) {
  const archiveValue = payload.archive;
  const meal = {
    meal_name: cleanOptional(payload.meal_name),
    meal_provider: cleanOptional(payload.meal_provider),
    meal_type: cleanOptional(payload.meal_type) || "Dinner",
    image_url: cleanOptional(payload.image_url),
    ingredients_image_url: cleanOptional(payload.ingredients_image_url),
    nutrition_image_url: cleanOptional(payload.nutrition_image_url),
    description: cleanOptional(payload.description),
    rating: cleanOptional(payload.rating) || "Not rated",
    notes: cleanOptional(payload.notes),
    last_ordered_date: cleanOptional(payload.last_ordered_date),
    season: cleanOptional(payload.season),
    week_number: cleanOptional(payload.week_number),
    day_available: cleanOptional(payload.day_available),
    status: cleanOptional(payload.status) || "Active",
    archive: archiveValue === true || archiveValue === "true" || archiveValue === "on" || archiveValue === "1" || archiveValue === 1,
  };

  if (!partial || payload.meal_name !== undefined) {
    if (!meal.meal_name) throw new Error("Meal name is required.");
    if (meal.meal_name.length > 200) throw new Error("Meal name must be 200 characters or fewer.");
  }
  if (!enums.meal_type.includes(meal.meal_type)) throw new Error("Meal type is invalid.");
  if (!enums.rating.includes(meal.rating)) throw new Error("Rating is invalid.");
  if (!enums.status.includes(meal.status)) throw new Error("Status is invalid.");
  if (meal.season && !enums.season.includes(meal.season)) throw new Error("Season is invalid.");
  if (meal.day_available && !enums.day_available.includes(meal.day_available)) throw new Error("Day available is invalid.");
  if (meal.week_number !== null) {
    const week = Number(meal.week_number);
    if (!Number.isInteger(week) || week <= 0) throw new Error("Week number must be a positive number.");
    meal.week_number = week;
  }
  return meal;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function supabaseHeaders(extra = {}) {
  requireSupabaseConfig();
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseKey}`,
    ...extra,
  };
}

async function supabaseRest(path, { method = "GET", query = {}, body, headers = {}, prefer } = {}) {
  requireSupabaseConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: supabaseHeaders({
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
      ...headers,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.hint || data?.details || `Supabase request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

function storagePublicUrl(objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(storageBucket)}/${encodedPath}`;
}

function legacyUploadUrlToStorageUrl(value) {
  if (!value || !value.startsWith("/uploads/")) return value;
  return storagePublicUrl(`legacy/${value.split("/").pop()}`);
}

function resolveMealImageUrls(meal) {
  if (!meal) return meal;
  return {
    ...meal,
    image_url: legacyUploadUrlToStorageUrl(meal.image_url),
    ingredients_image_url: legacyUploadUrlToStorageUrl(meal.ingredients_image_url),
    nutrition_image_url: legacyUploadUrlToStorageUrl(meal.nutrition_image_url),
  };
}

function sortMeals(meals, sort = "meal_name") {
  const byName = (a, b) => a.meal_name.localeCompare(b.meal_name, undefined, { sensitivity: "base" });
  const avoidLast = (a, b) => (a.rating === "Avoid" ? 1 : 0) - (b.rating === "Avoid" ? 1 : 0);

  return [...meals].sort((a, b) => {
    if (sort === "last_ordered_date") {
      if (!a.last_ordered_date && b.last_ordered_date) return 1;
      if (a.last_ordered_date && !b.last_ordered_date) return -1;
      if (a.last_ordered_date !== b.last_ordered_date) return String(b.last_ordered_date || "").localeCompare(String(a.last_ordered_date || ""));
      return byName(a, b);
    }
    if (sort === "order_count") {
      const countDiff = Number(b.order_count || 0) - Number(a.order_count || 0);
      return countDiff || byName(a, b);
    }
    return avoidLast(a, b) || byName(a, b);
  });
}

async function getMeals(url) {
  const params = url.searchParams;
  const query = { select: "*" };
  const status = params.get("status") || "Active";

  if (status !== "All") query.status = `eq.${status}`;
  if (params.get("rating") && params.get("rating") !== "All") query.rating = `eq.${params.get("rating")}`;
  if (params.get("meal_type") && params.get("meal_type") !== "All") query.meal_type = `eq.${params.get("meal_type")}`;
  if (params.get("season") && params.get("season") !== "All") query.season = `eq.${params.get("season")}`;
  if (params.get("week_number")) query.week_number = `eq.${Number(params.get("week_number"))}`;
  if (params.get("weekly") === "true") query.meal_type = "in.(Breakfast,Lunch)";
  if (params.get("search")) query.meal_name = `ilike.*${params.get("search")}*`;
  if (params.get("show_archived") !== "true") query.archive = "is.false";

  const meals = await supabaseRest("meal_with_stats", { query });
  return sortMeals(meals.map(resolveMealImageUrls), params.get("sort") || "meal_name");
}

async function getMeal(id) {
  const meals = await supabaseRest("meal_with_stats", {
    query: { select: "*", id: `eq.${id}`, limit: "1" },
  });
  if (!meals.length) return null;
  const orderHistory = await supabaseRest("meal_orders", {
    query: {
      select: "id,ordered_week_start_date,created_at",
      meal_id: `eq.${id}`,
      order: "ordered_week_start_date.desc",
    },
  });
  const meal = resolveMealImageUrls(meals[0]);
  meal.order_history = orderHistory;
  return meal;
}

async function getOrders() {
  const meals = sortMeals(await supabaseRest("meal_with_stats", {
    query: { select: "*", meal_type: "eq.Dinner", status: "eq.Active", archive: "is.false" },
  }), "meal_name").map(resolveMealImageUrls);

  const dinnerMeals = await supabaseRest("meals", {
    query: { select: "id,meal_name,rating,meal_type", meal_type: "eq.Dinner", archive: "is.false" },
  });
  const dinnerMealMap = new Map(dinnerMeals.map((meal) => [meal.id, meal]));
  const rawOrders = await supabaseRest("meal_orders", {
    query: { select: "id,meal_id,ordered_week_start_date", order: "ordered_week_start_date.desc" },
  });

  const orders = rawOrders
    .map((order) => ({ ...order, meal: dinnerMealMap.get(order.meal_id) }))
    .filter((order) => order.meal)
    .map((order) => ({
      id: order.id,
      meal_id: order.meal_id,
      ordered_week_start_date: order.ordered_week_start_date,
      meal_name: order.meal.meal_name,
      rating: order.meal.rating,
    }))
    .sort((a, b) => b.ordered_week_start_date.localeCompare(a.ordered_week_start_date) || a.meal_name.localeCompare(b.meal_name, undefined, { sensitivity: "base" }));

  const weeks = [...new Set(orders.map((order) => order.ordered_week_start_date))].sort().reverse();
  return { meals, orders, weeks };
}

async function touchMeal(id) {
  await supabaseRest("meals", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { updated_at: new Date().toISOString() },
  });
}

async function createOrder(payload) {
  const mealId = cleanOptional(payload.meal_id);
  if (!mealId) throw new Error("Meal is required.");
  const meals = await supabaseRest("meals", {
    query: { select: "id,meal_type", id: `eq.${mealId}`, status: "eq.Active", archive: "is.false", limit: "1" },
  });
  const meal = meals[0];
  if (!meal) throw new Error("Meal not found.");
  if (meal.meal_type !== "Dinner") throw new Error("Only dinner meals can be added to Orders.");

  const orderedWeekStartDate = getThursdayWeekStart(cleanOptional(payload.ordered_week_start_date));
  const existing = await supabaseRest("meal_orders", {
    query: { select: "id", meal_id: `eq.${mealId}`, ordered_week_start_date: `eq.${orderedWeekStartDate}`, limit: "1" },
  });
  if (!existing.length) {
    await supabaseRest("meal_orders", {
      method: "POST",
      body: { id: randomUUID(), meal_id: mealId, ordered_week_start_date: orderedWeekStartDate },
      prefer: "return=minimal",
    });
  }
  await touchMeal(mealId);
  return getOrders();
}

async function updateOrder(id, payload) {
  const existingRows = await supabaseRest("meal_orders", {
    query: { select: "id,meal_id", id: `eq.${id}`, limit: "1" },
  });
  const existing = existingRows[0];
  if (!existing) return null;

  const orderedWeekStartDate = getThursdayWeekStart(cleanOptional(payload.ordered_week_start_date));
  try {
    const updated = await supabaseRest("meal_orders", {
      method: "PATCH",
      query: { id: `eq.${id}` },
      body: { ordered_week_start_date: orderedWeekStartDate },
      prefer: "return=representation",
    });
    await touchMeal(existing.meal_id);
    const meal = (await supabaseRest("meals", {
      query: { select: "meal_name,rating", id: `eq.${existing.meal_id}`, limit: "1" },
    }))[0];
    return { ...updated[0], meal_name: meal?.meal_name, rating: meal?.rating };
  } catch (error) {
    if (error.code === "23505" || error.status === 409) {
      throw new Error("That meal is already recorded for that Thursday week.");
    }
    throw error;
  }
}

async function deleteOrder(id) {
  const existingRows = await supabaseRest("meal_orders", {
    query: { select: "id,meal_id", id: `eq.${id}`, limit: "1" },
  });
  const existing = existingRows[0];
  if (!existing) return null;
  await supabaseRest("meal_orders", {
    method: "DELETE",
    query: { id: `eq.${id}` },
    prefer: "return=minimal",
  });
  await touchMeal(existing.meal_id);
  return existing;
}

async function createMeal(payload) {
  const meal = validateMeal(payload);
  const id = randomUUID();
  await supabaseRest("meals", {
    method: "POST",
    body: { id, ...meal },
    prefer: "return=minimal",
  });
  return getMeal(id);
}

async function updateMeal(id, payload) {
  if (!(await getMeal(id))) return null;
  const meal = validateMeal(payload);
  await supabaseRest("meals", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: meal,
    prefer: "return=minimal",
  });
  return getMeal(id);
}

async function updateMealRating(id, payload) {
  const rating = cleanOptional(payload.rating);
  if (!enums.rating.includes(rating)) throw new Error("Rating is invalid.");
  const updated = await supabaseRest("meals", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { rating },
    prefer: "return=representation",
  });
  return updated.length ? getMeal(id) : null;
}

async function removeMeal(id) {
  const updated = await supabaseRest("meals", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { status: "Removed" },
    prefer: "return=representation",
  });
  return updated.length ? getMeal(id) : null;
}

async function saveUploadedImage({ dataUrl, filename = "meal-image" }) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl || "");
  if (!match) throw new Error("Upload must be a pasted or selected image.");
  requireSupabaseConfig();
  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side Storage uploads.");
  }

  const mime = match[1].toLowerCase();
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("gif") ? ".gif" : ".jpg";
  const safeName = filename.replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) || "meal-image";
  const objectPath = `meals/unassigned/${Date.now()}-${randomUUID()}-${safeName}${ext}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(storageBucket)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": mime,
      "x-upsert": "false",
    }),
    body: Buffer.from(match[2], "base64"),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Supabase Storage upload failed (${response.status}).`;
    try {
      const data = JSON.parse(text);
      message = data.message || data.error || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  return storagePublicUrl(objectPath);
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith("/uploads/")) {
    res.writeHead(302, { Location: legacyUploadUrlToStorageUrl(pathname) });
    res.end();
    return true;
  }

  const routePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, decodeURIComponent(routePath)));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    return false;
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  res.writeHead(200, {
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  res.end(readFileSync(filePath));
  return true;
}

function errorStatus(error) {
  if (error.status === 404) return 404;
  if (error.status === 401 || error.status === 403) return error.status;
  if (String(error.message || "").includes("not configured")) return 500;
  return 400;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/meals" && req.method === "GET") {
      return sendJson(res, 200, { meals: await getMeals(url) });
    }
    if (url.pathname === "/api/meals" && req.method === "POST") {
      return sendJson(res, 201, { meal: await createMeal(await readBody(req)) });
    }
    if (url.pathname === "/api/orders" && req.method === "GET") {
      return sendJson(res, 200, await getOrders());
    }
    if (url.pathname === "/api/orders" && req.method === "POST") {
      return sendJson(res, 201, await createOrder(await readBody(req)));
    }
    const orderMatch = /^\/api\/orders\/([^/]+)$/.exec(url.pathname);
    if (orderMatch && (req.method === "PUT" || req.method === "PATCH")) {
      const order = await updateOrder(orderMatch[1], await readBody(req));
      return order ? sendJson(res, 200, { order }) : sendError(res, 404, "Order not found.");
    }
    if (orderMatch && req.method === "DELETE") {
      const order = await deleteOrder(orderMatch[1]);
      return order ? sendJson(res, 200, { order }) : sendError(res, 404, "Order not found.");
    }
    const mealMatch = /^\/api\/meals\/([^/]+)$/.exec(url.pathname);
    if (mealMatch && req.method === "GET") {
      const meal = await getMeal(mealMatch[1]);
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    if (mealMatch && req.method === "PUT") {
      const meal = await updateMeal(mealMatch[1], await readBody(req));
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    const ratingMatch = /^\/api\/meals\/([^/]+)\/rating$/.exec(url.pathname);
    if (ratingMatch && req.method === "PATCH") {
      const meal = await updateMealRating(ratingMatch[1], await readBody(req));
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    const removeMatch = /^\/api\/meals\/([^/]+)\/remove$/.exec(url.pathname);
    if (removeMatch && req.method === "PATCH") {
      const meal = await removeMeal(removeMatch[1]);
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    if (url.pathname === "/api/uploads/image" && req.method === "POST") {
      return sendJson(res, 201, { image_url: await saveUploadedImage(await readBody(req)) });
    }
    if (serveStatic(req, res, url.pathname)) return;
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      serveStatic(req, res, "/");
      return;
    }
    return sendError(res, 404, "Not found.");
  } catch (error) {
    console.error(error);
    return sendError(res, errorStatus(error), error.message || "Request failed.");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Meal Tracker is running at http://localhost:${port}`);
  console.log(`Using Supabase project: ${supabaseUrl || "not configured"}`);
});
