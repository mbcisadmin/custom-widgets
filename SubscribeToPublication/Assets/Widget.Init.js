(function () {
  const widgetsBase = "https://my.mcleanbible.org/widgets";

  /* ── Self-initialize: run when DOM is ready ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    const form = document.getElementById("subscribeForm");
    const btn = document.getElementById("subscribeBtn");
    const status = document.getElementById("subscribeStatus");
    const formWrap = document.getElementById("subscribe-form-wrap");
    const successMsg = document.getElementById("subscribe-success");

    if (!form) return;

    /* ── Step 2: Handle email confirmation return ── */
    /* MP's email links back to this page with ?mpp-verify-id=<token>  */
    /* We must call VerifyEmailLink to actually complete the subscription */
    var verifyId = new URLSearchParams(window.location.search).get("mpp-verify-id");
    if (verifyId) {
      verifyEmailLink(verifyId);
      return; /* Don't set up the form — we're in verification mode */
    }

    /* ── CSRF token ── */
    async function getCsrfToken() {
      const res = await fetch(widgetsBase + "/Home/CSRFToken", {
        credentials: "omit",
      });
      if (!res.ok) throw new Error("CSRF token failed");
      return (await res.json()).token;
    }

    /* ── Verify the email confirmation link (completes subscription) ── */
    async function verifyEmailLink(token) {
      showThankYou(); /* Show immediately while we verify */
      try {
        var res = await fetch(
          widgetsBase + "/Api/SubscriptionsApi/VerifyEmailLink?mppVerifyId=" + encodeURIComponent(token),
          { credentials: "omit" }
        );
        var result = await res.json();
        if (!result.success) {
          console.warn("Subscription verification response:", result);
        }
      } catch (err) {
        console.error("Subscription verification error:", err);
      }
    }

    /* ── Subscribe API call ── */
    async function subscribe(fd, csrfToken) {
      const res = await fetch(
        widgetsBase + "/Api/SubscriptionsApi/SendVerificationEmail",
        {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: fd,
          credentials: "omit",
        }
      );
      if (!res.ok) throw new Error("Server error: " + res.status);
      return res.json();
    }

    /* ── Build FormData from the form ── */
    function buildFormData(firstName, lastName, email) {
      var fd = new FormData();
      fd.append("FirstName", firstName);
      fd.append("LastName", lastName);
      fd.append("EmailAddress", email);
      fd.append("PublicationID", form.PublicationID.value);
      fd.append("VerificationEmailTemplateID", form.VerificationEmailTemplateID.value);
      fd.append("ReturnUrl", form.ReturnUrl.value || window.location.href);
      return fd;
    }

    /* ── Show thank-you section ── */
    function showThankYou() {
      formWrap.style.display = "none";
      var thankyou = document.getElementById("thankyou");
      if (thankyou) {
        thankyou.style.display = "block";
      } else {
        successMsg.style.display = "block";
      }
    }

    /* ── Show "check your email" message after initial submit ── */
    function showCheckEmail() {
      formWrap.style.display = "none";
      successMsg.style.display = "block";
    }

    /* ── Form submit ── */
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      status.textContent = "";
      status.className = "";

      var firstName = form.FirstName.value.trim();
      var lastName = form.LastName.value.trim();
      var email = form.EmailAddress.value.trim();

      if (!firstName || !lastName || !email) {
        status.className = "subscribe-error";
        status.textContent = "Please fill in all fields.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Sending...";

      try {
        var csrfToken = await getCsrfToken();
        var result = await subscribe(buildFormData(firstName, lastName, email), csrfToken);

        if (result.success) {
          showCheckEmail();
        } else {
          throw new Error("API returned failure");
        }
      } catch (err) {
        /* Retry once with fresh CSRF token */
        try {
          var freshToken = await getCsrfToken();
          var retryResult = await subscribe(buildFormData(firstName, lastName, email), freshToken);
          if (retryResult.success) {
            showCheckEmail();
          } else {
            throw new Error("Retry failed");
          }
        } catch (retryErr) {
          status.className = "subscribe-error";
          status.textContent = "Something went wrong. Please try again.";
          btn.disabled = false;
          btn.textContent = "Subscribe";
        }
      }
    });
  }
})();
