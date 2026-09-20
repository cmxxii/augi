// ============================================================
// AUGUSTA — APP LOGIC (with Supabase Auth)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tracks the currently logged-in user (set on auth state change below)
let currentUser = null;

let editingChoreId = null;

let editingGroceryId = null;

let choreManageMode = false;
let groceryEditMode = false;
let supplyManageMode = false;
let editingItemId = null;

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
  if (n.includes("out")) return '<span class="material-symbols-rounded">garage_door</span>';
  if (n.includes("car")) return '<span class="material-symbols-rounded">directions_car</span>';
  if (n.includes("cook")) return '<span class="material-symbols-rounded">kitchen</span>';
  if (n.includes("table")) return '<span class="material-symbols-rounded">table_restaurant</span>';
  if (n.includes("couch")) return '<span class="material-symbols-rounded">chair</span>';
  if (n.includes("bath")) return '<span class="material-symbols-rounded">faucet</span>';
  if (n.includes("hall")) return '<span class="material-symbols-rounded">hallway</span>';
  if (n.includes("bed")) return '<span class="material-symbols-rounded">bed</span>';
  return '<span class="material-symbols-rounded">door_open</span>';
}

function renderRoomOptions() {
  ["chore-room", "item-room"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML =
      `<option value="">No room</option>` +
      roomsCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join("");
    select.value = current;
  });
}

async function loadHistory() {
  const { data: completions, error } = await db
    .from("chore_completions")
    .select("*, chores(name, room_id)")
    .order("completed_at", { ascending: false });
  if (error) { console.error(error); return; }

  const listEl = document.getElementById("history-list");
  const roomsBtn = document.querySelector('.sort-btn[data-sort="room"]');
  const allTasksBtn = document.querySelector('.sort-btn[data-sort="priority"]');

  const groups = {};
  completions.forEach((c) => {
    const key = c.chores?.room_id || "none";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });

  const inRoom = viewMode === "room" && roomFilter &&
    (roomFilter === "none" ? (groups["none"]?.length > 0) : roomsCache.some((r) => r.id === roomFilter));

  if (inRoom) {
    roomsBtn.innerHTML = '<span class="material-symbols-rounded">arrow_back</span> Rooms';
    roomsBtn.classList.remove("active");
    allTasksBtn.classList.remove("active");
  } else {
    roomsBtn.innerHTML = "Rooms";
    roomsBtn.classList.toggle("active", viewMode === "room");
    allTasksBtn.classList.toggle("active", viewMode === "priority");
  }

  const renderEntry = (c, showRoomLabel) => {
    const when = new Date(c.completed_at).toLocaleDateString();
    const who = displayNameCache[c.completed_by] || c.completed_by.split("@")[0];
    const choreName = c.chores?.name || "Unknown chore";
    let roomLabelHtml = "";
    if (showRoomLabel) {
      const roomIconKey = c.chores?.room_id ? (roomsCache.find((r) => r.id === c.chores.room_id)?.wip_icon || "") : "";
      const roomLabelText = c.chores?.room_id ? roomName(c.chores.room_id) : "No room";
      roomLabelHtml = `<div class="meta room-label">${roomIcon(roomIconKey)} ${roomLabelText}</div>`;
    }
    return `
      <div class="card">
        <div class="card-info">
          ${roomLabelHtml}
          <strong>${choreName}</strong>
          <div class="meta">${who} · ${when}</div>
        </div>
      </div>`;
  };

  if (viewMode === "room") {
    if (inRoom) {
      const roomLabel = roomFilter === "none" ? "No room" : roomName(roomFilter);
      const roomIconKey = roomFilter === "none" ? "" : (roomsCache.find((r) => r.id === roomFilter)?.wip_icon || "");

      listEl.innerHTML = `
        <h3 class="room-heading">${roomIcon(roomIconKey)}<span>${roomLabel}</span></h3>
        ${(groups[roomFilter] || []).map((c) => renderEntry(c, false)).join("") || "<p>No history in this room yet.</p>"}`;
    } else {
      const roomCards = roomsCache.map((r) => ({ key: r.id, name: r.name, wip_icon: r.wip_icon, entries: groups[r.id] || [] }));
      if (groups["none"]?.length) {
        roomCards.push({ key: "none", name: "No room", wip_icon: "", entries: groups["none"] });
      }

      listEl.innerHTML = roomCards
        .map(({ key, name, wip_icon, entries }) => `
          <div class="card room-card" onclick="filterByRoom('${key}')">
            <div class="card-info">
              <strong>${roomIcon(wip_icon)} ${name}</strong>
              <div class="meta">${entries.length} completed</div>
            </div>
          </div>`)
        .join("");
    }
  } else {
    listEl.innerHTML = completions.map((c) => renderEntry(c, true)).join("") || "<p>No history yet.</p>";
  }
}

