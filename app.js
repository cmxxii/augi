// ============================================================
// AUGUSTA — APP LOGIC (with Supabase Auth)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tracks the currently logged-in user (set on auth state change below)
let currentUser = null;

let editingChoreId = null;

let editingGroceryId = null;

// Room selection dropdown
let roomsCache = []; // [{id, name}]

async function loadRoomsCache() {
  const { data, error } = await db.from("rooms").select("*").order("sorting");
  if (!error && data) roomsCache = data;
}

function roomName(roomId) {
  const room = roomsCache.find((r) => r.id === roomId);
  return room ? room.name : "No room";
}

function roomIcon(wip_icon) {
  const n = (wip_icon).toLowerCase();
  if (n.includes("out")) return "🏡";
  if (n.includes("car")) return "🚗";
  if (n.includes("cook")) return "🍳";
  if (n.includes("table")) return "🪑";
  if (n.includes("couch")) return "🛋️";
  if (n.includes("bath")) return "🚽";
  if (n.includes("hall")) return "🧺";
  if (n.includes("bed")) return "🛏️";
  return "🚪"; // fallback for "No room" or any other custom room
}

function renderRoomOptions() {
  const select = document.getElementById("chore-room");
  const current = select.value;
  select.innerHTML =
    `<option value="">No room</option>` +
    roomsCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
  select.value = current;
}

function populateHistoryFilters() {
  const roomSelect = document.getElementById("history-room-filter");
  roomSelect.innerHTML = `<option value="">All rooms</option>` +
    roomsCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
}

async function loadHistory() {
  const { data: completions, error } = await db
    .from("chore_completions")
    .select("*, chores(name, room_id)")
    .order("completed_at", { ascending: false });
  if (error) { console.error(error); return; }

  const roomFilter = document.getElementById("history-room-filter").value;

  const filtered = completions.filter((c) => {
    if (roomFilter && c.chores?.room_id !== roomFilter) return false;
    return true;
  });

  document.getElementById("history-list").innerHTML = filtered
    .map((c) => {
      const when = new Date(c.completed_at).toLocaleString();
      const who = displayNameCache[c.completed_by] || c.completed_by.split("@")[0];
      const choreName = c.chores?.name || "Unknown chore";
      const roomLabel = c.chores?.room_id ? roomName(c.chores.room_id) : "No room";
      return `
        <div class="card">
          <div class="card-info">
            <strong>${choreName}</strong>
            <div class="meta room-label">${roomLabel}</div>
            <div class="meta">${who} · ${when}</div>
          </div>
        </div>`;
    })
    .join("") || "<p>No history yet.</p>";
}

document.getElementById("history-room-filter").addEventListener("change", loadHistory);

// Cache of email → display name, loaded once after login
let displayNameCache = {};

async function loadDisplayNameCache() {
  const { data, error } = await db.from("people").select("user_email, display_name");
  if (!error && data) {
    displayNameCache = Object.fromEntries(data.map((row) => [row.user_email, row.display_name]));
  }
}

function displayName(user) {
  if (!user) return "";
  return displayNameCache[user.email] || user.email.split("@")[0];
}

// ============================================================
// AUTH — login / logout / session persistence
// ============================================================

// This runs automatically whenever auth state changes (login, logout,
// or on page load if a session already exists from a previous visit).
// It's the central place that shows/hides the login screen vs. the app.
db.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
  currentUser = session.user;
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  await loadDisplayNameCache();
  await loadRoomsCache();
  renderRoomOptions();
  document.getElementById("logged-in-name").textContent = displayName(currentUser);
  loadChores();
  loadInventory();
  loadGroceries();
  populateHistoryFilters();
  loadHistory();
} else {
    // Not logged in — show the login screen
    currentUser = null;
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
});

// Login form submit
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.classList.add("hidden");

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = "Incorrect email or password — try again.";
    errEl.classList.remove("hidden");
  }
  // If successful, onAuthStateChange fires automatically and handles the rest
});

// Sign out button
document.getElementById("sign-out-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  // onAuthStateChange fires automatically and shows the login screen
});

// ============================================================
// TAB SWITCHING
// ============================================================

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.querySelectorAll(".subtab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.subtab).classList.add("active");
  });
});

let choreSortMode = "priority";

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    choreSortMode = btn.dataset.sort;
    loadChores();
  });
});

// ============================================================
// SECTION 1: CHORES
// ============================================================

