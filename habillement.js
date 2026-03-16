const DEFAULT_RATES = {
  "0-11": 47.33,
  "12-21": 56.83
};

const childNameInput = document.getElementById("childName");
const yearSelect = document.getElementById("yearSelect");
const ageBracketSelect = document.getElementById("ageBracket");

const rate0_11Input = document.getElementById("rate0_11");
const rate12_21Input = document.getElementById("rate12_21");
const saveRatesBtn = document.getElementById("saveRatesBtn");

const monthlyBudgetEl = document.getElementById("monthlyBudget");
const annualBudgetEl = document.getElementById("annualBudget");
const totalSpentEl = document.getElementById("totalSpent");
const remainingBudgetEl = document.getElementById("remainingBudget");

const expenseDateInput = document.getElementById("expenseDate");
const expenseMonthSelect = document.getElementById("expenseMonth");
const expenseLabelInput = document.getElementById("expenseLabel");
const expenseAmountInput = document.getElementById("expenseAmount");
const expenseNotesInput = document.getElementById("expenseNotes");
const expenseFilesInput = document.getElementById("expenseFiles");
const addExpenseBtn = document.getElementById("addExpenseBtn");

const historyContainer = document.getElementById("historyContainer");

function formatEuro(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function safeParseNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

function getSavedRates() {
  const savedRates = localStorage.getItem("habillement_rates");
  if (!savedRates) return { ...DEFAULT_RATES };

  try {
    const parsed = JSON.parse(savedRates);
    return {
      "0-11": safeParseNumber(parsed["0-11"], DEFAULT_RATES["0-11"]),
      "12-21": safeParseNumber(parsed["12-21"], DEFAULT_RATES["12-21"])
    };
  } catch (error) {
    return { ...DEFAULT_RATES };
  }
}

function getCurrentRatesFromInputs() {
  return {
    "0-11": safeParseNumber(rate0_11Input.value, DEFAULT_RATES["0-11"]),
    "12-21": safeParseNumber(rate12_21Input.value, DEFAULT_RATES["12-21"])
  };
}

function loadRatesIntoInputs() {
  const rates = getSavedRates();
  rate0_11Input.value = rates["0-11"].toFixed(2);
  rate12_21Input.value = rates["12-21"].toFixed(2);
}

function saveRates() {
  const rate0_11 = parseFloat(rate0_11Input.value);
  const rate12_21 = parseFloat(rate12_21Input.value);

  if (isNaN(rate0_11) || rate0_11 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 0 à 11 ans.");
    return;
  }

  if (isNaN(rate12_21) || rate12_21 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 12 à 21 ans.");
    return;
  }

  const rates = {
    "0-11": Number(rate0_11.toFixed(2)),
    "12-21": Number(rate12_21.toFixed(2))
  };

  localStorage.setItem("habillement_rates", JSON.stringify(rates));
  updateSummary();
  alert("Barèmes enregistrés avec succès.");
}

function getCurrentMonthlyRate() {
  const rates = getCurrentRatesFromInputs();
  return Number(rates[ageBracketSelect.value] || 0);
}

function getAnnualBudget() {
  return Number((getCurrentMonthlyRate() * 12).toFixed(2));
}

function getSettingsKey() {
  return "habillement_settings";
}

function saveSettings() {
  const settings = {
    childName: childNameInput.value.trim(),
    year: yearSelect.value,
    ageBracket: ageBracketSelect.value
  };

  localStorage.setItem(getSettingsKey(), JSON.stringify(settings));
}

function loadSettings() {
  const raw = localStorage.getItem(getSettingsKey());
  if (!raw) return;

  try {
    const settings = JSON.parse(raw);
    if (settings.childName) childNameInput.value = settings.childName;
    if (settings.year) yearSelect.value = settings.year;
    if (settings.ageBracket) ageBracketSelect.value = settings.ageBracket;
  } catch (error) {
    console.error("Erreur chargement paramètres habillement :", error);
  }
}

function normalizeChildName(name) {
  return (name || "enfant")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function getStorageKey() {
  const child = normalizeChildName(childNameInput.value);
  const year = (yearSelect.value || new Date().getFullYear()).toString().trim();
  return `habillement_${child}_${year}`;
}

function getExpenses() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return [];

  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(getStorageKey(), JSON.stringify(expenses));
}

function updateSummary() {
  const monthly = getCurrentMonthlyRate();
  const annual = getAnnualBudget();
  const expenses = getExpenses();

  const totalSpent = expenses.reduce((sum, item) => {
    return sum + Number(item.amount || 0);
  }, 0);

  const remaining = Number((annual - totalSpent).toFixed(2));

  monthlyBudgetEl.textContent = formatEuro(monthly);
  annualBudgetEl.textContent = formatEuro(annual);
  totalSpentEl.textContent = formatEuro(totalSpent);
  remainingBudgetEl.textContent = formatEuro(remaining);

  remainingBudgetEl.classList.remove("green", "red");
  remainingBudgetEl.classList.add(remaining < 0 ? "red" : "green");
}

function renderHistory() {
  const expenses = getExpenses().sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  if (!expenses.length) {
    historyContainer.innerHTML = `<div class="empty-state">Aucune dépense enregistrée pour le moment.</div>`;
    return;
  }

  let html = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Mois</th>
          <th>Libellé</th>
          <th>Montant</th>
          <th>Commentaire</th>
          <th>Justificatifs</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  expenses.forEach((expense) => {
    const filesHtml = expense.files && expense.files.length
      ? `
        <div class="file-list">
          ${expense.files.map(file => `
            <a class="file-link" href="${file.data}" download="${file.name}">
              📎 ${file.name}
            </a>
          `).join("")}
        </div>
      `
      : "Aucun";

    html += `
      <tr>
        <td>${expense.date || ""}</td>
        <td>${expense.month || ""}</td>
        <td>${expense.label || ""}</td>
        <td>${formatEuro(expense.amount)}</td>
        <td>${expense.notes || ""}</td>
        <td>${filesHtml}</td>
        <td>
          <button class="btn btn-danger" onclick="deleteExpense('${expense.id}')">Supprimer</button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  historyContainer.innerHTML = html;
}

function clearExpenseForm() {
  expenseDateInput.value = "";
  expenseMonthSelect.value = "";
  expenseLabelInput.value = "";
  expenseAmountInput.value = "";
  expenseNotesInput.value = "";
  expenseFilesInput.value = "";
}

function filesToBase64(fileList) {
  return Promise.all(
    Array.from(fileList).map((file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve({
            name: file.name,
            type: file.type,
            data: reader.result
          });
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    })
  );
}

async function addExpense() {
  const childName = childNameInput.value.trim();
  const year = yearSelect.value.trim();
  const date = expenseDateInput.value;
  const month = expenseMonthSelect.value;
  const label = expenseLabelInput.value.trim();
  const amount = parseFloat(expenseAmountInput.value);
  const notes = expenseNotesInput.value.trim();
  const files = expenseFilesInput.files;

  if (!childName) {
    alert("Merci de renseigner le nom de l’enfant.");
    return;
  }

  if (!year) {
    alert("Merci de renseigner l’année.");
    return;
  }

  if (!date) {
    alert("Merci de renseigner la date.");
    return;
  }

  if (!month) {
    alert("Merci de sélectionner le mois concerné.");
    return;
  }

  if (!label) {
    alert("Merci de renseigner un libellé.");
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    alert("Merci de renseigner un montant valide.");
    return;
  }

  let encodedFiles = [];

  if (files.length > 0) {
    try {
      encodedFiles = await filesToBase64(files);
    } catch (error) {
      alert("Impossible de lire un ou plusieurs justificatifs.");
      return;
    }
  }

  const expenses = getExpenses();

  expenses.push({
    id: Date.now().toString(),
    date,
    month,
    label,
    amount: Number(amount.toFixed(2)),
    notes,
    files: encodedFiles
  });

  saveExpenses(expenses);
  saveSettings();
  clearExpenseForm();
  updateSummary();
  renderHistory();
}

function deleteExpense(id) {
  const confirmation = confirm("Voulez-vous vraiment supprimer cette dépense ?");
  if (!confirmation) return;

  const updatedExpenses = getExpenses().filter((item) => item.id !== id);
  saveExpenses(updatedExpenses);
  updateSummary();
  renderHistory();
}

window.deleteExpense = deleteExpense;

function initDefaultValues() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const todayIso = today.toISOString().split("T")[0];

  if (!yearSelect.value) {
    yearSelect.value = currentYear;
  }

  if (!expenseDateInput.value) {
    expenseDateInput.value = todayIso;
  }
}

function init() {
  loadSettings();
  initDefaultValues();
  loadRatesIntoInputs();
  updateSummary();
  renderHistory();
}

childNameInput.addEventListener("input", () => {
  saveSettings();
  updateSummary();
  renderHistory();
});

yearSelect.addEventListener("input", () => {
  saveSettings();
  updateSummary();
  renderHistory();
});

ageBracketSelect.addEventListener("change", () => {
  saveSettings();
  updateSummary();
  renderHistory();
});

rate0_11Input.addEventListener("input", updateSummary);
rate12_21Input.addEventListener("input", updateSummary);

saveRatesBtn.addEventListener("click", saveRates);
addExpenseBtn.addEventListener("click", addExpense);

init();