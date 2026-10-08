import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getSignedInAccount, signIn, signOut } from "./auth.js";

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });
const dateLabel = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", year: "numeric"
});
const shortDayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const shortRangeLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const timestampLabel = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
});

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function today() { return toDateKey(new Date()); }
function dateFromKey(value) { return new Date(`${value}T00:00:00`); }
function formatDate(value) { return dateLabel.format(dateFromKey(value)); }

function entryTimestamp(entry) {
  const created = new Date(entry.createdAt);
  if (!Number.isNaN(created.getTime())) {
    const time = [created.getHours(), created.getMinutes(), created.getSeconds()]
      .map((part) => String(part).padStart(2, "0")).join(":");
    return new Date(`${entry.date}T${time}`);
  }
  return new Date(`${entry.date}T12:00:00`);
}

function formatTimestamp(entry) { return timestampLabel.format(entryTimestamp(entry)); }

function dayTotal(entries, date) {
  return entries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.amount, 0);
}

function previousDateKey(value) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

function previousDayTarget(entries, date) { return dayTotal(entries, previousDateKey(date)); }

function getWeekDays(offset) {
  const start = dateFromKey(today());
  start.setDate(start.getDate() - 6 + (offset * 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: toDateKey(date), label: shortDayLabel.format(date) };
  });
}

function creatorLabel(entry) {
  const creator = entry.createdBy;
  if (!creator) return "Creator unavailable";
  if (creator.name && creator.username && creator.name.toLowerCase() !== creator.username.toLowerCase()) {
    return `${creator.name} (${creator.username})`;
  }
  return creator.name || creator.username || "Creator unavailable";
}

function alertCopy(amount, target, total) {
  if (amount > 0 && total > target) {
    return { type: "win", title: "Yesterday beaten", text: `Day total ${money.format(total)}. Previous day was ${money.format(target)}.` };
  }
  if (amount > 0) {
    return { type: "win", title: "Chasing yesterday", text: `Nice, ${money.format(amount)} in. Day total ${money.format(total)}, target ${money.format(target)}.` };
  }
  if (amount < 0) {
    return { type: "loss", title: "Tiny table tax", text: `${money.format(Math.abs(amount))} down. The wheel got rent money, but not the house deed.` };
  }
  return { type: "neutral", title: "Clean slate", text: "Zero saved for the day. Suspiciously calm." };
}

function ChartGrid({ yMin, yMax, yScale, width, pad }) {
  return (
    <g className="chart-grid">
      {Array.from({ length: 5 }, (_, index) => {
        const value = yMin + ((yMax - yMin) * (index / 4));
        const y = yScale(value);
        return <g key={index}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} /><text x={pad.left - 10} y={y + 4} textAnchor="end">{money.format(value)}</text></g>;
      })}
    </g>
  );
}

