const enums = {
  ratings: ["All", "Favourite", "Fine", "Avoid", "Not rated"],
  mealTypes: ["All", "Dinner", "Breakfast", "Lunch"],
  statuses: ["Active", "Removed", "All"],
  seasons: ["Autumn", "Winter", "Spring", "Summer"],
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const initialShowArchived = (() => {
  try {
    return localStorage.getItem("meal-tracker-show-archived") === "true";
  } catch {
    return false;
  }
})();

const state = {
  meals: [],
  currentMeal: null,
  filters: {
    search: "",
    rating: "All",
    meal_type: "All",
    status: "Active",
    sort: "meal_name",
    show_archived: initialShowArchived,
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
  return path === href;
}

function nav() {
  const items = [
    ["#/", "Home"],
    ["#/meals", "Meals"],
    ["#/orders", "Orders"],
    ["#/add", "Add Meal"],
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
  const provider = meal.meal_provider ? `${escapeHtml(meal.meal_provider)} · ` : "";
  const archived = meal.archive ? "Archived · " : "";
  return `
    <a class="meal-card" href="#/meal/${meal.id}">
      ${imageMarkup(meal)}
      <div>
        <div class="meal-name">${escapeHtml(meal.meal_name)}</div>
        <div class="meta">${provider}${archived}${escapeHtml(meal.meal_type)} · Last ordered: ${formatDate(meal.last_ordered_date)} · Ordered ${meal.order_count || 0} times</div>
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
  if (state.filters.show_archived) labels.push("Includes archived");
  if (state.filters.sort !== "meal_name") labels.push(`Sort: ${state.filters.sort.replaceAll("_", " ")}`);
  return labels.length ? labels.join(" · ") : "Active meals · Name sort";
}

async function renderHome() {
  const meals = await loadMeals({ status: "Active", rating: "All", meal_type: "All", search: "", sort: "last_ordered_date", show_archived: false });
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
  const mealListEmpty = state.filters.search || state.filters.rating !== "All" || state.filters.meal_type !== "All" || state.filters.status !== "Active" || state.filters.show_archived
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
        <label class="checkbox-field">
          <input id="show_archived" name="show_archived" type="checkbox" ${state.filters.show_archived ? "checked" : ""} />
          <span>Show archived meals</span>
        </label>
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
    if (event.target.name === "show_archived") {
      state.filters.show_archived = event.target.checked;
      try {
        localStorage.setItem("meal-tracker-show-archived", String(state.filters.show_archived));
      } catch {
        // Ignore storage failures; the checkbox still works for this session.
      }
    } else {
      state.filters[event.target.name] = event.target.value;
    }
    const updated = await loadMeals();
    document.querySelector(".filter-summary").textContent = activeFilterSummary();
    document.querySelector(".meal-list, .empty")?.remove();
    const updatedEmpty = state.filters.search || state.filters.rating !== "All" || state.filters.meal_type !== "All" || state.filters.status !== "Active" || state.filters.show_archived
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
    ${pageHeader(meal.meal_name, `${meal.meal_type} · ${meal.status}${meal.archive ? " · Archived" : ""}`, `<a class="button" href="#/edit/${meal.id}">Edit meal</a>`)}
    <section class="detail-grid">
      ${imageMarkup(meal, "hero-image")}
      <div class="detail-panel">
        <div class="detail-stack">
          <div>
            <span class="${badgeClass(meal.rating)}">${escapeHtml(meal.rating)}</span>
            <p>${escapeHtml(meal.description || "No description yet.")}</p>
          </div>
          ${detailValue("Meal provider", meal.meal_provider)}
          ${detailValue("Archive", meal.archive ? "Yes" : "No")}
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
        <div class="field full">
          <label for="meal_provider">Meal provider</label>
          <input id="meal_provider" name="meal_provider" maxlength="200" value="${value("meal_provider")}" placeholder="e.g. Lite n Easy" />
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
        <label class="checkbox-field">
          <input id="archive" name="archive" type="checkbox" value="true" ${meal.archive ? "checked" : ""} />
          <span>Archive this meal</span>
        </label>
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
    payload.archive = Boolean(event.currentTarget.elements.archive?.checked);
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

async function route() {
  try {
    const path = currentRoutePath();
    if (path === "#/" || path === "/") return renderHome();
    if (path === "#/meals") return renderMeals();
    if (path === "#/orders") return renderOrders();
    if (path === "#/add") return renderForm();
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
