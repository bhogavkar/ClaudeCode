/* =========================================================================
   app.js — bootstrap, routing, global wiring, service-worker registration.
   This is the conductor: it boots the lab, handles navigation and launches
   games through the GameHost.
   ========================================================================= */
(function () {
  "use strict";
  const NF = window.NF;

  const App = {
    current: "home",
    activeHost: null,

    boot() {
      // apply saved settings + draw HUD
      NF.ui.applySettings();
      NF.ui.syncHud();
      NF.background.init();
      if (NF.store.get().settings.music) NF.audio.startMusic();

      this._wireChrome();
      this._wireBus();
      this.nav("home");

      // dismiss boot splash once everything is ready
      setTimeout(() => {
        const boot = document.getElementById("boot");
        boot.classList.add("gone");
        document.getElementById("app").classList.remove("hidden");
        setTimeout(() => boot.remove(), 700);
      }, 1100);

      this._registerSW();
    },

    _wireChrome() {
      // nav rail + brand + any [data-nav]
      document.querySelectorAll("[data-nav]").forEach((b) =>
        b.addEventListener("click", () => this.nav(b.dataset.nav)));

      document.getElementById("btn-settings").addEventListener("click", () => { NF.audio.unlock(); NF.ui.openSettings(); });
      document.getElementById("btn-sound").addEventListener("click", () => {
        NF.audio.unlock();
        NF.store.update((s) => (s.settings.sound = !s.settings.sound));
        NF.ui.applySettings();
        NF.ui.toast(NF.store.get().settings.sound ? "Sound on" : "Sound muted", "", "♪");
      });

      // unlock audio on first interaction (browser autoplay policy)
      const unlock = () => { NF.audio.unlock(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    },

    _wireBus() {
      NF.bus.on("nav", (r) => this.nav(r));
      NF.bus.on("levelup", (lvl) => NF.ui.toast("Level up! You reached level " + lvl, "good", "⭐"));
      NF.bus.on("achievement", (a) => NF.ui.toast("Achievement: " + a.name + " " + a.icon, "good", "🏆"));
      NF.bus.on("daily-done", () => NF.ui.toast("Daily challenge complete! +50⬡", "good", "🎯"));
      NF.bus.on("state", () => { if (!this.activeHost) NF.ui.syncHud(); });
    },

    /** navigate to a screen route */
    nav(route) {
      this.activeHost = null;
      this.current = route;
      NF.audio.play("click");
      // mark active rail buttons
      document.querySelectorAll(".rail-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === route));
      const mount = document.getElementById("screen");
      mount.innerHTML = "";
      mount.scrollTop = 0;
      const fn = NF.screens[route] || NF.screens.home;
      fn.call(NF.screens, mount, (r) => this.nav(r));
      mount.animate ? mount.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease" }) : null;
      NF.ui.syncHud();
    },

    /** launch a game by id into the screen mount via GameHost */
    launch(gameId) {
      const def = NF.games.byId(gameId);
      if (!def) return;
      NF.audio.unlock();
      const mount = document.getElementById("screen");
      mount.innerHTML = "";
      document.querySelectorAll(".rail-btn").forEach((b) => b.classList.remove("active"));
      this.activeHost = new NF.GameHost(def, mount, () => this.nav("play"));
    },

    /** AI Infinite mode — weighted random game toward weak skills */
    startInfinite() {
      const def = NF.modes.infinitePick();
      NF.ui.toast("AI Infinite: " + def.name, "", "♾");
      this.launch(def.id);
    },

    _registerSW() {
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache optional */ });
      }
    },
  };

  NF.app = App;
  window.addEventListener("DOMContentLoaded", () => App.boot());
})();
