const STORAGE_KEY = "calvin-cyril-state";
const todayKey = () => new Date().toISOString().slice(0, 10);

const state = loadState();
const timers = new Map();
let dailyRefreshTimer;

const els = {
  currentDate: document.querySelector("#currentDate"),
  sectionTitle: document.querySelector("#sectionTitle"),
  completionScore: document.querySelector("#completionScore"),
  habitDoneCount: document.querySelector("#habitDoneCount"),
  activityTodayCount: document.querySelector("#activityTodayCount"),
  financeBalance: document.querySelector("#financeBalance"),
  todayHabits: document.querySelector("#todayHabits"),
  todayActivities: document.querySelector("#todayActivities"),
  habitList: document.querySelector("#habitList"),
  activityList: document.querySelector("#activityList"),
  financeList: document.querySelector("#financeList"),
  uyuBalance: document.querySelector("#uyuBalance"),
  usdBalance: document.querySelector("#usdBalance"),
  expenseCount: document.querySelector("#expenseCount"),
  notificationText: document.querySelector("#notificationText")
};

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.tab));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.jump));
});

document.querySelector("#habitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.habits.push({
    id: createId(),
    name: document.querySelector("#habitName").value.trim(),
    frequency: document.querySelector("#habitFrequency").value,
    completions: {}
  });
  event.target.reset();
  persistAndRender();
});

document.querySelector("#activityForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const activity = {
    id: createId(),
    name: document.querySelector("#activityName").value.trim(),
    date: document.querySelector("#activityDate").value,
    time: document.querySelector("#activityTime").value,
    reminderMinutes: Number(document.querySelector("#activityReminder").value),
    done: false
  };
  state.activities.push(activity);
  event.target.reset();
  setDefaultDate();
  persistAndRender();
});

document.querySelector("#financeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.finance.push({
    id: createId(),
    name: document.querySelector("#financeName").value.trim(),
    type: document.querySelector("#financeType").value,
    currency: document.querySelector("#financeCurrency").value,
    amount: Number(document.querySelector("#financeAmount").value),
    createdAt: new Date().toISOString()
  });
  event.target.reset();
  persistAndRender();
});

document.querySelector("#enableNotifications").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    els.notificationText.textContent = "Este navegador no soporta notificaciones.";
    return;
  }
  const permission = await Notification.requestPermission();
  els.notificationText.textContent = permission === "granted"
    ? "Listo. Los avisos se disparan segun tus horarios mientras Calvin Cyril este abierto."
    : "No se activaron los avisos. Puedes volver a intentarlo cuando quieras.";
  scheduleNotifications();
});

document.querySelector("#resetToday").addEventListener("click", () => {
  state.habits.forEach((habit) => {
    delete habit.completions[todayKey()];
  });
  persistAndRender();
});

document.querySelector("#clearPastActivities").addEventListener("click", () => {
  const now = new Date();
  state.activities = state.activities.filter((activity) => activityDateTime(activity) >= now);
  persistAndRender();
});

document.querySelector("#exportCalendar").addEventListener("click", () => {
  const upcoming = state.activities
    .filter((activity) => activityDateTime(activity) >= new Date())
    .sort((a, b) => activityDateTime(a) - activityDateTime(b));
  if (!upcoming.length) return;
  downloadCalendar(upcoming, "calvin-cyril-agenda.ics");
});

document.querySelector("#clearFinance").addEventListener("click", () => {
  state.finance = [];
  persistAndRender();
});

function loadState() {
  const fallback = {
    habits: [
      { id: createId(), name: "Tomar agua", frequency: "daily", completions: {} },
      { id: createId(), name: "Mover el cuerpo", frequency: "daily", completions: {} }
    ],
    activities: [],
    finance: []
  };

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

function createId() {
  return crypto.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showView(tab) {
  const titles = {
    today: "Hoy",
    habits: "Habitos",
    schedule: "Agenda",
    finance: "Finanzas"
  };
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("is-visible", view.dataset.view === tab);
  });
  els.sectionTitle.textContent = titles[tab];
}

function persistAndRender() {
  saveState();
  render();
  scheduleNotifications();
}

function render() {
  updateCurrentDate();
  renderHabits();
  renderActivities();
  renderFinance();
  renderSummary();
}