function nextDueDate(chore) {
  const base = chore.last_completed_at
    ? new Date(chore.last_completed_at)
    : new Date(chore.created_at);

  if (chore.frequency_type === "interval_days") {
    const d = new Date(base);
    d.setDate(d.getDate() + chore.frequency_interval_days);
    return d;
  }
  if (chore.frequency_type === "weekly_on_days") {
    const days = chore.frequency_weekdays || [];
    let d = new Date(base);
    d.setDate(d.getDate() + 1);
    for (let i = 0; i < 8; i++) {
      if (days.includes(d.getDay())) return d;
      d.setDate(d.getDate() + 1);
    }
    return d;
  }
  if (chore.frequency_type === "monthly_on_day") {
    let d = new Date(base);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(chore.frequency_day_of_month, lastDay));
    return d;
  }
  return base;
}

function dueStatus(dueDate) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round(
    (new Date(dueDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / msPerDay
  );
  if (days < 0) return { label: `Overdue by ${-days}d`, className: "due-overdue" };
  if (days === 0) return { label: "Due today", className: "due-today" };
  return { label: `Due in ${days}d`, className: "due-later" };
}

function frequencyLabel(chore) {
  if (chore.frequency_type === "interval_days") return `Every ${chore.frequency_interval_days} days`;
  if (chore.frequency_type === "weekly_on_days") {
    const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return (chore.frequency_weekdays || []).map((d) => names[d]).join(" & ");
  }
  if (chore.frequency_type === "monthly_on_day") return `Monthly on day ${chore.frequency_day_of_month}`;
  return "";
}

function lastDoneLabel(chore) {
  if (!chore.last_completed_at) return "Never logged";
  const days = Math.round((new Date() - new Date(chore.last_completed_at)) / 86400000);
  if (days === 0) return "Last done today";
  return `Last done ${days}d ago`;
}

async function loadChores() {
  const { data: chores, error } = await db.from("chores").select("*");
  if (error) {
    document.getElementById("chores-list").innerHTML =
      `<p>Couldn't load chores. Check the console for details.</p>`;
    console.error(error);
    return;
  }

  const listEl = document.getElementById("chores-list");
  if (chores.length === 0) {
    listEl.innerHTML = "<p>No chores yet — add your first one above.</p>";
    return;
  }

  const withDue = chores.map((c) => ({ chore: c, due: nextDueDate(c) }));

  if (choreSortMode === "room") {
    const groups = {};
    withDue.forEach(({ chore, due }) => {
      const key = chore.room_id || "none";
      if (!groups[key]) groups[key] = [];
      groups[key].push({ chore, due });
    });

    const roomKeys = Object.keys(groups).sort((a, b) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      const roomA = roomsCache.find((r) => r.id === a);
      const roomB = roomsCache.find((r) => r.id === b);
      return (roomA?.sorting || "").localeCompare(roomB?.sorting || "");
    });

    listEl.innerHTML = roomKeys
      .map((key) => {
        const groupChores = groups[key].sort((a, b) => a.due - b.due);
        const roomLabel = key === "none" ? "No room" : roomName(key);
        const roomIconKey = key === "none" ? "" : (roomsCache.find((r) => r.id === key)?.wip_icon || "");

        return `
          <div class="room-group">
            <h3 class="room-heading">${roomIcon(roomIconKey)}<span>${roomLabel}</span></h3>
            ${groupChores.map(({ chore, due }) => renderChoreCard(chore, due, false)).join("")}
          </div>`;
      })
      .join("");
  } else {
    const sorted = withDue.sort((a, b) => a.due - b.due);
    listEl.innerHTML = sorted.map(({ chore, due }) => renderChoreCard(chore, due, true)).join("");
  }
}

function renderChoreCard(chore, due, showRoomLabel) {
  if (chore.id === editingChoreId) return renderChoreEditForm(chore);
  const status = dueStatus(due);
  const roomLabelHtml = showRoomLabel
    ? `<div class="meta room-label">${chore.room_id ? roomName(chore.room_id) : "No room"}</div>`
    : "";
  return `
    <div class="card ${status.className}">
      <div class="card-info">
        <strong>${chore.name}</strong>
        ${roomLabelHtml}
        <div class="meta ${status.className}">${status.label} · ${frequencyLabel(chore)}</div>
        <div class="meta">${lastDoneLabel(chore)}</div>
      </div>
      <div class="card-buttons">
        <button class="btn-primary" onclick="markChoreDone('${chore.id}')">Mark done</button>
        <button class="btn-text" onclick="startEditChore('${chore.id}')">Edit</button>
      </div>
    </div>`;
}