function WeekChart({ entries, offset, onChooseDay }) {
  const width = 820;
  const height = 320;
  const pad = { top: 24, right: 28, bottom: 54, left: 64 };
  const days = getWeekDays(offset);
  const firstDay = dateFromKey(days[0].key);
  const lastDay = dateFromKey(days[6].key);
  lastDay.setHours(23, 59, 59, 999);
  const startTime = firstDay.getTime();
  const endTime = lastDay.getTime();
  const rangeEntries = entries
    .filter((entry) => entryTimestamp(entry).getTime() >= startTime && entryTimestamp(entry).getTime() <= endTime)
    .sort((a, b) => entryTimestamp(a) - entryTimestamp(b) || a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const points = rangeEntries.map((entry) => ({ entry, timestamp: entryTimestamp(entry), value: (running += entry.amount) }));
  const values = [0, ...points.map((point) => point.value)];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, 10);
  const yMin = minValue - (span * 0.12);
  const yMax = maxValue + (span * 0.12);
  const xScale = (time) => pad.left + (((time - startTime) / (endTime - startTime)) * (width - pad.left - pad.right));
  const yScale = (value) => pad.top + (((yMax - value) / (yMax - yMin)) * (height - pad.top - pad.bottom));
  const pathPoints = [{ x: pad.left, y: yScale(0) }, ...points.map((point) => ({ x: xScale(point.timestamp.getTime()), y: yScale(point.value) }))];
  const path = pathPoints.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

  return {
    total: running,
    range: `${shortRangeLabel.format(firstDay)} - ${shortRangeLabel.format(lastDay)}`,
    svg: (
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Continuous profit and loss line chart">
        <ChartGrid {...{ yMin, yMax, yScale, width, pad }} />
        <g className="chart-days">
          {days.map((day) => {
            const x = xScale(dateFromKey(day.key).getTime());
            return <g key={day.key}><line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} /><text x={x} y={height - 18} textAnchor="middle">{day.label}</text></g>;
          })}
        </g>
        <line className="zero-line" x1={pad.left} x2={width - pad.right} y1={yScale(0)} y2={yScale(0)} />
        {pathPoints.length > 1 && <path className="profit-line" d={path} />}
        <g className="chart-points">
          {points.map((point, index) => {
            const x = xScale(point.timestamp.getTime());
            const y = yScale(point.value);
            return <g key={point.entry.id}>
              <circle className={`chart-point ${point.entry.amount < 0 ? "loss" : "win"}`} cx={x} cy={y} r="7" tabIndex="0" role="button"
                aria-label={`Open ${formatDate(point.entry.date)} day chart`} onClick={() => onChooseDay(point.entry.date)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onChooseDay(point.entry.date); }}>
                <title>{`${formatDate(point.entry.date)} | click to zoom into the day`}</title>
              </circle>
              {(points.length <= 8 || index === points.length - 1) && <text className="timestamp-text" x={x} y={y - 14} textAnchor="middle">{timestampLabel.format(point.timestamp)}</text>}
            </g>;
          })}
        </g>
        {!points.length && <text className="empty-chart-text" x={width / 2} y={height / 2} textAnchor="middle">No points in this range yet</text>}
      </svg>
    )
  };
}

