/**
 * Dhivehi (Thaana) Commerce & Statutory Document Dictionary
 * Supporting Unicode Thaana Range (U+0780..U+07BF) & Right-to-Left (RTL) document rendering.
 */

export interface DhivehiCommerceTerms {
  taxInvoice: string;
  receipt: string;
  quotation: string;
  purchaseOrder: string;
  invoiceNo: string;
  date: string;
  dueDate: string;
  tinNo: string;
  customerName: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  subtotal: string;
  gst8Percent: string;
  tgst16Percent: string;
  greenTax: string;
  totalAmountDue: string;
  amountPaid: string;
  balanceDue: string;
  bankDetails: string;
  favaraInstantPay: string;
  thankYouMessage: string;
  paymentTerms: string;
}

export const DHIVEHI_COMMERCE_DICTIONARY: DhivehiCommerceTerms = {
  taxInvoice: 'ޓެކްސް އިންވޮއިސް',
  receipt: 'ފައިސާ ލިބުނު ރަސީދު',
  quotation: 'އަގުބަޔާން (ކޯޓޭޝަން)',
  purchaseOrder: 'ތަކެތި ގަތުމުގެ އަމުރު (ޕީ.އޯ)',
  invoiceNo: 'އިންވޮއިސް ނަންބަރު:',
  date: 'ތާރީޚް:',
  dueDate: 'ފައިސާ ދައްކަންޖެހޭ ތާރީޚް:',
  tinNo: 'ޓީ.އައި.އެން (TIN):',
  customerName: 'ކަސްޓަމަރުގެ ނަން:',
  itemDescription: 'ތަފްޞީލް',
  quantity: 'ޢަދަދު',
  unitPrice: 'އަގު',
  discount: 'ޑިސްކައުންޓް',
  subtotal: 'ޖުމްލަ އަގު',
  gst8Percent: 'ޖީ.އެސް.ޓީ (%8)',
  tgst16Percent: 'ޓީ.ޖީ.އެސް.ޓީ (%16)',
  greenTax: 'ގްރީން ޓެކްސް',
  totalAmountDue: 'ދައްކަންޖެހޭ ޖުމްލަ ފައިސާ:',
  amountPaid: 'ދެއްކި ފައިސާ:',
  balanceDue: 'ބާކީ ދައްކަންޖެހޭ ޢަދަދު:',
  bankDetails: 'ބޭންކް އެކައުންޓް މަޢުލޫމާތު',
  favaraInstantPay: 'ފަވަރަ / ބީ.އެމް.އެލް އިންސްޓަންޓް ކިއު.އާރް',
  thankYouMessage: 'އަޅުގަނޑުމެންނާއެކު ވިޔަފާރި ކުރެއްވި ކަމަށްޓަކައި ވަރަށް ބޮޑަށް ޝުކުރިއްޔާ!',
  paymentTerms: 'ސުންގަޑީގެ ކުރިން ފައިސާ ދެއްކެވުން އެދެމެވެ.',
};

export const DHIVEHI_MONTH_NAMES = [
  'ޖެނުއަރީ',
  'ފެބްރުއަރީ',
  'މާރިޗު',
  'އޭޕްރީލް',
  'މެއި',
  'ޖޫން',
  'ޖުލައި',
  'އޮގަސްޓް',
  'ސެޕްޓެމްބަރު',
  'އޮކްޓޯބަރު',
  'ނޮވެމްބަރު',
  'ޑިސެމްބަރު',
];

/**
 * Formats a Gregorian date (YYYY-MM-DD) into Dhivehi Thaana textual format (e.g., "28 އޮގަސްޓް 2026").
 */
export function formatDhivehiDate(isoDateString: string): string {
  if (!isoDateString) return '';
  const parts = isoDateString.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDateString;

  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const dhivehiMonth = DHIVEHI_MONTH_NAMES[monthIdx] || parts[1];
  return `${day} ${dhivehiMonth} ${year}`;
}

/**
 * Checks if a string contains Dhivehi Thaana characters (U+0780 to U+07BF).
 */
export function containsThaana(text: string): boolean {
  return /[ހ-޿]/.test(text);
}
