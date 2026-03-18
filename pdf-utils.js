export function createStyledPdf(title) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, pageWidth, 28, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(title, pageWidth / 2, 18, { align: "center" });

  pdf.setTextColor(17, 24, 39);

  return pdf;
}

export function addPdfMeta(pdf, lines = []) {
  let y = 38;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  lines.forEach((line) => {
    pdf.text(String(line), 14, y);
    y += 6;
  });

  return y + 4;
}

export function drawSummaryCards(pdf, cards, startY) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const gap = 6;
  const count = cards.length;
  const totalGap = gap * (count - 1);
  const cardWidth = (pageWidth - 20 - totalGap) / count;
  const cardHeight = 22;

  cards.forEach((card, index) => {
    const x = 10 + index * (cardWidth + gap);

    pdf.setDrawColor(210, 214, 220);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(x, startY, cardWidth, cardHeight, 3, 3, "FD");

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text(card.label, x + 4, startY + 7);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(17, 24, 39);
    pdf.text(card.value, x + 4, startY + 16);
  });

  pdf.setTextColor(17, 24, 39);
  return startY + cardHeight + 8;
}

export function drawSectionTitle(pdf, title, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(17, 24, 39);
  pdf.text(title, 14, y);
  return y + 8;
}

export function drawTableHeader(pdf, headers, colX, y) {
  pdf.setFillColor(241, 245, 249);
  pdf.rect(10, y - 5, 190, 8, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  headers.forEach((header, index) => {
    pdf.text(header, colX[index], y);
  });

  pdf.setDrawColor(203, 213, 225);
  pdf.line(10, y + 3, 200, y + 3);

  return y + 10;
}

export function ensurePageSpace(pdf, y, neededHeight, headerDrawer = null) {
  if (y + neededHeight <= 280) return y;

  pdf.addPage();
  let newY = 18;

  if (headerDrawer) {
    newY = headerDrawer(pdf, newY);
  }

  return newY;
}

export function drawSimpleRow(pdf, rowLines, colX, y, rowHeight) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);

  rowLines.forEach((cellLines, index) => {
    pdf.text(cellLines, colX[index], y);
  });

  pdf.setDrawColor(241, 245, 249);
  pdf.line(10, y + rowHeight - 2, 200, y + rowHeight - 2);

  return y + rowHeight;
}

export function addPdfFooter(pdf, text = "Document genere par EasyFrais") {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(text, pageWidth / 2, 290, { align: "center" });
}

export async function convertImageDataUrlToJpeg(dataUrl, quality = 0.88) {
  const img = new Image();
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width: canvas.width,
    height: canvas.height
  };
}

export async function addJustificatifsPages(pdf, items, buildMetaText) {
  for (const item of items) {
    if (!item?.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(17, 24, 39);
      pdf.text("Justificatif", margin, 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const meta = buildMetaText(item);
      const lines = pdf.splitTextToSize(meta, pageWidth - margin * 2);
      pdf.text(lines, margin, 22);

      const startY = 22 + lines.length * 5 + 6;
      const converted = await convertImageDataUrlToJpeg(item.justificatif.data);

      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - startY - margin;

      let imgWidth = converted.width;
      let imgHeight = converted.height;

      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      imgWidth *= ratio;
      imgHeight *= ratio;

      pdf.addImage(
        converted.dataUrl,
        "JPEG",
        (pageWidth - imgWidth) / 2,
        startY,
        imgWidth,
        imgHeight
      );
    } catch (error) {
      console.error("Erreur ajout justificatif PDF :", error);
    }
  }
}