function DayChart({ entries, date, onEdit }) {
  const width = 820;
  const height = 320;
  const pad = { top: 28, right: 34, bottom: 58, left: 64 };
  const target = previousDayTarget(entries, date);
  const dayEntries = entries.filter((entry) => entry.date === date)
    .sort((a, b) => entryTimestamp(a) - entryTimestamp(b) || a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const points = dayEntries.map((entry) => ({ entry, timestamp: entryTimestamp(entry), value: (running += entry.amount) }));
  const start = dateFromKey(date);
  const end = dateFromKey(date);
  end.setHours(23, 59, 59, 999);
  const values = [0, target, ...points.map((point) => point.value)];
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = Math.max(maxValue - minValue, 10);
  const yMin = minValue - (span * 0.16);
  const yMax = maxValue + (span * 0.16);
  const xScale = (time) => pad.left + (((time - start.getTime()) / (end.getTime() - start.getTime())) * (width - pad.left - pad.right));
  const yScale = (value) => pad.top + (((yMax - value) / (yMax - yMin)) * (height - pad.top - pad.bottom));
  const pathPoints = [{ x: pad.left, y: yScale(0) }, ...points.map((point) => ({ x: xScale(point.timestamp.getTime()), y: yScale(point.value) }))];
  const path = pathPoints.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

  return {
    total: running,
    target,
    range: `${formatDate(date)} - ${points.length} ${points.length === 1 ? "entry" : "entries"}`,
    svg: (
      <svg className="line-chart day-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Profit and loss line chart for ${formatDate(date)}`}>
        <ChartGrid {...{ yMin, yMax, yScale, width, pad }} />
        <g className="chart-days">
          {[0, 6, 12, 18, 24].map((hour) => {
            const marker = dateFromKey(date);
            marker.setHours(Math.min(hour, 23), hour === 24 ? 59 : 0, 0, 0);
            const x = xScale(marker.getTime());
            return <g key={hour}><line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} /><text x={x} y={height - 18} textAnchor="middle">{hour === 24 ? "24:00" : `${String(hour).padStart(2, "0")}:00`}</text></g>;
          })}
        </g>
        <line className="zero-line" x1={pad.left} x2={width - pad.right} y1={yScale(0)} y2={yScale(0)} />
        <line className="goal-line" x1={pad.left} x2={width - pad.right} y1={yScale(target)} y2={yScale(target)} />
        <text className="goal-text" x={width - pad.right} y={yScale(target) - 6} textAnchor="end">Prev day {money.format(target)}</text>
        {pathPoints.length > 1 && <path className="profit-line" d={path} />}
        <g className="chart-points">
          {points.map((point) => {
            const x = xScale(point.timestamp.getTime());
            const y = yScale(point.value);
            return <g key={point.entry.id}>
              <circle className={`chart-point day-point ${point.entry.amount < 0 ? "loss" : "win"}`} cx={x} cy={y} r="8" tabIndex="0" role="button"
                aria-label={`Edit ${formatTimestamp(point.entry)}, ${money.format(point.entry.amount)}`} onClick={() => onEdit(point.entry)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onEdit(point.entry); }}>
                <title>{`${formatTimestamp(point.entry)} | ${money.format(point.entry.amount)} | balance ${money.format(point.value)}`}</title>
              </circle>
              <text className={`amount-text ${point.entry.amount < 0 ? "loss" : "win"}`} x={x} y={point.entry.amount < 0 ? y + 24 : y - 16} textAnchor="middle">
                {point.entry.amount > 0 ? "+" : ""}{money.format(point.entry.amount)}
              </text>
            </g>;
          })}
        </g>
        {!points.length && <text className="empty-chart-text" x={width / 2} y={height / 2} textAnchor="middle">No entries for this day yet</text>}
      </svg>
    )
  };
}

function Login({ message, canLogin, onLogin }) {
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="auth-title">
    <div className="microsoft-mark" aria-hidden="true"><span /><span /><span /><span /></div>
    <p className="eyebrow">Roulette Winnings</p>
    <h1 id="auth-title">Sign in to continue</h1>
    <p>{message}</p>
    {canLogin && <button type="button" onClick={onLogin}>Sign in with Microsoft</button>}
  </section></main>;
}

