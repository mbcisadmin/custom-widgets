(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────
  const MP_API = "https://my.mcleanbible.org/ministryplatformapi";

  const MAX_CHILDREN = 10;

  // Child attributes — add/remove entries here as needed
  // Set hasNotes: true for attributes that need a free-text field (e.g. Allergies)
  // Non-notes attributes first, then notes attributes grouped at the bottom
  const CHILD_ATTRIBUTES = [
    { id: 252, label: "Behavioral",      icon: "\uD83C\uDFC3" },
    { id: 174, label: "Custody",         icon: "\uD83D\uDD12" },
    { id: 378, label: "ASL",             icon: "\uD83E\uDD1F" },
    { id: 318, label: "Disability",      icon: "\u267F" },
    { id: 377, label: "No Photo/Video",  icon: "\uD83D\uDEAB" },
    { id: 379, label: "Restroom Needs",  icon: "\uD83D\uDEBB" },
    { id: 391, label: "Potty Training",  icon: "\uD83D\uDEBD" },
    { id: 393, label: "No Diaper Change",icon: "\uD83D\uDC76" },
    { id: 283, label: "Allergies",       icon: "\u270B",     hasNotes: true, notesPlaceholder: "List allergies\u2026" },
    { id: 200, label: "Special Needs",   icon: "\uD83D\uDE0A", hasNotes: true, notesPlaceholder: "Describe considerations\u2026" },
    { id: 86,  label: "Health Concerns", icon: "\uD83C\uDFE5", hasNotes: true, notesPlaceholder: "Describe health concerns\u2026" },
    { id: 205, label: "EpiPen",          icon: "\u2757",     hasNotes: true, notesPlaceholder: "EpiPen details\u2026" }
  ];

  const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY"
  ];

  // MP reference data IDs
  const HOUSEHOLD_POSITION_HEAD  = 1;
  const HOUSEHOLD_POSITION_CHILD = 2;
  const PARTICIPANT_TYPE_ID      = 22;  // Visitor
  let parentData    = null;
  let childrenData  = [];
  let childSeq      = 0;
  let countdownTimer = null;

  // ── Bootstrap ──────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    var root = document.getElementById("walkin-widget");
    if (!root) {
      console.error("[WalkinReg] Missing #walkin-widget container.");
      return;
    }

    // Hide widget until we confirm authentication via a successful API call
    root.style.display = "none";
    root.innerHTML = buildWidgetHtml();

    // Auth gate — a successful API call confirms the user is authenticated
    mpGet("/tables/Contacts?$select=Contact_ID&$top=1").then(function () {
      root.style.display = "";
      setupStep1();
      setupConfirmation();
    }).catch(function (err) {
      console.warn("[WalkinReg] Not authenticated:", err);
      root.innerHTML = "";
    });

    loadLocationName().catch(function (err) {
      console.error("[WalkinReg] Failed to load location name:", err);
    });
  }

  // ── Widget HTML ──────────────────────────────────────────────────────
  function buildWidgetHtml() {
    return (
      '<!-- Step 1: Parent & Children Form -->' +
      '<section id="step-1" class="step">' +
        '<div class="step-header">' +
          '<button type="button" id="lock-kiosk-btn" class="btn-lock" aria-label="Lock kiosk" title="Lock kiosk">\uD83D\uDD12 Lock</button>' +
          '<p id="location-name" class="location-name" hidden></p>' +
          '<h1>Kids Quest Walk-In Registration</h1>' +
          '<p class="step-subtitle">Please fill in your family\'s information below.</p>' +
        '</div>' +
        '<form id="registration-form" novalidate>' +
          '<div class="section-card">' +
            '<h2 class="section-title">Parent / Guardian</h2>' +
            '<div class="form-row">' +
              '<div class="form-field">' +
                '<label for="parent-first">First Name <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="text" id="parent-first" required autocomplete="off" inputmode="text" placeholder="First name" />' +
              '</div>' +
              '<div class="form-field">' +
                '<label for="parent-last">Last Name <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="text" id="parent-last" required autocomplete="off" inputmode="text" placeholder="Last name" />' +
              '</div>' +
            '</div>' +
            '<div class="form-row">' +
              '<div class="form-field">' +
                '<label for="parent-email">Email Address <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="email" id="parent-email" required autocomplete="off" inputmode="email" placeholder="email@example.com" />' +
              '</div>' +
              '<div class="form-field">' +
                '<label for="parent-phone">Phone Number <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="tel" id="parent-phone" required autocomplete="off" inputmode="tel" placeholder="(555) 555-5555" />' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="section-card">' +
            '<h2 class="section-title">Mailing Address</h2>' +
            '<div class="form-row">' +
              '<div class="form-field" style="grid-column: 1 / -1;">' +
                '<label for="addr-line1">Address Line 1 <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="text" id="addr-line1" required autocomplete="off" inputmode="text" placeholder="Street address" />' +
              '</div>' +
            '</div>' +
            '<div class="form-row">' +
              '<div class="form-field" style="grid-column: 1 / -1;">' +
                '<label for="addr-line2">Address Line 2</label>' +
                '<input type="text" id="addr-line2" autocomplete="off" inputmode="text" placeholder="Apt, suite, unit, etc. (optional)" />' +
              '</div>' +
            '</div>' +
            '<div class="form-row form-row--three">' +
              '<div class="form-field">' +
                '<label for="addr-city">City <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="text" id="addr-city" required autocomplete="off" inputmode="text" placeholder="City" />' +
              '</div>' +
              '<div class="form-field">' +
                '<label for="addr-state">State <span class="required" aria-hidden="true">*</span></label>' +
                '<select id="addr-state" required>' +
                  '<option value="">\u2014 Select \u2014</option>' +
                  US_STATES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join("") +
                '</select>' +
              '</div>' +
              '<div class="form-field">' +
                '<label for="addr-zip">ZIP Code <span class="required" aria-hidden="true">*</span></label>' +
                '<input type="text" id="addr-zip" required autocomplete="off" inputmode="numeric" placeholder="ZIP" maxlength="10" />' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="section-card">' +
            '<h2 class="section-title">Children</h2>' +
            '<div id="children-container"></div>' +
            '<button type="button" id="add-child-btn" class="btn btn--secondary btn--add">+ Add Another Child</button>' +
          '</div>' +
          '<div id="step1-error" class="error-msg" hidden></div>' +
          '<div class="form-actions">' +
            '<button type="submit" class="btn btn--primary btn--large">Submit Family Information &rarr;</button>' +
          '</div>' +
        '</form>' +
      '</section>' +

      '<!-- Step 2: Confirmation -->' +
      '<section id="step-2" class="step" hidden>' +
        '<div class="thankyou-card">' +
          '<div class="thankyou-icon" aria-hidden="true">&#10003;</div>' +
          '<h1>Registration Complete!</h1>' +
          '<p class="thankyou-message">' +
            'Thank you! Please see an attendant for next steps.' +
          '</p>' +
          '<p class="thankyou-reset">' +
            'This form will reset automatically in <span id="countdown">10</span> seconds.' +
          '</p>' +
          '<button type="button" id="new-family-btn" class="btn btn--secondary">Register Another Family</button>' +
        '</div>' +
      '</section>'
    );
  }

  // ── Token & Session Helpers ─────────────────────────────────────────────
  const OAUTH_TOKEN_URL = MP_API + "/oauth/connect/token";
  const CLIENT_ID       = "TM.Widgets";
  const OAUTH_SCOPE     = "openid http://www.thinkministry.com/dataplatform/scopes/all";
  const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

  function getToken() {
    return localStorage.getItem("mpp-widgets_AuthToken");
  }

  function getRefreshToken() {
    return localStorage.getItem("mpp-widgets_RefreshToken");
  }

  function getTokenExpiry() {
    var v = localStorage.getItem("mpp-widgets_TokenExpiry");
    return v ? parseInt(v, 10) : 0;
  }

  function storeTokenData(accessToken, refreshToken, expiresIn) {
    if (accessToken) localStorage.setItem("mpp-widgets_AuthToken", accessToken);
    if (refreshToken) localStorage.setItem("mpp-widgets_RefreshToken", refreshToken);
    if (expiresIn) localStorage.setItem("mpp-widgets_TokenExpiry", String(Date.now() + expiresIn * 1000));
  }

  function clearTokens() {
    localStorage.removeItem("mpp-widgets_AuthToken");
    localStorage.removeItem("mpp-widgets_RefreshToken");
    localStorage.removeItem("mpp-widgets_TokenExpiry");
  }

  function handleSessionExpired() {
    clearTokens();
  }

  async function refreshAccessToken() {
    var rt = getRefreshToken();
    if (!rt) return false;

    try {
      var res = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token"
          + "&client_id=" + encodeURIComponent(CLIENT_ID)
          + "&refresh_token=" + encodeURIComponent(rt)
      });
      if (!res.ok) return false;
      var data = await res.json();
      storeTokenData(data.access_token, data.refresh_token, data.expires_in);
      return true;
    } catch (e) {
      console.warn("[WalkinReg] Token refresh failed:", e);
      return false;
    }
  }

  async function ensureValidToken() {
    if (getTokenExpiry() && Date.now() + TOKEN_REFRESH_BUFFER_MS >= getTokenExpiry()) {
      var refreshed = await refreshAccessToken();
      if (!refreshed) handleSessionExpired();
    }
  }

  // ── MP REST API Helpers ────────────────────────────────────────────────
  async function mpGet(path) {
    await ensureValidToken();
    var headers = {};
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      headers: headers,
      credentials: "include"
    });
    if (res.status === 401) { handleSessionExpired(); throw new Error("Session expired"); }
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("GET " + path + " \u2192 " + res.status + ": " + body);
    }
    return res.json();
  }

  async function mpPost(path, records) {
    await ensureValidToken();
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(records)
    });
    if (res.status === 401) { handleSessionExpired(); throw new Error("Session expired"); }
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("POST " + path + " \u2192 " + res.status + ": " + body);
    }
    return res.json();
  }

  async function mpPut(path, records) {
    await ensureValidToken();
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var res = await fetch(MP_API + path, {
      method: "PUT",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(records)
    });
    if (res.status === 401) { handleSessionExpired(); throw new Error("Session expired"); }
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error("PUT " + path + " \u2192 " + res.status + ": " + body);
    }
    return res.json();
  }

  // ── Location Name ─────────────────────────────────────────────────────
  async function loadLocationName() {
    var locId = getLocationId();
    if (!locId) return;

    var data = await mpGet(
      "/tables/Congregations?$select=Congregation_ID,Congregation_Name&$filter=Congregation_ID=" + encodeURIComponent(locId)
    );

    if (data && data.length > 0) {
      var el = document.getElementById("location-name");
      if (el) {
        el.textContent = data[0].Congregation_Name;
        el.hidden = false;
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────
  function calculateAge(isoDate) {
    var today = new Date();
    var birth = new Date(isoDate + "T00:00:00");
    var years  = today.getFullYear() - birth.getFullYear();
    var months = today.getMonth()    - birth.getMonth();

    if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
      years--;
      months += 12;
    }
    if (today.getDate() < birth.getDate()) months--;
    if (months < 0) months += 12;

    if (years === 0) return months + " month" + (months !== 1 ? "s" : "");
    if (months === 0) return years + " year" + (years !== 1 ? "s" : "");
    return years + " yr " + months + " mo";
  }

  function formatDisplayDate(isoDate) {
    var parts = isoDate.split("-");
    return parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10) + "/" + parts[0];
  }

  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }

  function getLocationId() {
    return new URLSearchParams(window.location.search).get("locationId") || null;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Step 1: Family Registration Form ──────────────────────────────────
  function setupStep1() {
    addChildCard();

    document.getElementById("lock-kiosk-btn").addEventListener("click", function () {
      clearTokens();
      window.location.reload();
    });

    document.getElementById("add-child-btn").addEventListener("click", function () {
      var count = document.querySelectorAll(".child-card").length;
      if (count < MAX_CHILDREN) addChildCard();
    });

    document.getElementById("registration-form").addEventListener("submit", onStep1Submit);
  }

  function addChildCard() {
    childSeq++;
    var seq       = childSeq;
    var container = document.getElementById("children-container");
    var isFirst   = container.children.length === 0;

    var card = document.createElement("div");
    card.className   = "child-card";
    card.dataset.seq = seq;

    // Build buttons and notes separately so notes drop below the grid
    var attrBtns = "";
    var attrNotes = "";
    CHILD_ATTRIBUTES.forEach(function (attr) {
      var btnId = "attr-" + attr.id + "-" + seq;
      attrBtns +=
        '<button type="button" class="attr-toggle" id="' + btnId + '" data-attr-id="' + attr.id + '">' +
          '<span class="attr-icon">' + attr.icon + '</span>' + escHtml(attr.label) +
        '</button>';
      if (attr.hasNotes) {
        var notesId = "attrnotes-" + attr.id + "-" + seq;
        attrNotes +=
          '<div class="attr-notes-wrap" id="noteswrap-' + attr.id + "-" + seq + '">' +
            '<input type="text" class="attr-notes" id="' + notesId + '" placeholder="' + escHtml(attr.notesPlaceholder || "") + '" />' +
          '</div>';
      }
    });
    var attrHtml = attrBtns + attrNotes;

    card.innerHTML =
      '<div class="child-card-header">' +
        '<span class="child-label">Child</span>' +
        (isFirst ? "" :
          '<button type="button" class="remove-child-btn" aria-label="Remove child">Remove</button>') +
      '</div>' +
      '<div class="form-row form-row--three">' +
        '<div class="form-field">' +
          '<label for="cf-' + seq + '">First Name <span class="required" aria-hidden="true">*</span></label>' +
          '<input type="text" id="cf-' + seq + '" required autocomplete="off" inputmode="text" placeholder="First name" />' +
        '</div>' +
        '<div class="form-field">' +
          '<label for="cl-' + seq + '">Last Name <span class="required" aria-hidden="true">*</span></label>' +
          '<input type="text" id="cl-' + seq + '" required autocomplete="off" inputmode="text" placeholder="Last name" />' +
        '</div>' +
        '<div class="form-field">' +
          '<label for="cd-' + seq + '">Date of Birth <span class="required" aria-hidden="true">*</span></label>' +
          '<input type="date" id="cd-' + seq + '" required max="' + todayISO() + '" />' +
        '</div>' +
      '</div>' +
      (attrHtml
        ? '<button type="button" class="attr-expand-btn" id="attrexp-' + seq + '">' +
            '<span class="attr-expand-icon">+</span> Special Needs / Accommodations' +
          '</button>' +
          '<div class="attr-panel" id="attrpanel-' + seq + '">' +
            '<div class="attr-row">' + attrHtml + '</div>' +
          '</div>'
        : '');

    // Wire up expand/collapse for attributes panel
    var expandBtn = card.querySelector("#attrexp-" + seq);
    if (expandBtn) {
      expandBtn.addEventListener("click", function () {
        var panel = card.querySelector("#attrpanel-" + seq);
        var isOpen = panel.classList.toggle("open");
        expandBtn.classList.toggle("open", isOpen);
        expandBtn.querySelector(".attr-expand-icon").textContent = isOpen ? "\u2212" : "+";
      });
    }

    // Wire up attribute toggle buttons
    CHILD_ATTRIBUTES.forEach(function (attr) {
      var btn = card.querySelector("#attr-" + attr.id + "-" + seq);
      if (!btn) return;
      btn.addEventListener("click", function () {
        btn.classList.toggle("active");
        if (attr.hasNotes) {
          var wrap = card.querySelector("#noteswrap-" + attr.id + "-" + seq);
          if (wrap) wrap.classList.toggle("open", btn.classList.contains("active"));
        }
      });
    });

    var removeBtn = card.querySelector(".remove-child-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        card.remove();
        relabelChildren();
        updateAddChildBtn();
      });
    }

    container.appendChild(card);
    relabelChildren();
    updateAddChildBtn();
  }

  function relabelChildren() {
    document.querySelectorAll(".child-card").forEach(function (card, idx) {
      card.querySelector(".child-label").textContent = "Child " + (idx + 1);
    });
  }

  function updateAddChildBtn() {
    var count = document.querySelectorAll(".child-card").length;
    var btn   = document.getElementById("add-child-btn");
    var atMax = count >= MAX_CHILDREN;
    btn.disabled    = atMax;
    btn.textContent = atMax
      ? "Maximum " + MAX_CHILDREN + " children reached"
      : "+ Add Another Child";
  }

  async function onStep1Submit(e) {
    e.preventDefault();
    hideError("step1-error");

    parentData = {
      firstName:    document.getElementById("parent-first").value.trim(),
      lastName:     document.getElementById("parent-last").value.trim(),
      email:        document.getElementById("parent-email").value.trim(),
      phone:        document.getElementById("parent-phone").value.trim(),
      addressLine1: document.getElementById("addr-line1").value.trim(),
      addressLine2: document.getElementById("addr-line2").value.trim(),
      city:         document.getElementById("addr-city").value.trim(),
      state:        document.getElementById("addr-state").value,
      zip:          document.getElementById("addr-zip").value.trim()
    };

    // Validate required address fields (form uses novalidate)
    if (!parentData.addressLine1 || !parentData.city || !parentData.state || !parentData.zip) {
      showError("step1-error", "Please fill in all required address fields.");
      return;
    }
    if (!/^\d{5}(-\d{4})?$/.test(parentData.zip)) {
      showError("step1-error", "Please enter a valid 5-digit ZIP code.");
      return;
    }

    childrenData = [];
    document.querySelectorAll(".child-card").forEach(function (card) {
      var seq = card.dataset.seq;

      // Collect selected attributes
      var attrs = [];
      CHILD_ATTRIBUTES.forEach(function (attr) {
        var btn = card.querySelector("#attr-" + attr.id + "-" + seq);
        if (btn && btn.classList.contains("active")) {
          var notes = "";
          if (attr.hasNotes) {
            var notesInput = card.querySelector("#attrnotes-" + attr.id + "-" + seq);
            if (notesInput) notes = notesInput.value.trim();
          }
          attrs.push({ attributeId: attr.id, notes: notes });
        }
      });

      childrenData.push({
        firstName:  document.getElementById("cf-" + seq).value.trim(),
        lastName:   document.getElementById("cl-" + seq).value.trim(),
        birthdate:  document.getElementById("cd-" + seq).value,
        attributes: attrs
      });
    });

    var submitBtn = document.querySelector("#registration-form .btn--primary");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving\u2026";

    try {
      await registerFamily();
      showStep(2);
      startCountdown();
    } catch (err) {
      console.error("[WalkinReg] Registration error:", err);
      showError(
        "step1-error",
        "Something went wrong saving the registration. Please try again or contact a staff member."
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Family Information \u2192";
    }
  }


  // ── MP Registration (direct table API calls) ──────────────────────────
  async function registerFamily() {
    var locId          = getLocationId();
    var congregationId = locId ? parseInt(locId, 10) : null;
    var parentContactId, householdId;

    // 1. Check for existing contact by email
    var existing = await findExistingContact(parentData.email);

    if (existing) {
      // Use existing contact — don't create duplicates
      parentContactId = existing.Contact_ID;
      householdId     = existing.Household_ID;
      console.log("[WalkinReg] Found existing contact:", parentContactId);

      // Update address on existing household
      try {
        var addrResult = await mpPost("/tables/Addresses", [{
          Address_Line_1: parentData.addressLine1,
          Address_Line_2: parentData.addressLine2 || null,
          City:           parentData.city,
          "State/Region": parentData.state,
          Postal_Code:    parentData.zip
        }]);
        await mpPut("/tables/Households", [{
          Household_ID: householdId,
          Address_ID:   addrResult[0].Address_ID
        }]);
      } catch (addrErr) {
        console.warn("[WalkinReg] Could not update address for existing household:", addrErr);
      }
    } else {
      // 2a. Create Household
      var householdResult = await mpPost("/tables/Households", [{
        Household_Name:  parentData.lastName,
        Congregation_ID: congregationId,
        Domain_ID:       1
      }]);
      householdId = householdResult[0].Household_ID;

      // 2b. Create Address and link to Household
      var addrResult = await mpPost("/tables/Addresses", [{
        Address_Line_1: parentData.addressLine1,
        Address_Line_2: parentData.addressLine2 || null,
        City:           parentData.city,
        "State/Region": parentData.state,
        Postal_Code:    parentData.zip
      }]);
      await mpPut("/tables/Households", [{
        Household_ID: householdId,
        Address_ID:   addrResult[0].Address_ID
      }]);

      // 2c. Create parent Contact
      var parentResult = await mpPost("/tables/Contacts", [{
        First_Name:            parentData.firstName,
        Last_Name:             parentData.lastName,
        Display_Name:          parentData.lastName + ", " + parentData.firstName,
        Email_Address:         parentData.email,
        Mobile_Phone:          parentData.phone,
        Household_ID:          householdId,
        Household_Position_ID: HOUSEHOLD_POSITION_HEAD,
        Company:               false
      }]);
      parentContactId = parentResult[0].Contact_ID;
    }

    // 3. Ensure Participant record for parent (Visitor)
    await ensureParticipant(parentContactId);

    // 4. Create or find user account, send welcome email (non-blocking)
    ensureUserAccount(parentContactId, parentData.email, parentData.firstName, parentData.lastName)
      .catch(function (err) { console.warn("[WalkinReg] User account/email:", err); });

    // 5. Create child Contacts and Participant records
    for (var i = 0; i < childrenData.length; i++) {
      var child = childrenData[i];

      var childResult = await mpPost("/tables/Contacts", [{
        First_Name:            child.firstName,
        Last_Name:             child.lastName,
        Display_Name:          child.lastName + ", " + child.firstName,
        Date_of_Birth:         child.birthdate,
        Household_ID:          householdId,
        Household_Position_ID: HOUSEHOLD_POSITION_CHILD,
        Company:               false
      }]);
      var childContactId = childResult[0].Contact_ID;

      // 6. Get or create Participant record for this child
      await ensureParticipant(childContactId);

      // 7. Save selected attributes for this child
      if (child.attributes && child.attributes.length > 0) {
        for (var a = 0; a < child.attributes.length; a++) {
          var attr = child.attributes[a];
          var attrRecord = {
            Contact_ID:   childContactId,
            Attribute_ID: attr.attributeId,
            Start_Date:   todayISO()
          };
          if (attr.notes) attrRecord.Notes = attr.notes;
          await mpPost("/tables/Contact_Attributes", [attrRecord]);
        }
      }
    }
  }

  // ── Duplicate Contact Check ───────────────────────────────────────────
  async function findExistingContact(email) {
    var results = await mpGet(
      "/tables/Contacts?$select=Contact_ID,Household_ID&$filter=Email_Address=" +
      encodeURIComponent("'" + email + "'")
    );
    return (results && results.length > 0) ? results[0] : null;
  }

  // ── User Account & Welcome Email ─────────────────────────────────────
  async function ensureUserAccount(contactId, email, firstName, lastName) {
    // Check if user account already exists for this contact
    var existingUsers = await mpGet(
      "/tables/dp_Users?$select=User_ID&$filter=Contact_ID=" + contactId
    );
    if (existingUsers && existingUsers.length > 0) {
      console.log("[WalkinReg] User account already exists for contact:", contactId);
      return;
    }

    // Also check by username (email) in case contact was re-created
    var byUsername = await mpGet(
      "/tables/dp_Users?$select=User_ID&$filter=User_Name=" +
      encodeURIComponent("'" + email + "'")
    );
    if (byUsername && byUsername.length > 0) {
      console.log("[WalkinReg] User account already exists for email:", email);
      return;
    }

    // Create user account with email as username
    var displayName = lastName + ", " + firstName;
    await mpPost("/tables/dp_Users", [{
      User_Name:    email,
      Display_Name: displayName,
      Contact_ID:   contactId,
      Domain_ID:    1
    }]);
    console.log("[WalkinReg] Created user account for:", email);

    // Send welcome email via Communications table
    await sendWelcomeEmail(contactId, firstName, email);
  }

  async function sendWelcomeEmail(contactId, firstName, email) {
    var profileUrl = "https://mcleanbible.org/my-account/?w=household";

    var subject = "Welcome to McLean Bible Church!";
    var body =
      "<p>Hi " + escHtml(firstName) + ",</p>" +
      "<p>Thank you for visiting McLean Bible Church and registering your family " +
      "with Kids Quest! We\u2019re so glad you\u2019re here.</p>" +
      "<p>We\u2019ve created an account for you so you can manage your family\u2019s " +
      "information online. To get started, please set up your password and " +
      "complete your profile:</p>" +
      "<p style=\"margin:1.5rem 0;\">" +
        "<a href=\"" + profileUrl + "\" " +
        "style=\"background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;" +
        "text-decoration:none;font-weight:700;font-size:16px;\">" +
        "Complete Your Profile</a>" +
      "</p>" +
      "<p>Your username is: <strong>" + escHtml(email) + "</strong></p>" +
      "<p>If you haven\u2019t set a password yet, use the \u201cForgot Password\u201d " +
      "link on the login page to create one.</p>" +
      "<p>Completing your profile helps us serve your family better \u2014 " +
      "we look forward to connecting with you!</p>" +
      "<p>Blessings,<br />The Kids Quest Team</p>";

    // Send via MP /messages endpoint (triggers actual email delivery)
    await ensureValidToken();
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;

    var messagePayload = {
      FromAddress:    { DisplayName: "Kids Quest", Address: "kidsquest@mcleanbible.org" },
      ToAddresses:    [{ DisplayName: firstName, Address: email }],
      ReplyToAddress: { DisplayName: "Kids Quest", Address: "kidsquest@mcleanbible.org" },
      Subject:        subject,
      Body:           body
    };

    var res = await fetch(MP_API + "/messages", {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(messagePayload)
    });
    if (res.status === 401) { handleSessionExpired(); throw new Error("Session expired"); }

    if (res.ok) {
      // Patch dp_Communication_Messages to link Contact_ID so it shows on contact record
      try {
        var comm = await res.json();
        var commId = comm.CommunicationId || comm.Communication_ID;
        if (commId) {
          var msgs = await mpGet(
            "/tables/dp_Communication_Messages?$select=Communication_Message_ID" +
            "&$filter=Communication_ID=" + commId
          );
          if (msgs && msgs.length > 0) {
            await fetch(MP_API + "/tables/dp_Communication_Messages", {
              method: "PUT",
              headers: headers,
              credentials: "include",
              body: JSON.stringify(msgs.map(function(m) {
                return {
                  Communication_Message_ID: m.Communication_Message_ID,
                  Contact_ID: contactId
                };
              }))
            });
          }
        }
      } catch (e) {
        console.log("[WalkinReg] Could not patch Contact_ID on message:", e);
      }
    } else {
      console.warn("[WalkinReg] /messages endpoint failed:", res.status, await res.text());
    }
    console.log("[WalkinReg] Welcome email sent for:", email);
  }

  async function ensureParticipant(contactId) {
    var existing = await mpGet(
      "/tables/Participants?$select=Participant_ID&$filter=Contact_ID=" + contactId
    );
    if (existing && existing.length > 0) return existing[0].Participant_ID;

    var created = await mpPost("/tables/Participants", [{
      Contact_ID:              contactId,
      Participant_Type_ID:     PARTICIPANT_TYPE_ID,
      Participant_Start_Date:  todayISO()
    }]);
    return created[0].Participant_ID;
  }

  // ── Confirmation ────────────────────────────────────────────────────────
  function setupConfirmation() {
    document.getElementById("new-family-btn").addEventListener("click", resetWidget);
  }

  function startCountdown() {
    var seconds = 10;
    var el = document.getElementById("countdown");
    if (el) el.textContent = seconds;

    countdownTimer = setInterval(function () {
      seconds--;
      if (el) el.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(countdownTimer);
        resetWidget();
      }
    }, 1000);
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  function resetWidget() {
    clearInterval(countdownTimer);

    parentData   = null;
    childrenData = [];
    childSeq     = 0;

    document.getElementById("registration-form").reset();

    document.getElementById("children-container").innerHTML = "";
    addChildCard();
    updateAddChildBtn();
    hideError("step1-error");

    var submitBtn = document.querySelector("#registration-form .btn--primary");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Family Information \u2192";
    }

    showStep(1);
  }

  // ── UI Helpers ─────────────────────────────────────────────────────────
  function showStep(n) {
    ["step-1", "step-2"].forEach(function (id, idx) {
      var el = document.getElementById(id);
      if (el) el.hidden = (idx + 1 !== n);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  function hideError(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = true;
  }

})();
