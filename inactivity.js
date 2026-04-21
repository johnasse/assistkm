import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

// ===== CONFIG =====
const WARNING_TIME = 4.5 * 60 * 1000;
const LOGOUT_TIME = 5 * 60 * 1000;

// ===== CREATE MODAL AUTOMATIQUEMENT =====
function createModal() {
  const modal = document.createElement("div");
  modal.id = "inactivityModal";
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,0.4);
    display:flex; align-items:center; justify-content:center;
    z-index:9999;
  `;
  modal.innerHTML = `
    <div style="background:white;padding:20px;border-radius:12px;text-align:center;">
      <h3>Inactivité détectée</h3>
      <p>Déconnexion dans <span id="countdown">30</span> secondes</p>
      <button id="stayConnectedBtn">Rester connecté</button>
    </div>
  `;
  modal.style.display = "none";
  document.body.appendChild(modal);
}

let warningTimeout, logoutTimeout, countdownInterval;
let sessionCountdownInterval;
let remainingSeconds = LOGOUT_TIME / 1000;

function showModal() {
  const modal = document.getElementById("inactivityModal");
  const countdownEl = document.getElementById("countdown");

  let timeLeft = 30;
  countdownEl.textContent = timeLeft;
  modal.style.display = "flex";

  countdownInterval = setInterval(() => {
    timeLeft--;
    countdownEl.textContent = timeLeft;
  }, 1000);
}

function hideModal() {
  const modal = document.getElementById("inactivityModal");
  modal.style.display = "none";
  clearInterval(countdownInterval);
}
async function logoutUser() {
  hideModal();
  clearInterval(sessionCountdownInterval);
  await signOut(auth);
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
  ["mousemove","click","keypress","scroll","touchstart"].forEach(event => {
    document.addEventListener(event, resetTimers, true);
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "stayConnectedBtn") {
      resetTimers();
    }
  });
}
function addSecurityBadge() {
  const badge = document.createElement("div");
  badge.textContent = "🔒 Session sécurisée • Déconnexion automatique";
  badge.style = `
    position:fixed;
    bottom:10px;
    left:10px;
    font-size:12px;
    background:#eef2ff;
    color:#3730a3;
    padding:6px 10px;
    border-radius:999px;
    z-index:9999;
    font-weight:600;
  `;
  document.body.appendChild(badge);
}
// ===== INIT =====
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  createModal();
  initActivityListeners();
  addSecurityBadge();
  resetTimers();
});
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
  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
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