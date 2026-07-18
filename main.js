/* ==========================================================================
   TWINMARK — page interactions
   Navbar state, mobile menu, lazy video playback, hero counters and the
   multi-step contact wizard.
   ========================================================================== */

(function () {
  "use strict";

  /* Where the contact form is delivered.
     1) FORM_ENDPOINT — paste a Formspree endpoint here (create a free form
        at formspree.io → it looks like "https://formspree.io/f/abcdwxyz")
        and briefs arrive in your inbox with zero backend work.
     2) While FORM_ENDPOINT is empty, the form falls back to opening the
        visitor's email app pre-filled (mailto) — set CONTACT_EMAIL.       */
  var FORM_ENDPOINT = "https://formspree.io/f/xnjednyq";
  var CONTACT_EMAIL = "hello@twinmark.gr";

  /* ------------------------------------------------------------------ *
   *  Navbar — glass on scroll + section highlighting + mobile menu
   * ------------------------------------------------------------------ */

  var nav = document.getElementById("nav");
  var burger = document.getElementById("navBurger");

  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("menu-open");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* close the mobile menu after choosing a destination */
  nav.querySelectorAll(".nav__links a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("menu-open");
      burger.setAttribute("aria-expanded", "false");
    });
  });

  /* Smooth in-page scrolling (JS instead of CSS scroll-behavior, which
     interferes with ScrollTrigger).                                        */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  /* ------------------------------------------------------------------ *
   *  Hero fog — the blueish orbs gently follow the cursor
   * ------------------------------------------------------------------ */

  var orbs = document.querySelectorAll(".hero__orb");
  var fineMouse = window.matchMedia("(pointer: fine)").matches;
  var noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (orbs.length && fineMouse && !noMotion && typeof gsap !== "undefined") {
    /* quickTo gives buttery, lag-smoothed movement; each orb gets its own
       speed + travel factor so the fog feels layered, not glued on.       */
    var followers = Array.prototype.map.call(orbs, function (orb, i) {
      var duration = 1.4 + i * 0.6;   /* deeper layer drifts slower       */
      return {
        x: gsap.quickTo(orb, "x", { duration: duration, ease: "power3.out" }),
        y: gsap.quickTo(orb, "y", { duration: duration, ease: "power3.out" }),
        factor: i === 0 ? 0.22 : 0.12 /* px of travel per px of cursor    */
      };
    });

    window.addEventListener("mousemove", function (e) {
      var dx = e.clientX - window.innerWidth / 2;
      var dy = e.clientY - window.innerHeight / 2;
      followers.forEach(function (f) {
        f.x(dx * f.factor);
        f.y(dy * f.factor);
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   *  Cursor fog — a blue circular glow that follows the mouse (or the
   *  finger) across the white background of the WHOLE site. It lives at
   *  z-index -1, so all content paints on top of it.
   * ------------------------------------------------------------------ */

  if (!noMotion) {
    var fog = document.createElement("div");
    fog.className = "cursor-fog";
    fog.setAttribute("aria-hidden", "true");
    document.body.appendChild(fog);

    var fogX, fogY;
    if (typeof gsap !== "undefined") {
      fogX = gsap.quickTo(fog, "x", { duration: 0.6, ease: "power3.out" });
      fogY = gsap.quickTo(fog, "y", { duration: 0.6, ease: "power3.out" });
    } else {
      fogX = function (v) { fog.style.left = v + "px"; };
      fogY = function (v) { fog.style.top = v + "px"; };
    }

    var moveFog = function (x, y) {
      fog.classList.add("is-on");
      fogX(x);
      fogY(y);
    };

    window.addEventListener("pointermove", function (e) {
      moveFog(e.clientX, e.clientY);
    }, { passive: true });

    /* touch scrolling cancels pointer events — track the finger directly */
    window.addEventListener("touchmove", function (e) {
      if (e.touches.length) {
        moveFog(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", function () {
      fog.classList.remove("is-on");
    });
  }

  /* ------------------------------------------------------------------ *
   *  Videos — play only while on screen (battery + bandwidth friendly)
   * ------------------------------------------------------------------ */

  var videos = document.querySelectorAll(".phone__screen video");
  if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var v = entry.target;
        if (entry.intersectionRatio >= 0.35) {
          v.play().catch(function () { /* autoplay blocked — poster stays */ });
        } else {
          v.pause();
        }
      });
    }, { threshold: [0, 0.35] });
    videos.forEach(function (v) { vio.observe(v); });
  } else {
    videos.forEach(function (v) { v.play().catch(function () {}); });
  }

  /* ------------------------------------------------------------------ *
   *  Live-site embed — keep the 1280px-wide iframe scaled to its frame
   * ------------------------------------------------------------------ */

  var frameViewport = document.querySelector(".browser__viewport");
  if (frameViewport) {
    var scaleFrame = function () {
      frameViewport.style.setProperty("--frame-scale", frameViewport.clientWidth / 1280);
    };
    if ("ResizeObserver" in window) {
      new ResizeObserver(scaleFrame).observe(frameViewport);
    } else {
      window.addEventListener("resize", scaleFrame, { passive: true });
    }
    scaleFrame();
  }

  /* ------------------------------------------------------------------ *
   *  Hero counters
   * ------------------------------------------------------------------ */

  function animateCounters() {
    document.querySelectorAll("[data-count]").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      var suffix = el.getAttribute("data-count-suffix") || "";
      var format = function (n) {
        return n >= 1000
          ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K"
          : String(n);
      };

      if (typeof gsap === "undefined") {
        el.textContent = format(target) + suffix;
        return;
      }
      var proxy = { n: 0 };
      gsap.to(proxy, {
        n: target,
        duration: 1.6,
        delay: 0.5,
        ease: "power2.out",
        onUpdate: function () {
          el.textContent = format(Math.round(proxy.n)) + suffix;
        }
      });
    });
  }
  animateCounters();

  /* ------------------------------------------------------------------ *
   *  Contact wizard
   * ------------------------------------------------------------------ */

  var wizard = document.getElementById("wizard");
  if (!wizard) return;

  var steps = Array.prototype.slice.call(wizard.querySelectorAll(".wizard__step"));
  var stepsNav = Array.prototype.slice.call(document.querySelectorAll("#wizardStepsNav li"));
  var progress = document.getElementById("wizardProgress");
  var btnBack = document.getElementById("wizardBack");
  var btnNext = document.getElementById("wizardNext");
  var controls = document.getElementById("wizardControls");
  var successBox = document.getElementById("wizardSuccess");
  var summary = document.getElementById("wizardSummary");

  var current = 0; /* zero-based step index */

  /* chip groups: multi-select for services, single-select for budget      */
  wizard.querySelectorAll(".chips").forEach(function (group) {
    var single = group.classList.contains("chips--single");
    group.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      if (single) {
        group.querySelectorAll(".chip").forEach(function (c) {
          c.classList.toggle("is-selected", c === chip);
        });
      } else {
        chip.classList.toggle("is-selected");
      }
    });
  });

  function selectedChips(stepEl) {
    return Array.prototype.slice
      .call(stepEl.querySelectorAll(".chip.is-selected"))
      .map(function (c) { return c.getAttribute("data-value"); });
  }

  function validateStep(index) {
    var stepEl = steps[index];
    var ok = true;
    stepEl.querySelectorAll("input[required]").forEach(function (input) {
      var valid = input.value.trim().length > 1;
      input.classList.toggle("is-invalid", !valid);
      if (!valid) ok = false;
    });
    return ok;
  }

  function collectBrief() {
    return {
      name: document.getElementById("fName").value.trim(),
      business: document.getElementById("fBusiness").value.trim(),
      handle: document.getElementById("fInsta").value.trim(),
      services: selectedChips(steps[1]),
      budget: selectedChips(steps[2])[0] || "—",
      contact: document.getElementById("fEmail").value.trim(),
      message: document.getElementById("fMsg").value.trim()
    };
  }

  function renderSummary() {
    var b = collectBrief();
    var parts = [];
    if (b.business) parts.push("<b>" + escapeHtml(b.business) + "</b>");
    if (b.services.length) parts.push(escapeHtml(b.services.join(" · ")));
    if (b.budget && b.budget !== "—") parts.push(escapeHtml(b.budget) + " / month");
    summary.innerHTML = parts.length
      ? "Your brief: " + parts.join(" — ")
      : "";
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function goTo(index) {
    current = index;
    steps.forEach(function (s, i) { s.classList.toggle("is-active", i === index); });
    stepsNav.forEach(function (li, i) {
      li.classList.toggle("is-active", i === index);
      li.classList.toggle("is-done", i < index);
    });
    progress.style.width = ((index + 1) / steps.length) * 100 + "%";
    btnBack.disabled = index === 0;
    btnNext.textContent = index === steps.length - 1 ? "Send it ✦" : "Next →";
    if (index === steps.length - 1) renderSummary();
  }

  btnBack.addEventListener("click", function () {
    if (current > 0) goTo(current - 1);
  });

  btnNext.addEventListener("click", function () {
    if (!validateStep(current)) return;
    if (current < steps.length - 1) {
      goTo(current + 1);
    } else {
      submitBrief();
    }
  });

  /* Enter key advances (unless typing in the textarea) */
  wizard.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      btnNext.click();
    }
  });

  function showSuccess() {
    steps.forEach(function (s) { s.classList.remove("is-active"); });
    document.getElementById("wizardStepsNav").style.display = "none";
    controls.style.display = "none";
    progress.style.width = "100%";
    successBox.hidden = false;
  }

  function submitBrief() {
    var b = collectBrief();

    if (FORM_ENDPOINT) {
      /* Real delivery: POST the brief to the form service. */
      btnNext.disabled = true;
      btnNext.textContent = "Sending…";
      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          name: b.name,
          business: b.business,
          handle: b.handle || "—",
          services: b.services.join(", ") || "—",
          budget: b.budget,
          contact: b.contact,
          message: b.message || "—",
          _subject: "Project brief — " + (b.business || b.name)
        })
      }).then(function (res) {
        if (!res.ok) throw new Error("send failed");
        showSuccess();
      }).catch(function () {
        btnNext.disabled = false;
        btnNext.textContent = "Try again ✦";
        summary.innerHTML = "Something went wrong sending your brief — " +
          "please try again, or email us directly at <b>" + CONTACT_EMAIL + "</b>.";
      });
      return;
    }

    /* Fallback while no endpoint is configured: open the visitor's email
       app pre-filled with the brief.                                      */
    var bodyLines = [
      "New project brief — TWINMARK site",
      "----------------------------------",
      "Name:      " + b.name,
      "Business:  " + b.business,
      "Handle:    " + (b.handle || "—"),
      "Services:  " + (b.services.join(", ") || "—"),
      "Budget:    " + b.budget,
      "Contact:   " + b.contact,
      "",
      b.message ? "Message:\n" + b.message : ""
    ];
    var mailto = "mailto:" + CONTACT_EMAIL +
      "?subject=" + encodeURIComponent("Project brief — " + (b.business || b.name)) +
      "&body=" + encodeURIComponent(bodyLines.join("\n"));

    showSuccess();
    window.location.href = mailto;
  }

  goTo(0);

  /* footer year */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
