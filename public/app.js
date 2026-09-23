const form = document.querySelector("#entryForm");
const dateInput = document.querySelector("#dateInput");
const amountInput = document.querySelector("#amountInput");
const noteInput = document.querySelector("#noteInput");
const formMessage = document.querySelector("#formMessage");
const refreshButton = document.querySelector("#refreshButton");
const entryList = document.querySelector("#entryList");
const emptyState = document.querySelector("#emptyState");
const totalAmount = document.querySelector("#totalAmount");
const monthAmount = document.querySelector("#monthAmount");
const bestDay = document.querySelector("#bestDay");
const weekAmount = document.querySelector("#weekAmount");
const weekChart = document.querySelector("#weekChart");

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD"
});

const dateLabel = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric"
});

const shortDayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric"
});

function today() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#ff9aa4" : "";
}

function formatDate(date) {
  return dateLabel.format(new Date(`${date}T00:00:00`));
}

function getLastSevenDays() {
  const days = [];
  const start = new Date(`${today()}T00:00:00`);

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(start);
    date.setDate(start.getDate() - offset);
    days.push({
      key: toDateKey(date),
      label: shortDayLabel.format(date),
      total: 0
    });
  }

  return days;
}

function renderStats(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const currentMonth = today().slice(0, 7);
  const monthTotal = entries
    .filter((entry) => entry.date.startsWith(currentMonth))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const topEntry = entries.reduce((best, entry) => {
    if (!best || entry.amount > best.amount) return entry;
    return best;
  }, null);

  totalAmount.textContent = money.format(total);
  monthAmount.textContent = money.format(monthTotal);
  bestDay.textContent = topEntry ? money.format(topEntry.amount) : money.format(0);
}

function renderWeekChart(entries) {
  const days = getLastSevenDays();
  const dayMap = new Map(days.map((day) => [day.key, day]));

  entries.forEach((entry) => {
    const day = dayMap.get(entry.date);
    if (day) day.total += entry.amount;
  });

  const largest = Math.max(...days.map((day) => Math.abs(day.total)), 1);
  const weekTotal = days.reduce((sum, day) => sum + day.total, 0);
  weekAmount.textContent = money.format(weekTotal);

  const bars = days.map((day) => {
    const item = document.createElement("div");
    item.className = "chart-day";

    const track = document.createElement("div");
    track.className = "chart-track";

    const bar = document.createElement("span");
    const height = Math.max((Math.abs(day.total) / largest) * 100, day.total === 0 ? 2 : 10);
    bar.className = `chart-bar ${day.total < 0 ? "loss" : "win"}`;
    bar.style.height = `${height}%`;
    bar.title = `${day.label}: ${money.format(day.total)}`;

    if (day.total < 0) {
      track.append(document.createElement("span"), bar);
    } else {
      track.append(bar, document.createElement("span"));
    }

    const value = document.createElement("strong");
    value.textContent = money.format(day.total);

    const label = document.createElement("span");
    label.textContent = day.label;

    item.append(track, value, label);
    return item;
  });

  weekChart.replaceChildren(...bars);
}

function entryTemplate(entry) {
  const item = document.createElement("li");
  item.className = `entry-item ${entry.amount < 0 ? "loss" : ""}`;

  const content = document.createElement("div");

  const date = document.createElement("span");
  date.className = "entry-date";
  date.textContent = formatDate(entry.date);

  const note = document.createElement("span");
  note.className = "entry-note";
  note.textContent = entry.note || "No note";

  const amount = document.createElement("strong");
  amount.className = "entry-amount";
  amount.textContent = money.format(entry.amount);

  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.textContent = "X";
  remove.title = "Delete entry";
  remove.setAttribute("aria-label", `Delete entry for ${formatDate(entry.date)}`);
  remove.addEventListener("click", () => deleteEntry(entry.id));

  content.append(date, note);
  item.append(content, amount, remove);
  return item;
}

function renderEntries(entries) {
  entryList.replaceChildren(...entries.map(entryTemplate));
  emptyState.classList.toggle("visible", entries.length === 0);
  renderStats(entries);
  renderWeekChart(entries);
}

async function loadEntries() {
  const response = await fetch("/api/entries");
  if (!response.ok) throw new Error("Could not load entries.");
  const data = await response.json();
  renderEntries(data.entries);
}

async function saveEntry(event) {
  event.preventDefault();
  setMessage("Saving...");

  const payload = {
    date: dateInput.value,
    amount: amountInput.value,
    note: noteInput.value
  };

  const response = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    setMessage(data.error || "Could not save entry.", true);
    return;
  }

  amountInput.value = "";
  noteInput.value = "";
  setMessage("Saved to data/winnings.txt");
  await loadEntries();
}

async function deleteEntry(id) {
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    setMessage("Could not delete that entry.", true);
    return;
  }

  setMessage("Entry deleted.");
  await loadEntries();
}

form.addEventListener("submit", saveEntry);
refreshButton.addEventListener("click", loadEntries);

dateInput.value = today();
loadEntries().catch(() => {
  setMessage("Could not load the text file yet.", true);
});
