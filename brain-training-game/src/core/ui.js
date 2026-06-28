/* =========================================================================
   ui.js — shared UI: HUD sync, toasts, modals, settings drawer, theme apply.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;
  const el = NF.util.el;

  const UI = {
    // ---------- theme / accessibility ----------
    applySettings() {
      const s = NF.store.get().settings;
      document.documentElement.setAttribute("data-theme", s.theme);
      document.documentElement.setAttribute("data-cb", s.colorblind ? "true" : "false");
      document.documentElement.style.setProperty("--font-scale", s.fontScale);
      document.getElementById("btn-sound").classList.toggle("off", !s.sound);
      NF.audio.refresh();
      NF.bus.emit("theme", s.theme);
      NF.bus.emit("settings", s);
    },

    // ---------- HUD ----------
    syncHud() {
      const s = NF.store.get();
      document.getElementById("hud-level").textContent = s.level;
      document.getElementById("hud-score").textContent = NF.util.abbr(s.brainScore);
      document.getElementById("hud-coins").textContent = NF.util.abbr(s.coins);
      document.getElementById("hud-streak").textContent = s.streak;
      const age = NF.prog.brainAge();
      const foot = document.getElementById("brain-age-foot");
      if (foot) foot.textContent = "Brain Age " + age;
    },

    // ---------- toast ----------
    toast(msg, kind, icon) {
      const root = document.getElementById("toast-root");
      const t = el("div", { class: "toast " + (kind || "") }, [
        icon ? el("span", { class: "t-ico", text: icon }) : null,
        el("span", { text: msg }),
      ]);
      root.appendChild(t);
      setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; }, 2600);
      setTimeout(() => t.remove(), 3000);
    },

    // ---------- modal ----------
    modal(content, opts) {
      opts = opts || {};
      const root = document.getElementById("modal-root");
      const bg = el("div", { class: "modal-bg" });
      const box = el("div", { class: "modal" });
      box.appendChild(content);
      bg.appendChild(box);
      if (!opts.sticky) bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
      root.appendChild(bg);
      function close() { bg.remove(); if (opts.onClose) opts.onClose(); }
      return { close, box };
    },

    confirm(title, body, onYes) {
      const c = el("div", {}, [
        el("h2", { text: title }),
        el("p", { class: "muted mt", text: body }),
        el("div", { class: "actions" }, [
          el("button", { class: "btn ghost", onclick: () => m.close() }, "Cancel"),
          el("button", { class: "btn primary", onclick: () => { m.close(); onYes && onYes(); } }, "Confirm"),
        ]),
      ]);
      const m = this.modal(c);
    },

    // ---------- settings drawer ----------
    openSettings() {
      const s = NF.store.get().settings;
      const panel = document.getElementById("settings-panel");
      panel.innerHTML = "";

      const seg = (label, options, current, onPick) =>
        el("div", { class: "field" }, [
          el("label", { text: label }),
          el("div", { class: "seg" }, options.map((o) =>
            el("button", { class: current === o.v ? "on" : "", onclick: (e) => {
              [...e.currentTarget.parentNode.children].forEach((b) => b.classList.remove("on"));
              e.currentTarget.classList.add("on"); onPick(o.v);
            } }, o.t))),
        ]);

      panel.append(
        el("div", { class: "row-between" }, [
          el("h3", { text: "Settings" }),
          el("button", { class: "icon-btn", onclick: () => this.closeSettings() }, "✕"),
        ]),

        seg("Theme", [
          { t: "Neon", v: "neon" }, { t: "Midnight", v: "midnight" }, { t: "Light", v: "light" },
        ], s.theme, (v) => mut((x) => (x.theme = v))),

        seg("Colorblind-safe", [{ t: "Off", v: false }, { t: "On", v: true }], s.colorblind, (v) => mut((x) => (x.colorblind = v))),

        seg("Font size", [
          { t: "S", v: 0.9 }, { t: "M", v: 1 }, { t: "L", v: 1.12 }, { t: "XL", v: 1.25 },
        ], s.fontScale, (v) => mut((x) => (x.fontScale = v))),

        seg("Motion", [{ t: "Full", v: false }, { t: "Reduced", v: true }], s.reduceMotion, (v) => mut((x) => (x.reduceMotion = v))),

        el("div", { class: "field" }, [
          el("label", { text: "Sound effects" }),
          el("div", { class: "seg" }, [
            el("button", { class: s.sound ? "on" : "", onclick: (e) => { mut((x) => (x.sound = !x.sound)); UI.openSettings(); } }, s.sound ? "On" : "Off"),
            el("button", { class: s.music ? "on" : "", onclick: () => { mut((x) => (x.music = !x.music)); x_music(); UI.openSettings(); } }, s.music ? "Music On" : "Music Off"),
          ]),
        ]),

        el("div", { class: "field" }, [
          el("label", { text: "Volume" }),
          el("input", { type: "range", min: "0", max: "1", step: "0.05", value: s.volume,
            oninput: (e) => mut((x) => (x.volume = +e.target.value)) }),
        ]),

        el("div", { class: "section-title", text: "Save data" }),
        el("div", { class: "seg" }, [
          el("button", { class: "btn", onclick: () => UI.exportSave() }, "⬇ Export"),
          el("button", { class: "btn", onclick: () => UI.importSave() }, "⬆ Import"),
        ]),
        el("button", { class: "btn ghost mt", style: { width: "100%", color: "var(--bad)" },
          onclick: () => UI.confirm("Reset everything?", "This wipes all progress permanently.", () => { NF.store.reset(); UI.applySettings(); UI.syncHud(); UI.closeSettings(); NF.bus.emit("nav", "home"); UI.toast("Profile reset", "bad", "↺"); }) }, "Reset profile"),

        el("p", { class: "muted mt2", style: { fontSize: "0.72rem" }, text: "NeuroForge v1.0 · runs fully offline · data stays on this device." }),
      );

      function mut(fn) {
        NF.store.update((st) => fn(st.settings));
        UI.applySettings();
      }
      function x_music() { NF.store.get().settings.music ? NF.audio.startMusic() : NF.audio.stopMusic(); }

      panel.classList.remove("hidden");
    },
    closeSettings() { document.getElementById("settings-panel").classList.add("hidden"); },

    exportSave() {
      const data = NF.store.exportString();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: "neuroforge-save.json" });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      this.toast("Progress exported", "good", "⬇");
    },

    importSave() {
      const input = el("input", { type: "file", accept: "application/json", style: { display: "none" } });
      input.addEventListener("change", () => {
        const f = input.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          if (NF.store.importString(r.result)) {
            this.applySettings(); this.syncHud(); this.closeSettings();
            NF.bus.emit("nav", "home"); this.toast("Progress imported", "good", "⬆");
          } else this.toast("Invalid save file", "bad", "✕");
        };
        r.readAsText(f);
      });
      document.body.appendChild(input); input.click(); input.remove();
    },

    // ---------- results modal after a game ----------
    results(summary, onAgain, onExit) {
      const s = summary.session;
      const stars = Math.round(s.stars || 0);
      const starRow = el("div", { class: "stars" });
      for (let i = 0; i < 3; i++) starRow.appendChild(el("span", { class: i < stars ? "on" : "off", text: "★" }));

      const rows = [
        ["Score", Math.round(s.score)],
        ["Accuracy", Math.round((s.accuracy || 0) * 100) + "%"],
      ];
      if (s.reaction) rows.push(["Avg reaction", Math.round(s.reaction) + " ms"]);
      rows.push(["XP earned", "+" + s._xp]);
      rows.push(["Coins earned", "+" + s._coins]);

      const c = el("div", {}, [
        el("h2", { text: s.won === false ? "Session Complete" : "Great Work!" }),
        starRow,
        el("div", { class: "big-num", text: Math.round(s.score) }),
        el("div", { class: "muted", text: "points" }),
        el("div", { class: "mt" }, rows.map((r) => el("div", { class: "row" }, [el("span", { text: r[0] }), el("b", { text: String(r[1]) })]))),
        summary.diff ? el("p", { class: "muted mt", text: "AI difficulty: " + NF.adaptive.label(summary.diff.to) + (summary.diff.delta > 0.05 ? " ↑" : summary.diff.delta < -0.05 ? " ↓" : " →") }) : null,
        el("div", { class: "actions" }, [
          el("button", { class: "btn ghost", onclick: () => { m.close(); onExit && onExit(); } }, "Exit"),
          el("button", { class: "btn primary", onclick: () => { m.close(); onAgain && onAgain(); } }, "Play Again"),
        ]),
      ]);
      const m = this.modal(c, { sticky: true });
      NF.audio.play(s.won === false ? "wrong" : "victory");
    },
  };

  NF.ui = UI;
})();
