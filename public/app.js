const SVG_NS = "http://www.w3.org/2000/svg";

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
const chartTitle = document.querySelector("#chart-title");
const goalPill = document.querySelector("#goalPill");
const weekTabButton = document.querySelector("#weekTabButton");
const dayTabButton = document.querySelector("#dayTabButton");
const chartDateInput = document.querySelector("#chartDateInput");
const backWeekButton = document.querySelector("#backWeekButton");
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
let selectedChartDay = "";
let editingEntryId = "";
let alertTimer;

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR"
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

const timestampLabel = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
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

function formatTimestamp(entry) {
  return timestampLabel.format(entryTimestamp(entry));
}

function previousDateKey(date) {
  const previous = dateFromKey(date);
  previous.setDate(previous.getDate() - 1);
  return toDateKey(previous);
}

function dayTotal(entries, date) {
  return entries
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function previousDayTarget(entries, date) {
  return dayTotal(entries, previousDateKey(date));
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
      label: shortDayLabel.format(date)
    });
  }

  return days;
}

function entryTimestamp(entry) {
  const created = new Date(entry.createdAt);
  if (!Number.isNaN(created.getTime())) {
    const hours = String(created.getHours()).padStart(2, "0");
    const minutes = String(created.getMinutes()).padStart(2, "0");
    const seconds = String(created.getSeconds()).padStart(2, "0");
    return new Date(`${entry.date}T${hours}:${minutes}:${seconds}`);
  }

  return new Date(`${entry.date}T12:00:00`);
}

