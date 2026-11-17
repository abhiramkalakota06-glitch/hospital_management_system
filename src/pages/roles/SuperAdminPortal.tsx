import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  DatabaseBackup,
  KeyRound,
  LayoutDashboard,
  Plus,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { AnalyticsReportView } from '../../components/AnalyticsReportView';
import { AppShell, type NavItem } from '../../components/AppShell';
import { BarChart, DonutBreakdown } from '../../components/Charts';
import { ConfirmDialog, DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast, type ColumnDef } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS, type AuditLog, type Hospital, type RoleDefinition, type SystemConfig, type User, type UserRole } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'hospitals', label: 'Hospital Management', icon: Building2 },
  { key: 'users', label: 'User Management', icon: Users },
  { key: 'roles', label: 'Role & Permissions', icon: Shield },
  { key: 'system', label: 'System Configuration', icon: Settings },
  { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
];

export const SuperAdminPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { systemConfig } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  // Dashboard data
  const [dash, setDash] = useState<{
    metrics: Record<string, number>;
    hospitalStats: { id: string; name: string; city: string; patients: number; doctors: number; appointments: number; revenue: number }[];
    recentActivity: AuditLog[];
  } | null>(null);

  // Sub-page data
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [sysCfg, setSysCfg] = useState<SystemConfig | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  // Modals
  const [hospModal, setHospModal] = useState(false);
  const [editingHosp, setEditingHosp] = useState<Hospital | null>(null);
  const [hospForm, setHospForm] = useState({ name: '', code: '', city: '', address: '', phone: '', email: '', bedCapacity: 100, branchName: '', branchAddress: '' });
  const [deleteHospTarget, setDeleteHospTarget] = useState<Hospital | null>(null);

  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ fullName: '', username: '', email: '', role: 'doctor' as UserRole, hospitalId: 'hosp-1', designation: '', phone: '', password: '' });
  const [resetPwdTarget, setResetPwdTarget] = useState<User | null>(null);
  const [resetPwdVal, setResetPwdVal] = useState('CarePlus@2026');

  const [roleModal, setRoleModal] = useState(false);
  const [newRoleForm, setNewRoleForm] = useState({ key: '', name: '', description: '' });
  const [selectedRole, setSelectedRole] = useState<RoleDefinition | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [d, h, u, r, c, l] = await Promise.all([
        apiFetch<typeof dash>('/dashboard'),
        apiFetch<{ hospitals: Hospital[] }>('/hospitals'),
        apiFetch<{ users: User[] }>('/users'),
        apiFetch<{ roles: RoleDefinition[] }>('/roles'),
        apiFetch<{ systemConfig: SystemConfig }>('/system/config'),
        apiFetch<{ logs: AuditLog[] }>('/system/logs'),
      ]);
      setDash(d);
      setHospitals(h.hospitals);
      setUsers(u.users);
      setRoles(r.roles);
      setSysCfg(c.systemConfig);
      setLogs(l.logs);
      if (!selectedRole && r.roles.length > 0) setSelectedRole(r.roles[0]);
    } catch {
      // ignore
    }
  }, [selectedRole]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const currency = systemConfig.currencySymbol;

  const saveHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const branches = hospForm.branchName ? [{ id: `br-${Date.now()}`, name: hospForm.branchName, address: hospForm.branchAddress || hospForm.address, phone: hospForm.phone }] : [];
      if (editingHosp) {
        await apiFetch(`/hospitals/${editingHosp.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: hospForm.name,
            code: hospForm.code,
            city: hospForm.city,
            address: hospForm.address,
            phone: hospForm.phone,
            email: hospForm.email,
            bedCapacity: Number(hospForm.bedCapacity),
          }),
        });
        toast('Hospital updated', 'success');
      } else {
        await apiFetch('/hospitals', {
          method: 'POST',
          body: JSON.stringify({ ...hospForm, bedCapacity: Number(hospForm.bedCapacity), branches }),
        });
        toast('Hospital added to network', 'success');
      }
      setHospModal(false);
      setEditingHosp(null);
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save hospital', 'error');
    }
  };

  const toggleHospitalActive = async (h: Hospital) => {
    await apiFetch(`/hospitals/${h.id}`, { method: 'PUT', body: JSON.stringify({ active: !h.active }) });
    toast(`${h.name} ${h.active ? 'deactivated' : 'activated'}`, 'info');
    loadAll();
  };

  const deleteHospital = async () => {
    if (!deleteHospTarget) return;
    await apiFetch(`/hospitals/${deleteHospTarget.id}`, { method: 'DELETE' });
    toast('Hospital deleted', 'info');
    setDeleteHospTarget(null);
    loadAll();
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(userForm) });
      toast('User account created', 'success');
      setUserModal(false);
      setUserForm({ fullName: '', username: '', email: '', role: 'doctor', hospitalId: 'hosp-1', designation: '', phone: '', password: '' });
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error');
    }
  };

  const toggleUserActive = async (u: User) => {
    await apiFetch(`/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ active: !u.active }) });
    toast(`${u.fullName} ${u.active ? 'deactivated' : 'activated'}`, 'info');
    loadAll();
  };

  const resetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdTarget) return;
    await apiFetch(`/users/${resetPwdTarget.id}`, { method: 'PUT', body: JSON.stringify({ resetPasswordTo: resetPwdVal }) });
    toast(`Password reset for ${resetPwdTarget.username}`, 'success');
    setResetPwdTarget(null);
  };

  const saveRolePermissions = async () => {
    if (!selectedRole) return;
    await apiFetch(`/roles/${selectedRole.id}`, { method: 'PUT', body: JSON.stringify({ permissions: selectedRole.permissions }) });
    toast(`Permissions saved for ${selectedRole.name}`, 'success');
    loadAll();
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const basePages = ['dashboard', 'profile', 'notifications'];
      const baseActions = roles[0]?.permissions.actions || {};
      await apiFetch('/roles', {
        method: 'POST',
        body: JSON.stringify({
          ...newRoleForm,
          permissions: { pages: basePages, actions: baseActions },
        }),
      });
      toast('Custom role created', 'success');
      setRoleModal(false);
      setNewRoleForm({ key: '', name: '', description: '' });
      loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create role', 'error');
    }
  };

  const saveSystemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sysCfg) return;
    await apiFetch('/system/config', { method: 'PUT', body: JSON.stringify(sysCfg) });
    toast('System settings updated', 'success');
    loadAll();
  };

  const triggerBackup = async () => {
    const res = await apiFetch<{ lastBackupAt: string; snapshot: unknown }>('/system/backup', { method: 'POST' });
    const blob = new Blob([JSON.stringify(res.snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `careplus-backup-${res.lastBackupAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup snapshot downloaded', 'success');
    loadAll();
  };

  const hospColumns: ColumnDef<Hospital>[] = [
    { key: 'code', header: 'Code', sortValue: (h) => h.code, render: (h) => <span className="font-mono text-xs font-semibold">{h.code}</span> },
    {
      key: 'name',
      header: 'Hospital Name',
      sortValue: (h) => h.name,
      render: (h) => (
        <div>
          <p className="font-semibold text-slate-900">{h.name}</p>
          <p className="text-xs text-slate-500">{h.branches.length} branch(es) · {h.city}</p>
        </div>
      ),
    },
    { key: 'beds', header: 'Capacity', align: 'right', sortValue: (h) => h.bedCapacity, render: (h) => `${h.bedCapacity} beds` },
    { key: 'status', header: 'Status', render: (h) => <StatusLabel status={h.active ? 'Active' : 'Inactive'} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (h) => (
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingHosp(h);
              setHospForm({ name: h.name, code: h.code, city: h.city, address: h.address, phone: h.phone, email: h.email, bedCapacity: h.bedCapacity, branchName: '', branchAddress: '' });
              setHospModal(true);
            }}
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            Edit
          </button>
          <button type="button" onClick={() => toggleHospitalActive(h)} className="text-xs font-medium text-slate-600 hover:underline">
            {h.active ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" onClick={() => setDeleteHospTarget(h)} className="text-xs font-medium text-red-700 hover:underline">
            Delete
          </button>
        </div>
      ),
    },
  ];

  const userColumns: ColumnDef<User>[] = [
    { key: 'id', header: 'ID', render: (u) => <span className="font-mono text-xs">{u.employeeOrPatientId}</span> },
    {
      key: 'name',
      header: 'User',
      sortValue: (u) => u.fullName,
      render: (u) => (
        <div>
          <p className="font-semibold text-slate-900">{u.fullName}</p>
          <p className="text-xs text-slate-500">{u.email} · @{u.username}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', sortValue: (u) => u.role, render: (u) => ROLE_LABELS[u.role] || u.role },
    { key: 'status', header: 'Account Status', render: (u) => <StatusLabel status={u.active ? 'Active' : 'Inactive'} /> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => (
        <div className="inline-flex items-center gap-3">
          <button type="button" onClick={() => setResetPwdTarget(u)} className="text-xs font-medium text-sky-700 hover:underline">
            Reset Password
          </button>
          <button type="button" onClick={() => toggleUserActive(u)} className="text-xs font-medium text-slate-700 hover:underline">
            {u.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

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
            title="Platform Governance Overview"
            subtitle="Multi-hospital statistics, account activity, and network revenue across CarePlus."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Hospitals" value={dash.metrics.totalHospitals} tone="blue" helper="Active network facilities" onClick={() => setPage('hospitals')} />
            <StatCard label="Total Users" value={dash.metrics.totalUsers} helper={`${dash.metrics.activeUsers} active · ${dash.metrics.inactiveUsers} inactive`} onClick={() => setPage('users')} />
            <StatCard label="Doctors & Patients" value={`${dash.metrics.totalDoctors} / ${dash.metrics.totalPatients}`} tone="teal" helper={`${dash.metrics.totalAppointments} total appointments`} />
            <StatCard label="Network Revenue" value={`${currency}${dash.metrics.totalRevenue.toLocaleString()}`} tone="blue" helper="Verified collections" onClick={() => setPage('reports')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <BarChart
                title="Hospital-Wise Revenue & Patient Volume"
                subtitle="Collections across provisioned medical centers"
                data={dash.hospitalStats.map((h) => ({
                  label: `${h.name} (${h.city})`,
                  value: h.revenue,
                  secondary: `${h.patients} patients`,
                }))}
                valuePrefix={currency}
              />
            </div>
            <DonutBreakdown
              title="Account Status Distribution"
              segments={[
                { label: 'Active Accounts', value: dash.metrics.activeUsers, color: '#0D9488' },
                { label: 'Inactive Accounts', value: dash.metrics.inactiveUsers, color: '#DC2626' },
                { label: 'Available Doctors', value: dash.metrics.availableDoctors, color: '#0284C7' },
              ]}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-slate-900">Recent System Activity</h3>
              </div>
              <button type="button" onClick={() => setPage('system')} className="text-xs font-semibold text-sky-700 hover:underline">
                View all logs
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {dash.recentActivity.map((log) => (
                <div key={log.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-900">{log.actorName}</span>
                    <span className="text-slate-500"> · {log.action} · {log.details}</span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-400 shrink-0">{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {page === 'hospitals' && (
        <div className="space-y-6">
          <PageHeader
            title="Hospital & Branch Management"
            subtitle="Add, configure, activate, or remove hospital facilities across the CarePlus network."
            actions={
              <button
                type="button"
                onClick={() => {
                  setEditingHosp(null);
                  setHospForm({ name: '', code: '', city: '', address: '', phone: '', email: '', bedCapacity: 100, branchName: '', branchAddress: '' });
                  setHospModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Add Hospital</span>
              </button>
            }
          />
          <DataTable
            data={hospitals}
            columns={hospColumns}
            rowKey={(h) => h.id}
            searchFilter={(h, q) => h.name.toLowerCase().includes(q) || h.city.toLowerCase().includes(q) || h.code.toLowerCase().includes(q)}
            searchPlaceholder="Search hospitals by name, city, or code..."
          />
        </div>
      )}

      {page === 'users' && (
        <div className="space-y-6">
          <PageHeader
            title="User Management"
            subtitle="Provision staff and patient accounts, assign roles, reset passwords, and toggle account status."
            actions={
              <button
                type="button"
                onClick={() => setUserModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Create User</span>
              </button>
            }
          />
          <DataTable
            data={users}
            columns={userColumns}
            rowKey={(u) => u.id}
            searchFilter={(u, q) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)}
            searchPlaceholder="Search users by name, email, or role..."
          />
        </div>
      )}

      {page === 'roles' && (
        <div className="space-y-6">
          <PageHeader
            title="Role & Permission Management"
            subtitle="Control page-level access and Create / Read / Update / Delete permissions for every role."
            actions={
              <button
                type="button"
                onClick={() => setRoleModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                <span>Create Role</span>
              </button>
            }
          />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(JSON.parse(JSON.stringify(r)))}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    selectedRole?.id === r.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.description}</p>
                </button>
              ))}
            </div>
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              {selectedRole ? (
                <>
                  <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{selectedRole.name} Permissions</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{selectedRole.permissions.pages.length} permitted pages</p>
                    </div>
                    <button
                      type="button"
                      onClick={saveRolePermissions}
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                    >
                      Save Permissions
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">Permitted Pages</p>
                    <div className="flex flex-wrap gap-2">
                      {['dashboard', 'hospitals', 'users', 'roles', 'system', 'patients', 'doctors', 'staff', 'departments', 'appointments', 'queue', 'beds', 'pharmacy', 'labs', 'billing', 'reports'].map((pg) => {
                        const checked = selectedRole.permissions.pages.includes(pg);
                        return (
                          <label key={pg} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs cursor-pointer hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const pages = checked
                                  ? selectedRole.permissions.pages.filter((p) => p !== pg)
                                  : [...selectedRole.permissions.pages, pg];
                                setSelectedRole({ ...selectedRole, permissions: { ...selectedRole.permissions, pages } });
                              }}
                            />
                            <span className="capitalize">{pg}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3">Resource Module</th>
                          <th className="py-2.5 px-3 text-center">Create</th>
                          <th className="py-2.5 px-3 text-center">Read</th>
                          <th className="py-2.5 px-3 text-center">Update</th>
                          <th className="py-2.5 px-3 text-center">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(selectedRole.permissions.actions).map(([resKey, perms]) => (
                          <tr key={resKey}>
                            <td className="py-2 px-3 font-medium capitalize text-slate-800">{resKey}</td>
                            {(['create', 'read', 'update', 'delete'] as const).map((act) => (
                              <td key={act} className="py-2 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={perms[act]}
                                  onChange={() => {
                                    const updated = {
                                      ...selectedRole.permissions.actions,
                                      [resKey]: { ...perms, [act]: !perms[act] },
                                    };
                                    setSelectedRole({
                                      ...selectedRole,
                                      permissions: { ...selectedRole.permissions, actions: updated },
                                    });
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">Select a role to configure permissions.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {page === 'system' && sysCfg && (
        <div className="space-y-6">
          <PageHeader
            title="System Configuration & Audit Logs"
            subtitle="Manage global settings, security policy, backups, and compliance audit trails."
            actions={
              <button
                type="button"
                onClick={triggerBackup}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
              >
                <DatabaseBackup className="w-4 h-4" />
                <span>Download Backup Snapshot</span>
              </button>
            }
          />

          <form onSubmit={saveSystemConfig} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900">Global & Security Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Platform Name</label>
                <input type="text" value={sysCfg.platformName} onChange={(e) => setSysCfg({ ...sysCfg, platformName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default Tax Rate (%)</label>
                <input type="number" value={sysCfg.defaultTaxRate} onChange={(e) => setSysCfg({ ...sysCfg, defaultTaxRate: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Session Timeout (Minutes)</label>
                <input type="number" value={sysCfg.sessionTimeoutMinutes} onChange={(e) => setSysCfg({ ...sysCfg, sessionTimeoutMinutes: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Password Length</label>
                <input type="number" value={sysCfg.passwordMinLength} onChange={(e) => setSysCfg({ ...sysCfg, passwordMinLength: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Backup Retention (Days)</label>
                <input type="number" value={sysCfg.backupRetentionDays} onChange={(e) => setSysCfg({ ...sysCfg, backupRetentionDays: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
              </div>
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={sysCfg.enforce2FA} onChange={(e) => setSysCfg({ ...sysCfg, enforce2FA: e.target.checked })} />
                  <span>Enforce Staff 2FA Policy</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
              <span>Last Backup: <strong className="font-mono">{new Date(sysCfg.lastBackupAt).toLocaleString()}</strong></span>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg">
                Save Configuration
              </button>
            </div>
          </form>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">System Audit Logs</h3>
            <DataTable
              data={logs}
              rowKey={(l) => l.id}
              searchFilter={(l, q) => l.actorName.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q)}
              searchPlaceholder="Search audit logs..."
              columns={[
                { key: 'time', header: 'Timestamp', render: (l) => <span className="font-mono text-xs">{new Date(l.createdAt).toLocaleString()}</span> },
                { key: 'actor', header: 'Actor', render: (l) => <span>{l.actorName} <span className="text-xs text-slate-500">({l.actorRole})</span></span> },
                { key: 'action', header: 'Action', render: (l) => <span className="font-mono text-xs font-semibold text-sky-700">{l.action}</span> },
                { key: 'res', header: 'Resource', render: (l) => `${l.resource} · ${l.resourceId}` },
                { key: 'details', header: 'Details', render: (l) => <span className="text-xs text-slate-600">{l.details}</span> },
              ]}
            />
          </div>
        </div>
      )}

      {page === 'reports' && (
        <AnalyticsReportView title="Network Reports & Analytics" subtitle="Cross-hospital performance, revenue statistics, user activity, and patient throughput." />
      )}

      {/* Modals */}
      <Modal open={hospModal} onClose={() => setHospModal(false)} title={editingHosp ? 'Edit Hospital' : 'Add Hospital'}>
        <form onSubmit={saveHospital} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital Name</label>
              <input required type="text" value={hospForm.name} onChange={(e) => setHospForm({ ...hospForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Facility Code</label>
              <input required type="text" value={hospForm.code} onChange={(e) => setHospForm({ ...hospForm, code: e.target.value })} placeholder="CP-DEL-03" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input required type="text" value={hospForm.city} onChange={(e) => setHospForm({ ...hospForm, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bed Capacity</label>
              <input required type="number" value={hospForm.bedCapacity} onChange={(e) => setHospForm({ ...hospForm, bedCapacity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input type="text" value={hospForm.phone} onChange={(e) => setHospForm({ ...hospForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input type="email" value={hospForm.email} onChange={(e) => setHospForm({ ...hospForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
            <input type="text" value={hospForm.address} onChange={(e) => setHospForm({ ...hospForm, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          {!editingHosp && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Branch Name</label>
                <input type="text" value={hospForm.branchName} onChange={(e) => setHospForm({ ...hospForm, branchName: e.target.value })} placeholder="Main Tower" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Address</label>
                <input type="text" value={hospForm.branchAddress} onChange={(e) => setHospForm({ ...hospForm, branchAddress: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setHospModal(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Save Hospital</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteHospTarget)}
        onClose={() => setDeleteHospTarget(null)}
        onConfirm={deleteHospital}
        title="Delete Hospital"
        message={`Permanently remove ${deleteHospTarget?.name} from the platform?`}
        confirmLabel="Delete"
        danger
      />

      <Modal open={userModal} onClose={() => setUserModal(false)} title="Create User Account">
        <form onSubmit={createUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input required type="text" value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
              <input required type="text" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input required type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital</label>
              <select value={userForm.hospitalId} onChange={(e) => setUserForm({ ...userForm, hospitalId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {userForm.role === 'doctor' ? 'Specialization' : 'Designation'}
              </label>
              <input
                type="text"
                value={userForm.designation}
                onChange={(e) => setUserForm({ ...userForm, designation: e.target.value })}
                placeholder={userForm.role === 'doctor' ? 'e.g. Cardiology' : 'Role title'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password (min 8 chars)</label>
              <input
                required
                minLength={8}
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="Assign unique password"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setUserModal(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">Create User</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(resetPwdTarget)} onClose={() => setResetPwdTarget(null)} title="Reset User Password" maxWidth="max-w-md">
        <form onSubmit={resetUserPassword} className="space-y-4">
          <p className="text-xs text-slate-600">Set a new temporary password for <strong>{resetPwdTarget?.fullName}</strong>.</p>
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <input required minLength={8} type="text" value={resetPwdVal} onChange={(e) => setResetPwdVal(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetPwdTarget(null)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Confirm Reset</button>
          </div>
        </form>
      </Modal>

      <Modal open={roleModal} onClose={() => setRoleModal(false)} title="Create Custom Role" maxWidth="max-w-md">
        <form onSubmit={createRole} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Role Key</label>
            <input required type="text" value={newRoleForm.key} onChange={(e) => setNewRoleForm({ ...newRoleForm, key: e.target.value })} placeholder="radiologist" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
            <input required type="text" value={newRoleForm.name} onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })} placeholder="Radiologist" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea rows={2} value={newRoleForm.description} onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRoleModal(false)} className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg">Create Role</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
