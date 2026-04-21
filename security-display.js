function formatChildNameSecure(fullName) {
  if (!fullName) return "";

  const parts = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) return parts[0];

  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

  return `${firstName}.${lastInitial}`;
}

function maskChildrenNames() {
  document.querySelectorAll("[data-child]").forEach((el) => {
    const original = el.getAttribute("data-original") || el.textContent?.trim();
    if (!original) return;

    el.setAttribute("data-original", original);
    const masked = formatChildNameSecure(original);

    if (el.textContent !== masked) {
      el.textContent = masked;
    }
  });
}

// rend la fonction dispo globalement
window.maskChildrenNames = maskChildrenNames;

document.addEventListener("DOMContentLoaded", () => {
  maskChildrenNames();
});