import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, KeyRound, Save, User as UserIcon } from 'lucide-react';
import { PageHeader, useToast } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, type AppNotification } from '../types/hms';
import { apiFetch } from '../utils/api';

export const ProfilePage: React.FC = () => {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [prefs, setPrefs] = useState(
    user?.notificationPreferences || {
      appointments: true,
      prescriptions: true,
      labResults: true,
      billing: true,
      system: true,
    },
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setEmail(user.email);
      setPhone(user.phone);
      setAddress(user.address);
      setPrefs(user.notificationPreferences);
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, email, phone, address, notificationPreferences: prefs }),
      });
      await refreshMe();
      toast('Profile and notification preferences updated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast('New password and confirmation do not match', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await apiFetch('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Password updated successfully', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="My Profile & Account Security" subtitle="Manage your personal contact information, notification preferences, and credentials." />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Identity Summary Card */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                <UserIcon className="w-7 h-7" />
              </div>
            )}
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">{user.fullName}</h2>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>

          <dl className="pt-4 border-t border-slate-100 space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">ID Number</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900">{user.employeeOrPatientId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Designation</dt>
              <dd className="text-slate-900 text-right">{user.designation}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Username</dt>
              <dd className="font-mono text-slate-700">{user.username}</dd>
            </div>
          </dl>
        </div>

        {/* Profile & Notification Preferences Form */}
        <div className="lg:col-span-8 space-y-6">
          <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-900">Contact & Notification Preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-3">Notification Channels</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {(
                  [
                    ['appointments', 'Appointments & Queue'],
                    ['prescriptions', 'Prescriptions'],
                    ['labResults', 'Laboratory Reports'],
                    ['billing', 'Billing & Payments'],
                    ['system', 'System Announcements'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs[key]}
                      onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                      className="rounded border-slate-300 text-sky-600"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
              >
                <Save className="w-4 h-4" />
                <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>

          {/* Change Password */}
          <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-600" />
              <h3 className="text-base font-semibold text-slate-900">Change Password</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPwd}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
              >
                {savingPwd ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export const NotificationsPage: React.FC<{ onCountChange?: () => void }> = ({ onCountChange }) => {
  const { subscribeEvent } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<(AppNotification & { isRead: boolean })[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: (AppNotification & { isRead: boolean })[] }>('/notifications');
      setItems(res.notifications);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribeEvent('notification:created', () => load());
    return () => unsub();
  }, [load, subscribeEvent]);

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    onCountChange?.();
  };

  const markAllRead = async () => {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onCountChange?.();
    toast('All notifications marked as read', 'success');
  };

  const categories = [
    ['all', 'All'],
    ['appointment', 'Appointments'],
    ['registration', 'Registrations'],
    ['prescription', 'Prescriptions'],
    ['lab', 'Lab Results'],
    ['payment', 'Payments'],
    ['system', 'System'],
  ];

  const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications Center"
        subtitle="Real-time alerts for appointments, registrations, prescriptions, laboratory results, and payments."
        actions={
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <CheckCheck className="w-4 h-4 text-teal-600" />
            <span>Mark all as read</span>
          </button>
        }
      />

      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit flex-wrap">
        {categories.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No notifications in this category.</div>
        ) : (
          filtered.map((n) => (
            <div key={n.id} className={`p-4 sm:px-6 flex items-start justify-between gap-4 ${n.isRead ? 'bg-white' : 'bg-sky-50/40'}`}>
              <div className="flex items-start gap-3">
                <Bell className={`w-4 h-4 mt-1 shrink-0 ${n.isRead ? 'text-slate-400' : 'text-sky-600'}`} />
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize font-medium text-teal-700">{n.type}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{new Date(n.createdAt).toLocaleString()}</span>
                    {!n.isRead && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-sky-700">Unread</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                </div>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() => markRead(n.id)}
                  className="px-3 py-1.5 text-xs font-medium text-sky-700 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 whitespace-nowrap shrink-0"
                >
                  Mark read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
