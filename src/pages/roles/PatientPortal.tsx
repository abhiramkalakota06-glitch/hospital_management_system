import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CalendarCheck,
  CalendarPlus,
  CreditCard,
  FileHeart,
  FlaskConical,
  LayoutDashboard,
  Pill,
  User as UserIcon,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type {
  Appointment,
  Bill,
  Consultation,
  Department,
  DischargeRequest,
  DoctorProfile,
  LabRequest,
  Patient,
  Payment,
  Prescription,
} from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportLabReportPDF, exportPrescriptionPDF, exportReceiptPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'book', label: 'Book Appointment', icon: CalendarPlus },
  { key: 'appointments', label: 'My Appointments', icon: CalendarCheck },
  { key: 'records', label: 'Medical Records', icon: FileHeart },
  { key: 'prescriptions', label: 'My Prescriptions', icon: Pill },
  { key: 'reports', label: 'Lab Reports', icon: FlaskConical },
  { key: 'bills', label: 'My Bills & Receipts', icon: CreditCard },
  { key: 'profile', label: 'My Profile', icon: UserIcon },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export const PatientPortal: React.FC = () => {
  const { user, systemConfig, subscribeEvent } = useAuth();
  const { toast } = useToast();
  const currency = systemConfig.currencySymbol;
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [patientDash, setPatientDash] = useState<{
    patient: Patient;
    upcomingAppointments: Appointment[];
    previousAppointments: Appointment[];
    activePrescriptions: Prescription[];
    pendingBills: Bill[];
    recentReports: LabRequest[];
  } | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [appointments, setAppointments] = useState<(Appointment & { doctorName?: string; departmentName?: string; queueToken?: string | null })[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [prescriptions, setPrescriptions] = useState<(Prescription & { doctorName?: string })[]>([]);
  const [labs, setLabs] = useState<(LabRequest & { doctorName?: string })[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<(Payment & { billNumber?: string })[]>([]);
  const [dischargeSummaries, setDischargeSummaries] = useState<DischargeRequest[]>([]);

  // Book appointment state
  const [bookForm, setBookForm] = useState({
    departmentId: 'dept-1',
    doctorId: 'doc-1',
    date: new Date().toISOString().slice(0, 10),
    timeSlot: '',
    reason: '',
  });
  const [slots, setSlots] = useState<{ timeSlot: string; available: boolean }[]>([]);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');

  // Pay bill modal
  const [payTarget, setPayTarget] = useState<Bill | null>(null);
  const [payMethod, setPayMethod] = useState<'UPI' | 'Card' | 'Online'>('UPI');

  const loadAll = useCallback(async () => {
    try {
      const [d, dep, doc, apt, cons, rx, lb, b, pay] = await Promise.all([
        apiFetch<{ patientSpecific: typeof patientDash }>('/dashboard'),
        apiFetch<{ departments: Department[] }>('/departments'),
        apiFetch<{ doctors: DoctorProfile[] }>('/doctors'),
        apiFetch<{ appointments: typeof appointments }>('/appointments'),
        apiFetch<{ consultations: Consultation[] }>('/consultations'),
        apiFetch<{ prescriptions: typeof prescriptions }>('/prescriptions'),
        apiFetch<{ labRequests: typeof labs }>('/labs'),
        apiFetch<{ bills: Bill[] }>('/bills'),
        apiFetch<{ payments: typeof payments }>('/payments'),
      ]);
      setPatientDash(d.patientSpecific);
      setDepartments(dep.departments);
      setDoctors(doc.doctors);
      setAppointments(apt.appointments);
      setConsultations(cons.consultations);
      setPrescriptions(rx.prescriptions);
      setLabs(lb.labRequests);
      setBills(b.bills);
      setPayments(pay.payments);

      if (d.patientSpecific?.patient?.id) {
        apiFetch<{ dischargeRequests: DischargeRequest[] }>(`/patients/${d.patientSpecific.patient.id}/emr`)
          .then((emr) => setDischargeSummaries(emr.dischargeRequests))
          .catch(() => {});
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
    const u1 = subscribeEvent('appointment:updated', loadAll);
    const u2 = subscribeEvent('lab:updated', loadAll);
    const u3 = subscribeEvent('bill:updated', loadAll);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [loadAll, subscribeEvent]);

  useEffect(() => {
    if (!bookForm.doctorId || !bookForm.date) return;
    apiFetch<{ slots: { timeSlot: string; available: boolean }[] }>(
      `/appointments/slots?doctorId=${encodeURIComponent(bookForm.doctorId)}&date=${encodeURIComponent(bookForm.date)}`,
    )
      .then((res) => {
        setSlots(res.slots);
        const first = res.slots.find((s) => s.available);
        setBookForm((bf) => ({ ...bf, timeSlot: first ? first.timeSlot : '' }));
      })
      .catch(() => setSlots([]));
  }, [bookForm.doctorId, bookForm.date]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.timeSlot) {
      toast('Please select an available slot', 'error');
      return;
    }
    try {
      const res = await apiFetch<{ appointment: Appointment }>('/appointments', { method: 'POST', body: JSON.stringify(bookForm) });
      toast(`Appointment ${res.appointment.appointmentNumber} booked`, 'success');
      setBookForm((bf) => ({ ...bf, reason: '' }));
      setPage('appointments');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Booking failed', 'error');
    }
  };

  const cancelAppointment = async (id: string) => {
    await apiFetch(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'Cancelled' }) });
    toast('Appointment cancelled', 'info');
    loadAll();
  };

  const submitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    try {
      await apiFetch(`/appointments/${rescheduleTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ date: rescheduleDate, timeSlot: rescheduleSlot, status: 'Reschedule Requested' }),
      });
      toast('Reschedule request submitted', 'success');
      setRescheduleTarget(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const payBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    const due = Math.max(0, payTarget.totalAmount - payTarget.paidAmount);
    await apiFetch('/payments', {
      method: 'POST',
      body: JSON.stringify({ billId: payTarget.id, amount: due, method: payMethod, transactionRef: `PT-${Date.now().toString().slice(-6)}` }),
    });
    toast('Payment completed successfully', 'success');
    setPayTarget(null);
    loadAll();
  };

  const patient = patientDash?.patient;
  const deptDoctors = doctors.filter((d) => d.departmentId === bookForm.departmentId);

  return (
    <AppShell navItems={NAV_ITEMS} activePage={page} onNavigate={setPage} unreadTrigger={unreadTrigger}>
      {page === 'profile' && <ProfilePage />}
      {page === 'notifications' && <NotificationsPage onCountChange={() => setUnreadTrigger((x) => x + 1)} />}

      {page === 'dashboard' && patientDash && (
        <div className="space-y-6">
          <PageHeader
            title={`Welcome, ${user?.fullName}`}
            subtitle={`Patient ID: ${patient?.patientCode || user?.employeeOrPatientId} · Blood Group: ${patient?.bloodGroup || 'O+'} · Allergies: ${patient?.allergies.join(', ') || 'None'}`}
            actions={
              <button type="button" onClick={() => setPage('book')} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
                Book New Appointment
              </button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Upcoming Appointments" value={patientDash.upcomingAppointments.length} tone="blue" onClick={() => setPage('appointments')} />
            <StatCard label="Previous Visits" value={patientDash.previousAppointments.length} onClick={() => setPage('records')} />
            <StatCard label="Active Prescriptions" value={patientDash.activePrescriptions.length} tone="teal" onClick={() => setPage('prescriptions')} />
            <StatCard label="Pending Payments" value={patientDash.pendingBills.length} tone="amber" onClick={() => setPage('bills')} />
            <StatCard label="Published Lab Reports" value={patientDash.recentReports.length} onClick={() => setPage('reports')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Personal Health Summary</h3>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div><dt className="text-slate-500">Patient Code</dt><dd className="font-mono font-semibold text-slate-900 mt-0.5">{patient?.patientCode}</dd></div>
                <div><dt className="text-slate-500">Blood Group</dt><dd className="font-semibold text-slate-900 mt-0.5">{patient?.bloodGroup}</dd></div>
                <div><dt className="text-slate-500">Recorded Allergies</dt><dd className="text-red-700 font-medium mt-0.5">{patient?.allergies.join(', ') || 'None'}</dd></div>
                <div><dt className="text-slate-500">Ongoing Conditions</dt><dd className="text-slate-800 mt-0.5">{patient?.existingConditions.join(', ') || 'None'}</dd></div>
              </dl>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Upcoming Appointments</h3>
              <div className="divide-y divide-slate-100">
                {appointments.filter((a) => a.status !== 'Cancelled' && a.status !== 'Completed').map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{a.doctorName} · {a.departmentName}</p>
                      <p className="font-mono text-slate-500">{a.date} {a.timeSlot} {a.queueToken ? `· Token ${a.queueToken}` : ''}</p>
                    </div>
                    <StatusLabel status={a.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {page === 'book' && (
        <div className="space-y-6">
          <PageHeader title="Book an Appointment" subtitle="Choose a clinical department, physician, and live available time slot." />
          <form onSubmit={handleBook} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-3xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  value={bookForm.departmentId}
                  onChange={(e) => {
                    const depId = e.target.value;
                    const first = doctors.find((d) => d.departmentId === depId);
                    setBookForm({ ...bookForm, departmentId: depId, doctorId: first?.id || '' });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Physician</label>
                <select value={bookForm.doctorId} onChange={(e) => setBookForm({ ...bookForm, doctorId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {(deptDoctors.length > 0 ? deptDoctors : doctors).map((d) => <option key={d.id} value={d.id}>{d.fullName} ({currency}{d.consultationFee})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input required type="date" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Available Slots</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.timeSlot}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setBookForm({ ...bookForm, timeSlot: s.timeSlot })}
                    className={`py-2 rounded-lg text-xs font-mono border ${
                      !s.available
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                        : bookForm.timeSlot === s.timeSlot
                        ? 'bg-sky-600 text-white border-sky-600 font-semibold'
                        : 'bg-white text-slate-800 border-slate-300 hover:border-sky-500'
                    }`}
                  >
                    {s.timeSlot}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Visit</label>
              <input type="text" value={bookForm.reason} onChange={(e) => setBookForm({ ...bookForm, reason: e.target.value })} placeholder="Describe symptoms or follow-up reason" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">Confirm Booking</button>
          </form>
        </div>
      )}

      {page === 'appointments' && (
        <div className="space-y-6">
          <PageHeader title="My Appointments" subtitle="Track upcoming visits, queue tokens, and cancel or request rescheduling." />
          <DataTable
            data={appointments}
            rowKey={(a) => a.id}
            columns={[
              { key: 'num', header: 'Appointment #', render: (a) => <span className="font-mono text-xs font-semibold">{a.appointmentNumber}</span> },
              { key: 'doc', header: 'Doctor & Department', render: (a) => `${a.doctorName} · ${a.departmentName}` },
              { key: 'slot', header: 'Date & Time', render: (a) => <span className="font-mono text-xs">{a.date} {a.timeSlot}</span> },
              { key: 'tok', header: 'Queue Token', render: (a) => <span className="font-mono font-bold text-sky-700">{a.queueToken || '—'}</span> },
              { key: 'status', header: 'Status', render: (a) => <StatusLabel status={a.status} /> },
              {
                key: 'act',
                header: 'Manage',
                align: 'right',
                render: (a) =>
                  !['Completed', 'Cancelled'].includes(a.status) ? (
                    <div className="inline-flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setRescheduleTarget(a);
                          setRescheduleDate(a.date);
                          setRescheduleSlot(a.timeSlot);
                        }}
                        className="text-xs font-semibold text-sky-700 hover:underline"
                      >
                        Reschedule
                      </button>
                      <button type="button" onClick={() => cancelAppointment(a.id)} className="text-xs font-semibold text-red-700 hover:underline">
                        Cancel
                      </button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {page === 'records' && (
        <div className="space-y-6">
          <PageHeader title="My Medical Records" subtitle="Consultation history, diagnoses, clinical treatment plans, and discharge summaries." />
          <div className="space-y-4">
            {consultations.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">{c.diagnosis}</h4>
                  <span className="font-mono text-xs text-slate-500">{c.date}</span>
                </div>
                <p className="text-xs text-slate-600"><strong>Complaints:</strong> {c.complaints}</p>
                <p className="text-xs text-slate-600"><strong>Treatment Plan:</strong> {c.treatmentPlan}</p>
                <p className="text-xs font-mono text-slate-500">Vitals: BP {c.vitalSigns.bloodPressure} · HR {c.vitalSigns.pulseRate} · SpO2 {c.vitalSigns.oxygenSaturation}</p>
              </div>
            ))}
            {dischargeSummaries.map((d) => (
              <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-1 text-sm">
                <div className="flex justify-between">
                  <h4 className="font-semibold text-teal-800">Discharge Summary</h4>
                  <StatusLabel status={d.status} />
                </div>
                <p className="text-xs text-slate-700">{d.dischargeSummary}</p>
                <p className="text-xs text-slate-500">Instructions: {d.treatmentInstructions}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {page === 'prescriptions' && (
        <div className="space-y-6">
          <PageHeader title="My Prescriptions" subtitle="View active medicine dosages and download printable prescriptions." />
          <DataTable
            data={prescriptions}
            rowKey={(rx) => rx.id}
            columns={[
              { key: 'code', header: 'Prescription #', render: (rx) => <span className="font-mono text-xs font-semibold">{rx.prescriptionCode}</span> },
              { key: 'doc', header: 'Physician', render: (rx) => rx.doctorName },
              { key: 'date', header: 'Date', render: (rx) => <span className="font-mono text-xs">{rx.date}</span> },
              { key: 'meds', header: 'Medicines & Dosage', render: (rx) => rx.items.map((i) => `${i.medicineName} (${i.dosage} · ${i.frequency})`).join(', ') },
              { key: 'status', header: 'Status', render: (rx) => <StatusLabel status={rx.status} /> },
              {
                key: 'dl',
                header: 'Download',
                align: 'right',
                render: (rx) => (
                  <button
                    type="button"
                    onClick={() =>
                      exportPrescriptionPDF({
                        prescriptionCode: rx.prescriptionCode,
                        date: rx.date,
                        patientName: patient?.fullName || user?.fullName || '',
                        patientCode: patient?.patientCode || '',
                        doctorName: rx.doctorName || '',
                        items: rx.items,
                      })
                    }
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Download PDF
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'reports' && (
        <div className="space-y-6">
          <PageHeader title="My Laboratory Reports" subtitle="Inspect verified test parameters and download official diagnostic reports." />
          <DataTable
            data={labs}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'test', header: 'Investigation', render: (l) => l.testName },
              { key: 'doc', header: 'Ordered By', render: (l) => l.doctorName },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
              {
                key: 'dl',
                header: 'Report PDF',
                align: 'right',
                render: (l) =>
                  l.status === 'Published' ? (
                    <button
                      type="button"
                      onClick={() =>
                        exportLabReportPDF({
                          requestCode: l.requestCode,
                          testName: l.testName,
                          patientName: patient?.fullName || user?.fullName || '',
                          patientCode: patient?.patientCode || '',
                          doctorName: l.doctorName || '',
                          sampleId: l.sampleId,
                          publishedAt: l.publishedAt,
                          verifiedBy: l.verifiedBy,
                          observations: l.observations,
                          results: l.results,
                        })
                      }
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Download Report PDF
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Processing</span>
                  ),
              },
            ]}
          />
        </div>
      )}

      {page === 'bills' && (
        <div className="space-y-6">
          <PageHeader title="My Invoices & Payment Receipts" subtitle="Pay pending hospital invoices online and download itemized receipts." />
          <DataTable
            data={bills}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Invoice #', render: (b) => <span className="font-mono text-xs font-semibold">{b.billNumber}</span> },
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
                      <button type="button" onClick={() => setPayTarget(b)} className="text-xs font-semibold text-teal-700 hover:underline">
                        Pay Now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => exportReceiptPDF({ ...b, patientName: patient?.fullName || user?.fullName || '', patientCode: patient?.patientCode || '' })}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Download Receipt
                    </button>
                  </div>
                ),
              },
            ]}
          />

          <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
          <DataTable
            data={payments}
            rowKey={(p) => p.id}
            columns={[
              { key: 'rcp', header: 'Receipt #', render: (p) => <span className="font-mono text-xs font-semibold">{p.receiptNumber}</span> },
              { key: 'inv', header: 'Invoice', render: (p) => p.billNumber },
              { key: 'method', header: 'Method', render: (p) => `${p.method} · ${p.transactionRef}` },
              { key: 'amt', header: 'Amount', align: 'right', render: (p) => `${currency}${p.amount.toFixed(2)}` },
              { key: 'date', header: 'Paid At', render: (p) => <span className="font-mono text-xs">{new Date(p.paidAt).toLocaleString()}</span> },
            ]}
          />
        </div>
      )}

      <Modal open={Boolean(rescheduleTarget)} onClose={() => setRescheduleTarget(null)} title="Request Appointment Reschedule" maxWidth="max-w-sm">
        <form onSubmit={submitReschedule} className="space-y-4">
          <div><label className="block text-xs font-semibold text-slate-700 mb-1">Preferred New Date</label><input required type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
          <div><label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Slot (HH:MM)</label><input required type="time" value={rescheduleSlot} onChange={(e) => setRescheduleSlot(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setRescheduleTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Submit Request</button></div>
        </form>
      </Modal>

      <Modal open={Boolean(payTarget)} onClose={() => setPayTarget(null)} title={`Pay Invoice ${payTarget?.billNumber || ''}`} maxWidth="max-w-sm">
        <form onSubmit={payBill} className="space-y-4">
          <p className="text-sm text-slate-700">Balance Due: <strong className="font-mono">{currency}{payTarget ? Math.max(0, payTarget.totalAmount - payTarget.paidAmount).toFixed(2) : '0.00'}</strong></p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'UPI' | 'Card' | 'Online')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option>UPI</option><option>Card</option><option>Online</option>
            </select>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg">Complete Payment</button></div>
        </form>
      </Modal>
    </AppShell>
  );
};
