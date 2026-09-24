const DAILY_GOAL = 20;

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
const weekRange = document.querySelector("#weekRange");
const prevWeekButton = document.querySelector("#prevWeekButton");
const todayWeekButton = document.querySelector("#todayWeekButton");
const nextWeekButton = document.querySelector("#nextWeekButton");
const sweetAlert = document.querySelector("#sweetAlert");
const sweetAlertType = document.querySelector("#sweetAlertType");
const sweetAlertTitle = document.querySelector("#sweetAlertTitle");
const sweetAlertText = document.querySelector("#sweetAlertText");
const dayModal = document.querySelector("#dayModal");
const dayEditForm = document.querySelector("#dayEditForm");
const dayEditDate = document.querySelector("#dayEditDate");
const dayAmountInput = document.querySelector("#dayAmountInput");
const dayNoteInput = document.querySelector("#dayNoteInput");
const closeDayModal = document.querySelector("#closeDayModal");
const clearDayButton = document.querySelector("#clearDayButton");

let currentEntries = [];
let chartWeekOffset = 0;
let editingDate = "";
let alertTimer;

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

const shortRangeLabel = new Intl.DateTimeFormat(undefined, {
  month: "short",
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

function dateFromKey(date) {
  return new Date(`${date}T00:00:00`);
}

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#ff9aa4" : "";
}

function formatDate(date) {
  return dateLabel.format(dateFromKey(date));
}

function getWeekDays(offset = chartWeekOffset) {
  const days = [];
  const start = dateFromKey(today());
  start.setDate(start.getDate() - 6 + (offset * 7));

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push({
      key: toDateKey(date),
      label: shortDayLabel.format(date),
      total: 0,
      note: ""
    });
  }

  return days;
}