document.getElementById("toggle-chore-manage-mode").addEventListener("change", (e) => {
  choreManageMode = e.target.checked;
  editingChoreId = null;
  if (!choreManageMode) addChoreForm.classList.add("hidden");
  loadChores();
});

document.getElementById("toggle-grocery-edit-mode").addEventListener("change", (e) => {
  groceryEditMode = e.target.checked;
  editingGroceryId = null;
  loadGroceries();
});

document.getElementById("toggle-supply-manage-mode").addEventListener("change", (e) => {
  supplyManageMode = e.target.checked;
  editingItemId = null;
  if (!supplyManageMode) addItemForm.classList.add("hidden");
  loadInventory();
});

function resetEditModes() {
  choreManageMode = false;
  groceryEditMode = false;
  supplyManageMode = false;
  editingChoreId = null;
  editingGroceryId = null;
  editingItemId = null;
  document.getElementById("toggle-chore-manage-mode").checked = false;
  document.getElementById("toggle-grocery-edit-mode").checked = false;
  document.getElementById("toggle-supply-manage-mode").checked = false;
  addChoreForm.classList.add("hidden");
  addItemForm.classList.add("hidden");
  loadChores();
  loadGroceries();
  loadInventory();
}

// Cache of email → display name, loaded once after login
let displayNameCache = {};
let peopleCache = [];

const USER_ICONS = { AKS: "face_4", CPP: "face_3", OCE: "face" };
const USER_ORDER = ["AKS", "CPP", "OCE"];

async function loadDisplayNameCache() {
  const { data, error } = await db.from("people").select("user_email, display_name");
  if (!error && data) {
    displayNameCache = Object.fromEntries(data.map((row) => [row.user_email, row.display_name]));
    peopleCache = data
      .filter((p) => USER_ICONS[p.display_name])
      .sort((a, b) => USER_ORDER.indexOf(a.display_name) - USER_ORDER.indexOf(b.display_name));
    renderAssigneeToggles("chore-assignees");
  }
}

function assigneeIcon(displayNameValue) {
  return USER_ICONS[displayNameValue] || "person";
}

function renderAssigneeToggles(containerId, selectedEmails = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = peopleCache
    .map((p) => `
      <button type="button" class="assignee-btn ${selectedEmails.includes(p.user_email) ? "active" : ""}" data-email="${p.user_email}" onclick="this.classList.toggle('active')">
        <span class="material-symbols-rounded">${assigneeIcon(p.display_name)}</span> ${p.display_name}
      </button>`)
    .join("");
}

