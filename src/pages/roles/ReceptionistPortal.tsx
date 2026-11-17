import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck2,
  CalendarPlus,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  ListOrdered,
  Printer,
  Search,
  UserPlus,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type { Appointment, Bill, Department, DischargeRequest, DoctorProfile, Patient, Payment, QueueToken } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportPatientCardPDF, exportReceiptPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'registration', label: 'Patient Registration', icon: UserPlus },
  { key: 'search', label: 'Patient Search', icon: Search },
  { key: 'booking', label: 'Book Appointment', icon: CalendarPlus },
  { key: 'checkin', label: 'Appointment Check-in', icon: CalendarCheck2 },
  { key: 'queue', label: 'Queue Management', icon: ListOrdered },
  { key: 'billing', label: 'Billing & Payments', icon: CreditCard },
  { key: 'discharge', label: 'Discharge Assistance', icon: FileCheck2 },
];

export const ReceptionistPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { systemConfig, subscribeEvent } = useAuth();
  const { toast } = useToast();
  const currency = systemConfig.currencySymbol;
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [dash, setDash] = useState<{ metrics: Record<string, number> } | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [appointments, setAppointments] = useState<(Appointment & { patientName?: string; patientCode?: string; doctorName?: string; departmentName?: string; queueToken?: string | null })[]>([]);
  const [queue, setQueue] = useState<(QueueToken & { patientName?: string; patientCode?: string; doctorName?: string; departmentName?: string })[]>([]);
  const [bills, setBills] = useState<(Bill & { patientName?: string; patientCode?: string })[]>([]);
  const [payments, setPayments] = useState<(Payment & { patientName?: string; billNumber?: string })[]>([]);
  const [discharges, setDischarges] = useState<DischargeRequest[]>([]);

  // Registration form
  const [regForm, setRegForm] = useState({
    fullName: '',
    dateOfBirth: '1992-05-10',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    bloodGroup: 'O+',
  });
  const [lastRegistered, setLastRegistered] = useState<Patient | null>(null);

  // Patient search inspection
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Booking form
  const [bookForm, setBookForm] = useState({
    patientId: '',
    departmentId: 'dept-1',
    doctorId: 'doc-1',
    date: new Date().toISOString().slice(0, 10),
    timeSlot: '',
    reason: '',
  });
  const [slots, setSlots] = useState<{ timeSlot: string; available: boolean }[]>([]);

  // Payment modal
  const [payTarget, setPayTarget] = useState<(Bill & { patientName?: string; patientCode?: string }) | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card' | 'UPI' | 'Online'>('UPI');
  const [payRef, setPayRef] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [d, p, dep, doc, apt, q, b, pay, nur] = await Promise.all([
        apiFetch<typeof dash>('/dashboard'),
        apiFetch<{ patients: Patient[] }>('/patients'),
        apiFetch<{ departments: Department[] }>('/departments'),
        apiFetch<{ doctors: DoctorProfile[] }>('/doctors'),
        apiFetch<{ appointments: typeof appointments }>('/appointments'),
        apiFetch<{ queue: typeof queue }>('/queue'),
        apiFetch<{ bills: typeof bills }>('/bills'),
        apiFetch<{ payments: typeof payments }>('/payments'),
        apiFetch<{ dischargeRequests: DischargeRequest[] }>('/nursing/overview'),
      ]);
      setDash(d);
      setPatients(p.patients);
      setDepartments(dep.departments);
      setDoctors(doc.doctors);
      setAppointments(apt.appointments);
      setQueue(q.queue);
      setBills(b.bills);
      setPayments(pay.payments);
      setDischarges(nur.dischargeRequests);
      if (!bookForm.patientId && p.patients.length > 0) {
        setBookForm((bf) => ({ ...bf, patientId: p.patients[0].id }));
      }
    } catch {
      // ignore
    }
  }, [bookForm.patientId]);

  useEffect(() => {
    loadAll();
    const u1 = subscribeEvent('queue:updated', loadAll);
    const u2 = subscribeEvent('appointment:updated', loadAll);
    return () => {
      u1();
      u2();
    };
  }, [loadAll, subscribeEvent]);

  // Load live available slots whenever doctor or date changes
  useEffect(() => {
    if (!bookForm.doctorId || !bookForm.date) return;
    apiFetch<{ slots: { timeSlot: string; available: boolean }[] }>(
      `/appointments/slots?doctorId=${encodeURIComponent(bookForm.doctorId)}&date=${encodeURIComponent(bookForm.date)}`,
    )
      .then((res) => {
        setSlots(res.slots);
        const firstOpen = res.slots.find((s) => s.available);
        setBookForm((bf) => ({ ...bf, timeSlot: firstOpen ? firstOpen.timeSlot : '' }));
      })
      .catch(() => setSlots([]));
  }, [bookForm.doctorId, bookForm.date]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ patient: Patient }>('/patients', { method: 'POST', body: JSON.stringify(regForm) });
      setLastRegistered(res.patient);
      toast(`Registered ${res.patient.fullName} (${res.patient.patientCode})`, 'success');
      setRegForm({ fullName: '', dateOfBirth: '1992-05-10', gender: 'Male', phone: '', email: '', address: '', emergencyContact: '', bloodGroup: 'O+' });
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.timeSlot) {
      toast('Please select an available time slot', 'error');
      return;
    }
    try {
      const res = await apiFetch<{ appointment: Appointment }>('/appointments', { method: 'POST', body: JSON.stringify(bookForm) });
      toast(`Appointment ${res.appointment.appointmentNumber} confirmed`, 'success');
      setBookForm((bf) => ({ ...bf, reason: '' }));
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Booking failed', 'error');
    }
  };

  const handleCheckIn = async (aptId: string) => {
    try {
      const res = await apiFetch<{ queueToken: QueueToken }>(`/appointments/${aptId}/checkin`, { method: 'POST' });
      toast(`Checked in · Token ${res.queueToken.tokenNumber} issued`, 'success');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Check-in failed', 'error');
    }
  };

  const handleQueueAction = async (tokenId: string, action: 'call' | 'start' | 'complete' | 'skip' | 'recall' | 'cancel') => {
    await apiFetch(`/queue/${tokenId}/action`, { method: 'POST', body: JSON.stringify({ action }) });
    toast(`Queue token updated (${action})`, 'info');
    loadAll();
  };

  const generateConsultationBill = async (patientId: string, doctorId: string) => {
    const doc = doctors.find((d) => d.id === doctorId) || doctors[0];
    if (!doc) return;
    await apiFetch('/bills', {
      method: 'POST',
      body: JSON.stringify({
        patientId,
        items: [{ category: 'Consultation', description: `Consultation — ${doc.fullName}`, qty: 1, unitPrice: doc.consultationFee }],
      }),
    });
    toast('Consultation bill generated', 'success');
    loadAll();
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    try {
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({ billId: payTarget.id, amount: Number(payAmount), method: payMethod, transactionRef: payRef }),
      });
      toast('Payment recorded & receipt issued', 'success');
      setPayTarget(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Payment failed', 'error');
    }
  };

  const deptDoctors = doctors.filter((d) => d.departmentId === bookForm.departmentId);

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
            title="Front Desk & Reception Dashboard"
            subtitle="Manage patient registrations, appointment check-ins, live outpatient queue tokens, and receipts."
            actions={
              <button type="button" onClick={() => setPage('booking')} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
                Book Appointment
              </button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Today's Registrations" value={dash.metrics.todayRegistrations} tone="blue" onClick={() => setPage('registration')} />
            <StatCard label="Today's Appointments" value={dash.metrics.todayAppointments} onClick={() => setPage('checkin')} />
            <StatCard label="Waiting Queue" value={dash.metrics.waitingQueue} tone="amber" onClick={() => setPage('queue')} />
            <StatCard label="Checked-In / Active" value={dash.metrics.checkedInToday} tone="teal" />
            <StatCard label="Completed / Cancelled" value={`${dash.metrics.completedToday} / ${dash.metrics.cancelledToday}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleRegister} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Quick Patient Registration</h3>
              <input required placeholder="Patient Full Name" value={regForm.fullName} onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="date" value={regForm.dateOfBirth} onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                <select value={regForm.gender} onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as 'Male' | 'Female' | 'Other' })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="Phone Number" value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                <input placeholder="Blood Group (O+)" value={regForm.bloodGroup} onChange={(e) => setRegForm({ ...regForm, bloodGroup: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <button type="submit" className="w-full py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg">
                Register & Generate Patient ID
              </button>
            </form>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Live Outpatient Queue Snapshot</h3>
                <button type="button" onClick={() => setPage('queue')} className="text-xs font-semibold text-sky-700 hover:underline">Manage Queue</button>
              </div>
              <div className="divide-y divide-slate-100">
                {queue.slice(0, 6).map((q) => (
                  <div key={q.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-sky-700 mr-2">{q.tokenNumber}</span>
                      <span className="font-semibold text-slate-900">{q.patientName}</span>
                      <span className="text-slate-500"> · {q.doctorName}</span>
                    </div>
                    <StatusLabel status={q.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {page === 'registration' && (
        <div className="space-y-6">
          <PageHeader title="Patient Registration" subtitle="Create a new patient file with a unique Patient ID and printable registration card." />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleRegister} className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Patient Full Name</label>
                  <input required type="text" value={regForm.fullName} onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input required type="date" value={regForm.dateOfBirth} onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select value={regForm.gender} onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as 'Male' | 'Female' | 'Other' })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select value={regForm.bloodGroup} onChange={(e) => setRegForm({ ...regForm, bloodGroup: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => <option key={bg}>{bg}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input required type="text" value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input type="email" value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Residential Address</label>
                <input type="text" value={regForm.address} onChange={(e) => setRegForm({ ...regForm, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact (Name & Phone)</label>
                <input type="text" value={regForm.emergencyContact} onChange={(e) => setRegForm({ ...regForm, emergencyContact: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
                Complete Registration
              </button>
            </form>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Patient Registration Card Preview</h3>
                <p className="text-xs text-slate-500 mt-1">Generated immediately upon registration.</p>
                {lastRegistered ? (
                  <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50/50 p-5 space-y-2 text-sm">
                    <p className="font-mono text-xs font-bold text-sky-700">{lastRegistered.patientCode}</p>
                    <p className="text-lg font-bold text-slate-900">{lastRegistered.fullName}</p>
                    <p className="text-xs text-slate-600">DOB: {lastRegistered.dateOfBirth} · {lastRegistered.gender} · Blood {lastRegistered.bloodGroup}</p>
                    <p className="text-xs text-slate-600">Phone: {lastRegistered.phone}</p>
                    <p className="text-xs text-slate-600">Emergency: {lastRegistered.emergencyContact || 'Not provided'}</p>
                  </div>
                ) : (
                  <p className="py-12 text-center text-xs text-slate-400">Submit registration form to preview ID card.</p>
                )}
              </div>
              {lastRegistered && (
                <button
                  type="button"
                  onClick={() => exportPatientCardPDF(lastRegistered)}
                  className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                >
                  <Printer className="w-4 h-4" />
                  <span>Download Patient Card PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {page === 'search' && (
        <div className="space-y-6">
          <PageHeader title="Patient Directory & Search" subtitle="Search by Patient ID, full name, or phone number to view profile and appointment history." />
          <DataTable
            data={patients}
            rowKey={(p) => p.id}
            searchFilter={(p, q) => p.patientCode.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)}
            searchPlaceholder="Search by Patient ID, name, or phone..."
            columns={[
              { key: 'code', header: 'Patient ID', render: (p) => <span className="font-mono text-xs font-semibold">{p.patientCode}</span> },
              { key: 'name', header: 'Name', render: (p) => p.fullName },
              { key: 'phone', header: 'Phone', render: (p) => <span className="font-mono text-xs">{p.phone}</span> },
              { key: 'blood', header: 'Blood', render: (p) => p.bloodGroup },
              { key: 'status', header: 'Status', render: (p) => <StatusLabel status={p.status} /> },
              {
                key: 'act',
                header: 'Profile & Card',
                align: 'right',
                render: (p) => (
                  <div className="inline-flex gap-3">
                    <button type="button" onClick={() => setSelectedPatient(p)} className="text-xs font-semibold text-sky-700 hover:underline">
                      History
                    </button>
                    <button type="button" onClick={() => exportPatientCardPDF(p)} className="text-xs font-semibold text-teal-700 hover:underline">
                      Print Card
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'booking' && (
        <div className="space-y-6">
          <PageHeader title="Appointment Booking" subtitle="Real-time doctor slot availability with automatic double-booking prevention." />
          <form onSubmit={handleBookAppointment} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-3xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Patient</label>
                <select value={bookForm.patientId} onChange={(e) => setBookForm({ ...bookForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <select
                  value={bookForm.departmentId}
                  onChange={(e) => {
                    const depId = e.target.value;
                    const firstDoc = doctors.find((d) => d.departmentId === depId);
                    setBookForm({ ...bookForm, departmentId: depId, doctorId: firstDoc?.id || '' });
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Doctor</label>
                <select value={bookForm.doctorId} onChange={(e) => setBookForm({ ...bookForm, doctorId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {(deptDoctors.length > 0 ? deptDoctors : doctors).map((d) => (
                    <option key={d.id} value={d.id}>{d.fullName} ({currency}{d.consultationFee})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Appointment Date</label>
                <input required type="date" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Available Time Slots</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.timeSlot}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setBookForm({ ...bookForm, timeSlot: s.timeSlot })}
                    className={`py-2 px-2 rounded-lg text-xs font-mono border transition-colors ${
                      !s.available
                        ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Visit Reason</label>
              <input type="text" value={bookForm.reason} onChange={(e) => setBookForm({ ...bookForm, reason: e.target.value })} placeholder="Consultation reason or symptoms" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>

            <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
              Confirm Appointment
            </button>
          </form>
        </div>
      )}

      {page === 'checkin' && (
        <div className="space-y-6">
          <PageHeader title="Appointment Check-In" subtitle="Verify patient arrival, issue queue tokens, and notify the clinical department." />
          <DataTable
            data={appointments}
            rowKey={(a) => a.id}
            searchFilter={(a, q) => (a.patientName || '').toLowerCase().includes(q) || a.appointmentNumber.toLowerCase().includes(q)}
            columns={[
              { key: 'num', header: 'Appointment #', render: (a) => <span className="font-mono text-xs font-semibold">{a.appointmentNumber}</span> },
              { key: 'pat', header: 'Patient', render: (a) => `${a.patientName} (${a.patientCode})` },
              { key: 'doc', header: 'Doctor & Dept', render: (a) => `${a.doctorName} · ${a.departmentName}` },
              { key: 'slot', header: 'Date & Time', render: (a) => <span className="font-mono text-xs">{a.date} {a.timeSlot}</span> },
              { key: 'tok', header: 'Token', render: (a) => <span className="font-mono font-bold text-sky-700">{a.queueToken || '—'}</span> },
              { key: 'status', header: 'Status', render: (a) => <StatusLabel status={a.status} /> },
              {
                key: 'act',
                header: 'Check-In',
                align: 'right',
                render: (a) =>
                  ['Pending', 'Approved'].includes(a.status) ? (
                    <button type="button" onClick={() => handleCheckIn(a.id)} className="px-3 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md">
                      Mark Arrived & Issue Token
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {page === 'queue' && (
        <div className="space-y-6">
          <PageHeader
            title="Live Queue Management"
            subtitle="Call next patient, skip or recall tokens, and coordinate consultations across departments."
            actions={
              <button type="button" onClick={onOpenQueueDisplay} className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100">
                Open Waiting Room Display
              </button>
            }
          />
          <DataTable
            data={queue}
            rowKey={(q) => q.id}
            columns={[
              { key: 'tok', header: 'Token', render: (q) => <span className="font-mono text-sm font-bold text-sky-700">{q.tokenNumber}</span> },
              { key: 'pat', header: 'Patient', render: (q) => `${q.patientName} (${q.patientCode})` },
              { key: 'doc', header: 'Doctor & Dept', render: (q) => `${q.doctorName} · ${q.departmentName}` },
              { key: 'wait', header: 'Est. Wait', align: 'right', render: (q) => `${q.estimatedWaitMinutes} min` },
              { key: 'status', header: 'Status', render: (q) => <StatusLabel status={q.status} /> },
              {
                key: 'act',
                header: 'Queue Controls',
                align: 'right',
                render: (q) => (
                  <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                    {q.status === 'Waiting' && (
                      <>
                        <button type="button" onClick={() => handleQueueAction(q.id, 'call')} className="text-xs font-semibold text-sky-700 hover:underline">Call</button>
                        <button type="button" onClick={() => handleQueueAction(q.id, 'skip')} className="text-xs font-semibold text-amber-700 hover:underline">Skip</button>
                      </>
                    )}
                    {q.status === 'Skipped' && (
                      <button type="button" onClick={() => handleQueueAction(q.id, 'recall')} className="text-xs font-semibold text-sky-700 hover:underline">Recall</button>
                    )}
                    {q.status === 'Called' && (
                      <button type="button" onClick={() => handleQueueAction(q.id, 'start')} className="text-xs font-semibold text-teal-700 hover:underline">Start</button>
                    )}
                    {['Called', 'In Consultation'].includes(q.status) && (
                      <button type="button" onClick={() => handleQueueAction(q.id, 'complete')} className="text-xs font-semibold text-emerald-700 hover:underline">Complete</button>
                    )}
                    {!['Completed', 'Cancelled'].includes(q.status) && (
                      <button type="button" onClick={() => handleQueueAction(q.id, 'cancel')} className="text-xs font-semibold text-red-700 hover:underline">Cancel</button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'billing' && (
        <div className="space-y-6">
          <PageHeader
            title="Front-Desk Billing & Payments"
            subtitle="Generate consultation invoices, accept payments, and print receipts."
            actions={
              patients[0] && doctors[0] ? (
                <button
                  type="button"
                  onClick={() => generateConsultationBill(patients[0].id, doctors[0].id)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700"
                >
                  Quick Consultation Bill
                </button>
              ) : null
            }
          />
          <DataTable
            data={bills}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Invoice #', render: (b) => <span className="font-mono text-xs font-semibold">{b.billNumber}</span> },
              { key: 'pat', header: 'Patient', render: (b) => `${b.patientName} (${b.patientCode})` },
              { key: 'tot', header: 'Total', align: 'right', render: (b) => `${currency}${b.totalAmount.toFixed(2)}` },
              { key: 'bal', header: 'Balance', align: 'right', render: (b) => `${currency}${Math.max(0, b.totalAmount - b.paidAmount).toFixed(2)}` },
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
                          setPayTarget(b);
                          setPayAmount(String(Math.max(0, b.totalAmount - b.paidAmount).toFixed(2)));
                          setPayRef(`RCP-${Date.now().toString().slice(-6)}`);
                        }}
                        className="text-xs font-semibold text-teal-700 hover:underline"
                      >
                        Collect Payment
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

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Payment History</h3>
            <DataTable
              data={payments}
              rowKey={(p) => p.id}
              columns={[
                { key: 'rcp', header: 'Receipt #', render: (p) => <span className="font-mono text-xs font-semibold">{p.receiptNumber}</span> },
                { key: 'inv', header: 'Invoice', render: (p) => p.billNumber },
                { key: 'pat', header: 'Patient', render: (p) => p.patientName },
                { key: 'method', header: 'Method', render: (p) => `${p.method} · ${p.transactionRef}` },
                { key: 'amt', header: 'Amount', align: 'right', render: (p) => `${currency}${p.amount.toFixed(2)}` },
              ]}
            />
          </div>
        </div>
      )}

      {page === 'discharge' && (
        <div className="space-y-6">
          <PageHeader title="Discharge Assistance" subtitle="Coordinate billing clearance and finalize authorized patient discharges." />
          <DataTable
            data={discharges}
            rowKey={(d) => d.id}
            columns={[
              { key: 'pat', header: 'Patient', render: (d) => patients.find((p) => p.id === d.patientId)?.fullName || d.patientId },
              { key: 'sum', header: 'Discharge Summary', render: (d) => <span className="text-xs">{d.dischargeSummary}</span> },
              { key: 'nur', header: 'Nursing Checklist', render: (d) => <StatusLabel status={d.nursingChecklistDone ? 'Cleared' : 'Pending'} /> },
              { key: 'bil', header: 'Billing Clearance', render: (d) => <StatusLabel status={d.billingCleared ? 'Cleared' : 'Pending'} /> },
              { key: 'stat', header: 'Status', render: (d) => <StatusLabel status={d.status} /> },
              {
                key: 'act',
                header: 'Action',
                align: 'right',
                render: (d) =>
                  d.status !== 'Completed' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/discharge-requests/${d.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ billingCleared: true, finalize: d.nursingChecklistDone }),
                        });
                        toast('Billing clearance updated', 'success');
                        loadAll();
                      }}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      {d.billingCleared ? 'Finalize Discharge' : 'Verify Billing Clearance'}
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {/* Patient History Modal */}
      <Modal open={Boolean(selectedPatient)} onClose={() => setSelectedPatient(null)} title={`Patient Profile — ${selectedPatient?.fullName || ''}`}>
        {selectedPatient && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p>Patient ID: <strong className="font-mono">{selectedPatient.patientCode}</strong></p>
              <p>Blood Group: <strong>{selectedPatient.bloodGroup}</strong></p>
              <p>Phone: <strong>{selectedPatient.phone}</strong></p>
              <p>Status: <strong>{selectedPatient.status}</strong></p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Appointment History</h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {appointments.filter((a) => a.patientId === selectedPatient.id).map((a) => (
                  <div key={a.id} className="p-2.5 flex justify-between text-xs">
                    <span>{a.appointmentNumber} · {a.date} {a.timeSlot} · {a.doctorName}</span>
                    <StatusLabel status={a.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment Modal */}
      <Modal open={Boolean(payTarget)} onClose={() => setPayTarget(null)} title={`Collect Payment — ${payTarget?.billNumber || ''}`} maxWidth="max-w-md">
        <form onSubmit={submitPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount ({currency})</label>
            <input required type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'Cash' | 'Card' | 'UPI' | 'Online')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option>UPI</option><option>Card</option><option>Cash</option><option>Online</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Reference</label>
            <input required type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg">Record Payment</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
