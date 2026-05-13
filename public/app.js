const enums = {
  ratings: ["All", "Favourite", "Fine", "Avoid", "Not rated"],
  mealTypes: ["All", "Dinner", "Breakfast", "Lunch"],
  statuses: ["Active", "Removed", "All"],
  seasons: ["Autumn", "Winter", "Spring", "Summer"],
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const state = {
  meals: [],
  currentMeal: null,
  filters: {
    search: "",
    rating: "All",
    meal_type: "All",
    status: "Active",
    sort: "meal_name",
  },
  mealsFiltersOpen: false,
  orders: {
    ordered_week_start_date: "",
    sort_week: "",
    sort_count_direction: "",
    pending_remove_order_id: "",
    restore_scroll_left: 0,
    restore_scroll_top: 0,
    focus_order_id: "",
    focus_meal_id: "",
    focus_week: "",
    focus_header_week: "",
    focus_count_header: false,
    focus_rating_meal_id: "",
  },
};

const app = document.querySelector("#app");
let imagePasteController = null;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeClass(rating) {
  return `badge ${String(rating).replace(" ", "-")}`;
}

function formatDate(date) {
  if (!date) return "Not recorded";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function localIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function thursdayWeekStart(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  const daysSinceThursday = (date.getDay() + 3) % 7;
  date.setDate(date.getDate() - daysSinceThursday);
  return localIsoDate(date);
}

function imageMarkup(meal, size = "thumb") {
  if (meal?.image_url) {
    return `<div class="${size}"><img src="${escapeHtml(meal.image_url)}" alt="${escapeHtml(meal.meal_name)}" onerror="this.remove()" /></div>`;
  }
  const initial = escapeHtml((meal?.meal_name || "M").slice(0, 1).toUpperCase());
  return `<div class="${size}" aria-hidden="true">${initial}</div>`;
}

function referenceImageMarkup(label, url) {
  if (!url) {
    return `
      <div class="reference-card empty-reference">
        <h2>${escapeHtml(label)}</h2>
        <div class="muted">No image saved.</div>
      </div>
    `;
  }
  return `
    <div class="reference-card">
      <h2>${escapeHtml(label)}</h2>
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <img class="reference-image" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />
      </a>
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function paramsFrom(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) params.set(key, value);
  });
  return params.toString();
}

async function loadMeals(custom = {}) {
  const params = paramsFrom({ ...state.filters, ...custom });
  const data = await api(`/api/meals?${params}`);
  state.meals = data.meals;
  return state.meals;
}

async function loadMeal(id) {
  const data = await api(`/api/meals/${id}`);
  state.currentMeal = data.meal;
  return data.meal;
}

async function loadOrders() {
  return api("/api/orders");
}

async function updateOrderDate(orderId, value) {
  const orderedWeekStartDate = thursdayWeekStart(value);
  await api(`/api/orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify({ ordered_week_start_date: orderedWeekStartDate }),
  });
  return orderedWeekStartDate;
}

async function removeOrder(orderId) {
  return api(`/api/orders/${orderId}`, { method: "DELETE" });
}

async function updateMealRating(mealId, rating) {
  return api(`/api/meals/${mealId}/rating`, {
    method: "PATCH",
    body: JSON.stringify({ rating }),
  });
}

function rememberOrdersTablePosition(focus = {}) {
  const wrap = document.querySelector(".orders-table-wrap");
  state.orders.restore_scroll_left = wrap?.scrollLeft || 0;
  state.orders.restore_scroll_top = wrap?.scrollTop || 0;
  state.orders.focus_order_id = focus.orderId || "";
  state.orders.focus_meal_id = focus.mealId || "";
  state.orders.focus_week = focus.week || "";
  state.orders.focus_header_week = focus.headerWeek || "";
  state.orders.focus_count_header = Boolean(focus.countHeader);
  state.orders.focus_rating_meal_id = focus.ratingMealId || "";
}

