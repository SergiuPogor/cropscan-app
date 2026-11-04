(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Homography: map the 300x400 page onto 4 corners ---------- */
  function adj(m) {
    return [
      m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
      m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
      m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]
    ];
  }
  function mulMM(a, b) {
    var c = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var s = 0;
      for (var k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = s;
    }
    return c;
  }
  function mulMV(m, v) {
    return [
      m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
      m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
      m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
  }
  function basis(p) {
    var m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
    var v = mulMV(adj(m), [p[3][0], p[3][1], 1]);
    return mulMM(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  }
  function projection(src, dst) {
    var t = mulMM(basis(dst), adj(basis(src)));
    for (var i = 0; i < 9; i++) t[i] = t[i] / t[8];
    return t;
  }

  /* ---------- Scan demo ---------- */
  var stage = document.getElementById("stage");
  if (stage) {
    var doc = document.getElementById("doc");
    var quad = document.getElementById("quad");
    var shadow = document.getElementById("shadow");
    var handles = Array.prototype.slice.call(stage.querySelectorAll(".handle"));
    var flattenBtn = document.getElementById("flatten");
    var status = document.getElementById("status");
    var stampText = document.getElementById("stampText");
    var loupe = document.getElementById("loupe");
    var loupeInner = document.getElementById("loupeInner");

    var PW = 300, PH = 400;
    var SRC = [[0, 0], [PW, 0], [PW, PH], [0, PH]];
    var poses = [
      [[0.20, 0.13], [0.81, 0.08], [0.89, 0.83], [0.11, 0.90]],
      [[0.14, 0.18], [0.74, 0.11], [0.86, 0.88], [0.18, 0.92]],
      [[0.24, 0.09], [0.86, 0.17], [0.80, 0.93], [0.09, 0.82]]
    ];
    var poseIndex = 0;
    var corners = clone(poses[0]); // fractions of the stage
    var flat = false;
    var anim = null;

    function clone(c) { return c.map(function (p) { return [p[0], p[1]]; }); }
    function size() { return [stage.clientWidth, stage.clientHeight]; }

    function flatTarget() {
      var s = size();
      var h = s[1] * 0.78, w = h * PW / PH;
      if (w > s[0] * 0.8) { w = s[0] * 0.8; h = w * PH / PW; }
      var x = (s[0] - w) / 2 / s[0], y = ((s[1] - h) / 2 + s[1] * 0.04) / s[1];
      var x2 = x + w / s[0], y2 = y + h / s[1];
      return [[x, y], [x2, y], [x2, y2], [x, y2]];
    }

    function render() {
      var s = size();
      var px = corners.map(function (p) { return [p[0] * s[0], p[1] * s[1]]; });
      var t = projection(SRC, px);
      doc.style.transform = "matrix3d(" + [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(",") + ")";
      var pts = px.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
      quad.setAttribute("points", pts);
      shadow.setAttribute("points", px.map(function (p) { return (p[0] + 6).toFixed(1) + "," + (p[1] + 12).toFixed(1); }).join(" "));
      handles.forEach(function (h, i) { h.style.transform = "translate(" + px[i][0] + "px," + px[i][1] + "px)"; });
    }

    function perimeter() {
      var s = size(), d = 0;
      for (var i = 0; i < 4; i++) {
        var a = corners[i], b = corners[(i + 1) % 4];
        d += Math.hypot((a[0] - b[0]) * s[0], (a[1] - b[1]) * s[1]);
      }
      return Math.ceil(d);
    }

    function animateTo(target, ms, done) {
      if (anim) cancelAnimationFrame(anim);
      if (reduceMotion) { corners = clone(target); render(); if (done) done(); return; }
      var from = clone(corners), start = null;
      function step(ts) {
        if (start === null) start = ts;
        var k = Math.min(1, (ts - start) / ms);
        var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        corners = from.map(function (p, i) { return [p[0] + (target[i][0] - p[0]) * e, p[1] + (target[i][1] - p[1]) * e]; });
        render();
        if (k < 1) anim = requestAnimationFrame(step); else { anim = null; if (done) done(); }
      }
      anim = requestAnimationFrame(step);
    }

    function trace() {
      if (reduceMotion) return;
      var p = perimeter();
      quad.style.strokeDasharray = p;
      quad.style.setProperty("--perim", p);
      stage.classList.add("is-tracing");
      setTimeout(function () {
        stage.classList.remove("is-tracing");
        quad.style.strokeDasharray = "";
      }, 1150);
    }

    function setFlat(on) {
      flat = on;
      stage.classList.toggle("is-flat", on);
      if (on) {
        flattenBtn.textContent = "Try another angle";
        stampText.textContent = "Scan ready";
        status.textContent = "Cropped, straightened and cleaned up. That's what every scan looks like.";
        animateTo(flatTarget(), 750);
      } else {
        poseIndex = (poseIndex + 1) % poses.length;
        flattenBtn.textContent = "Flatten page";
        stampText.textContent = "Page found";
        status.textContent = "Drag a corner to adjust it, then flatten the page.";
        animateTo(poses[poseIndex], 650, trace);
      }
    }

    flattenBtn.addEventListener("click", function () { setFlat(!flat); });

    /* Loupe: a magnified copy of the stage under the dragged corner */
    var loupeClone = null;
    function showLoupe(i) {
      if (!loupeClone) {
        loupeClone = doc.cloneNode(true);
        loupeClone.removeAttribute("id");
        loupeInner.appendChild(loupeClone);
      }
      loupe.classList.add("is-on");
      moveLoupe(i);
    }
    function moveLoupe(i) {
      var s = size(), z = 2.4, r = 48;
      var cx = corners[i][0] * s[0], cy = corners[i][1] * s[1];
      var lx = cx < s[0] / 2 ? cx + 40 : cx - 40 - 2 * r;
      var ly = cy < s[1] / 2 ? cy + 40 : cy - 40 - 2 * r;
      loupe.style.left = lx + "px";
      loupe.style.top = ly + "px";
      loupeClone.style.transform = doc.style.transform;
      loupeInner.style.width = s[0] + "px";
      loupeInner.style.height = s[1] + "px";
      loupeInner.style.transform = "translate(" + (r - cx * z) + "px," + (r - cy * z) + "px) scale(" + z + ")";
    }
    function hideLoupe() { loupe.classList.remove("is-on"); }

    function clampCorner(p) { return [Math.min(0.98, Math.max(0.02, p[0])), Math.min(0.98, Math.max(0.02, p[1]))]; }

    handles.forEach(function (h) {
      var i = +h.dataset.i;
      h.addEventListener("pointerdown", function (e) {
        if (flat) return;
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        h.classList.add("is-dragging");
        showLoupe(i);
      });
      h.addEventListener("pointermove", function (e) {
        if (!h.hasPointerCapture(e.pointerId)) return;
        var r = stage.getBoundingClientRect();
        corners[i] = clampCorner([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
        render();
        moveLoupe(i);
      });
      function end(e) {
        if (h.hasPointerCapture && h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId);
        h.classList.remove("is-dragging");
        hideLoupe();
      }
      h.addEventListener("pointerup", end);
      h.addEventListener("pointercancel", end);
      h.addEventListener("keydown", function (e) {
        var step = e.shiftKey ? 0.05 : 0.01, d = null;
        if (e.key === "ArrowLeft") d = [-step, 0];
        else if (e.key === "ArrowRight") d = [step, 0];
        else if (e.key === "ArrowUp") d = [0, -step];
        else if (e.key === "ArrowDown") d = [0, step];
        if (!d || flat) return;
        e.preventDefault();
        corners[i] = clampCorner([corners[i][0] + d[0], corners[i][1] + d[1]]);
        render();
      });
    });

    window.addEventListener("resize", function () {
      if (flat && !anim) corners = flatTarget();
      render();
    });

    render();
    trace();
  }

  /* ---------- Filter demo ---------- */
  var sheet = document.getElementById("sheet");
  if (sheet) {
    var notes = {
      original: "The photo as your camera took it: warm light and a shadow in the corner.",
      auto: "Auto evens out the colour and brightens the paper, keeping colour stamps and highlights.",
      gray: "Grayscale drops the colour cast for a calm, neutral page.",
      bw: "Black and white turns the paper pure white and the ink crisp, like a photocopy. Best for text.",
      noshadow: "No shadow lifts the shade cast by your hand or phone, without losing the ink."
    };
    var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
    var note = document.getElementById("filterNote");
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        chips.forEach(function (o) { o.setAttribute("aria-pressed", String(o === c)); });
        sheet.dataset.filter = c.dataset.filter;
        note.textContent = notes[c.dataset.filter];
      });
    });
  }
})();
