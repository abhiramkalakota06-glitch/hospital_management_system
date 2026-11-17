import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CreditCard,
  LayoutDashboard,
  PackagePlus,
  Pill,
  Plus,
} from 'lucide-react';
import { AnalyticsReportView } from '../../components/AnalyticsReportView';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type { Bill, Medicine, Patient, Prescription } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportReceiptPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'inventory', label: 'Medicine Inventory', icon: Pill },
  { key: 'prescriptions', label: 'Prescriptions', icon: PackagePlus },
  { key: 'stock', label: 'Stock & Expiry Alerts', icon: Boxes },
  { key: 'billing', label: 'Pharmacy Billing', icon: CreditCard },
  { key: 'reports', label: 'Pharmacy Reports', icon: BarChart3 },
];

export const PharmacistPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { systemConfig } = useAuth();
  const { toast } = useToast();
  const currency = systemConfig.currencySymbol;
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [prescriptions, setPrescriptions] = useState<(Prescription & { patientName?: string; patientCode?: string; doctorName?: string })[]>([]);
  const [bills, setBills] = useState<(Bill & { patientName?: string; patientCode?: string })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const [medModal, setMedModal] = useState(false);
  const [medForm, setMedForm] = useState({ name: '', category: 'Cardiovascular', manufacturer: '', batchNumber: '', quantity: 100, reorderLevel: 30, expiryDate: '2027-12-31', purchasePrice: 5, sellingPrice: 12 });

  const [stockAdjustTarget, setStockAdjustTarget] = useState<Medicine | null>(null);
  const [stockDelta, setStockDelta] = useState(50);

  const [walkInModal, setWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ patientId: '', medicineId: '', quantity: 10 });

  const loadAll = useCallback(async () => {
    try {
      const [m, rx, b, p] = await Promise.all([
        apiFetch<{ medicines: Medicine[] }>('/pharmacy/medicines'),
        apiFetch<{ prescriptions: typeof prescriptions }>('/prescriptions'),
        apiFetch<{ bills: typeof bills }>('/bills'),
        apiFetch<{ patients: Patient[] }>('/patients'),
      ]);
      setMedicines(m.medicines);
      setPrescriptions(rx.prescriptions);
      setBills(b.bills);
      setPatients(p.patients);
      if (!walkInForm.patientId && p.patients.length > 0 && m.medicines.length > 0) {
        setWalkInForm((w) => ({ ...w, patientId: p.patients[0].id, medicineId: m.medicines[0].id }));
      }
    } catch {
      // ignore
    }
  }, [walkInForm.patientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const today = new Date().toISOString().slice(0, 10);
  const lowStock = medicines.filter((m) => m.quantity <= m.reorderLevel);
  const expired = medicines.filter((m) => m.expiryDate < today);
  const pendingRx = prescriptions.filter((rx) => rx.status !== 'Dispensed');
  const pharmacyBills = bills.filter((b) => b.items.some((i) => i.category === 'Pharmacy'));
  const todaySales = pharmacyBills.filter((b) => b.date === today).reduce((s, b) => s + b.totalAmount, 0);

  const addMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/pharmacy/medicines', { method: 'POST', body: JSON.stringify(medForm) });
      toast('Medicine added to inventory', 'success');
      setMedModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const adjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockAdjustTarget) return;
    await apiFetch(`/pharmacy/medicines/${stockAdjustTarget.id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantityDelta: Number(stockDelta) }),
    });
    toast(`Adjusted stock for ${stockAdjustTarget.name}`, 'success');
    setStockAdjustTarget(null);
    loadAll();
  };

  const handleRxAction = async (rxId: string, action: 'verify' | 'dispense') => {
    try {
      await apiFetch(`/prescriptions/${rxId}/dispense`, { method: 'POST', body: JSON.stringify({ action }) });
      toast(action === 'verify' ? 'Prescription verified' : 'Medicines dispensed, stock updated & bill generated', 'success');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const createPharmacyBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const med = medicines.find((m) => m.id === walkInForm.medicineId);
    if (!med) return;
    await apiFetch('/bills', {
      method: 'POST',
      body: JSON.stringify({
        patientId: walkInForm.patientId,
        items: [{ category: 'Pharmacy', description: `${med.name} (${med.medicineCode})`, qty: walkInForm.quantity, unitPrice: med.sellingPrice }],
      }),
    });
    await apiFetch(`/pharmacy/medicines/${med.id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantityDelta: -Number(walkInForm.quantity) }),
    });
    toast('Pharmacy bill generated & stock updated', 'success');
    setWalkInModal(false);
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

      {page === 'dashboard' && (
        <div className="space-y-6">
          <PageHeader title="Pharmacy Operations Dashboard" subtitle="Monitor medicine stock, expiry dates, pending prescriptions, and daily sales." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Medicines" value={medicines.length} helper={`${medicines.reduce((s, m) => s + m.quantity, 0)} total units`} onClick={() => setPage('inventory')} />
            <StatCard label="Pending Prescriptions" value={pendingRx.length} tone="blue" onClick={() => setPage('prescriptions')} />
            <StatCard label="Low-Stock Alerts" value={lowStock.length} tone="amber" onClick={() => setPage('stock')} />
            <StatCard label="Expired Batches" value={expired.length} tone="red" onClick={() => setPage('stock')} />
            <StatCard label="Today's Pharmacy Sales" value={`${currency}${todaySales.toLocaleString()}`} tone="teal" onClick={() => setPage('billing')} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Pending Prescriptions Queue</h3>
            <div className="divide-y divide-slate-100">
              {pendingRx.map((rx) => (
                <div key={rx.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900"><span className="font-mono text-sky-700">{rx.prescriptionCode}</span> · {rx.patientName}</p>
                    <p className="text-slate-500">{rx.items.map((i) => `${i.medicineName} ×${i.quantity}`).join(', ')}</p>
                  </div>
                  <button type="button" onClick={() => handleRxAction(rx.id, 'dispense')} className="px-3 py-1.5 font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700">
                    Dispense & Bill
                  </button>
                </div>
              ))}
              {pendingRx.length === 0 && <p className="py-6 text-center text-xs text-slate-400">All prescriptions dispensed.</p>}
            </div>
          </div>
        </div>
      )}

      {page === 'inventory' && (
        <div className="space-y-6">
          <PageHeader
            title="Medicine Inventory"
            subtitle="Complete catalog of medicines, batch numbers, expiry dates, and pricing."
            actions={
              <button type="button" onClick={() => setMedModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Add Medicine</span>
              </button>
            }
          />
          <DataTable
            data={medicines}
            rowKey={(m) => m.id}
            searchFilter={(m, q) => m.name.toLowerCase().includes(q) || m.medicineCode.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)}
            columns={[
              { key: 'code', header: 'Medicine ID', render: (m) => <span className="font-mono text-xs font-semibold">{m.medicineCode}</span> },
              { key: 'name', header: 'Medicine & Manufacturer', render: (m) => <div><p className="font-semibold">{m.name}</p><p className="text-xs text-slate-500">{m.category} · {m.manufacturer}</p></div> },
              { key: 'batch', header: 'Batch', render: (m) => <span className="font-mono text-xs">{m.batchNumber}</span> },
              { key: 'qty', header: 'Quantity', align: 'right', render: (m) => m.quantity },
              { key: 'exp', header: 'Expiry Date', render: (m) => <span className="font-mono text-xs">{m.expiryDate}</span> },
              { key: 'prices', header: 'Buy / Sell', align: 'right', render: (m) => `${currency}${m.purchasePrice} / ${currency}${m.sellingPrice}` },
            ]}
          />
        </div>
      )}

      {page === 'prescriptions' && (
        <div className="space-y-6">
          <PageHeader title="Prescription Verification & Dispensing" subtitle="Verify stock availability and dispense prescribed medicines with automatic inventory deduction." />
          <DataTable
            data={prescriptions}
            rowKey={(rx) => rx.id}
            columns={[
              { key: 'code', header: 'Rx #', render: (rx) => <span className="font-mono text-xs font-semibold">{rx.prescriptionCode}</span> },
              { key: 'pat', header: 'Patient', render: (rx) => `${rx.patientName} (${rx.patientCode})` },
              { key: 'doc', header: 'Doctor', render: (rx) => rx.doctorName },
              { key: 'items', header: 'Medicines & Qty', render: (rx) => rx.items.map((i) => `${i.medicineName} ×${i.quantity}`).join(', ') },
              { key: 'status', header: 'Status', render: (rx) => <StatusLabel status={rx.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (rx) =>
                  rx.status !== 'Dispensed' ? (
                    <div className="inline-flex gap-2">
                      {rx.status === 'Pending' && (
                        <button type="button" onClick={() => handleRxAction(rx.id, 'verify')} className="text-xs font-semibold text-sky-700 hover:underline">
                          Verify
                        </button>
                      )}
                      <button type="button" onClick={() => handleRxAction(rx.id, 'dispense')} className="text-xs font-semibold text-teal-700 hover:underline">
                        Dispense
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">Dispensed by {rx.dispensedBy}</span>
                  ),
              },
            ]}
          />
        </div>
      )}

      {page === 'stock' && (
        <div className="space-y-6">
          <PageHeader title="Stock Management & Expiry Alerts" subtitle="Adjust batch stock levels and resolve low-stock or expired inventory warnings." />
          {(lowStock.length > 0 || expired.length > 0) && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Inventory Attention Required</p>
                <p className="mt-0.5">{lowStock.length} medicine(s) below reorder threshold · {expired.length} expired batch(es) requiring quarantine.</p>
              </div>
            </div>
          )}
          <DataTable
            data={medicines}
            rowKey={(m) => m.id}
            columns={[
              { key: 'name', header: 'Medicine', render: (m) => `${m.name} (${m.medicineCode})` },
              { key: 'qty', header: 'Available Stock', align: 'right', render: (m) => m.quantity },
              { key: 'min', header: 'Reorder Level', align: 'right', render: (m) => m.reorderLevel },
              { key: 'exp', header: 'Expiry', render: (m) => <span className="font-mono text-xs">{m.expiryDate}</span> },
              {
                key: 'alert',
                header: 'Alert Status',
                render: (m) => (
                  <StatusLabel status={m.expiryDate < today ? 'Expired' : m.quantity <= m.reorderLevel ? 'Low Stock' : 'Nominal'} />
                ),
              },
              {
                key: 'adj',
                header: 'Adjust Stock',
                align: 'right',
                render: (m) => (
                  <button
                    type="button"
                    onClick={() => {
                      setStockAdjustTarget(m);
                      setStockDelta(50);
                    }}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Add / Adjust Stock
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'billing' && (
        <div className="space-y-6">
          <PageHeader
            title="Pharmacy Billing & Receipts"
            subtitle="Create direct medicine bills, record payments, and print receipts."
            actions={
              <button type="button" onClick={() => setWalkInModal(true)} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                New Medicine Bill
              </button>
            }
          />
          <DataTable
            data={pharmacyBills}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Bill #', render: (b) => <span className="font-mono text-xs font-semibold">{b.billNumber}</span> },
              { key: 'pat', header: 'Patient', render: (b) => b.patientName },
              { key: 'tot', header: 'Total', align: 'right', render: (b) => `${currency}${b.totalAmount.toFixed(2)}` },
              { key: 'status', header: 'Status', render: (b) => <StatusLabel status={b.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (b) => (
                  <div className="inline-flex gap-3">
                    {b.status !== 'Paid' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch('/payments', { method: 'POST', body: JSON.stringify({ billId: b.id, amount: b.totalAmount - b.paidAmount, method: 'Cash' }) });
                          toast('Pharmacy payment recorded', 'success');
                          loadAll();
                        }}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Mark Paid
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportReceiptPDF({ ...b, patientName: b.patientName || '', patientCode: b.patientCode || '' })}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Print Receipt
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'reports' && <AnalyticsReportView title="Pharmacy Sales & Stock Reports" subtitle="Medicine revenue, stock valuation, and expiry tracking." />}

      <Modal open={medModal} onClose={() => setMedModal(false)} title="Add Medicine to Inventory">
        <form onSubmit={addMedicine} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Medicine Name" value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input required placeholder="Category" value={medForm.category} onChange={(e) => setMedForm({ ...medForm, category: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input placeholder="Manufacturer" value={medForm.manufacturer} onChange={(e) => setMedForm({ ...medForm, manufacturer: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input placeholder="Batch Number" value={medForm.batchNumber} onChange={(e) => setMedForm({ ...medForm, batchNumber: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            <input type="number" placeholder="Initial Qty" value={medForm.quantity} onChange={(e) => setMedForm({ ...medForm, quantity: Number(e.target.value) })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            <input required type="date" value={medForm.expiryDate} onChange={(e) => setMedForm({ ...medForm, expiryDate: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input type="number" step="0.01" placeholder="Purchase Price" value={medForm.purchasePrice} onChange={(e) => setMedForm({ ...medForm, purchasePrice: Number(e.target.value) })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            <input type="number" step="0.01" placeholder="Selling Price" value={medForm.sellingPrice} onChange={(e) => setMedForm({ ...medForm, sellingPrice: Number(e.target.value) })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMedModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Save Medicine</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(stockAdjustTarget)} onClose={() => setStockAdjustTarget(null)} title={`Adjust Stock — ${stockAdjustTarget?.name || ''}`} maxWidth="max-w-sm">
        <form onSubmit={adjustStock} className="space-y-4">
          <p className="text-xs text-slate-600">Current Stock: <strong className="font-mono">{stockAdjustTarget?.quantity}</strong>. Enter positive or negative adjustment.</p>
          <input required type="number" value={stockDelta} onChange={(e) => setStockDelta(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStockAdjustTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg">Update Stock</button>
          </div>
        </form>
      </Modal>

      <Modal open={walkInModal} onClose={() => setWalkInModal(false)} title="Generate Pharmacy Medicine Bill" maxWidth="max-w-md">
        <form onSubmit={createPharmacyBill} className="space-y-4">
          <select value={walkInForm.patientId} onChange={(e) => setWalkInForm({ ...walkInForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
          </select>
          <select value={walkInForm.medicineId} onChange={(e) => setWalkInForm({ ...walkInForm, medicineId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({currency}{m.sellingPrice})</option>)}
          </select>
          <input type="number" min={1} value={walkInForm.quantity} onChange={(e) => setWalkInForm({ ...walkInForm, quantity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWalkInModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Generate Bill</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