function currentRoutePath() {
  if (location.hash.startsWith("#/")) return location.hash.split("?")[0];
  const trimmed = location.pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function routeSearchParams() {
  if (location.hash.startsWith("#/")) return new URLSearchParams(location.hash.split("?")[1] || "");
  return new URLSearchParams(location.search);
}

function isNavActive(href) {
  const path = currentRoutePath();
  if (href === "#/") return path === "#/" || path === "/";
  if (href === "/docs") return path === "/docs" || path.startsWith("/docs/");
  return path === href;
}

function nav() {
  const items = [
    ["#/", "Home"],
    ["#/meals", "Meals"],
    ["#/orders", "Orders"],
    ["#/add", "Add Meal"],
    ["/docs", "Docs"],
  ];
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <div class="brand-title">Meal Tracker</div>
          <div class="brand-subtitle">Personal ratings</div>
        </div>
      </div>
      <nav class="nav">${items.map(([href, label]) => `<a href="${href}" class="${isNavActive(href) ? "active" : ""}">${label}</a>`).join("")}</nav>
    </aside>
    <nav class="mobile-nav">${items.map(([href, label]) => `<a href="${href}" class="${isNavActive(href) ? "active" : ""}">${label}</a>`).join("")}</nav>
  `;
}

function layout(content) {
  app.innerHTML = `<div class="app-shell">${nav()}<main class="main">${content}</main></div>`;
}

function pageHeader(title, subtitle, action = "") {
  return `
    <header class="page-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${action}
    </header>
  `;
}

function mealCard(meal) {
  return `
    <a class="meal-card" href="#/meal/${meal.id}">
      ${imageMarkup(meal)}
      <div>
        <div class="meal-name">${escapeHtml(meal.meal_name)}</div>
        <div class="meta">${escapeHtml(meal.meal_type)} · Last ordered: ${formatDate(meal.last_ordered_date)} · Ordered ${meal.order_count || 0} times</div>
        <div class="notes-preview">${escapeHtml(meal.notes || "No notes yet")}</div>
      </div>
      <span class="${badgeClass(meal.rating)}">${escapeHtml(meal.rating)}</span>
    </a>
  `;
}

function select(name, options, value, label) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}">
        ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </div>
  `;
}

function emptyState(title, body, action = "") {
  return `
    <div class="card empty">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      ${action}
    </div>
  `;
}

function renderMealList(meals, empty = {}) {
  if (meals.length) return `<div class="meal-list">${meals.map(mealCard).join("")}</div>`;
  return emptyState(
    empty.title || "No meals found",
    empty.body || "Try changing the search or filters.",
    empty.action || "",
  );
}

function activeFilterSummary() {
  const labels = [];
  if (state.filters.rating !== "All") labels.push(state.filters.rating);
  if (state.filters.meal_type !== "All") labels.push(state.filters.meal_type);
  if (state.filters.status !== "Active") labels.push(`Status: ${state.filters.status}`);
  if (state.filters.sort !== "meal_name") labels.push(`Sort: ${state.filters.sort.replaceAll("_", " ")}`);
  return labels.length ? labels.join(" · ") : "Active meals · Name sort";
}

async function renderHome() {
  const meals = await loadMeals({ status: "Active", rating: "All", meal_type: "All", search: "", sort: "last_ordered_date" });
  const counts = Object.fromEntries(enums.ratings.slice(1).map((rating) => [rating, meals.filter((meal) => meal.rating === rating).length]));
  const recent = meals.filter((meal) => meal.last_ordered_date).slice(0, 5);
  const recentEmpty = meals.length
    ? {
        title: "No orders recorded yet",
        body: "Add dinner orders from the Orders page and your most recent meals will appear here.",
        action: `<a class="button" href="#/orders">Open Orders</a>`,
      }
    : {
        title: "No meals yet",
        body: "Add your first meal, rate it, and start building your personal meal memory.",
        action: `<a class="button primary" href="#/add">Add Meal</a>`,
      };
  layout(`
    ${pageHeader("Meal Tracker", "Track what you liked, what was fine, and what to avoid next time.", `<a class="button primary" href="#/add">Add Meal</a>`)}
    <section class="grid summary-grid">
      ${enums.ratings.slice(1).map((rating) => `
        <a class="card summary-card" href="#/meals?rating=${encodeURIComponent(rating)}">
          <strong>${counts[rating] || 0}</strong>
          <span>${escapeHtml(rating)}</span>
        </a>
      `).join("")}
    </section>
    <section class="section">
      <div class="section-title">
        <h2>Recent meals</h2>
        <a class="button" href="#/meals">View all</a>
      </div>
      ${renderMealList(recent, recentEmpty)}
    </section>
  `);
}

async function renderMeals() {
  const urlParams = routeSearchParams();
  if (urlParams.get("rating")) state.filters.rating = urlParams.get("rating");
  const meals = await loadMeals();
  const mealListEmpty = state.filters.search || state.filters.rating !== "All" || state.filters.meal_type !== "All" || state.filters.status !== "Active"
    ? {
        title: "No meals match these filters",
        body: "Clear the search or loosen the rating, type, or status filters.",
      }
    : {
        title: "No active meals yet",
        body: "Add a meal with a name, rating, and any notes you want to remember.",
        action: `<a class="button primary" href="#/add">Add Meal</a>`,
      };
  layout(`
    ${pageHeader("Meals", "Search, filter, and scan your personal meal library.", `<a class="button primary" href="#/add">Add Meal</a>`)}
    <form class="filters compact-filters" id="filters">
      <div class="filter-top-row">
        <div class="field search-field">
          <label for="search">Search</label>
          <input id="search" name="search" placeholder="Search meal name" value="${escapeHtml(state.filters.search)}" />
        </div>
        <button class="button filter-toggle" type="button" id="filter-toggle" aria-expanded="${state.mealsFiltersOpen}">
          ${state.mealsFiltersOpen ? "Hide filters" : "Show filters"}
        </button>
      </div>
      <div class="filter-summary">${escapeHtml(activeFilterSummary())}</div>
      <div class="advanced-filters ${state.mealsFiltersOpen ? "open" : ""}">
        ${select("rating", enums.ratings, state.filters.rating, "Rating")}
        ${select("meal_type", enums.mealTypes, state.filters.meal_type, "Meal type")}
        ${select("status", enums.statuses, state.filters.status, "Status")}
        ${select("sort", ["meal_name", "last_ordered_date", "order_count", "rating"], state.filters.sort, "Sort by")}
      </div>
    </form>
    ${renderMealList(meals, mealListEmpty)}
  `);

  document.querySelector("#filter-toggle").addEventListener("click", () => {
    state.mealsFiltersOpen = !state.mealsFiltersOpen;
    const advanced = document.querySelector(".advanced-filters");
    advanced.classList.toggle("open", state.mealsFiltersOpen);
    const button = document.querySelector("#filter-toggle");
    button.textContent = state.mealsFiltersOpen ? "Hide filters" : "Show filters";
    button.setAttribute("aria-expanded", String(state.mealsFiltersOpen));
  });

  document.querySelector("#filters").addEventListener("input", async (event) => {
    state.filters[event.target.name] = event.target.value;
    const updated = await loadMeals();
    document.querySelector(".filter-summary").textContent = activeFilterSummary();
    document.querySelector(".meal-list, .empty")?.remove();
    const updatedEmpty = state.filters.search || state.filters.rating !== "All" || state.filters.meal_type !== "All" || state.filters.status !== "Active"
      ? {
          title: "No meals match these filters",
          body: "Clear the search or loosen the rating, type, or status filters.",
        }
      : {
          title: "No active meals yet",
          body: "Add a meal with a name, rating, and any notes you want to remember.",
          action: `<a class="button primary" href="#/add">Add Meal</a>`,
        };
    document.querySelector("#filters").insertAdjacentHTML("afterend", renderMealList(updated, updatedEmpty));
  });
}

function detailValue(label, value) {
  return `<div class="detail-row"><div class="meta">${escapeHtml(label)}</div><div>${escapeHtml(value || "Not recorded")}</div></div>`;
}

async function renderDetail(id) {
  const meal = await loadMeal(id);
  layout(`
    ${pageHeader(meal.meal_name, `${meal.meal_type} · ${meal.status}`, `<a class="button" href="#/edit/${meal.id}">Edit meal</a>`)}
    <section class="detail-grid">
      ${imageMarkup(meal, "hero-image")}
      <div class="detail-panel">
        <div class="detail-stack">
          <div>
            <span class="${badgeClass(meal.rating)}">${escapeHtml(meal.rating)}</span>
            <p>${escapeHtml(meal.description || "No description yet.")}</p>
          </div>
          ${detailValue("My notes", meal.notes)}
          ${detailValue("Most recent order", formatDate(meal.last_ordered_date))}
          ${detailValue("Times ordered", meal.order_count || 0)}
          ${detailValue("Season", meal.season)}
          ${detailValue("Week number", meal.week_number)}
          ${detailValue("Day available", meal.day_available)}
          ${detailValue("Created", meal.created_at)}
          ${detailValue("Updated", meal.updated_at)}
        </div>
        <div class="actions">
          <a class="button primary" href="#/edit/${meal.id}">Edit meal</a>
          ${meal.status === "Active" ? `<button class="button danger" id="remove-meal">Mark as removed</button>` : ""}
        </div>
      </div>
    </section>
    <section class="section reference-grid">
      ${referenceImageMarkup("Ingredients", meal.ingredients_image_url)}
      ${referenceImageMarkup("Nutritional information", meal.nutrition_image_url)}
    </section>
    <section class="section">
      <div class="detail-panel">
        <div class="section-title compact-title">
          <h2>Order history</h2>
          <span class="count-pill">${meal.order_count || 0} ${(meal.order_count || 0) === 1 ? "order" : "orders"}</span>
        </div>
        ${meal.order_history?.length ? `
          <div class="history-list">
            ${meal.order_history.map((order) => `
              <div class="history-row">
                <span>${formatDate(order.ordered_week_start_date)}</span>
              </div>
            `).join("")}
          </div>
        ` : `<p>No orders recorded yet.</p>`}
      </div>
    </section>
  `);
  document.querySelector("#remove-meal")?.addEventListener("click", async () => {
    await api(`/api/meals/${meal.id}/remove`, { method: "PATCH" });
    location.hash = "#/meals";
  });
}

function orderHistoryEditor(meal = {}) {
  if (!meal.id) return "";
  return `
    <section class="form-section full">
      <h2>Order history</h2>
      ${meal.order_history?.length ? `
        <div class="order-history-editor">
          ${meal.order_history.map((order) => `
            <div class="order-history-edit-row">
              <div class="field">
                <label for="edit-order-${escapeHtml(order.id)}">Thursday week</label>
                <input id="edit-order-${escapeHtml(order.id)}" class="order-date-input" data-order-id="${escapeHtml(order.id)}" type="date" value="${escapeHtml(order.ordered_week_start_date)}" />
              </div>
              <button class="button small order-date-save" type="button" data-order-id="${escapeHtml(order.id)}">Save date</button>
            </div>
          `).join("")}
        </div>
      ` : `<p class="muted">No orders recorded yet. Add orders from the Orders tab.</p>`}
    </section>
  `;
}

function formMarkup(meal = {}) {
  const value = (name, fallback = "") => escapeHtml(meal[name] ?? fallback);
  const imageField = ({ label, urlName, previewId, fileId, zoneId, hint }) => `
    <div class="field full">
      <label for="${urlName}">${label} URL</label>
      <input id="${urlName}" name="${urlName}" data-target="${urlName}" data-preview="${previewId}" value="${value(urlName)}" placeholder="Paste an image URL or paste/drop a screenshot below" />
    </div>
    <div class="field full">
      <label>${label} image</label>
      <div class="drop-zone" id="${zoneId}" data-target="${urlName}" data-preview="${previewId}">
        <div>
          <div>${hint}</div>
          <input type="file" id="${fileId}" accept="image/*" />
          <div id="${previewId}">${meal[urlName] ? `<img class="image-preview" src="${escapeHtml(meal[urlName])}" alt="" />` : ""}</div>
        </div>
      </div>
    </div>
  `;
  return `
    <form class="form-panel" id="meal-form">
      <div id="form-error"></div>
      <div class="form-grid">
        <div class="field full">
          <label for="meal_name">Meal name</label>
          <input id="meal_name" name="meal_name" maxlength="200" required value="${value("meal_name")}" />
        </div>
        ${select("meal_type", ["Dinner", "Breakfast", "Lunch"], meal.meal_type || "Dinner", "Meal type")}
        ${select("rating", ["Favourite", "Fine", "Avoid", "Not rated"], meal.rating || "Not rated", "Rating")}
        ${imageField({
          label: "Meal photo",
          urlName: "image_url",
          previewId: "image-preview",
          fileId: "image-file",
          zoneId: "meal-image-zone",
          hint: "Paste from snipping tool, drag the meal photo here, or choose a file.",
        })}
        ${imageField({
          label: "Ingredients",
          urlName: "ingredients_image_url",
          previewId: "ingredients-image-preview",
          fileId: "ingredients-image-file",
          zoneId: "ingredients-image-zone",
          hint: "Click this area, then paste or drop the ingredients screenshot.",
        })}
        ${imageField({
          label: "Nutritional information",
          urlName: "nutrition_image_url",
          previewId: "nutrition-image-preview",
          fileId: "nutrition-image-file",
          zoneId: "nutrition-image-zone",
          hint: "Click this area, then paste or drop the nutrition screenshot.",
        })}
        <div class="field full">
          <label for="description">Description</label>
          <textarea id="description" name="description">${value("description")}</textarea>
        </div>
        <div class="field full">
          <label for="notes">Notes</label>
          <textarea id="notes" name="notes">${value("notes")}</textarea>
        </div>
        ${select("season", ["", ...enums.seasons], meal.season || "", "Season")}
        <div class="field">
          <label for="week_number">Week number</label>
          <input id="week_number" name="week_number" type="number" min="1" step="1" value="${value("week_number")}" />
        </div>
        ${select("day_available", ["", ...enums.days], meal.day_available || "", "Day available")}
        ${select("status", ["Active", "Removed"], meal.status || "Active", "Status")}
        ${orderHistoryEditor(meal)}
      </div>
      <div class="actions">
        <button class="button primary" type="submit">Save meal</button>
        <a class="button" href="${meal.id ? `#/meal/${meal.id}` : "#/meals"}">Cancel</a>
      </div>
    </form>
  `;
}

async function uploadFile(file, targetName = "image_url", previewId = "image-preview") {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const data = await api("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({ dataUrl, filename: file.name || targetName }),
  });
  document.querySelector(`#${targetName}`).value = data.image_url;
  document.querySelector(`#${previewId}`).innerHTML = `<img class="image-preview" src="${escapeHtml(data.image_url)}" alt="" />`;
}

function wireImageInput() {
  if (imagePasteController) imagePasteController.abort();
  imagePasteController = new AbortController();
  let activeZone = document.querySelector(".drop-zone");
  const setActiveZone = (zone) => {
    if (!zone) return;
    document.querySelectorAll(".drop-zone").forEach((item) => item.classList.remove("selected"));
    activeZone = zone;
    activeZone.classList.add("selected");
  };
  setActiveZone(activeZone);

  document.querySelectorAll("input[data-target][data-preview]").forEach((input) => {
    input.addEventListener("focus", () => setActiveZone(document.querySelector(`.drop-zone[data-target="${input.dataset.target}"]`)), {
      signal: imagePasteController.signal,
    });
    input.addEventListener("click", () => setActiveZone(document.querySelector(`.drop-zone[data-target="${input.dataset.target}"]`)), {
      signal: imagePasteController.signal,
    });
  });

  document.querySelectorAll(".drop-zone").forEach((zone) => {
    const fileInput = zone.querySelector("input[type='file']");
    const targetName = zone.dataset.target;
    const previewId = zone.dataset.preview;
    zone.addEventListener("click", () => {
      setActiveZone(zone);
    }, { signal: imagePasteController.signal });
    fileInput.addEventListener("click", (event) => event.stopPropagation(), { signal: imagePasteController.signal });
    fileInput.addEventListener("change", () => fileInput.files[0] && uploadFile(fileInput.files[0], targetName, previewId), {
      signal: imagePasteController.signal,
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      setActiveZone(zone);
      zone.classList.add("dragging");
    }, { signal: imagePasteController.signal });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"), { signal: imagePasteController.signal });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
      setActiveZone(zone);
      const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
      if (file) uploadFile(file, targetName, previewId);
    }, { signal: imagePasteController.signal });
  });
  document.addEventListener("paste", (event) => {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
    if (!file || !document.querySelector("#meal-form")) return;

    const focusedTarget = document.activeElement?.dataset?.target;
    const focusedZone = focusedTarget ? document.querySelector(`.drop-zone[data-target="${focusedTarget}"]`) : null;
    const targetZone = focusedZone || activeZone;
    if (targetZone) {
      event.preventDefault();
      setActiveZone(targetZone);
      uploadFile(file, targetZone.dataset.target, targetZone.dataset.preview);
    }
  }, { signal: imagePasteController.signal });
}

