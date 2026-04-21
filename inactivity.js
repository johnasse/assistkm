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
  await signOut(auth);
  window.location.href = "connexion.html";
}

function resetTimers() {
  clearTimeout(warningTimeout);
  clearTimeout(logoutTimeout);
  hideModal();

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

// ===== INIT =====
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  createModal();
  initActivityListeners();
  resetTimers();
});