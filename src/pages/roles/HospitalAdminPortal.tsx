import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Building,
  CalendarClock,
  CreditCard,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  Pill,
  Plus,
  Settings,
  Stethoscope,
  UserCog,
  Users,
} from 'lucide-react';
import { AnalyticsReportView } from '../../components/AnalyticsReportView';
import { AppShell, type NavItem } from '../../components/AppShell';
import { BarChart, DonutBreakdown } from '../../components/Charts';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast, type ColumnDef } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type {
  Appointment,
  AuditLog,
  Bed,
  Bill,
  Department,
  DoctorProfile,
  Hospital,
  LabRequest,
  Medicine,
  Patient,
  StaffProfile,
  SystemConfig,
  UserRole,
} from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'patients', label: 'Patient Management', icon: Users },
  { key: 'doctors', label: 'Doctor Management', icon: Stethoscope },
  { key: 'staff', label: 'Staff Management', icon: UserCog },
  { key: 'departments', label: 'Departments', icon: Building },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'beds', label: 'Beds & Wards', icon: BedDouble },
  { key: 'pharmacy', label: 'Pharmacy Inventory', icon: Pill },
  { key: 'labs', label: 'Laboratory', icon: FlaskConical },
  { key: 'billing', label: 'Billing Management', icon: CreditCard },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Hospital Settings', icon: Settings },
];