function getSelectedAssignees(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .assignee-btn.active`))
    .map((btn) => btn.dataset.email);
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

document.getElementById("show-feedback").addEventListener("click", () => {
  document.getElementById("feedback-modal").classList.remove("hidden");
});

document.getElementById("cancel-feedback").addEventListener("click", () => {
  document.getElementById("feedback-modal").classList.add("hidden");
  document.getElementById("feedback-message").value = "";
});

document.getElementById("submit-feedback").addEventListener("click", async () => {
  const message = document.getElementById("feedback-message").value.trim();
  if (!message) return;
  await db.from("feedback").insert({
    message,
    submitted_by: displayName(currentUser),
  });
  document.getElementById("feedback-message").value = "";
  document.getElementById("feedback-modal").classList.add("hidden");
});

document.getElementById("show-version").addEventListener("click", () => {
  document.getElementById("version-modal").classList.remove("hidden");
});

document.getElementById("close-version").addEventListener("click", () => {
  document.getElementById("version-modal").classList.add("hidden");
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
    resetEditModes();
  });
});

document.querySelectorAll(".subtab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab-button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.subtab).classList.add("active");

    document.getElementById("chores-tab").dataset.subtab = btn.dataset.subtab;
    const allBtn = document.querySelector('.sort-btn[data-sort="priority"]');
    if (allBtn) allBtn.textContent = btn.dataset.subtab === "chores-supplies-subtab" ? "All" : "All Tasks";

    if (btn.dataset.subtab === "chores-todo-subtab") loadChores();
    if (btn.dataset.subtab === "chores-history-subtab") loadHistory();
    if (btn.dataset.subtab === "chores-supplies-subtab") loadInventory();
  });
});

let viewMode = "room"; // shared between Tasks and History — Rooms/All Tasks acts as one universal toggle
let roomFilter = null; // shared between Tasks and History so picking a room in one keeps it selected in the other

document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    viewMode = btn.dataset.sort;
    roomFilter = null;
    loadChores();
    loadHistory();
    loadInventory();
  });
});

document.getElementById("home-link").addEventListener("click", () => {
  document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.tab-button[data-tab="chores-tab"]').classList.add("active");
  document.getElementById("chores-tab").classList.add("active");

  document.querySelectorAll(".subtab-button").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.subtab-button[data-subtab="chores-todo-subtab"]').classList.add("active");
  document.getElementById("chores-todo-subtab").classList.add("active");

  document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector('.sort-btn[data-sort="room"]').classList.add("active");
  viewMode = "room";

  roomFilter = null;
  resetEditModes();
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
  if (days < 0) return { label: `Overdue by ${-days} days`, className: "due-overdue" };
  if (days >= 0 && days <= 1) return { label: "Due today", className: "due-today" };
  return { label: `Due in ${days} days`, className: "due-later" };
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
  return `Last done ${days} days ago`;
}

async function loadChores() {
  const { data: chores, error } = await db.from("chores").select("*, chore_assignments(user_email)");
  if (error) {
    document.getElementById("chores-list").innerHTML =
      `<p>Couldn't load chores. Check the console for details.</p>`;
    console.error(error);
    return;
  }

  chores.forEach((c) => { c.assignedEmails = (c.chore_assignments || []).map((a) => a.user_email); });

  const listEl = document.getElementById("chores-list");
  const headerButtons = document.getElementById("chore-manage-wrap");
  const roomsBtn = document.querySelector('.sort-btn[data-sort="room"]');
  const allTasksBtn = document.querySelector('.sort-btn[data-sort="priority"]');
  const withDue = chores.map((c) => ({ chore: c, due: nextDueDate(c) }));
  updateUserButtonState(withDue);

  const groups = {};
  withDue.forEach(({ chore, due }) => {
    const key = chore.room_id || "none";
    if (!groups[key]) groups[key] = [];
    groups[key].push({ chore, due });
  });

  const inRoom = viewMode === "room" && roomFilter &&
    (roomFilter === "none" ? (groups["none"]?.length > 0) : roomsCache.some((r) => r.id === roomFilter));

  if (inRoom) {
    roomsBtn.innerHTML = '<span class="material-symbols-rounded">arrow_back</span> Rooms';
    roomsBtn.classList.remove("active");
    allTasksBtn.classList.remove("active");
  } else {
    roomsBtn.innerHTML = "Rooms";
    roomsBtn.classList.toggle("active", viewMode === "room");
    allTasksBtn.classList.toggle("active", viewMode === "priority");
  }

  if (viewMode === "room") {
    if (inRoom) {
      headerButtons.classList.remove("hidden");
      const groupChores = (groups[roomFilter] || []).sort((a, b) => a.due - b.due);
      const roomLabel = roomFilter === "none" ? "No room" : roomName(roomFilter);
      const roomIconKey = roomFilter === "none" ? "" : (roomsCache.find((r) => r.id === roomFilter)?.wip_icon || "");

      const addCardHtml = choreManageMode
        ? `<div class="card add-chore-card" onclick="openAddChoreForm()">+ Add chore</div>`
        : "";

      listEl.innerHTML = `
        <h3 class="room-heading">${roomIcon(roomIconKey)}<span>${roomLabel}</span></h3>
        ${addCardHtml}
        ${groupChores.map(({ chore, due }) => renderChoreCard(chore, due, false)).join("") || (choreManageMode ? "" : "<p>No chores in this room yet. Use <i>Manage</i> toggle above to add a chore.</p>")}`;
    } else {
      headerButtons.classList.add("hidden");
      if (choreManageMode) {
        choreManageMode = false;
        document.getElementById("toggle-chore-manage-mode").checked = false;
        addChoreForm.classList.add("hidden");
      }

      const roomCards = roomsCache.map((r) => ({ key: r.id, name: r.name, wip_icon: r.wip_icon, entries: groups[r.id] || [] }));
      if (groups["none"]?.length) {
        roomCards.push({ key: "none", name: "No room", wip_icon: "", entries: groups["none"] });
      }

      listEl.innerHTML = roomCards
        .map(({ key, name, wip_icon, entries }) => {
          const overdueCount = entries.filter(({ due }) => dueStatus(due).className === "due-overdue").length;
          const todayCount = entries.filter(({ due }) => dueStatus(due).className === "due-today").length;

          const statsHtml = `${entries.length} task${entries.length === 1 ? "" : "s"}` +
            (overdueCount > 0 ? ` · <span class="meta due-overdue">${overdueCount} overdue</span>` : "") +
            (todayCount > 0 ? ` · <span class="meta due-today">${todayCount} due today</span>` : "");

          return `
            <div class="card room-card" onclick="filterByRoom('${key}')">
              <div class="card-info">
                <strong>${roomIcon(wip_icon)} ${name}</strong>
                <div class="meta">${statsHtml}</div>
              </div>
            </div>`;
        })
        .join("");
    }
  } else {
    headerButtons.classList.add("hidden");
    if (choreManageMode) {
      choreManageMode = false;
      document.getElementById("toggle-chore-manage-mode").checked = false;
      addChoreForm.classList.add("hidden");
    }
    const sorted = withDue.sort((a, b) => a.due - b.due);
    listEl.innerHTML = sorted.map(({ chore, due }) => renderChoreCard(chore, due, true)).join("") || "<p>No chores yet.</p>";
  }
}

