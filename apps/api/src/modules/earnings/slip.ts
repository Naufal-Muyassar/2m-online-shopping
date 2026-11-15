import PDFDocument from "pdfkit";
import { formatIDR } from "@2m/shared";
import type { WithdrawalSlipRow } from "./repo";

// Brand colours from the tailwind preset (ink, primary ink blue, muted text, sand hairline and tint).
const INK = "#121E2B";
const PRIMARY = "#1E3A5F";
const MUTED = "#625D55";
const HAIRLINE = "#DDD6C8";
const TINT = "#F4F0E8";

const UNITS = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

// Indonesian amount in words ("terbilang"), for integers below one trillion.
export function terbilang(n: number): string {
  if (n < 12) return UNITS[n]!;
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`.trim();
  if (n < 200) return `seratus ${terbilang(n - 100)}`.trim();
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`.trim();
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`.trim();
  if (n < 1_000_000) return `${terbilang(Math.floor(n / 1000))} ribu ${terbilang(n % 1000)}`.trim();
  if (n < 1_000_000_000) return `${terbilang(Math.floor(n / 1_000_000))} juta ${terbilang(n % 1_000_000)}`.trim();
  return `${terbilang(Math.floor(n / 1_000_000_000))} miliar ${terbilang(n % 1_000_000_000)}`.trim();
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Date-based and short enough to read aloud: PNR-261116-1A2B3C.
export function slipNumber(row: Pick<WithdrawalSlipRow, "id" | "created_at" | "branch_timezone">): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: row.branch_timezone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(row.created_at);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `PNR-${part("year")}${part("month")}${part("day")}-${row.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

const when = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);

// One A5 page: who, how much (in figures and words), the balance before and after, and two signature lines.
export function renderWithdrawalSlip(row: WithdrawalSlipRow, now = new Date()): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A5",
    margin: 36,
    info: { Title: `Slip penarikan ${slipNumber(row)}`, Author: "2M Sembako", Subject: "Slip penarikan saldo kurir" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const right = left + width;
  const rule = (y: number, color = HAIRLINE, w = 0.75) =>
    doc.moveTo(left, y).lineTo(right, y).lineWidth(w).strokeColor(color).stroke();

  // Header
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text("2M Sembako", left, 36);
  const branch = /^cabang\b/i.test(row.branch_name) ? row.branch_name : `Cabang ${row.branch_name}`;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(branch, left, 54);
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(PRIMARY)
    .text("SLIP PENARIKAN SALDO", left, 38, { width, align: "right", characterSpacing: 0.6 });
  doc.font("Helvetica").fontSize(9).fillColor(INK).text(slipNumber(row), left, 54, { width, align: "right" });
  rule(74, INK, 1.25);

  // Details
  let y = 88;
  const detail = (label: string, value: string) => {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(label, left, y, { width: 110 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK).text(value, left + 110, y - 0.5, { width: width - 110 });
    y = Math.max(doc.y, y + 12) + 6;
  };
  detail("Tanggal", when(row.created_at, row.branch_timezone));
  detail("Kurir", row.courier_name);
  detail("Telepon", row.courier_phone);
  detail("Mitra kurir", row.partner_name);
  detail("Dicatat oleh", row.recorded_by_name);

  // Amount
  y += 6;
  const boxTop = y;
  doc.font("Helvetica").fontSize(8.5);
  const words = `${capitalise(terbilang(row.amount))} rupiah`;
  const wordsHeight = doc.heightOfString(words, { width: width - 28 });
  const boxHeight = 66 + wordsHeight;
  doc.roundedRect(left, boxTop, width, boxHeight, 8).fillColor(TINT).fill();
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Jumlah tunai diserahkan", left + 14, boxTop + 12);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text(formatIDR(row.amount), left + 14, boxTop + 26);
  doc
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(words, left + 14, boxTop + 54, { width: width - 28 });
  y = boxTop + boxHeight + 14;

  // Balance
  const balanceRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(INK).text(label, left, y);
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(value, left, y, { width, align: "right" });
    y += 18;
  };
  balanceRow("Saldo sebelum penarikan", formatIDR(row.balance_after + row.amount));
  balanceRow("Ditarik", `- ${formatIDR(row.amount)}`);
  rule(y - 4);
  y += 4;
  balanceRow("Saldo setelah penarikan", formatIDR(row.balance_after), true);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(MUTED)
    .text("Uang tunai di atas sudah diserahkan kepada kurir di cabang. Penarikan yang sudah dicatat tidak bisa dibatalkan.", left, y + 4, {
      width,
    });

  // Signatures
  const sigTop = Math.max(doc.y + 26, 430);
  const colWidth = (width - 24) / 2;
  const signature = (x: number, role: string, name: string) => {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(role, x, sigTop, { width: colWidth, align: "center" });
    doc
      .moveTo(x + 10, sigTop + 58)
      .lineTo(x + colWidth - 10, sigTop + 58)
      .lineWidth(0.75)
      .strokeColor(INK)
      .stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(name, x, sigTop + 64, { width: colWidth, align: "center" });
  };
  signature(left, "Diserahkan oleh (admin cabang)", row.recorded_by_name);
  signature(left + colWidth + 24, "Diterima oleh (kurir)", row.courier_name);

  // Footer
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  rule(footerY - 6);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(MUTED)
    .text(`ID transaksi ${row.id}`, left, footerY, { width, lineBreak: false })
    .text(`Dicetak ${when(now, row.branch_timezone)}`, left, footerY + 9, { width, lineBreak: false });

  doc.end();
  return done;
}
