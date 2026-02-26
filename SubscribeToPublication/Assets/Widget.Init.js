(function () {
  const widgetId = "SubscribeWidget";

  /* ── Wait for the Custom Widget framework to render the template ── */
  window.addEventListener("widgetLoaded", function handler(e) {
    if (e.detail && e.detail.widgetId === widgetId) {
      window.removeEventListener("widgetLoaded", handler);
      initForm();
    }
  });

  /* Also listen on the element itself (some versions fire there) */
  const el = document.getElementById(widgetId);
  if (el) {
    el.addEventListener("widgetLoaded", function () {
      initForm();
    });
  }

  function initForm() {
    const form = document.getElementById("subscribeForm");
    const btn = document.getElementById("subscribeBtn");
    const status = document.getElementById("subscribeStatus");
    const formWrap = document.getElementById("subscribe-form-wrap");
    const successMsg = document.getElementById("subscribe-success");

    if (!form) return;

    /* ── Read config from the widget element's data attributes ── */
    const widget = document.getElementById(widgetId);
    const publicationId = widget?.getAttribute("data-publication-id") || "131";
    const templateId = widget?.getAttribute("data-template-id") || "84102";
    const returnUrl = widget?.getAttribute("data-return-url") || window.location.href;
    const widgetsBase = "https://my.mcleanbible.org/widgets";

    /* ── CSRF token ── */
    async function getCsrfToken() {
      const res = await fetch(widgetsBase + "/Home/CSRFToken", {
        credentials: "omit",
      });
      if (!res.ok) throw new Error("CSRF token failed");
      return (await res.json()).token;
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

    /* ── Form submit ── */
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      status.textContent = "";
      status.className = "";

      const firstName = form.FirstName.value.trim();
      const lastName = form.LastName.value.trim();
      const email = form.EmailAddress.value.trim();

      if (!firstName || !lastName || !email) {
        status.className = "error";
        status.textContent = "Please fill in all fields.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Sending...";

      try {
        const csrfToken = await getCsrfToken();
        const fd = new FormData();
        fd.append("FirstName", firstName);
        fd.append("LastName", lastName);
        fd.append("EmailAddress", email);
        fd.append("PublicationID", publicationId);
        fd.append("VerificationEmailTemplateID", templateId);
        fd.append("ReturnUrl", returnUrl);

        const result = await subscribe(fd, csrfToken);

        if (result.success) {
          formWrap.style.display = "none";
          successMsg.style.display = "block";
        } else {
          throw new Error("API returned failure");
        }
      } catch (err) {
        /* Retry once with fresh CSRF token */
        try {
          const freshToken = await getCsrfToken();
          const fd = new FormData();
          fd.append("FirstName", firstName);
          fd.append("LastName", lastName);
          fd.append("EmailAddress", email);
          fd.append("PublicationID", publicationId);
          fd.append("VerificationEmailTemplateID", templateId);
          fd.append("ReturnUrl", returnUrl);

          const result = await subscribe(fd, freshToken);
          if (result.success) {
            formWrap.style.display = "none";
            successMsg.style.display = "block";
          } else {
            throw new Error("Retry failed");
          }
        } catch (retryErr) {
          status.className = "error";
          status.textContent = "Something went wrong. Please try again.";
          btn.disabled = false;
          btn.textContent = "Subscribe";
        }
      }
    });
  }
})();