function filterByRoom(key) {
  roomFilter = key;
  loadChores();
  loadHistory();
  loadInventory();
}

function backToRooms() {
  roomFilter = null;
  loadChores();
  loadHistory();
  loadInventory();
}

function updateUserButtonState(withDue) {
  const btn = document.getElementById("logged-in-name");
  if (!btn || !currentUser) return;

  btn.classList.remove("due-overdue", "due-today");
  btn.innerHTML = `<span class="material-symbols-rounded">${assigneeIcon(displayName(currentUser))}</span>`;

  const mine = withDue.filter(({ chore }) => (chore.assignedEmails || []).includes(currentUser.email));
  const hasOverdue = mine.some(({ due }) => dueStatus(due).className === "due-overdue");
  const hasToday = mine.some(({ due }) => dueStatus(due).className === "due-today");

  if (hasOverdue) btn.classList.add("due-overdue");
  else if (hasToday) btn.classList.add("due-today");
}

document.getElementById("logged-in-name").addEventListener("click", async () => {
  const { data: chores, error } = await db.from("chores").select("*, chore_assignments(user_email)");
  if (error) return;

  chores.forEach((c) => { c.assignedEmails = (c.chore_assignments || []).map((a) => a.user_email); });
  const mine = chores
    .filter((c) => (c.assignedEmails || []).includes(currentUser.email))
    .map((c) => ({ chore: c, due: nextDueDate(c) }))
    .sort((a, b) => a.due - b.due);

  document.getElementById("my-chores-title").textContent = `Chores assigned to ${displayName(currentUser)}`;
  document.getElementById("my-chores-list").innerHTML =
    mine.map(({ chore, due }) => renderChoreCard(chore, due, true)).join("") || "<p>No chores assigned to you.</p>";
    document.getElementById("secret-pantry")
    .classList.toggle("hidden", displayName(currentUser) !== "CPP");

  document.getElementById("my-chores-modal").classList.remove("hidden");
});

document.getElementById("close-my-chores").addEventListener("click", () => {
  document.getElementById("my-chores-modal").classList.add("hidden");
});

