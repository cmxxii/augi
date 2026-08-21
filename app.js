// ============================================================
// AUGUSTA — APP LOGIC (with Supabase Auth)
// ============================================================

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tracks the currently logged-in user (set on auth state change below)
let currentUser = null;

// Helper: the display name for a user is the part before @ in their email
// e.g. camille@gmail.com → "camille"
function displayName(user) {
  if (!user) return "";
  return user.email.split("@")[0];
}

// ============================================================
// AUTH — login / logout / session persistence
// ============================================================

// This runs automatically whenever auth state changes (login, logout,
// or on page load if a session already exists from a previous visit).
// It's the central place that shows/hides the login screen vs. the app.
db.auth.onAuthStateChange((_event, session) => {
  if (session) {
    // Logged in
    currentUser = session.user;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("logged-in-name").textContent = displayName(currentUser);
    // Load all data now that we know who's logged in
    loadChores();
    loadInventory();
    loadGroceries();
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

  const sorted = chores
    .map((c) => ({ chore: c, due: nextDueDate(c) }))
    .sort((a, b) => a.due - b.due);

  document.getElementById("chores-list").innerHTML = sorted
    .map(({ chore, due }) => {
      const status = dueStatus(due);
      return `
        <div class="card">
          <div class="card-info">
            <strong>${chore.name}${chore.room ? ` <span class="meta">(${chore.room})</span>` : ""}</strong>
            <div class="meta ${status.className}">${status.label} · ${frequencyLabel(chore)}</div>
            <div class="meta">${lastDoneLabel(chore)}</div>
          </div>
          <button class="btn-primary" onclick="markChoreDone('${chore.id}')">Mark done</button>
        </div>`;
    })
    .join("") || "<p>No chores yet — add your first one above.</p>";
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
  document.getElementById("chore-day-of-month").classList.toggle("hidden", type !== "monthly_on_day");
});

addChoreForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = frequencyTypeSelect.value;
  await db.from("chores").insert({
    name: document.getElementById("chore-name").value,
    room: document.getElementById("chore-room").value || null,
    frequency_type: type,
    frequency_interval_days: type === "interval_days"
      ? Number(document.getElementById("chore-interval-days").value) : null,
    frequency_weekdays: type === "weekly_on_days"
      ? [...document.querySelectorAll("#chore-weekdays-picker input:checked")].map((cb) => Number(cb.value))
      : null,
    frequency_day_of_month: type === "monthly_on_day"
      ? Number(document.getElementById("chore-day-of-month").value) : null,
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
    .map((item) => `
      <div class="card">
        <div class="card-info">
          <strong>${item.item_name}</strong>
          <div class="meta">${item.note ? item.note + " · " : ""}requested by ${item.requested_by || "someone"}</div>
        </div>
        <button class="btn-secondary" onclick="markPurchased('${item.id}')">Mark purchased</button>
      </div>`)
    .join("") || "<p>No requests right now.</p>";

  document.getElementById("purchased-list").innerHTML = purchased
    .map((item) => `
      <div class="card">
        <div class="card-info"><strong>${item.item_name}</strong></div>
      </div>`)
    .join("") || "<p>Nothing purchased yet.</p>";
}

async function markPurchased(itemId) {
  await db.from("grocery_requests").update({ status: "purchased" }).eq("id", itemId);
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