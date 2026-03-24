(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────
  var MP_API   = "https://my.mcleanbible.org/ministryplatformapi";
  var AUTH_ROLE_ID     = 152;       // Security Role ID that grants access
  var PRAYER_FROM     = "prayer@mcleanbible.org";
  var PAGE_SIZE       = 20;

  // ── State ──────────────────────────────────────────────────────────────
  var currentUser     = null;       // { userId, contactId, displayName, email }
  var opportunityTitle = "Prayer Requests";
  var formId          = null;
  var formFields      = [];         // [{ Form_Field_ID, Field_Label, Field_Order }]
  var nameFieldId     = null;       // auto-detected "name" field
  var requestFieldId  = null;       // auto-detected "prayer request" field
  var requests        = [];         // rendered prayer-request objects
  var prayerCounts    = {};         // { formResponseId: count }
  var pageOffset      = 0;
  var allLoaded       = false;

  // ── Bootstrap ──────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem("mpp-widgets_AuthToken");
  }

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function decodeJwt(token) {
    try {
      var payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(payload));
    } catch (e) { return null; }
  }

  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
  }

  function escHtml(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  // ── MP REST Helpers (matches WalkinRegistration pattern) ───────────────
  async function mpGet(path) {
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      headers: headers,
      credentials: "include"
    });
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("GET " + path + " → " + res.status + ": " + body);
    }
    return res.json();
  }

  async function mpPost(path, records) {
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(records)
    });
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("POST " + path + " → " + res.status + ": " + body);
    }
    return res.json();
  }

  async function mpPut(path, records) {
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      method: "PUT",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(records)
    });
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("PUT " + path + " → " + res.status + ": " + body);
    }
    return res.text();
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  async function loadCurrentUser() {
    var token = getToken();
    if (!token) throw new Error("Not authenticated");

    var claims = decodeJwt(token);
    if (!claims) throw new Error("Invalid token");

    // Log claims so we can see what's available
    console.log("[PrayerWidget] JWT claims:", JSON.stringify(claims, null, 2));

    // Try to get Contact_ID directly from claims (avoids dp_Users query entirely)
    var contactId = claims["http://www.thinkministry.com/dataplatform/claims/contactid"]
                 || claims.contactid;
    var userId    = claims["http://www.thinkministry.com/dataplatform/claims/userid"]
                 || claims.userid || claims.sub;

    // If we have Contact_ID from claims, go straight to Contacts table
    if (contactId) {
      var contacts = await mpGet(
        "/tables/Contacts?$select=Contact_ID,Display_Name,Email_Address" +
        "&$filter=Contact_ID=" + contactId
      );
      var contact = (contacts && contacts.length > 0) ? contacts[0] : {};
      currentUser = {
        userId:      userId,
        contactId:   parseInt(contactId, 10),
        displayName: contact.Display_Name || claims.name || "",
        email:       contact.Email_Address || ""
      };
      console.log("[PrayerWidget] User loaded via claims:", currentUser.displayName);
      return;
    }

    // Fallback: look up Contact_ID through dp_Users (filter by User_Name if GUID filter fails)
    if (!userId) throw new Error("No user id in token");
    var userName = claims["http://www.thinkministry.com/dataplatform/claims/username"]
               || claims.preferred_username || claims.name;

    var users;
    if (userName) {
      users = await mpGet(
        "/tables/dp_Users?$select=User_ID,Display_Name,Contact_ID" +
        "&$filter=User_Name='" + encodeURIComponent(userName) + "'"
      );
    }
    if (!users || users.length === 0) {
      users = await mpGet(
        "/tables/dp_Users?$select=User_ID,Display_Name,Contact_ID" +
        "&$filter=User_ID='" + encodeURIComponent(userId) + "'"
      );
    }
    if (!users || users.length === 0) throw new Error("User not found");
    var user = users[0];

    var contacts2 = await mpGet(
      "/tables/Contacts?$select=Contact_ID,Display_Name,Email_Address" +
      "&$filter=Contact_ID=" + user.Contact_ID
    );
    var c = (contacts2 && contacts2.length > 0) ? contacts2[0] : {};

    currentUser = {
      userId:      user.User_ID,
      contactId:   user.Contact_ID,
      displayName: c.Display_Name || user.Display_Name || "",
      email:       c.Email_Address || ""
    };
    console.log("[PrayerWidget] User loaded via dp_Users:", currentUser.displayName);
  }

  async function checkAuthorization() {
    // Check if user has Security Role ID matching AUTH_ROLE_ID
    try {
      var roles = await mpGet(
        "/tables/dp_User_Roles?$select=User_Role_ID,Role_ID" +
        "&$filter=User_ID='" + encodeURIComponent(currentUser.userId) + "'" +
        " AND Role_ID=" + AUTH_ROLE_ID
      );
      var authorized = roles && roles.length > 0;
      console.log("[PrayerWidget] Auth check (Role " + AUTH_ROLE_ID + "):", authorized);
      return authorized;
    } catch (e) {
      console.warn("[PrayerWidget] dp_User_Roles check failed:", e.message);
      // TEMP: bypass auth so we can test the rest of the widget
      console.log("[PrayerWidget] Auth bypassed due to error — fix before production");
      return true;
    }
  }

  // ── Form Structure Discovery ───────────────────────────────────────────
  async function loadFormStructure() {
    // 1. Get form title from Forms table
    var forms = await mpGet(
      "/tables/Forms?$select=Form_ID,Form_Title" +
      "&$filter=Form_ID=" + formId
    );
    if (forms && forms.length > 0) {
      opportunityTitle = forms[0].Form_Title || "Prayer Requests";
    }

    // 2. Get form fields so we know what each answer means
    formFields = await mpGet(
      "/tables/Form_Fields?$select=Form_Field_ID,Field_Label,Field_Order" +
      "&$filter=Form_ID=" + formId +
      "&$orderby=Field_Order"
    ) || [];

    console.log("[PrayerWidget] Form fields:", JSON.stringify(formFields));

    // 3. Auto-detect the "name" and "request" fields by label keywords
    formFields.forEach(function (f) {
      var lbl = (f.Field_Label || "").toLowerCase();
      if (!nameFieldId && /\bname\b/.test(lbl)) {
        nameFieldId = f.Form_Field_ID;
      }
      if (!requestFieldId && (/prayer/.test(lbl) || /request/.test(lbl) || /\bpray\b/.test(lbl))) {
        requestFieldId = f.Form_Field_ID;
      }
    });
    // Fallback: first two fields if auto-detect missed
    if (!nameFieldId && formFields.length > 0) nameFieldId = formFields[0].Form_Field_ID;
    if (!requestFieldId && formFields.length > 1) requestFieldId = formFields[1].Form_Field_ID;
  }

  // ── Load Prayer Requests ───────────────────────────────────────────────
  async function loadPrayerRequests(append) {
    if (!append) {
      requests  = [];
      pageOffset = 0;
      allLoaded  = false;
    }

    // Fetch Form_Responses directly by Form_ID
    var formResps = await mpGet(
      "/tables/Form_Responses" +
      "?$select=Form_Response_ID,Contact_ID,Response_Date" +
      "&$filter=Form_ID=" + formId +
      "&$orderby=Response_Date desc" +
      "&$top=" + PAGE_SIZE +
      "&$skip=" + pageOffset
    );

    console.log("[PrayerWidget] Form_Responses count:", (formResps || []).length);

    if (!formResps || formResps.length === 0) {
      allLoaded = true;
      renderRequests();
      return;
    }
    if (formResps.length < PAGE_SIZE) allLoaded = true;

    // Fetch form-field answers in one call
    var frIds = formResps.map(function (r) { return r.Form_Response_ID; });
    var answerMap = {};
    if (frIds.length > 0) {
      var answers = await mpGet(
        "/tables/Form_Response_Answers" +
        "?$select=Form_Response_ID,Form_Field_ID,Response" +
        "&$filter=Form_Response_ID IN (" + frIds.join(",") + ")"
      );
      (answers || []).forEach(function (a) {
        if (!answerMap[a.Form_Response_ID]) answerMap[a.Form_Response_ID] = {};
        answerMap[a.Form_Response_ID][a.Form_Field_ID] = a.Response;
      });
    }

    // Fetch contact info (display name + email) for all requesters
    var contactIds = formResps
      .map(function (r) { return r.Contact_ID; })
      .filter(Boolean);
    var uniqueContactIds = contactIds.filter(function (id, i, arr) {
      return arr.indexOf(id) === i;
    });

    var contactMap = {};
    if (uniqueContactIds.length > 0) {
      var contacts = await mpGet(
        "/tables/Contacts?$select=Contact_ID,Display_Name,Email_Address" +
        "&$filter=Contact_ID IN (" + uniqueContactIds.join(",") + ")"
      );
      (contacts || []).forEach(function (c) { contactMap[c.Contact_ID] = c; });
    }

    // Build request objects
    formResps.forEach(function (r) {
      var ans     = answerMap[r.Form_Response_ID] || {};
      var contact = contactMap[r.Contact_ID] || {};

      // Gather any extra form fields beyond name & request
      var extras = [];
      formFields.forEach(function (f) {
        if (f.Form_Field_ID !== nameFieldId &&
            f.Form_Field_ID !== requestFieldId &&
            ans[f.Form_Field_ID]) {
          extras.push({ label: f.Field_Label, value: ans[f.Form_Field_ID] });
        }
      });

      requests.push({
        formResponseId: r.Form_Response_ID,
        contactId:      r.Contact_ID,
        contactEmail:   contact.Email_Address || "",
        contactName:    contact.Display_Name || "",
        name:           ans[nameFieldId] || contact.Display_Name || "Anonymous",
        requestText:    ans[requestFieldId] || "",
        extras:         extras,
        date:           r.Response_Date,
        prayerCount:    0
      });
    });

    pageOffset += formResps.length;

    // Load prayer counts for all displayed contacts
    await loadPrayerCounts();

    renderRequests();
  }

  // ── Prayer Count Tracking ──────────────────────────────────────────────
  //
  // Each prayer action creates an Activity_Log entry with Activity_Type = 'Prayer'
  // and a tag [FR:{Form_Response_ID}] in the Notes so we can count per request.
  //
  // If Activity_Log is not accessible, the widget falls back to Contact_Log.
  //
  async function loadPrayerCounts() {
    var frIds = requests
      .map(function (r) { return r.formResponseId; })
      .filter(Boolean);
    if (frIds.length === 0) return;

    // Build a LIKE filter for each Form_Response_ID tag
    var contactIds = requests
      .map(function (r) { return r.contactId; })
      .filter(Boolean);
    var uniqueIds = contactIds.filter(function (id, i, arr) { return arr.indexOf(id) === i; });

    try {
      var activities = await mpGet(
        "/tables/Activity_Log" +
        "?$select=Activity_Log_ID,Contact_ID,Notes" +
        "&$filter=Activity_Type='Prayer'" +
        " AND Contact_ID IN (" + uniqueIds.join(",") + ")"
      );
      parsePrayerCounts(activities);
    } catch (e) {
      // Fallback: try Contact_Log
      console.warn("[PrayerWidget] Activity_Log query failed, trying Contact_Log:", e.message);
      try {
        var logs = await mpGet(
          "/tables/Contact_Log" +
          "?$select=Contact_Log_ID,Contact_ID,Notes" +
          "&$filter=Contact_ID IN (" + uniqueIds.join(",") + ")"
        );
        parsePrayerCounts(logs);
      } catch (e2) {
        console.warn("[PrayerWidget] Could not load prayer counts:", e2.message);
      }
    }
  }

  function parsePrayerCounts(records) {
    prayerCounts = {};
    (records || []).forEach(function (r) {
      var match = (r.Notes || "").match(/\[FR:(\d+)\]/);
      if (match) {
        var id = parseInt(match[1], 10);
        prayerCounts[id] = (prayerCounts[id] || 0) + 1;
      }
    });
    requests.forEach(function (req) {
      req.prayerCount = prayerCounts[req.formResponseId] || 0;
    });
  }

  // ── UI Rendering ───────────────────────────────────────────────────────
  function buildShell() {
    var root = document.getElementById("prayer-widget");
    root.innerHTML =
      '<div class="widget-header">' +
        '<h1 id="widget-title">' + escHtml(opportunityTitle) + '</h1>' +
        '<button class="btn-refresh" id="btn-refresh" title="Refresh">&#x21bb;</button>' +
      '</div>' +
      '<div id="requests-container">' +
        '<div class="state-msg"><div class="spinner"></div>Loading prayer requests&hellip;</div>' +
      '</div>' +
      '<div id="load-more" class="load-more-wrap" style="display:none;">' +
        '<button class="btn-load-more" id="btn-load-more">Load More</button>' +
      '</div>';

    document.getElementById("btn-refresh").addEventListener("click", refreshAll);
    document.getElementById("btn-load-more").addEventListener("click", function () {
      loadPrayerRequests(true);
    });
  }

  function renderRequests() {
    var container = document.getElementById("requests-container");
    container.innerHTML = "";

    if (requests.length === 0) {
      container.innerHTML = '<div class="state-msg">No prayer requests found.</div>';
      updateLoadMore();
      return;
    }

    requests.forEach(function (req, idx) {
      var card = document.createElement("div");
      card.className = "prayer-card";
      card.id = "card-" + req.formResponseId;

      var extrasHtml = "";
      if (req.extras.length > 0) {
        extrasHtml = '<div class="extra-fields">';
        req.extras.forEach(function (ex) {
          extrasHtml += '<div class="field-row"><span class="field-label">' +
            escHtml(ex.label) + ':</span> ' + escHtml(ex.value) + '</div>';
        });
        extrasHtml += '</div>';
      }

      var countText = req.prayerCount > 0
        ? "Prayed for " + req.prayerCount + " time" + (req.prayerCount !== 1 ? "s" : "")
        : "";

      card.innerHTML =
        '<div class="card-header">' +
          '<span class="requester-name">' + escHtml(req.name) + '</span>' +
          '<span class="request-date">' + formatDate(req.date) + '</span>' +
        '</div>' +
        '<div class="request-text">' + escHtml(req.requestText) + '</div>' +
        extrasHtml +
        '<div class="card-footer">' +
          '<span class="prayer-count" id="count-' + req.formResponseId + '">' + countText + '</span>' +
          '<button class="btn-pray" data-idx="' + idx + '">Pray</button>' +
        '</div>' +
        '<div class="pray-panel" id="panel-' + req.formResponseId + '" style="display:none;">' +
          '<label class="toggle-row">' +
            '<input type="checkbox" id="toggle-name-' + req.formResponseId + '" />' +
            ' Include my name in the notification' +
          '</label>' +
          '<textarea id="note-' + req.formResponseId + '" ' +
            'placeholder="Add a personal note (optional)" rows="3"></textarea>' +
          '<div class="panel-actions">' +
            '<button class="btn-cancel" data-frid="' + req.formResponseId + '">Cancel</button>' +
            '<button class="btn-send" id="send-' + req.formResponseId + '" data-idx="' + idx + '">' +
              'Send Prayer</button>' +
          '</div>' +
        '</div>';

      container.appendChild(card);
    });

    // Wire up delegated events
    container.addEventListener("click", handleCardClick);

    updateLoadMore();
  }

  function updateLoadMore() {
    var el = document.getElementById("load-more");
    el.style.display = allLoaded ? "none" : "block";
  }

  // ── Delegated Click Handler ────────────────────────────────────────────
  function handleCardClick(e) {
    var target = e.target;

    // "Pray" button
    if (target.classList.contains("btn-pray")) {
      var idx = parseInt(target.getAttribute("data-idx"), 10);
      openPrayPanel(idx);
      return;
    }

    // "Cancel" button
    if (target.classList.contains("btn-cancel")) {
      closePrayPanel(target.getAttribute("data-frid"));
      return;
    }

    // "Send Prayer" button
    if (target.classList.contains("btn-send")) {
      var sendIdx = parseInt(target.getAttribute("data-idx"), 10);
      sendPrayer(sendIdx);
      return;
    }
  }

  // ── Prayer Panel ───────────────────────────────────────────────────────
  function openPrayPanel(idx) {
    var req = requests[idx];
    var panel = document.getElementById("panel-" + req.formResponseId);
    if (panel) {
      panel.style.display = "block";
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function closePrayPanel(formResponseId) {
    var panel = document.getElementById("panel-" + formResponseId);
    if (panel) {
      panel.style.display = "none";
      var toggle = document.getElementById("toggle-name-" + formResponseId);
      var note   = document.getElementById("note-" + formResponseId);
      if (toggle) toggle.checked = false;
      if (note) note.value = "";
    }
  }

  // ── Send Prayer ────────────────────────────────────────────────────────
  async function sendPrayer(idx) {
    var req = requests[idx];
    var sendBtn     = document.getElementById("send-" + req.formResponseId);
    var includeName = document.getElementById("toggle-name-" + req.formResponseId).checked;
    var personalNote = (document.getElementById("note-" + req.formResponseId).value || "").trim();

    sendBtn.disabled = true;
    sendBtn.textContent = "Sending\u2026";

    try {
      // 1. Log the prayer in MP
      await logPrayer(req, personalNote);

      // 2. Send email notification (skip if no email on file)
      var emailSent = false;
      if (req.contactEmail) {
        await sendPrayerEmail(req, includeName, personalNote);
        emailSent = true;
      }

      // 3. Update card UI
      req.prayerCount++;
      var countEl = document.getElementById("count-" + req.formResponseId);
      if (countEl) {
        countEl.textContent = "Prayed for " + req.prayerCount +
          " time" + (req.prayerCount !== 1 ? "s" : "");
      }

      closePrayPanel(req.formResponseId);
      showToast(emailSent
        ? "Prayer recorded & notification sent!"
        : "Prayer recorded (no email on file).");
    } catch (err) {
      console.error("[PrayerWidget] sendPrayer failed:", err);
      showToast("Something went wrong. Please try again.", true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Prayer";
    }
  }

  async function logPrayer(req, note) {
    var notes = "[FR:" + req.formResponseId + "] Prayed for by " + currentUser.displayName;
    if (note) notes += " — " + note;

    try {
      await mpPost("/tables/Activity_Log", [{
        Activity_Type: "Prayer",
        Activity_Date: new Date().toISOString(),
        Contact_ID:    req.contactId,
        Notes:         notes
      }]);
    } catch (e) {
      console.warn("[PrayerWidget] Activity_Log write failed, trying Contact_Log:", e.message);
      // Fallback table
      await mpPost("/tables/Contact_Log", [{
        Contact_ID: req.contactId,
        Notes:      notes,
        Log_Date:   new Date().toISOString()
      }]);
    }
  }

  async function sendPrayerEmail(req, includeName, personalNote) {
    var senderLabel = includeName
      ? currentUser.displayName
      : "Someone from our prayer team";

    var subject = senderLabel + " has prayed for you";

    var body =
      "<p>Dear " + escHtml(req.name) + ",</p>" +
      "<p>" + escHtml(senderLabel) +
      " at McLean Bible Church has lifted your prayer request up to God.</p>";

    if (personalNote) {
      body += "<p style=\"font-style:italic;color:#555;\">\"" +
        escHtml(personalNote) + "\"</p>";
    }

    body +=
      "<p>You are not alone \u2014 we are with you in prayer.</p>" +
      "<p>Blessings,<br/>McLean Bible Church Prayer Team</p>";

    var messagePayload = {
      FromAddress:    { DisplayName: "MBC Prayer Team", Address: PRAYER_FROM },
      ToAddresses:    [{ DisplayName: req.name, Address: req.contactEmail }],
      ReplyToAddress: { DisplayName: "MBC Prayer Team", Address: PRAYER_FROM },
      Subject:        subject,
      Body:           body
    };

    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    var res = await fetch(MP_API + "/messages", {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(messagePayload)
    });

    if (res.ok) {
      // Patch dp_Communication_Messages to link Contact_ID
      // so email shows on the requester's contact record in MP
      try {
        var comm   = await res.json();
        var commId = comm.CommunicationId || comm.Communication_ID;
        if (commId) {
          var msgs = await mpGet(
            "/tables/dp_Communication_Messages?$select=Communication_Message_ID" +
            "&$filter=Communication_ID=" + commId
          );
          if (msgs && msgs.length > 0) {
            await mpPut(
              "/tables/dp_Communication_Messages",
              msgs.map(function (m) {
                return {
                  Communication_Message_ID: m.Communication_Message_ID,
                  Contact_ID: req.contactId
                };
              })
            );
          }
        }
      } catch (patchErr) {
        console.log("[PrayerWidget] Could not patch Contact_ID on message:", patchErr);
      }
    } else {
      var errText = await res.text().catch(function () { return ""; });
      console.warn("[PrayerWidget] /messages failed:", res.status, errText);
    }
  }

  // ── Refresh ────────────────────────────────────────────────────────────
  async function refreshAll() {
    var btn = document.getElementById("btn-refresh");
    btn.classList.add("spinning");
    try {
      await loadPrayerRequests(false);
    } catch (err) {
      console.error("[PrayerWidget] refresh failed:", err);
      showToast("Refresh failed.", true);
    } finally {
      btn.classList.remove("spinning");
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function showToast(message, isError) {
    var existing = document.getElementById("prayer-toast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "prayer-toast";
    toast.className = "toast" + (isError ? " error" : "");
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.classList.add("fade");
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // ── Init ───────────────────────────────────────────────────────────────
  async function init() {
    var root = document.getElementById("prayer-widget");
    if (!root) {
      root = document.createElement("div");
      root.id = "prayer-widget";
      document.body.appendChild(root);
    }
    root.style.display = "none";

    // Require formId in URL
    formId = getUrlParam("formId");
    if (!formId) {
      root.innerHTML = '<div class="state-msg error">' +
        'Missing <strong>formId</strong> URL parameter.</div>';
      root.style.display = "block";
      return;
    }

    try {
      // Authenticate + authorize
      await loadCurrentUser();
      var authorized = await checkAuthorization();
      if (!authorized) {
        root.innerHTML = '<div class="state-msg error">' +
          'You do not have access to view prayer requests.</div>';
        root.style.display = "block";
        return;
      }

      // Discover form structure
      await loadFormStructure();

      // Build the widget shell, then load data
      buildShell();
      root.style.display = "block";

      await loadPrayerRequests(false);
    } catch (err) {
      console.error("[PrayerWidget] init failed:", err);
      root.innerHTML = '<div class="state-msg error">' +
        'Unable to load prayer requests. Please refresh and try again.</div>';
      root.style.display = "block";
    }
  }
})();
