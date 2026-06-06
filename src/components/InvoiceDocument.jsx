import logo from '../assets/logo.png'
import paynowQr from '../assets/paynow-qr.png'
import { PAYNOW_UEN } from '../data/constants'
import { THEME, computeInvoiceTotals } from '../lib/invoiceDesign'

const statusLabel = {
  paid: { text: 'PAID', className: 'bg-emerald-100 text-emerald-800' },
  pending: { text: 'AMOUNT DUE', className: 'bg-amber-100 text-amber-900' },
  overdue: { text: 'OVERDUE', className: 'bg-red-100 text-red-800' },
  cancelled: { text: 'CANCELLED', className: 'bg-gray-100 text-gray-600' },
}

export default function InvoiceDocument({ invoice, className = '' }) {
  const data = computeInvoiceTotals(invoice)
  const badge = statusLabel[data.status] || statusLabel.pending

  return (
    <div
      className={`invoice-document bg-white text-gray-900 mx-auto shadow-sm ${className}`}
      style={{
        width: '210mm',
        maxWidth: '100%',
        minHeight: '297mm',
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      }}
    >
      {/* Brand bar */}
      <div className="h-1" style={{ backgroundColor: THEME.maroon }} />

      <div className="px-8 sm:px-10 pt-8 pb-10 flex flex-col min-h-[calc(297mm-4px)]">
        {/* Header */}
        <div className="flex justify-between items-start gap-6">
          <div className="flex gap-4 items-start min-w-0">
            <img src={logo} alt={data.company.name} className="w-[72px] h-[72px] rounded-full object-cover shrink-0 ring-1 ring-gray-200" />
            <div className="text-[11px] leading-relaxed text-gray-600 pt-1">
              <p className="font-bold text-[13px] tracking-wide mb-1" style={{ color: THEME.maroon }}>
                {data.company.name.toUpperCase()}
              </p>
              <p>{data.company.address}</p>
              <p>{data.company.phone}</p>
              <p>{data.company.email}</p>
              <p>{data.company.website}</p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <h1 className="text-[2rem] font-bold text-gray-900 tracking-tight leading-none">INVOICE</h1>
            <span className={`inline-block mt-2 px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${badge.className}`}>
              {badge.text}
            </span>
            <dl className="mt-4 space-y-2 text-[11px]">
              <div>
                <dt className="text-gray-400 uppercase tracking-wider text-[9px]">Invoice number</dt>
                <dd className="font-semibold text-gray-900">{data.invoiceId}</dd>
              </div>
              <div>
                <dt className="text-gray-400 uppercase tracking-wider text-[9px]">Date of issue</dt>
                <dd className="text-gray-800">{data.invoiceDate}</dd>
              </div>
              {data.dueDate && (
                <div>
                  <dt className="text-gray-400 uppercase tracking-wider text-[9px]">Payment due</dt>
                  <dd className="font-semibold" style={{ color: THEME.maroon }}>{data.dueDate}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Customer details */}
        <div className="mt-8 rounded-lg px-4 py-3 space-y-1.5 text-[11px] leading-relaxed" style={{ backgroundColor: THEME.surface }}>
          <p className="text-gray-800">
            <span className="font-semibold text-gray-700">Customer Name</span>
            {' - '}
            <span>{data.customerName || '—'}</span>
          </p>
          <p className="text-gray-800">
            <span className="font-semibold text-gray-700">Phone</span>
            {' - '}
            <span>{data.customerPhone || '—'}</span>
          </p>
          <p className="text-gray-800">
            <span className="font-semibold text-gray-700">Address</span>
            {' - '}
            <span>{data.customerAddress || '—'}</span>
          </p>
        </div>

        {/* Line items */}
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr style={{ backgroundColor: THEME.maroon, color: '#fff' }}>
                <th className="py-2.5 px-2 w-10 text-center font-semibold">#</th>
                <th className="py-2.5 px-3 text-left font-semibold">Description</th>
                <th className="py-2.5 px-2 w-14 text-center font-semibold">Qty</th>
                <th className="py-2.5 px-3 w-24 text-right font-semibold">Unit price</th>
                <th className="py-2.5 px-3 w-24 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={5} className="py-6 text-center text-gray-400">No line items</td>
                </tr>
              ) : (
                data.items.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fcfbfa]'}>
                    <td className="py-3 px-2 text-center text-gray-500 border-t border-gray-100">{row.index}</td>
                    <td className="py-3 px-3 text-gray-900 border-t border-gray-100">{row.name}</td>
                    <td className="py-3 px-2 text-center text-gray-700 border-t border-gray-100">{row.qty}</td>
                    <td className="py-3 px-3 text-right text-gray-700 border-t border-gray-100">{row.priceFmt}</td>
                    <td className="py-3 px-3 text-right font-semibold text-gray-900 border-t border-gray-100">{row.lineFmt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mt-6">
          <div className="w-64 text-[11px] space-y-2">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span className="text-gray-800">{data.subtotalFmt}</span>
            </div>
            {data.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>{data.discountLabel}</span>
                <span className="font-medium">-{data.discountFmt}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>Shipping</span>
              <span className="text-gray-800">{data.shippingFmt}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax</span>
              <span className="text-gray-800">{data.taxFmt}</span>
            </div>
            <div
              className="flex justify-between items-center rounded-md px-3 py-2.5 mt-2 text-white font-bold text-[13px]"
              style={{ backgroundColor: THEME.maroon }}
            >
              <span>Amount due</span>
              <span>S${data.totalFmt}</span>
            </div>
          </div>
        </div>

        {data.notes && (
          <div className="mt-6 text-[11px]">
            <p className="font-bold text-gray-400 uppercase tracking-wider text-[9px] mb-1">Notes</p>
            <p className="text-gray-600 leading-relaxed">{data.notes}</p>
          </div>
        )}

        {/* Payment */}
        <div className="mt-auto pt-10 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between gap-6 items-start sm:items-end">
            <div className="text-[11px] text-gray-600 space-y-1">
              <p className="font-bold text-[12px]" style={{ color: THEME.maroon }}>Payment instructions</p>
              <p>Pay via PayNow using the QR code or enter the UEN in your banking app.</p>
              <p><span className="font-semibold text-gray-800">UEN:</span> {PAYNOW_UEN}</p>
              <p><span className="font-semibold text-gray-800">Amount:</span> S${data.totalFmt}</p>
              <p><span className="font-semibold text-gray-800">Reference:</span> {data.invoiceId}</p>
            </div>
            <div className="text-center shrink-0">
              <img src={paynowQr} alt="PayNow QR" className="w-[108px] h-[108px] rounded-lg" />
              <p className="text-[9px] text-gray-400 mt-1.5">Scan to pay</p>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-400 italic mt-8">
            Thank you for your business — {data.company.phone} | {data.company.email}
          </p>
        </div>
      </div>
    </div>
  )
}
