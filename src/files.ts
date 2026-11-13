import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { config } from "./config.js";

export type AgreementPdfData = {
  companyName: string;
  companyInfo: string;
  productName: string;
  productDetails: string;
  creatorName: string;
  campaignName: string;
  startDate: string;
  endDate: string;
  deliverables: string;
  platform: string;
  contentRequirements: string;
  initialPayment: string;
  performanceTerms: string;
  additionalConditions: string;
  performanceTiers?: Array<{ views: number; amount: number; label?: string }>;
  creatorSignatureName?: string | null;
  creatorSignedAt?: string | null;
  brandSignedAt?: string | null;
};

export function renderAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 50;
    const pageWidth = doc.page.width - margin * 2;
    const primaryColor = "#111111";
    const bodyColor = "#2b2b2b";
    const mutedColor = "#666666";
    const lineLight = "#dcdcdc";
    const lineDark = "#111111";

    const cleanText = (str?: string | null) => (str ? str.replaceAll("₹", "Rs. ").trim() : "");

    // --- Header Section ---
    doc.fillColor(primaryColor).fontSize(22).font("Helvetica-Bold").text("ChooseYourCreator", margin, 45, { characterSpacing: 1.5 });
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(mutedColor).text("CREATOR COLLABORATION & INFLUENCER MARKETING AGREEMENT", margin, 72, { characterSpacing: 1.2 });

    // Header Right Box: Document Metadata
    const metaX = margin + pageWidth - 210;
    doc.fontSize(8).font("Helvetica").fillColor(mutedColor);
    doc.text(`ISSUED: ${cleanText(data.startDate) || "Today"}`, metaX, 48, { align: "right", width: 210 });
    doc.text(`CAMPAIGN EXPIRY: ${cleanText(data.endDate) || "Not specified"}`, metaX, 60, { align: "right", width: 210 });
    doc.text("ESCROW: ZERO PLATFORM COMMISSION", metaX, 72, { align: "right", width: 210 });

    // Decorative Header Lines
    doc.strokeColor(lineDark).lineWidth(1.5).moveTo(margin, 88).lineTo(margin + pageWidth, 88).stroke();
    doc.strokeColor(lineLight).lineWidth(0.5).moveTo(margin, 91).lineTo(margin + pageWidth, 91).stroke();

    doc.y = 104;

    // Helper: Section title banner
    const addSectionHeader = (numberStr: string, titleStr: string) => {
      // Ensure sufficient space before section header
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
      }
      doc.moveDown(0.6);
      const curY = doc.y;
      doc.fillColor(primaryColor).fontSize(10.5).font("Helvetica-Bold").text(`${numberStr}. ${titleStr.toUpperCase()}`, margin, curY, { characterSpacing: 0.8 });
      doc.moveDown(0.3);
      doc.strokeColor(lineLight).lineWidth(0.75).moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y).stroke();
      doc.moveDown(0.6);
    };

    // Helper: Field row (shows content if filled, otherwise an elegant blank line)
    const addField = (label: string, value: string | null | undefined, optional = false, multiline = false) => {
      const val = cleanText(value);
      const isBlank = !val || val === "None" || val === "Not applicable";

      if (doc.y > doc.page.height - 75) {
        doc.addPage();
      }

      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text(label);
      doc.moveDown(0.15);

      if (!isBlank) {
        doc.fillColor(bodyColor).fontSize(9).font("Helvetica");
        doc.text(val, { align: "left", width: pageWidth, lineGap: 2 });
      } else {
        // Render a clean fillable blank line for optional fields that were not filled
        doc.fillColor("#8e8e8e").fontSize(8.5).font("Helvetica");
        if (optional) {
          doc.text("_______________________________________________________________________________________");
          doc.moveDown(0.15);
          doc.fillColor("#a0a0a0").fontSize(7.5).font("Helvetica-Oblique").text("(Optional field left blank by mutual agreement)");
        } else {
          doc.text("_______________________________________________________________________________________");
        }
      }
      doc.moveDown(0.5);
    };

    // --- Section 1: The Contracting Parties ---
    addSectionHeader("1", "The Contracting Parties");

    const colWidth = (pageWidth - 20) / 2;
    const startPartiesY = doc.y;

    // Brand Column (Left)
    doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("THE BRAND / SPONSOR:", margin, startPartiesY);
    doc.moveDown(0.2);
    doc.fillColor(bodyColor).fontSize(9).font("Helvetica").text(`Company: ${cleanText(data.companyName) || "Brand Partner"}`);
    const brandInfo = cleanText(data.companyInfo);
    if (brandInfo) {
      doc.fillColor(mutedColor).fontSize(8).font("Helvetica").text(brandInfo, { width: colWidth, lineGap: 1.5 });
    } else {
      doc.fillColor("#8e8e8e").fontSize(8).font("Helvetica").text("Details: _________________________________________");
    }
    const brandColBottom = doc.y;

    // Creator Column (Right)
    const rightColX = margin + colWidth + 20;
    doc.fillColor(primaryColor).fontSize(9.5).font("Helvetica-Bold").text("THE CREATOR / TALENT:", rightColX, startPartiesY);
    doc.moveDown(0.2);
    doc.fillColor(bodyColor).fontSize(9).font("Helvetica").text(`Creator Name: ${cleanText(data.creatorName) || "Creator Partner"}`, rightColX);
    doc.fillColor(mutedColor).fontSize(8).font("Helvetica").text(`Primary Platform: ${cleanText(data.platform) || "Social Media"}`, rightColX);
    const creatorColBottom = doc.y;

    doc.y = Math.max(brandColBottom, creatorColBottom) + 8;

    // --- Section 2: Campaign Scope & Validity Timeline ---
    addSectionHeader("2", "Campaign Scope & Validity Timeline");

    addField("Campaign Title", data.campaignName);
    addField("Promoted Product / Service", data.productName);
    addField("Product Specifications & Details (Optional)", data.productDetails, true, true);

    // Timeline Row
    doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text("Campaign Validity & Expiry Timeline:");
    doc.moveDown(0.2);
    doc.fillColor(bodyColor).fontSize(8.5).font("Helvetica");
    const sDate = cleanText(data.startDate) || "Agreement Date";
    const eDate = cleanText(data.endDate) || "End Date";
    doc.text(`Effective Start Date: ${sDate}    |    Campaign Valid End Date (Expiry): ${eDate}`);
    doc.moveDown(0.15);
    doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica-Oblique").text("Note: Campaign and collaboration will automatically reach EXPIRED status once the valid end date passes.");
    doc.moveDown(0.6);

    // --- Section 3: Deliverables & Content Requirements ---
    addSectionHeader("3", "Deliverables & Content Specifications");
    addField("Agreed Deliverables", data.deliverables, false, true);
    addField("Content Guidelines & Requirements", data.contentRequirements, false, true);

    // --- Section 4: Compensation & Escrow Payment Structure ---
    addSectionHeader("4", "Compensation & Escrow Terms");

    // Initial Payment Box
    doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text("1. Initial Payment (Secured in Escrow Holding):");
    doc.moveDown(0.2);
    doc.fillColor(bodyColor).fontSize(9).font("Helvetica");
    doc.text(`Agreed Amount: ${cleanText(data.initialPayment)}`);
    doc.moveDown(0.15);
    doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica-Oblique").text("Terms: Deposited by the brand into secure ChooseYourCreator escrow prior to work commencement. 0% platform fee deducted. Released to creator upon brand approval of final deliverable.");
    doc.moveDown(0.6);

    // Performance Milestone Tiers
    doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text("2. View-Based Performance Milestone Bonuses (Direct Settlement):");
    doc.moveDown(0.3);

    if (data.performanceTiers && data.performanceTiers.length > 0) {
      // Table Header
      const tableY = doc.y;
      doc.fillColor("#f5f5f5").rect(margin, tableY, pageWidth, 18).fill();
      doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold");
      doc.text("MILESTONE", margin + 10, tableY + 5, { width: 140 });
      doc.text("VIEWS TARGET", margin + 160, tableY + 5, { width: 120 });
      doc.text("BONUS AMOUNT (INR)", margin + 290, tableY + 5, { width: 140 });
      doc.text("PAYMENT METHOD", margin + 440, tableY + 5, { width: 80 });

      doc.y = tableY + 22;

      data.performanceTiers.forEach((tier, index) => {
        const rowY = doc.y;
        if (rowY > doc.page.height - 60) {
          doc.addPage();
        }
        const label = tier.label || `Milestone ${index + 1}`;
        const viewsStr = tier.views >= 1000000
          ? `${(tier.views / 1000000).toFixed(1)}M views`
          : tier.views >= 1000
          ? `${(tier.views / 1000).toFixed(0)}K views`
          : `${tier.views.toLocaleString("en-IN")} views`;
        const amtStr = `Rs. ${tier.amount.toLocaleString("en-IN")}`;

        doc.fillColor(bodyColor).fontSize(8.5).font("Helvetica");
        doc.text(label, margin + 10, rowY, { width: 140 });
        doc.text(viewsStr, margin + 160, rowY, { width: 120 });
        doc.font("Helvetica-Bold").text(amtStr, margin + 290, rowY, { width: 140 }).font("Helvetica");
        doc.text("Direct Brand Settlement", margin + 440, rowY, { width: 80 });

        doc.moveDown(0.4);
        doc.strokeColor(lineLight).lineWidth(0.5).moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y).stroke();
        doc.moveDown(0.4);
      });

      doc.fillColor(mutedColor).fontSize(7.5).font("Helvetica-Oblique");
      doc.text("Performance bonuses are unlocked sequentially: initial payment must be released first, followed by each milestone bonus requested and settled one by one.", { width: pageWidth });
      doc.moveDown(0.6);
    } else {
      // Optional field NOT filled: Show blank fillable lines instead of omitting
      doc.fillColor("#8e8e8e").fontSize(8.5).font("Helvetica");
      doc.text("Milestone Target Views: _________________________     Bonus Amount: _________________________");
      doc.moveDown(0.2);
      doc.fillColor("#a0a0a0").fontSize(7.5).font("Helvetica-Oblique").text("(Optional field left blank — no performance milestone bonuses configured for this campaign)");
      doc.moveDown(0.6);
    }

    // Additional performance notes if any or blank line
    if (data.performanceTerms && cleanText(data.performanceTerms) && cleanText(data.performanceTerms) !== "None") {
      addField("Performance Verification Notes", data.performanceTerms, false, true);
    }

    // --- Section 5: Additional Terms & Conditions (Optional) ---
    addSectionHeader("5", "Additional Terms, Usage Rights & Exclusivity (Optional)");
    addField("Special Conditions / Usage Rights", data.additionalConditions, true, true);

    // --- Section 6: Signatures & Digital Execution ---
    addSectionHeader("6", "Digital Signatures & Execution");

    if (doc.y > doc.page.height - 110) {
      doc.addPage();
    }

    const sigY = doc.y + 4;
    const sigBoxWidth = (pageWidth - 20) / 2;

    // Brand Signature Box
    doc.strokeColor(lineLight).lineWidth(0.75).rect(margin, sigY, sigBoxWidth, 75).stroke();
    doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold").text("ISSUED & AUTHORIZED BY BRAND", margin + 10, sigY + 8);
    doc.fillColor(bodyColor).fontSize(8.5).font("Helvetica");
    doc.text(`Authorized: ${cleanText(data.companyName) || "Brand Sponsor"}`, margin + 10, sigY + 22);
    doc.text(`Issue Date: ${cleanText(data.brandSignedAt) || cleanText(data.startDate) || "Recorded"}`, margin + 10, sigY + 36);
    doc.fillColor("#15803d").fontSize(8).font("Helvetica-Bold").text("✓ Digitally Issued via ChooseYourCreator", margin + 10, sigY + 54);

    // Creator Signature Box
    const cSigX = margin + sigBoxWidth + 20;
    doc.strokeColor(lineLight).lineWidth(0.75).rect(cSigX, sigY, sigBoxWidth, 75).stroke();
    doc.fillColor(primaryColor).fontSize(8).font("Helvetica-Bold").text("ACCEPTED & SIGNED BY CREATOR", cSigX + 10, sigY + 8);
    doc.fillColor(bodyColor).fontSize(8.5).font("Helvetica");
    if (data.creatorSignatureName && data.creatorSignedAt) {
      doc.text(`Signer: ${cleanText(data.creatorSignatureName)}`, cSigX + 10, sigY + 22);
      doc.text(`Signed Date: ${cleanText(data.creatorSignedAt)}`, cSigX + 10, sigY + 36);
      doc.fillColor("#15803d").fontSize(8).font("Helvetica-Bold").text("✓ Digitally Signed & Binding", cSigX + 10, sigY + 54);
    } else {
      doc.fillColor("#8e8e8e").text("Signature: __________________________________", cSigX + 10, sigY + 24);
      doc.text("Date: _______________________________________", cSigX + 10, sigY + 38);
      doc.fillColor(mutedColor).fontSize(8).font("Helvetica-Oblique").text("○ Awaiting Creator Digital Signature", cSigX + 10, sigY + 54);
    }

    doc.y = sigY + 85;

    // Footer note
    doc.moveDown(0.8);
    doc.strokeColor(lineLight).lineWidth(0.5).moveTo(margin, doc.y).lineTo(margin + pageWidth, doc.y).stroke();
    doc.moveDown(0.4);
    doc.fontSize(7.5).fillColor(mutedColor).font("Helvetica");
    doc.text(
      "ChooseYourCreator operates as a zero-commission collaboration marketplace. Initial escrow payments are held securely and released upon deliverable approval. View-based performance milestone bonuses are settled directly between brand and creator.",
      margin,
      doc.y,
      { align: "center", width: pageWidth, lineGap: 1.5 }
    );

    doc.end();
  });
}

export async function writeUpload(key: string, body: Buffer) {
  const full = safeUploadPath(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, body);
  return key;
}

export async function deleteUpload(key: string) {
  const full = safeUploadPath(key);
  if (fs.existsSync(full)) {
    await fs.promises.unlink(full);
  }
}

export function safeUploadPath(key: string): string {
  const root = path.resolve(config.uploadsDir);
  const full = path.resolve(root, key);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid file path");
  }
  return full;
}