async function renderForm(id = null) {
  const meal = id ? await loadMeal(id) : null;
  layout(`
    ${pageHeader(id ? "Edit Meal" : "Add Meal", id ? "Update rating, notes, images, nutrition, ingredients, and availability." : "Add a meal to your personal library.")}
    ${formMarkup(meal || {})}
  `);
  wireImageInput();
  document.querySelector("#meal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    try {
      const data = await api(id ? `/api/meals/${id}` : "/api/meals", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      location.hash = `#/meal/${data.meal.id}`;
    } catch (error) {
      document.querySelector("#form-error").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
  });
  document.querySelectorAll(".order-date-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      event.target.value = thursdayWeekStart(event.target.value);
    });
  });
  document.querySelectorAll(".order-date-save").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const orderId = event.currentTarget.dataset.orderId;
      const input = document.querySelector(`.order-date-input[data-order-id="${orderId}"]`);
      try {
        await updateOrderDate(orderId, input.value);
        await renderForm(id);
      } catch (error) {
        document.querySelector("#form-error").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      }
    });
  });
}

async function renderOrders() {
  const data = await loadOrders();
  const selectedWeek = state.orders.ordered_week_start_date || data.weeks[0] || thursdayWeekStart();
  state.orders.ordered_week_start_date = selectedWeek;
  const orderLookup = new Map(data.orders.map((order) => [`${order.meal_id}:${order.ordered_week_start_date}`, order]));
  if (state.orders.sort_week && !data.weeks.includes(state.orders.sort_week)) state.orders.sort_week = "";
  if (!state.orders.sort_week && data.weeks.length && !state.orders.sort_count_direction) state.orders.sort_week = data.weeks[0];
  const sortedMeals = [...data.meals].sort((a, b) => {
    if (state.orders.sort_count_direction) {
      const countDiff = (a.order_count || 0) - (b.order_count || 0);
      if (countDiff !== 0) return state.orders.sort_count_direction === "asc" ? countDiff : -countDiff;
    }
    const sortWeek = state.orders.sort_week;
    if (sortWeek && !state.orders.sort_count_direction) {
      const aOrdered = orderLookup.has(`${a.id}:${sortWeek}`) ? 0 : 1;
      const bOrdered = orderLookup.has(`${b.id}:${sortWeek}`) ? 0 : 1;
      if (aOrdered !== bOrdered) return aOrdered - bOrdered;
    }
    const aAvoid = a.rating === "Avoid" ? 1 : 0;
    const bAvoid = b.rating === "Avoid" ? 1 : 0;
    if (aAvoid !== bAvoid) return aAvoid - bAvoid;
    return a.meal_name.localeCompare(b.meal_name);
  });
  layout(`
    ${pageHeader("Orders", "Track which dinner meals were ordered each Thursday week.")}
    <form class="filters compact-filters" id="order-form">
      <div id="order-form-error"></div>
      <div class="order-entry-row">
        <div class="field">
          <label for="ordered_week_start_date">Thursday week</label>
          <input id="ordered_week_start_date" name="ordered_week_start_date" type="date" value="${escapeHtml(selectedWeek)}" />
        </div>
        <div class="field">
          <label for="meal_search">Dinner meal</label>
          <input id="meal_search" name="meal_search" list="dinner-meal-options" autocomplete="off" placeholder="Type to search dinner meals" required />
          <datalist id="dinner-meal-options">
            ${data.meals.map((meal) => `<option value="${escapeHtml(meal.meal_name)}">${escapeHtml(meal.rating)} · Ordered ${meal.order_count || 0}</option>`).join("")}
          </datalist>
        </div>
        <button class="button primary order-add-button" type="submit">Add to week</button>
      </div>
    </form>
    ${!data.meals.length ? emptyState(
      "No dinner meals yet",
      "Add a dinner meal first, then return here to record the Thursday weeks you ordered it.",
      `<a class="button primary" href="#/add">Add Meal</a>`,
    ) : `
    <section class="orders-table-wrap card">
      <table class="orders-table">
        <thead>
          <tr>
            <th class="orders-sticky-col orders-meal-col">Meal</th>
            <th class="orders-sticky-col orders-rating-col">Rating</th>
            <th class="orders-sticky-col orders-count-col">
              <button class="order-count-sort ${state.orders.sort_count_direction ? "active" : ""}" type="button" title="Sort meals by total order count">
                Count${state.orders.sort_count_direction === "asc" ? " ↑" : state.orders.sort_count_direction === "desc" ? " ↓" : ""}
              </button>
            </th>
            ${data.weeks.map((week) => `
              <th>
                <button class="order-week-sort ${state.orders.sort_week === week ? "active" : ""}" type="button" data-week="${escapeHtml(week)}" title="Show meals ordered this week at the top">
                  ${formatDate(week)}
                </button>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${sortedMeals.map((meal) => `
            <tr>
              <th class="orders-sticky-col orders-meal-col"><a class="order-meal-link" data-meal-id="${escapeHtml(meal.id)}" href="#/meal/${meal.id}">${escapeHtml(meal.meal_name)}</a></th>
              <td class="orders-sticky-col orders-rating-col">
                <select class="order-rating-select rating-${String(meal.rating).replace(" ", "-")}" data-meal-id="${escapeHtml(meal.id)}" aria-label="Rating for ${escapeHtml(meal.meal_name)}">
                  ${enums.ratings.slice(1).map((rating) => `
                    <option value="${escapeHtml(rating)}" ${rating === meal.rating ? "selected" : ""}>${escapeHtml(rating)}</option>
                  `).join("")}
                </select>
              </td>
              <td class="orders-sticky-col orders-count-col">${meal.order_count || 0}</td>
              ${data.weeks.map((week) => {
                const order = orderLookup.get(`${meal.id}:${week}`);
                return `<td>${order ? `
                  <div class="order-cell ${state.orders.pending_remove_order_id === order.id ? "pending" : ""}" data-order-id="${escapeHtml(order.id)}">
                    <button class="order-check" type="button" data-order-id="${escapeHtml(order.id)}" data-meal-id="${escapeHtml(meal.id)}" data-week="${escapeHtml(week)}" aria-label="Remove ${escapeHtml(meal.meal_name)} from ${escapeHtml(week)}">✓</button>
                    ${state.orders.pending_remove_order_id === order.id ? `
                      <div class="order-remove-confirm">
                        <span>Remove?</span>
                        <button class="button small danger order-remove-confirm-button" type="button" data-order-id="${escapeHtml(order.id)}" data-meal-id="${escapeHtml(meal.id)}">Remove</button>
                        <button class="button small order-remove-cancel" type="button">Keep</button>
                      </div>
                    ` : ""}
                  </div>
                ` : ""}</td>`;
              }).join("")}
            </tr>
          `).join("")}
          ${data.meals.length && !data.weeks.length ? `
            <tr>
              <td colspan="3" class="empty">
                <h2>No dinner orders recorded yet</h2>
                <p>Choose a Thursday week, search for a dinner meal, then select Add to week.</p>
              </td>
            </tr>
          ` : ""}
        </tbody>
      </table>
    </section>
    `}
  `);
  document.querySelector("#ordered_week_start_date").addEventListener("change", (event) => {
    state.orders.ordered_week_start_date = thursdayWeekStart(event.target.value);
    event.target.value = state.orders.ordered_week_start_date;
  });
  document.querySelector("#order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const mealSearch = String(formData.get("meal_search") || "").trim().toLowerCase();
    const matches = data.meals.filter((meal) => meal.meal_name.toLowerCase() === mealSearch);
    const looseMatches = matches.length ? matches : data.meals.filter((meal) => meal.meal_name.toLowerCase().includes(mealSearch));
    const errorTarget = document.querySelector("#order-form-error");
    if (looseMatches.length !== 1) {
      errorTarget.innerHTML = `<div class="error">${looseMatches.length ? "Please choose one exact dinner meal from the list." : "No matching dinner meal was found."}</div>`;
      return;
    }
    const addedWeek = thursdayWeekStart(formData.get("ordered_week_start_date"));
    rememberOrdersTablePosition({ mealId: looseMatches[0].id, week: addedWeek });
    await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        meal_id: looseMatches[0].id,
        ordered_week_start_date: addedWeek,
      }),
    });
    state.orders.sort_week = addedWeek;
    state.orders.sort_count_direction = "";
    await renderOrders();
  });
  document.querySelectorAll(".order-week-sort").forEach((button) => {
    button.addEventListener("click", async (event) => {
      rememberOrdersTablePosition({ headerWeek: event.currentTarget.dataset.week });
      state.orders.sort_week = event.currentTarget.dataset.week;
      state.orders.sort_count_direction = "";
      await renderOrders();
    });
  });
  document.querySelector(".order-count-sort")?.addEventListener("click", async () => {
    rememberOrdersTablePosition({ countHeader: true });
    state.orders.sort_count_direction = state.orders.sort_count_direction === "desc" ? "asc" : "desc";
    state.orders.sort_week = "";
    await renderOrders();
  });
  document.querySelectorAll(".order-rating-select").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const mealId = event.currentTarget.dataset.mealId;
      rememberOrdersTablePosition({ ratingMealId: mealId });
      await updateMealRating(mealId, event.currentTarget.value);
      await renderOrders();
    });
  });
  document.querySelectorAll(".order-check").forEach((button) => {
    button.addEventListener("click", async (event) => {
      rememberOrdersTablePosition();
      state.orders.pending_remove_order_id = event.currentTarget.dataset.orderId;
      await renderOrders();
    });
  });
  document.querySelectorAll(".order-remove-cancel").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const cell = event.currentTarget.closest(".order-cell");
      rememberOrdersTablePosition({ orderId: cell?.dataset.orderId });
      state.orders.pending_remove_order_id = "";
      await renderOrders();
    });
  });
  document.querySelectorAll(".order-remove-confirm-button").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const orderId = event.currentTarget.dataset.orderId;
      const mealId = event.currentTarget.dataset.mealId;
      rememberOrdersTablePosition({ mealId });
      await removeOrder(orderId);
      state.orders.pending_remove_order_id = "";
      await renderOrders();
    });
  });
  const ordersTableWrap = document.querySelector(".orders-table-wrap");
  if (ordersTableWrap) {
    ordersTableWrap.scrollLeft = state.orders.restore_scroll_left || 0;
    ordersTableWrap.scrollTop = state.orders.restore_scroll_top || 0;
  }
  if (state.orders.pending_remove_order_id) {
    const activeCell = document.querySelector(`.order-cell[data-order-id="${state.orders.pending_remove_order_id}"]`);
    const activeButton = document.querySelector(`.order-remove-confirm-button[data-order-id="${state.orders.pending_remove_order_id}"]`);
    activeCell?.scrollIntoView({ block: "nearest", inline: "center" });
    activeButton?.focus({ preventScroll: true });
  } else if (state.orders.focus_order_id) {
    document.querySelector(`.order-check[data-order-id="${state.orders.focus_order_id}"]`)?.focus({ preventScroll: true });
    state.orders.focus_order_id = "";
  } else if (state.orders.focus_count_header) {
    document.querySelector(".order-count-sort")?.focus({ preventScroll: true });
    state.orders.focus_count_header = false;
  } else if (state.orders.focus_rating_meal_id) {
    document.querySelector(`.order-rating-select[data-meal-id="${state.orders.focus_rating_meal_id}"]`)?.focus({ preventScroll: true });
    state.orders.focus_rating_meal_id = "";
  } else if (state.orders.focus_header_week) {
    const headerButton = document.querySelector(`.order-week-sort[data-week="${state.orders.focus_header_week}"]`);
    headerButton?.scrollIntoView({ block: "nearest", inline: "center" });
    headerButton?.focus({ preventScroll: true });
    state.orders.focus_header_week = "";
  } else if (state.orders.focus_meal_id && state.orders.focus_week) {
    const addedCell = document.querySelector(`.order-check[data-meal-id="${state.orders.focus_meal_id}"][data-week="${state.orders.focus_week}"]`);
    addedCell?.scrollIntoView({ block: "nearest", inline: "center" });
    addedCell?.focus({ preventScroll: true });
    state.orders.focus_meal_id = "";
    state.orders.focus_week = "";
  } else if (state.orders.focus_meal_id) {
    document.querySelector(`.order-meal-link[data-meal-id="${state.orders.focus_meal_id}"]`)?.focus({ preventScroll: true });
    state.orders.focus_meal_id = "";
  }
}

const docsPages = [
  ["home", "Overview", "/docs"],
  ["architecture", "Architecture", "/docs/architecture"],
  ["components", "Components", "/docs/components"],
  ["data-flow", "Data Flow", "/docs/data-flow"],
  ["api", "API", "/docs/api"],
  ["dependencies", "Dependencies", "/docs/dependencies"],
];

function docsCode(value) {
  return `<pre class="docs-code"><code>${escapeHtml(value)}</code></pre>`;
}

function docsTable(headers, rows) {
  return `
    <div class="docs-table-wrap">
      <table class="docs-table">
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function docsShell(page, content) {
  return `
    <section class="docs-layout">
      <aside class="docs-sidebar">
        <div class="docs-sidebar-title">Documentation</div>
        ${docsPages.map(([key, label, href]) => `
          <a href="${href}" class="${page === key ? "active" : ""}">${escapeHtml(label)}</a>
        `).join("")}
      </aside>
      <article class="docs-content">${content}</article>
    </section>
  `;
}

function docsHomeContent(metrics) {
  const ratingCounts = Object.fromEntries(enums.ratings.slice(1).map((rating) => [rating, metrics.meals.filter((meal) => meal.rating === rating).length]));
  return `
    <div class="docs-intro">
      <h2>Project Overview</h2>
    <p>Meal Tracker is a personal app for remembering which meals to reorder, which were fine, and which to avoid. The current runtime stores meal data in Supabase Postgres and keeps meal images plus pasted ingredients and nutrition screenshots in Supabase Storage.</p>
    </div>
    <section class="docs-metric-grid">
      <div><strong>${metrics.meals.length}</strong><span>Total meals</span></div>
      <div><strong>${metrics.orders.length}</strong><span>Dinner orders</span></div>
      <div><strong>${ratingCounts.Favourite || 0}</strong><span>Favourites</span></div>
      <div><strong>${ratingCounts.Avoid || 0}</strong><span>Avoid</span></div>
    </section>
    <section class="docs-section">
      <h2>Pages</h2>
      <div class="docs-index">
        ${docsPages.slice(1).map(([key, label, href]) => `
          <a href="${href}">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(docsPageSummaries[key])}</span>
          </a>
        `).join("")}
      </div>
    </section>
    <section class="docs-section">
      <h2>Current Scope</h2>
      <ul>
        <li>Personal single-user meal library with ratings, notes, status, and reference images.</li>
        <li>Dinner order history grouped by Thursday week with sortable counts and editable ratings.</li>
        <li>No accounts, payments, scraping, AI parsing, nutrition calculations, recommendations, exports, or backups in the MVP.</li>
      </ul>
    </section>
  `;
}

const docsPageSummaries = {
  architecture: "Tech stack, folder structure, frontend/backend connection, and database schema.",
  components: "Major frontend render functions, shared helpers, and their inputs.",
  "data-flow": "How user actions move through the UI, API, Supabase Postgres, and back.",
  api: "REST endpoints, request shapes, responses, and fetch examples.",
  dependencies: "Runtime, browser APIs, local storage dependencies, and removal impact.",
};

function architectureDocs() {
  return `
    <h2>System Architecture</h2>
    <p>The app is served by Node. The frontend is static HTML, CSS, and JavaScript in <code>public/</code>; the backend is <code>server.js</code>; runtime data persists to Supabase Postgres. Project knowledge lives in <code>docs/masterplan.md</code>, <code>docs/tasks.md</code>, <code>docs/rules.md</code>, and <code>docs/changelog.md</code>.</p>
    ${docsTable(["Layer", "Current implementation", "Purpose"], [
      ["Frontend", "<code>public/index.html</code>, <code>public/app.js</code>, <code>public/styles.css</code>", "Single-page app, routing, forms, tables, filtering, and dark UI."],
      ["Backend", "<code>server.js</code>", "HTTP server, REST API, validation, Supabase data access, Storage uploads, and static file serving."],
      ["Database", "Supabase Postgres", "Persistent meal records and dinner order history."],
      ["Uploads", "Supabase Storage bucket <code>meal-images</code>", "Saved pasted, dropped, or selected image files."],
      ["Backup exports", "<code>scripts/export-sqlite-backup.js</code> and <code>backup/exports/</code>", "Read-only JSON and upload snapshots for Supabase migration preparation."],
      ["Supabase migration", "<code>supabase/migrations/</code> and <code>docs/supabase-migration.md</code>", "Postgres schema and Storage plan for the future Vercel-compatible runtime."],
      ["Project docs", "<code>docs/masterplan.md</code>, <code>docs/tasks.md</code>, <code>docs/rules.md</code>, <code>docs/changelog.md</code>", "Source of truth for vision, implementation order, decisions, and history."],
    ])}
    <section class="docs-section">
      <h2>Folder Structure</h2>
      ${docsCode([
        "Meal Tracker/",
        "  server.js",
        "  package.json",
        "  public/",
        "    index.html",
        "    app.js",
        "    styles.css",
        "  data/",
        "    meals.sqlite       # legacy export source only",
        "    uploads/           # legacy export source only",
        "  scripts/",
        "    export-sqlite-backup.js",
        "  backup/",
        "    exports/",
        "  supabase/",
        "    migrations/",
        "      202605120001_create_meal_tracker_schema.sql",
        "  docs/",
        "    project-knowledge.md",
        "    rules.md",
        "    changelog.md",
        "  masterplan.md",
        "  implementation-plan.md",
        "  design-guidelines.md",
        "  app-flow-pages-and-roles.md",
        "  tasks.md",
      ].join("\n"))}
    </section>
    <section class="docs-section">
      <h2>Frontend And Backend Connection</h2>
      <p>The browser renders routes and calls <code>fetch()</code> through the shared <code>api()</code> helper. The Node server handles <code>/api/*</code>, validates input, updates Supabase Postgres, and returns JSON. Image uploads are posted as data URLs and returned as Supabase Storage URLs.</p>
    </section>
    <section class="docs-section">
      <h2>Migration Export</h2>
      <p><code>npm run export:backup</code> creates a timestamped snapshot under <code>backup/exports/</code> with <code>meals.json</code>, <code>meal_orders.json</code>, copied uploads, and manifests. It opens the old SQLite database read-only and is kept for migration safety.</p>
    </section>
    <section class="docs-section">
      <h2>Supabase Preparation</h2>
      <p><code>supabase/migrations/202605120001_create_meal_tracker_schema.sql</code> creates equivalent Postgres tables for <code>meals</code> and <code>meal_orders</code>, keeps UUID IDs importable, adds current validation checks, indexes list/order access patterns, and provides a compatibility view named <code>meal_with_stats</code>. Storage and RLS notes live in <code>docs/supabase-migration.md</code>.</p>
    </section>
    <section class="docs-section">
      <h2>Database Schema Overview</h2>
      ${docsTable(["Table", "Important columns", "Role"], [
        ["<code>meals</code>", "<code>id</code>, <code>meal_name</code>, <code>meal_type</code>, <code>image_url</code>, <code>ingredients_image_url</code>, <code>nutrition_image_url</code>, <code>description</code>, <code>rating</code>, <code>notes</code>, <code>last_ordered_date</code>, <code>season</code>, <code>week_number</code>, <code>day_available</code>, <code>status</code>, <code>created_at</code>, <code>updated_at</code>", "Main meal library."],
        ["<code>meal_orders</code>", "<code>id</code>, <code>meal_id</code>, <code>ordered_week_start_date</code>, <code>created_at</code>, <code>updated_at</code>", "Dinner order history, one row per meal per Thursday week."],
      ])}
    </section>
  `;
}

function componentsDocs() {
  return `
    <h2>Component Library</h2>
    <p>The frontend is not React-based in its current state. Components are JavaScript render helpers that return HTML strings and then attach event handlers after rendering.</p>
    ${docsTable(["Component/helper", "Where used", "Inputs"], [
      ["<code>layout(content)</code>", "Every page", "HTML string for the current page body."],
      ["<code>nav()</code>", "App shell", "Reads the current route and renders desktop plus mobile navigation."],
      ["<code>pageHeader(title, subtitle, action)</code>", "Home, Meals, Orders, Detail, Forms, Docs", "Title, optional subtitle, optional action HTML."],
      ["<code>mealCard(meal)</code>", "Home recent meals and Meals list", "Meal object with name, type, image, rating, notes, date, and order count."],
      ["<code>emptyState(title, body, action)</code>", "Home, Meals, and Orders", "Title, supporting text, and optional action HTML."],
      ["<code>renderMealList(meals, empty)</code>", "Home and Meals", "Array of meal records plus optional empty-state copy/action."],
      ["<code>renderHome()</code>", "Home route", "Loads active meals and renders rating summaries plus recent meals."],
      ["<code>renderMeals()</code>", "Meals route", "Uses <code>state.filters</code> and query params for list filtering."],
      ["<code>renderOrders()</code>", "Orders route", "Loads meals, orders, week headers, sort state, focus state, and fixed Meal/Rating/Count columns."],
      ["<code>renderDetail(id)</code>", "Meal detail route", "Meal id."],
      ["<code>formMarkup(meal)</code>", "Add/Edit meal", "Existing meal object or defaults for a new meal."],
      ["<code>renderForm(id)</code>", "Add/Edit routes", "Optional meal id for edit mode."],
      ["<code>wireImageInput()</code>", "Add/Edit meal", "DOM drop zones and focused image fields."],
      ["<code>referenceImageMarkup(label, url)</code>", "Meal detail", "Reference image label and saved image URL."],
      ["<code>renderDocs(page)</code>", "Documentation routes", "Docs page key from the URL."],
    ])}
    <section class="docs-section">
      <h2>Shared UI Inputs</h2>
      ${docsTable(["Helper", "Accepted values"], [
        ["<code>select(name, options, value, label)</code>", "Field name, option array, selected value, visible label."],
        ["<code>badgeClass(rating)</code>", "<code>Favourite</code>, <code>Fine</code>, <code>Avoid</code>, or <code>Not rated</code>."],
        ["<code>formatDate(date)</code>", "ISO date string or empty value."],
        ["<code>thursdayWeekStart(value)</code>", "Date object or ISO date string; returns the Thursday week date."],
      ])}
    </section>
  `;
}

function dataFlowDocs() {
  return `
    <h2>Data Flow</h2>
    <section class="docs-section">
      <h2>Add Or Edit Meal</h2>
      ${docsCode([
        "User fills meal form",
        "  -> FormData is converted to JSON in renderForm()",
        "  -> POST /api/meals or PUT /api/meals/:id",
        "  -> validateMeal() applies required fields, enum checks, and week validation",
        "  -> Supabase Postgres meals row is inserted or updated",
        "  -> API returns { meal }",
        "  -> Browser navigates to the meal detail route",
      ].join("\n"))}
    </section>
    <section class="docs-section">
      <h2>Image Upload</h2>
      ${docsCode([
        "User pastes, drops, selects, or enters an image URL",
        "  -> wireImageInput() identifies the active Meal, Ingredients, or Nutrition field",
        "  -> uploadFile() reads the image as a data URL",
        "  -> POST /api/uploads/image",
        "  -> saveUploadedImage() uploads the file into Supabase Storage",
        "  -> API returns a Supabase Storage URL",
        "  -> The matching URL input and preview are updated",
      ].join("\n"))}
    </section>
    <section class="docs-section">
      <h2>Dinner Order Flow</h2>
      ${docsCode([
        "User selects a Thursday week and searches for an existing dinner meal",
        "  -> renderOrders() resolves the meal name",
        "  -> POST /api/orders with meal_id and ordered_week_start_date",
        "  -> createOrder() normalizes the date to Thursday",
        "  -> meal_orders row is inserted if not already present",
        "  -> GET /api/orders reloads weeks, orders, meal counts, and ratings",
        "  -> Table rerenders while preserving focus and scroll position",
      ].join("\n"))}
    </section>
    <section class="docs-section">
      <h2>Authentication</h2>
      <p>There is no authentication in the MVP. The app is intended for personal use on this PC, and the local URL is unprotected while the server is running.</p>
    </section>
  `;
}

function apiDocs() {
  return `
    <h2>API Documentation</h2>
    ${docsTable(["Method", "Endpoint", "Inputs", "Output"], [
      ["GET", "<code>/api/meals</code>", "Query: <code>search</code>, <code>rating</code>, <code>meal_type</code>, <code>status</code>, <code>season</code>, <code>week_number</code>, <code>weekly</code>, <code>sort</code>", "<code>{ meals: Meal[] }</code>"],
      ["POST", "<code>/api/meals</code>", "Meal JSON body.", "<code>{ meal: Meal }</code>"],
      ["GET", "<code>/api/meals/:id</code>", "Meal id in route.", "<code>{ meal: Meal }</code> with <code>order_history</code>."],
      ["PUT", "<code>/api/meals/:id</code>", "Full meal JSON body.", "<code>{ meal: Meal }</code>"],
      ["PATCH", "<code>/api/meals/:id/rating</code>", "<code>{ rating }</code>", "<code>{ meal: Meal }</code>"],
      ["PATCH", "<code>/api/meals/:id/remove</code>", "Meal id in route.", "<code>{ meal: Meal }</code> with status Removed."],
      ["POST", "<code>/api/uploads/image</code>", "<code>{ dataUrl, filename }</code>", "<code>{ image_url }</code>"],
      ["GET", "<code>/api/orders</code>", "None.", "<code>{ meals, orders, weeks }</code>"],
      ["POST", "<code>/api/orders</code>", "<code>{ meal_id, ordered_week_start_date }</code>", "Updated orders payload."],
      ["PUT/PATCH", "<code>/api/orders/:id</code>", "<code>{ ordered_week_start_date }</code>", "<code>{ order }</code>"],
      ["DELETE", "<code>/api/orders/:id</code>", "Order id in route.", "<code>{ order }</code>"],
    ])}
    <section class="docs-section">
      <h2>Example Usage</h2>
      ${docsCode([
        "// Find active favourite dinners",
        "fetch('/api/meals?status=Active&rating=Favourite&meal_type=Dinner')",
        "  .then((response) => response.json())",
        "  .then(({ meals }) => console.log(meals));",
        "",
        "// Add an existing dinner meal to a Thursday week",
        "fetch('/api/orders', {",
        "  method: 'POST',",
        "  headers: { 'Content-Type': 'application/json' },",
        "  body: JSON.stringify({ meal_id: '<meal-id>', ordered_week_start_date: '2026-04-23' }),",
        "});",
      ].join("\n"))}
    </section>
    <section class="docs-section">
      <h2>Validation Rules</h2>
      <ul>
        <li><code>meal_name</code> is required and must be 200 characters or fewer.</li>
        <li><code>meal_type</code> must be Dinner, Breakfast, or Lunch.</li>
        <li><code>rating</code> must be Favourite, Fine, Avoid, or Not rated.</li>
        <li><code>status</code> must be Active or Removed.</li>
        <li><code>week_number</code> is optional, but must be a positive integer when present.</li>
        <li>Dinner orders normalize dates to the Thursday week start.</li>
      </ul>
    </section>
  `;
}

function dependenciesDocs() {
  return `
    <h2>External Dependencies</h2>
    <p>The MVP intentionally has a very small dependency surface. There are no third-party services, hosted databases, auth providers, or package dependencies declared in <code>package.json</code>.</p>
    ${docsTable(["Dependency", "Used by", "Why it exists", "If removed"], [
      ["Node.js", "<code>server.js</code>", "Runs the HTTP server and built-in modules.", "The app cannot serve pages or APIs."],
      ["Supabase Postgres", "<code>server.js</code>", "Stores meal and order data for local and Vercel runtime.", "Meal and order data cannot be loaded or saved."],
      ["Supabase Storage", "<code>server.js</code>", "Stores meal, ingredients, and nutrition images.", "Image uploads fail and saved image URLs cannot be generated."],
      ["<code>node:sqlite</code>", "<code>scripts/export-sqlite-backup.js</code>", "Provides read-only export of old local SQLite data.", "Old SQLite data cannot be exported by the backup script."],
      ["SQLite file", "<code>data/meals.sqlite</code>", "Legacy migration source only.", "Existing old local data cannot be exported unless already migrated."],
      ["Browser Fetch API", "<code>api()</code> helper", "Calls local REST endpoints from the frontend.", "The UI cannot load or save app data."],
      ["Browser FileReader API", "<code>uploadFile()</code>", "Converts selected, dropped, and pasted images into uploadable data URLs.", "Image paste/file upload previews stop working."],
      ["Browser FormData API", "<code>renderForm()</code> and <code>renderOrders()</code>", "Collects form inputs for meal and order saves.", "Forms require manual field collection."],
      ["Local filesystem", "<code>public/</code> static files and legacy export files", "Serves frontend assets and keeps old export sources available.", "The app shell or legacy export path is unavailable."],
      ["Supabase/Postgres", "<code>server.js</code> and <code>supabase/migrations/</code>", "Vercel-compatible runtime target for meal and order data.", "Meal and order APIs cannot read or write deployed data."],
      ["Supabase Storage", "<code>meal-images</code> bucket", "Vercel-compatible runtime target for meal, ingredients, and nutrition images.", "Uploaded images cannot be saved or displayed through Storage URLs."],
    ])}
    <section class="docs-section">
      <h2>Package Scripts</h2>
      ${docsCode([
        "npm start",
        "  Runs node server.js at http://localhost:4173 by default.",
        "",
        "node scripts/export-sqlite-backup.js",
        "  Creates a read-only Supabase migration snapshot in backup/exports/.",
        "",
        "npm run export:backup",
        "  Runs the same export script when npm is available.",
      ].join("\n"))}
    </section>
  `;
}

async function docsMetrics() {
  try {
    const [mealData, orderData] = await Promise.all([
      api("/api/meals?status=All&rating=All&meal_type=All&sort=meal_name"),
      api("/api/orders"),
    ]);
    return { meals: mealData.meals || [], orders: orderData.orders || [] };
  } catch {
    return { meals: [], orders: [] };
  }
}

async function renderDocs(page = "home") {
  const validPage = docsPages.some(([key]) => key === page) ? page : "home";
  const contentByPage = {
    home: () => docsHomeContent,
    architecture: () => architectureDocs,
    components: () => componentsDocs,
    "data-flow": () => dataFlowDocs,
    api: () => apiDocs,
    dependencies: () => dependenciesDocs,
  };
  const metrics = validPage === "home" ? await docsMetrics() : null;
  const content = validPage === "home" ? docsHomeContent(metrics) : contentByPage[validPage]()();
  layout(`
    ${pageHeader("Documentation Center", "Living reference for the Meal Tracker app.")}
    ${docsShell(validPage, content)}
  `);
}
async function route() {
  try {
    const path = currentRoutePath();
    if (path === "#/" || path === "/") return renderHome();
    if (path === "#/meals") return renderMeals();
    if (path === "#/orders") return renderOrders();
    if (path === "#/add") return renderForm();
    if (path === "/docs") return renderDocs("home");
    const docs = /^\/docs\/([^/]+)$/.exec(path);
    if (docs) return renderDocs(docs[1]);
    const detail = /^#\/meal\/(.+)$/.exec(path);
    if (detail) return renderDetail(detail[1]);
    const edit = /^#\/edit\/(.+)$/.exec(path);
    if (edit) return renderForm(edit[1]);
    location.hash = "#/";
  } catch (error) {
    layout(`<div class="error">${escapeHtml(error.message)}</div>`);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);
route();
