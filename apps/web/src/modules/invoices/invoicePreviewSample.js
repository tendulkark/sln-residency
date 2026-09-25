// Made-up stay for the Invoice Design preview, shaped exactly like the
// invoice API's response (invoices.routes.js `invoiceView`) so the preview
// goes through the real InvoiceDocument. Filled with every optional field so
// each show/hide toggle has something to show or hide.
export function buildInvoicePreviewSample() {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() - 2);
  checkIn.setHours(12, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  checkOut.setHours(11, 0, 0, 0);

  return {
    invoice: { invoiceNumber: `INV-${checkOut.getFullYear()}-00042`, generatedAt: checkOut.toISOString() },
    bookings: [
      {
        id: "sample-booking",
        room: { roomNumber: "204", roomType: { name: "Deluxe Double" } },
        guest: {
          name: "Priya Raman",
          phone: "+91 98400 12345",
          phone2: "+91 44 2345 6789",
          email: "priya.raman@example.com",
          address: "12, Gandhi Street, T. Nagar\nChennai 600017",
          idProofType: "aadhaar",
          idProofNumber: "XXXX XXXX 4821",
          companyName: "Sample Traders Pvt Ltd",
          gstin: "33AAACS1234F1Z5",
        },
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        adults: 2,
        children: 1,
        ratePerNight: 2800,
        totalAmount: 5600,
      },
    ],
    charges: [
      { id: "sample-charge", type: "charge", description: "Laundry", amount: 250 },
      { id: "sample-discount", type: "discount", description: "Corporate discount", amount: 200 },
    ],
    payments: [{ id: "sample-payment", type: "payment", method: { name: "UPI" }, amount: 3000 }],
    summary: {
      nights: 2,
      taxRatePercent: 12,
      roomsInclTax: 5600,
      discountTotal: 200,
      taxableValue: 5071.43,
      cgst: 289.29,
      sgst: 289.29,
      roundOff: -0.01,
      taxLines: [
        { ratePercent: 0, taxable: 250, cgst: 0, sgst: 0 },
        { ratePercent: 12, taxable: 4821.43, cgst: 289.29, sgst: 289.29 },
      ],
      chargesTaxAmount: 0,
      chargesTotal: 250,
      grandTotal: 5650,
      amountReceived: 3000,
      refundedTotal: 0,
      advancePaid: 3000,
      balanceDue: 2650,
    },
  };
}
