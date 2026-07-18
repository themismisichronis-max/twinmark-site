/* ==========================================================================
   TWINMARK — scroll spine
   --------------------------------------------------------------------------
   Draws the central vertical SVG line through the .journey wrapper and keeps
   its "ink" perfectly in sync with scroll depth (GSAP ScrollTrigger, scrub).
   Scrolling back up reverses the fill seamlessly. Node dots light up and
   content reveals as the line tip passes them.

   ── TWEAK ME ─────────────────────────────────────────────────────────────
   All the numbers you might want to play with live in CONFIG below.
   ========================================================================== */

(function () {
  "use strict";

  var CONFIG = {
    /* Where the line's "tip" sits in the viewport, as a fraction of the
       viewport height (0 = top, 1 = bottom). The fill is scrubbed so the
       drawn tip tracks this horizon while you scroll.                       */
    TIP_ANCHOR: 0.60,

    /* Where content reveals, as a viewport fraction. Slightly below the tip
       feels best; set it equal to TIP_ANCHOR for strict line-sync.          */
    REVEAL_ANCHOR: 0.74,

    /* Scrub smoothing in seconds. `true` = hard-locked to the scrollbar,
       higher numbers = silkier but laggier. 0.6–1 feels premium.            */
    SCRUB: 0.8,

    /* Horizontal clearance (px) kept between the line and the edge of any
       text block or card it travels around. The actual swing is measured
       per block from its real width, so the line NEVER crosses content.   */
    CLEARANCE: 70,
    EDGE_PAD: 16,          /* the line never gets closer than this to the
                              viewport edge                                */

    /* Gap between a node dot and the top of its text block (px), and where
       the line returns to center below the block (px).                     */
    DOT_GAP: 26,
    CLEAR_BELOW: 90,

    /* Reveal animation: distance (px) and duration (s). Elements with
       data-reveal="left" / "right" slide in horizontally from that side.  */
    REVEAL_Y: 36,
    REVEAL_X: 72,
    REVEAL_DURATION: 0.9
  };

  var journey = document.getElementById("journey");
  var svg = document.getElementById("spine");
  if (!journey || !svg) return;

  var trackPath = svg.querySelector(".spine__track");
  var fillPath = svg.querySelector(".spine__fill");
  var anchors = Array.prototype.slice.call(journey.querySelectorAll(".spine-anchor"));

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  /* Static fallback: no GSAP (offline CDN) or reduced motion →
     show everything, draw the line fully, skip all animation.              */
  if (!hasGsap || reducedMotion) {
    buildGeometry();
    fillPath.style.strokeDasharray = "none";
    dots().forEach(function (d) { d.classList.add("is-lit"); });
    return;
  }

  /* Signals CSS that JS reveals are active (hides [data-reveal] initially) */
  document.documentElement.classList.add("js");

  gsap.registerPlugin(ScrollTrigger);

  var drawTween = null;

  /* ------------------------------------------------------------------ *
   *  Geometry — build the path through the anchor points
   * ------------------------------------------------------------------ */

  function dots() {
    return Array.prototype.slice.call(journey.querySelectorAll(".spine-dot"));
  }

  /* Straight runs + big rounded turns (same waypoints, same route):
     · every stretch between waypoints is drawn dead straight, so the line
       can never wave up and down on its way across;
     · every turn is cut with a generous quadratic arc (up to CORNER_R,
       auto-shrunk so neighbouring turns never overlap). The arc's tangents
       match the straight legs on both sides → smooth everywhere, no kinks. */
  var CORNER_R = 120;

  function smoothPath(pts) {
    if (pts.length < 2) return "";

    function dist(a, b) {
      return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    }

    /* drop duplicate points — zero-length legs would break the rounding  */
    var p0 = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var prev = p0[p0.length - 1];
      if (Math.abs(pts[i].x - prev.x) > 0.5 || Math.abs(pts[i].y - prev.y) > 0.5) {
        p0.push(pts[i]);
      }
    }

    /* Drop waypoints that barely bend the route (within 12px of the
       straight line between their neighbours). Such micro-jogs create a
       pair of stubby legs that clamp the corner radius to almost nothing
       — they render as a sharp kink instead of a big smooth turn.        */
    var p = [p0[0]];
    for (var k = 1; k < p0.length - 1; k++) {
      var A = p[p.length - 1], B = p0[k], C = p0[k + 1];
      var vx = C.x - A.x, vy = C.y - A.y;
      var vlen = Math.sqrt(vx * vx + vy * vy) || 1;
      var dPerp = Math.abs((B.x - A.x) * vy - (B.y - A.y) * vx) / vlen;
      if (dPerp > 12) p.push(B);
    }
    p.push(p0[p0.length - 1]);
    if (p.length < 2) return "M " + p[0].x + " " + p[0].y;

    var d = "M " + p[0].x + " " + p[0].y;
    for (var j = 1; j < p.length - 1; j++) {
      var a = p[j - 1], v = p[j], c = p[j + 1];
      var lenIn = dist(a, v);
      var lenOut = dist(v, c);
      /* half of each leg keeps this arc clear of the neighbouring ones   */
      var r = Math.min(CORNER_R, lenIn / 2, lenOut / 2);
      var t1 = 1 - r / lenIn;
      var t2 = r / lenOut;
      var ax = a.x + (v.x - a.x) * t1;
      var ay = a.y + (v.y - a.y) * t1;
      var bx = v.x + (c.x - v.x) * t2;
      var by = v.y + (c.y - v.y) * t2;
      d += " L " + ax + " " + ay +
           " Q " + v.x + " " + v.y + ", " + bx + " " + by;
    }
    var last = p[p.length - 1];
    d += " L " + last.x + " " + last.y;
    return d;
  }

  function buildGeometry() {
    var W = journey.offsetWidth;
    var jTop = journey.getBoundingClientRect().top + window.scrollY;

    /* The line always runs down the CENTER channel and swings out around
       every block it meets — never across, never behind.                   */
    var cx = W / 2;

    /* Desktop's bigger blocks + big 120px turn arcs need more clearance
       around cards; mobile's tight serpentine keeps the original gaps
       (44px ones would eat the 56px row gap between alternating cards).  */
    var desktop = W >= 1200;
    var AV_GAP = desktop ? 44 : 24;     /* above / below bypassed cards   */
    var SIDE_GAP = desktop ? 48 : 34;   /* beside bypassed cards          */
    var RETURN_MARGIN = desktop ? 40 : 14; /* return turn vs card below   */

    /* Reveal animations hold elements translated while we measure —
       compensate, or every swing is computed from a shifted box. The
       offset is read from the RENDERED transform matrix (not from gsap's
       cached value, which can disagree with what is actually painted and
       used to shift boxes by the full reveal distance).                   */
    function rectOf(el) {
      var r = el.getBoundingClientRect();
      var ox = 0, oy = 0;
      var t = getComputedStyle(el).transform;
      if (t && t !== "none") {
        var m2 = t.match(/^matrix\(([^)]+)\)/);
        var m3 = t.match(/^matrix3d\(([^)]+)\)/);
        if (m2) {
          var v = m2[1].split(",");
          ox = parseFloat(v[4]) || 0;
          oy = parseFloat(v[5]) || 0;
        } else if (m3) {
          var v3 = m3[1].split(",");
          ox = parseFloat(v3[12]) || 0;
          oy = parseFloat(v3[13]) || 0;
        }
      }
      return {
        left: r.left - ox,
        right: r.right - ox,
        width: r.width,
        height: r.height,
        top: r.top - oy + window.scrollY - jTop,
        bottom: r.bottom - oy + window.scrollY - jTop
      };
    }

    /* TEXT blocks (spine anchors): node dot above the block → travel down
       BESIDE the whole block → back to center below it. The swing is
       measured from the block's real width so words never sit on the line. */
    var events = anchors.map(function (a) {
      var r = rectOf(a.parentElement);
      return {
        kind: a.hasAttribute("data-end") ? "end" : "text",
        dot: !a.hasAttribute("data-nodot") || a.hasAttribute("data-end"),
        swing: a.getAttribute("data-swing"),   /* "left"/"right" overrides
                                                  the side alternation     */
        top: r.top,
        bottom: r.bottom,
        halfW: r.width / 2
      };
    });

    /* The "keep scrolling" hint pill also gets routed around              */
    var hint = journey.querySelector(".trail-stage__hint");
    if (hint) {
      var hr = rectOf(hint);
      events.push({
        kind: "text",
        dot: false,
        top: hr.top,
        bottom: hr.bottom,
        halfW: hr.width / 2
      });
    }

    /* MEDIA blocks (videos, browser frame, feature list). Two roles:
       · obstacles[] — every card, so text-block detours can clamp their
         return-to-center diagonal above the next card below them;
       · avoid events — when a card reaches into the center corridor, the
         line passes it fully on its OPEN side, never through it.          */
    var obstacles = [];
    var avoidEls = journey.querySelectorAll(
      '.phone, .webshow .browser, .webshow__points'
    );
    Array.prototype.forEach.call(avoidEls, function (el) {
      var r = rectOf(el);
      obstacles.push(r);
      /* card clear of the center corridor → nothing to dodge              */
      if (r.right < cx - 40 || r.left > cx + 40) return;
      /* pass on whichever side has more open space                        */
      var passRight = (W - r.right) >= r.left;
      var ax = passRight
        ? Math.min(r.right + SIDE_GAP, W - CONFIG.EDGE_PAD)
        : Math.max(r.left - SIDE_GAP, CONFIG.EDGE_PAD);
      events.push({
        kind: "avoid",
        x: ax,
        top: r.top,
        bottom: r.bottom
      });
    });

    /* Top of the first card below `y` whose box the segment from x1→x2
       would cross — used to finish detours BEFORE reaching that card.     */
    function obstacleTopBelow(y, x1, x2) {
      var lo = Math.min(x1, x2) - 20, hi = Math.max(x1, x2) + 20;
      var best = Infinity;
      obstacles.forEach(function (r) {
        if (r.top > y - 8 && r.top < best && r.right > lo && r.left < hi) {
          best = r.top;
        }
      });
      return best;
    }

    /* Bottom of the last card ABOVE `y` in the swing corridor — the line
       stays centered until it has fully passed that card, THEN swings.    */
    function obstacleBottomAbove(y, x1, x2) {
      var lo = Math.min(x1, x2) - 20, hi = Math.max(x1, x2) + 20;
      var best = -Infinity;
      obstacles.forEach(function (r) {
        if (r.bottom < y && r.bottom > best && r.right > lo && r.left < hi) {
          best = r.bottom;
        }
      });
      return best;
    }

    events.sort(function (a, b) { return a.top - b.top; });
    if (!events.length) return;

    var pts = [{ x: cx, y: 0 }];
    var nodes = [];
    var textIndex = 0;

    /* Points must always move DOWN the page — this guard makes loops and
       self-crossings impossible, whatever the layout does. A point that
       arrives too early is nudged down instead of dropped, so the path
       never loses a routing waypoint (dropping one sends the line on a
       straight diagonal through whatever the waypoint was avoiding).      */
    function pushPt(x, y) {
      var last = pts[pts.length - 1];
      if (y < last.y + 16) {
        if (x === last.x) return;          /* same column → nothing to add */
        y = last.y + 16;
      }
      pts.push({ x: x, y: y });
    }

    /* Keep the line vertical through long empty stretches instead of
       drifting diagonally toward the next block.                           */
    function approach(b) {
      var last = pts[pts.length - 1];
      if (b.top - last.y > 500) pushPt(cx, b.top - 240);
    }

    events.forEach(function (b, i) {
      var next = events[i + 1];
      approach(b);

      if (b.kind === "end") {
        var endY = b.top + 60;                   /* terminal node           */
        pushPt(cx, endY);
        nodes.push({ x: cx, y: pts[pts.length - 1].y, dot: true });
        return;
      }

      if (b.kind === "avoid") {
        /* pass fully BESIDE the card — enter above it, leave below it.
           On desktop AV_GAP is 44: the rounded turn into the side lane
           arcs back toward the card, and less clearance clips its corner */
        pushPt(b.x, b.top - AV_GAP);
        pushPt(b.x, b.bottom + AV_GAP);
        /* sweep straight across to the next card's side (the user-drawn
           snake) — only return to center before a distant/none-card event.
           If the bypass lane is already near-center, stay in it: a jog of
           a few px to the exact center just renders as a sharp notch.     */
        if ((!next || next.kind !== "avoid" || next.top - b.bottom > 260) &&
            Math.abs(b.x - cx) > 48) {
          pushPt(cx, b.bottom + 60);
        }
        return;
      }

      /* text block — swing wide enough to clear its measured width        */
      var dir = b.swing === "left" ? -1
              : b.swing === "right" ? 1
              : (textIndex % 2 === 0 ? 1 : -1);  /* alternate the side      */
      textIndex++;
      var tx = cx + dir * Math.min(b.halfW + CONFIG.CLEARANCE,
                                   W / 2 - CONFIG.EDGE_PAD);

      /* stay centered until any card above is fully passed, THEN swing.
         When the line already travels a near-center lane, keep that lane
         for the wait point — snapping to the exact center draws a notch. */
      var entryRefY = b.dot ? b.top - CONFIG.DOT_GAP : b.top - 36;
      var blocker = obstacleBottomAbove(entryRefY, tx, cx);
      if (isFinite(blocker)) {
        var lastX = pts[pts.length - 1].x;
        var waitX = Math.abs(lastX - cx) <= 48 ? lastX : cx;
        pushPt(waitX, Math.min(blocker + 14, entryRefY - 20));
      }

      /* the return diagonal must finish ABOVE whatever card sits below.
         An upcoming avoid-card needs extra room so its own entry point
         (top-24) still lands below the return.                            */
      var returnY = Math.min(
        b.bottom + CONFIG.CLEAR_BELOW,
        next ? (next.kind === "avoid" ? next.top - 64 : next.top - 60)
             : b.bottom + CONFIG.CLEAR_BELOW,
        /* desktop margin 40 (not less): the return turn's arc reaches
           ~this far back DOWN toward the card below — tighter margins
           clip its corner                                                */
        obstacleTopBelow(b.top, tx, cx) - RETURN_MARGIN
      );

      if (b.dot) {
        /* centered node dot above, then travel the block's FULL height
           beside it — the diagonals only cross the block's empty top
           padding, never the words                                        */
        pushPt(cx, b.top - CONFIG.DOT_GAP);
        nodes.push({ x: cx, y: pts[pts.length - 1].y, dot: true });
        pushPt(tx, b.top + 20);
        /* +28 (not less): the exit turn's arc reaches ~this far back UP
           the lane — less clearance lets it nick the block's bottom edge */
        pushPt(tx, b.bottom + 28);
      } else {
        /* pass fully BESIDE the block — the line never enters the text
           column, so it can't cross the words or badge. The side lane
           NEVER ends above the block's bottom (even when a card sits
           close below), so the exit diagonal always crosses under the
           text, not through its last line.                                */
        pushPt(tx, b.top - 36);
        pushPt(tx, Math.max(b.bottom + 44, Math.min(b.bottom + 56, returnY - 18)));
      }

      /* If the next card gets bypassed on this SAME side, don't dart back
         to center and out again (an ugly hairpin) — flow straight down
         the side into the card's bypass. Otherwise return to center.      */
      var flowsOn = next && next.kind === "avoid" &&
                    (next.x - cx) * (tx - cx) > 0 &&
                    next.top - b.bottom < 320;
      if (!flowsOn) pushPt(cx, returnY);
    });

    var H = pts[pts.length - 1].y;   /* the line ends at the last node     */

    var d = smoothPath(pts);

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.style.height = H + "px";
    trackPath.setAttribute("d", d);
    fillPath.setAttribute("d", d);

    /* Corner rounding can pull the curve a few px inside a waypoint, so
       each dot is snapped onto the nearest point of the DRAWN path — the
       dot always sits exactly on the line, at every viewport size.        */
    function snapToPath(n) {
      var total = trackPath.getTotalLength();
      if (!total) return n;
      var step = Math.max(total / 500, 4);
      var bestL = 0, bestD = Infinity, L, p, dx, dy, d2;
      for (L = 0; L <= total; L += step) {
        p = trackPath.getPointAtLength(L);
        dx = p.x - n.x; dy = p.y - n.y; d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; bestL = L; }
      }
      var lo = Math.max(0, bestL - step), hi = Math.min(total, bestL + step);
      for (L = lo; L <= hi; L += 1) {
        p = trackPath.getPointAtLength(L);
        dx = p.x - n.x; dy = p.y - n.y; d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; bestL = L; }
      }
      return trackPath.getPointAtLength(bestL);
    }

    /* (Re)create the node dots — only where wanted (the numbered service
       badges are their own markers, so those anchors carry data-nodot).   */
    dots().forEach(function (el) { el.remove(); });
    nodes.forEach(function (n) {
      if (!n.dot) return;
      var pos = snapToPath(n);
      var dot = document.createElement("span");
      dot.className = "spine-dot";
      dot.style.left = pos.x + "px";
      dot.style.top = pos.y + "px";
      journey.appendChild(dot);
    });

    return nodes;
  }

  /* Anchors that own a visible dot, in document order (matches dots())    */
  var dotAnchors = anchors.filter(function (a) {
    return !a.hasAttribute("data-nodot") || a.hasAttribute("data-end");
  });

  /* ------------------------------------------------------------------ *
   *  Scroll-synced drawing
   * ------------------------------------------------------------------ */

  function initDraw() {
    var length = fillPath.getTotalLength();

    fillPath.style.strokeDasharray = length;
    fillPath.style.strokeDashoffset = length;

    /* The fill is scrubbed across the SVG itself (which ends at the last
       node, i.e. where the services end): drawing starts when its top
       crosses the TIP_ANCHOR horizon and completes when its bottom does —
       so the tip visually rides that horizon, forwards AND backwards.      */
    drawTween = gsap.to(fillPath, {
      strokeDashoffset: 0,
      ease: "none",
      scrollTrigger: {
        trigger: svg,
        start: "top " + CONFIG.TIP_ANCHOR * 100 + "%",
        end: "bottom " + CONFIG.TIP_ANCHOR * 100 + "%",
        scrub: CONFIG.SCRUB,
        invalidateOnRefresh: true
      }
    });

    /* Light each node dot exactly when the tip horizon reaches it         */
    dotAnchors.forEach(function (a, i) {
      ScrollTrigger.create({
        trigger: a,
        start: "top " + CONFIG.TIP_ANCHOR * 100 + "%",
        onEnter: function () { lightDot(i, true); },
        onLeaveBack: function () { lightDot(i, false); }
      });
    });
  }

  function lightDot(index, on) {
    var all = dots();
    if (all[index]) all[index].classList.toggle("is-lit", on);
  }

  /* ------------------------------------------------------------------ *
   *  Content reveals — fade/slide in as the line passes
   * ------------------------------------------------------------------ */

  function initReveals() {
    gsap.utils.toArray("[data-reveal]").forEach(function (el) {
      /* data-reveal="left"|"right" → slide in from that side;
         plain data-reveal → rise up.                                       */
      var side = el.getAttribute("data-reveal");
      var fromVars = { autoAlpha: 0 };
      if (side === "left")       { fromVars.x = -CONFIG.REVEAL_X; }
      else if (side === "right") { fromVars.x =  CONFIG.REVEAL_X; }
      else                       { fromVars.y =  CONFIG.REVEAL_Y; }

      gsap.fromTo(el, fromVars,
        {
          x: 0,
          y: 0,
          autoAlpha: 1,
          duration: CONFIG.REVEAL_DURATION,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top " + CONFIG.REVEAL_ANCHOR * 100 + "%",
            /* play on the way down, reverse when scrolling back up        */
            toggleActions: "play none none reverse"
          }
        });
    });

    /* Hero entrance (not scroll-bound — it's above the journey)           */
    gsap.fromTo("[data-hero-reveal]",
      { y: 28, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.9, ease: "power3.out", stagger: 0.12, delay: 0.15 });
  }

  /* ------------------------------------------------------------------ *
   *  Rebuild on resize / late layout shifts (images, fonts)
   * ------------------------------------------------------------------ */

  function rebuild() {
    if (drawTween) {
      if (drawTween.scrollTrigger) drawTween.scrollTrigger.kill();
      drawTween.kill();
      drawTween = null;
    }
    buildGeometry();

    var length = fillPath.getTotalLength();
    fillPath.style.strokeDasharray = length;
    fillPath.style.strokeDashoffset = length;

    drawTween = gsap.to(fillPath, {
      strokeDashoffset: 0,
      ease: "none",
      scrollTrigger: {
        trigger: svg,
        start: "top " + CONFIG.TIP_ANCHOR * 100 + "%",
        end: "bottom " + CONFIG.TIP_ANCHOR * 100 + "%",
        scrub: CONFIG.SCRUB,
        invalidateOnRefresh: true
      }
    });

    ScrollTrigger.refresh();

    /* Jump the fill straight to the correct progress — otherwise it would
       visibly re-sweep from the top after every rebuild.                   */
    var st = drawTween.scrollTrigger;
    if (st) {
      gsap.set(fillPath, { strokeDashoffset: length * (1 - st.progress) });
    }
  }

  /* The layout viewport width — unlike window.innerWidth it does NOT
     change while the user pinch-zooms on a phone, so zooming can never
     trigger a rebuild (which used to shift the line and jump the scroll
     position mid-zoom).                                                   */
  function layoutW() { return document.documentElement.clientWidth; }

  var resizeTimer = null;
  var lastW = layoutW();
  window.addEventListener("resize", function () {
    if (layoutW() === lastW) return; /* URL-bar jumps & pinch-zoom: ignore */
    lastW = layoutW();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 250);
  }, { passive: true });

  /* Journey height changes (lazy images etc.) → keep geometry honest      */
  var lastH = 0;
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function (entries) {
      var h = entries[0].contentRect.height;
      if (Math.abs(h - lastH) > 60) {
        lastH = h;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(rebuild, 300);
      }
    });
    ro.observe(journey);
  }

  /* ------------------------------------------------------------------ *
   *  Boot
   * ------------------------------------------------------------------ */

  buildGeometry();
  initDraw();
  initReveals();

  /* Re-measure once everything (fonts, posters, images) has loaded        */
  window.addEventListener("load", function () {
    lastH = journey.offsetHeight;
    rebuild();
  });
})();