function alertCopy(amount, target = 0, dayTotalValue = amount) {
  if (amount > 0) {
    if (dayTotalValue > target) {
      return {
        type: "win",
        title: "Yesterday beaten",
        text: `Day total ${money.format(dayTotalValue)}. Previous day was ${money.format(target)}.`
      };
    }

    return {
      type: "win",
      title: "Chasing yesterday",
      text: `Nice, ${money.format(amount)} in. Day total ${money.format(dayTotalValue)}, target ${money.format(target)}.`
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

function showSweetAlert(amount, overrideTitle, target = 0, dayTotalValue = amount) {
  const copy = alertCopy(amount, target, dayTotalValue);
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

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function setChartTabs(mode, date = today()) {
  const isDay = mode === "day";
  weekTabButton.classList.toggle("active", !isDay);
  dayTabButton.classList.toggle("active", isDay);
  weekTabButton.setAttribute("aria-selected", String(!isDay));
  dayTabButton.setAttribute("aria-selected", String(isDay));
  dayTabButton.textContent = date === today() ? "Today" : "Day";
  chartDateInput.value = date;
}

function renderWeekChart(entries) {
  selectedChartDay = "";
  weekChart.classList.remove("day-mode");
  chartTitle.textContent = "Profit line";
  setChartTabs("week");
  goalPill.textContent = "Goal: beat previous day";
  backWeekButton.hidden = true;
  prevWeekButton.hidden = false;
  todayWeekButton.hidden = false;
  nextWeekButton.hidden = false;

  const days = getWeekDays();
  const firstDay = dateFromKey(days[0].key);
  const lastDay = dateFromKey(days[6].key);
  lastDay.setHours(23, 59, 59, 999);

  const startTime = firstDay.getTime();
  const endTime = lastDay.getTime();
  const rangeEntries = entries
    .filter((entry) => {
      const timestamp = entryTimestamp(entry).getTime();
      return timestamp >= startTime && timestamp <= endTime;
    })
    .sort((a, b) => entryTimestamp(a) - entryTimestamp(b) || a.createdAt.localeCompare(b.createdAt));

  let runningTotal = 0;
  const points = rangeEntries.map((entry) => {
    runningTotal += entry.amount;
    return {
      entry,
      timestamp: entryTimestamp(entry),
      value: runningTotal
    };
  });

  weekAmount.textContent = money.format(runningTotal);
  weekRange.textContent = `${shortRangeLabel.format(firstDay)} - ${shortRangeLabel.format(lastDay)}`;
  nextWeekButton.disabled = chartWeekOffset >= 0;

  const width = 820;
  const height = 320;
  const pad = { top: 24, right: 28, bottom: 54, left: 64 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const values = [0, ...points.map((point) => point.value)];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, 10);
  const yMin = minValue - (span * 0.12);
  const yMax = maxValue + (span * 0.12);

  const xScale = (time) => pad.left + (((time - startTime) / (endTime - startTime)) * chartWidth);
  const yScale = (value) => pad.top + (((yMax - value) / (yMax - yMin)) * chartHeight);
  const pathPoints = [
    { x: pad.left, y: yScale(0) },
    ...points.map((point) => ({
      x: xScale(point.timestamp.getTime()),
      y: yScale(point.value)
    }))
  ];

  const svg = svgElement("svg", {
    class: "line-chart",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Continuous profit and loss line chart"
  });

  const grid = svgElement("g", { class: "chart-grid" });
  for (let index = 0; index <= 4; index += 1) {
    const value = yMin + ((yMax - yMin) * (index / 4));
    const y = yScale(value);
    grid.append(
      svgElement("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y }),
      svgElement("text", { x: pad.left - 10, y: y + 4, "text-anchor": "end" })
    );
    grid.lastChild.textContent = money.format(value);
  }
  svg.append(grid);

  const dayMarks = svgElement("g", { class: "chart-days" });
  days.forEach((day) => {
    const x = xScale(dateFromKey(day.key).getTime());
    dayMarks.append(
      svgElement("line", { x1: x, x2: x, y1: pad.top, y2: height - pad.bottom }),
      svgElement("text", { x, y: height - 18, "text-anchor": "middle" })
    );
    dayMarks.lastChild.textContent = day.label;
  });
  svg.append(dayMarks);

  const zeroY = yScale(0);
  svg.append(svgElement("line", {
    class: "zero-line",
    x1: pad.left,
    x2: width - pad.right,
    y1: zeroY,
    y2: zeroY
  }));

  if (pathPoints.length > 1) {
    const path = pathPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    svg.append(svgElement("path", { class: "profit-line", d: path }));
  }

  const pointGroup = svgElement("g", { class: "chart-points" });
  points.forEach((point, index) => {
    const x = xScale(point.timestamp.getTime());
    const y = yScale(point.value);
    const pointButton = svgElement("circle", {
      class: `chart-point ${point.entry.amount < 0 ? "loss" : "win"}`,
      cx: x,
      cy: y,
      r: 7,
      tabindex: "0",
      role: "button",
      "aria-label": `Open ${formatDate(point.entry.date)} day chart`
    });
    pointButton.addEventListener("click", () => zoomToDay(point.entry.date));
    pointButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        zoomToDay(point.entry.date);
      }
    });

    const title = svgElement("title");
    title.textContent = `${formatDate(point.entry.date)} | click to zoom into the day`;
    pointButton.append(title);
    pointGroup.append(pointButton);

    if (points.length <= 8 || index === points.length - 1) {
      const text = svgElement("text", {
        class: "timestamp-text",
        x,
        y: y - 14,
        "text-anchor": "middle"
      });
      text.textContent = timestampLabel.format(point.timestamp);
      pointGroup.append(text);
    }
  });
  svg.append(pointGroup);

  if (points.length === 0) {
    const empty = svgElement("text", {
      class: "empty-chart-text",
      x: width / 2,
      y: height / 2,
      "text-anchor": "middle"
    });
    empty.textContent = "No points in this range yet";
    svg.append(empty);
  }

  weekChart.replaceChildren(svg);
}

function renderDayChart(entries, date) {
  selectedChartDay = date;
  chartTitle.textContent = "Day detail";
  setChartTabs("day", date);
  const target = previousDayTarget(entries, date);
  goalPill.textContent = `Target ${money.format(target)}`;
  backWeekButton.hidden = false;
  prevWeekButton.hidden = true;
  todayWeekButton.hidden = true;
  nextWeekButton.hidden = true;

  const dayEntries = entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => entryTimestamp(a) - entryTimestamp(b) || a.createdAt.localeCompare(b.createdAt));

  let runningTotal = 0;
  const points = dayEntries.map((entry) => {
    runningTotal += entry.amount;
    return {
      entry,
      timestamp: entryTimestamp(entry),
      value: runningTotal
    };
  });

  weekAmount.textContent = money.format(runningTotal);
  weekRange.textContent = `${formatDate(date)} - ${points.length} ${points.length === 1 ? "entry" : "entries"}`;

  const width = 820;
  const height = 320;
  const pad = { top: 28, right: 34, bottom: 58, left: 64 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const dayStart = dateFromKey(date);
  const dayEnd = dateFromKey(date);
  dayEnd.setHours(23, 59, 59, 999);
  const startTime = dayStart.getTime();
  const endTime = dayEnd.getTime();
  const values = [0, target, ...points.map((point) => point.value)];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, 10);
  const yMin = minValue - (span * 0.16);
  const yMax = maxValue + (span * 0.16);

  const xScale = (time) => pad.left + (((time - startTime) / (endTime - startTime)) * chartWidth);
  const yScale = (value) => pad.top + (((yMax - value) / (yMax - yMin)) * chartHeight);
  const pathPoints = [
    { x: pad.left, y: yScale(0) },
    ...points.map((point) => ({
      x: xScale(point.timestamp.getTime()),
      y: yScale(point.value)
    }))
  ];

  const svg = svgElement("svg", {
    class: "line-chart day-line-chart",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `Profit and loss line chart for ${formatDate(date)}`
  });

  const grid = svgElement("g", { class: "chart-grid" });
  for (let index = 0; index <= 4; index += 1) {
    const value = yMin + ((yMax - yMin) * (index / 4));
    const y = yScale(value);
    grid.append(
      svgElement("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y }),
      svgElement("text", { x: pad.left - 10, y: y + 4, "text-anchor": "end" })
    );
    grid.lastChild.textContent = money.format(value);
  }
  svg.append(grid);

  const timeMarks = svgElement("g", { class: "chart-days" });
  [0, 6, 12, 18, 24].forEach((hour) => {
    const marker = dateFromKey(date);
    marker.setHours(Math.min(hour, 23), hour === 24 ? 59 : 0, 0, 0);
    const x = xScale(marker.getTime());
    timeMarks.append(
      svgElement("line", { x1: x, x2: x, y1: pad.top, y2: height - pad.bottom }),
      svgElement("text", { x, y: height - 18, "text-anchor": "middle" })
    );
    timeMarks.lastChild.textContent = hour === 24 ? "24:00" : `${String(hour).padStart(2, "0")}:00`;
  });
  svg.append(timeMarks);

  const zeroY = yScale(0);
  svg.append(svgElement("line", {
    class: "zero-line",
    x1: pad.left,
    x2: width - pad.right,
    y1: zeroY,
    y2: zeroY
  }));

  const goalY = yScale(target);
  const goalLabel = svgElement("text", {
    class: "goal-text",
    x: width - pad.right,
    y: goalY - 6,
    "text-anchor": "end"
  });
  goalLabel.textContent = `Prev day ${money.format(target)}`;
  svg.append(
    svgElement("line", {
      class: "goal-line",
      x1: pad.left,
      x2: width - pad.right,
      y1: goalY,
      y2: goalY
    }),
    goalLabel
  );

  if (pathPoints.length > 1) {
    const path = pathPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    svg.append(svgElement("path", { class: "profit-line", d: path }));
  }

  const pointGroup = svgElement("g", { class: "chart-points" });
  points.forEach((point) => {
    const x = xScale(point.timestamp.getTime());
    const y = yScale(point.value);
    const pointButton = svgElement("circle", {
      class: `chart-point day-point ${point.entry.amount < 0 ? "loss" : "win"}`,
      cx: x,
      cy: y,
      r: 8,
      tabindex: "0",
      role: "button",
      "aria-label": `Edit ${formatTimestamp(point.entry)}, ${money.format(point.entry.amount)}`
    });
    pointButton.addEventListener("click", () => openEntryModal(point.entry.id));
    pointButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEntryModal(point.entry.id);
      }
    });

    const title = svgElement("title");
    title.textContent = `${formatTimestamp(point.entry)} | ${money.format(point.entry.amount)} | balance ${money.format(point.value)}`;
    pointButton.append(title);
    pointGroup.append(pointButton);

    const amountLabel = svgElement("text", {
      class: `amount-text ${point.entry.amount < 0 ? "loss" : "win"}`,
      x,
      y: point.entry.amount < 0 ? y + 24 : y - 16,
      "text-anchor": "middle"
    });
    amountLabel.textContent = `${point.entry.amount > 0 ? "+" : ""}${money.format(point.entry.amount)}`;
    pointGroup.append(amountLabel);
  });
  svg.append(pointGroup);

  if (points.length === 0) {
    const empty = svgElement("text", {
      class: "empty-chart-text",
      x: width / 2,
      y: height / 2,
      "text-anchor": "middle"
    });
    empty.textContent = "No entries for this day yet";
    svg.append(empty);
  }

  weekChart.replaceChildren(svg);
  requestAnimationFrame(() => weekChart.classList.add("day-mode"));
}

