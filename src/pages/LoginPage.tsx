import React, { useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, MonitorPlay, ShieldCheck, Stethoscope, UserCheck, UserPlus, Users } from 'lucide-react';
import { CarePlusLogo, Modal, useToast } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

interface CredentialEntry {
  label: string;
  detail: string;
  email: string;
  username: string;
  password: string;
}

const DOCTOR_CREDENTIALS: CredentialEntry[] = [
  { label: 'Dr. Sarah Jenkins, MD', detail: 'Cardiology · EMP-DR-101', email: 'sarah.jenkins@careplus.org', username: 'dr.jenkins', password: 'CarePlus@2026' },
  { label: 'Dr. Alexander Bennett, MD', detail: 'General Medicine · EMP-DR-102', email: 'bennett@careplus.org', username: 'dr.bennett', password: 'CarePlus@2026' },
  { label: 'Dr. Kavita Kulkarni, DCH', detail: 'Pediatrics · EMP-DR-103', email: 'kavita@careplus.org', username: 'dr.kavita', password: 'CarePlus@2026' },
  { label: 'Dr. Rohan Kapoor, MS', detail: 'Orthopedics · EMP-DR-104', email: 'rohan@careplus.org', username: 'dr.rohan', password: 'CarePlus@2026' },
];

const STAFF_CREDENTIALS: CredentialEntry[] = [
  { label: 'Super Admin', detail: 'Vikram Deshmukh · EMP-SA-001', email: 'superadmin@careplus.org', username: 'superadmin', password: 'CarePlus@2026' },
  { label: 'Hospital Admin', detail: 'Meera Nair · EMP-HA-012', email: 'admin@careplus.org', username: 'admin', password: 'CarePlus@2026' },
  { label: 'Receptionist', detail: 'Ananya Rao · EMP-RC-024', email: 'reception@careplus.org', username: 'reception', password: 'CarePlus@2026' },
  { label: 'Nurse', detail: 'Priya Menon, RN · EMP-NR-201', email: 'nurse@careplus.org', username: 'nurse', password: 'CarePlus@2026' },
  { label: 'Pharmacist', detail: 'Karthik Iyer · EMP-PH-301', email: 'pharmacy@careplus.org', username: 'pharmacist', password: 'CarePlus@2026' },
  { label: 'Lab Technician', detail: 'Siddharth Verma · EMP-LB-401', email: 'lab@careplus.org', username: 'labtech', password: 'CarePlus@2026' },
  { label: 'Accountant / Billing', detail: 'Neha Sharma · EMP-AC-501', email: 'billing@careplus.org', username: 'accountant', password: 'CarePlus@2026' },
];

const PATIENT_CREDENTIALS: CredentialEntry[] = [
  { label: 'Arjun Mehta', detail: 'Patient ID: CP-PT-1001', email: 'patient@careplus.org', username: 'arjun.mehta', password: 'CarePlus@2026' },
  { label: 'Divya Krishnan', detail: 'Patient ID: CP-PT-1002', email: 'divya.k@example.com', username: 'divya.krishnan', password: 'CarePlus@2026' },
];