function renderChoreEditForm(chore) {
  const roomOptions = roomsCache
    .map((r) => `<option value="${r.id}" ${r.id === chore.room_id ? "selected" : ""}>${r.name}</option>`)
    .join("");

  const type = chore.frequency_type;
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const checkedDays = chore.frequency_weekdays || [];
  const weekdayCheckboxes = weekdayNames
    .map((label, i) => `<label><input type="checkbox" value="${i}" ${checkedDays.includes(i) ? "checked" : ""} /> ${label}</label>`)
    .join("");

  return `
    <div class="card add-form">
      <input type="text" id="edit-name-${chore.id}" value="${chore.name}" />
      <select id="edit-room-${chore.id}">
        <option value="">No room</option>
        ${roomOptions}
      </select>
      <select id="edit-frequency-type-${chore.id}" onchange="toggleEditFrequencyFields('${chore.id}')">
        <option value="interval_days" ${type === "interval_days" ? "selected" : ""}>Every # days</option>
        <option value="weekly_on_days" ${type === "weekly_on_days" ? "selected" : ""}>On specific weekday(s)</option>
      </select>
      <input type="number" id="edit-interval-days-${chore.id}" min="1"
        value="${chore.frequency_interval_days || ""}"
        class="${type === "interval_days" ? "" : "hidden"}" />
      <div id="edit-weekdays-${chore.id}" class="weekday-picker ${type === "weekly_on_days" ? "" : "hidden"}">
        ${weekdayCheckboxes}
      </div>
      <div class="form-buttons">
        <button class="btn-primary" onclick="saveEditChore('${chore.id}')">Save</button>
        <button class="btn-text" onclick="cancelEditChore()">Cancel</button>
      </div>
    </div>`;
}

function toggleEditFrequencyFields(choreId) {
  const type = document.getElementById(`edit-frequency-type-${choreId}`).value;
  document.getElementById(`edit-interval-days-${choreId}`).classList.toggle("hidden", type !== "interval_days");
  document.getElementById(`edit-weekdays-${choreId}`).classList.toggle("hidden", type !== "weekly_on_days");
}

function startEditChore(choreId) {
  editingChoreId = choreId;
  loadChores();
}

function cancelEditChore() {
  editingChoreId = null;
  loadChores();
}

async function saveEditChore(choreId) {
  const type = document.getElementById(`edit-frequency-type-${choreId}`).value;

  await db.from("chores").update({
    name: document.getElementById(`edit-name-${choreId}`).value,
    room_id: document.getElementById(`edit-room-${choreId}`).value || null,
    frequency_type: type,
    frequency_interval_days: type === "interval_days"
      ? Number(document.getElementById(`edit-interval-days-${choreId}`).value) : null,
    frequency_weekdays: type === "weekly_on_days"
      ? [...document.querySelectorAll(`#edit-weekdays-${choreId} input:checked`)].map((cb) => Number(cb.value))
      : null,
  }).eq("id", choreId);

  editingChoreId = null;
  loadChores();
}

async function markChoreDone(choreId) {
  const now = new Date().toISOString();
  // Records who did it using the real logged-in user's email
  await db.from("chore_completions").insert({
    chore_id: choreId,
    completed_by: currentUser.email,
  });
  await db.from("chores").update({ last_completed_at: now }).eq("id", choreId);
  loadChores();
}

// Add chore form
const addChoreForm = document.getElementById("add-chore-form");
document.getElementById("show-add-chore").addEventListener("click", () => addChoreForm.classList.remove("hidden"));
document.getElementById("cancel-add-chore").addEventListener("click", () => addChoreForm.classList.add("hidden"));

const frequencyTypeSelect = document.getElementById("chore-frequency-type");
frequencyTypeSelect.addEventListener("change", () => {
  const type = frequencyTypeSelect.value;
  document.getElementById("chore-interval-days").classList.toggle("hidden", type !== "interval_days");
  document.getElementById("chore-weekdays-picker").classList.toggle("hidden", type !== "weekly_on_days");
});

addChoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = frequencyTypeSelect.value;
  await db.from("chores").insert({
    name: document.getElementById("chore-name").value,
    room_id: document.getElementById("chore-room").value || null,
    frequency_type: type,
    frequency_interval_days: type === "interval_days"
      ? Number(document.getElementById("chore-interval-days").value) : null,
    frequency_weekdays: type === "weekly_on_days"
      ? [...document.querySelectorAll("#chore-weekdays-picker input:checked")].map((cb) => Number(cb.value))
      : null,
  });
  addChoreForm.reset();
  addChoreForm.classList.add("hidden");
  loadChores();
});

// ============================================================
// SECTION 2: INVENTORY
// ============================================================

async function loadInventory() {
  const { data: items, error } = await db.from("inventory_items").select("*").order("category");
  if (error) { console.error(error); return; }

  document.getElementById("inventory-list").innerHTML = items
    .map((item) => `
      <div class="card">
        <div class="card-info">
          <strong>${item.name}${item.category ? ` <span class="meta">(${item.category})</span>` : ""}</strong>
          <div class="meta">${item.last_restocked_at
            ? `Last restocked ${new Date(item.last_restocked_at).toLocaleDateString()}`
            : "Not restocked yet"}</div>
        </div>
        <div class="status-buttons">
          ${["ok","low","out"].map((s) => `
            <button class="status-btn status-${s} ${item.status === s ? "selected" : ""}"
              onclick="setInventoryStatus('${item.id}', '${s}')">${s.toUpperCase()}</button>
          `).join("")}
        </div>
      </div>`)
    .join("") || "<p>No items yet — add your first one above.</p>";
}

