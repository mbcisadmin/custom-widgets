(function () {
  const widgetId = "NewPersonWidget";
  const containerId = `${widgetId}-container`;
  const storedProc = "api_custom_NewPersonWidget";

  const hostname = location.hostname;
  const isLocalDev =
    hostname.includes("localhost") || hostname.includes("127.0.0.1");
  const isHostedApp = hostname.includes("new-person-widget.vercel.app");

  const templatePath = isLocalDev
    ? `/CustomWidgets/${widgetId.replace("Widget", "")}/Template/widget.html`
    : isHostedApp
    ? "/Template/widget.html"
    : "https://new-person-widget.vercel.app//Template/widget.html";

  const allowedKeys = [
    "@UserName",
    "@CongregationID",
    "@EventTypeID",
    "@ProgramID",
    "@Date",
    "@EventID"
  ];
  const urlParams = new URLSearchParams(window.location.search);

  // ----- tiny utils -----
  const REFRESH_MS = 30_000;
  let refreshTimerId = null;

  function clearRefreshTimer() {
    if (refreshTimerId) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  }

  function startRefreshTimer() {
    clearRefreshTimer();
    refreshTimerId = setInterval(() => {
      // Skip while tab is hidden to avoid meaningless refreshes
      if (document.hidden) return;
      if (typeof window.ReInitWidget === "function") {
        window.ReInitWidget(widgetId);
      }
    }, REFRESH_MS);
  }

  // "M/D/YYYY" (or "MM/DD/YYYY") -> true if same local calendar day as now
  function isTodayParamDate(dateStr) {
    if (!dateStr) return false;
    const parts = (dateStr + "").split("/");
    if (parts.length !== 3) return false;
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (!m || !d || !y) return false;

    const today = new Date();
    return (
      y === today.getFullYear() &&
      m === today.getMonth() + 1 &&
      d === today.getDate()
    );
  }

  function decideAutoRefreshFromParams(paramMap) {
    const selected = paramMap.get("Date");
    if (isTodayParamDate(selected)) {
      startRefreshTimer();
    } else {
      clearRefreshTimer();
    }
  }

  function formatDateToParamFromPickerValue(dateStr) {
    // picker value "YYYY-MM-DD" -> "M/D/YYYY"
    const [yyyy, mm, dd] = dateStr.split("-");
    return `${parseInt(mm, 10)}/${parseInt(dd, 10)}/${yyyy}`;
  }

  function cleanMap(map) {
    for (let [k, v] of map) if (!v?.trim()) map.delete(k);
    return map;
  }

  function syncParamsToUrl(paramMap) {
    const newUrl = new URL(window.location.href);
    allowedKeys.forEach((key) => newUrl.searchParams.delete(key));
    for (let [k, v] of cleanMap(paramMap)) newUrl.searchParams.set("@" + k, v);
    window.history.replaceState({}, "", newUrl);
  }

  function parseParams(str) {
    return new Map(
      str
        .replace(/@@/g, "@")
        .split("&")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const clean = p.replace(/^@+/, "");
          const [key, val] = clean.split("=");
          return [key, val];
        })
    );
  }

  function applyParams(paramMap) {
    cleanMap(paramMap);

    // decide before rebuild to avoid duplicate timers during re-init
    decideAutoRefreshFromParams(paramMap);

    const newParams = Array.from(paramMap.entries())
      .map(([k, v]) => `@${k}=${v}`)
      .join("&");

    const widgetRoot = document.getElementById(containerId);
    if (!widgetRoot) return;

    widgetRoot.innerHTML = `
      <div id="${widgetId}"
           data-component="CustomWidget"
           data-sp="${storedProc}"
           data-params="${newParams}"
           data-template="${templatePath}"
           data-requireUser="false"
           data-cache="false"
           data-host="mcleanbible"
           data-debug="true"></div>`;

    syncParamsToUrl(paramMap);

    if (typeof ReInitWidget === "function") {
      ReInitWidget(widgetId);
    }
  }

  // ----- bootstrap params -----
  const paramMap = new Map(
    Array.from(urlParams.entries()).filter(
      ([k, v]) => allowedKeys.includes(k) && v?.trim()
    )
  );

  // Inject today's date if @Date missing
  if (!paramMap.has("@Date")) {
    const t = new Date();
    const mm = t.getMonth() + 1;
    const dd = t.getDate();
    const yyyy = t.getFullYear();
    paramMap.set("@Date", `${mm}/${dd}/${yyyy}`);
  }

  const filteredParams = Array.from(paramMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  // Mount widget
  const tag = `
    <div id="${widgetId}"
         data-component="CustomWidget"
         data-sp="${storedProc}"
         data-params="${filteredParams}"
         data-template="${templatePath}"
         data-requireUser="false"
         data-cache="false"
         data-host="mcleanbible"
         data-debug="true"></div>`;

  const widgetRoot = document.getElementById(containerId);
  const loader = document.getElementById("loader");
  if (widgetRoot) {
    if (loader) loader.classList.remove("hidden");
    widgetRoot.innerHTML = tag;

    const waitForReInit = setInterval(() => {
      if (typeof window.ReInitWidget === "function") {
        clearInterval(waitForReInit);
        window.ReInitWidget(widgetId);
      }
    }, 50);
  }

  // Pause/resume auto refresh based on tab visibility
  document.addEventListener("visibilitychange", () => {
    const widget = document.getElementById(widgetId);
    if (!widget) return;
    const p = parseParams(widget.getAttribute("data-params") || "");
    if (document.hidden) {
      clearRefreshTimer();
    } else if (isTodayParamDate(p.get("Date"))) {
      startRefreshTimer();
    }
  });

  // ----- widgetLoaded -> wire pickers + (re)decide auto-refresh -----
  window.addEventListener("widgetLoaded", function (event) {
    if (event.detail?.widgetId !== widgetId) return;
    console.log("✅ Widget loaded:", event.detail);

    setTimeout(() => {
      initDatePicker();
      initEventPicker();

      const widget = document.getElementById(widgetId);
      const p = parseParams(widget?.getAttribute("data-params") || "");
      decideAutoRefreshFromParams(p);
    }, 100);
  });

  // ----- UI: Date Picker -----
  function initDatePicker() {
    const picker = document.getElementById("datePicker");
    if (!picker) return;

    const widget = document.getElementById(widgetId);
    if (!widget) return;

    const p = parseParams(widget.getAttribute("data-params") || "");
    const currentDate = p.get("Date");

    if (currentDate) {
      const parts = currentDate.split("/");
      if (parts.length === 3) {
        const yyyy = parts[2];
        const mm = String(parseInt(parts[0], 10)).padStart(2, "0");
        const dd = String(parseInt(parts[1], 10)).padStart(2, "0");
        picker.value = `${yyyy}-${mm}-${dd}`;
      }
    }

    picker.addEventListener("change", () => {
      const formatted = formatDateToParamFromPickerValue(picker.value);
      p.set("Date", formatted);
      // stop any running timer before we rebuild
      clearRefreshTimer();
      applyParams(p);
    });
  }

  // ----- UI: Event Picker -----
  function initEventPicker() {
    const picker = document.getElementById("eventPicker");
    if (!picker) return;

    const widget = document.getElementById(widgetId);
    if (!widget) return;

    const p = parseParams(widget.getAttribute("data-params") || "");
    const currentEventID = p.get("EventID");
    if (currentEventID) picker.value = currentEventID;

    picker.addEventListener("change", () => {
      const selected = picker.value;
      if (selected) p.set("EventID", selected);
      else p.delete("EventID");
      applyParams(p);
    });
  }
})();
