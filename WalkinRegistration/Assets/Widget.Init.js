(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────
  const MP_API = "https://my.mcleanbible.org/ministryplatformapi";

  // Kids Quest group IDs — update here if groups change
  const GROUP_IDS = [53012, 53013, 53014, 53015, 53016, 53017, 53018, 53019, 53020, 53021, 53022, 53023];

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

  // MP reference data IDs
  const HOUSEHOLD_POSITION_HEAD  = 1;
  const HOUSEHOLD_POSITION_CHILD = 2;
  const PARTICIPANT_TYPE_ID      = 22;  // Visitor
  const GROUP_ROLE_ID            = 866; // Visitor
  let groups        = [];
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

    // Inject the widget HTML into the container
    root.innerHTML = buildWidgetHtml();

    // Load config data from MP
    loadGroups().catch(function (err) {
      console.error("[WalkinReg] Failed to load groups:", err);
    });
    loadLocationName().catch(function (err) {
      console.error("[WalkinReg] Failed to load location name:", err);
    });

    setupStep1();
    setupStep2();
    setupStep3();
  }

  // ── Widget HTML ──────────────────────────────────────────────────────
  function buildWidgetHtml() {
    return (
      '<!-- Step 1: Parent & Children Form -->' +
      '<section id="step-1" class="step">' +
        '<div class="step-header">' +
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

      '<!-- Step 2: Volunteer Group Assignment -->' +
      '<section id="step-2" class="step" hidden>' +
        '<div class="step-header step-header--volunteer">' +
          '<div class="handoff-badge">Volunteer Action Required</div>' +
          '<h1>Assign Children to Groups</h1>' +
          '<p class="step-subtitle">Please take the iPad back from the parent and assign each child to the correct group.</p>' +
        '</div>' +
        '<form id="assign-form">' +
          '<div id="group-assignment-container"></div>' +
          '<div id="step2-error" class="error-msg" hidden></div>' +
          '<div class="form-actions">' +
            '<button type="submit" id="assign-submit-btn" class="btn btn--primary btn--large">Complete Registration</button>' +
          '</div>' +
        '</form>' +
      '</section>' +

      '<!-- Step 3: Thank You -->' +
      '<section id="step-3" class="step" hidden>' +
        '<div class="thankyou-card">' +
          '<div class="thankyou-icon" aria-hidden="true">&#10003;</div>' +
          '<h1>Registration Complete!</h1>' +
          '<p class="thankyou-message">' +
            'Your family has been registered for Kids Quest.<br />' +
            '<strong>Please proceed to the check-in station to check in your children.</strong>' +
          '</p>' +
          '<p class="thankyou-reset">' +
            'This form will reset automatically in <span id="countdown">30</span> seconds.' +
          '</p>' +
          '<button type="button" id="new-family-btn" class="btn btn--secondary">Register Another Family</button>' +
        '</div>' +
      '</section>'
    );
  }

  // ── MP REST API Helpers ────────────────────────────────────────────────
  function getToken() {
    return localStorage.getItem("mpp-widgets_AuthToken");
  }

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
      throw new Error("GET " + path + " \u2192 " + res.status + ": " + body);
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
      throw new Error("POST " + path + " \u2192 " + res.status + ": " + body);
    }
    return res.json();
  }

  // ── Groups ─────────────────────────────────────────────────────────────
  async function loadGroups() {
    var ids = GROUP_IDS.join(",");
    var data = await mpGet(
      "/tables/Groups?$select=Group_ID,Group_Name&$filter=Group_ID in (" + ids + ")&$orderby=Group_Name"
    );
    groups = data || [];
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

  function onStep1Submit(e) {
    e.preventDefault();
    hideError("step1-error");

    parentData = {
      firstName: document.getElementById("parent-first").value.trim(),
      lastName:  document.getElementById("parent-last").value.trim(),
      email:     document.getElementById("parent-email").value.trim(),
      phone:     document.getElementById("parent-phone").value.trim()
    };

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

    showStep(2);
    renderGroupAssignment();
  }

  // ── Step 2: Volunteer Group Assignment ─────────────────────────────────
  function setupStep2() {
    document.getElementById("assign-form").addEventListener("submit", onStep2Submit);
  }

  function renderGroupAssignment() {
    var container = document.getElementById("group-assignment-container");
    container.innerHTML = "";

    if (groups.length === 0) {
      container.innerHTML = '<p class="loading-notice">Loading groups&#8230; please wait a moment.</p>';
      var poll = setInterval(function () {
        if (groups.length > 0) {
          clearInterval(poll);
          renderGroupAssignment();
        }
      }, 500);
      return;
    }

    var optionsHtml = groups.map(function (g) {
      return '<option value="' + g.Group_ID + '">' + escHtml(g.Group_Name) + '</option>';
    }).join("");

    childrenData.forEach(function (child, idx) {
      var card = document.createElement("div");
      card.className = "assignment-card";
      card.innerHTML =
        '<div class="assignment-info">' +
          '<div class="assignment-name">' + escHtml(child.firstName) + " " + escHtml(child.lastName) + '</div>' +
          '<div class="assignment-details">' +
            'DOB: ' + formatDisplayDate(child.birthdate) + ' &bull; Age: ' + calculateAge(child.birthdate) +
          '</div>' +
        '</div>' +
        '<div class="assignment-group">' +
          '<label for="grp-' + idx + '" class="sr-only">Group for ' + escHtml(child.firstName) + ' ' + escHtml(child.lastName) + '</label>' +
          '<select id="grp-' + idx + '" class="group-select" required>' +
            '<option value="">\u2014 Select Group \u2014</option>' +
            optionsHtml +
          '</select>' +
        '</div>';
      container.appendChild(card);
    });
  }

  async function onStep2Submit(e) {
    e.preventDefault();
    hideError("step2-error");

    var assignments = childrenData.map(function (child, idx) {
      return Object.assign({}, child, {
        groupId: parseInt(document.getElementById("grp-" + idx).value, 10) || 0
      });
    });

    if (assignments.some(function (a) { return !a.groupId; })) {
      showError("step2-error", "Please assign a group to every child before continuing.");
      return;
    }

    var btn = document.getElementById("assign-submit-btn");
    btn.disabled    = true;
    btn.textContent = "Saving\u2026";

    try {
      await registerFamily(assignments);
      showStep(3);
      startCountdown();
    } catch (err) {
      console.error("[WalkinReg] Registration error:", err);
      showError(
        "step2-error",
        "Something went wrong saving the registration. Please try again or contact a staff member."
      );
      btn.disabled    = false;
      btn.textContent = "Complete Registration";
    }
  }

  // ── MP Registration (direct table API calls) ──────────────────────────
  async function registerFamily(assignments) {
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
    } else {
      // 2a. Create Household
      var householdResult = await mpPost("/tables/Households", [{
        Household_Name:  parentData.lastName,
        Congregation_ID: congregationId
      }]);
      householdId = householdResult[0].Household_ID;

      // 2b. Create parent Contact
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

    // 5. Create child Contacts, then assign each to their selected group
    for (var i = 0; i < assignments.length; i++) {
      var child = assignments[i];

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
      var participantId = await ensureParticipant(childContactId);

      // 7. Add child to selected Kids Quest group
      await mpPost("/tables/Group_Participants", [{
        Group_ID:       child.groupId,
        Participant_ID: participantId,
        Group_Role_ID:  GROUP_ROLE_ID,
        Start_Date:     todayISO()
      }]);

      // 8. Save selected attributes for this child
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
    var resetUrl   = "https://my.mcleanbible.org/ministryplatformapi/oauth/connect/authorize?" +
      "client_id=WALKIN&response_type=code&scope=openid&redirect_uri=" +
      encodeURIComponent(profileUrl);

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
      "we\u2019d love to have your mailing address so we can keep you connected!</p>" +
      "<p>Blessings,<br />The Kids Quest Team</p>";

    await mpPost("/tables/dp_Communications", [{
      Author_User_ID:          1,
      Subject:                 subject,
      Body:                    body,
      Domain_ID:               1,
      Start_Date:              new Date().toISOString(),
      From_Contact:            0,
      Reply_to_Contact:        0,
      Communication_Status_ID: 3,
      To_Contact:              contactId
    }]);
    console.log("[WalkinReg] Welcome email queued for:", email);
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

  // ── Step 3: Thank You ──────────────────────────────────────────────────
  function setupStep3() {
    document.getElementById("new-family-btn").addEventListener("click", resetWidget);
  }

  function startCountdown() {
    var seconds = 30;
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

    document.getElementById("group-assignment-container").innerHTML = "";
    var assignBtn = document.getElementById("assign-submit-btn");
    assignBtn.disabled    = false;
    assignBtn.textContent = "Complete Registration";
    hideError("step2-error");

    showStep(1);
  }

  // ── UI Helpers ─────────────────────────────────────────────────────────
  function showStep(n) {
    ["step-1", "step-2", "step-3"].forEach(function (id, idx) {
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
