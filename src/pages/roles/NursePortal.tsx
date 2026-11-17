import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BedDouble,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Pill,
  Users,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import type { Bed, DischargeRequest, MedicationAdminRecord, NursingNote, Patient, Prescription, VitalRecord } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Assigned Patients', icon: Users },
  { key: 'vitals', label: 'Vital Signs', icon: HeartPulse },
  { key: 'medications', label: 'Medication MAR', icon: Pill },
  { key: 'notes', label: 'Nursing Notes', icon: ClipboardList },
  { key: 'admission', label: 'Admission & Discharge', icon: BedDouble },
];

export const NursePortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [medsAdmin, setMedsAdmin] = useState<MedicationAdminRecord[]>([]);
  const [notes, setNotes] = useState<NursingNote[]>([]);
  const [prescriptions, setPrescriptions] = useState<(Prescription & { patientName?: string })[]>([]);
  const [discharges, setDischarges] = useState<DischargeRequest[]>([]);
  const [nurseStats, setNurseStats] = useState<{ assignedPatients: number; pendingMedications: number; escalatedAlerts: number } | null>(null);

  const [vitalForm, setVitalForm] = useState({ patientId: '', bloodPressure: '120/80 mmHg', temperature: '98.6 °F', pulseRate: '76 bpm', respiratoryRate: '16 /min', oxygenSaturation: '99%', notes: '' });
  const [noteForm, setNoteForm] = useState({ patientId: '', condition: 'Stable' as NursingNote['condition'], observation: '', progressNote: '', escalated: false });
  const [marForm, setMarForm] = useState({ patientId: '', medicineName: '', dosage: '50 mg Oral', scheduledTime: '' });

  const loadAll = useCallback(async () => {
    try {
      const [d, p, b, ov, rx] = await Promise.all([
        apiFetch<{ nurseSpecific: typeof nurseStats }>('/dashboard'),
        apiFetch<{ patients: Patient[] }>('/patients'),
        apiFetch<{ beds: Bed[] }>('/beds'),
        apiFetch<{ vitals: VitalRecord[]; medicationsAdmin: MedicationAdminRecord[]; nursingNotes: NursingNote[]; dischargeRequests: DischargeRequest[] }>('/nursing/overview'),
        apiFetch<{ prescriptions: (Prescription & { patientName?: string })[] }>('/prescriptions'),
      ]);
      setNurseStats(d.nurseSpecific);
      setPatients(p.patients);
      setBeds(b.beds);
      setVitals(ov.vitals);
      setMedsAdmin(ov.medicationsAdmin);
      setNotes(ov.nursingNotes);
      setDischarges(ov.dischargeRequests);
      setPrescriptions(rx.prescriptions);
      if (!vitalForm.patientId && p.patients.length > 0) {
        setVitalForm((vf) => ({ ...vf, patientId: p.patients[0].id }));
        setNoteForm((nf) => ({ ...nf, patientId: p.patients[0].id }));
        setMarForm((mf) => ({ ...mf, patientId: p.patients[0].id }));
      }
    } catch {
      // ignore
    }
  }, [vitalForm.patientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const recordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/nursing/vitals', { method: 'POST', body: JSON.stringify(vitalForm) });
      toast('Vital signs logged', 'success');
      setVitalForm((vf) => ({ ...vf, notes: '' }));
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const updateMarStatus = async (id: string, status: 'Administered' | 'Missed') => {
    await apiFetch(`/nursing/medications/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Dose marked ${status}`, status === 'Missed' ? 'error' : 'success');
    loadAll();
  };

  const addMarSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/nursing/medications', { method: 'POST', body: JSON.stringify(marForm) });
    toast('Medication dose scheduled on MAR', 'success');
    setMarForm((mf) => ({ ...mf, medicineName: '' }));
    loadAll();
  };

  const saveNursingNote = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/nursing/notes', { method: 'POST', body: JSON.stringify(noteForm) });
    toast(noteForm.escalated ? 'Nursing note & clinical escalation sent to doctor' : 'Nursing note saved', noteForm.escalated ? 'info' : 'success');
    setNoteForm((nf) => ({ ...nf, observation: '', progressNote: '', escalated: false }));
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

      {page === 'dashboard' && nurseStats && (
        <div className="space-y-6">
          <PageHeader title="Nursing Care & Ward Dashboard" subtitle="Monitor admitted patients, record bedside vitals, administer scheduled medications, and escalate alerts." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Admitted & Assigned Patients" value={nurseStats.assignedPatients} tone="blue" onClick={() => setPage('patients')} />
            <StatCard label="Scheduled Medication Doses" value={nurseStats.pendingMedications} tone="amber" onClick={() => setPage('medications')} />
            <StatCard label="Vital Logs Recorded" value={vitals.length} tone="teal" onClick={() => setPage('vitals')} />
            <StatCard label="Escalation Alerts" value={nurseStats.escalatedAlerts} tone="red" onClick={() => setPage('notes')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Pending Medication Administration (MAR)</h3>
              <div className="divide-y divide-slate-100">
                {medsAdmin.filter((m) => m.status === 'Scheduled').map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{m.medicineName} ({m.dosage})</p>
                      <p className="text-slate-500">{patients.find((p) => p.id === m.patientId)?.fullName} · Due {m.scheduledTime}</p>
                    </div>
                    <button type="button" onClick={() => updateMarStatus(m.id, 'Administered')} className="px-3 py-1.5 font-semibold text-white bg-teal-600 rounded-md">
                      Administer
                    </button>
                  </div>
                ))}
                {medsAdmin.filter((m) => m.status === 'Scheduled').length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">All scheduled doses administered.</p>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-900">Latest Ward Vitals</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {vitals.slice(0, 5).map((v) => (
                  <div key={v.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{patients.find((p) => p.id === v.patientId)?.fullName}</p>
                      <p className="font-mono text-slate-600">BP {v.bloodPressure} · HR {v.pulseRate} · SpO2 {v.oxygenSaturation}</p>
                    </div>
                    <span className="font-mono text-slate-400">{new Date(v.recordedAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {page === 'patients' && (
        <div className="space-y-6">
          <PageHeader title="Assigned Ward Patients" subtitle="Active inpatient roster with ward and bed assignments." />
          <DataTable
            data={patients}
            rowKey={(p) => p.id}
            columns={[
              { key: 'code', header: 'Patient ID', render: (p) => <span className="font-mono text-xs font-semibold">{p.patientCode}</span> },
              { key: 'name', header: 'Patient Name', render: (p) => p.fullName },
              {
                key: 'bed',
                header: 'Ward & Bed #',
                render: (p) => {
                  const bed = beds.find((b) => b.id === p.bedId);
                  return bed ? `${bed.wardName} · ${bed.bedNumber}` : 'Outpatient / Unassigned';
                },
              },
              { key: 'cond', header: 'Conditions', render: (p) => p.existingConditions.join(', ') || '—' },
              { key: 'status', header: 'Status', render: (p) => <StatusLabel status={p.status} /> },
            ]}
          />
        </div>
      )}

      {page === 'vitals' && (
        <div className="space-y-6">
          <PageHeader title="Vital Signs Charting" subtitle="Record blood pressure, temperature, pulse rate, respiratory rate, and oxygen saturation." />
          <form onSubmit={recordVitals} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
                <select value={vitalForm.patientId} onChange={(e) => setVitalForm({ ...vitalForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Blood Pressure</label><input required value={vitalForm.bloodPressure} onChange={(e) => setVitalForm({ ...vitalForm, bloodPressure: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Temperature</label><input required value={vitalForm.temperature} onChange={(e) => setVitalForm({ ...vitalForm, temperature: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Pulse Rate</label><input required value={vitalForm.pulseRate} onChange={(e) => setVitalForm({ ...vitalForm, pulseRate: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Respiratory Rate</label><input required value={vitalForm.respiratoryRate} onChange={(e) => setVitalForm({ ...vitalForm, respiratoryRate: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Oxygen Saturation (SpO2)</label><input required value={vitalForm.oxygenSaturation} onChange={(e) => setVitalForm({ ...vitalForm, oxygenSaturation: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" /></div>
            </div>
            <input placeholder="Bedside observation notes" value={vitalForm.notes} onChange={(e) => setVitalForm({ ...vitalForm, notes: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Record Vital Signs</button>
          </form>

          <DataTable
            data={vitals}
            rowKey={(v) => v.id}
            columns={[
              { key: 'pat', header: 'Patient', render: (v) => patients.find((p) => p.id === v.patientId)?.fullName || v.patientId },
              { key: 'bp', header: 'BP', render: (v) => <span className="font-mono text-xs">{v.bloodPressure}</span> },
              { key: 'temp', header: 'Temp', render: (v) => <span className="font-mono text-xs">{v.temperature}</span> },
              { key: 'hr', header: 'Pulse / RR', render: (v) => <span className="font-mono text-xs">{v.pulseRate} · {v.respiratoryRate}</span> },
              { key: 'spo2', header: 'SpO2', render: (v) => <span className="font-mono text-xs font-semibold">{v.oxygenSaturation}</span> },
              { key: 'time', header: 'Recorded At', render: (v) => <span className="font-mono text-xs">{new Date(v.recordedAt).toLocaleString()}</span> },
            ]}
          />
        </div>
      )}

      {page === 'medications' && (
        <div className="space-y-6">
          <PageHeader title="Medication Administration Record (MAR)" subtitle="Review doctor prescriptions, schedule doses, and mark doses as administered or missed." />
          <form onSubmit={addMarSchedule} className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
              <select value={marForm.patientId} onChange={(e) => setMarForm({ ...marForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Medicine</label><input required placeholder="Medicine name" value={marForm.medicineName} onChange={(e) => setMarForm({ ...marForm, medicineName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Dosage & Time</label><input placeholder="50mg · 18:00" value={marForm.dosage} onChange={(e) => setMarForm({ ...marForm, dosage: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" /></div>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Add to MAR</button>
          </form>

          <DataTable
            data={medsAdmin}
            rowKey={(m) => m.id}
            columns={[
              { key: 'pat', header: 'Patient', render: (m) => patients.find((p) => p.id === m.patientId)?.fullName || m.patientId },
              { key: 'med', header: 'Medication', render: (m) => `${m.medicineName} (${m.dosage})` },
              { key: 'time', header: 'Scheduled Time', render: (m) => <span className="font-mono text-xs">{m.scheduledTime}</span> },
              { key: 'status', header: 'Status', render: (m) => <StatusLabel status={m.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (m) =>
                  m.status === 'Scheduled' ? (
                    <div className="inline-flex gap-3">
                      <button type="button" onClick={() => updateMarStatus(m.id, 'Administered')} className="text-xs font-semibold text-teal-700 hover:underline">Mark Administered</button>
                      <button type="button" onClick={() => updateMarStatus(m.id, 'Missed')} className="text-xs font-semibold text-red-700 hover:underline">Record Missed</button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">{m.administeredBy || 'Logged'}</span>
                  ),
              },
            ]}
          />

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Active Doctor Prescriptions</h3>
            <div className="divide-y divide-slate-100">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="py-2.5 flex justify-between text-xs">
                  <span><strong className="font-mono">{rx.prescriptionCode}</strong> · {rx.patientName} — {rx.items.map((i) => `${i.medicineName} (${i.frequency})`).join(', ')}</span>
                  <StatusLabel status={rx.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'notes' && (
        <div className="space-y-6">
          <PageHeader title="Nursing Progress Notes & Escalation Alerts" subtitle="Document patient condition, treatment observations, and escalate urgent clinical changes to physicians." />
          <form onSubmit={saveNursingNote} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Patient</label>
                <select value={noteForm.patientId} onChange={(e) => setNoteForm({ ...noteForm, patientId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Condition Assessment</label>
                <select value={noteForm.condition} onChange={(e) => setNoteForm({ ...noteForm, condition: e.target.value as NursingNote['condition'] })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option>Stable</option><option>Improving</option><option>Needs Attention</option><option>Critical</option>
                </select>
              </div>
            </div>
            <textarea required rows={2} placeholder="Clinical observations" value={noteForm.observation} onChange={(e) => setNoteForm({ ...noteForm, observation: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <textarea rows={2} placeholder="Progress note & care actions taken" value={noteForm.progressNote} onChange={(e) => setNoteForm({ ...noteForm, progressNote: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-red-700 cursor-pointer">
                <input type="checkbox" checked={noteForm.escalated} onChange={(e) => setNoteForm({ ...noteForm, escalated: e.target.checked })} />
                <span>Trigger Escalation Alert to Attending Physician</span>
              </label>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Save Nursing Note</button>
            </div>
          </form>

          <DataTable
            data={notes}
            rowKey={(n) => n.id}
            columns={[
              { key: 'pat', header: 'Patient', render: (n) => patients.find((p) => p.id === n.patientId)?.fullName || n.patientId },
              { key: 'cond', header: 'Condition', render: (n) => <StatusLabel status={n.condition} /> },
              { key: 'obs', header: 'Observation', render: (n) => <span className="text-xs">{n.observation}</span> },
              { key: 'esc', header: 'Escalated', render: (n) => n.escalated ? <StatusLabel status="Escalated" /> : 'No' },
              { key: 'at', header: 'Time', render: (n) => <span className="font-mono text-xs">{new Date(n.createdAt).toLocaleString()}</span> },
            ]}
          />
        </div>
      )}

      {page === 'admission' && (
        <div className="space-y-6">
          <PageHeader title="Ward Bed Assignment & Discharge Checklist" subtitle="Assign available beds and complete nursing discharge checklists." />
          <DataTable
            data={discharges}
            rowKey={(d) => d.id}
            columns={[
              { key: 'pat', header: 'Patient', render: (d) => patients.find((p) => p.id === d.patientId)?.fullName || d.patientId },
              { key: 'sum', header: 'Treatment Instructions', render: (d) => <span className="text-xs">{d.treatmentInstructions}</span> },
              { key: 'nur', header: 'Nursing Checklist', render: (d) => <StatusLabel status={d.nursingChecklistDone ? 'Cleared' : 'Pending'} /> },
              { key: 'status', header: 'Status', render: (d) => <StatusLabel status={d.status} /> },
              {
                key: 'act',
                header: 'Checklist',
                align: 'right',
                render: (d) =>
                  !d.nursingChecklistDone ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/discharge-requests/${d.id}`, { method: 'PUT', body: JSON.stringify({ nursingChecklistDone: true }) });
                        toast('Nursing discharge checklist completed', 'success');
                        loadAll();
                      }}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Complete Checklist
                    </button>
                  ) : null,
              },
            ]}
          />

          <h3 className="text-sm font-semibold text-slate-900">Ward Beds Overview</h3>
          <DataTable
            data={beds}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Bed #', render: (b) => <span className="font-mono font-semibold">{b.bedNumber}</span> },
              { key: 'ward', header: 'Ward', render: (b) => `${b.wardName} (${b.wardType})` },
              { key: 'status', header: 'Status', render: (b) => <StatusLabel status={b.status} /> },
              {
                key: 'pat',
                header: 'Patient',
                render: (b) => patients.find((p) => p.id === b.patientId)?.fullName || '—',
              },
            ]}
          />
        </div>
      )}
    </AppShell>
  );
};