document.getElementById("secret-pantry").addEventListener("click", () => {
  document.getElementById("my-chores-modal").classList.add("hidden");
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-button").forEach((b) => b.classList.remove("active"));
  document.getElementById("groceries-tab").classList.add("active");
  loadGroceries();
});

function filterChoresByRoom(key) {
  choresRoomFilter = key;
  loadChores();
}

function backToRoomCards() {
  choresRoomFilter = null;
  loadChores();
}

function renderChoreCard(chore, due, showRoomLabel) {
  if (chore.id === editingChoreId) return renderChoreEditForm(chore);
  const status = dueStatus(due);
    let roomLabelHtml = "";
  if (showRoomLabel) {
    const roomIconKey = chore.room_id ? (roomsCache.find((r) => r.id === chore.room_id)?.wip_icon || "") : "";
    const roomLabelText = chore.room_id ? roomName(chore.room_id) : "No room";
    roomLabelHtml = `<div class="meta room-label">${roomIcon(roomIconKey)} ${roomLabelText}</div>`;
  }
  const assigneeIconsHtml = (chore.assignedEmails && chore.assignedEmails.length)
    ? `<div class="card-assignees">${chore.assignedEmails.map((email) => `<span class="material-symbols-rounded" title="${displayNameCache[email] || email}">${assigneeIcon(displayNameCache[email])}</span>`).join("")}</div>`
    : "";

  return `
    <div class="card ${status.className}">
      <div class="card-info">
        ${roomLabelHtml}
        <div class="card-title-line">
          <strong>${chore.name}</strong>
          <span class="meta frequency-inline">${frequencyLabel(chore)}</span>
        </div>
        <div class="meta ${status.className}">${status.label}</div>
        <div class="meta last-done-line">
          ${assigneeIconsHtml}
          <span class="last-done-label">${lastDoneLabel(chore)}</span>
        </div>
      </div>
      <div class="card-buttons">
        ${choreManageMode ? "" : `<button class="btn-primary" onclick="markChoreDone('${chore.id}')">DONE</button>`}
                ${choreManageMode ? `<button class="btn-text" onclick="startEditChore('${chore.id}')">Edit</button>` : ""}
      </div>
    </div>`;
}

function renderChoreEditForm(chore) {
  const roomOptions = roomsCache
    .map((r) => `<option value="${r.id}" ${r.id === chore.room_id ? "selected" : ""}>${r.name}</option>`)
    .join("");

  const isWeekly = chore.frequency_type === "weekly_on_days";
  const frequencyFieldHtml = isWeekly
    ? `<div id="freq-hint" class="meta">For chores assigned to specific weekdays (like trash day), edit 'frequency' directly in database.</div>`
    : `<input type="number" id="edit-interval-days-${chore.id}" min="1" value="${chore.frequency_interval_days || ""}" placeholder="Repeat every N days" />`;

  const assigneeOptionsHtml = peopleCache
    .map((p) => `
      <button type="button" class="assignee-btn ${(chore.assignedEmails || []).includes(p.user_email) ? "active" : ""}" data-email="${p.user_email}" onclick="this.classList.toggle('active')">
        <span class="material-symbols-rounded">${assigneeIcon(p.display_name)}</span> ${p.display_name}
      </button>`)
    .join("");

  return `
    <div class="add-form">
      <input type="text" id="edit-name-${chore.id}" value="${chore.name}" />
      <select id="edit-room-${chore.id}">
        ${roomOptions}
      </select>
      ${frequencyFieldHtml}
      <div id="edit-assignees-${chore.id}" class="assignee-toggles">${assigneeOptionsHtml}</div>
      <div class="form-buttons">
        <button class="btn-primary" onclick="saveEditChore('${chore.id}')">Save</button>
        <button class="btn-text" onclick="cancelEditChore()">Cancel</button>
      </div>
    </div>`;
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
  const intervalInput = document.getElementById(`edit-interval-days-${choreId}`);

  const updates = {
    name: document.getElementById(`edit-name-${choreId}`).value,
    room_id: document.getElementById(`edit-room-${choreId}`).value || null,
  };

  if (intervalInput) {
    updates.frequency_interval_days = Number(intervalInput.value);
  }

  await db.from("chores").update(updates).eq("id", choreId);

  const selectedEmails = getSelectedAssignees(`edit-assignees-${choreId}`);
  await db.from("chore_assignments").delete().eq("chore_id", choreId);
  if (selectedEmails.length) {
    await db.from("chore_assignments").insert(selectedEmails.map((email) => ({ chore_id: choreId, user_email: email })));
  }

  editingChoreId = null;
  loadChores();
}