function zoomToDay(date) {
  weekChart.classList.remove("day-mode");
  weekChart.classList.add("zooming");
  setTimeout(() => {
    renderDayChart(currentEntries, date);
    weekChart.classList.remove("zooming");
  }, 180);
}

function renderChart(entries) {
  if (selectedChartDay) {
    renderDayChart(entries, selectedChartDay);
    return;
  }

  renderWeekChart(entries);
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
  note.textContent = entry.note || formatTimestamp(entry);

  const amount = document.createElement("strong");
  amount.className = "entry-amount";
  amount.textContent = money.format(entry.amount);

  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const edit = document.createElement("button");
  edit.className = "edit-button";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.title = "Edit entry";
  edit.setAttribute("aria-label", `Edit entry for ${formatTimestamp(entry)}`);
  edit.addEventListener("click", () => openEntryModal(entry.id));

  const remove = document.createElement("button");
  remove.className = "delete-button";
  remove.type = "button";
  remove.textContent = "X";
  remove.title = "Delete entry";
  remove.setAttribute("aria-label", `Delete entry for ${formatTimestamp(entry)}`);
  remove.addEventListener("click", () => deleteEntry(entry.id));

  actions.append(edit, remove);
  content.append(date, note);
  item.append(content, amount, actions);
  return item;
}