export const LoginPage: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { login, registerPatient } = useAuth();
  const { toast } = useToast();
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Patient registration state
  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    username: '',
    phone: '',
    dateOfBirth: '1995-01-15',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    bloodGroup: 'O+',
    address: '',
    emergencyContact: '',
    password: '',
    confirmPassword: '',
  });
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Forgot Password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [serverCodeHint, setServerCodeHint] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  // Account Activation modal state
  const [activateOpen, setActivateOpen] = useState(false);
  const [actIdentifier, setActIdentifier] = useState('');
  const [actCode, setActCode] = useState('');
  const [actPassword, setActPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please enter both your email/username and password.');
      return;
    }
    setSubmitting(true);
    try {
      const user = await login(identifier.trim(), password, rememberMe);
      toast(`Welcome back, ${user.fullName}`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!regForm.fullName.trim() || !regForm.email.trim() || !regForm.phone.trim() || !regForm.dateOfBirth) {
      setRegError('Please fill in all required personal details.');
      return;
    }
    if (regForm.password.length < 8) {
      setRegError('Password must be at least 8 characters long.');
      return;
    }
    if (regForm.password !== regForm.confirmPassword) {
      setRegError('Password and confirmation do not match.');
      return;
    }
    setRegSubmitting(true);
    try {
      const res = await registerPatient({
        fullName: regForm.fullName,
        email: regForm.email,
        username: regForm.username || undefined,
        phone: regForm.phone,
        dateOfBirth: regForm.dateOfBirth,
        gender: regForm.gender,
        bloodGroup: regForm.bloodGroup,
        address: regForm.address,
        emergencyContact: regForm.emergencyContact,
        password: regForm.password,
      });
      toast(`Account created! Your Patient ID is ${res.patientCode}`, 'success');
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string; verificationCode: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier: resetIdentifier }),
      });
      setServerCodeHint(res.verificationCode);
      setResetStep('confirm');
      toast('Verification code generated', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reset failed', 'error');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier: resetIdentifier,
          code: resetCode,
          newPassword: newResetPassword,
        }),
      });
      toast('Password reset complete. Sign in with your new password.', 'success');
      setForgotOpen(false);
      setResetStep('request');
      setIdentifier(resetIdentifier);
      setPassword(newResetPassword);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reset password', 'error');
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/activate', {
        method: 'POST',
        body: JSON.stringify({
          identifier: actIdentifier,
          activationCode: actCode,
          newPassword: actPassword || undefined,
        }),
      });
      toast('Account activated. You can now sign in.', 'success');
      setActivateOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Activation failed', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <CarePlusLogo size={34} />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">CarePlus</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => setCredentialsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-4 h-4 text-slate-600" />
            <span>Login Credentials</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setRegError('');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Patient Register</span>
          </button>
          <button
            type="button"
            onClick={onOpenQueueDisplay}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
          >
            <MonitorPlay className="w-4 h-4" />
            <span>Waiting Area Queue Screen</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Clinical Atrium Visual */}
        <section className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[380px] flex flex-col justify-end">
          <img
            src="/src/assets/images/login_hospital_hero_1794826955118.jpg"
            alt="CarePlus Medical Center bright sunlit atrium"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/45 to-slate-900/10" />
          <div className="relative z-10 p-8 text-white max-w-xl">
            <p className="text-xs font-medium text-teal-300 tracking-wide">
              CarePlus Health Network · Clinical Operations Platform
            </p>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              Unified care coordination across every clinical department
            </h1>
            <p className="mt-3 text-sm text-slate-200 leading-relaxed">
              Role-isolated dashboards connecting reception, outpatient queues, doctors, nursing wards, diagnostics, pharmacy inventory, and patient billing in real time.
            </p>
            <div className="mt-6 pt-5 border-t border-white/15 grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-mono tabular-nums text-lg font-bold text-white">9</p>
                <p className="text-slate-300">Role Portals</p>
              </div>
              <div>
                <p className="font-mono tabular-nums text-lg font-bold text-white">Live</p>
                <p className="text-slate-300">Queue & Alerts</p>
              </div>
              <div>
                <p className="font-mono tabular-nums text-lg font-bold text-white">RBAC</p>
                <p className="text-slate-300">Audit Logged</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Sign-In & Patient Registration Panel */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    authMode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    authMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Register as Patient
                </button>
              </div>
              <ShieldCheck className="w-7 h-7 text-sky-600 shrink-0" />
            </div>

            {authMode === 'login' ? (
              <>
                <div className="mt-5">
                  <h2 className="font-display text-2xl font-bold text-slate-900">Sign in to CarePlus</h2>
                  <p className="mt-1 text-sm text-slate-600">Enter your staff or patient credentials to access your role workspace.</p>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  {error && (
                    <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="login-identifier" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email or Username
                    </label>
                    <input
                      id="login-identifier"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@careplus.org"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full pl-3.5 pr-11 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 text-xs flex-wrap">
                    <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>Remember me on this workstation</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActivateOpen(true)}
                        className="text-slate-600 hover:text-slate-900 font-medium underline underline-offset-2"
                      >
                        Activate account
                      </button>
                      <button
                        type="button"
                        onClick={() => setForgotOpen(true)}
                        className="text-sky-700 hover:text-sky-800 font-semibold underline underline-offset-2"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mt-5">
                  <h2 className="font-display text-2xl font-bold text-slate-900">Patient Portal Registration</h2>
                  <p className="mt-1 text-sm text-slate-600">Create your personal CarePlus patient account to book appointments and access medical records.</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="mt-5 space-y-3.5">
                  {regError && (
                    <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                      {regError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-fullname" className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                      <input
                        id="reg-fullname"
                        required
                        type="text"
                        value={regForm.fullName}
                        onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                        placeholder="e.g. Kiran Deshpande"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                      <input
                        id="reg-email"
                        required
                        type="email"
                        value={regForm.email}
                        onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                      <input
                        id="reg-phone"
                        required
                        type="text"
                        value={regForm.phone}
                        onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                        placeholder="+91 98450 00000"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-username" className="block text-xs font-semibold text-slate-700 mb-1">Username (optional)</label>
                      <input
                        id="reg-username"
                        type="text"
                        value={regForm.username}
                        onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                        placeholder="Auto-generated if blank"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-dob" className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                      <input
                        id="reg-dob"
                        required
                        type="date"
                        value={regForm.dateOfBirth}
                        onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="reg-gender" className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                        <select
                          id="reg-gender"
                          value={regForm.gender}
                          onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as 'Male' | 'Female' | 'Other' })}
                          className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          <option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reg-blood" className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                        <select
                          id="reg-blood"
                          value={regForm.bloodGroup}
                          onChange={(e) => setRegForm({ ...regForm, bloodGroup: e.target.value })}
                          className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg"
                        >
                          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bg) => <option key={bg}>{bg}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="reg-address" className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                      <input
                        id="reg-address"
                        type="text"
                        value={regForm.address}
                        onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                        placeholder="Street, City"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-emergency" className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact</label>
                      <input
                        id="reg-emergency"
                        type="text"
                        value={regForm.emergencyContact}
                        onChange={(e) => setRegForm({ ...regForm, emergencyContact: e.target.value })}
                        placeholder="Name & phone"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 mb-1">Password (min 8 chars)</label>
                      <div className="relative">
                        <input
                          id="reg-password"
                          required
                          minLength={8}
                          type={showRegPassword ? 'text' : 'password'}
                          value={regForm.password}
                          onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                          placeholder="Create password"
                          className="w-full pl-3 pr-9 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        >
                          {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="reg-confirm" className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password</label>
                      <input
                        id="reg-confirm"
                        required
                        minLength={8}
                        type={showRegPassword ? 'text' : 'password'}
                        value={regForm.confirmPassword}
                        onChange={(e) => setRegForm({ ...regForm, confirmPassword: e.target.value })}
                        placeholder="Repeat password"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={regSubmitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {regSubmitting ? 'Creating Patient Account...' : 'Create Patient Account & Sign In'}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Individual Access & Registration Guidance */}
          <div className="mt-7 pt-6 border-t border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <p className="font-semibold text-slate-900">Physicians &amp; Clinical Staff</p>
                <p className="mt-1 text-slate-600 leading-relaxed">
                  Each doctor and staff member signs in manually with their own credentials.{' '}
                  <button
                    type="button"
                    onClick={() => setCredentialsModalOpen(true)}
                    className="font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-900"
                  >
                    View all credentials
                  </button>
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200/80">
                <p className="font-semibold text-teal-950">New Patients</p>
                <p className="mt-1 text-teal-800 leading-relaxed">
                  Create your personal CarePlus account via{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setRegError('');
                    }}
                    className="font-semibold underline underline-offset-2 hover:text-teal-950"
                  >
                    Register as Patient
                  </button>{' '}
                  to receive your Patient ID.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Visible Account Credentials Reference (Read-only, no direct login) */}
        <section className="lg:col-span-12 bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Portal Login Credentials Reference</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Every doctor and role uses separate credentials. Copy or enter an email/username and password into the Sign In form above.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs self-start sm:self-auto">
              <span className="text-slate-600">Default initial password:</span>
              <code className="font-mono font-semibold text-slate-900 select-all">CarePlus@2026</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText('CarePlus@2026');
                  setCopiedValue('pwd-global');
                  setTimeout(() => setCopiedValue(null), 1500);
                }}
                className="text-slate-500 hover:text-slate-900 p-0.5"
                title="Copy password"
                aria-label="Copy default password"
              >
                {copiedValue === 'pwd-global' ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Separate Doctor Logins */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="w-4 h-4 text-sky-700" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Separate Doctor Logins ({DOCTOR_CREDENTIALS.length})</h4>
              </div>
              <div className="space-y-2.5">
                {DOCTOR_CREDENTIALS.map((cred) => (
                  <div key={cred.email} className="bg-white border border-slate-200 rounded-lg p-3 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{cred.label}</p>
                      <p className="text-[11px] text-slate-500">{cred.detail}</p>
                      <p className="mt-1 font-mono text-sky-800 select-all break-all">{cred.email}</p>
                      <p className="font-mono text-[11px] text-slate-500">@{cred.username} · {cred.password}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(cred.email);
                        setCopiedValue(cred.email);
                        setTimeout(() => setCopiedValue(null), 1500);
                      }}
                      className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                      title={`Copy ${cred.email}`}
                      aria-label={`Copy ${cred.email}`}
                    >
                      {copiedValue === cred.email ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Hospital & Staff Roles */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-teal-700" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Hospital &amp; Staff Roles ({STAFF_CREDENTIALS.length})</h4>
              </div>
              <div className="space-y-2">
                {STAFF_CREDENTIALS.map((cred) => (
                  <div key={cred.email} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-900">{cred.label}</span>
                        <span className="text-[11px] text-slate-500">({cred.detail.split(' · ')[0]})</span>
                      </div>
                      <p className="font-mono text-sky-800 select-all truncate">{cred.email} <span className="text-slate-400">(@{cred.username})</span></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(cred.email);
                        setCopiedValue(cred.email);
                        setTimeout(() => setCopiedValue(null), 1500);
                      }}
                      className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                      title={`Copy ${cred.email}`}
                      aria-label={`Copy ${cred.email}`}
                    >
                      {copiedValue === cred.email ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Patient Logins & Newly Provisioned Accounts */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="w-4 h-4 text-sky-700" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Patient Portal Logins ({PATIENT_CREDENTIALS.length})</h4>
                </div>
                <div className="space-y-2.5">
                  {PATIENT_CREDENTIALS.map((cred) => (
                    <div key={cred.email} className="bg-white border border-slate-200 rounded-lg p-3 text-xs flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{cred.label}</p>
                        <p className="text-[11px] text-slate-500">{cred.detail}</p>
                        <p className="mt-1 font-mono text-sky-800 select-all break-all">{cred.email}</p>
                        <p className="font-mono text-[11px] text-slate-500">@{cred.username} · {cred.password}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(cred.email);
                          setCopiedValue(cred.email);
                          setTimeout(() => setCopiedValue(null), 1500);
                        }}
                        className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                        title={`Copy ${cred.email}`}
                        aria-label={`Copy ${cred.email}`}
                      >
                        {copiedValue === cred.email ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-900">Newly Created Accounts</p>
                <p>
                  • New patients register via <strong>Register as Patient</strong> with their own password.
                </p>
                <p>
                  • New doctors receive individual logins &amp; custom passwords from <strong>Hospital Admin → Doctor Management</strong>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Forgot Password Modal */}
      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Reset Account Password" maxWidth="max-w-md">
        {resetStep === 'request' ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <p className="text-sm text-slate-600">Enter your registered email or username to receive a verification code.</p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email or Username</label>
              <input
                type="text"
                required
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                placeholder="e.g. name@careplus.org"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button type="submit" className="w-full py-2 px-4 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
              Send Verification Code
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Verification code issued: <strong className="font-mono">{serverCodeHint}</strong></span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Code</label>
              <input
                type="text"
                required
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min 8 chars)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newResetPassword}
                onChange={(e) => setNewResetPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button type="submit" className="w-full py-2 px-4 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">
              Confirm Password Reset
            </button>
          </form>
        )}
      </Modal>

      {/* Account Activation Modal */}
      <Modal open={activateOpen} onClose={() => setActivateOpen(false)} title="Activate CarePlus Account" maxWidth="max-w-md">
        <form onSubmit={handleActivate} className="space-y-4">
          <div className="flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <UserCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <span>Activate newly provisioned staff or patient credentials using your onboarding code.</span>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email or Username</label>
            <input
              type="text"
              required
              value={actIdentifier}
              onChange={(e) => setActIdentifier(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Activation Code</label>
            <input
              type="text"
              required
              value={actCode}
              onChange={(e) => setActCode(e.target.value)}
              placeholder="Provided by Hospital Admin"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Set Password (optional)</label>
            <input
              type="password"
              minLength={8}
              value={actPassword}
              onChange={(e) => setActPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button type="submit" className="w-full py-2 px-4 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700">
            Activate Account
          </button>
        </form>
      </Modal>

      {/* All Login Credentials Reference Modal (Read-only) */}
      <Modal open={credentialsModalOpen} onClose={() => setCredentialsModalOpen(false)} title="CarePlus Portal Login Credentials" maxWidth="max-w-3xl">
        <div className="space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-600">
              All seeded accounts use separate logins. Enter any email or username below with the initial password to sign in.
            </span>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-slate-200 rounded-md shrink-0">
              <span className="text-slate-500">Password:</span>
              <code className="font-mono font-semibold text-slate-900 select-all">CarePlus@2026</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText('CarePlus@2026');
                  setCopiedValue('modal-pwd');
                  setTimeout(() => setCopiedValue(null), 1500);
                }}
                className="text-slate-500 hover:text-slate-900"
                aria-label="Copy default password"
              >
                {copiedValue === 'modal-pwd' ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2">Doctors (Separate Physician Logins)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOCTOR_CREDENTIALS.map((cred) => (
                <div key={cred.email} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{cred.label}</p>
                    <p className="text-[11px] text-slate-500">{cred.detail}</p>
                    <p className="font-mono text-sky-800 select-all truncate">{cred.email} · @{cred.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(cred.email);
                      setCopiedValue(`modal-${cred.email}`);
                      setTimeout(() => setCopiedValue(null), 1500);
                    }}
                    className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                    aria-label={`Copy ${cred.email}`}
                  >
                    {copiedValue === `modal-${cred.email}` ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2">Hospital &amp; Clinical Staff Roles</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STAFF_CREDENTIALS.map((cred) => (
                <div key={cred.email} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{cred.label} · <span className="font-normal text-slate-500">{cred.detail.split(' · ')[0]}</span></p>
                    <p className="font-mono text-sky-800 select-all truncate">{cred.email} · @{cred.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(cred.email);
                      setCopiedValue(`modal-${cred.email}`);
                      setTimeout(() => setCopiedValue(null), 1500);
                    }}
                    className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                    aria-label={`Copy ${cred.email}`}
                  >
                    {copiedValue === `modal-${cred.email}` ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 uppercase tracking-wider mb-2">Sample Patients</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PATIENT_CREDENTIALS.map((cred) => (
                <div key={cred.email} className="p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{cred.label} <span className="font-normal text-slate-500">({cred.detail})</span></p>
                    <p className="font-mono text-sky-800 select-all truncate">{cred.email} · @{cred.username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(cred.email);
                      setCopiedValue(`modal-${cred.email}`);
                      setTimeout(() => setCopiedValue(null), 1500);
                    }}
                    className="p-1.5 text-slate-400 hover:text-sky-700 rounded hover:bg-slate-100 shrink-0"
                    aria-label={`Copy ${cred.email}`}
                  >
                    {copiedValue === `modal-${cred.email}` ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