async function markChoreDone(choreId) {
  const now = new Date().toISOString();
  // Records who did it using their display name
  await db.from("chore_completions").insert({
    chore_id: choreId,
    completed_by: displayName(currentUser),
  });
  await db.from("chores").update({ last_completed_at: now }).eq("id", choreId);
  loadChores();
}

// Add chore form
const addChoreForm = document.getElementById("add-chore-form");
document.getElementById("cancel-add-chore").addEventListener("click", () => addChoreForm.classList.add("hidden"));

function openAddChoreForm() {
  document.getElementById("chore-room").value = roomFilter && roomFilter !== "none" ? roomFilter : "";
  renderAssigneeToggles("chore-assignees");
  addChoreForm.classList.remove("hidden");
}

addChoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { data: newChore, error } = await db.from("chores").insert({
    name: document.getElementById("chore-name").value,
    room_id: document.getElementById("chore-room").value || null,
    frequency_type: "interval_days",
    frequency_interval_days: Number(document.getElementById("chore-interval-days").value),
    frequency_weekdays: null,
  }).select().single();

  if (!error && newChore) {
    const emails = getSelectedAssignees("chore-assignees");
    if (emails.length) {
      await db.from("chore_assignments").insert(emails.map((email) => ({ chore_id: newChore.id, user_email: email })));
    }
  }

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

  const listEl = document.getElementById("inventory-list");
  const headerButtons = document.getElementById("supply-manage-wrap");
  const roomsBtn = document.querySelector('.sort-btn[data-sort="room"]');
  const allBtn = document.querySelector('.sort-btn[data-sort="priority"]');

  const groups = {};
  items.forEach((item) => {
    const key = item.room_id || "none";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  const inRoom = viewMode === "room" && roomFilter &&
    (roomFilter === "none" ? (groups["none"]?.length > 0) : roomsCache.some((r) => r.id === roomFilter));

  if (inRoom) {
    roomsBtn.innerHTML = '<span class="material-symbols-rounded">arrow_back</span> Rooms';
    roomsBtn.classList.remove("active");
    allBtn.classList.remove("active");
  } else {
    roomsBtn.innerHTML = "Rooms";
    roomsBtn.classList.toggle("active", viewMode === "room");
    allBtn.classList.toggle("active", viewMode === "priority");
  }

  const renderItem = (item) => {
    if (item.id === editingItemId) return renderItemEditForm(item);
    return `
      <div class="card">
        <div class="card-info">
          <strong>${item.name}${item.category ? ` <span class="meta">(${item.category})</span>` : ""}</strong>
          <div class="meta">${item.last_restocked_at
            ? `Last restocked ${new Date(item.last_restocked_at).toLocaleDateString()}`
            : "Not restocked yet"}</div>
        </div>
        <div class="status-buttons">
          ${supplyManageMode
            ? `<button class="btn-text" onclick="startEditItem('${item.id}')">Edit</button>`
            : ["ok","low","out"].map((s) => `
                <button class="status-btn status-${s} ${item.status === s ? "selected" : ""}"
                  onclick="setInventoryStatus('${item.id}', '${s}')">${s.toUpperCase()}</button>
              `).join("")}
        </div>
      </div>`;
  };

  if (viewMode === "room") {
    if (inRoom) {
      headerButtons.classList.remove("hidden");
      const roomLabel = roomFilter === "none" ? "No room" : roomName(roomFilter);
      const roomIconKey = roomFilter === "none" ? "" : (roomsCache.find((r) => r.id === roomFilter)?.wip_icon || "");

      const addCardHtml = supplyManageMode
        ? `<div class="card add-chore-card" onclick="openAddItemForm()">+ Add item</div>`
        : "";

      listEl.innerHTML = `
        <h3 class="room-heading">${roomIcon(roomIconKey)}<span>${roomLabel}</span></h3>
        ${addCardHtml}
        ${(groups[roomFilter] || []).map(renderItem).join("") || (supplyManageMode ? "" : "<p>No items in this room yet. Use <i>Manage</i> toggle above to add items.</p>")}`;
    } else {
      headerButtons.classList.add("hidden");
      if (supplyManageMode) {
        supplyManageMode = false;
        document.getElementById("toggle-supply-manage-mode").checked = false;
        addItemForm.classList.add("hidden");
      }

      const roomCards = roomsCache.map((r) => ({ key: r.id, name: r.name, wip_icon: r.wip_icon, entries: groups[r.id] || [] }));
      if (groups["none"]?.length) {
        roomCards.push({ key: "none", name: "No room", wip_icon: "", entries: groups["none"] });
      }

      listEl.innerHTML = roomCards
        .map(({ key, name, wip_icon, entries }) => `
          <div class="card room-card" onclick="filterByRoom('${key}')">
            <div class="card-info">
              <strong>${roomIcon(wip_icon)} ${name}</strong>
              <div class="meta">${entries.length} item${entries.length === 1 ? "" : "s"}</div>
            </div>
          </div>`)
        .join("");
    }
  } else {
    headerButtons.classList.add("hidden");
    if (supplyManageMode) {
      supplyManageMode = false;
      document.getElementById("toggle-supply-manage-mode").checked = false;
      addItemForm.classList.add("hidden");
    }
    listEl.innerHTML = items.map(renderItem).join("") || "<p>No items yet — add your first one above.</p>";
  }
}

async function setInventoryStatus(itemId, status) {
  const update = { status };
  if (status === "ok") update.last_restocked_at = new Date().toISOString();
  await db.from("inventory_items").update(update).eq("id", itemId);
  loadInventory();
}

function renderItemEditForm(item) {
  const roomOptions = roomsCache
    .map((r) => `<option value="${r.id}" ${r.id === item.room_id ? "selected" : ""}>${r.name}</option>`)
    .join("");

  return `
    <div class="add-form">
      <input type="text" id="edit-item-name-${item.id}" value="${item.name}" />
      <input type="text" id="edit-item-category-${item.id}" value="${item.category || ""}" placeholder="Category" />
      <select id="edit-item-room-${item.id}">
        <option value="">No room</option>
        ${roomOptions}
      </select>
      <div class="form-buttons">
        <button class="btn-primary" onclick="saveEditItem('${item.id}')">Save</button>
        <button class="btn-text" onclick="cancelEditItem()">Cancel</button>
      </div>
    </div>`;
}

function startEditItem(itemId) {
  editingItemId = itemId;
  loadInventory();
}

function cancelEditItem() {
  editingItemId = null;
  loadInventory();
}

async function saveEditItem(itemId) {
  const updates = {
    name: document.getElementById(`edit-item-name-${itemId}`).value,
    category: document.getElementById(`edit-item-category-${itemId}`).value || null,
    room_id: document.getElementById(`edit-item-room-${itemId}`).value || null,
  };

  await db.from("inventory_items").update(updates).eq("id", itemId);

  editingItemId = null;
  loadInventory();
}

const addItemForm = document.getElementById("add-item-form");
document.getElementById("cancel-add-item").addEventListener("click", () => addItemForm.classList.add("hidden"));

function openAddItemForm() {
  document.getElementById("item-room").value = roomFilter && roomFilter !== "none" ? roomFilter : "";
  addItemForm.classList.remove("hidden");
}

addItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await db.from("inventory_items").insert({
    name: document.getElementById("item-name").value,
    category: document.getElementById("item-category").value || null,
    room_id: document.getElementById("item-room").value || null,
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
          <div class="meta">${item.note ? item.note + " · " : ""}@ ${item.requested_by || "someone"}</div>
        </div>
        <div class="card-buttons">
          <button class="btn-secondary" onclick="markPurchased('${item.id}')">DONE</button>
          ${groceryEditMode ? `<button class="btn-text" onclick="startEditGrocery('${item.id}')">Edit</button>` : ""}
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
    <div class="add-form">
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