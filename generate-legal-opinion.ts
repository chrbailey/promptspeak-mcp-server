/**
 * Generate Word Document - FCC Drone Legal Opinion
 *
 * This script generates a professional legal opinion document in .docx format
 * using the docx npm package.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  convertInchesToTwip,
  Footer,
  Header,
  PageNumber,
  NumberFormat,
} from 'docx';
import * as fs from 'fs';

// Document metadata
const MATTER = 'Drone Supply Chain Compliance';
const DATE = 'January 3, 2026';
const AUTHOR = 'AI-Assisted Legal Analysis';

// Create the document
const doc = new Document({
  styles: {
    paragraphStyles: [
      {
        id: 'Normal',
        name: 'Normal',
        run: {
          font: 'Times New Roman',
          size: 24, // 12pt
        },
        paragraph: {
          spacing: { after: 200, line: 276 }, // 1.15 line spacing
        },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'PRIVILEGED AND CONFIDENTIAL',
                  font: 'Times New Roman',
                  size: 20,
                  bold: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Page ',
                  font: 'Times New Roman',
                  size: 20,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: 'Times New Roman',
                  size: 20,
                }),
                new TextRun({
                  text: ' of ',
                  font: 'Times New Roman',
                  size: 20,
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: 'Times New Roman',
                  size: 20,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children: [
        // HEADER BLOCK
        new Paragraph({
          children: [
            new TextRun({
              text: 'LEGAL OPINION',
              bold: true,
              size: 32,
              font: 'Times New Roman',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),

        // Metadata table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Date:', bold: true, font: 'Times New Roman', size: 24 })] })],
                  width: { size: 15, type: WidthType.PERCENTAGE },
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: DATE, font: 'Times New Roman', size: 24 })] })],
                  width: { size: 85, type: WidthType.PERCENTAGE },
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Re:', bold: true, font: 'Times New Roman', size: 24 })] })],
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'FCC UAS Covered List - Sub-Components, Design Work, and Value-Add from CCP-Related Countries', font: 'Times New Roman', size: 24 })] })],
                  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ spacing: { after: 400 } }),

        // HORIZONTAL LINE
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
          spacing: { after: 400 },
        }),

        // QUESTION PRESENTED
        new Paragraph({
          children: [new TextRun({ text: 'QUESTION PRESENTED', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'In light of the FCC\'s December 2025 addition of foreign-produced UAS and UAS critical components to the Covered List, what is the regulatory treatment of: (1) sub-components within critical components; (2) design and engineering services from targeted countries; and (3) value-added work involving targeted country participation?',
              font: 'Times New Roman',
              size: 24,
            }),
          ],
          spacing: { after: 400 },
        }),

        // SHORT ANSWER
        new Paragraph({
          children: [new TextRun({ text: 'SHORT ANSWER', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: 'The regulatory framework creates significant ambiguity for sub-components, design services, and value-added work. While the FCC\'s action clearly prohibits new equipment authorizations for complete UAS and enumerated critical components produced in foreign countries, the following areas require careful analysis:',
              font: 'Times New Roman',
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '1. Sub-Components: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Not explicitly addressed. The "includes but is not limited to" language suggests potential broad interpretation, but FCC has not provided definitive guidance.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '2. Design Services: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Likely outside the prohibition when not producing covered equipment, but software integrated into critical components may be implicated. ITAR/EAR considerations apply separately.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '3. Value-Added Work: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'The meaning of "produced in a foreign country" is undefined. Until clarified, assume country-of-origin rules apply at the component level.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
          indent: { left: convertInchesToTwip(0.5) },
        }),

        // DISCUSSION
        new Paragraph({
          children: [new TextRun({ text: 'DISCUSSION', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),

        // I. Background
        new Paragraph({
          children: [new TextRun({ text: 'I. Regulatory Background', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'On December 22, 2025, the FCC\'s Public Safety and Homeland Security Bureau added all foreign-produced uncrewed aircraft systems (UAS) and UAS critical components to the Covered List established under Section 2 of the Secure and Trusted Communications Networks Act of 2019, 47 U.S.C. § 1601 ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'et seq.', italics: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: ' This action, documented in DA 25-1086, incorporates a National Security Determination finding that such equipment "pose[s] an unacceptable risk to the national security of the United States."', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The prohibition covers enumerated "UAS critical components" including: data transmission devices, communications systems, flight controllers, ground control stations, navigation systems, sensors and cameras, batteries and battery management systems, motors, and "any associated software." This list is explicitly non-exhaustive ("includes but is not limited to").', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
        }),

        // II. Sub-Components Analysis
        new Paragraph({
          children: [new TextRun({ text: 'II. Analysis: Sub-Components', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The current regulatory framework does not explicitly address whether sub-components of critical components (e.g., individual microprocessors within a flight controller, or capacitors within a battery management system) are independently covered.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Two interpretive frameworks are plausible:', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Narrow Interpretation: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'The enumerated list focuses on functional systems with independent communications or operational capability. A bare semiconductor chip, lacking such capability, may fall outside the prohibition.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Broad Interpretation: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'The "includes but is not limited to" language, combined with stated national security rationale regarding data exfiltration, suggests regulators may interpret coverage expansively. The FCC has historically adopted broad interpretations of "production" in Covered List contexts.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Recommendation: ', bold: true, italics: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Until FCC issues clarifying guidance, treat sub-components with caution. Conduct supply chain audits identifying country of origin for all components, and prepare compliance documentation.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
        }),

        // III. Design Services
        new Paragraph({
          children: [new TextRun({ text: 'III. Analysis: Design and Engineering Services', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The Covered List framework targets "communications equipment" and "video surveillance equipment," defined by reference to physical devices. Pure design and engineering services—circuit design, systems engineering, consulting—performed in targeted countries are not expressly addressed.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'However, three considerations complicate this analysis:', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'First, ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'the definition of critical components includes "any associated software." Design work producing software integrated into critical components may implicate the prohibition.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Second, ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'design services involving drone technology may separately implicate export control regulations under ITAR (22 C.F.R. Parts 120-130) or EAR (15 C.F.R. Parts 730-774). These regimes operate independently.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Third, ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'the FY2026 NDAA (currently pending) may expand restrictions to cover integrated software and 5030-5091 MHz spectrum equipment from foreign entities.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Recommendation: ', bold: true, italics: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Pure design services with no software deliverable and domestic production likely fall outside current restrictions. However, if software is produced or if ITAR/EAR-controlled technology is involved, separate analysis is required.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
        }),

        // IV. Value-Added Work
        new Paragraph({
          children: [new TextRun({ text: 'IV. Analysis: Value-Added Work from Targeted Countries', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The critical undefined question is whether "produced in a foreign country" refers to: (a) final assembly location; (b) location of substantial transformation; or (c) country of origin of component parts.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Three scenarios illustrate the ambiguity:', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Scenario A (U.S. Assembly of Foreign Components): ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'A U.S. company assembles UAS domestically using Chinese-made motors and flight controllers. Under a strict reading, the individual components are "produced in a foreign country" and may be independently prohibited from receiving new authorizations.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Scenario B (Foreign Assembly of U.S. Components): ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'A U.S. company manufactures all components domestically but performs final assembly in China. The assembled UAS is likely "produced in a foreign country" and therefore covered.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Scenario C (Integrated Value Chain): ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Components flow between countries for manufacturing stages. Determining "production" location becomes highly fact-specific.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Note that customs law "substantial transformation" principles may inform interpretation, but the FCC has not adopted this framework for Covered List determinations.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Recommendation: ', bold: true, italics: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Assume component-level country-of-origin rules apply until FCC clarifies. Map all suppliers by country of origin and identify exposure.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
        }),

        // V. Exemptions
        new Paragraph({
          children: [new TextRun({ text: 'V. Available Exemptions', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'Three potential exemption pathways exist:', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '1. DoD/DHS Determination: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Equipment may be excluded if the Department of Defense or Department of Homeland Security determines that a specific UAS or component class does not pose an unacceptable risk.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '2. Blue UAS List: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'The Defense Innovation Unit maintains a "Blue UAS" cleared list. Whether inclusion provides a Covered List exemption pathway remains unclear.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '3. Existing Authorizations: ', bold: true, font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Previously FCC-authorized equipment is grandfathered. Import, sale, and use of existing authorized models continues to be permitted.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
          indent: { left: convertInchesToTwip(0.5) },
        }),

        // CONCLUSION
        new Paragraph({
          children: [new TextRun({ text: 'CONCLUSION', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The December 2025 FCC action creates a broad prohibition on foreign-produced UAS and critical components, but leaves significant ambiguity regarding sub-components, design services, and value-added work. Until clarifying guidance issues, we recommend:', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '1. Conduct comprehensive supply chain audits identifying country of origin for all components', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '2. Prepare compliance documentation for FCC equipment authorization applications', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '3. Identify alternative suppliers in non-covered countries', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '4. Monitor FCC proceedings for interpretive guidance', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
          indent: { left: convertInchesToTwip(0.5) },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '5. Consider regulatory engagement through comments seeking clarification', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
          indent: { left: convertInchesToTwip(0.5) },
        }),

        // HORIZONTAL LINE
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
          spacing: { after: 400 },
        }),

        // VALIDATION SECTION
        new Paragraph({
          children: [new TextRun({ text: 'VALIDATION CHECKLIST', bold: true, font: 'Times New Roman', size: 24 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: 'The following items require attorney verification before reliance:', font: 'Times New Roman', size: 24, italics: true }),
          ],
          spacing: { after: 200 },
        }),

        // Checklist items
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Verify statutory citation: 47 U.S.C. § 1601 et seq.', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Verify FCC action date: December 22, 2025 (DA 25-1086)', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Verify ITAR citation: 22 C.F.R. Parts 120-130', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Verify EAR citation: 15 C.F.R. Parts 730-774', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Confirm "all foreign countries" vs. specific country scope', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Verify FY2026 NDAA current status and provisions', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Confirm Blue UAS list relationship to FCC Covered List', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '☐ ', font: 'Times New Roman', size: 24 }),
            new TextRun({ text: 'Review sub-component analysis as opinion, not FCC guidance', font: 'Times New Roman', size: 24 }),
          ],
          spacing: { after: 400 },
        }),

        // DISCLAIMER
        new Paragraph({
          border: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
          shading: { fill: 'F0F0F0' },
          children: [
            new TextRun({ text: 'AI-ASSISTED PREPARATION DISCLOSURE', bold: true, font: 'Times New Roman', size: 22 }),
          ],
          spacing: { after: 100 },
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
          },
          shading: { fill: 'F0F0F0' },
          children: [
            new TextRun({ text: 'This document was prepared with AI assistance using PromptSpeak Legal MVP v1.0. All citations and factual claims have been flagged for verification. This document does not constitute legal advice and should not be relied upon without review by qualified legal counsel.', font: 'Times New Roman', size: 20 }),
          ],
          spacing: { after: 400 },
        }),

        // Sources
        new Paragraph({
          children: [new TextRun({ text: 'SOURCES', bold: true, font: 'Times New Roman', size: 24 })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '• FCC Covered List: https://www.fcc.gov/supplychain/coveredlist', font: 'Times New Roman', size: 22 })],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '• FCC DA 25-1086: https://docs.fcc.gov/public/attachments/DA-25-1086A1.pdf', font: 'Times New Roman', size: 22 })],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '• Wiley Law Analysis: https://www.wiley.law/alert-In-Unexpected-First-of-Its-Kind-Action-FCC-Adds-All-Foreign-Produced-Uncrewed-Aircraft-Systems-and-UAS-Critical-Components-to-Covered-List', font: 'Times New Roman', size: 22 })],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '• Akin Gump Analysis: https://www.akingump.com/en/insights/alerts/fcc-adds-all-foreign-made-uas-and-uas-critical-components-to-covered-list', font: 'Times New Roman', size: 22 })],
          spacing: { after: 200 },
        }),

        // Date stamp
        new Paragraph({
          children: [
            new TextRun({ text: `Generated: ${DATE}`, font: 'Times New Roman', size: 20, italics: true }),
          ],
          alignment: AlignmentType.RIGHT,
        }),
      ],
    },
  ],
});

// Generate the document
async function generateDocument() {
  const buffer = await Packer.toBuffer(doc);
  const outputPath = './output/FCC-Drone-Legal-Opinion.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Word document generated: ${outputPath}`);
  console.log(`   File size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

generateDocument().catch(console.error);
