(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────────────
  // CustomWidget SKY API — CORS-enabled, used by all MP custom widgets
  const SKY_API = "https://mcleanbible.cloudapps.ministryplatform.cloud/sky/api/CustomWidget";

  const MAX_CHILDREN = 10;

  // ── State ──────────────────────────────────────────────────────────────
  let groups        = [];   // [{Group_ID, Group_Name}] loaded from MP
  let parentData    = null;
  let childrenData  = [];
  let childSeq      = 0;    // ever-increasing to generate unique input IDs
  let countdownTimer = null;

  // ── Bootstrap ──────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    // Load groups + campus name in one call via stored proc
    loadConfig().catch(function (err) {
      console.error("[WalkinReg] Failed to load config:", err);
    });

    setupStep1();
    setupStep2();
    setupStep3();
  }

  // ── SKY API Helper ─────────────────────────────────────────────────────
  // All MP custom widget API calls go through the CORS-enabled SKY API.
  // Stored procedures handle both reads and writes server-side.
  function getToken() {
    return localStorage.getItem("mpp-widgets_AuthToken");
  }

  async function skyApiCall(spName, params) {
    var qs = "storedProcedure=" + encodeURIComponent(spName);
    if (params) {
      var spParts = [];
      Object.keys(params).forEach(function (key) {
        if (params[key] !== null && params[key] !== undefined) {
          spParts.push("@" + key + "=" + params[key]);
        }
      });
      if (spParts.length > 0) {
        qs += "&spParams=" + encodeURIComponent(spParts.join("&"));
      }
    }
    var token = getToken();
    if (token) {
      qs += "&userData=" + encodeURIComponent(token);
    }
    var res = await fetch(SKY_API + "?" + qs);
    if (!res.ok) {
      var body = await res.text().catch(function () { return ""; });
      throw new Error(spName + " \u2192 " + res.status + ": " + body);
    }
    return res.json();
  }

  // ── Config Load (groups + campus name) ────────────────────────────────
  async function loadConfig() {
    var locId  = getLocationId();
    var params = locId ? { CongregationID: locId } : {};

    var data = await skyApiCall("api_custom_WalkinReg_GetConfig", params);

    // DataSet1: Kids Quest groups for the dropdown
    groups = data.DataSet1 || [];

    // DataSet2: Campus/congregation name for the header
    if (data.DataSet2 && data.DataSet2.length > 0) {
      var el = document.getElementById("location-name");
      if (el) {
        el.textContent = data.DataSet2[0].Congregation_Name;
        el.hidden = false;
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────
  function calculateAge(isoDate) {
    var today = new Date();
    var birth = new Date(isoDate + "T00:00:00"); // local midnight avoids timezone drift
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
    addChildCard(); // first child is always present

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
      '</div>';

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
      childrenData.push({
        firstName: document.getElementById("cf-" + seq).value.trim(),
        lastName:  document.getElementById("cl-" + seq).value.trim(),
        birthdate: document.getElementById("cd-" + seq).value
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

    // If groups haven't loaded yet, show a loading state and poll until ready
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

  // ── MP Registration (via stored proc) ─────────────────────────────────
  async function registerFamily(assignments) {
    var childrenJSON = JSON.stringify(assignments.map(function (a) {
      return {
        firstName: a.firstName,
        lastName:  a.lastName,
        birthdate: a.birthdate,
        groupId:   a.groupId
      };
    }));

    var params = {
      ParentFirstName: parentData.firstName,
      ParentLastName:  parentData.lastName,
      ParentEmail:     parentData.email,
      ParentPhone:     parentData.phone,
      ChildrenJSON:    childrenJSON
    };

    var locId = getLocationId();
    if (locId) params.CongregationID = locId;

    var data = await skyApiCall("api_custom_WalkinReg_CreateFamily", params);

    var result = data.DataSet1 && data.DataSet1[0];
    if (!result || !result.Success) {
      throw new Error(result ? result.Message : "Unexpected response from server");
    }
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
