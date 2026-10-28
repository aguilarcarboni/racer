import { KEYBOARD_PROFILES } from "../core/KeyboardProfiles.js";

export class LocalLobby {
  constructor({ onCount, onKeyboard, onLayout, onStart, onPreview, onSolo }) {
    this.root = document.getElementById("local-lobby");
    this.cards = document.getElementById("controller-slots");
    this.visible = false;
    this.lastSignature = "";
    this.onStart = onStart;
    this.onPreview = onPreview;
    this.root.querySelectorAll("[data-player-count]").forEach((button) =>
      button.addEventListener("click", () => {
        onCount(Number(button.dataset.playerCount));
        button.blur();
      }),
    );
    document
      .getElementById("keyboard-players")
      .addEventListener("change", (e) => onKeyboard(Number(e.target.value)));
    document
      .getElementById("split-orientation")
      .addEventListener("change", (e) => onLayout(e.target.value));
    document.getElementById("local-start").addEventListener("click", () => {
      if (this.ready) onStart();
    });
    document.getElementById("local-preview").addEventListener("click", () => {
      if (this.canPreview) onPreview();
    });
    document.getElementById("local-solo").addEventListener("click", onSolo);
    document.addEventListener("keydown", (event) => {
      if (!this.visible || event.key !== "Tab") return;
      const controls = [
        ...this.root.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
        ),
      ].filter((node) => node.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1),
        active = document.activeElement;
      if (!first) return;
      if (
        !this.root.contains(active) ||
        (event.shiftKey &&
          (active === first ||
            active === document.getElementById("local-title")))
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
  show(message = "") {
    this.visible = true;
    this.root.hidden = false;
    document.getElementById("local-message").textContent = message;
    document.getElementById("local-title").focus();
  }
  hide() {
    this.visible = false;
    this.root.hidden = true;
    document.getElementById("app").focus();
  }
  configure(players, keyboard, orientation) {
    this.players = players;
    this.cards.replaceChildren();
    players.forEach((entry, i) => {
      const card = document.createElement("div");
      card.className = "controller-slot";
      card.style.setProperty("--player-color", entry.color);
      card.innerHTML = `<span class="slot-number">P${i + 1}</span><div><strong>PLAYER ${i + 1}</strong><span class="slot-status"></span><small class="slot-device"></small></div><i class="slot-light"></i>`;
      this.cards.append(card);
    });
    this.root
      .querySelectorAll("[data-player-count]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.playerCount) === players.length),
        ),
      );
    document.getElementById("keyboard-players").value = String(keyboard);
    document.getElementById("split-orientation").value = orientation;
    document.getElementById("orientation-field").hidden = players.length !== 2;
    this.lastSignature = "";
  }
  update(status, ready, phase) {
    this.ready = ready;
    this.canPreview = phase === "ready";
    const signature = JSON.stringify([status, ready, phase]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    [...this.cards.children].forEach((card, i) => {
      const state = status[i];
      const connected = state?.connected || state?.keyboard;
      card.classList.toggle("joined", !!connected);
      card.querySelector(".slot-status").textContent = state?.keyboard
        ? "Keyboard ready"
        : state?.connected
          ? "Controller ready"
          : state?.assigned
            ? "Reconnect controller"
            : "Press A / Cross to join";
      card.querySelector(".slot-device").textContent = state?.keyboard
        ? KEYBOARD_PROFILES[state.keyboardIndex].label
        : state?.connected
          ? `Pad ${state.index + 1} / ${state.name}`
          : "One controller per player";
    });
    const count = status.filter((s) => s.connected || s.keyboard).length;
    document.getElementById("local-ready").textContent =
      `${count} / ${this.players.length} READY`;
    const start = document.getElementById("local-start");
    start.disabled = !ready;
    start.textContent = phase === "ready" ? "Start local race" : "Resume race";
    document.getElementById("local-preview").disabled = !this.canPreview;
  }
}
