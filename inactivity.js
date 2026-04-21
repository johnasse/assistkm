import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

// ===== CONFIG =====
const WARNING_TIME = 4.5 * 60 * 1000;
const LOGOUT_TIME = 5 * 60 * 1000;

let warningTimeout;
let logoutTimeout;
let countdownInterval;
let sessionCountdownInterval;
let remainingSeconds = LOGOUT_TIME / 1000;

// ===== CREATE MODAL AUTOMATIQUEMENT =====
function createModal() {
  if (document.getElementById("inactivityModal")) return;

  const modal = document.createElement("div");
  modal.id = "inactivityModal";
  modal.style = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  modal.innerHTML = `
    <div style="
      background: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      max-width: 380px;
      width: calc(100% - 30px);
    ">
      <h3 style="margin:0 0 10px 0; color:#111827;">Inactivité détectée</h3>
      <p style="margin:0; color:#4b5563;">
        Déconnexion dans <span id="countdown">30</span> secondes
      </p>
      <button
        id="stayConnectedBtn"
        style="
          margin-top: 14px;
          padding: 10px 14px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        "
      >
        Rester connecté
      </button>
    </div>
  `;

  document.body.appendChild(modal);
}

// ===== BADGE SECURITE =====
function addSecurityBadge() {
  if (document.getElementById("securityBadge")) return;

  const badge = document.createElement("div");
  badge.id = "securityBadge";
  badge.style = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    font-size: 12px;
    background: #eef2ff;
    color: #3730a3;
    padding: 8px 12px;
    border-radius: 999px;
    z-index: 9999;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  `;
  badge.textContent = "🔒 Session sécurisée • Déconnexion dans 05:00";

  document.body.appendChild(badge);
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const min = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const sec = String(safeSeconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function updateSecurityBadge() {
  const badge = document.getElementById("securityBadge");
  if (!badge) return;

  badge.textContent = `🔒 Session sécurisée • Déconnexion dans ${formatCountdown(remainingSeconds)}`;
}

function startSessionCountdown() {
  clearInterval(sessionCountdownInterval);

  remainingSeconds = LOGOUT_TIME / 1000;
  updateSecurityBadge();

  sessionCountdownInterval = setInterval(() => {
    remainingSeconds--;

    if (remainingSeconds < 0) {
      clearInterval(sessionCountdownInterval);
      return;
    }

    updateSecurityBadge();
  }, 1000);
}

// ===== MODAL =====
function showModal() {
  const modal = document.getElementById("inactivityModal");
  const countdownEl = document.getElementById("countdown");

  if (!modal || !countdownEl) return;

  let timeLeft = 30;
  countdownEl.textContent = timeLeft;
  modal.style.display = "flex";

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    timeLeft--;
    countdownEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

function hideModal() {
  const modal = document.getElementById("inactivityModal");
  if (modal) {
    modal.style.display = "none";
  }

  clearInterval(countdownInterval);
}

// ===== LOGOUT =====
async function logoutUser() {
  hideModal();
  clearInterval(sessionCountdownInterval);

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erreur déconnexion automatique :", error);
  }

  window.location.href = "connexion.html";
}

function resetTimers() {
  clearTimeout(warningTimeout);
  clearTimeout(logoutTimeout);
  hideModal();

  startSessionCountdown();

  warningTimeout = setTimeout(showModal, WARNING_TIME);
  logoutTimeout = setTimeout(logoutUser, LOGOUT_TIME);
}

// ===== EVENTS =====
function initActivityListeners() {
  ["mousemove", "click", "keypress", "scroll", "touchstart"].forEach((event) => {
    document.addEventListener(event, resetTimers, true);
  });

  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "stayConnectedBtn") {
      resetTimers();
    }
  });
}

// ===== INIT =====
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  createModal();
  addSecurityBadge();
  initActivityListeners();
  resetTimers();
});