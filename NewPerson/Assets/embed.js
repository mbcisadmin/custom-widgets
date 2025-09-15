(function () {
  // 🧩 CONFIGURATION
  const baseUrl = "new-person-widget.vercel.app/Assets"; // <- Change this per widget project
  const widgetName = "newPerson"; // <- Must match div IDs and container names
  const initScriptFilename = "Widget.Init.js"; // <- Shared Init script, or unique if needed
  const stylesheets = [
    "//use.fontawesome.com/releases/v5.0.7/css/all.css",
    `${baseUrl}/widget.css`
  ];
  const containerId = `${widgetName}WidgetEmbed`;

  // 🧾 Grab params from <script data-params="key=value&key=value">
  const scriptTag = document.currentScript;
  const params = parseParams(scriptTag?.getAttribute("data-params"));

  // 🧼 Inject styles
  stylesheets.forEach((href) => injectStylesheet(href));

  // 🎯 Inject container HTML
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div id="${widgetName}Container" class="container">
      <div id="${widgetName}Widget"></div>
    </div>
  `;

  // 🚀 Inject core scripts
  injectScript(`${baseUrl}/CustomWidgets.js`);
  injectScript(`${baseUrl}/${initScriptFilename}`);

  // 🔧 Helpers
  function injectStylesheet(href) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function injectScript(src) {
    const script = document.createElement("script");
    script.src = src;
    document.body.appendChild(script);
  }

  function parseParams(paramString) {
    const params = {};
    if (!paramString) return params;
    paramString.split("&").forEach((pair) => {
      const [key, val] = pair.split("=");
      if (key) params[key] = decodeURIComponent(val || "");
    });
    return params;
  }
})();
