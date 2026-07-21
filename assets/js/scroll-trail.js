/* ==========================================================================
   TWINMARK — scroll trail
   --------------------------------------------------------------------------
   Two scroll-reactive layers (the scroll-driven cousin of beetroot.gr's
   mouse trail):

   · Inside the Static Posts section (#image): work images pop up big, one
     after another, cycling forever in order. They spawn in the side zones,
     away from the scroll line.
   · Everywhere else: brand sparkles (the ✦ from the marquee) twinkle along
     the sides as you travel — small, quick, and cheap to render.

   ── TWEAK ME ─────────────────────────────────────────────────────────────
   IMAGES: leave empty to auto-collect every image in the Static Posts
   gallery (in DOM order) — new work added to the gallery automatically
   joins the trail. Or list explicit paths to override.
   ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    /* The endlessly cycling sequence — add new work here and it joins the
       rotation automatically.                                              */
    IMAGES: [
      "assets/img/work-lizzys-croissants.jpg",
      "assets/img/work-xagk-spirulina.jpg",
      "assets/img/work-lizzys-cherry.jpg",
      "assets/img/work-lousi-lashes.jpg",
      "assets/img/work-lizzys-soda.jpg",
      "assets/img/work-chef-dinner.jpg",
      "assets/img/work-bluedreams.jpg",
      "assets/img/work-coffee-break.jpg",
      "assets/img/work-brunch-poster.png",
      "assets/img/work-wellness-pilates.jpg",
      "assets/img/work-iced-latte.jpg",
      "assets/img/work-3.png",
      "assets/img/work-coffee-quote.jpg",
      "assets/img/work-yumtales-collagen.jpg",
      "assets/img/work-bluedreams-4.png",
      "assets/img/work-coffee-poster.jpg",
      "assets/img/work-greek.jpg"
    ],
    IMG_EVERY: 160,         /* px of scrolling between two images           */
    IMG_LIFETIME: 1.15,     /* seconds an image stays before fading out     */
    IMG_MIN: 290,           /* spawned image width range, px (desktop)      */
    IMG_MAX: 430,
    IMG_MAX_LIVE: 6,
    IDLE_AFTER: 160,        /* ms without scrolling → the newest image is
                               HELD on screen until scrolling resumes       */

    SPARK_EVERY: 150,       /* px of scrolling between sparkles             */
    SPARK_LIFETIME: 0.75,
    SPARK_MIN: 12,          /* sparkle font-size range, px                  */
    SPARK_MAX: 26,
    SPARK_MAX_LIVE: 10,
    SPARK_COLORS: ["#7ACFD6", "#5384B7", "#3B50A3", "#007775"]
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var hasGsap = typeof window.gsap !== "undefined";

  /* Layout-viewport size. window.innerWidth/innerHeight shrink while the
     user pinch-zooms on a phone, which used to scatter spawn positions —
     these stay stable no matter the zoom level.                           */
  function vw() { return document.documentElement.clientWidth; }
  function vh() { return document.documentElement.clientHeight; }

  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;

    var imageSection = document.getElementById("image");
    var imageHead = imageSection ? imageSection.querySelector(".service__head") : null;

    var srcs = CONFIG.IMAGES.length
      ? CONFIG.IMAGES
      : Array.prototype.map.call(
          document.querySelectorAll(".gallery img"),
          function (img) { return img.getAttribute("src"); }
        );

    /* Warm the cache so the first cycle pops without loading hiccups —
       but only once the visitor NEARS the Static Posts section, so the
       ~1.4 MB of work images never weighs down the initial page load.    */
    var warmed = false;
    function warm() {
      if (warmed) return;
      warmed = true;
      srcs.forEach(function (s) { var i = new Image(); i.src = s; });
    }
    if (imageSection && "IntersectionObserver" in window) {
      var wio = new IntersectionObserver(function (entries, obs) {
        var near = entries.some(function (e) { return e.isIntersecting; });
        if (near) { warm(); obs.disconnect(); }
      }, { rootMargin: "1500px 0px" });
      wio.observe(imageSection);
    } else {
      warm();
    }

    var layer = document.createElement("div");
    layer.className = "trail";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    var imgIndex = 0;       /* position in the endlessly cycling sequence  */
    var imgTravel = 0;
    var sparkTravel = 0;
    var lastY = window.scrollY;
    var side = 1;           /* alternate left / right                      */
    var liveImgs = 0;
    var liveSparks = 0;

    var records = [];       /* live image records, oldest → newest         */
    var heldRec = null;     /* image held on screen while scrolling pauses */
    var idleTimer = null;

    /* Is the viewport currently inside the Static Posts stage?
       The zone starts just below the section header (the "02" intro) and
       ends with the section itself — outside it nothing spawns, and the
       scroll handler sweeps away whatever is still on screen.             */
    function inImageZone() {
      if (!imageSection) return false;
      var probe = vh() * 0.55;
      var r = imageSection.getBoundingClientRect();
      var startY = imageHead ? imageHead.getBoundingClientRect().bottom : r.top;
      return startY < probe && r.bottom > probe;
    }

    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      var delta = y - lastY;
      lastY = y;
      var dist = Math.abs(delta);
      if (!dist) return;

      /* Left the stage (either direction) → sweep it clean: every image
         still on screen fades out right away, so nothing lingers over the
         sections before or after Static Posts.                            */
      var inZone = inImageZone();
      if (!inZone && records.length) {
        records.slice().forEach(function (rec) {
          clearTimeout(rec.timer);
          rec.fade();
        });
        heldRec = null;
      }

      /* scrolling again → release the image that was held while idle     */
      if (heldRec) {
        heldRec.fade();
        heldRec = null;
      }

      /* Janitor — on an overloaded phone a fade animation can get starved
         and never finish, leaving artwork stuck on screen; anything still
         on the layer past its deadline is force-removed here.             */
      var nowTs = performance.now();
      Array.prototype.slice.call(layer.children).forEach(function (el) {
        if (el.__zap && el.__zapAt && nowTs > el.__zapAt) el.__zap();
      });

      /* user stopped scrolling → hold the newest image so it can actually
         be looked at; it stays until the next scroll (up OR down)         */
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (!inImageZone()) return;   /* never hold an image outside the stage */
        var newest = records[records.length - 1];
        if (newest && !newest.fading) {
          clearTimeout(newest.timer);
          heldRec = newest;
        }
      }, CONFIG.IDLE_AFTER);

      if (inZone && srcs.length) {
        sparkTravel = 0;
        imgTravel += dist;
        while (imgTravel >= CONFIG.IMG_EVERY) {
          imgTravel -= CONFIG.IMG_EVERY;
          spawnImage(delta >= 0);
        }
      } else {
        imgTravel = 0;
        sparkTravel += dist;
        while (sparkTravel >= CONFIG.SPARK_EVERY) {
          sparkTravel -= CONFIG.SPARK_EVERY;
          spawnSpark(delta >= 0);
        }
      }
    }, { passive: true });

    function rand(min, max) { return min + Math.random() * (max - min); }

    /* Side zones keep both layers clear of the center line               */
    function sideX(extent) {
      side *= -1;
      var xc = side < 0
        ? vw() * rand(0.05, 0.2)
        : vw() * rand(0.8, 0.95);
      return Math.round(
        Math.min(Math.max(xc - extent / 2, 6), vw() - extent - 6)
      );
    }

    function spawnY(el, h, scrollingDown) {
      var yc = vh() * rand(0.32, 0.68)
        + (scrollingDown ? 1 : -1) * vh() * 0.1;
      el.style.top = Math.round(yc - h / 2) + "px";
    }

    /* ------------------------- big work images ----------------------- */
    function spawnImage(scrollingDown) {
      if (liveImgs >= CONFIG.IMG_MAX_LIVE) return;
      liveImgs++;

      var img = document.createElement("img");
      img.className = "trail__img";
      img.decoding = "async";     /* keep image decode off the main thread */
      img.src = srcs[imgIndex % srcs.length];
      imgIndex++;

      var mobile = vw() < 720;
      var w = rand(CONFIG.IMG_MIN, CONFIG.IMG_MAX) * (mobile ? 0.633 : 1);
      /* mobile factor = 0.55 × 1.15 — images run 15% bigger on phones    */
      img.style.width = w + "px";
      img.style.left = sideX(w) + "px";
      spawnY(img, w * 1.2, scrollingDown);

      layer.appendChild(img);

      var rec = { fading: false };
      var doneOnce = false;
      var done = function () {
        if (doneOnce) return;
        doneOnce = true;
        img.remove();
        liveImgs--;
        var at = records.indexOf(rec);
        if (at !== -1) records.splice(at, 1);
        if (heldRec === rec) heldRec = null;
      };

      /* Janitor contract (see the sweep in the scroll handler): if this
         element somehow outlives its deadline — e.g. its fade tween got
         starved on an overloaded phone — it is force-removed, bookkeeping
         included, so stuck artwork can never pile up over the page.      */
      img.__zapAt = performance.now() + CONFIG.IMG_LIFETIME * 1000 + 3000;
      img.__zap = function () {
        if (hasGsap) gsap.killTweensOf(img);
        clearTimeout(rec.timer);
        done();
      };

      var tilt = rand(-10, 10);
      if (hasGsap) {
        gsap.fromTo(img,
          { scale: 0.5, autoAlpha: 0, rotation: tilt * 1.6 },
          { scale: 1, autoAlpha: 1, rotation: tilt, duration: 0.4, ease: "back.out(1.8)" });
        rec.fade = function () {
          if (rec.fading) return;
          rec.fading = true;
          img.__zapAt = performance.now() + 3000;  /* let the fade play   */
          gsap.to(img, {
            autoAlpha: 0, scale: 0.92,
            y: scrollingDown ? 44 : -44,
            duration: 0.45, ease: "power2.in",
            onComplete: done
          });
        };
      } else {
        img.style.transition = "opacity .4s ease, transform .4s ease";
        img.style.transform = "rotate(" + tilt + "deg)";
        img.style.opacity = "1";
        rec.fade = function () {
          if (rec.fading) return;
          rec.fading = true;
          img.__zapAt = performance.now() + 3000;
          img.style.opacity = "0";
          setTimeout(done, 450);
        };
      }

      /* normal life: fade after the lifetime — unless held while idle     */
      rec.timer = setTimeout(rec.fade, CONFIG.IMG_LIFETIME * 1000 + 400);
      records.push(rec);
    }

    /* ----------------------------- sparkles --------------------------- */
    function spawnSpark(scrollingDown) {
      if (liveSparks >= CONFIG.SPARK_MAX_LIVE) return;
      liveSparks++;

      var s = document.createElement("span");
      s.className = "trail__spark";
      s.textContent = "✦";
      var size = rand(CONFIG.SPARK_MIN, CONFIG.SPARK_MAX);
      s.style.fontSize = size + "px";
      s.style.color = CONFIG.SPARK_COLORS[Math.floor(Math.random() * CONFIG.SPARK_COLORS.length)];
      s.style.left = sideX(size) + "px";
      spawnY(s, size, scrollingDown);

      layer.appendChild(s);
      var sparkDone = false;
      var done = function () {
        if (sparkDone) return;
        sparkDone = true;
        s.remove();
        liveSparks--;
      };
      s.__zapAt = performance.now() + CONFIG.SPARK_LIFETIME * 1000 + 3000;
      s.__zap = function () {
        if (hasGsap) gsap.killTweensOf(s);
        done();
      };

      if (hasGsap) {
        gsap.fromTo(s,
          { scale: 0, autoAlpha: 0, rotation: rand(-90, 90) },
          { scale: 1, autoAlpha: 1, rotation: 0, duration: 0.35, ease: "back.out(2)" });
        gsap.to(s, {
          autoAlpha: 0, scale: 0.4,
          y: scrollingDown ? 30 : -30,
          rotation: rand(-60, 60),
          delay: CONFIG.SPARK_LIFETIME, duration: 0.4, ease: "power2.in",
          onComplete: done
        });
      } else {
        cssFallback(s, 0, CONFIG.SPARK_LIFETIME, done);
      }
    }

    function cssFallback(el, tilt, lifetime, done) {
      el.style.transition = "opacity .4s ease, transform .4s ease";
      el.style.transform = "rotate(" + tilt + "deg)";
      el.style.opacity = "1";
      setTimeout(function () {
        el.style.opacity = "0";
        setTimeout(done, 450);
      }, lifetime * 1000 + 400);
    }
  }
})();
