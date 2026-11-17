import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent,
  BarChart3,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Plus,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { AnalyticsReportView } from '../../components/AnalyticsReportView';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type { Bill, BillLineItem, InsuranceClaim, Patient, Payment, RefundRequest } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportReceiptPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'billing', label: 'Billing & Invoices', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'insurance', label: 'Insurance Claims', icon: ShieldCheck },
  { key: 'refunds', label: 'Refund Management', icon: BadgePercent },
  { key: 'reports', label: 'Financial Reports', icon: BarChart3 },
];

export const AccountantPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { systemConfig, subscribeEvent } = useAuth();
  const { toast } = useToast();
  const currency = systemConfig.currencySymbol;
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [dash, setDash] = useState<{ metrics: Record<string, number> } | null>(null);
  const [bills, setBills] = useState<(Bill & { patientName?: string; patientCode?: string })[]>([]);
  const [payments, setPayments] = useState<(Payment & { patientName?: string; billNumber?: string })[]>([]);
  const [claims, setClaims] = useState<(InsuranceClaim & { patientName?: string; billNumber?: string })[]>([]);
  const [refunds, setRefunds] = useState<(RefundRequest & { patientName?: string; billNumber?: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Invoice builder
  const [invModal, setInvModal] = useState(false);
  const [invPatientId, setInvPatientId] = useState('');
  const [invDiscount, setInvDiscount] = useState(0);
  const [invItems, setInvItems] = useState<Omit<BillLineItem, 'id' | 'total'>[]>([
    { category: 'Consultation', description: 'Specialist Consultation Fee', qty: 1, unitPrice: 1200 },
  ]);

  // Payment modal
  const [payModal, setPayModal] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Online'>('Card');
  const [payRef, setPayRef] = useState('');

  // Insurance modal
  const [claimModal, setClaimModal] = useState(false);
  const [claimForm, setClaimForm] = useState({ billId: '', provider: '', policyNumber: '', claimAmount: 0, notes: '' });

  // Refund modal
  const [refundModal, setRefundModal] = useState(false);
  const [refundForm, setRefundForm] = useState({ billId: '', amount: 0, reason: '' });

  const loadAll = useCallback(async () => {
    try {
      const [d, b, p, c, r, pt] = await Promise.all([
        apiFetch<typeof dash>('/dashboard'),
        apiFetch<{ bills: typeof bills }>('/bills'),
        apiFetch<{ payments: typeof payments }>('/payments'),
        apiFetch<{ claims: typeof claims }>('/insurance'),
        apiFetch<{ refunds: typeof refunds }>('/refunds'),
        apiFetch<{ patients: Patient[] }>('/patients'),
      ]);
      setDash(d);
      setBills(b.bills);
      setPayments(p.payments);
      setClaims(c.claims);
      setRefunds(r.refunds);
      setPatients(pt.patients);
      if (!invPatientId && pt.patients.length > 0) setInvPatientId(pt.patients[0].id);
      if (!claimForm.billId && b.bills.length > 0) setClaimForm((cf) => ({ ...cf, billId: b.bills[0].id }));
      if (!refundForm.billId && b.bills.length > 0) setRefundForm((rf) => ({ ...rf, billId: b.bills[0].id }));
    } catch {
      // ignore
    }
  }, [invPatientId, claimForm.billId, refundForm.billId]);

  useEffect(() => {
    loadAll();
    const unsub = subscribeEvent('bill:updated', loadAll);
    return () => unsub();
  }, [loadAll, subscribeEvent]);

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/bills', {
        method: 'POST',
        body: JSON.stringify({ patientId: invPatientId, discount: Number(invDiscount), items: invItems }),
      });
      toast('Invoice generated with tax calculation', 'success');
      setInvModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    try {
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({ billId: payModal.id, amount: Number(payAmount), method: payMethod, transactionRef: payRef }),
      });
      toast('Payment posted & balance updated', 'success');
      setPayModal(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Payment error', 'error');
    }
  };

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/insurance', { method: 'POST', body: JSON.stringify(claimForm) });
    toast('Insurance claim submitted', 'success');
    setClaimModal(false);
    loadAll();
  };

  const updateClaimStatus = async (claim: InsuranceClaim, status: InsuranceClaim['status']) => {
    await apiFetch(`/insurance/${claim.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, approvedAmount: status === 'Settled' || status === 'Approved' ? claim.claimAmount : 0 }),
    });
    toast(`Claim ${claim.claimNumber} marked ${status}`, 'info');
    loadAll();
  };

  const submitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/refunds', { method: 'POST', body: JSON.stringify(refundForm) });
    toast('Refund request created', 'success');
    setRefundModal(false);
    loadAll();
  };

  const processRefund = async (id: string, status: RefundRequest['status']) => {
    await apiFetch(`/refunds/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Refund ${status}`, 'info');
    loadAll();
  };

  return (
    <AppShell
      navItems={NAV_ITEMS}
      activePage={page}
      onNavigate={setPage}
      onOpenQueueDisplay={onOpenQueueDisplay}
      unreadTrigger={unreadTrigger}
    >
      {page === 'profile' && <ProfilePage />}
      {page === 'notifications' && <NotificationsPage onCountChange={() => setUnreadTrigger((x) => x + 1)} />}

      {page === 'dashboard' && dash && (
        <div className="space-y-6">
          <PageHeader
            title="Accountant & Billing Dashboard"
            subtitle="Track daily collections, pending invoices, insurance claims, and refund workflows."
            actions={
              <button type="button" onClick={() => setInvModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Generate Invoice</span>
              </button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard label="Today's Revenue" value={`${currency}${dash.metrics.todayRevenue.toLocaleString()}`} tone="teal" />
            <StatCard label="Total Collections" value={`${currency}${dash.metrics.totalRevenue.toLocaleString()}`} tone="blue" />
            <StatCard label="Pending Bills" value={dash.metrics.pendingBillsCount} tone="amber" onClick={() => setPage('billing')} />
            <StatCard label="Paid Bills" value={dash.metrics.paidBillsCount} />
            <StatCard label="Refunds Processed" value={`${currency}${dash.metrics.totalRefunds.toLocaleString()}`} onClick={() => setPage('refunds')} />
            <StatCard label="Outstanding Balance" value={`${currency}${dash.metrics.outstandingBalance.toLocaleString()}`} tone="red" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Pending & Partial Invoices</h3>
            <div className="divide-y divide-slate-100">
              {bills.filter((b) => b.status === 'Pending' || b.status === 'Partial').map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900"><span className="font-mono text-sky-700">{b.billNumber}</span> · {b.patientName}</p>
                    <p className="text-slate-500">Total {currency}{b.totalAmount.toFixed(2)} · Paid {currency}{b.paidAmount.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPayModal(b);
                      setPayAmount(String(Math.max(0, b.totalAmount - b.paidAmount).toFixed(2)));
                      setPayRef(`TXN-${Date.now().toString().slice(-6)}`);
                    }}
                    className="px-3 py-1.5 font-semibold text-white bg-teal-600 rounded-md"
                  >
                    Record Payment
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'billing' && (
        <div className="space-y-6">
          <PageHeader
            title="Billing & Invoice Management"
            subtitle="Generate itemized invoices across consultation, laboratory, pharmacy, bed, and hospital services."
            actions={
              <button type="button" onClick={() => setInvModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Create Invoice</span>
              </button>
            }
          />
          <DataTable
            data={bills}
            rowKey={(b) => b.id}
            searchFilter={(b, q) => b.billNumber.toLowerCase().includes(q) || (b.patientName || '').toLowerCase().includes(q)}
            columns={[
              { key: 'num', header: 'Invoice #', render: (b) => <span className="font-mono text-xs font-semibold">{b.billNumber}</span> },
              { key: 'pat', header: 'Patient', render: (b) => `${b.patientName} (${b.patientCode})` },
              { key: 'date', header: 'Date', render: (b) => <span className="font-mono text-xs">{b.date}</span> },
              { key: 'tot', header: 'Total', align: 'right', render: (b) => `${currency}${b.totalAmount.toFixed(2)}` },
              { key: 'paid', header: 'Paid', align: 'right', render: (b) => `${currency}${b.paidAmount.toFixed(2)}` },
              { key: 'status', header: 'Status', render: (b) => <StatusLabel status={b.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (b) => (
                  <div className="inline-flex gap-3">
                    {b.status !== 'Paid' && b.status !== 'Refunded' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayModal(b);
                          setPayAmount(String(Math.max(0, b.totalAmount - b.paidAmount).toFixed(2)));
                          setPayRef(`TXN-${Date.now().toString().slice(-6)}`);
                        }}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Pay
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportReceiptPDF({ ...b, patientName: b.patientName || '', patientCode: b.patientCode || '' })}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      PDF Invoice
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'payments' && (
        <div className="space-y-6">
          <PageHeader title="Payment Transaction Ledger" subtitle="Track Cash, Card, UPI, and Online payments with transaction references." />
          <DataTable
            data={payments}
            rowKey={(p) => p.id}
            searchFilter={(p, q) => p.receiptNumber.toLowerCase().includes(q) || p.transactionRef.toLowerCase().includes(q) || (p.patientName || '').toLowerCase().includes(q)}
            columns={[
              { key: 'rcp', header: 'Receipt #', render: (p) => <span className="font-mono text-xs font-semibold">{p.receiptNumber}</span> },
              { key: 'inv', header: 'Invoice', render: (p) => <span className="font-mono text-xs">{p.billNumber}</span> },
              { key: 'pat', header: 'Patient', render: (p) => p.patientName },
              { key: 'method', header: 'Method', render: (p) => p.method },
              { key: 'ref', header: 'Transaction Ref', render: (p) => <span className="font-mono text-xs">{p.transactionRef}</span> },
              { key: 'amt', header: 'Amount', align: 'right', render: (p) => `${currency}${p.amount.toFixed(2)}` },
              { key: 'status', header: 'Status', render: (p) => <StatusLabel status={p.status} /> },
            ]}
          />
        </div>
      )}

      {page === 'insurance' && (
        <div className="space-y-6">
          <PageHeader
            title="Insurance Claims Management"
            subtitle="Submit payer claims, track policy approvals, and settle approved reimbursements."
            actions={
              <button type="button" onClick={() => setClaimModal(true)} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                Submit Insurance Claim
              </button>
            }
          />
          <DataTable
            data={claims}
            rowKey={(c) => c.id}
            columns={[
              { key: 'num', header: 'Claim #', render: (c) => <span className="font-mono text-xs font-semibold">{c.claimNumber}</span> },
              { key: 'pat', header: 'Patient & Bill', render: (c) => `${c.patientName} (${c.billNumber})` },
              { key: 'prov', header: 'Insurer & Policy', render: (c) => `${c.provider} · ${c.policyNumber}` },
              { key: 'amt', header: 'Claimed', align: 'right', render: (c) => `${currency}${c.claimAmount.toLocaleString()}` },
              { key: 'status', header: 'Status', render: (c) => <StatusLabel status={c.status} /> },
              {
                key: 'act',
                header: 'Workflow',
                align: 'right',
                render: (c) =>
                  c.status !== 'Settled' && c.status !== 'Rejected' ? (
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => updateClaimStatus(c, 'Approved')} className="text-xs font-semibold text-sky-700 hover:underline">Approve</button>
                      <button type="button" onClick={() => updateClaimStatus(c, 'Settled')} className="text-xs font-semibold text-teal-700 hover:underline">Settle</button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {page === 'refunds' && (
        <div className="space-y-6">
          <PageHeader
            title="Refund Approval Workflow"
            subtitle="Review billing refund requests, approve adjustments, and record processed refunds."
            actions={
              <button type="button" onClick={() => setRefundModal(true)} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                New Refund Request
              </button>
            }
          />
          <DataTable
            data={refunds}
            rowKey={(r) => r.id}
            columns={[
              { key: 'num', header: 'Refund #', render: (r) => <span className="font-mono text-xs font-semibold">{r.refundNumber}</span> },
              { key: 'pat', header: 'Patient & Invoice', render: (r) => `${r.patientName} (${r.billNumber})` },
              { key: 'amt', header: 'Amount', align: 'right', render: (r) => `${currency}${r.amount.toFixed(2)}` },
              { key: 'reason', header: 'Reason', render: (r) => <span className="text-xs">{r.reason}</span> },
              { key: 'status', header: 'Status', render: (r) => <StatusLabel status={r.status} /> },
              {
                key: 'act',
                header: 'Action',
                align: 'right',
                render: (r) =>
                  r.status === 'Requested' ? (
                    <div className="inline-flex gap-2">
                      <button type="button" onClick={() => processRefund(r.id, 'Approved')} className="text-xs font-semibold text-sky-700 hover:underline">Approve</button>
                      <button type="button" onClick={() => processRefund(r.id, 'Rejected')} className="text-xs font-semibold text-red-700 hover:underline">Reject</button>
                    </div>
                  ) : r.status === 'Approved' ? (
                    <button type="button" onClick={() => processRefund(r.id, 'Processed')} className="text-xs font-semibold text-teal-700 hover:underline">Process Payout</button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {page === 'reports' && <AnalyticsReportView title="Financial & Revenue Reports" subtitle="Collections by department, billing streams, and receivables analysis." />}

      {/* Create Invoice Modal */}
      <Modal open={invModal} onClose={() => setInvModal(false)} title="Generate Itemized Invoice" maxWidth="max-w-2xl">
        <form onSubmit={createInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
              <select value={invPatientId} onChange={(e) => setInvPatientId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Discount ({currency})</label>
              <input type="number" min={0} value={invDiscount} onChange={(e) => setInvDiscount(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            </div>
          </div>
          {invItems.map((item, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <select
                value={item.category}
                onChange={(e) => setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, category: e.target.value as BillLineItem['category'] } : it)))}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                <option>Consultation</option><option>Laboratory</option><option>Pharmacy</option><option>Bed</option><option>Service</option>
              </select>
              <input
                required
                placeholder="Description"
                value={item.description}
                onChange={(e) => setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white sm:col-span-1"
              />
              <input
                type="number"
                min={1}
                placeholder="Qty"
                value={item.qty}
                onChange={(e) => setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: Number(e.target.value) } : it)))}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
              />
              <input
                type="number"
                min={0}
                placeholder="Unit Price"
                value={item.unitPrice}
                onChange={(e) => setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, unitPrice: Number(e.target.value) } : it)))}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
              />
            </div>
          ))}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setInvItems((prev) => [...prev, { category: 'Service', description: 'Hospital Nursing Care', qty: 1, unitPrice: 500 }])}
              className="text-xs font-semibold text-sky-700 hover:underline"
            >
              + Add Line Item
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setInvModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Create Invoice</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal open={Boolean(payModal)} onClose={() => setPayModal(null)} title={`Record Payment — ${payModal?.billNumber || ''}`} maxWidth="max-w-md">
        <form onSubmit={recordPayment} className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label><input required type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
          <div><label className="block text-xs font-semibold text-slate-700 mb-1">Method</label><select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'Cash' | 'Card' | 'UPI' | 'Online')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"><option>Card</option><option>UPI</option><option>Cash</option><option>Online</option></select></div>
          <div><label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Reference</label><input required value={payRef} onChange={(e) => setPayRef(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setPayModal(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg">Confirm Payment</button></div>
        </form>
      </Modal>

      {/* Insurance Claim Modal */}
      <Modal open={claimModal} onClose={() => setClaimModal(false)} title="Submit Insurance Claim" maxWidth="max-w-md">
        <form onSubmit={submitClaim} className="space-y-3">
          <select value={claimForm.billId} onChange={(e) => setClaimForm({ ...claimForm, billId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {bills.map((b) => <option key={b.id} value={b.id}>{b.billNumber} — {b.patientName} ({currency}{b.totalAmount})</option>)}
          </select>
          <input required placeholder="Insurance Provider" value={claimForm.provider} onChange={(e) => setClaimForm({ ...claimForm, provider: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <input required placeholder="Policy Number" value={claimForm.policyNumber} onChange={(e) => setClaimForm({ ...claimForm, policyNumber: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <input required type="number" placeholder="Claim Amount" value={claimForm.claimAmount} onChange={(e) => setClaimForm({ ...claimForm, claimAmount: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setClaimModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Submit Claim</button></div>
        </form>
      </Modal>

      {/* Refund Modal */}
      <Modal open={refundModal} onClose={() => setRefundModal(false)} title="Request Billing Refund" maxWidth="max-w-md">
        <form onSubmit={submitRefund} className="space-y-3">
          <select value={refundForm.billId} onChange={(e) => setRefundForm({ ...refundForm, billId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {bills.map((b) => <option key={b.id} value={b.id}>{b.billNumber} — {b.patientName}</option>)}
          </select>
          <input required type="number" min={1} placeholder="Refund Amount" value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <input required placeholder="Reason for refund" value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setRefundModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Submit Request</button></div>
        </form>
      </Modal>
    </AppShell>
  );
};