async function setInventoryStatus(itemId, status) {
  const update = { status };
  if (status === "ok") update.last_restocked_at = new Date().toISOString();
  await db.from("inventory_items").update(update).eq("id", itemId);
  loadInventory();
}

const addItemForm = document.getElementById("add-item-form");
document.getElementById("show-add-item").addEventListener("click", () => addItemForm.classList.remove("hidden"));
document.getElementById("cancel-add-item").addEventListener("click", () => addItemForm.classList.add("hidden"));

addItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await db.from("inventory_items").insert({
    name: document.getElementById("item-name").value,
    category: document.getElementById("item-category").value || null,
  });
  addItemForm.reset();
  addItemForm.classList.add("hidden");
  loadInventory();
});

// ============================================================
// SECTION 3: GROCERIES
// ============================================================

async function loadGroceries() {
  const { data: items, error } = await db.from("grocery_requests").select("*")
    .order("created_at", { ascending: false });
  if (error) { console.error(error); return; }

  const active = items.filter((i) => i.status === "requested");
  const purchased = items.filter((i) => i.status === "purchased");

  document.getElementById("groceries-list").innerHTML = active
    .map((item) => {
      if (item.id === editingGroceryId) return renderGroceryEditForm(item);
      return `
      <div class="card">
        <div class="card-info">
          <strong>${item.item_name}</strong>
          <div class="meta">${item.note ? item.note + " · " : ""}requested by ${item.requested_by || "someone"}</div>
        </div>
        <div class="card-buttons">
          <button class="btn-secondary" onclick="markPurchased('${item.id}')">Mark purchased</button>
          <button class="btn-text" onclick="startEditGrocery('${item.id}')">Edit</button>
        </div>
      </div>`;
    })
    .join("") || "<p>No requests right now.</p>";

  document.getElementById("purchased-list").innerHTML = purchased
    .map((item) => `
      <div class="card">
        <div class="card-info"><strong>${item.item_name}</strong>
        ${item.note ? ` <span class="meta">${item.note}</span>` : ""}
        </div>
        <button class="btn-secondary" onclick="addBackToList('${item.id}')">Add back to list</button>
      </div>`)
    .join("") || "<p>Empty</p>";
}

function renderGroceryEditForm(item) {
  return `
    <div class="card add-form">
      <input type="text" id="edit-grocery-item-${item.id}" value="${item.item_name}" />
      <input type="text" id="edit-grocery-note-${item.id}" value="${item.note || ""}" placeholder="Note (optional)" />
      <div class="form-buttons">
        <button class="btn-primary" onclick="saveEditGrocery('${item.id}')">Save</button>
        <button class="btn-text" onclick="cancelEditGrocery()">Cancel</button>
      </div>
    </div>`;
}

function startEditGrocery(itemId) {
  editingGroceryId = itemId;
  loadGroceries();
}

function cancelEditGrocery() {
  editingGroceryId = null;
  loadGroceries();
}

async function saveEditGrocery(itemId) {
  await db.from("grocery_requests").update({
    item_name: document.getElementById(`edit-grocery-item-${itemId}`).value,
    note: document.getElementById(`edit-grocery-note-${itemId}`).value || null,
  }).eq("id", itemId);
  editingGroceryId = null;
  loadGroceries();
}

async function markPurchased(itemId) {
  await db.from("grocery_requests").update({ status: "purchased" }).eq("id", itemId);
  loadGroceries();
}

async function addBackToList(itemId) {
  await db.from("grocery_requests").update({
    status: "requested",
    created_at: new Date().toISOString(), // bumps it back to the top
    requested_by: displayName(currentUser), // credits whoever re-added it
  }).eq("id", itemId);
  loadGroceries();
}

const addGroceryForm = document.getElementById("add-grocery-form");
document.getElementById("show-add-grocery").addEventListener("click", () => addGroceryForm.classList.remove("hidden"));
document.getElementById("cancel-add-grocery").addEventListener("click", () => addGroceryForm.classList.add("hidden"));

addGroceryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await db.from("grocery_requests").insert({
    item_name: document.getElementById("grocery-item").value,
    note: document.getElementById("grocery-note").value || null,
    // Uses the logged-in user's display name automatically
    requested_by: displayName(currentUser),
  });
  addGroceryForm.reset();
  addGroceryForm.classList.add("hidden");
  loadGroceries();
});