function renderEntries(entries) {
  currentEntries = entries;
  entryList.replaceChildren(...entries.map(entryTemplate));
  emptyState.classList.toggle("visible", entries.length === 0);
  renderStats(entries);
  renderChart(entries);
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
  const savedAmount = Number(payload.amount);
  const target = previousDayTarget(currentEntries, payload.date);
  const newDayTotal = dayTotal(currentEntries, payload.date) + savedAmount;
  showSweetAlert(savedAmount, undefined, target, newDayTotal);
  await loadEntries();
}

async function saveChartPoint(amount, note) {
  const original = currentEntries.find((entry) => entry.id === editingEntryId);
  if (!original) return false;

  const response = await fetch(`/api/entries/${encodeURIComponent(editingEntryId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: original.date,
      amount,
      note
    })
  });

  const data = await response.json();
  if (!response.ok) {
    setMessage(data.error || "Could not update that point.", true);
    return false;
  }

  closeModal();
  setMessage(`Updated ${formatTimestamp(data.entry)}.`);
  const updatedAmount = Number(amount);
  const target = previousDayTarget(currentEntries, original.date);
  const newDayTotal = currentEntries
    .filter((entry) => entry.date === original.date)
    .reduce((sum, entry) => sum + (entry.id === original.id ? updatedAmount : entry.amount), 0);
  showSweetAlert(updatedAmount, "Entry updated", target, newDayTotal);
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

function openEntryModal(id) {
  const entry = currentEntries.find((item) => item.id === id);
  if (!entry) return;

  editingEntryId = id;
  dayEditDate.textContent = formatTimestamp(entry);
  dayAmountInput.value = entry.amount.toFixed(2);
  dayNoteInput.value = entry.note;
  dayModal.classList.add("visible");
  dayModal.setAttribute("aria-hidden", "false");
  dayAmountInput.focus();
  dayAmountInput.select();
}

function closeModal() {
  dayModal.classList.remove("visible");
  dayModal.setAttribute("aria-hidden", "true");
  editingEntryId = "";
}

form.addEventListener("submit", saveEntry);
refreshButton.addEventListener("click", loadEntries);

weekTabButton.addEventListener("click", () => {
  selectedChartDay = "";
  weekChart.classList.remove("day-mode");
  renderWeekChart(currentEntries);
});

dayTabButton.addEventListener("click", () => {
  zoomToDay(today());
});

chartDateInput.addEventListener("change", () => {
  if (chartDateInput.value) {
    zoomToDay(chartDateInput.value);
  }
});

prevWeekButton.addEventListener("click", () => {
  selectedChartDay = "";
  chartWeekOffset -= 1;
  renderWeekChart(currentEntries);
});

todayWeekButton.addEventListener("click", () => {
  selectedChartDay = "";
  chartWeekOffset = 0;
  renderWeekChart(currentEntries);
});

nextWeekButton.addEventListener("click", () => {
  if (chartWeekOffset < 0) {
    selectedChartDay = "";
    chartWeekOffset += 1;
    renderWeekChart(currentEntries);
  }
});

backWeekButton.addEventListener("click", () => {
  selectedChartDay = "";
  weekChart.classList.remove("day-mode");
  weekChart.classList.add("zooming");
  setTimeout(() => {
    renderWeekChart(currentEntries);
    weekChart.classList.remove("zooming");
  }, 160);
});

dayEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveChartPoint(dayAmountInput.value, dayNoteInput.value);
});

clearDayButton.addEventListener("click", async () => {
  const id = editingEntryId;
  closeModal();
  await deleteEntry(id);
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
chartDateInput.value = today();
loadEntries().catch(() => {
  setMessage("Could not load the text file yet.", true);
});
