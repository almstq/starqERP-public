/**
 * SERP-234 — mapping a real `Invoice` onto the bilingual print sheet.
 *
 * `BilingualInvoicePrintView` was built, tested and then left unreachable: nothing
 * in the router imported it, so the Dhivehi/English tax invoice could not be produced
 * by any user. It is a PRESENTATIONAL component — it accepts an `invoice` prop and
 * falls back to a demo invoice when handed none. That fallback is why the screen
 * "looked finished": it renders convincingly against a fixture.
 *
 * This mapper is the wiring step. It is deliberately a pure function so the mapping
 * is provable without rendering, and it is READ-ONLY: nothing here writes, posts or
 * proposes a journal, so no new write path is introduced and the command contract in
 * `contracts/commands.ts` is not bypassed.
 *
 * TWO FIELDS CANNOT BE SUPPLIED FROM REAL DATA TODAY. They are returned absent
 * rather than invented, and each is a recorded gap, not an oversight:
 *
 *   1. `customerTin` — `Customer` (types/erp.ts:29) has no TIN field at all. A
 *      Maldivian B2B buyer needs the seller's TIN *and* their own on a tax invoice
 *      to claim input GST, so this is a real data-model gap that blocks the screen
 *      being called compliant for B2B. The print view already renders the customer
 *      TIN line conditionally, so its absence degrades honestly.
 *   2. `descriptionDhivehi` — `InvoiceLineItem` (types/erp.ts:128) carries only an
 *      English `description`. The view falls back to the English text, so a
 *      "bilingual" invoice is today bilingual in its CHROME (labels, headings,
 *      totals) and English in its LINE ITEMS.
 *
 * Neither gap is invented away here. Closing them is a data-model change.
 */

import type { Invoice, OrganisationTenant } from '../types/erp';

/**
 * The shape `BilingualInvoicePrintView` accepts. Mirrors the view's own
 * `InvoicePrintData` interface; kept structurally identical on purpose so the
 * compiler catches drift between the two.
 */
export interface InvoicePrintData {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerTin?: string;
  items: Array<{
    id: string;
    description: string;
    descriptionDhivehi?: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
    amount: number;
  }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: 'MVR' | 'USD';
  status: string;
}

/**
 * Map a stored invoice onto the bilingual print sheet.
 *
 * `tenant` supplies the currency only. The seller TIN is read by the view itself
 * from `currentTenant.tinNumber`, which is documented as empty until MIRA
 * registration is verified — so an unregistered tenant prints a dash, never a
 * placeholder TIN.
 */
export function toInvoicePrintData(
  invoice: Invoice,
  tenant: Pick<OrganisationTenant, 'currency'>,
): InvoicePrintData {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    // The stored field is `date`; the print sheet calls it `issueDate`.
    issueDate: invoice.date,
    dueDate: invoice.dueDate,
    customerName: invoice.customerName,
    // Absent by necessity — see the header note. Not defaulted to the tenant's
    // own TIN, which would print the seller's number in the buyer's position.
    customerTin: undefined,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      // Absent by necessity — see the header note.
      descriptionDhivehi: undefined,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      // GST is held at invoice level (`Invoice.gstRate`), not per line. Every line
      // therefore carries the invoice's rate. This is faithful to the stored data:
      // it is not a per-line rate that happens to be equal, it is one rate shown
      // per line, and a future mixed-rate invoice would need a real per-line field.
      gstRate: invoice.gstRate,
      amount: item.amount,
    })),
    subtotal: invoice.subtotal,
    // Stored as `gstAmount`; the sheet calls it `taxAmount`.
    taxAmount: invoice.gstAmount,
    totalAmount: invoice.totalAmount,
    currency: tenant.currency,
    status: invoice.status,
  };
}