export const HospitalAdminPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { systemConfig } = useAuth();
  const { toast } = useToast();
  const currency = systemConfig.currencySymbol;
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [dash, setDash] = useState<{
    metrics: Record<string, number>;
    departmentStats: { name: string; appointments: number; doctors: number }[];
    recentActivity: AuditLog[];
  } | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<(DoctorProfile & { departmentName?: string; appointmentsCount?: number; completedCount?: number; loginEmail?: string; loginUsername?: string; employeeId?: string; accountActive?: boolean })[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [appointments, setAppointments] = useState<(Appointment & { patientName?: string; doctorName?: string; departmentName?: string })[]>([]);
  const [beds, setBeds] = useState<(Bed & { patientName?: string | null })[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labs, setLabs] = useState<(LabRequest & { patientName?: string; doctorName?: string })[]>([]);
  const [bills, setBills] = useState<(Bill & { patientName?: string })[]>([]);
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [cfg, setCfg] = useState<SystemConfig | null>(null);

  // Modals
  const [patModal, setPatModal] = useState(false);
  const [patForm, setPatForm] = useState({ fullName: '', dateOfBirth: '1990-01-01', gender: 'Male', phone: '', email: '', bloodGroup: 'O+', address: '', emergencyContact: '' });
  const [emrPatient, setEmrPatient] = useState<Patient | null>(null);

  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ fullName: '', departmentId: 'dept-1', specialization: '', qualifications: 'MBBS, MD', consultationFee: 1000, phone: '', email: '', username: '', password: '' });
  const [showDocPwd, setShowDocPwd] = useState(false);
  const [docResetTarget, setDocResetTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [docResetPwd, setDocResetPwd] = useState('');

  const [staffModal, setStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState({ fullName: '', role: 'nurse' as UserRole, departmentId: 'dept-1', designation: 'Staff Nurse', shift: 'Morning (07:00 - 15:00)', phone: '' });

  const [deptModal, setDeptModal] = useState(false);
  const [deptForm, setDeptForm] = useState({ code: '', name: '', floor: '1st Floor', description: '' });

  const [bedAssignTarget, setBedAssignTarget] = useState<Bed | null>(null);
  const [bedPatientId, setBedPatientId] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [d, p, doc, stf, dep, apt, b, med, lb, bl, hosp, sc] = await Promise.all([
        apiFetch<typeof dash>('/dashboard'),
        apiFetch<{ patients: Patient[] }>('/patients'),
        apiFetch<{ doctors: (DoctorProfile & { departmentName?: string; appointmentsCount?: number; completedCount?: number; loginEmail?: string; loginUsername?: string; employeeId?: string; accountActive?: boolean })[] }>('/doctors'),
        apiFetch<{ staff: StaffProfile[] }>('/staff'),
        apiFetch<{ departments: Department[] }>('/departments'),
        apiFetch<{ appointments: (Appointment & { patientName?: string; doctorName?: string; departmentName?: string })[] }>('/appointments'),
        apiFetch<{ beds: (Bed & { patientName?: string | null })[] }>('/beds'),
        apiFetch<{ medicines: Medicine[] }>('/pharmacy/medicines'),
        apiFetch<{ labRequests: (LabRequest & { patientName?: string; doctorName?: string })[] }>('/labs'),
        apiFetch<{ bills: (Bill & { patientName?: string })[] }>('/bills'),
        apiFetch<{ hospitals: Hospital[] }>('/hospitals'),
        apiFetch<{ systemConfig: SystemConfig }>('/system/config'),
      ]);
      setDash(d);
      setPatients(p.patients);
      setDoctors(doc.doctors);
      setStaff(stf.staff);
      setDepartments(dep.departments);
      setAppointments(apt.appointments);
      setBeds(b.beds);
      setMedicines(med.medicines);
      setLabs(lb.labRequests);
      setBills(bl.bills);
      setHospital(hosp.hospitals[0] || null);
      setCfg(sc.systemConfig);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const registerPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/patients', { method: 'POST', body: JSON.stringify(patForm) });
      toast('Patient registered', 'success');
      setPatModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const addDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ loginCredentials?: { email: string; username: string } }>('/doctors', {
        method: 'POST',
        body: JSON.stringify(docForm),
      });
      toast(
        res.loginCredentials
          ? `Doctor added with separate login (${res.loginCredentials.email})`
          : 'Doctor profile added',
        'success',
      );
      setDocModal(false);
      setDocForm({ fullName: '', departmentId: departments[0]?.id || 'dept-1', specialization: '', qualifications: 'MBBS, MD', consultationFee: 1000, phone: '', email: '', username: '', password: '' });
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const resetDoctorPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docResetTarget) return;
    try {
      await apiFetch(`/doctors/${docResetTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ resetPasswordTo: docResetPwd }),
      });
      toast(`Updated login password for ${docResetTarget.fullName}`, 'success');
      setDocResetTarget(null);
      setDocResetPwd('');
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Password update failed', 'error');
    }
  };

  const addStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/staff', { method: 'POST', body: JSON.stringify(staffForm) });
      toast('Staff member added', 'success');
      setStaffModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const addDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/departments', { method: 'POST', body: JSON.stringify(deptForm) });
      toast('Department created', 'success');
      setDeptModal(false);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const updateAppointmentStatus = async (id: string, status: string) => {
    await apiFetch(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(`Appointment marked ${status}`, 'info');
    loadAll();
  };

  const assignOrReleaseBed = async (bedId: string, patientId?: string) => {
    try {
      await apiFetch(`/beds/${bedId}/assign`, { method: 'POST', body: JSON.stringify({ patientId }) });
      toast(patientId ? 'Bed assigned to patient' : 'Bed released', 'success');
      setBedAssignTarget(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const saveHospitalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hospital) {
      await apiFetch(`/hospitals/${hospital.id}`, { method: 'PUT', body: JSON.stringify(hospital) });
    }
    if (cfg) {
      await apiFetch('/system/config', { method: 'PUT', body: JSON.stringify(cfg) });
    }
    toast('Hospital settings saved', 'success');
    loadAll();
  };

  const today = new Date().toISOString().slice(0, 10);

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
          <PageHeader title="Hospital Operations Dashboard" subtitle="Daily clinical throughput, bed utilization, appointments, and revenue overview." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Patients" value={dash.metrics.totalPatients} helper={`${dash.metrics.admittedPatients} admitted · ${dash.metrics.dischargedPatients} discharged`} onClick={() => setPage('patients')} />
            <StatCard label="Today's Appointments" value={dash.metrics.todayAppointments} tone="blue" helper={`${dash.metrics.availableDoctors} doctors available`} onClick={() => setPage('appointments')} />
            <StatCard label="Bed Occupancy" value={`${dash.metrics.bedOccupancyRate}%`} tone="teal" helper={`${dash.metrics.occupiedBeds}/${dash.metrics.totalBeds} beds occupied`} onClick={() => setPage('beds')} />
            <StatCard label="Revenue & Pending Bills" value={`${currency}${dash.metrics.totalRevenue.toLocaleString()}`} tone="amber" helper={`${dash.metrics.pendingBillsCount} pending invoice(s)`} onClick={() => setPage('billing')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BarChart
                title="Department-Wise Appointment & Physician Distribution"
                data={dash.departmentStats.map((d) => ({
                  label: d.name,
                  value: d.appointments,
                  secondary: `${d.doctors} doctor(s)`,
                }))}
              />
            </div>
            <DonutBreakdown
              title="Ward & Bed Status"
              segments={[
                { label: 'Occupied', value: dash.metrics.occupiedBeds, color: '#0284C7' },
                { label: 'Available', value: dash.metrics.availableBeds, color: '#0D9488' },
                { label: 'Maintenance', value: beds.filter((b) => b.status === 'Maintenance').length, color: '#D97706' },
              ]}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Clinical & Operational Activity</h3>
            <div className="divide-y divide-slate-100">
              {dash.recentActivity.map((a) => (
                <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{a.actorName}</span>
                    <span className="text-slate-500"> · {a.action} · {a.details}</span>
                  </div>
                  <span className="font-mono text-slate-400">{new Date(a.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'patients' && (
        <div className="space-y-6">
          <PageHeader
            title="Patient Management"
            subtitle="Register patients, inspect medical history, and manage admission or discharge status."
            actions={
              <button type="button" onClick={() => setPatModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Register Patient</span>
              </button>
            }
          />
          <DataTable
            data={patients}
            rowKey={(p) => p.id}
            searchFilter={(p, q) => p.fullName.toLowerCase().includes(q) || p.patientCode.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q)}
            searchPlaceholder="Search by Patient ID, name, or phone..."
            columns={[
              { key: 'code', header: 'Patient ID', render: (p) => <span className="font-mono text-xs font-semibold">{p.patientCode}</span> },
              { key: 'name', header: 'Full Name', sortValue: (p) => p.fullName, render: (p) => <div><p className="font-semibold text-slate-900">{p.fullName}</p><p className="text-xs text-slate-500">{p.gender} · Blood {p.bloodGroup}</p></div> },
              { key: 'phone', header: 'Phone', render: (p) => <span className="font-mono text-xs">{p.phone}</span> },
              { key: 'status', header: 'Status', render: (p) => <StatusLabel status={p.status} /> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (p) => (
                  <button type="button" onClick={() => setEmrPatient(p)} className="text-xs font-semibold text-sky-700 hover:underline">
                    View Profile & History
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'doctors' && (
        <div className="space-y-6">
          <PageHeader
            title="Doctor Management"
            subtitle="Manage physician specializations, consultation fees, availability, and performance."
            actions={
              <button type="button" onClick={() => setDocModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Add Doctor</span>
              </button>
            }
          />
          <DataTable
            data={doctors}
            rowKey={(d) => d.id}
            searchFilter={(d, q) =>
              d.fullName.toLowerCase().includes(q) ||
              d.specialization.toLowerCase().includes(q) ||
              (d.loginEmail || '').toLowerCase().includes(q) ||
              (d.loginUsername || '').toLowerCase().includes(q)
            }
            columns={[
              { key: 'name', header: 'Doctor', render: (d) => <div><p className="font-semibold text-slate-900">{d.fullName}</p><p className="text-xs text-slate-500">{d.qualifications}</p></div> },
              {
                key: 'login',
                header: 'Separate Login Account',
                render: (d) => (
                  <div className="text-xs">
                    <p className="font-mono text-slate-800">{d.loginEmail || '—'}</p>
                    <p className="text-slate-500">@{d.loginUsername || '—'} · {d.employeeId || d.id}</p>
                  </div>
                ),
              },
              { key: 'dept', header: 'Department', render: (d) => `${d.departmentName} · ${d.specialization}` },
              { key: 'fee', header: 'Fee', align: 'right', render: (d) => `${currency}${d.consultationFee}` },
              { key: 'perf', header: 'Completed / Total', align: 'right', render: (d) => `${d.completedCount || 0} / ${d.appointmentsCount || 0}` },
              { key: 'avail', header: 'Clinical / Login', render: (d) => <div className="space-y-1"><StatusLabel status={d.available ? 'Available' : 'Unavailable'} />{d.accountActive === false && <div><StatusLabel status="Inactive" /></div>}</div> },
              {
                key: 'toggle',
                header: 'Actions',
                align: 'right',
                render: (d) => (
                  <div className="inline-flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/doctors/${d.id}`, { method: 'PUT', body: JSON.stringify({ available: !d.available }) });
                        toast('Doctor availability updated', 'info');
                        loadAll();
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Toggle Availability
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDocResetTarget({ id: d.id, fullName: d.fullName });
                        setDocResetPwd('');
                      }}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Reset Login Password
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/doctors/${d.id}`, { method: 'PUT', body: JSON.stringify({ accountActive: d.accountActive === false }) });
                        toast(`${d.fullName} login ${d.accountActive === false ? 'activated' : 'deactivated'}`, 'info');
                        loadAll();
                      }}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      {d.accountActive === false ? 'Activate Login' : 'Deactivate Login'}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'staff' && (
        <div className="space-y-6">
          <PageHeader
            title="Nursing & Allied Staff Management"
            subtitle="Assign departments, manage shift rosters, and track availability."
            actions={
              <button type="button" onClick={() => setStaffModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Add Staff</span>
              </button>
            }
          />
          <DataTable
            data={staff}
            rowKey={(s) => s.id}
            searchFilter={(s, q) => s.fullName.toLowerCase().includes(q) || s.designation.toLowerCase().includes(q)}
            columns={[
              { key: 'name', header: 'Staff Member', render: (s) => <div><p className="font-semibold text-slate-900">{s.fullName}</p><p className="text-xs text-slate-500">{s.designation}</p></div> },
              { key: 'dept', header: 'Department', render: (s) => departments.find((d) => d.id === s.departmentId)?.name || s.departmentId },
              { key: 'shift', header: 'Shift', render: (s) => <span className="font-mono text-xs">{s.shift}</span> },
              { key: 'avail', header: 'Status', render: (s) => <StatusLabel status={s.available ? 'Available' : 'Off Duty'} /> },
              {
                key: 'act',
                header: 'Toggle',
                align: 'right',
                render: (s) => (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/staff/${s.id}`, { method: 'PUT', body: JSON.stringify({ available: !s.available }) });
                      loadAll();
                    }}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Switch Status
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'departments' && (
        <div className="space-y-6">
          <PageHeader
            title="Department Management"
            subtitle="Configure clinical departments and assign department heads."
            actions={
              <button type="button" onClick={() => setDeptModal(true)} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Create Department</span>
              </button>
            }
          />
          <DataTable
            data={departments}
            rowKey={(d) => d.id}
            columns={[
              { key: 'code', header: 'Code', render: (d) => <span className="font-mono font-semibold text-xs">{d.code}</span> },
              { key: 'name', header: 'Department', render: (d) => <div><p className="font-semibold text-slate-900">{d.name}</p><p className="text-xs text-slate-500">{d.description}</p></div> },
              { key: 'floor', header: 'Location', render: (d) => d.floor },
              { key: 'head', header: 'Head Doctor', render: (d) => doctors.find((doc) => doc.id === d.headDoctorId)?.fullName || 'Unassigned' },
              { key: 'status', header: 'Status', render: (d) => <StatusLabel status={d.active ? 'Active' : 'Inactive'} /> },
            ]}
          />
        </div>
      )}

      {page === 'appointments' && (
        <div className="space-y-6">
          <PageHeader title="Appointment Oversight" subtitle="Approve, reschedule, or cancel facility appointments." />
          <DataTable
            data={appointments}
            rowKey={(a) => a.id}
            searchFilter={(a, q) => (a.patientName || '').toLowerCase().includes(q) || a.appointmentNumber.toLowerCase().includes(q) || (a.doctorName || '').toLowerCase().includes(q)}
            columns={[
              { key: 'num', header: 'Appointment #', render: (a) => <span className="font-mono text-xs font-semibold">{a.appointmentNumber}</span> },
              { key: 'pat', header: 'Patient', render: (a) => a.patientName },
              { key: 'doc', header: 'Doctor & Dept', render: (a) => `${a.doctorName} · ${a.departmentName}` },
              { key: 'when', header: 'Date & Slot', render: (a) => <span className="font-mono text-xs">{a.date} {a.timeSlot}</span> },
              { key: 'status', header: 'Status', render: (a) => <StatusLabel status={a.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (a) => (
                  <div className="inline-flex gap-2">
                    {a.status === 'Pending' && (
                      <button type="button" onClick={() => updateAppointmentStatus(a.id, 'Approved')} className="text-xs font-semibold text-teal-700 hover:underline">
                        Approve
                      </button>
                    )}
                    {a.status !== 'Cancelled' && a.status !== 'Completed' && (
                      <button type="button" onClick={() => updateAppointmentStatus(a.id, 'Cancelled')} className="text-xs font-semibold text-red-700 hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'beds' && (
        <div className="space-y-6">
          <PageHeader title="Bed & Ward Management" subtitle="Monitor ICU and General ward capacity and assign or release patient beds." />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <StatCard label="Total Beds" value={beds.length} />
            <StatCard label="Available Beds" value={beds.filter((b) => b.status === 'Available').length} tone="teal" />
            <StatCard label="Occupied Beds" value={beds.filter((b) => b.status === 'Occupied').length} tone="blue" />
            <StatCard label="ICU Beds" value={beds.filter((b) => b.wardType === 'ICU').length} tone="amber" />
          </div>
          <DataTable
            data={beds}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Bed #', render: (b) => <span className="font-mono font-semibold">{b.bedNumber}</span> },
              { key: 'ward', header: 'Ward & Type', render: (b) => `${b.wardName} (${b.wardType})` },
              { key: 'rate', header: 'Daily Rate', align: 'right', render: (b) => `${currency}${b.dailyRate}` },
              { key: 'pat', header: 'Assigned Patient', render: (b) => b.patientName || '—' },
              { key: 'status', header: 'Status', render: (b) => <StatusLabel status={b.status} /> },
              {
                key: 'act',
                header: 'Action',
                align: 'right',
                render: (b) =>
                  b.status === 'Available' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBedAssignTarget(b);
                        setBedPatientId(patients[0]?.id || '');
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Assign Patient
                    </button>
                  ) : b.status === 'Occupied' ? (
                    <button type="button" onClick={() => assignOrReleaseBed(b.id)} className="text-xs font-semibold text-amber-700 hover:underline">
                      Release Bed
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      {page === 'pharmacy' && (
        <div className="space-y-6">
          <PageHeader title="Pharmacy Inventory Oversight" subtitle="Stock levels, expiry tracking, and low-stock alerts." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total SKUs" value={medicines.length} />
            <StatCard label="Low-Stock Alerts" value={medicines.filter((m) => m.quantity <= m.reorderLevel).length} tone="amber" />
            <StatCard label="Expired Batches" value={medicines.filter((m) => m.expiryDate < today).length} tone="red" />
          </div>
          <DataTable
            data={medicines}
            rowKey={(m) => m.id}
            searchFilter={(m, q) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)}
            columns={[
              { key: 'code', header: 'Code', render: (m) => <span className="font-mono text-xs">{m.medicineCode}</span> },
              { key: 'name', header: 'Medicine', render: (m) => <div><p className="font-semibold">{m.name}</p><p className="text-xs text-slate-500">{m.category} · {m.manufacturer}</p></div> },
              { key: 'qty', header: 'Stock', align: 'right', render: (m) => <span className={m.quantity <= m.reorderLevel ? 'text-amber-700 font-bold' : ''}>{m.quantity}</span> },
              { key: 'exp', header: 'Expiry', render: (m) => <span className={`font-mono text-xs ${m.expiryDate < today ? 'text-red-700 font-semibold' : ''}`}>{m.expiryDate}</span> },
              { key: 'price', header: 'Selling Price', align: 'right', render: (m) => `${currency}${m.sellingPrice.toFixed(2)}` },
            ]}
          />
        </div>
      )}

      {page === 'labs' && (
        <div className="space-y-6">
          <PageHeader title="Laboratory Oversight" subtitle="Monitor diagnostic test volume, pending orders, and verified reports." />
          <DataTable
            data={labs}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'test', header: 'Test Name', render: (l) => `${l.testName} (${l.testCategory})` },
              { key: 'pat', header: 'Patient', render: (l) => l.patientName },
              { key: 'prio', header: 'Priority', render: (l) => <StatusLabel status={l.priority} /> },
              { key: 'price', header: 'Price', align: 'right', render: (l) => `${currency}${l.price}` },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
            ]}
          />
        </div>
      )}

      {page === 'billing' && (
        <div className="space-y-6">
          <PageHeader title="Billing & Collections Monitoring" subtitle="Monitor hospital invoices, collections, and pending balances." />
          <DataTable
            data={bills}
            rowKey={(b) => b.id}
            columns={[
              { key: 'num', header: 'Invoice #', render: (b) => <span className="font-mono text-xs font-semibold">{b.billNumber}</span> },
              { key: 'pat', header: 'Patient', render: (b) => b.patientName },
              { key: 'date', header: 'Date', render: (b) => <span className="font-mono text-xs">{b.date}</span> },
              { key: 'tot', header: 'Total', align: 'right', render: (b) => `${currency}${b.totalAmount.toFixed(2)}` },
              { key: 'paid', header: 'Paid', align: 'right', render: (b) => `${currency}${b.paidAmount.toFixed(2)}` },
              { key: 'status', header: 'Status', render: (b) => <StatusLabel status={b.status} /> },
            ]}
          />
        </div>
      )}

      {page === 'reports' && <AnalyticsReportView title="Hospital Operations Reports" />}

      {page === 'settings' && hospital && cfg && (
        <div className="space-y-6">
          <PageHeader title="Hospital Settings" subtitle="Configure facility information, working hours, appointment slot rules, and billing tax rates." />
          <form onSubmit={saveHospitalSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital Name</label>
                <input type="text" value={hospital.name} onChange={(e) => setHospital({ ...hospital, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                <input type="text" value={hospital.phone} onChange={(e) => setHospital({ ...hospital, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Working Hours Start</label>
                <input type="time" value={cfg.workingHoursStart} onChange={(e) => setCfg({ ...cfg, workingHoursStart: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Working Hours End</label>
                <input type="time" value={cfg.workingHoursEnd} onChange={(e) => setCfg({ ...cfg, workingHoursEnd: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Appointment Slot Duration (min)</label>
                <input type="number" value={cfg.appointmentSlotMinutes} onChange={(e) => setCfg({ ...cfg, appointmentSlotMinutes: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Tax Rate (%)</label>
                <input type="number" value={cfg.defaultTaxRate} onChange={(e) => setCfg({ ...cfg, defaultTaxRate: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">Save Settings</button>
            </div>
          </form>
        </div>
      )}

      {/* Modals */}
      <Modal open={patModal} onClose={() => setPatModal(false)} title="Register New Patient">
        <form onSubmit={registerPatient} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Full Name" value={patForm.fullName} onChange={(e) => setPatForm({ ...patForm, fullName: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input required type="date" value={patForm.dateOfBirth} onChange={(e) => setPatForm({ ...patForm, dateOfBirth: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <select value={patForm.gender} onChange={(e) => setPatForm({ ...patForm, gender: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg">
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input required placeholder="Phone" value={patForm.phone} onChange={(e) => setPatForm({ ...patForm, phone: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input placeholder="Email" value={patForm.email} onChange={(e) => setPatForm({ ...patForm, email: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input placeholder="Blood Group (e.g. O+)" value={patForm.bloodGroup} onChange={(e) => setPatForm({ ...patForm, bloodGroup: e.target.value })} className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <input placeholder="Address" value={patForm.address} onChange={(e) => setPatForm({ ...patForm, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <input placeholder="Emergency Contact" value={patForm.emergencyContact} onChange={(e) => setPatForm({ ...patForm, emergencyContact: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPatModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Register</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(emrPatient)} onClose={() => setEmrPatient(null)} title={`Patient Summary — ${emrPatient?.fullName || ''}`}>
        {emrPatient && (
          <div className="space-y-3 text-sm">
            <p><span className="text-slate-500">Patient ID:</span> <strong className="font-mono">{emrPatient.patientCode}</strong></p>
            <p><span className="text-slate-500">DOB / Gender / Blood:</span> {emrPatient.dateOfBirth} · {emrPatient.gender} · {emrPatient.bloodGroup}</p>
            <p><span className="text-slate-500">Allergies:</span> {emrPatient.allergies.length > 0 ? emrPatient.allergies.join(', ') : 'None recorded'}</p>
            <p><span className="text-slate-500">Existing Conditions:</span> {emrPatient.existingConditions.length > 0 ? emrPatient.existingConditions.join(', ') : 'None recorded'}</p>
            <p><span className="text-slate-500">Address:</span> {emrPatient.address}</p>
            <p><span className="text-slate-500">Emergency Contact:</span> {emrPatient.emergencyContact}</p>
          </div>
        )}
      </Modal>

      <Modal open={docModal} onClose={() => setDocModal(false)} title="Add Physician & Provision Separate Login">
        <form onSubmit={addDoctor} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input required placeholder="e.g. Dr. Vivek Rao, MD" value={docForm.fullName} onChange={(e) => setDocForm({ ...docForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select value={docForm.departmentId} onChange={(e) => setDocForm({ ...docForm, departmentId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Specialization</label>
              <input required placeholder="e.g. Pulmonology" value={docForm.specialization} onChange={(e) => setDocForm({ ...docForm, specialization: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qualifications</label>
              <input placeholder="MBBS, MD" value={docForm.qualifications} onChange={(e) => setDocForm({ ...docForm, qualifications: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Consultation Fee</label>
              <input type="number" min={0} placeholder="1000" value={docForm.consultationFee} onChange={(e) => setDocForm({ ...docForm, consultationFee: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input placeholder="+91 98450 00000" value={docForm.phone} onChange={(e) => setDocForm({ ...docForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-800 mb-2">Individual Doctor Login Credentials</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Login Email</label>
                <input required type="email" placeholder="dr.vivek@careplus.org" value={docForm.email} onChange={(e) => setDocForm({ ...docForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Username (optional)</label>
                <input placeholder="dr.vivek" value={docForm.username} onChange={(e) => setDocForm({ ...docForm, username: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Individual Password (min 8 chars)</label>
                <div className="relative">
                  <input required minLength={8} type={showDocPwd ? 'text' : 'password'} placeholder="Assign a unique login password" value={docForm.password} onChange={(e) => setDocForm({ ...docForm, password: e.target.value })} className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg" />
                  <button type="button" onClick={() => setShowDocPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showDocPwd ? 'Hide password' : 'Show password'}>
                    {showDocPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDocModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Add Doctor &amp; Create Login</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(docResetTarget)} onClose={() => setDocResetTarget(null)} title={`Reset Login Password — ${docResetTarget?.fullName || ''}`} maxWidth="max-w-md">
        <form onSubmit={resetDoctorPassword} className="space-y-4">
          <p className="text-xs text-slate-600">Assign a new individual sign-in password for <strong>{docResetTarget?.fullName}</strong>.</p>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
            <input required minLength={8} type="text" placeholder="Minimum 8 characters" value={docResetPwd} onChange={(e) => setDocResetPwd(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDocResetTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Update Password</button>
          </div>
        </form>
      </Modal>

      <Modal open={staffModal} onClose={() => setStaffModal(false)} title="Add Nurse / Staff Member">
        <form onSubmit={addStaff} className="space-y-3">
          <input required placeholder="Full Name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as UserRole })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            <option value="nurse">Nurse</option>
            <option value="receptionist">Receptionist</option>
            <option value="pharmacist">Pharmacist</option>
            <option value="lab_technician">Lab Technician</option>
            <option value="accountant">Accountant</option>
          </select>
          <select value={staffForm.departmentId} onChange={(e) => setStaffForm({ ...staffForm, departmentId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={staffForm.shift} onChange={(e) => setStaffForm({ ...staffForm, shift: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            <option>Morning (07:00 - 15:00)</option>
            <option>Evening (15:00 - 23:00)</option>
            <option>Night (23:00 - 07:00)</option>
          </select>
          <input placeholder="Phone" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStaffModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Save Staff</button>
          </div>
        </form>
      </Modal>

      <Modal open={deptModal} onClose={() => setDeptModal(false)} title="Create Department" maxWidth="max-w-md">
        <form onSubmit={addDepartment} className="space-y-3">
          <input required placeholder="Code (e.g. DERM)" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          <input required placeholder="Department Name" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <input placeholder="Floor" value={deptForm.floor} onChange={(e) => setDeptForm({ ...deptForm, floor: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <textarea placeholder="Clinical Description" value={deptForm.description} onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeptModal(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Create</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(bedAssignTarget)} onClose={() => setBedAssignTarget(null)} title={`Assign Bed ${bedAssignTarget?.bedNumber || ''}`} maxWidth="max-w-md">
        <div className="space-y-4">
          <select value={bedPatientId} onChange={(e) => setBedPatientId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
            {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.patientCode})</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setBedAssignTarget(null)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg">Cancel</button>
            <button type="button" onClick={() => bedAssignTarget && assignOrReleaseBed(bedAssignTarget.id, bedPatientId)} className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">
              Confirm Assignment
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
};
