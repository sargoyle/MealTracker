import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dataDir = join(__dirname, "data");
const uploadDir = join(dataDir, "uploads");
const publicDir = join(__dirname, "public");
const dbPath = join(dataDir, "meals.sqlite").replaceAll("\\", "/");
const port = Number(process.env.PORT || 4173);

mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    meal_name TEXT NOT NULL CHECK(length(meal_name) <= 200),
    meal_type TEXT NOT NULL DEFAULT 'Dinner' CHECK(meal_type IN ('Dinner', 'Breakfast', 'Lunch')),
    image_url TEXT,
    ingredients_image_url TEXT,
    nutrition_image_url TEXT,
    description TEXT,
    rating TEXT NOT NULL DEFAULT 'Not rated' CHECK(rating IN ('Favourite', 'Fine', 'Avoid', 'Not rated')),
    notes TEXT,
    last_ordered_date TEXT,
    season TEXT CHECK(season IS NULL OR season IN ('Autumn', 'Winter', 'Spring', 'Summer')),
    week_number INTEGER CHECK(week_number IS NULL OR week_number > 0),
    day_available TEXT CHECK(day_available IS NULL OR day_available IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Removed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meal_orders (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL,
    ordered_week_start_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(meal_id, ordered_week_start_date),
    FOREIGN KEY(meal_id) REFERENCES meals(id) ON DELETE CASCADE
  );
`);

const existingColumns = db.prepare("PRAGMA table_info(meals)").all().map((column) => column.name);
if (!existingColumns.includes("ingredients_image_url")) {
  db.exec("ALTER TABLE meals ADD COLUMN ingredients_image_url TEXT");
}
if (!existingColumns.includes("nutrition_image_url")) {
  db.exec("ALTER TABLE meals ADD COLUMN nutrition_image_url TEXT");
}

const enums = {
  meal_type: ["Dinner", "Breakfast", "Lunch"],
  rating: ["Favourite", "Fine", "Avoid", "Not rated"],
  season: ["Autumn", "Winter", "Spring", "Summer"],
  day_available: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  status: ["Active", "Removed"],
};

const seedMeals = [
  ["Beef Lasagne", "Dinner", "Favourite", "Really filling, order again", "2026-04-20", null, null, null, "Active"],
  ["Chicken Curry", "Dinner", "Avoid", "Did not like the sauce", "2026-04-22", null, null, null, "Active"],
  ["Apple Cinnamon Porridge", "Breakfast", "Fine", "Okay, not exciting", "2026-04-23", "Autumn", 4, "Monday", "Active"],
  ["Chicken Salad Wrap", "Lunch", "Favourite", "Good lunch option", "2026-04-24", "Autumn", 4, "Tuesday", "Active"],
];

if (db.prepare("SELECT COUNT(*) AS count FROM meals").get().count === 0) {
  const insert = db.prepare(`
    INSERT INTO meals (
      id, meal_name, meal_type, rating, notes, last_ordered_date, season, week_number, day_available, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const meal of seedMeals) insert.run(randomUUID(), ...meal);
}

const mealSelect = `
  SELECT
    m.id,
    m.meal_name,
    m.meal_type,
    m.image_url,
    m.ingredients_image_url,
    m.nutrition_image_url,
    m.description,
    m.rating,
    m.notes,
    COALESCE((SELECT MAX(o.ordered_week_start_date) FROM meal_orders o WHERE o.meal_id = m.id), m.last_ordered_date) AS last_ordered_date,
    m.season,
    m.week_number,
    m.day_available,
    m.status,
    m.created_at,
    m.updated_at,
    (SELECT COUNT(*) FROM meal_orders o WHERE o.meal_id = m.id) AS order_count
  FROM meals m
`;

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

function addDays(value, days) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