export default function App() {
  const [auth, setAuth] = useState({ status: "loading", account: null, message: "Checking your Microsoft session..." });
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({ date: today(), amount: "", note: "" });
  const [message, setMessage] = useState({ text: "", error: false });
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState("");
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({ amount: "", note: "" });
  const [alert, setAlert] = useState(null);
  const alertTimer = useRef();

  useEffect(() => {
    getSignedInAccount().then((account) => {
      setAuth(account
        ? { status: "signed-in", account, message: "" }
        : { status: "signed-out", account: null, message: "Use your company Microsoft account to open the shared tracker." });
    }).catch((error) => setAuth({ status: "error", account: null, message: error.message || "The app could not start." }));
  }, []);

  const loadEntries = useCallback(async () => {
    const response = await apiFetch("/api/entries");
    if (!response.ok) throw new Error("Could not load entries.");
    const data = await response.json();
    setEntries(data.entries);
  }, []);

  useEffect(() => {
    if (auth.status === "signed-in") {
      loadEntries().catch((error) => setMessage({ text: error.message, error: true }));
    }
  }, [auth.status, loadEntries]);

  useEffect(() => () => clearTimeout(alertTimer.current), []);
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") setEditing(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  const showAlert = (amount, date, title) => {
    const copy = alertCopy(amount, previousDayTarget(entries, date), dayTotal(entries, date) + amount);
    setAlert({ ...copy, title: title || copy.title });
    clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), 3600);
  };

  const submitEntry = async (event) => {
    event.preventDefault();
    setMessage({ text: "Saving...", error: false });
    try {
      const response = await apiFetch("/api/entries", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save entry.");
      showAlert(Number(form.amount), form.date);
      setForm((current) => ({ ...current, amount: "", note: "" }));
      setMessage({ text: "Saved to the shared database.", error: false });
      await loadEntries();
    } catch (error) { setMessage({ text: error.message, error: true }); }
  };

  const openEditor = (entry) => {
    setEditing(entry);
    setEditValues({ amount: entry.amount.toFixed(2), note: entry.note });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    try {
      const response = await apiFetch(`/api/entries/${encodeURIComponent(editing.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: editing.date, ...editValues })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update that point.");
      const updatedAmount = Number(editValues.amount);
      setEditing(null);
      setMessage({ text: `Updated ${formatTimestamp(data.entry)}.`, error: false });
      showAlert(updatedAmount, editing.date, "Entry updated");
      await loadEntries();
    } catch (error) { setMessage({ text: error.message, error: true }); }
  };

  const deleteEntry = async (id) => {
    try {
      const response = await apiFetch(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete that entry.");
      setEditing(null);
      setMessage({ text: "Entry deleted.", error: false });
      await loadEntries();
    } catch (error) { setMessage({ text: error.message, error: true }); }
  };

  const stats = useMemo(() => {
    const currentMonth = today().slice(0, 7);
    return {
      total: entries.reduce((sum, entry) => sum + entry.amount, 0),
      month: entries.filter((entry) => entry.date.startsWith(currentMonth)).reduce((sum, entry) => sum + entry.amount, 0),
      best: entries.reduce((best, entry) => !best || entry.amount > best.amount ? entry : best, null)?.amount || 0
    };
  }, [entries]);

  const chart = selectedDay
    ? DayChart({ entries, date: selectedDay, onEdit: openEditor })
    : WeekChart({ entries, offset: weekOffset, onChooseDay: setSelectedDay });

  if (auth.status !== "signed-in") {
    return <Login message={auth.message} canLogin={auth.status === "signed-out"} onLogin={() => signIn().catch((error) => setAuth({ status: "error", account: null, message: error.message }))} />;
  }

  return <>
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title"><div>
        <p className="eyebrow">Daily roulette tracker</p><h1 id="page-title">Roulette Winnings</h1>
        <div className="account-bar"><span>Signed in as <strong>{auth.account.name || auth.account.username}</strong></span><button className="logout-button" type="button" onClick={() => signOut()}>Log out</button></div>
      </div><div className="wheel-mark" aria-hidden="true"><span /></div></section>

      <section className="stats" aria-label="Winnings summary">
        <article><span>Total</span><strong>{money.format(stats.total)}</strong></article>
        <article><span>This month</span><strong>{money.format(stats.month)}</strong></article>
        <article><span>Best day</span><strong>{money.format(stats.best)}</strong></article>
      </section>

      <section className="chart-panel" aria-labelledby="chart-title"><div className="chart-head"><div>
        <p className="eyebrow">{chart.range}</p><h2 id="chart-title">{selectedDay ? "Day detail" : "Profit line"}</h2>
        <div className="chart-tabs" role="tablist" aria-label="Chart view">
          <button className={`tab-button ${selectedDay ? "" : "active"}`} type="button" role="tab" aria-selected={!selectedDay} onClick={() => setSelectedDay("")}>Week</button>
          <button className={`tab-button ${selectedDay ? "active" : ""}`} type="button" role="tab" aria-selected={Boolean(selectedDay)} onClick={() => setSelectedDay(today())}>{selectedDay && selectedDay !== today() ? "Day" : "Today"}</button>
          <input className="chart-date-input" type="date" aria-label="Choose chart day" value={selectedDay || today()} onChange={(event) => setSelectedDay(event.target.value)} />
        </div>
      </div><div className="chart-actions">
        <span className="goal-pill">{selectedDay ? `Target ${money.format(chart.target)}` : "Goal: beat previous day"}</span><strong>{money.format(chart.total)}</strong>
        <div className="week-buttons" aria-label="Change chart week">
          {selectedDay ? <button className="ghost-button" type="button" onClick={() => setSelectedDay("")}>Back</button> : <>
            <button className="icon-button" type="button" title="Previous week" aria-label="Previous week" onClick={() => setWeekOffset((value) => value - 1)}>&lt;</button>
            <button className="ghost-button" type="button" onClick={() => setWeekOffset(0)}>This week</button>
            <button className="icon-button" type="button" title="Next week" aria-label="Next week" disabled={weekOffset >= 0} onClick={() => setWeekOffset((value) => Math.min(0, value + 1))}>&gt;</button>
          </>}
        </div>
      </div></div><div className={`week-chart ${selectedDay ? "day-mode" : ""}`} aria-label="Continuous profit and loss chart with timestamps">{chart.svg}</div></section>

      <section className="tracker-grid">
        <form className="entry-form" onSubmit={submitEntry}><h2>Add today</h2>
          <label>Date<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Win or loss<input type="number" step="0.01" placeholder="125.00" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label>Note<input maxLength="140" placeholder="Table, mood, strategy" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <button type="submit">Save entry</button><p className="form-message" role="status" style={message.error ? { color: "#ff9aa4" } : undefined}>{message.text}</p>
        </form>
        <section className="history" aria-labelledby="history-title"><div className="history-head"><div><p className="eyebrow">Shared database</p><h2 id="history-title">History</h2></div><button className="ghost-button" type="button" onClick={() => loadEntries().catch((error) => setMessage({ text: error.message, error: true }))}>Refresh</button></div>
          {!entries.length && <div className="empty-state visible">Add your first roulette result and it will appear here.</div>}
          <ol className="entry-list">{entries.slice(0, 10).map((entry) => <li className={`entry-item ${entry.amount < 0 ? "loss" : ""}`} key={entry.id}>
            <div><span className="entry-date">{formatDate(entry.date)}</span><span className="entry-note">{entry.note || "No note"}</span><span className="entry-attribution">{formatTimestamp(entry)} · Added by {creatorLabel(entry)}</span></div>
            <strong className="entry-amount">{money.format(entry.amount)}</strong><div className="entry-actions"><button className="edit-button" type="button" onClick={() => openEditor(entry)}>Edit</button><button className="delete-button" type="button" aria-label={`Delete entry for ${formatTimestamp(entry)}`} onClick={() => deleteEntry(entry.id)}>X</button></div>
          </li>)}</ol>
          {entries.length > 10 && <p className="history-limit-note">{entries.length - 10} older entries hidden</p>}
        </section>
      </section>
    </main>

    {alert && <div className={`sweet-alert visible ${alert.type}`} aria-live="polite"><div className="sweet-alert-box" role="status"><span>{alert.type === "loss" ? "LOSS" : alert.type === "win" ? "WIN" : "OK"}</span><strong>{alert.title}</strong><p>{alert.text}</p></div></div>}

    {editing && <div className="modal-backdrop visible" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="dayEditTitle" onSubmit={saveEdit}>
      <div className="modal-head"><div><p className="eyebrow">{formatTimestamp(editing)}</p><h2 id="dayEditTitle">Chart entry</h2></div><button className="delete-button" type="button" aria-label="Close editor" onClick={() => setEditing(null)}>X</button></div>
      <label>Amount<input type="number" step="0.01" required autoFocus value={editValues.amount} onChange={(event) => setEditValues({ ...editValues, amount: event.target.value })} /></label>
      <label>Note<input maxLength="140" placeholder="Edited from the chart" value={editValues.note} onChange={(event) => setEditValues({ ...editValues, note: event.target.value })} /></label>
      <div className="modal-actions"><button className="ghost-button" type="button" onClick={() => deleteEntry(editing.id)}>Delete point</button><button type="submit">Save point</button></div>
    </form></div>}
  </>;
}