function renderHabits() {
  const today = todayKey();
  const habitItems = state.habits.map((habit) => {
    const done = Boolean(habit.completions[today]);
    return listItem({
      marker: checkButton(done, () => {
        habit.completions[today] = !done;
        persistAndRender();
      }),
      title: habit.name,
      meta: frequencyLabel(habit.frequency),
      action: deleteButton(() => {
        state.habits = state.habits.filter((item) => item.id !== habit.id);
        persistAndRender();
      })
    });
  });

  replaceList(els.habitList, habitItems);
  replaceList(els.todayHabits, habitItems.map((item) => item.cloneNode(true)));

  els.todayHabits.querySelectorAll(".check-button").forEach((button, index) => {
    button.addEventListener("click", () => {
      const habit = state.habits[index];
      habit.completions[today] = !habit.completions[today];
      persistAndRender();
    });
  });
  els.todayHabits.querySelectorAll(".delete-button").forEach((button, index) => {
    button.addEventListener("click", () => {
      const habit = state.habits[index];
      state.habits = state.habits.filter((item) => item.id !== habit.id);
      persistAndRender();
    });
  });
}

function renderActivities() {
  const sorted = [...state.activities].sort((a, b) => activityDateTime(a) - activityDateTime(b));
  const activityItems = sorted.map((activity) => listItem({
    marker: checkButton(activity.done, () => {
      activity.done = !activity.done;
      persistAndRender();
    }),
    title: activity.name,
    meta: `${formatDate(activity.date)} a las ${activity.time} - aviso ${reminderLabel(activity.reminderMinutes)}`,
    action: actionGroup(
      calendarButton(() => downloadCalendar([activity], `calvin-cyril-${slugify(activity.name)}.ics`)),
      deleteButton(() => {
        state.activities = state.activities.filter((item) => item.id !== activity.id);
        persistAndRender();
      })
    )
  }));

  const today = todayKey();
  const todays = sorted.filter((activity) => activity.date === today);
  const todayItems = todays.map((activity) => listItem({
    marker: checkButton(activity.done, () => {
      activity.done = !activity.done;
      persistAndRender();
    }),
    title: activity.name,
    meta: `${activity.time} - aviso ${reminderLabel(activity.reminderMinutes)}`,
    action: deleteButton(() => {
      state.activities = state.activities.filter((item) => item.id !== activity.id);
      persistAndRender();
    })
  }));

  replaceList(els.activityList, activityItems);
  replaceList(els.todayActivities, todayItems);
}

function renderFinance() {
  const items = [...state.finance].reverse().map((movement) => {
    const signed = movement.type === "expense" ? -movement.amount : movement.amount;
    return listItem({
      marker: pill(movement.type === "income" ? "+" : "-"),
      title: movement.name,
      meta: `${movement.currency} ${formatAmount(Math.abs(signed))}`,
      action: deleteButton(() => {
        state.finance = state.finance.filter((item) => item.id !== movement.id);
        persistAndRender();
      })
    });
  });

  replaceList(els.financeList, items);

  const balances = totalsByCurrency();
  els.uyuBalance.textContent = `$${formatAmount(balances.UYU)}`;
  els.usdBalance.textContent = `US$${formatAmount(balances.USD)}`;
  els.expenseCount.textContent = state.finance.filter((item) => item.type === "expense").length;
}

function renderSummary() {
  const today = todayKey();
  const done = state.habits.filter((habit) => habit.completions[today]).length;
  const total = state.habits.length;
  const percentage = total ? Math.round((done / total) * 100) : 0;
  const todayActivities = state.activities.filter((activity) => activity.date === today);
  const balances = totalsByCurrency();

  els.completionScore.textContent = `${percentage}%`;
  els.habitDoneCount.textContent = `${done}/${total}`;
  els.activityTodayCount.textContent = todayActivities.length;
  els.financeBalance.textContent = `$${formatAmount(balances.UYU)} | US$${formatAmount(balances.USD)}`;
}

function replaceList(container, items) {
  container.replaceChildren();
  if (!items.length) {
    container.append(document.querySelector("#emptyTemplate").content.cloneNode(true));
    return;
  }
  items.forEach((item) => container.append(item));
}