db.prepare("SELECT id, ordered_week_start_date FROM meal_orders")
  .all()
  .forEach((order) => {
    const date = parseLocalDate(order.ordered_week_start_date);
    if (date.getDay() === 3) {
      db.prepare("UPDATE meal_orders SET ordered_week_start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(addDays(order.ordered_week_start_date, 1), order.id);
    }
  });

db.prepare("SELECT id, last_ordered_date FROM meals WHERE last_ordered_date IS NOT NULL AND last_ordered_date != ''")
  .all()
  .forEach((meal) => {
    const existingOrders = db.prepare("SELECT COUNT(*) AS count FROM meal_orders WHERE meal_id = ?").get(meal.id).count;
    if (existingOrders > 0) return;
    db.prepare(`
      INSERT OR IGNORE INTO meal_orders (id, meal_id, ordered_week_start_date)
      VALUES (?, ?, ?)
    `).run(randomUUID(), meal.id, getThursdayWeekStart(meal.last_ordered_date));
  });

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
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
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

function cleanOptional(value) {
  return value === "" || value === undefined ? null : value;
}

function validateMeal(payload, partial = false) {
  const meal = {
    meal_name: cleanOptional(payload.meal_name),
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

function getMeals(url) {
  const params = url.searchParams;
  const where = [];
  const values = [];
  const status = params.get("status") || "Active";

  if (status !== "All") {
    where.push("status = ?");
    values.push(status);
  }
  if (params.get("rating") && params.get("rating") !== "All") {
    where.push("rating = ?");
    values.push(params.get("rating"));
  }
  if (params.get("meal_type") && params.get("meal_type") !== "All") {
    where.push("meal_type = ?");
    values.push(params.get("meal_type"));
  }
  if (params.get("season") && params.get("season") !== "All") {
    where.push("season = ?");
    values.push(params.get("season"));
  }
  if (params.get("week_number")) {
    where.push("week_number = ?");
    values.push(Number(params.get("week_number")));
  }
  if (params.get("weekly") === "true") {
    where.push("meal_type IN ('Breakfast', 'Lunch')");
  }
  if (params.get("search")) {
    where.push("meal_name LIKE ?");
    values.push(`%${params.get("search")}%`);
  }

  const sortMap = {
    meal_name: "CASE rating WHEN 'Avoid' THEN 1 ELSE 0 END ASC, meal_name COLLATE NOCASE ASC",
    last_ordered_date: "last_ordered_date IS NULL ASC, last_ordered_date DESC",
    order_count: "order_count DESC, meal_name COLLATE NOCASE ASC",
    rating: "CASE rating WHEN 'Avoid' THEN 1 ELSE 0 END ASC, meal_name COLLATE NOCASE ASC",
  };
  const orderBy = sortMap[params.get("sort")] || sortMap.meal_name;
  const sql = `${mealSelect} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy}`;
  return db.prepare(sql).all(...values);
}

function getMeal(id) {
  const meal = db.prepare(`${mealSelect} WHERE m.id = ?`).get(id);
  if (!meal) return null;
  meal.order_history = db.prepare(`
    SELECT id, ordered_week_start_date, created_at
    FROM meal_orders
    WHERE meal_id = ?
    ORDER BY ordered_week_start_date DESC
  `).all(id);
  return meal;
}

function getOrders() {
  const meals = db.prepare(`
    ${mealSelect}
    WHERE m.meal_type = 'Dinner' AND m.status = 'Active'
    ORDER BY CASE m.rating WHEN 'Avoid' THEN 1 ELSE 0 END ASC, m.meal_name COLLATE NOCASE ASC
  `).all();
  const orders = db.prepare(`
    SELECT o.id, o.meal_id, o.ordered_week_start_date, m.meal_name, m.rating
    FROM meal_orders o
    JOIN meals m ON m.id = o.meal_id
    WHERE m.meal_type = 'Dinner'
    ORDER BY o.ordered_week_start_date DESC, m.meal_name COLLATE NOCASE ASC
  `).all();
  const weeks = [...new Set(orders.map((order) => order.ordered_week_start_date))].sort().reverse();
  return { meals, orders, weeks };
}

function createOrder(payload) {
  const mealId = cleanOptional(payload.meal_id);
  if (!mealId) throw new Error("Meal is required.");
  const meal = db.prepare("SELECT id, meal_type FROM meals WHERE id = ? AND status = 'Active'").get(mealId);
  if (!meal) throw new Error("Meal not found.");
  if (meal.meal_type !== "Dinner") throw new Error("Only dinner meals can be added to Orders.");
  const orderedWeekStartDate = getThursdayWeekStart(cleanOptional(payload.ordered_week_start_date));
  const id = randomUUID();
  db.prepare(`
    INSERT OR IGNORE INTO meal_orders (id, meal_id, ordered_week_start_date)
    VALUES (?, ?, ?)
  `).run(id, mealId, orderedWeekStartDate);
  db.prepare("UPDATE meals SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(mealId);
  return getOrders();
}

function updateOrder(id, payload) {
  const existing = db.prepare(`
    SELECT o.id, o.meal_id
    FROM meal_orders o
    JOIN meals m ON m.id = o.meal_id
    WHERE o.id = ? AND m.meal_type = 'Dinner'
  `).get(id);
  if (!existing) return null;
  const orderedWeekStartDate = getThursdayWeekStart(cleanOptional(payload.ordered_week_start_date));
  try {
    db.prepare(`
      UPDATE meal_orders
      SET ordered_week_start_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(orderedWeekStartDate, id);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      throw new Error("That meal is already recorded for that Thursday week.");
    }
    throw error;
  }
  db.prepare("UPDATE meals SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.meal_id);
  return db.prepare(`
    SELECT o.id, o.meal_id, o.ordered_week_start_date, m.meal_name, m.rating
    FROM meal_orders o
    JOIN meals m ON m.id = o.meal_id
    WHERE o.id = ?
  `).get(id);
}

function deleteOrder(id) {
  const existing = db.prepare("SELECT id, meal_id FROM meal_orders WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare("DELETE FROM meal_orders WHERE id = ?").run(id);
  db.prepare("UPDATE meals SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.meal_id);
  return existing;
}

function createMeal(payload) {
  const meal = validateMeal(payload);
  const id = randomUUID();
  db.prepare(`
    INSERT INTO meals (
      id, meal_name, meal_type, image_url, ingredients_image_url, nutrition_image_url, description, rating, notes, last_ordered_date,
      season, week_number, day_available, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    meal.meal_name,
    meal.meal_type,
    meal.image_url,
    meal.ingredients_image_url,
    meal.nutrition_image_url,
    meal.description,
    meal.rating,
    meal.notes,
    meal.last_ordered_date,
    meal.season,
    meal.week_number,
    meal.day_available,
    meal.status,
  );
  return getMeal(id);
}

function updateMeal(id, payload) {
  if (!getMeal(id)) return null;
  const meal = validateMeal(payload);
  db.prepare(`
    UPDATE meals SET
      meal_name = ?, meal_type = ?, image_url = ?, ingredients_image_url = ?, nutrition_image_url = ?,
      description = ?, rating = ?, notes = ?,
      last_ordered_date = ?, season = ?, week_number = ?, day_available = ?, status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    meal.meal_name,
    meal.meal_type,
    meal.image_url,
    meal.ingredients_image_url,
    meal.nutrition_image_url,
    meal.description,
    meal.rating,
    meal.notes,
    meal.last_ordered_date,
    meal.season,
    meal.week_number,
    meal.day_available,
    meal.status,
    id,
  );
  return getMeal(id);
}

function updateMealRating(id, payload) {
  const rating = cleanOptional(payload.rating);
  if (!enums.rating.includes(rating)) throw new Error("Rating is invalid.");
  const result = db.prepare("UPDATE meals SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(rating, id);
  return result.changes ? getMeal(id) : null;
}

function saveUploadedImage({ dataUrl, filename = "meal-image" }) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl || "");
  if (!match) throw new Error("Upload must be a pasted or selected image.");
  const mime = match[1].toLowerCase();
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("gif") ? ".gif" : ".jpg";
  const safeName = filename.replace(/[^a-z0-9_-]/gi, "-").slice(0, 50) || "meal-image";
  const storedName = `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
  writeFileSync(join(uploadDir, storedName), Buffer.from(match[2], "base64"));
  return `/uploads/${storedName}`;
}

function serveStatic(req, res, pathname) {
  const routePath = pathname === "/" ? "/index.html" : pathname;
  const base = routePath.startsWith("/uploads/") ? dataDir : publicDir;
  const filePath = normalize(join(base, decodeURIComponent(routePath)));
  if (!filePath.startsWith(base) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/meals" && req.method === "GET") {
      return sendJson(res, 200, { meals: getMeals(url) });
    }
    if (url.pathname === "/api/meals" && req.method === "POST") {
      return sendJson(res, 201, { meal: createMeal(await readBody(req)) });
    }
    if (url.pathname === "/api/orders" && req.method === "GET") {
      return sendJson(res, 200, getOrders());
    }
    if (url.pathname === "/api/orders" && req.method === "POST") {
      return sendJson(res, 201, createOrder(await readBody(req)));
    }
    const orderMatch = /^\/api\/orders\/([^/]+)$/.exec(url.pathname);
    if (orderMatch && (req.method === "PUT" || req.method === "PATCH")) {
      const order = updateOrder(orderMatch[1], await readBody(req));
      return order ? sendJson(res, 200, { order }) : sendError(res, 404, "Order not found.");
    }
    if (orderMatch && req.method === "DELETE") {
      const order = deleteOrder(orderMatch[1]);
      return order ? sendJson(res, 200, { order }) : sendError(res, 404, "Order not found.");
    }
    const mealMatch = /^\/api\/meals\/([^/]+)$/.exec(url.pathname);
    if (mealMatch && req.method === "GET") {
      const meal = getMeal(mealMatch[1]);
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    if (mealMatch && req.method === "PUT") {
      const meal = updateMeal(mealMatch[1], await readBody(req));
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    const ratingMatch = /^\/api\/meals\/([^/]+)\/rating$/.exec(url.pathname);
    if (ratingMatch && req.method === "PATCH") {
      const meal = updateMealRating(ratingMatch[1], await readBody(req));
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    const removeMatch = /^\/api\/meals\/([^/]+)\/remove$/.exec(url.pathname);
    if (removeMatch && req.method === "PATCH") {
      db.prepare("UPDATE meals SET status = 'Removed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(removeMatch[1]);
      const meal = getMeal(removeMatch[1]);
      return meal ? sendJson(res, 200, { meal }) : sendError(res, 404, "Meal not found.");
    }
    if (url.pathname === "/api/uploads/image" && req.method === "POST") {
      return sendJson(res, 201, { image_url: saveUploadedImage(await readBody(req)) });
    }
    if (serveStatic(req, res, url.pathname)) return;
    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      serveStatic(req, res, "/");
      return;
    }
    return sendError(res, 404, "Not found.");
  } catch (error) {
    return sendError(res, 400, error.message || "Request failed.");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Meal Tracker is running at http://localhost:${port}`);
  console.log(`On your Wi-Fi, try http://<this-computer-ip>:${port}`);
});
