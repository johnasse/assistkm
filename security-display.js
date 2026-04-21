function formatChildNameSecure(fullName) {
  if (!fullName) return "";

  const parts = String(fullName)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 1) {
    return parts[0];
  }

  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();

  return `${firstName}.${lastInitial}`;
}

function maskChildrenNames() {
  document.querySelectorAll("[data-child]").forEach((el) => {
    const originalText = el.getAttribute("data-child-value") || el.textContent?.trim();

    if (!originalText) return;

    el.setAttribute("data-child-value", originalText);
    el.textContent = formatChildNameSecure(originalText);
  });
}

function observeChanges() {
  const observer = new MutationObserver(() => {
    maskChildrenNames();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

document.addEventListener("DOMContentLoaded", () => {
  maskChildrenNames();
  observeChanges();
});