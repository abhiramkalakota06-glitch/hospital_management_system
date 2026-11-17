import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function exportToExcel(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportTableToPDF(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const doc = new jsPDF();
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('CarePlus Health Network', 14, 12);
  doc.setFontSize(10);
  doc.text(title, 14, 20);

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString()}`, 14, 34);

  autoTable(doc, {
    startY: 40,
    head: [headers],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${filename}.pdf`);
}

export function exportPrescriptionPDF(rx: {
  prescriptionCode: string;
  date: string;
  patientName: string;
  patientCode: string;
  doctorName: string;
  items: { medicineName: string; dosage: string; frequency: string; duration: string; instructions: string; quantity: number }[];
}): void {
  const doc = new jsPDF();
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('CarePlus Medical Prescription', 14, 13);
  doc.setFontSize(10);
  doc.text(`Prescription No: ${rx.prescriptionCode}   |   Date: ${rx.date}`, 14, 22);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`Patient: ${rx.patientName} (${rx.patientCode})`, 14, 40);
  doc.text(`Prescribing Physician: ${rx.doctorName}`, 14, 47);

  autoTable(doc, {
    startY: 56,
    head: [['Medicine', 'Dosage', 'Frequency', 'Duration', 'Qty', 'Instructions']],
    body: rx.items.map((i) => [i.medicineName, i.dosage, i.frequency, i.duration, i.quantity, i.instructions]),
    headStyles: { fillColor: [2, 132, 199] },
    styles: { fontSize: 9 },
  });

  doc.save(`${rx.prescriptionCode}.pdf`);
}

export function exportLabReportPDF(lab: {
  requestCode: string;
  testName: string;
  patientName: string;
  patientCode: string;
  doctorName: string;
  sampleId?: string;
  publishedAt?: string;
  verifiedBy?: string;
  observations?: string;
  results: { parameter: string; value: string; unit: string; referenceRange: string; flag: string }[];
}): void {
  const doc = new jsPDF();
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text('CarePlus Diagnostic Laboratory Report', 14, 13);
  doc.setFontSize(10);
  doc.text(`Order: ${lab.requestCode}  |  Sample: ${lab.sampleId || 'N/A'}`, 14, 22);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.text(`Patient: ${lab.patientName} (${lab.patientCode})`, 14, 38);
  doc.text(`Ordering Physician: ${lab.doctorName}`, 14, 45);
  doc.text(`Test Name: ${lab.testName}`, 14, 52);

  autoTable(doc, {
    startY: 60,
    head: [['Parameter', 'Observed Value', 'Unit', 'Reference Range', 'Flag']],
    body: lab.results.map((r) => [r.parameter, r.value, r.unit, r.referenceRange, r.flag]),
    headStyles: { fillColor: [13, 148, 136] },
    styles: { fontSize: 9 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 110;
  doc.setFontSize(9.5);
  if (lab.observations) {
    doc.text(`Observations: ${lab.observations}`, 14, finalY + 12);
  }
  doc.text(`Verified By: ${lab.verifiedBy || 'Laboratory Director'}  |  Published: ${lab.publishedAt?.slice(0, 10) || ''}`, 14, finalY + 22);

  doc.save(`${lab.requestCode}_Report.pdf`);
}

export function exportReceiptPDF(bill: {
  billNumber: string;
  date: string;
  patientName: string;
  patientCode: string;
  items: { category: string; description: string; qty: number; unitPrice: number; total: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
}): void {
  const doc = new jsPDF();
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text('CarePlus Billing Invoice & Receipt', 14, 12);
  doc.setFontSize(10);
  doc.text(`Invoice: ${bill.billNumber}  |  Date: ${bill.date}  |  Status: ${bill.status}`, 14, 20);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.text(`Billed To: ${bill.patientName} (${bill.patientCode})`, 14, 38);

  autoTable(doc, {
    startY: 46,
    head: [['Category', 'Description', 'Qty', 'Unit Price', 'Line Total']],
    body: bill.items.map((i) => [i.category, i.description, i.qty, i.unitPrice.toFixed(2), i.total.toFixed(2)]),
    headStyles: { fillColor: [13, 148, 136] },
    styles: { fontSize: 9 },
  });

  const y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 100) + 12;
  doc.setFontSize(10);
  doc.text(`Subtotal: ${bill.subtotal.toFixed(2)}`, 140, y);
  doc.text(`Discount: -${bill.discount.toFixed(2)}`, 140, y + 6);
  doc.text(`Tax: ${bill.tax.toFixed(2)}`, 140, y + 12);
  doc.setFontSize(11);
  doc.text(`Total: ${bill.totalAmount.toFixed(2)}`, 140, y + 20);
  doc.text(`Paid: ${bill.paidAmount.toFixed(2)}`, 140, y + 27);

  doc.save(`${bill.billNumber}.pdf`);
}

export function exportPatientCardPDF(patient: {
  patientCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  phone: string;
  emergencyContact: string;
}): void {
  const doc = new jsPDF({ format: [110, 70], orientation: 'landscape' });
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, 110, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text('CarePlus Patient ID Card', 6, 10);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(patient.fullName, 6, 26);
  doc.setFontSize(9);
  doc.text(`ID: ${patient.patientCode}`, 6, 33);
  doc.text(`DOB: ${patient.dateOfBirth}  |  Gender: ${patient.gender}  |  Blood: ${patient.bloodGroup}`, 6, 40);
  doc.text(`Phone: ${patient.phone}`, 6, 47);
  doc.text(`Emergency: ${patient.emergencyContact || 'N/A'}`, 6, 54);

  doc.save(`${patient.patientCode}_Card.pdf`);
}
