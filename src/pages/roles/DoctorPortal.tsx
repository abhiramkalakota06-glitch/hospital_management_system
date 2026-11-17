import React, { useCallback, useEffect, useState } from 'react';
import {
  BedDouble,
  CalendarClock,
  Clock,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Pill,
  Plus,
  Printer,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type {
  Appointment,
  Bed,
  Consultation,
  DoctorProfile,
  LabRequest,
  LabTestCatalogItem,
  Medicine,
  Patient,
  Prescription,
  PrescriptionItem,
} from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportLabReportPDF, exportPrescriptionPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'appointments', label: 'My Appointments', icon: CalendarClock },
  { key: 'records', label: 'Patient Records', icon: FileText },
  { key: 'consultation', label: 'Consultation', icon: Stethoscope },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'labs', label: 'Laboratory Requests', icon: FlaskConical },
  { key: 'admission', label: 'Admission & Discharge', icon: BedDouble },
  { key: 'schedule', label: 'Schedule Management', icon: Clock },
  { key: 'doctor_profile', label: 'Professional Profile', icon: UserCheck },
];

export const DoctorPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { user, subscribeEvent } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [docStats, setDocStats] = useState<{ todayAppointments: number; waiting: number; consulting: number; completed: number; upcoming: number } | null>(null);
  const [myProfile, setMyProfile] = useState<DoctorProfile | null>(null);
  const [appointments, setAppointments] = useState<(Appointment & { patientName?: string; patientCode?: string; queueToken?: string | null })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<(Prescription & { patientName?: string; patientCode?: string; doctorName?: string })[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labCatalog, setLabCatalog] = useState<LabTestCatalogItem[]>([]);
  const [labRequests, setLabRequests] = useState<(LabRequest & { patientName?: string; patientCode?: string; doctorName?: string })[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);

  // EMR Viewer
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [emrData, setEmrData] = useState<{
    patient: Patient;
    consultations: Consultation[];
    prescriptions: Prescription[];
    labRequests: LabRequest[];
  } | null>(null);

  // Consultation form
  const [consForm, setConsForm] = useState({
    patientId: '',
    appointmentId: '',
    complaints: '',
    symptoms: '',
    bloodPressure: '122/78 mmHg',
    temperature: '98.6 °F',
    pulseRate: '76 bpm',
    respiratoryRate: '16 /min',
    oxygenSaturation: '99%',
    physicalExam: '',
    diagnosis: '',
    treatmentPlan: '',
    doctorNotes: '',
    followUpDate: '',
  });

  // Prescription builder
  const [rxModal, setRxModal] = useState(false);
  const [rxPatientId, setRxPatientId] = useState('');
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([
    { medicineId: 'med-1', medicineName: 'Amlodipine 5mg Tablet', dosage: '5 mg', frequency: 'Once daily', duration: '30 days', instructions: 'After breakfast', quantity: 30 },
  ]);

  // Lab order modal
  const [labModal, setLabModal] = useState(false);
  const [labForm, setLabForm] = useState({ patientId: '', testCatalogId: 'cat-1', priority: 'Routine' as 'Routine' | 'Urgent' | 'STAT' });

  // Admission & Discharge forms
  const [admitForm, setAdmitForm] = useState({ patientId: '', bedId: '', admissionNotes: '' });
  const [dischargeForm, setDischargeForm] = useState({ patientId: '', dischargeSummary: '', treatmentInstructions: '' });

  // Schedule & Leave
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' });

  const loadAll = useCallback(async () => {
    try {
      const [d, apt, p, docs, rx, med, cat, labs, b] = await Promise.all([
        apiFetch<{ doctorSpecific: typeof docStats }>('/dashboard'),
        apiFetch<{ appointments: typeof appointments }>('/appointments'),
        apiFetch<{ patients: Patient[] }>('/patients'),
        apiFetch<{ doctors: DoctorProfile[] }>('/doctors'),
        apiFetch<{ prescriptions: typeof prescriptions }>('/prescriptions'),
        apiFetch<{ medicines: Medicine[] }>('/pharmacy/medicines'),
        apiFetch<{ catalog: LabTestCatalogItem[] }>('/labs/catalog'),
        apiFetch<{ labRequests: typeof labRequests }>('/labs'),
        apiFetch<{ beds: Bed[] }>('/beds'),
      ]);
      setDocStats(d.doctorSpecific);
      setAppointments(apt.appointments);
      setPatients(p.patients);
      const mine = docs.doctors.find((doc) => doc.userId === user?.id) || null;
      setMyProfile(mine);
      setPrescriptions(rx.prescriptions);
      setMedicines(med.medicines);
      setLabCatalog(cat.catalog);
      setLabRequests(labs.labRequests);
      setBeds(b.beds);
      if (!selectedPatientId && p.patients.length > 0) setSelectedPatientId(p.patients[0].id);
      if (!consForm.patientId && p.patients.length > 0) setConsForm((cf) => ({ ...cf, patientId: p.patients[0].id }));
      if (!rxPatientId && p.patients.length > 0) setRxPatientId(p.patients[0].id);
      if (!labForm.patientId && p.patients.length > 0) setLabForm((lf) => ({ ...lf, patientId: p.patients[0].id }));
      if (!admitForm.patientId && p.patients.length > 0) setAdmitForm((af) => ({ ...af, patientId: p.patients[0].id }));
      if (!dischargeForm.patientId && p.patients.length > 0) setDischargeForm((df) => ({ ...df, patientId: p.patients[0].id }));
    } catch {
      // ignore
    }
  }, [user?.id, selectedPatientId, consForm.patientId, rxPatientId, labForm.patientId, admitForm.patientId, dischargeForm.patientId]);

  useEffect(() => {
    loadAll();
    const u1 = subscribeEvent('queue:updated', loadAll);
    const u2 = subscribeEvent('lab:updated', loadAll);
    return () => {
      u1();
      u2();
    };
  }, [loadAll, subscribeEvent]);

  useEffect(() => {
    if (!selectedPatientId) return;
    apiFetch<typeof emrData>(`/patients/${selectedPatientId}/emr`).then(setEmrData).catch(() => setEmrData(null));
  }, [selectedPatientId]);

  const updateAppointmentStatus = async (apt: Appointment, status: string) => {
    await apiFetch(`/appointments/${apt.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Appointment ${apt.appointmentNumber} marked ${status}`, 'info');
    if (status === 'In Consultation') {
      setConsForm((cf) => ({ ...cf, patientId: apt.patientId, appointmentId: apt.id }));
      setPage('consultation');
    }
    loadAll();
  };

  const saveConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/consultations', {
        method: 'POST',
        body: JSON.stringify({
          patientId: consForm.patientId,
          appointmentId: consForm.appointmentId || undefined,
          complaints: consForm.complaints,
          symptoms: consForm.symptoms,
          vitalSigns: {
            bloodPressure: consForm.bloodPressure,
            temperature: consForm.temperature,
            pulseRate: consForm.pulseRate,
            respiratoryRate: consForm.respiratoryRate,
            oxygenSaturation: consForm.oxygenSaturation,
          },
          physicalExam: consForm.physicalExam,
          diagnosis: consForm.diagnosis,
          treatmentPlan: consForm.treatmentPlan,
          doctorNotes: consForm.doctorNotes,
          followUpDate: consForm.followUpDate || undefined,
        }),
      });
      toast('Consultation saved & consultation bill generated', 'success');
      setConsForm((cf) => ({ ...cf, complaints: '', symptoms: '', physicalExam: '', diagnosis: '', treatmentPlan: '', doctorNotes: '', appointmentId: '' }));
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save consultation', 'error');
    }
  };

  const createPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/prescriptions', { method: 'POST', body: JSON.stringify({ patientId: rxPatientId, items: rxItems }) });
      toast('Prescription generated & sent to pharmacy', 'success');
      setRxModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const orderLabTest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/labs', { method: 'POST', body: JSON.stringify(labForm) });
      toast('Laboratory test order submitted', 'success');
      setLabModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const recommendAdmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/patients/${admitForm.patientId}/admit`, {
        method: 'POST',
        body: JSON.stringify({ bedId: admitForm.bedId || undefined, admissionNotes: admitForm.admissionNotes }),
      });
      toast('Patient admission recorded', 'success');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Admission failed', 'error');
    }
  };

  const requestDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/discharge-requests', { method: 'POST', body: JSON.stringify(dischargeForm) });
      toast('Discharge request submitted to nursing & billing', 'success');
      setDischargeForm((df) => ({ ...df, dischargeSummary: '', treatmentInstructions: '' }));
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const saveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myProfile) return;
    await apiFetch(`/doctors/${myProfile.id}`, {
      method: 'PUT',
      body: JSON.stringify({ available: myProfile.available, schedule: myProfile.schedule }),
    });
    toast('Consultation schedule updated', 'success');
    loadAll();
  };

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myProfile) return;
    await apiFetch(`/doctors/${myProfile.id}`, { method: 'PUT', body: JSON.stringify({ leaveRequest: leaveForm }) });
    toast('Leave request submitted', 'success');
    setLeaveForm({ startDate: '', endDate: '', reason: '' });
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

      {page === 'dashboard' && docStats && (
        <div className="space-y-6">
          <PageHeader
            title={`Physician Workspace — ${myProfile?.fullName || user?.fullName}`}
            subtitle="Manage daily outpatient consultations, electronic medical records, prescriptions, and diagnostic orders."
            actions={
              <button type="button" onClick={() => setPage('consultation')} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                Open Consultation Desk
              </button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Today's Appointments" value={docStats.todayAppointments} tone="blue" onClick={() => setPage('appointments')} />
            <StatCard label="Waiting Patients" value={docStats.waiting} tone="amber" />
            <StatCard label="Currently Consulting" value={docStats.consulting} tone="teal" />
            <StatCard label="Completed Consults" value={docStats.completed} />
            <StatCard label="Upcoming Scheduled" value={docStats.upcoming} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Active Patient Queue & Appointments</h3>
            <div className="divide-y divide-slate-100">
              {appointments.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">No appointments scheduled for your clinic queue yet.</p>
              ) : (
                appointments.slice(0, 6).map((a) => (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {a.queueToken ? <span className="font-mono text-sky-700 mr-2">{a.queueToken}</span> : null}
                        {a.patientName} <span className="text-xs font-mono text-slate-500">({a.patientCode})</span>
                      </p>
                      <p className="text-xs text-slate-500">{a.date} {a.timeSlot} · {a.reason}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusLabel status={a.status} />
                      {['Approved', 'Checked-In'].includes(a.status) && (
                        <button type="button" onClick={() => updateAppointmentStatus(a, 'In Consultation')} className="px-3 py-1 text-xs font-semibold text-white bg-teal-600 rounded-md">
                          Start Consultation
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {page === 'appointments' && (
        <div className="space-y-6">
          <PageHeader title="My Appointments" subtitle="Start or complete consultations, mark absences, or request rescheduling." />
          <DataTable
            data={appointments}
            rowKey={(a) => a.id}
            columns={[
              { key: 'num', header: 'Appointment #', render: (a) => <span className="font-mono text-xs font-semibold">{a.appointmentNumber}</span> },
              { key: 'pat', header: 'Patient', render: (a) => `${a.patientName} (${a.patientCode})` },
              { key: 'when', header: 'Schedule', render: (a) => <span className="font-mono text-xs">{a.date} {a.timeSlot}</span> },
              { key: 'reason', header: 'Chief Complaint', render: (a) => <span className="text-xs">{a.reason}</span> },
              { key: 'status', header: 'Status', render: (a) => <StatusLabel status={a.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (a) => (
                  <div className="inline-flex gap-2">
                    {['Pending', 'Approved', 'Checked-In'].includes(a.status) && (
                      <button type="button" onClick={() => updateAppointmentStatus(a, 'In Consultation')} className="text-xs font-semibold text-teal-700 hover:underline">
                        Start
                      </button>
                    )}
                    {a.status === 'In Consultation' && (
                      <button type="button" onClick={() => updateAppointmentStatus(a, 'Completed')} className="text-xs font-semibold text-emerald-700 hover:underline">
                        Complete
                      </button>
                    )}
                    {!['Completed', 'Cancelled'].includes(a.status) && (
                      <>
                        <button type="button" onClick={() => updateAppointmentStatus(a, 'Absent')} className="text-xs font-semibold text-amber-700 hover:underline">
                          Absent
                        </button>
                        <button type="button" onClick={() => updateAppointmentStatus(a, 'Reschedule Requested')} className="text-xs font-semibold text-sky-700 hover:underline">
                          Reschedule
                        </button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'records' && (
        <div className="space-y-6">
          <PageHeader title="Authorized Patient Medical Records (EMR)" subtitle="Inspect medical history, allergies, existing conditions, previous consultations, prescriptions, and lab results." />
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Select Authorized Patient:</label>
            <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg">
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
            </select>
          </div>
          {emrData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-sm">
                <h3 className="font-bold text-slate-900">{emrData.patient.fullName}</h3>
                <p className="font-mono text-xs text-sky-700">{emrData.patient.patientCode} · Blood {emrData.patient.bloodGroup}</p>
                <p className="text-xs text-slate-600">DOB: {emrData.patient.dateOfBirth} · {emrData.patient.gender}</p>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-red-700">Allergies</p>
                  <p className="text-xs text-slate-700">{emrData.patient.allergies.length ? emrData.patient.allergies.join(', ') : 'None recorded'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">Existing Conditions</p>
                  <p className="text-xs text-slate-700">{emrData.patient.existingConditions.length ? emrData.patient.existingConditions.join(', ') : 'None recorded'}</p>
                </div>
              </div>
              <div className="lg:col-span-8 space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Previous Consultations ({emrData.consultations.length})</h4>
                  {emrData.consultations.length === 0 ? (
                    <p className="text-xs text-slate-500">No consultation history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {emrData.consultations.map((c) => (
                        <div key={c.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between font-semibold text-slate-900">
                            <span>{c.diagnosis}</span>
                            <span className="font-mono">{c.date}</span>
                          </div>
                          <p className="text-slate-600">Complaints: {c.complaints}</p>
                          <p className="text-slate-600">Plan: {c.treatmentPlan}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Laboratory Results ({emrData.labRequests.length})</h4>
                  <div className="space-y-2">
                    {emrData.labRequests.map((l) => (
                      <div key={l.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                        <span><strong>{l.testName}</strong> ({l.requestCode})</span>
                        <StatusLabel status={l.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {page === 'consultation' && (
        <div className="space-y-6">
          <PageHeader title="Clinical Consultation Form" subtitle="Capture chief complaints, vital signs, physical examination, diagnosis, and treatment plan." />
          <form onSubmit={saveConsultation} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
                <select value={consForm.patientId} onChange={(e) => setConsForm({ ...consForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Follow-Up Date</label>
                <input type="date" value={consForm.followUpDate} onChange={(e) => setConsForm({ ...consForm, followUpDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Blood Pressure</label><input value={consForm.bloodPressure} onChange={(e) => setConsForm({ ...consForm, bloodPressure: e.target.value })} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Temperature</label><input value={consForm.temperature} onChange={(e) => setConsForm({ ...consForm, temperature: e.target.value })} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Pulse Rate</label><input value={consForm.pulseRate} onChange={(e) => setConsForm({ ...consForm, pulseRate: e.target.value })} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">Resp. Rate</label><input value={consForm.respiratoryRate} onChange={(e) => setConsForm({ ...consForm, respiratoryRate: e.target.value })} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" /></div>
              <div><label className="block text-[11px] font-semibold text-slate-600 mb-1">SpO2</label><input value={consForm.oxygenSaturation} onChange={(e) => setConsForm({ ...consForm, oxygenSaturation: e.target.value })} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient Complaints</label>
                <textarea required rows={2} value={consForm.complaints} onChange={(e) => setConsForm({ ...consForm, complaints: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Symptoms</label>
                <textarea rows={2} value={consForm.symptoms} onChange={(e) => setConsForm({ ...consForm, symptoms: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Examination</label>
                <textarea rows={2} value={consForm.physicalExam} onChange={(e) => setConsForm({ ...consForm, physicalExam: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnosis</label>
                <textarea required rows={2} value={consForm.diagnosis} onChange={(e) => setConsForm({ ...consForm, diagnosis: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Treatment Plan</label>
                <textarea rows={2} value={consForm.treatmentPlan} onChange={(e) => setConsForm({ ...consForm, treatmentPlan: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Doctor Clinical Notes</label>
                <textarea rows={2} value={consForm.doctorNotes} onChange={(e) => setConsForm({ ...consForm, doctorNotes: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>
            <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
              Save Consultation & Finalize Visit
            </button>
          </form>
        </div>
      )}

      {page === 'prescriptions' && (
        <div className="space-y-6">
          <PageHeader
            title="Prescription Management"
            subtitle="Create digital prescriptions with dosage, frequency, and duration, and download printable PDFs."
            actions={
              <button type="button" onClick={() => setRxModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>New Prescription</span>
              </button>
            }
          />
          <DataTable
            data={prescriptions}
            rowKey={(rx) => rx.id}
            columns={[
              { key: 'code', header: 'Prescription #', render: (rx) => <span className="font-mono text-xs font-semibold">{rx.prescriptionCode}</span> },
              { key: 'pat', header: 'Patient', render: (rx) => `${rx.patientName} (${rx.patientCode})` },
              { key: 'items', header: 'Medicines', render: (rx) => rx.items.map((i) => `${i.medicineName} (${i.dosage})`).join(', ') },
              { key: 'date', header: 'Date', render: (rx) => <span className="font-mono text-xs">{rx.date}</span> },
              { key: 'status', header: 'Status', render: (rx) => <StatusLabel status={rx.status} /> },
              {
                key: 'pdf',
                header: 'Print / Download',
                align: 'right',
                render: (rx) => (
                  <button
                    type="button"
                    onClick={() =>
                      exportPrescriptionPDF({
                        prescriptionCode: rx.prescriptionCode,
                        date: rx.date,
                        patientName: rx.patientName || '',
                        patientCode: rx.patientCode || '',
                        doctorName: rx.doctorName || myProfile?.fullName || '',
                        items: rx.items,
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'labs' && (
        <div className="space-y-6">
          <PageHeader
            title="Laboratory Test Orders & Results"
            subtitle="Order blood, urine, and biochemistry investigations and inspect verified results."
            actions={
              <button type="button" onClick={() => setLabModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Request Lab Test</span>
              </button>
            }
          />
          <DataTable
            data={labRequests}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'pat', header: 'Patient', render: (l) => `${l.patientName} (${l.patientCode})` },
              { key: 'test', header: 'Investigation', render: (l) => `${l.testName} · ${l.testCategory}` },
              { key: 'prio', header: 'Priority', render: (l) => <StatusLabel status={l.priority} /> },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
              {
                key: 'rep',
                header: 'Result',
                align: 'right',
                render: (l) =>
                  l.status === 'Published' ? (
                    <button
                      type="button"
                      onClick={() =>
                        exportLabReportPDF({
                          requestCode: l.requestCode,
                          testName: l.testName,
                          patientName: l.patientName || '',
                          patientCode: l.patientCode || '',
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
                    <span className="text-xs text-slate-400">Pending</span>
                  ),
              },
            ]}
          />
        </div>
      )}

      {page === 'admission' && (
        <div className="space-y-6">
          <PageHeader title="Patient Admission & Discharge" subtitle="Recommend inpatient bed admission or submit discharge summary & instructions." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={recommendAdmission} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Recommend Inpatient Admission</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
                <select value={admitForm.patientId} onChange={(e) => setAdmitForm({ ...admitForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Available Ward Bed (optional)</label>
                <select value={admitForm.bedId} onChange={(e) => setAdmitForm({ ...admitForm, bedId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option value="">Assign at Ward Desk</option>
                  {beds.filter((b) => b.status === 'Available').map((b) => (
                    <option key={b.id} value={b.id}>{b.bedNumber} — {b.wardName} ({b.wardType})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admission Notes</label>
                <textarea required rows={3} value={admitForm.admissionNotes} onChange={(e) => setAdmitForm({ ...admitForm, admissionNotes: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Admit Patient</button>
            </form>

            <form onSubmit={requestDischarge} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Request Patient Discharge</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Admitted Patient</label>
                <select value={dischargeForm.patientId} onChange={(e) => setDischargeForm({ ...dischargeForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.status})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Discharge Summary</label>
                <textarea required rows={2} value={dischargeForm.dischargeSummary} onChange={(e) => setDischargeForm({ ...dischargeForm, dischargeSummary: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Post-Discharge Treatment Instructions</label>
                <textarea required rows={2} value={dischargeForm.treatmentInstructions} onChange={(e) => setDischargeForm({ ...dischargeForm, treatmentInstructions: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">Submit Discharge Request</button>
            </form>
          </div>
        </div>
      )}

      {page === 'schedule' && myProfile && (
        <div className="space-y-6">
          <PageHeader title="Schedule & Leave Management" subtitle="Set consultation hours, break times, live availability, and leave requests." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={saveSchedule} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Working Hours & Availability</h3>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={myProfile.available} onChange={(e) => setMyProfile({ ...myProfile, available: e.target.checked })} />
                  <span>Available for Consultations</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-slate-600 mb-1">Start Time</label><input type="time" value={myProfile.schedule.startTime} onChange={(e) => setMyProfile({ ...myProfile, schedule: { ...myProfile.schedule, startTime: e.target.value } })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">End Time</label><input type="time" value={myProfile.schedule.endTime} onChange={(e) => setMyProfile({ ...myProfile, schedule: { ...myProfile.schedule, endTime: e.target.value } })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Break Start</label><input type="time" value={myProfile.schedule.breakStart} onChange={(e) => setMyProfile({ ...myProfile, schedule: { ...myProfile.schedule, breakStart: e.target.value } })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Break End</label><input type="time" value={myProfile.schedule.breakEnd} onChange={(e) => setMyProfile({ ...myProfile, schedule: { ...myProfile.schedule, breakEnd: e.target.value } })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
              </div>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Save Schedule</button>
            </form>

            <form onSubmit={submitLeave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Request Leave</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-slate-600 mb-1">Start Date</label><input required type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">End Date</label><input required type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
              </div>
              <input required placeholder="Reason for leave" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">Submit Leave Request</button>

              {myProfile.leaveRequests.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                  {myProfile.leaveRequests.map((lv) => (
                    <div key={lv.id} className="flex justify-between">
                      <span>{lv.startDate} to {lv.endDate} · {lv.reason}</span>
                      <StatusLabel status={lv.status} />
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {page === 'doctor_profile' && myProfile && (
        <div className="space-y-6">
          <PageHeader title="Physician Professional Profile" subtitle="Qualifications, clinical specialization, and consultation hours." />
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-4">
            <div className="flex items-center gap-4">
              <img src={myProfile.avatarUrl || '/src/assets/images/avatar_doctor_female_1794826955466.jpg'} alt={myProfile.fullName} referrerPolicy="no-referrer" className="w-16 h-16 rounded-full object-cover border border-slate-200" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">{myProfile.fullName}</h3>
                <p className="text-sm text-sky-700 font-medium">{myProfile.specialization}</p>
              </div>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-sm">
              <div><dt className="text-xs text-slate-500">Qualifications</dt><dd className="font-medium text-slate-900">{myProfile.qualifications}</dd></div>
              <div><dt className="text-xs text-slate-500">Consultation Fee</dt><dd className="font-mono font-semibold text-slate-900">₹{myProfile.consultationFee}</dd></div>
              <div><dt className="text-xs text-slate-500">Consultation Hours</dt><dd className="font-mono text-slate-900">{myProfile.schedule.startTime} – {myProfile.schedule.endTime}</dd></div>
              <div><dt className="text-xs text-slate-500">Working Days</dt><dd className="text-slate-900">{myProfile.schedule.workingDays.join(', ')}</dd></div>
            </dl>
          </div>
        </div>
      )}

      {/* New Prescription Modal */}
      <Modal open={rxModal} onClose={() => setRxModal(false)} title="Create Prescription" maxWidth="max-w-2xl">
        <form onSubmit={createPrescription} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
            <select value={rxPatientId} onChange={(e) => setRxPatientId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
            </select>
          </div>
          {rxItems.map((item, idx) => (
            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={item.medicineId || ''}
                onChange={(e) => {
                  const med = medicines.find((m) => m.id === e.target.value);
                  if (!med) return;
                  setRxItems((prev) => prev.map((r, i) => (i === idx ? { ...r, medicineId: med.id, medicineName: med.name } : r)));
                }}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
              >
                {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} (Stock: {m.quantity})</option>)}
              </select>
              <input placeholder="Dosage (e.g. 5 mg)" value={item.dosage} onChange={(e) => setRxItems((p) => p.map((r, i) => (i === idx ? { ...r, dosage: e.target.value } : r)))} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white" />
              <input placeholder="Frequency (Twice daily)" value={item.frequency} onChange={(e) => setRxItems((p) => p.map((r, i) => (i === idx ? { ...r, frequency: e.target.value } : r)))} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white" />
              <input placeholder="Duration (14 days)" value={item.duration} onChange={(e) => setRxItems((p) => p.map((r, i) => (i === idx ? { ...r, duration: e.target.value } : r)))} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white" />
              <input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => setRxItems((p) => p.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) } : r)))} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono" />
              <input placeholder="Instructions" value={item.instructions} onChange={(e) => setRxItems((p) => p.map((r, i) => (i === idx ? { ...r, instructions: e.target.value } : r)))} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white" />
            </div>
          ))}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setRxItems((p) => [...p, { medicineId: medicines[0]?.id, medicineName: medicines[0]?.name || '', dosage: '500 mg', frequency: 'Twice daily', duration: '5 days', instructions: 'After food', quantity: 10 }])}
              className="text-xs font-semibold text-sky-700 hover:underline"
            >
              + Add Another Medicine
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setRxModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Generate Prescription</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Lab Test Request Modal */}
      <Modal open={labModal} onClose={() => setLabModal(false)} title="Request Diagnostic Lab Test" maxWidth="max-w-md">
        <form onSubmit={orderLabTest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
            <select value={labForm.patientId} onChange={(e) => setLabForm({ ...labForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Investigation Test</label>
            <select value={labForm.testCatalogId} onChange={(e) => setLabForm({ ...labForm, testCatalogId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              {labCatalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.category})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
            <select value={labForm.priority} onChange={(e) => setLabForm({ ...labForm, priority: e.target.value as 'Routine' | 'Urgent' | 'STAT' })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option>Routine</option><option>Urgent</option><option>STAT</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setLabModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Submit Order</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