function listItem({ marker, title, meta, action }) {
  const row = document.createElement("article");
  row.className = "list-item";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = title;
  small.textContent = meta;
  copy.append(strong, small);
  row.append(marker, copy, action);
  return row;
}

function checkButton(done, onClick) {
  const button = document.createElement("button");
  button.className = `check-button${done ? " is-done" : ""}`;
  button.type = "button";
  button.textContent = "V";
  button.setAttribute("aria-label", done ? "Marcar pendiente" : "Marcar hecho");
  button.addEventListener("click", onClick);
  return button;
}

function deleteButton(onClick) {
  const button = document.createElement("button");
  button.className = "delete-button";
  button.type = "button";
  button.textContent = "x";
  button.setAttribute("aria-label", "Eliminar");
  button.addEventListener("click", onClick);
  return button;
}

function calendarButton(onClick) {
  const button = document.createElement("button");
  button.className = "calendar-button";
  button.type = "button";
  button.textContent = "+";
  button.setAttribute("aria-label", "Agregar al calendario del movil");
  button.addEventListener("click", onClick);
  return button;
}

function actionGroup(...buttons) {
  const group = document.createElement("div");
  group.className = "item-actions";
  buttons.forEach((button) => group.append(button));
  return group;
}

function pill(text) {
  const span = document.createElement("span");
  span.className = "check-button is-done";
  span.textContent = text;
  return span;
}

function scheduleNotifications() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const now = Date.now();
  state.activities.forEach((activity) => {
    if (activity.done) return;
    const remindAt = activityDateTime(activity).getTime() - activity.reminderMinutes * 60 * 1000;
    const delay = remindAt - now;
    if (delay < 0 || delay > 2147483647) return;

    const timer = setTimeout(() => {
      new Notification("Calvin Cyril", {
        body: `${activity.name} - ${activity.time}`,
        icon: "assets/icon.svg"
      });
    }, delay);
    timers.set(activity.id, timer);
  });
}

function totalsByCurrency() {
  return state.finance.reduce((acc, movement) => {
    const signed = movement.type === "expense" ? -movement.amount : movement.amount;
    acc[movement.currency] += signed;
    return acc;
  }, { UYU: 0, USD: 0 });
}

function activityDateTime(activity) {
  return new Date(`${activity.date}T${activity.time || "00:00"}`);
}

function frequencyLabel(value) {
  return {
    daily: "Diario",
    weekdays: "Lunes a viernes",
    custom: "Personal"
  }[value];
}

function reminderLabel(minutes) {
  return minutes === 0 ? "a la hora exacta" : `${minutes} min antes`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00`));
}

function formatAmount(value) {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 }).format(value);
}

function downloadCalendar(activities, filename) {
  const content = buildCalendar(activities);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCalendar(activities) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calvin Cyril//Personal Planner//ES",
    "CALSCALE:GREGORIAN"
  ];

  activities.forEach((activity) => {
    const start = activityDateTime(activity);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${activity.id}@calvin-cyril`,
      `DTSTAMP:${toCalendarStamp(new Date())}`,
      `DTSTART:${toCalendarStamp(start)}`,
      `DTEND:${toCalendarStamp(end)}`,
      `SUMMARY:${escapeCalendarText(activity.name)}`,
      "BEGIN:VALARM",
      `TRIGGER:${calendarTrigger(activity.reminderMinutes)}`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeCalendarText(activity.name)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function toCalendarStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function calendarTrigger(minutes) {
  return minutes === 0 ? "PT0S" : `-PT${minutes}M`;
}

function escapeCalendarText(text) {
  return text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "actividad";
}

function setDefaultDate() {
  document.querySelector("#activityDate").value = todayKey();
}

function updateCurrentDate() {
  els.currentDate.textContent = new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
}

function scheduleDailyRefresh() {
  clearTimeout(dailyRefreshTimer);
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 2, 0);
  dailyRefreshTimer = setTimeout(() => {
    render();
    scheduleNotifications();
    scheduleDailyRefresh();
  }, nextMidnight.getTime() - now.getTime());
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

setDefaultDate();
render();
scheduleNotifications();
scheduleDailyRefresh();