function getDayTotal(date) {
  return currentEntries
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function getDayNote(date) {
  return currentEntries
    .filter((entry) => entry.date === date)
    .map((entry) => entry.note)
    .filter(Boolean)
    .join("; ");
}

function alertCopy(amount) {
  if (amount > 0) {
    if (amount >= DAILY_GOAL) {
      return {
        type: "win",
        title: "Goal crushed",
        text: `Up ${money.format(amount)}. The $20 target is looking nervous.`
      };
    }

    return {
      type: "win",
      title: "Green number energy",
      text: `Nice, ${money.format(amount)} won. Only ${money.format(DAILY_GOAL - amount)} to today's goal.`
    };
  }

  if (amount < 0) {
    return {
      type: "loss",
      title: "Tiny table tax",
      text: `${money.format(Math.abs(amount))} down. The wheel got rent money, but not the house deed.`
    };
  }

  return {
    type: "neutral",
    title: "Clean slate",
    text: "Zero saved for the day. Suspiciously calm."
  };
}

function showSweetAlert(amount, overrideTitle) {
  const copy = alertCopy(amount);
  sweetAlert.className = `sweet-alert visible ${copy.type}`;
  sweetAlertType.textContent = copy.type === "loss" ? "LOSS" : copy.type === "win" ? "WIN" : "OK";
  sweetAlertTitle.textContent = overrideTitle || copy.title;
  sweetAlertText.textContent = copy.text;
  sweetAlert.setAttribute("aria-hidden", "false");

  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    sweetAlert.classList.remove("visible");
    sweetAlert.setAttribute("aria-hidden", "true");
  }, 3600);
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
  const days = getWeekDays();
  const dayMap = new Map(days.map((day) => [day.key, day]));

  entries.forEach((entry) => {
    const day = dayMap.get(entry.date);
    if (day) {
      day.total += entry.amount;
      if (entry.note) day.note = day.note ? `${day.note}; ${entry.note}` : entry.note;
    }
  });

  const largest = Math.max(...days.map((day) => Math.abs(day.total)), DAILY_GOAL, 1);
  const goalPosition = 50 + ((DAILY_GOAL / largest) * 50);
  const weekTotal = days.reduce((sum, day) => sum + day.total, 0);
  weekAmount.textContent = money.format(weekTotal);
  weekRange.textContent = `${shortRangeLabel.format(dateFromKey(days[0].key))} - ${shortRangeLabel.format(dateFromKey(days[6].key))}`;
  nextWeekButton.disabled = chartWeekOffset >= 0;

  const bars = days.map((day) => {
    const item = document.createElement("button");
    item.className = `chart-day ${day.total >= DAILY_GOAL ? "goal-met" : ""}`;
    item.type = "button";
    item.title = `Edit ${day.label}`;
    item.setAttribute("aria-label", `Edit ${day.label}, ${money.format(day.total)}`);
    item.addEventListener("click", () => openDayModal(day.key));

    const track = document.createElement("span");
    track.className = "chart-track";

    const goal = document.createElement("span");
    goal.className = "chart-goal-line";
    goal.style.bottom = `${Math.min(goalPosition, 98)}%`;
    goal.textContent = "$20";

    const bar = document.createElement("span");
    const height = Math.max((Math.abs(day.total) / largest) * 100, day.total === 0 ? 2 : 10);
    bar.className = `chart-bar ${day.total < 0 ? "loss" : "win"}`;
    bar.style.height = `${height}%`;

    if (day.total < 0) {
      track.append(goal, document.createElement("span"), bar);
    } else {
      track.append(goal, bar, document.createElement("span"));
    }

    const value = document.createElement("strong");
    value.textContent = money.format(day.total);

    const label = document.createElement("span");
    label.className = "chart-label";
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
  currentEntries = entries;
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
  showSweetAlert(Number(payload.amount));
  await loadEntries();
}

async function saveDayTotal(amount, note) {
  const savedDate = editingDate;
  const response = await fetch(`/api/day/${encodeURIComponent(editingDate)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, note })
  });

  const data = await response.json();
  if (!response.ok) {
    setMessage(data.error || "Could not update that day.", true);
    return false;
  }

  closeModal();
  setMessage(`Updated ${formatDate(savedDate)} from the chart.`);
  showSweetAlert(Number(amount), "Diagram updated");
  await loadEntries();
  return true;
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

function openDayModal(date) {
  editingDate = date;
  dayEditDate.textContent = formatDate(date);
  dayAmountInput.value = getDayTotal(date).toFixed(2);
  dayNoteInput.value = getDayNote(date);
  dayModal.classList.add("visible");
  dayModal.setAttribute("aria-hidden", "false");
  dayAmountInput.focus();
  dayAmountInput.select();
}

function closeModal() {
  dayModal.classList.remove("visible");
  dayModal.setAttribute("aria-hidden", "true");
  editingDate = "";
}

form.addEventListener("submit", saveEntry);
refreshButton.addEventListener("click", loadEntries);

prevWeekButton.addEventListener("click", () => {
  chartWeekOffset -= 1;
  renderWeekChart(currentEntries);
});

todayWeekButton.addEventListener("click", () => {
  chartWeekOffset = 0;
  renderWeekChart(currentEntries);
});

nextWeekButton.addEventListener("click", () => {
  if (chartWeekOffset < 0) {
    chartWeekOffset += 1;
    renderWeekChart(currentEntries);
  }
});

dayEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveDayTotal(dayAmountInput.value, dayNoteInput.value);
});

clearDayButton.addEventListener("click", async () => {
  dayAmountInput.value = "0.00";
  dayNoteInput.value = "";
  await saveDayTotal(0, "");
});

closeDayModal.addEventListener("click", closeModal);
dayModal.addEventListener("click", (event) => {
  if (event.target === dayModal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dayModal.classList.contains("visible")) {
    closeModal();
  }
});

dateInput.value = today();
loadEntries().catch(() => {
  setMessage("Could not load the text file yet.", true);
});
