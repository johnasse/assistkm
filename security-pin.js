import { auth } from "./firebase-config.js";

const PIN_DURATION = 5 * 60 * 1000; // 5 minutes

function getUid() {
  return auth.currentUser?.uid || "guest";
}

function getGlobalPinKey() {
  return `easyfrais_global_pin_${getUid()}`;
}

function getPinUnlockKey() {
  return `easyfrais_pin_unlock_until_${getUid()}`;
}

export function getGlobalPin() {
  return localStorage.getItem(getGlobalPinKey()) || "";
}

export function setGlobalPin(pin) {
  localStorage.setItem(getGlobalPinKey(), pin);
}

export function hasGlobalPin() {
  return !!getGlobalPin();
}

export function ensureGlobalPinExists() {
  if (hasGlobalPin()) return true;

  const newPin = prompt("Définis un code PIN global à 4 chiffres pour sécuriser Easyfrais :");

  if (!/^\d{4}$/.test(newPin || "")) {
    alert("Le code PIN doit contenir exactement 4 chiffres.");
    return false;
  }

  setGlobalPin(newPin);
  alert("Code PIN enregistré avec succès.");
  return true;
}

export function isPinStillValid() {
  const unlockUntil = Number(localStorage.getItem(getPinUnlockKey()) || "0");
  return Date.now() < unlockUntil;
}

export function unlockPinFor5Minutes() {
  const unlockUntil = Date.now() + PIN_DURATION;
  localStorage.setItem(getPinUnlockKey(), String(unlockUntil));
}

export function clearPinUnlock() {
  localStorage.removeItem(getPinUnlockKey());
}

export function showPinModal({
  title = "Code PIN requis",
  message = "Entre ton code PIN pour continuer.",
  onSuccess = () => {},
  onCancel = () => {}
} = {}) {
  let modal = document.getElementById("globalPinModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "globalPinModal";
    modal.style = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
    `;

    modal.innerHTML = `
      <div style="
        background:#fff;
        width:90%;
        max-width:380px;
        border-radius:16px;
        padding:24px;
        text-align:center;
        box-shadow:0 12px 30px rgba(0,0,0,0.18);
      ">
        <h3 id="globalPinTitle" style="margin-top:0;"></h3>
        <p id="globalPinMessage" style="color:#6b7280;"></p>

        <input
          type="password"
          id="globalPinInput"
          inputmode="numeric"
          maxlength="4"
          placeholder="Code PIN"
          style="
            width:100%;
            padding:12px;
            border:1px solid #d1d5db;
            border-radius:10px;
            font-size:18px;
            text-align:center;
            margin-top:10px;
          "
        />

        <div id="globalPinError" style="
          display:none;
          color:#dc2626;
          margin-top:10px;
          font-size:14px;
        ">
          Code PIN incorrect
        </div>

        <div style="display:flex; gap:10px; justify-content:center; margin-top:18px;">
          <button
            id="globalPinCancelBtn"
            type="button"
            style="
              padding:10px 14px;
              border:none;
              border-radius:10px;
              background:#e5e7eb;
              cursor:pointer;
            "
          >
            Annuler
          </button>

          <button
            id="globalPinValidateBtn"
            type="button"
            style="
              padding:10px 14px;
              border:none;
              border-radius:10px;
              background:#2563eb;
              color:white;
              cursor:pointer;
              font-weight:700;
            "
          >
            Valider
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  const titleEl = document.getElementById("globalPinTitle");
  const messageEl = document.getElementById("globalPinMessage");
  const input = document.getElementById("globalPinInput");
  const error = document.getElementById("globalPinError");
  const validateBtn = document.getElementById("globalPinValidateBtn");
  const cancelBtn = document.getElementById("globalPinCancelBtn");

  if (!titleEl || !messageEl || !input || !error || !validateBtn || !cancelBtn) {
    onCancel();
    return;
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  input.value = "";
  error.style.display = "none";
  modal.style.display = "flex";

  setTimeout(() => input.focus(), 50);

  const cleanup = () => {
    validateBtn.onclick = null;
    cancelBtn.onclick = null;
    input.onkeydown = null;
  };

  const close = () => {
    modal.style.display = "none";
    cleanup();
  };

  const validate = () => {
    const entered = input.value.trim();
    const saved = getGlobalPin();

    if (entered === saved) {
      unlockPinFor5Minutes();
      close();
      onSuccess();
    } else {
      error.style.display = "block";
      input.value = "";
      input.focus();
    }
  };

  validateBtn.onclick = validate;
  cancelBtn.onclick = () => {
    close();
    onCancel();
  };

  input.onkeydown = (e) => {
    if (e.key === "Enter") validate();
    if (e.key === "Escape") {
      close();
      onCancel();
    }
  };
}

export function requireGlobalPin(options = {}) {
  return new Promise((resolve) => {
    if (isPinStillValid()) {
      resolve(true);
      return;
    }

    showPinModal({
      ...options,
      onSuccess: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
}

export function changeGlobalPin() {
  const current = getGlobalPin();

  if (current) {
    const oldPin = prompt("Entre le code PIN actuel :");
    if (oldPin !== current) {
      alert("Code PIN incorrect.");
      return false;
    }
  }

  const newPin = prompt("Entre un nouveau code PIN à 4 chiffres :");
  if (!/^\d{4}$/.test(newPin || "")) {
    alert("Le code PIN doit contenir exactement 4 chiffres.");
    return false;
  }

  setGlobalPin(newPin);
  clearPinUnlock();
  alert("Code PIN mis à jour.");
  return true;
}