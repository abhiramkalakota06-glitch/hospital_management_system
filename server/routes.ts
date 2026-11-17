import crypto from 'crypto';
import express, { type NextFunction, type Response } from 'express';
import {
  addAuditLog,
  addNotification,
  getDb,
  nextCode,
  recalculateBillTotals,
  saveDb,
} from './db.ts';
import {
  type AuthenticatedRequest,
  extractBearerToken,
  hashPassword,
  requireRoles,
  revokeToken,
  sanitizeUser,
  signToken,
  verifyPassword,
  verifyToken,
} from './auth.ts';
import { broadcastEvent } from './ws.ts';
import type {
  Appointment,
  Bed,
  Bill,
  BillLineItem,
  Consultation,
  Department,
  DischargeRequest,
  DoctorProfile,
  Hospital,
  InsuranceClaim,
  LabRequest,
  MedicationAdminRecord,
  Medicine,
  NursingNote,
  Patient,
  Payment,
  Prescription,
  QueueToken,
  RefundRequest,
  RoleDefinition,
  StaffProfile,
  UserRole,
  VitalRecord,
} from '../src/types/hms.ts';

export function createApiRouter() {
  const router = express.Router();

  // Authentication middleware for protected routes
  const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication token missing.' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
      return;
    }
    const db = getDb();
    const user = db.users.find((u) => u.id === payload.userId);
    if (!user || !user.active) {
      res.status(403).json({ error: 'Account is deactivated or unavailable.' });
      return;
    }
    req.authUser = user;
    req.authToken = token;
    next();
  };

  // Helper: Resolve patient record linked to logged-in patient user
  const getPatientIdForUser = (userId: string) => {
    const db = getDb();
    return db.patients.find((p) => p.userId === userId)?.id;
  };

  const getDoctorForUser = (userId: string) => {
    const db = getDb();
    return db.doctors.find((d) => d.userId === userId);
  };

  const canAccessPatient = (req: AuthenticatedRequest, patientId: string): boolean => {
    const user = req.authUser;
    if (!user) return false;
    if (user.role === 'patient') {
      return getPatientIdForUser(user.id) === patientId;
    }
    if (user.role === 'doctor') {
      const db = getDb();
      const doc = getDoctorForUser(user.id);
      if (!doc) return false;
      const patient = db.patients.find((p) => p.id === patientId);
      if (!patient) return false;
      const hasAppointment = db.appointments.some((a) => a.patientId === patientId && a.doctorId === doc.id);
      const hasConsultation = db.consultations.some((c) => c.patientId === patientId && c.doctorId === doc.id);
      return patient.assignedDoctorId === doc.id || hasAppointment || hasConsultation;
    }
    return ['super_admin', 'hospital_admin', 'receptionist', 'nurse', 'pharmacist', 'lab_technician', 'accountant'].includes(user.role);
  };

  // =========================================================================
  // 1. PUBLIC AUTH & QUEUE DISPLAY ENDPOINTS
  // =========================================================================

  router.post('/auth/login', (req, res) => {
    const { identifier, password, rememberMe } = req.body as {
      identifier?: string;
      password?: string;
      rememberMe?: boolean;
    };
    if (!identifier || !password) {
      res.status(400).json({ error: 'Email/Username and password are required.' });
      return;
    }
    const db = getDb();
    const normalized = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized,
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials. Please check your email/username and password.' });
      return;
    }
    if (!user.active) {
      res.status(403).json({ error: 'This account has been deactivated. Contact your administrator.' });
      return;
    }
    if (!user.activated) {
      res.status(403).json({ error: 'Account requires activation before signing in.' });
      return;
    }
    const token = signToken(user, Boolean(rememberMe));
    addAuditLog(db, user, 'LOGIN', 'Auth', user.id, `User ${user.username} (${user.role}) signed in`);
    saveDb(db);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  });

  router.post('/auth/forgot-password', (req, res) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier) {
      res.status(400).json({ error: 'Please provide your email or username.' });
      return;
    }
    const db = getDb();
    const normalized = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized,
    );
    if (!user) {
      res.status(404).json({ error: 'No matching account found.' });
      return;
    }
    const resetCode = crypto.randomInt(100000, 999999).toString();
    user.resetToken = resetCode;
    user.resetTokenExpiresAt = Date.now() + 15 * 60 * 1000;
    addAuditLog(db, user, 'PASSWORD_RESET_REQUEST', 'Auth', user.id, 'Generated password reset verification code');
    saveDb(db);
    res.json({
      message: 'Verification code generated.',
      // Returned in preview environment so user can complete reset flow end-to-end
      verificationCode: resetCode,
    });
  });

  router.post('/auth/reset-password', (req, res) => {
    const { identifier, code, newPassword } = req.body as {
      identifier?: string;
      code?: string;
      newPassword?: string;
    };
    if (!identifier || !code || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Identifier, verification code, and a password of at least 8 characters are required.' });
      return;
    }
    const db = getDb();
    const normalized = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized,
    );
    if (!user || !user.resetToken || user.resetToken !== code.trim() || (user.resetTokenExpiresAt || 0) < Date.now()) {
      res.status(400).json({ error: 'Invalid or expired reset verification code.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    user.resetToken = undefined;
    user.resetTokenExpiresAt = undefined;
    addAuditLog(db, user, 'PASSWORD_RESET', 'Auth', user.id, 'Password reset completed');
    saveDb(db);
    res.json({ message: 'Password updated successfully. You can now sign in.' });
  });

  router.post('/auth/activate', (req, res) => {
    const { identifier, activationCode, newPassword } = req.body as {
      identifier?: string;
      activationCode?: string;
      newPassword?: string;
    };
    if (!identifier || !activationCode) {
      res.status(400).json({ error: 'Account identifier and activation code are required.' });
      return;
    }
    const db = getDb();
    const normalized = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized,
    );
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (user.activated) {
      res.json({ message: 'Account is already activated.' });
      return;
    }
    if (user.activationToken && user.activationToken !== activationCode.trim()) {
      res.status(400).json({ error: 'Invalid activation code.' });
      return;
    }
    if (newPassword && newPassword.length >= 8) {
      user.passwordHash = hashPassword(newPassword);
    }
    user.activated = true;
    user.active = true;
    user.activationToken = undefined;
    addAuditLog(db, user, 'ACTIVATE_ACCOUNT', 'Auth', user.id, 'User activated account');
    saveDb(db);
    res.json({ message: 'Account activated successfully.' });
  });

  router.post('/auth/register-patient', (req, res) => {
    const {
      fullName,
      email,
      username,
      phone,
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      emergencyContact,
      allergies,
      existingConditions,
      password,
    } = req.body as {
      fullName?: string;
      email?: string;
      username?: string;
      phone?: string;
      dateOfBirth?: string;
      gender?: 'Male' | 'Female' | 'Other';
      bloodGroup?: string;
      address?: string;
      emergencyContact?: string;
      allergies?: string[];
      existingConditions?: string[];
      password?: string;
    };

    const db = getDb();
    const minPwd = db.systemConfig.passwordMinLength || 8;
    if (!fullName?.trim() || !email?.trim() || !phone?.trim() || !dateOfBirth || !gender || !password) {
      res.status(400).json({ error: 'Full name, email, phone, date of birth, gender, and password are required.' });
      return;
    }
    if (password.length < minPwd) {
      res.status(400).json({ error: `Password must be at least ${minPwd} characters.` });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const baseUsername = (username?.trim() || cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/gi, '') || 'patient').toLowerCase();
    let candidateUsername = baseUsername;
    if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }
    if (username?.trim() && db.users.some((u) => u.username.toLowerCase() === candidateUsername)) {
      res.status(409).json({ error: 'This username is already taken.' });
      return;
    }
    while (db.users.some((u) => u.username.toLowerCase() === candidateUsername)) {
      candidateUsername = `${baseUsername}${crypto.randomInt(10, 999)}`;
    }

    const patientCode = nextCode(db, 'patient', 'CP-PT');
    const userId = `usr-${crypto.randomUUID().slice(0, 6)}`;
    const patientId = `pat-${crypto.randomUUID().slice(0, 6)}`;
    const hospitalId = db.hospitals[0]?.id || 'hosp-1';
    const nowIso = new Date().toISOString();

    const newUser = {
      id: userId,
      username: candidateUsername,
      email: email.trim(),
      fullName: fullName.trim(),
      role: 'patient' as const,
      hospitalId,
      designation: 'Registered Patient',
      employeeOrPatientId: patientCode,
      phone: phone.trim(),
      address: (address || '').trim(),
      active: true,
      activated: true,
      notificationPreferences: {
        appointments: true,
        prescriptions: true,
        labResults: true,
        billing: true,
        system: true,
      },
      createdAt: nowIso,
      passwordHash: hashPassword(password),
    };

    const newPatient: Patient = {
      id: patientId,
      patientCode,
      userId,
      hospitalId,
      fullName: fullName.trim(),
      dateOfBirth,
      gender,
      phone: phone.trim(),
      email: email.trim(),
      address: (address || '').trim(),
      emergencyContact: (emergencyContact || '').trim(),
      bloodGroup: bloodGroup || 'O+',
      allergies: Array.isArray(allergies) ? allergies : [],
      existingConditions: Array.isArray(existingConditions) ? existingConditions : [],
      status: 'Outpatient',
      registeredAt: nowIso,
    };

    db.users.push(newUser);
    db.patients.unshift(newPatient);

    addNotification(db, {
      roleTarget: ['hospital_admin', 'receptionist'],
      type: 'registration',
      title: `Self-Registered Patient: ${newPatient.fullName}`,
      message: `Patient ${newPatient.patientCode} created a portal account.`,
    });
    addAuditLog(db, newUser, 'SELF_REGISTER_PATIENT', 'Patient', patientCode, `Patient ${newPatient.fullName} registered via portal`);
    saveDb(db);
    broadcastEvent('notification:created', { title: `Registered ${newPatient.fullName}` });

    const token = signToken(newUser, true);
    res.status(201).json({
      token,
      user: sanitizeUser(newUser),
      patient: newPatient,
    });
  });

  // Public waiting room Queue Display Screen feed (sanitized: shows token, doctor, dept, initials/first name only)
  router.get('/queue/public', (_req, res) => {
    const db = getDb();
    const tokens = db.queueTokens
      .filter((t) => ['Waiting', 'Called', 'In Consultation', 'Skipped'].includes(t.status))
      .map((t) => {
        const patient = db.patients.find((p) => p.id === t.patientId);
        const doctor = db.doctors.find((d) => d.id === t.doctorId);
        const dept = db.departments.find((d) => d.id === t.departmentId);
        return {
          ...t,
          patientDisplay: patient ? `${patient.fullName.split(' ')[0]} (${patient.patientCode})` : t.patientId,
          doctorName: doctor?.fullName || 'Assigned Physician',
          doctorAvailable: doctor?.available ?? true,
          departmentName: dept?.name || 'Outpatient',
          floor: dept?.floor || 'Ground Floor',
        };
      });
    res.json({
      hospitalName: db.hospitals[0]?.name || 'CarePlus Medical Center',
      tokens,
      doctors: db.doctors.map((d) => ({
        id: d.id,
        fullName: d.fullName,
        departmentId: d.departmentId,
        available: d.available,
        departmentName: db.departments.find((dep) => dep.id === d.departmentId)?.name || '',
      })),
    });
  });

  // =========================================================================
  // 2. AUTHENTICATED COMMON ENDPOINTS
  // =========================================================================

  router.use(authenticate);

  router.post('/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.authToken) revokeToken(req.authToken);
    if (req.authUser) {
      const db = getDb();
      addAuditLog(db, req.authUser, 'LOGOUT', 'Auth', req.authUser.id, 'User signed out');
      saveDb(db);
    }
    res.json({ message: 'Logged out.' });
  });

  router.get('/auth/me', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const roleDef = db.roles.find((r) => r.key === req.authUser!.role);
    res.json({
      user: sanitizeUser(req.authUser!),
      permissions: roleDef?.permissions || null,
      systemConfig: {
        platformName: db.systemConfig.platformName,
        currencySymbol: db.systemConfig.currencySymbol,
        defaultTaxRate: db.systemConfig.defaultTaxRate,
        appointmentSlotMinutes: db.systemConfig.appointmentSlotMinutes,
        workingHoursStart: db.systemConfig.workingHoursStart,
        workingHoursEnd: db.systemConfig.workingHoursEnd,
      },
    });
  });

  router.put('/auth/profile', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.authUser!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const { fullName, phone, address, email, avatarUrl, notificationPreferences } = req.body;
    if (fullName) user.fullName = String(fullName).trim();
    if (phone) user.phone = String(phone).trim();
    if (address) user.address = String(address).trim();
    if (email) user.email = String(email).trim();
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (notificationPreferences) {
      user.notificationPreferences = { ...user.notificationPreferences, ...notificationPreferences };
    }
    // Sync linked patient record if patient role
    if (user.role === 'patient') {
      const pat = db.patients.find((p) => p.userId === user.id);
      if (pat) {
        pat.fullName = user.fullName;
        pat.phone = user.phone;
        pat.address = user.address;
        pat.email = user.email;
      }
    }
    addAuditLog(db, user, 'UPDATE_PROFILE', 'User', user.id, 'Updated profile details');
    saveDb(db);
    res.json({ user: sanitizeUser(user) });
  });

  router.put('/auth/password', (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    const db = getDb();
    const minLen = db.systemConfig.passwordMinLength || 8;
    if (!currentPassword || !newPassword || newPassword.length < minLen) {
      res.status(400).json({ error: `New password must be at least ${minLen} characters.` });
      return;
    }
    const user = db.users.find((u) => u.id === req.authUser!.id)!;
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
    addAuditLog(db, user, 'CHANGE_PASSWORD', 'User', user.id, 'Changed account password');
    saveDb(db);
    res.json({ message: 'Password updated successfully.' });
  });

  // Notifications
  router.get('/notifications', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const list = db.notifications
      .filter((n) => n.userId === user.id || (n.roleTarget && n.roleTarget.includes(user.role)))
      .map((n) => ({
        ...n,
        isRead: n.readBy.includes(user.id),
      }));
    res.json({ notifications: list });
  });

  router.post('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const notif = db.notifications.find((n) => n.id === req.params.id);
    if (notif && !notif.readBy.includes(req.authUser!.id)) {
      notif.readBy.push(req.authUser!.id);
      saveDb(db);
    }
    res.json({ success: true });
  });

  router.post('/notifications/read-all', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    db.notifications.forEach((n) => {
      if ((n.userId === user.id || (n.roleTarget && n.roleTarget.includes(user.role))) && !n.readBy.includes(user.id)) {
        n.readBy.push(user.id);
      }
    });
    saveDb(db);
    res.json({ success: true });
  });

  // Global Search (Permission-scoped!)
  router.get('/search', (req: AuthenticatedRequest, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      res.json({ results: [] });
      return;
    }
    const db = getDb();
    const role = req.authUser!.role;
    const results: Array<{ category: string; id: string; title: string; subtitle: string; route: string }> = [];

    const patientOnlyId = role === 'patient' ? getPatientIdForUser(req.authUser!.id) : null;
    const doctorProfile = role === 'doctor' ? getDoctorForUser(req.authUser!.id) : null;

    // Patients
    if (['super_admin', 'hospital_admin', 'receptionist', 'doctor', 'nurse', 'accountant', 'lab_technician'].includes(role)) {
      db.patients
        .filter((p) => {
          if (role === 'doctor' && doctorProfile) {
            const authorized = canAccessPatient(req, p.id);
            if (!authorized) return false;
          }
          return p.fullName.toLowerCase().includes(q) || p.patientCode.toLowerCase().includes(q) || p.phone.toLowerCase().includes(q);
        })
        .slice(0, 5)
        .forEach((p) => {
          results.push({
            category: 'Patient',
            id: p.id,
            title: `${p.fullName} (${p.patientCode})`,
            subtitle: `${p.gender} · ${p.bloodGroup} · ${p.status}`,
            route: role === 'receptionist' ? 'search' : role === 'doctor' ? 'records' : 'patients',
          });
        });
    }

    // Doctors
    db.doctors
      .filter((d) => d.fullName.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((d) => {
        results.push({
          category: 'Doctor',
          id: d.id,
          title: d.fullName,
          subtitle: `${d.specialization} · Fee ${db.systemConfig.currencySymbol}${d.consultationFee}`,
          route: role === 'patient' ? 'book' : role === 'hospital_admin' ? 'doctors' : 'appointments',
        });
      });

    // Departments
    db.departments
      .filter((d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((d) => {
        results.push({
          category: 'Department',
          id: d.id,
          title: `${d.name} (${d.code})`,
          subtitle: d.floor,
          route: role === 'hospital_admin' ? 'departments' : role === 'patient' ? 'book' : 'dashboard',
        });
      });

    // Appointments
    db.appointments
      .filter((a) => {
        if (patientOnlyId && a.patientId !== patientOnlyId) return false;
        if (doctorProfile && a.doctorId !== doctorProfile.id) return false;
        const pat = db.patients.find((p) => p.id === a.patientId);
        return (
          a.appointmentNumber.toLowerCase().includes(q) ||
          a.reason.toLowerCase().includes(q) ||
          (pat?.fullName.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 5)
      .forEach((a) => {
        const pat = db.patients.find((p) => p.id === a.patientId);
        results.push({
          category: 'Appointment',
          id: a.id,
          title: `${a.appointmentNumber} — ${pat?.fullName || ''}`,
          subtitle: `${a.date} ${a.timeSlot} · ${a.status}`,
          route: role === 'receptionist' ? 'checkin' : 'appointments',
        });
      });

    // Prescriptions
    if (['super_admin', 'hospital_admin', 'doctor', 'pharmacist', 'nurse', 'patient'].includes(role)) {
      db.prescriptions
        .filter((rx) => {
          if (patientOnlyId && rx.patientId !== patientOnlyId) return false;
          if (doctorProfile && rx.doctorId !== doctorProfile.id) return false;
          return rx.prescriptionCode.toLowerCase().includes(q) || rx.items.some((i) => i.medicineName.toLowerCase().includes(q));
        })
        .slice(0, 4)
        .forEach((rx) => {
          results.push({
            category: 'Prescription',
            id: rx.id,
            title: rx.prescriptionCode,
            subtitle: `${rx.items.length} medicine(s) · ${rx.status}`,
            route: role === 'nurse' ? 'medications' : 'prescriptions',
          });
        });
    }

    // Lab Reports
    if (['super_admin', 'hospital_admin', 'doctor', 'lab_technician', 'patient'].includes(role)) {
      db.labRequests
        .filter((l) => {
          if (patientOnlyId && l.patientId !== patientOnlyId) return false;
          if (doctorProfile && l.doctorId !== doctorProfile.id) return false;
          return l.requestCode.toLowerCase().includes(q) || l.testName.toLowerCase().includes(q);
        })
        .slice(0, 4)
        .forEach((l) => {
          results.push({
            category: 'Lab Report',
            id: l.id,
            title: `${l.requestCode} — ${l.testName}`,
            subtitle: `${l.priority} · ${l.status}`,
            route: role === 'lab_technician' ? 'reports' : role === 'patient' ? 'reports' : 'labs',
          });
        });
    }

    // Bills
    if (['super_admin', 'hospital_admin', 'receptionist', 'accountant', 'pharmacist', 'patient'].includes(role)) {
      db.bills
        .filter((b) => {
          if (patientOnlyId && b.patientId !== patientOnlyId) return false;
          const pat = db.patients.find((p) => p.id === b.patientId);
          return b.billNumber.toLowerCase().includes(q) || (pat?.fullName.toLowerCase().includes(q) ?? false);
        })
        .slice(0, 4)
        .forEach((b) => {
          results.push({
            category: 'Bill',
            id: b.id,
            title: b.billNumber,
            subtitle: `${db.systemConfig.currencySymbol}${b.totalAmount.toFixed(2)} · ${b.status}`,
            route: role === 'patient' ? 'bills' : 'billing',
          });
        });
    }

    // Medicines
    if (['super_admin', 'hospital_admin', 'pharmacist', 'doctor'].includes(role)) {
      db.medicines
        .filter((m) => m.name.toLowerCase().includes(q) || m.medicineCode.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
        .slice(0, 4)
        .forEach((m) => {
          results.push({
            category: 'Medicine',
            id: m.id,
            title: `${m.name} (${m.medicineCode})`,
            subtitle: `Stock: ${m.quantity} · ${m.category}`,
            route: role === 'pharmacist' ? 'inventory' : role === 'hospital_admin' ? 'pharmacy' : 'prescriptions',
          });
        });
    }

    res.json({ results });
  });

  // =========================================================================
  // 3. ROLE-SCOPED DASHBOARD SUMMARY
  // =========================================================================
  router.get('/dashboard', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    const today = new Date().toISOString().slice(0, 10);

    const totalRevenue = db.payments.filter((p) => p.status === 'Completed').reduce((s, p) => s + p.amount, 0);
    const todayRevenue = db.payments
      .filter((p) => p.status === 'Completed' && p.paidAt.startsWith(today))
      .reduce((s, p) => s + p.amount, 0);
    const pendingBills = db.bills.filter((b) => b.status === 'Pending' || b.status === 'Partial');
    const outstandingBalance = pendingBills.reduce((s, b) => s + Math.max(0, b.totalAmount - b.paidAmount), 0);

    const todayAppointments = db.appointments.filter((a) => a.date === today);
    const occupiedBeds = db.beds.filter((b) => b.status === 'Occupied').length;
    const totalBeds = db.beds.length;

    const lowStockMedicines = db.medicines.filter((m) => m.quantity <= m.reorderLevel);
    const expiredMedicines = db.medicines.filter((m) => m.expiryDate < today);

    // Build shared chart datasets
    const departmentStats = db.departments.map((dept) => ({
      name: dept.name,
      appointments: db.appointments.filter((a) => a.departmentId === dept.id).length,
      doctors: db.doctors.filter((d) => d.departmentId === dept.id).length,
    }));

    const doctorProfile = user.role === 'doctor' ? getDoctorForUser(user.id) : null;
    const patientId = user.role === 'patient' ? getPatientIdForUser(user.id) : null;

    res.json({
      role: user.role,
      today,
      metrics: {
        totalHospitals: db.hospitals.length,
        totalUsers: db.users.length,
        activeUsers: db.users.filter((u) => u.active).length,
        inactiveUsers: db.users.filter((u) => !u.active).length,
        totalDoctors: db.doctors.length,
        availableDoctors: db.doctors.filter((d) => d.available).length,
        totalPatients: db.patients.length,
        todayRegistrations: db.patients.filter((p) => p.registeredAt.startsWith(today)).length,
        admittedPatients: db.patients.filter((p) => p.status === 'Admitted').length,
        dischargedPatients: db.patients.filter((p) => p.status === 'Discharged').length,
        totalAppointments: db.appointments.length,
        todayAppointments: todayAppointments.length,
        waitingQueue: db.queueTokens.filter((q) => q.status === 'Waiting' || q.status === 'Called').length,
        checkedInToday: todayAppointments.filter((a) => a.status === 'Checked-In' || a.status === 'In Consultation').length,
        completedToday: todayAppointments.filter((a) => a.status === 'Completed').length,
        cancelledToday: todayAppointments.filter((a) => a.status === 'Cancelled').length,
        totalRevenue,
        todayRevenue,
        pendingBillsCount: pendingBills.length,
        paidBillsCount: db.bills.filter((b) => b.status === 'Paid').length,
        outstandingBalance,
        totalRefunds: db.refundRequests.filter((r) => r.status === 'Approved' || r.status === 'Processed').reduce((s, r) => s + r.amount, 0),
        totalBeds,
        occupiedBeds,
        availableBeds: db.beds.filter((b) => b.status === 'Available').length,
        bedOccupancyRate: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        totalMedicines: db.medicines.length,
        totalMedicineStock: db.medicines.reduce((s, m) => s + m.quantity, 0),
        lowStockCount: lowStockMedicines.length,
        expiredCount: expiredMedicines.length,
        pendingPrescriptions: db.prescriptions.filter((p) => p.status !== 'Dispensed').length,
        pendingLabs: db.labRequests.filter((l) => l.status === 'Requested' || l.status === 'Sample Collected').length,
        processingLabs: db.labRequests.filter((l) => l.status === 'Processing' || l.status === 'Pending Verification').length,
        completedLabs: db.labRequests.filter((l) => l.status === 'Published').length,
        todayLabs: db.labRequests.filter((l) => l.requestedAt.startsWith(today)).length,
      },
      doctorSpecific: doctorProfile
        ? {
            doctorId: doctorProfile.id,
            todayAppointments: todayAppointments.filter((a) => a.doctorId === doctorProfile.id).length,
            waiting: db.queueTokens.filter((q) => q.doctorId === doctorProfile.id && (q.status === 'Waiting' || q.status === 'Called')).length,
            consulting: db.queueTokens.filter((q) => q.doctorId === doctorProfile.id && q.status === 'In Consultation').length,
            completed: db.appointments.filter((a) => a.doctorId === doctorProfile.id && a.status === 'Completed').length,
            upcoming: db.appointments.filter((a) => a.doctorId === doctorProfile.id && a.date >= today && ['Pending', 'Approved'].includes(a.status)).length,
          }
        : null,
      nurseSpecific:
        user.role === 'nurse'
          ? {
              assignedPatients: db.patients.filter((p) => p.status === 'Admitted').length,
              pendingMedications: db.medicationsAdmin.filter((m) => m.status === 'Scheduled').length,
              escalatedAlerts: db.nursingNotes.filter((n) => n.escalated).length,
            }
          : null,
      patientSpecific: patientId
        ? {
            patient: db.patients.find((p) => p.id === patientId),
            upcomingAppointments: db.appointments.filter((a) => a.patientId === patientId && a.date >= today && a.status !== 'Cancelled' && a.status !== 'Completed'),
            previousAppointments: db.appointments.filter((a) => a.patientId === patientId && (a.status === 'Completed' || a.date < today)),
            activePrescriptions: db.prescriptions.filter((p) => p.patientId === patientId),
            pendingBills: db.bills.filter((b) => b.patientId === patientId && b.status !== 'Paid' && b.status !== 'Refunded'),
            recentReports: db.labRequests.filter((l) => l.patientId === patientId && l.status === 'Published'),
          }
        : null,
      hospitalStats: db.hospitals.map((h) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        patients: db.patients.filter((p) => p.hospitalId === h.id).length,
        doctors: db.doctors.filter((d) => d.hospitalId === h.id).length,
        appointments: db.appointments.filter((a) => a.hospitalId === h.id).length,
        revenue: db.bills.filter((b) => b.hospitalId === h.id).reduce((s, b) => s + b.paidAmount, 0),
      })),
      departmentStats,
      recentActivity: db.auditLogs.slice(0, 8),
    });
  });

  // =========================================================================
  // 4. SUPER ADMIN: HOSPITALS, USERS, ROLES, SYSTEM CONFIG & BACKUPS
  // =========================================================================

  router.get('/hospitals', (_req, res) => {
    const db = getDb();
    res.json({ hospitals: db.hospitals });
  });

  router.post('/hospitals', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
    const { name, code, city, address, phone, email, bedCapacity, branches } = req.body;
    if (!name || !code || !city) {
      res.status(400).json({ error: 'Hospital name, code, and city are required.' });
      return;
    }
    const db = getDb();
    const hosp: Hospital = {
      id: `hosp-${crypto.randomUUID().slice(0, 6)}`,
      code: String(code).trim(),
      name: String(name).trim(),
      city: String(city).trim(),
      address: String(address || '').trim(),
      phone: String(phone || '').trim(),
      email: String(email || '').trim(),
      bedCapacity: Number(bedCapacity || 100),
      active: true,
      branches: Array.isArray(branches) ? branches : [],
      createdAt: new Date().toISOString(),
    };
    db.hospitals.push(hosp);
    addAuditLog(db, req.authUser!, 'CREATE_HOSPITAL', 'Hospital', hosp.id, `Created hospital ${hosp.name}`);
    saveDb(db);
    res.status(201).json({ hospital: hosp });
  });

  router.put('/hospitals/:id', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const hosp = db.hospitals.find((h) => h.id === req.params.id);
    if (!hosp) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }
    Object.assign(hosp, req.body, { id: hosp.id });
    addAuditLog(db, req.authUser!, 'UPDATE_HOSPITAL', 'Hospital', hosp.id, `Updated hospital ${hosp.name}`);
    saveDb(db);
    res.json({ hospital: hosp });
  });

  router.delete('/hospitals/:id', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const idx = db.hospitals.findIndex((h) => h.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Hospital not found.' });
      return;
    }
    const [removed] = db.hospitals.splice(idx, 1);
    addAuditLog(db, req.authUser!, 'DELETE_HOSPITAL', 'Hospital', removed.id, `Removed hospital ${removed.name}`);
    saveDb(db);
    res.json({ success: true });
  });

  // Users
  router.get('/users', requireRoles('super_admin', 'hospital_admin'), (_req, res) => {
    const db = getDb();
    res.json({ users: db.users.map(sanitizeUser) });
  });

  router.post('/users', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { username, email, fullName, role, hospitalId, departmentId, designation, phone, address, password, consultationFee } = req.body;
    if (!username || !email || !fullName || !role) {
      res.status(400).json({ error: 'Username, email, full name, and role are required.' });
      return;
    }
    const db = getDb();
    const minPwd = db.systemConfig.passwordMinLength || 8;
    if (!password || String(password).length < minPwd) {
      res.status(400).json({ error: `A separate initial password of at least ${minPwd} characters is required.` });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === String(email).trim().toLowerCase() || u.username.toLowerCase() === String(username).trim().toLowerCase())) {
      res.status(409).json({ error: 'Email or username already exists.' });
      return;
    }
    const userId = `usr-${crypto.randomUUID().slice(0, 6)}`;
    const resolvedHospitalId = hospitalId || db.hospitals[0]?.id || 'hosp-1';
    const resolvedDeptId = departmentId || db.departments.find((d) => d.hospitalId === resolvedHospitalId)?.id || db.departments[0]?.id || 'dept-1';
    const newUser = {
      id: userId,
      username: String(username).trim(),
      email: String(email).trim(),
      fullName: String(fullName).trim(),
      role: role as UserRole,
      hospitalId: resolvedHospitalId,
      departmentId: resolvedDeptId,
      designation: designation || (role === 'doctor' ? 'Consultant Physician' : role.replace('_', ' ')),
      employeeOrPatientId: role === 'doctor' ? `EMP-DR-${crypto.randomInt(200, 999)}` : `EMP-${crypto.randomInt(1000, 9999)}`,
      phone: phone || '',
      address: address || '',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: true, system: true },
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(String(password)),
    };
    db.users.push(newUser);
    if (role === 'doctor') {
      const docProfile: DoctorProfile = {
        id: `doc-${crypto.randomUUID().slice(0, 6)}`,
        userId,
        hospitalId: resolvedHospitalId,
        departmentId: resolvedDeptId,
        fullName: newUser.fullName,
        specialization: designation || 'General Medicine',
        qualifications: 'MBBS, MD',
        consultationFee: Number(consultationFee || 1000),
        available: true,
        avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
        schedule: {
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          startTime: '09:00',
          endTime: '17:00',
          breakStart: '13:00',
          breakEnd: '14:00',
          slotDurationMinutes: 30,
        },
        leaveRequests: [],
      };
      db.doctors.push(docProfile);
    }
    addAuditLog(db, req.authUser!, 'CREATE_USER', 'User', newUser.id, `Created ${newUser.role} account ${newUser.username}`);
    saveDb(db);
    res.status(201).json({ user: sanitizeUser(newUser) });
  });

  router.put('/users/:id', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const { fullName, role, hospitalId, departmentId, designation, phone, active, resetPasswordTo } = req.body;
    if (fullName !== undefined) user.fullName = fullName;
    if (role !== undefined) user.role = role;
    if (hospitalId !== undefined) user.hospitalId = hospitalId;
    if (departmentId !== undefined) user.departmentId = departmentId;
    if (designation !== undefined) user.designation = designation;
    if (phone !== undefined) user.phone = phone;
    if (active !== undefined) user.active = Boolean(active);
    if (resetPasswordTo) user.passwordHash = hashPassword(String(resetPasswordTo));
    addAuditLog(db, req.authUser!, 'UPDATE_USER', 'User', user.id, `Updated user ${user.username}`);
    saveDb(db);
    res.json({ user: sanitizeUser(user) });
  });

  // Roles & Permissions
  router.get('/roles', requireRoles('super_admin', 'hospital_admin'), (_req, res) => {
    const db = getDb();
    res.json({ roles: db.roles });
  });

  router.post('/roles', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
    const { key, name, description, permissions } = req.body;
    if (!key || !name) {
      res.status(400).json({ error: 'Role key and name are required.' });
      return;
    }
    const db = getDb();
    const role: RoleDefinition = {
      id: `role-${crypto.randomUUID().slice(0, 6)}`,
      key,
      name,
      description: description || '',
      permissions,
    };
    db.roles.push(role);
    addAuditLog(db, req.authUser!, 'CREATE_ROLE', 'Role', role.id, `Created role ${role.name}`);
    saveDb(db);
    res.status(201).json({ role });
  });

  router.put('/roles/:id', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = db.roles.find((r) => r.id === req.params.id);
    if (!role) {
      res.status(404).json({ error: 'Role not found.' });
      return;
    }
    if (req.body.name) role.name = req.body.name;
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.permissions) role.permissions = req.body.permissions;
    addAuditLog(db, req.authUser!, 'UPDATE_ROLE_PERMISSIONS', 'Role', role.id, `Updated permissions for ${role.name}`);
    saveDb(db);
    res.json({ role });
  });

  // System Config & Audit Logs & Backups
  router.get('/system/config', requireRoles('super_admin', 'hospital_admin'), (_req, res) => {
    const db = getDb();
    res.json({ systemConfig: db.systemConfig });
  });

  router.put('/system/config', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    Object.assign(db.systemConfig, req.body);
    addAuditLog(db, req.authUser!, 'UPDATE_SYSTEM_CONFIG', 'SystemConfig', 'global', 'Updated system configuration');
    saveDb(db);
    res.json({ systemConfig: db.systemConfig });
  });

  router.get('/system/logs', requireRoles('super_admin', 'hospital_admin'), (_req, res) => {
    const db = getDb();
    res.json({ logs: db.auditLogs });
  });

  router.post('/system/backup', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    db.systemConfig.lastBackupAt = new Date().toISOString();
    addAuditLog(db, req.authUser!, 'SYSTEM_BACKUP', 'System', 'backup', 'Triggered full database backup snapshot');
    saveDb(db);
    res.json({
      lastBackupAt: db.systemConfig.lastBackupAt,
      snapshot: {
        exportedAt: db.systemConfig.lastBackupAt,
        counts: {
          hospitals: db.hospitals.length,
          users: db.users.length,
          patients: db.patients.length,
          appointments: db.appointments.length,
          bills: db.bills.length,
        },
      },
    });
  });

  // =========================================================================
  // 5. DEPARTMENTS, DOCTORS & STAFF
  // =========================================================================

  router.get('/departments', (_req, res) => {
    const db = getDb();
    res.json({ departments: db.departments });
  });

  router.post('/departments', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { hospitalId, code, name, headDoctorId, description, floor } = req.body;
    if (!code || !name) {
      res.status(400).json({ error: 'Department code and name are required.' });
      return;
    }
    const db = getDb();
    const dept: Department = {
      id: `dept-${crypto.randomUUID().slice(0, 6)}`,
      hospitalId: hospitalId || db.hospitals[0]?.id || 'hosp-1',
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      headDoctorId,
      description: description || '',
      floor: floor || '1st Floor',
      active: true,
    };
    db.departments.push(dept);
    addAuditLog(db, req.authUser!, 'CREATE_DEPARTMENT', 'Department', dept.id, `Created department ${dept.name}`);
    saveDb(db);
    res.status(201).json({ department: dept });
  });

  router.put('/departments/:id', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const dept = db.departments.find((d) => d.id === req.params.id);
    if (!dept) {
      res.status(404).json({ error: 'Department not found.' });
      return;
    }
    Object.assign(dept, req.body, { id: dept.id });
    addAuditLog(db, req.authUser!, 'UPDATE_DEPARTMENT', 'Department', dept.id, `Updated department ${dept.name}`);
    saveDb(db);
    res.json({ department: dept });
  });

  // Doctors
  router.get('/doctors', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const isAdmin = req.authUser ? ['super_admin', 'hospital_admin'].includes(req.authUser.role) : false;
    const enriched = db.doctors.map((d) => {
      const linkedUser = db.users.find((u) => u.id === d.userId);
      return {
        ...d,
        departmentName: db.departments.find((dep) => dep.id === d.departmentId)?.name || '',
        appointmentsCount: db.appointments.filter((a) => a.doctorId === d.id).length,
        completedCount: db.appointments.filter((a) => a.doctorId === d.id && a.status === 'Completed').length,
        ...(isAdmin && linkedUser
          ? {
              loginEmail: linkedUser.email,
              loginUsername: linkedUser.username,
              employeeId: linkedUser.employeeOrPatientId,
              accountActive: linkedUser.active,
            }
          : {}),
      };
    });
    res.json({ doctors: enriched });
  });

  router.post('/doctors', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { fullName, email, username, phone, password, departmentId, specialization, qualifications, consultationFee, hospitalId } = req.body;
    if (!fullName || !departmentId || !specialization || !email || !password) {
      res.status(400).json({ error: 'Doctor full name, department, specialization, login email, and password are required.' });
      return;
    }
    const db = getDb();
    const minPwd = db.systemConfig.passwordMinLength || 8;
    if (String(password).length < minPwd) {
      res.status(400).json({ error: `Doctor login password must be at least ${minPwd} characters.` });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const baseUname = (String(username || '').trim() || cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/gi, '') || 'doctor').toLowerCase();
    if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'An account with this login email already exists.' });
      return;
    }
    if (username && String(username).trim() && db.users.some((u) => u.username.toLowerCase() === baseUname)) {
      res.status(409).json({ error: 'This username is already taken by another user.' });
      return;
    }
    let uname = baseUname;
    while (db.users.some((u) => u.username.toLowerCase() === uname)) {
      uname = `${baseUname}${crypto.randomInt(10, 99)}`;
    }

    const userId = `usr-${crypto.randomUUID().slice(0, 6)}`;
    const employeeId = `EMP-DR-${crypto.randomInt(200, 999)}`;
    const resolvedHospitalId = hospitalId || db.hospitals[0]?.id || 'hosp-1';
    db.users.push({
      id: userId,
      username: uname,
      email: String(email).trim(),
      fullName: String(fullName).trim(),
      role: 'doctor',
      hospitalId: resolvedHospitalId,
      departmentId,
      designation: String(specialization).trim(),
      employeeOrPatientId: employeeId,
      phone: phone ? String(phone).trim() : '+91 98450 00000',
      address: 'CarePlus Faculty Quarters',
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(String(password)),
    });
    const doc: DoctorProfile = {
      id: `doc-${crypto.randomUUID().slice(0, 6)}`,
      userId,
      hospitalId: resolvedHospitalId,
      departmentId,
      fullName: String(fullName).trim(),
      specialization: String(specialization).trim(),
      qualifications: qualifications || 'MBBS, MD',
      consultationFee: Number(consultationFee || 1000),
      available: true,
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      schedule: {
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        startTime: '09:00',
        endTime: '17:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        slotDurationMinutes: 30,
      },
      leaveRequests: [],
    };
    db.doctors.push(doc);
    addAuditLog(db, req.authUser!, 'CREATE_DOCTOR', 'Doctor', doc.id, `Added doctor ${doc.fullName} with separate login ${uname}`);
    saveDb(db);
    res.status(201).json({
      doctor: doc,
      loginCredentials: {
        email: String(email).trim(),
        username: uname,
        employeeId,
      },
    });
  });

  router.put('/doctors/:id', requireRoles('super_admin', 'hospital_admin', 'doctor'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const doc = db.doctors.find((d) => d.id === req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }
    if (req.authUser!.role === 'doctor' && doc.userId !== req.authUser!.id) {
      res.status(403).json({ error: 'Doctors may only update their own profile or schedule.' });
      return;
    }
    const { fullName, specialization, qualifications, consultationFee, available, departmentId, schedule, leaveRequest, accountActive, resetPasswordTo, email, phone } = req.body;
    const linkedUser = db.users.find((u) => u.id === doc.userId);
    const isAdmin = ['super_admin', 'hospital_admin'].includes(req.authUser!.role);

    if (resetPasswordTo !== undefined && isAdmin) {
      const minPwd = db.systemConfig.passwordMinLength || 8;
      if (String(resetPasswordTo).length < minPwd) {
        res.status(400).json({ error: `Password must be at least ${minPwd} characters.` });
        return;
      }
      if (linkedUser) linkedUser.passwordHash = hashPassword(String(resetPasswordTo));
    }
    if (accountActive !== undefined && isAdmin && linkedUser) {
      linkedUser.active = Boolean(accountActive);
    }
    if (email !== undefined && isAdmin && linkedUser) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (db.users.some((u) => u.id !== linkedUser.id && u.email.toLowerCase() === cleanEmail)) {
        res.status(409).json({ error: 'Email already used by another account.' });
        return;
      }
      linkedUser.email = String(email).trim();
    }
    if (phone !== undefined && isAdmin && linkedUser) {
      linkedUser.phone = String(phone).trim();
    }
    if (fullName !== undefined) {
      doc.fullName = fullName;
      if (linkedUser) linkedUser.fullName = fullName;
    }
    if (specialization !== undefined) {
      doc.specialization = specialization;
      if (linkedUser) linkedUser.designation = specialization;
    }
    if (qualifications !== undefined) doc.qualifications = qualifications;
    if (consultationFee !== undefined) doc.consultationFee = Number(consultationFee);
    if (available !== undefined) doc.available = Boolean(available);
    if (departmentId !== undefined) {
      doc.departmentId = departmentId;
      if (linkedUser) linkedUser.departmentId = departmentId;
    }
    if (schedule) doc.schedule = { ...doc.schedule, ...schedule };
    if (leaveRequest) {
      doc.leaveRequests.push({
        id: `lv-${crypto.randomUUID().slice(0, 6)}`,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        reason: leaveRequest.reason,
        status: 'Pending',
      });
    }
    addAuditLog(db, req.authUser!, 'UPDATE_DOCTOR', 'Doctor', doc.id, `Updated doctor ${doc.fullName}`);
    saveDb(db);
    broadcastEvent('queue:updated', { reason: 'doctor_availability' });
    res.json({ doctor: doc });
  });

  // Staff
  router.get('/staff', requireRoles('super_admin', 'hospital_admin', 'nurse'), (_req, res) => {
    const db = getDb();
    res.json({ staff: db.staff });
  });

  router.post('/staff', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { fullName, role, departmentId, designation, shift, phone, email } = req.body;
    if (!fullName || !role || !departmentId) {
      res.status(400).json({ error: 'Full name, role, and department are required.' });
      return;
    }
    const db = getDb();
    const userId = `usr-${crypto.randomUUID().slice(0, 6)}`;
    const uname = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.').slice(0, 14) + crypto.randomInt(10, 99);
    db.users.push({
      id: userId,
      username: uname,
      email: email || `${uname}@careplus.org`,
      fullName,
      role,
      hospitalId: db.hospitals[0]?.id || 'hosp-1',
      departmentId,
      designation: designation || role,
      employeeOrPatientId: `EMP-${crypto.randomInt(300, 999)}`,
      phone: phone || '',
      address: '',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: true, system: true },
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword('CarePlus@2026'),
    });
    const stf: StaffProfile = {
      id: `stf-${crypto.randomUUID().slice(0, 6)}`,
      userId,
      hospitalId: db.hospitals[0]?.id || 'hosp-1',
      departmentId,
      fullName,
      role,
      designation: designation || role,
      shift: shift || 'Morning (07:00 - 15:00)',
      available: true,
      phone: phone || '',
    };
    db.staff.push(stf);
    addAuditLog(db, req.authUser!, 'CREATE_STAFF', 'Staff', stf.id, `Added staff ${stf.fullName}`);
    saveDb(db);
    res.status(201).json({ staff: stf });
  });

  router.put('/staff/:id', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const stf = db.staff.find((s) => s.id === req.params.id);
    if (!stf) {
      res.status(404).json({ error: 'Staff record not found.' });
      return;
    }
    Object.assign(stf, req.body, { id: stf.id });
    addAuditLog(db, req.authUser!, 'UPDATE_STAFF', 'Staff', stf.id, `Updated staff ${stf.fullName}`);
    saveDb(db);
    res.json({ staff: stf });
  });

  // =========================================================================
  // 6. PATIENTS & EMR
  // =========================================================================

  router.get('/patients', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.authUser!.role;
    const search = String(req.query.q || '').trim().toLowerCase();

    let list = db.patients;
    if (role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((p) => p.id === pid);
    } else if (role === 'doctor') {
      list = list.filter((p) => canAccessPatient(req, p.id));
    } else if (role === 'nurse') {
      // Nurses see admitted patients and ward-assigned patients
      list = list.filter((p) => p.status === 'Admitted' || p.assignedNurseId === req.authUser!.id);
    }

    if (search) {
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(search) ||
          p.patientCode.toLowerCase().includes(search) ||
          p.phone.toLowerCase().includes(search),
      );
    }
    res.json({ patients: list });
  });

  router.get('/patients/:id/emr', (req: AuthenticatedRequest, res) => {
    if (!canAccessPatient(req, req.params.id)) {
      res.status(403).json({ error: 'Access denied to this patient record.' });
      return;
    }
    const db = getDb();
    const patient = db.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    res.json({
      patient,
      consultations: db.consultations.filter((c) => c.patientId === patient.id),
      vitals: db.vitals.filter((v) => v.patientId === patient.id),
      medicationsAdmin: db.medicationsAdmin.filter((m) => m.patientId === patient.id),
      nursingNotes: db.nursingNotes.filter((n) => n.patientId === patient.id),
      prescriptions: db.prescriptions.filter((p) => p.patientId === patient.id),
      labRequests: db.labRequests.filter((l) => l.patientId === patient.id),
      appointments: db.appointments.filter((a) => a.patientId === patient.id),
      dischargeRequests: db.dischargeRequests.filter((d) => d.patientId === patient.id),
      bed: patient.bedId ? db.beds.find((b) => b.id === patient.bedId) || null : null,
    });
  });

  router.post('/patients', requireRoles('super_admin', 'hospital_admin', 'receptionist'), (req: AuthenticatedRequest, res) => {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      email,
      address,
      emergencyContact,
      bloodGroup,
      allergies,
      existingConditions,
      hospitalId,
    } = req.body;
    if (!fullName || !dateOfBirth || !gender || !phone) {
      res.status(400).json({ error: 'Full name, date of birth, gender, and phone are required.' });
      return;
    }
    const db = getDb();
    const patientCode = nextCode(db, 'patient', 'CP-PT');
    const patientId = `pat-${crypto.randomUUID().slice(0, 6)}`;
    const patient: Patient = {
      id: patientId,
      patientCode,
      hospitalId: hospitalId || db.hospitals[0]?.id || 'hosp-1',
      fullName: String(fullName).trim(),
      dateOfBirth,
      gender,
      phone: String(phone).trim(),
      email: String(email || '').trim(),
      address: String(address || '').trim(),
      emergencyContact: String(emergencyContact || '').trim(),
      bloodGroup: bloodGroup || 'O+',
      allergies: Array.isArray(allergies) ? allergies : [],
      existingConditions: Array.isArray(existingConditions) ? existingConditions : [],
      status: 'Outpatient',
      registeredAt: new Date().toISOString(),
    };
    db.patients.unshift(patient);
    addNotification(db, {
      roleTarget: ['hospital_admin', 'receptionist'],
      type: 'registration',
      title: `New Patient Registered: ${patient.fullName}`,
      message: `Assigned unique Patient ID ${patient.patientCode}.`,
    });
    addAuditLog(db, req.authUser!, 'REGISTER_PATIENT', 'Patient', patient.patientCode, `Registered ${patient.fullName}`);
    saveDb(db);
    broadcastEvent('notification:created', { title: `Registered ${patient.fullName}` });
    res.status(201).json({ patient });
  });

  router.put('/patients/:id', requireRoles('super_admin', 'hospital_admin', 'receptionist', 'doctor', 'nurse'), (req: AuthenticatedRequest, res) => {
    if (!canAccessPatient(req, req.params.id)) {
      res.status(403).json({ error: 'Not authorized to update this patient.' });
      return;
    }
    const db = getDb();
    const patient = db.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const updatable = ['fullName', 'dateOfBirth', 'gender', 'phone', 'email', 'address', 'emergencyContact', 'bloodGroup', 'allergies', 'existingConditions', 'status', 'assignedDoctorId', 'assignedNurseId', 'admissionNotes'];
    for (const key of updatable) {
      if (req.body[key] !== undefined) {
        (patient as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    addAuditLog(db, req.authUser!, 'UPDATE_PATIENT', 'Patient', patient.patientCode, `Updated patient ${patient.fullName}`);
    saveDb(db);
    res.json({ patient });
  });

  // =========================================================================
  // 7. APPOINTMENTS & DOUBLE-BOOKING PREVENTION
  // =========================================================================

  router.get('/appointments/slots', (req, res) => {
    const { doctorId, date } = req.query as { doctorId?: string; date?: string };
    if (!doctorId || !date) {
      res.status(400).json({ error: 'doctorId and date are required.' });
      return;
    }
    const db = getDb();
    const doctor = db.doctors.find((d) => d.id === doctorId);
    if (!doctor) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }
    // Generate 30-min slots between doctor's startTime and endTime excluding break
    const toMins = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

    const start = toMins(doctor.schedule.startTime || '09:00');
    const end = toMins(doctor.schedule.endTime || '17:00');
    const brkStart = toMins(doctor.schedule.breakStart || '13:00');
    const brkEnd = toMins(doctor.schedule.breakEnd || '14:00');
    const step = doctor.schedule.slotDurationMinutes || 30;

    const booked = new Set(
      db.appointments
        .filter((a) => a.doctorId === doctorId && a.date === date && a.status !== 'Cancelled')
        .map((a) => a.timeSlot),
    );

    const slots: Array<{ timeSlot: string; available: boolean }> = [];
    for (let t = start; t < end; t += step) {
      if (t >= brkStart && t < brkEnd) continue;
      const label = toHHMM(t);
      slots.push({ timeSlot: label, available: !booked.has(label) });
    }
    res.json({ slots });
  });

  router.get('/appointments', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.authUser!.role;
    let list = db.appointments;
    if (role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((a) => a.patientId === pid);
    } else if (role === 'doctor') {
      const doc = getDoctorForUser(req.authUser!.id);
      list = doc ? list.filter((a) => a.doctorId === doc.id) : [];
    }
    const enriched = list.map((a) => ({
      ...a,
      patientName: db.patients.find((p) => p.id === a.patientId)?.fullName || '',
      patientCode: db.patients.find((p) => p.id === a.patientId)?.patientCode || '',
      doctorName: db.doctors.find((d) => d.id === a.doctorId)?.fullName || '',
      departmentName: db.departments.find((d) => d.id === a.departmentId)?.name || '',
      queueToken: db.queueTokens.find((q) => q.appointmentId === a.id)?.tokenNumber || null,
    }));
    res.json({ appointments: enriched });
  });

  router.post('/appointments', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authUser!;
    let { patientId, departmentId, doctorId, date, timeSlot, reason } = req.body;

    if (user.role === 'patient') {
      patientId = getPatientIdForUser(user.id);
    }
    if (!patientId || !departmentId || !doctorId || !date || !timeSlot) {
      res.status(400).json({ error: 'Patient, department, doctor, date, and time slot are required.' });
      return;
    }

    // Prevent double booking on the same doctor, date, and timeSlot
    const conflict = db.appointments.find(
      (a) => a.doctorId === doctorId && a.date === date && a.timeSlot === timeSlot && a.status !== 'Cancelled',
    );
    if (conflict) {
      res.status(409).json({ error: `Time slot ${timeSlot} on ${date} is already booked for this doctor.` });
      return;
    }

    const apt: Appointment = {
      id: `apt-${crypto.randomUUID().slice(0, 6)}`,
      appointmentNumber: nextCode(db, 'appointment', 'CP-APT'),
      hospitalId: db.hospitals[0]?.id || 'hosp-1',
      patientId,
      departmentId,
      doctorId,
      date,
      timeSlot,
      reason: String(reason || 'General clinical consultation').trim(),
      status: user.role === 'patient' ? 'Pending' : 'Approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.appointments.unshift(apt);

    const patient = db.patients.find((p) => p.id === patientId);
    const doctor = db.doctors.find((d) => d.id === doctorId);
    if (patient && !patient.assignedDoctorId) {
      patient.assignedDoctorId = doctorId;
    }

    addNotification(db, {
      roleTarget: ['receptionist'],
      type: 'appointment',
      title: `Appointment ${apt.appointmentNumber}`,
      message: `${patient?.fullName || 'Patient'} booked with ${doctor?.fullName || 'Doctor'} on ${date} at ${timeSlot}.`,
    });
    if (doctor?.userId) {
      addNotification(db, {
        userId: doctor.userId,
        type: 'appointment',
        title: `Appointment ${apt.appointmentNumber}`,
        message: `${patient?.fullName || 'Patient'} booked on ${date} at ${timeSlot}.`,
      });
    }
    addAuditLog(db, user, 'BOOK_APPOINTMENT', 'Appointment', apt.appointmentNumber, `Booked ${date} ${timeSlot}`);
    saveDb(db);
    broadcastEvent('appointment:updated', apt);
    res.status(201).json({ appointment: apt });
  });

  router.put('/appointments/:id', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const apt = db.appointments.find((a) => a.id === req.params.id);
    if (!apt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    if (req.authUser!.role === 'patient' && apt.patientId !== getPatientIdForUser(req.authUser!.id)) {
      res.status(403).json({ error: 'Cannot modify another patient’s appointment.' });
      return;
    }
    if (req.authUser!.role === 'doctor' && apt.doctorId !== getDoctorForUser(req.authUser!.id)?.id) {
      res.status(403).json({ error: 'Doctors may only update their own appointments.' });
      return;
    }
    const { status, date, timeSlot, reason } = req.body;
    if (date && timeSlot && (date !== apt.date || timeSlot !== apt.timeSlot)) {
      const conflict = db.appointments.find(
        (a) => a.id !== apt.id && a.doctorId === apt.doctorId && a.date === date && a.timeSlot === timeSlot && a.status !== 'Cancelled',
      );
      if (conflict) {
        res.status(409).json({ error: `Slot ${timeSlot} on ${date} is already booked.` });
        return;
      }
      apt.date = date;
      apt.timeSlot = timeSlot;
    }
    if (status) apt.status = status;
    if (reason !== undefined) apt.reason = reason;
    apt.updatedAt = new Date().toISOString();

    if (status === 'Cancelled') {
      const token = db.queueTokens.find((q) => q.appointmentId === apt.id);
      if (token) token.status = 'Cancelled';
    }

    addAuditLog(db, req.authUser!, 'UPDATE_APPOINTMENT', 'Appointment', apt.appointmentNumber, `Status=${apt.status}`);
    saveDb(db);
    broadcastEvent('appointment:updated', apt);
    broadcastEvent('queue:updated', { appointmentId: apt.id });
    res.json({ appointment: apt });
  });

  // Check-in -> generates unique Queue Token & notifies department
  router.post('/appointments/:id/checkin', requireRoles('super_admin', 'hospital_admin', 'receptionist'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const apt = db.appointments.find((a) => a.id === req.params.id);
    if (!apt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    const existing = db.queueTokens.find((q) => q.appointmentId === apt.id && q.status !== 'Cancelled');
    if (existing) {
      res.json({ appointment: apt, queueToken: existing });
      return;
    }
    apt.status = 'Checked-In';
    apt.updatedAt = new Date().toISOString();

    const waitingForDoc = db.queueTokens.filter((q) => q.doctorId === apt.doctorId && q.status === 'Waiting').length;
    const token: QueueToken = {
      id: `q-${crypto.randomUUID().slice(0, 6)}`,
      tokenNumber: nextCode(db, 'token', 'T'),
      hospitalId: apt.hospitalId,
      appointmentId: apt.id,
      patientId: apt.patientId,
      doctorId: apt.doctorId,
      departmentId: apt.departmentId,
      status: 'Waiting',
      estimatedWaitMinutes: (waitingForDoc + 1) * 15,
      checkInTime: new Date().toISOString(),
    };
    db.queueTokens.push(token);

    const pat = db.patients.find((p) => p.id === apt.patientId);
    const dept = db.departments.find((d) => d.id === apt.departmentId);
    const doc = db.doctors.find((d) => d.id === apt.doctorId);
    addNotification(db, {
      roleTarget: ['receptionist'],
      type: 'appointment',
      title: `Checked-In: ${pat?.fullName || 'Patient'} (${token.tokenNumber})`,
      message: `Waiting in ${dept?.name || 'Outpatient'} queue.`,
    });
    if (doc?.userId) {
      addNotification(db, {
        userId: doc.userId,
        type: 'appointment',
        title: `Patient Checked-In: ${pat?.fullName || 'Patient'} (${token.tokenNumber})`,
        message: `Ready in ${dept?.name || 'Outpatient'} queue.`,
      });
    }
    addAuditLog(db, req.authUser!, 'CHECK_IN', 'QueueToken', token.tokenNumber, `Checked in ${pat?.patientCode}`);
    saveDb(db);
    broadcastEvent('queue:updated', token);
    broadcastEvent('appointment:updated', apt);
    res.status(201).json({ appointment: apt, queueToken: token });
  });

  // =========================================================================
  // 8. QUEUE MANAGEMENT SYSTEM
  // =========================================================================

  router.get('/queue', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    let list = db.queueTokens;
    if (req.authUser!.role === 'doctor') {
      const doc = getDoctorForUser(req.authUser!.id);
      list = doc ? list.filter((q) => q.doctorId === doc.id) : [];
    } else if (req.authUser!.role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((q) => q.patientId === pid);
    }
    const enriched = list.map((q) => ({
      ...q,
      patientName: db.patients.find((p) => p.id === q.patientId)?.fullName || '',
      patientCode: db.patients.find((p) => p.id === q.patientId)?.patientCode || '',
      doctorName: db.doctors.find((d) => d.id === q.doctorId)?.fullName || '',
      departmentName: db.departments.find((d) => d.id === q.departmentId)?.name || '',
    }));
    res.json({ queue: enriched });
  });

  router.post('/queue/:id/action', requireRoles('super_admin', 'hospital_admin', 'receptionist', 'doctor'), (req: AuthenticatedRequest, res) => {
    const { action } = req.body as { action?: 'call' | 'start' | 'complete' | 'skip' | 'recall' | 'cancel' };
    const db = getDb();
    const token = db.queueTokens.find((q) => q.id === req.params.id);
    if (!token) {
      res.status(404).json({ error: 'Queue token not found.' });
      return;
    }
    if (req.authUser!.role === 'doctor' && token.doctorId !== getDoctorForUser(req.authUser!.id)?.id) {
      res.status(403).json({ error: 'Doctors may only manage tokens in their own queue.' });
      return;
    }
    const apt = db.appointments.find((a) => a.id === token.appointmentId);

    if (action === 'call' || action === 'recall') {
      token.status = 'Called';
      token.calledTime = new Date().toISOString();
      token.estimatedWaitMinutes = 0;
    } else if (action === 'start') {
      token.status = 'In Consultation';
      token.calledTime = token.calledTime || new Date().toISOString();
      token.estimatedWaitMinutes = 0;
      if (apt) apt.status = 'In Consultation';
    } else if (action === 'complete') {
      token.status = 'Completed';
      token.completedTime = new Date().toISOString();
      if (apt) apt.status = 'Completed';
    } else if (action === 'skip') {
      token.status = 'Skipped';
    } else if (action === 'cancel') {
      token.status = 'Cancelled';
      if (apt) apt.status = 'Cancelled';
    } else {
      res.status(400).json({ error: 'Invalid queue action.' });
      return;
    }

    // Recalculate estimated wait times for waiting tokens of same doctor
    let waitIdx = 1;
    db.queueTokens
      .filter((q) => q.doctorId === token.doctorId && q.status === 'Waiting')
      .forEach((q) => {
        q.estimatedWaitMinutes = waitIdx * 15;
        waitIdx += 1;
      });

    addAuditLog(db, req.authUser!, `QUEUE_${action.toUpperCase()}`, 'QueueToken', token.tokenNumber, `Status=${token.status}`);
    saveDb(db);
    broadcastEvent('queue:updated', token);
    if (apt) broadcastEvent('appointment:updated', apt);
    res.json({ queueToken: token });
  });

  // =========================================================================
  // 9. DOCTOR CONSULTATIONS, NURSING & ADMISSION/DISCHARGE
  // =========================================================================

  router.get('/consultations', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    let list = db.consultations;
    if (req.authUser!.role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((c) => c.patientId === pid);
    } else if (req.authUser!.role === 'doctor') {
      const doc = getDoctorForUser(req.authUser!.id);
      list = doc ? list.filter((c) => c.doctorId === doc.id || canAccessPatient(req, c.patientId)) : [];
    }
    res.json({ consultations: list });
  });

  router.post('/consultations', requireRoles('doctor', 'super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const doc = getDoctorForUser(req.authUser!.id);
    const {
      patientId,
      appointmentId,
      complaints,
      symptoms,
      vitalSigns,
      physicalExam,
      diagnosis,
      treatmentPlan,
      doctorNotes,
      followUpDate,
    } = req.body;
    if (!patientId || !complaints || !diagnosis) {
      res.status(400).json({ error: 'Patient, complaints, and diagnosis are required.' });
      return;
    }
    const consultation: Consultation = {
      id: `cons-${crypto.randomUUID().slice(0, 6)}`,
      patientId,
      appointmentId,
      doctorId: doc?.id || req.body.doctorId || 'doc-1',
      date: new Date().toISOString().slice(0, 10),
      complaints,
      symptoms: symptoms || '',
      vitalSigns: vitalSigns || { bloodPressure: '120/80 mmHg', temperature: '98.6 °F', pulseRate: '76 bpm', respiratoryRate: '16 /min', oxygenSaturation: '99%' },
      physicalExam: physicalExam || '',
      diagnosis,
      treatmentPlan: treatmentPlan || '',
      doctorNotes: doctorNotes || '',
      followUpDate,
      createdAt: new Date().toISOString(),
    };
    db.consultations.unshift(consultation);

    if (appointmentId) {
      const apt = db.appointments.find((a) => a.id === appointmentId);
      if (apt) {
        apt.status = 'Completed';
        apt.updatedAt = new Date().toISOString();
      }
      const q = db.queueTokens.find((t) => t.appointmentId === appointmentId);
      if (q) {
        q.status = 'Completed';
        q.completedTime = new Date().toISOString();
      }
    }

    // Automatically generate consultation bill if linked to doctor fee and not already billed
    const doctorObj = db.doctors.find((d) => d.id === consultation.doctorId);
    if (doctorObj) {
      const billItem: BillLineItem = {
        id: `bi-${crypto.randomUUID().slice(0, 6)}`,
        category: 'Consultation',
        description: `Consultation — ${doctorObj.fullName} (${consultation.diagnosis.slice(0, 36)})`,
        qty: 1,
        unitPrice: doctorObj.consultationFee,
        total: doctorObj.consultationFee,
      };
      const bill: Bill = {
        id: `bill-${crypto.randomUUID().slice(0, 6)}`,
        billNumber: nextCode(db, 'bill', 'INV'),
        hospitalId: doctorObj.hospitalId,
        patientId,
        date: new Date().toISOString().slice(0, 10),
        items: [billItem],
        subtotal: 0,
        discount: 0,
        tax: 0,
        totalAmount: 0,
        paidAmount: 0,
        status: 'Pending',
        createdBy: req.authUser!.fullName,
      };
      recalculateBillTotals(bill, db.systemConfig.defaultTaxRate);
      db.bills.unshift(bill);
    }

    addAuditLog(db, req.authUser!, 'CREATE_CONSULTATION', 'Consultation', consultation.id, `Recorded diagnosis for patient ${patientId}`);
    saveDb(db);
    broadcastEvent('queue:updated', { reason: 'consultation_completed' });
    broadcastEvent('bill:updated', { patientId });
    res.status(201).json({ consultation });
  });

  // Nursing: Vitals, MAR, Nursing Notes, Admission & Discharge
  router.get('/nursing/overview', requireRoles('nurse', 'doctor', 'hospital_admin', 'super_admin', 'receptionist'), (_req, res) => {
    const db = getDb();
    res.json({
      vitals: db.vitals,
      medicationsAdmin: db.medicationsAdmin,
      nursingNotes: db.nursingNotes,
      dischargeRequests: db.dischargeRequests,
    });
  });

  router.post('/nursing/vitals', requireRoles('nurse', 'doctor'), (req: AuthenticatedRequest, res) => {
    const { patientId, bloodPressure, temperature, pulseRate, respiratoryRate, oxygenSaturation, notes } = req.body;
    if (!patientId || !bloodPressure || !temperature || !pulseRate) {
      res.status(400).json({ error: 'Patient and core vital signs are required.' });
      return;
    }
    const db = getDb();
    const record: VitalRecord = {
      id: `vit-${crypto.randomUUID().slice(0, 6)}`,
      patientId,
      recordedBy: req.authUser!.id,
      recordedByName: req.authUser!.fullName,
      recordedAt: new Date().toISOString(),
      bloodPressure,
      temperature,
      pulseRate,
      respiratoryRate: respiratoryRate || '16 /min',
      oxygenSaturation: oxygenSaturation || '98%',
      notes,
    };
    db.vitals.unshift(record);
    addAuditLog(db, req.authUser!, 'RECORD_VITALS', 'Patient', patientId, `BP ${bloodPressure}, HR ${pulseRate}`);
    saveDb(db);
    res.status(201).json({ vital: record });
  });

  router.post('/nursing/medications', requireRoles('nurse', 'doctor'), (req: AuthenticatedRequest, res) => {
    const { patientId, medicineName, dosage, scheduledTime, notes } = req.body;
    if (!patientId || !medicineName) {
      res.status(400).json({ error: 'Patient and medicine name are required.' });
      return;
    }
    const db = getDb();
    const mar: MedicationAdminRecord = {
      id: `mar-${crypto.randomUUID().slice(0, 6)}`,
      patientId,
      medicineName,
      dosage: dosage || 'Standard dose',
      scheduledTime: scheduledTime || new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'Scheduled',
      notes,
    };
    db.medicationsAdmin.unshift(mar);
    saveDb(db);
    res.status(201).json({ medication: mar });
  });

  router.put('/nursing/medications/:id', requireRoles('nurse'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const mar = db.medicationsAdmin.find((m) => m.id === req.params.id);
    if (!mar) {
      res.status(404).json({ error: 'Medication schedule item not found.' });
      return;
    }
    mar.status = req.body.status || 'Administered';
    mar.administeredBy = req.authUser!.fullName;
    mar.administeredAt = new Date().toISOString();
    if (req.body.notes !== undefined) mar.notes = req.body.notes;
    addAuditLog(db, req.authUser!, 'MAR_UPDATE', 'Medication', mar.id, `${mar.medicineName} -> ${mar.status}`);
    saveDb(db);
    res.json({ medication: mar });
  });

  router.post('/nursing/notes', requireRoles('nurse'), (req: AuthenticatedRequest, res) => {
    const { patientId, condition, observation, progressNote, escalated } = req.body;
    if (!patientId || !observation) {
      res.status(400).json({ error: 'Patient and observation are required.' });
      return;
    }
    const db = getDb();
    const note: NursingNote = {
      id: `nn-${crypto.randomUUID().slice(0, 6)}`,
      patientId,
      nurseId: req.authUser!.id,
      nurseName: req.authUser!.fullName,
      condition: condition || 'Stable',
      observation,
      progressNote: progressNote || '',
      escalated: Boolean(escalated),
      createdAt: new Date().toISOString(),
    };
    db.nursingNotes.unshift(note);
    if (note.escalated) {
      const pat = db.patients.find((p) => p.id === patientId);
      const assignedDoc = pat?.assignedDoctorId ? db.doctors.find((d) => d.id === pat.assignedDoctorId) : undefined;
      addNotification(db, {
        roleTarget: ['hospital_admin'],
        type: 'system',
        title: `Clinical Escalation Alert: ${pat?.fullName || patientId}`,
        message: observation,
      });
      if (assignedDoc?.userId) {
        addNotification(db, {
          userId: assignedDoc.userId,
          type: 'system',
          title: `Clinical Escalation Alert: ${pat?.fullName || patientId}`,
          message: observation,
        });
      }
    }
    addAuditLog(db, req.authUser!, 'NURSING_NOTE', 'Patient', patientId, `Condition=${note.condition}, Escalated=${note.escalated}`);
    saveDb(db);
    res.status(201).json({ note });
  });

  // Admission & Discharge workflow
  router.post('/patients/:id/admit', requireRoles('doctor', 'hospital_admin', 'super_admin', 'nurse'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const patient = db.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }
    const { bedId, admissionNotes } = req.body;
    if (bedId) {
      const bed = db.beds.find((b) => b.id === bedId);
      if (!bed || bed.status !== 'Available') {
        res.status(400).json({ error: 'Selected bed is not available.' });
        return;
      }
      if (patient.bedId) {
        const oldBed = db.beds.find((b) => b.id === patient.bedId);
        if (oldBed) {
          oldBed.status = 'Available';
          oldBed.patientId = undefined;
        }
      }
      bed.status = 'Occupied';
      bed.patientId = patient.id;
      bed.assignedAt = new Date().toISOString();
      patient.bedId = bed.id;
    }
    patient.status = 'Admitted';
    patient.admissionDate = new Date().toISOString();
    patient.admissionNotes = admissionNotes || patient.admissionNotes;
    addAuditLog(db, req.authUser!, 'ADMIT_PATIENT', 'Patient', patient.patientCode, `Admitted to bed ${patient.bedId || 'pending'}`);
    saveDb(db);
    broadcastEvent('bed:updated', { patientId: patient.id });
    res.json({ patient });
  });

  router.post('/discharge-requests', requireRoles('doctor', 'hospital_admin', 'super_admin'), (req: AuthenticatedRequest, res) => {
    const { patientId, dischargeSummary, treatmentInstructions } = req.body;
    if (!patientId || !dischargeSummary) {
      res.status(400).json({ error: 'Patient and discharge summary are required.' });
      return;
    }
    const db = getDb();
    const doc = getDoctorForUser(req.authUser!.id);
    const reqItem: DischargeRequest = {
      id: `dis-${crypto.randomUUID().slice(0, 6)}`,
      patientId,
      doctorId: doc?.id || 'doc-1',
      dischargeSummary,
      treatmentInstructions: treatmentInstructions || '',
      billingCleared: false,
      nursingChecklistDone: false,
      status: 'Requested',
      createdAt: new Date().toISOString(),
    };
    db.dischargeRequests.unshift(reqItem);
    const pat = db.patients.find((p) => p.id === patientId);
    addNotification(db, {
      roleTarget: ['nurse', 'receptionist', 'accountant'],
      type: 'system',
      title: `Discharge Initiated: ${pat?.fullName || patientId}`,
      message: 'Please complete nursing checklist and billing clearance.',
    });
    addAuditLog(db, req.authUser!, 'REQUEST_DISCHARGE', 'Patient', patientId, 'Initiated discharge summary');
    saveDb(db);
    res.status(201).json({ dischargeRequest: reqItem });
  });

  router.put('/discharge-requests/:id', requireRoles('doctor', 'nurse', 'receptionist', 'accountant', 'hospital_admin', 'super_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const dr = db.dischargeRequests.find((d) => d.id === req.params.id);
    if (!dr) {
      res.status(404).json({ error: 'Discharge request not found.' });
      return;
    }
    if (req.body.nursingChecklistDone !== undefined) dr.nursingChecklistDone = Boolean(req.body.nursingChecklistDone);
    if (req.body.billingCleared !== undefined) dr.billingCleared = Boolean(req.body.billingCleared);
    if (req.body.status === 'Completed' || (dr.billingCleared && dr.nursingChecklistDone && req.body.finalize)) {
      dr.status = 'Completed';
      dr.completedAt = new Date().toISOString();
      const pat = db.patients.find((p) => p.id === dr.patientId);
      if (pat) {
        pat.status = 'Discharged';
        if (pat.bedId) {
          const bed = db.beds.find((b) => b.id === pat.bedId);
          if (bed) {
            bed.status = 'Available';
            bed.patientId = undefined;
            bed.assignedAt = undefined;
          }
          pat.bedId = undefined;
        }
      }
      broadcastEvent('bed:updated', { patientId: dr.patientId });
    } else if (dr.billingCleared && dr.nursingChecklistDone) {
      dr.status = 'Cleared';
    }
    addAuditLog(db, req.authUser!, 'UPDATE_DISCHARGE', 'DischargeRequest', dr.id, `Status=${dr.status}`);
    saveDb(db);
    res.json({ dischargeRequest: dr });
  });

  // =========================================================================
  // 10. BEDS & WARDS
  // =========================================================================

  router.get('/beds', (_req, res) => {
    const db = getDb();
    const enriched = db.beds.map((b) => ({
      ...b,
      patientName: b.patientId ? db.patients.find((p) => p.id === b.patientId)?.fullName || '' : null,
      patientCode: b.patientId ? db.patients.find((p) => p.id === b.patientId)?.patientCode || '' : null,
    }));
    res.json({ beds: enriched });
  });

  router.post('/beds', requireRoles('super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { bedNumber, wardName, wardType, dailyRate } = req.body;
    if (!bedNumber || !wardName || !wardType) {
      res.status(400).json({ error: 'Bed number, ward name, and ward type are required.' });
      return;
    }
    const db = getDb();
    const bed: Bed = {
      id: `bed-${crypto.randomUUID().slice(0, 6)}`,
      hospitalId: db.hospitals[0]?.id || 'hosp-1',
      bedNumber,
      wardName,
      wardType,
      dailyRate: Number(dailyRate || 2500),
      status: 'Available',
    };
    db.beds.push(bed);
    saveDb(db);
    res.status(201).json({ bed });
  });

  router.post('/beds/:id/assign', requireRoles('super_admin', 'hospital_admin', 'nurse', 'doctor'), (req: AuthenticatedRequest, res) => {
    const { patientId } = req.body as { patientId?: string };
    const db = getDb();
    const bed = db.beds.find((b) => b.id === req.params.id);
    if (!bed) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    if (patientId) {
      if (bed.status !== 'Available') {
        res.status(400).json({ error: 'Bed is currently not available.' });
        return;
      }
      const pat = db.patients.find((p) => p.id === patientId);
      if (!pat) {
        res.status(404).json({ error: 'Patient not found.' });
        return;
      }
      if (pat.bedId) {
        const prev = db.beds.find((b) => b.id === pat.bedId);
        if (prev) {
          prev.status = 'Available';
          prev.patientId = undefined;
        }
      }
      bed.status = 'Occupied';
      bed.patientId = pat.id;
      bed.assignedAt = new Date().toISOString();
      pat.bedId = bed.id;
      pat.status = 'Admitted';
      pat.admissionDate = pat.admissionDate || new Date().toISOString();
    } else {
      // Release bed
      if (bed.patientId) {
        const pat = db.patients.find((p) => p.id === bed.patientId);
        if (pat) pat.bedId = undefined;
      }
      bed.status = 'Available';
      bed.patientId = undefined;
      bed.assignedAt = undefined;
    }
    addAuditLog(db, req.authUser!, 'BED_ASSIGN', 'Bed', bed.bedNumber, patientId ? `Assigned to ${patientId}` : 'Released bed');
    saveDb(db);
    broadcastEvent('bed:updated', bed);
    res.json({ bed });
  });

  // =========================================================================
  // 11. PHARMACY & PRESCRIPTIONS
  // =========================================================================

  router.get('/pharmacy/medicines', (_req, res) => {
    const db = getDb();
    res.json({ medicines: db.medicines });
  });

  router.post('/pharmacy/medicines', requireRoles('super_admin', 'hospital_admin', 'pharmacist'), (req: AuthenticatedRequest, res) => {
    const { name, category, manufacturer, batchNumber, quantity, reorderLevel, expiryDate, purchasePrice, sellingPrice } = req.body;
    if (!name || !category || !expiryDate) {
      res.status(400).json({ error: 'Medicine name, category, and expiry date are required.' });
      return;
    }
    const db = getDb();
    const med: Medicine = {
      id: `med-${crypto.randomUUID().slice(0, 6)}`,
      medicineCode: nextCode(db, 'medicine', 'MED'),
      name,
      category,
      manufacturer: manufacturer || 'Standard Pharma',
      batchNumber: batchNumber || `B-${crypto.randomInt(1000, 9999)}`,
      quantity: Number(quantity || 0),
      reorderLevel: Number(reorderLevel || 30),
      expiryDate,
      purchasePrice: Number(purchasePrice || 0),
      sellingPrice: Number(sellingPrice || 0),
      updatedAt: new Date().toISOString(),
    };
    db.medicines.unshift(med);
    addAuditLog(db, req.authUser!, 'ADD_MEDICINE', 'Medicine', med.medicineCode, `Added ${med.name} qty=${med.quantity}`);
    saveDb(db);
    res.status(201).json({ medicine: med });
  });

  router.put('/pharmacy/medicines/:id', requireRoles('super_admin', 'hospital_admin', 'pharmacist'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const med = db.medicines.find((m) => m.id === req.params.id);
    if (!med) {
      res.status(404).json({ error: 'Medicine not found.' });
      return;
    }
    const { quantityDelta, quantity, sellingPrice, purchasePrice, expiryDate, batchNumber, reorderLevel } = req.body;
    if (quantityDelta !== undefined) {
      med.quantity = Math.max(0, med.quantity + Number(quantityDelta));
    } else if (quantity !== undefined) {
      med.quantity = Math.max(0, Number(quantity));
    }
    if (sellingPrice !== undefined) med.sellingPrice = Number(sellingPrice);
    if (purchasePrice !== undefined) med.purchasePrice = Number(purchasePrice);
    if (expiryDate !== undefined) med.expiryDate = expiryDate;
    if (batchNumber !== undefined) med.batchNumber = batchNumber;
    if (reorderLevel !== undefined) med.reorderLevel = Number(reorderLevel);
    med.updatedAt = new Date().toISOString();
    addAuditLog(db, req.authUser!, 'UPDATE_STOCK', 'Medicine', med.medicineCode, `Stock=${med.quantity}`);
    saveDb(db);
    res.json({ medicine: med });
  });

  // Prescriptions
  router.get('/prescriptions', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.authUser!.role;
    let list = db.prescriptions;
    if (role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((rx) => rx.patientId === pid);
    } else if (role === 'doctor') {
      const doc = getDoctorForUser(req.authUser!.id);
      list = doc ? list.filter((rx) => rx.doctorId === doc.id || canAccessPatient(req, rx.patientId)) : [];
    }
    const enriched = list.map((rx) => ({
      ...rx,
      patientName: db.patients.find((p) => p.id === rx.patientId)?.fullName || '',
      patientCode: db.patients.find((p) => p.id === rx.patientId)?.patientCode || '',
      doctorName: db.doctors.find((d) => d.id === rx.doctorId)?.fullName || '',
    }));
    res.json({ prescriptions: enriched });
  });

  router.post('/prescriptions', requireRoles('doctor', 'super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { patientId, consultationId, items } = req.body;
    if (!patientId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Patient and at least one prescribed medicine are required.' });
      return;
    }
    const db = getDb();
    const doc = getDoctorForUser(req.authUser!.id);
    const rx: Prescription = {
      id: `rx-${crypto.randomUUID().slice(0, 6)}`,
      prescriptionCode: nextCode(db, 'prescription', 'RX-2026'),
      patientId,
      doctorId: doc?.id || req.body.doctorId || 'doc-1',
      consultationId,
      date: new Date().toISOString().slice(0, 10),
      items,
      status: 'Pending',
    };
    db.prescriptions.unshift(rx);

    const pat = db.patients.find((p) => p.id === patientId);
    addNotification(db, {
      userId: pat?.userId,
      roleTarget: ['pharmacist', 'nurse'],
      type: 'prescription',
      title: `New Prescription ${rx.prescriptionCode}`,
      message: `${items.length} medicine(s) prescribed for ${pat?.fullName || patientId}.`,
    });
    addAuditLog(db, req.authUser!, 'CREATE_PRESCRIPTION', 'Prescription', rx.prescriptionCode, `Prescribed for ${pat?.patientCode}`);
    saveDb(db);
    broadcastEvent('notification:created', { title: rx.prescriptionCode });
    res.status(201).json({ prescription: rx });
  });

  router.post('/prescriptions/:id/dispense', requireRoles('pharmacist', 'super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const rx = db.prescriptions.find((p) => p.id === req.params.id);
    if (!rx) {
      res.status(404).json({ error: 'Prescription not found.' });
      return;
    }
    if (rx.status === 'Dispensed') {
      res.status(400).json({ error: 'Prescription has already been dispensed.' });
      return;
    }
    const { action } = req.body as { action?: 'verify' | 'dispense' };
    if (action === 'verify') {
      rx.status = 'Verified';
      rx.verifiedBy = req.authUser!.fullName;
      saveDb(db);
      res.json({ prescription: rx });
      return;
    }

    // Validate stock & decrement stock atomically
    const billItems: BillLineItem[] = [];
    for (const item of rx.items) {
      const med = db.medicines.find(
        (m) => m.id === item.medicineId || m.name.toLowerCase() === item.medicineName.toLowerCase(),
      );
      if (med) {
        if (med.quantity < item.quantity) {
          res.status(400).json({ error: `Insufficient stock for ${med.name}. Available: ${med.quantity}, Required: ${item.quantity}.` });
          return;
        }
      }
    }

    for (const item of rx.items) {
      const med = db.medicines.find(
        (m) => m.id === item.medicineId || m.name.toLowerCase() === item.medicineName.toLowerCase(),
      );
      if (med) {
        med.quantity -= item.quantity;
        med.updatedAt = new Date().toISOString();
        billItems.push({
          id: `bi-${crypto.randomUUID().slice(0, 6)}`,
          category: 'Pharmacy',
          description: `${med.name} (${rx.prescriptionCode})`,
          qty: item.quantity,
          unitPrice: med.sellingPrice,
          total: Number((item.quantity * med.sellingPrice).toFixed(2)),
        });
      }
    }

    rx.status = 'Dispensed';
    rx.verifiedBy = rx.verifiedBy || req.authUser!.fullName;
    rx.dispensedBy = req.authUser!.fullName;
    rx.dispensedAt = new Date().toISOString();

    let generatedBill: Bill | null = null;
    if (billItems.length > 0) {
      generatedBill = {
        id: `bill-${crypto.randomUUID().slice(0, 6)}`,
        billNumber: nextCode(db, 'bill', 'INV'),
        hospitalId: db.hospitals[0]?.id || 'hosp-1',
        patientId: rx.patientId,
        date: new Date().toISOString().slice(0, 10),
        items: billItems,
        subtotal: 0,
        discount: 0,
        tax: 0,
        totalAmount: 0,
        paidAmount: 0,
        status: 'Pending',
        createdBy: req.authUser!.fullName,
      };
      recalculateBillTotals(generatedBill, db.systemConfig.defaultTaxRate);
      db.bills.unshift(generatedBill);
    }

    const pat = db.patients.find((p) => p.id === rx.patientId);
    addNotification(db, {
      userId: pat?.userId,
      roleTarget: ['accountant'],
      type: 'prescription',
      title: `Prescription Dispensed: ${rx.prescriptionCode}`,
      message: generatedBill ? `Pharmacy invoice ${generatedBill.billNumber} generated.` : 'Medicines dispensed.',
    });
    addAuditLog(db, req.authUser!, 'DISPENSE_RX', 'Prescription', rx.prescriptionCode, `Dispensed and updated inventory`);
    saveDb(db);
    broadcastEvent('bill:updated', { patientId: rx.patientId });
    res.json({ prescription: rx, generatedBill });
  });

  // =========================================================================
  // 12. LABORATORY WORKFLOWS
  // =========================================================================

  router.get('/labs/catalog', (_req, res) => {
    const db = getDb();
    res.json({ catalog: db.labCatalog });
  });

  router.put('/labs/catalog/:id', requireRoles('super_admin', 'hospital_admin', 'lab_technician'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const item = db.labCatalog.find((c) => c.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Test catalog item not found.' });
      return;
    }
    if (req.body.price !== undefined) item.price = Number(req.body.price);
    if (req.body.name) item.name = req.body.name;
    saveDb(db);
    res.json({ item });
  });

  router.get('/labs', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.authUser!.role;
    let list = db.labRequests;
    if (role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((l) => l.patientId === pid);
    } else if (role === 'doctor') {
      const doc = getDoctorForUser(req.authUser!.id);
      list = doc ? list.filter((l) => l.doctorId === doc.id || canAccessPatient(req, l.patientId)) : [];
    }
    const enriched = list.map((l) => ({
      ...l,
      patientName: db.patients.find((p) => p.id === l.patientId)?.fullName || '',
      patientCode: db.patients.find((p) => p.id === l.patientId)?.patientCode || '',
      doctorName: db.doctors.find((d) => d.id === l.doctorId)?.fullName || '',
      catalogParameters: db.labCatalog.find((c) => c.id === l.testCatalogId)?.parameters || [],
    }));
    res.json({ labRequests: enriched });
  });

  router.post('/labs', requireRoles('doctor', 'super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const { patientId, testCatalogId, priority } = req.body;
    if (!patientId || !testCatalogId) {
      res.status(400).json({ error: 'Patient and diagnostic test are required.' });
      return;
    }
    const db = getDb();
    const cat = db.labCatalog.find((c) => c.id === testCatalogId);
    if (!cat) {
      res.status(404).json({ error: 'Selected lab test not found in catalog.' });
      return;
    }
    const doc = getDoctorForUser(req.authUser!.id);
    const labReq: LabRequest = {
      id: `lab-${crypto.randomUUID().slice(0, 6)}`,
      requestCode: nextCode(db, 'lab', 'LAB-2026'),
      patientId,
      doctorId: doc?.id || req.body.doctorId || 'doc-1',
      testCatalogId: cat.id,
      testName: cat.name,
      testCategory: cat.category,
      priority: priority || 'Routine',
      price: cat.price,
      status: 'Requested',
      results: cat.parameters.map((p) => ({
        parameter: p.parameter,
        value: '',
        unit: p.unit,
        referenceRange: p.referenceRange,
        flag: 'Normal',
      })),
      requestedAt: new Date().toISOString(),
    };
    db.labRequests.unshift(labReq);

    const pat = db.patients.find((p) => p.id === patientId);
    addNotification(db, {
      roleTarget: ['lab_technician'],
      type: 'lab',
      title: `New Lab Order ${labReq.requestCode} (${labReq.priority})`,
      message: `${cat.name} requested for ${pat?.fullName || patientId}.`,
    });
    addAuditLog(db, req.authUser!, 'REQUEST_LAB', 'LabRequest', labReq.requestCode, `${cat.name} for ${pat?.patientCode}`);
    saveDb(db);
    broadcastEvent('lab:updated', labReq);
    res.status(201).json({ labRequest: labReq });
  });

  router.post('/labs/:id/collect-sample', requireRoles('lab_technician', 'nurse', 'super_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const lab = db.labRequests.find((l) => l.id === req.params.id);
    if (!lab) {
      res.status(404).json({ error: 'Lab request not found.' });
      return;
    }
    lab.sampleId = nextCode(db, 'sample', 'SMP');
    lab.sampleCollectedAt = new Date().toISOString();
    lab.sampleCollectedBy = req.authUser!.fullName;
    lab.status = 'Sample Collected';
    addAuditLog(db, req.authUser!, 'COLLECT_SAMPLE', 'LabRequest', lab.requestCode, `Sample ID ${lab.sampleId}`);
    saveDb(db);
    broadcastEvent('lab:updated', lab);
    res.json({ labRequest: lab });
  });

  router.put('/labs/:id/process', requireRoles('lab_technician', 'super_admin', 'hospital_admin'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const lab = db.labRequests.find((l) => l.id === req.params.id);
    if (!lab) {
      res.status(404).json({ error: 'Lab request not found.' });
      return;
    }
    const { status, observations, results, reportDocumentName } = req.body;
    if (observations !== undefined) lab.observations = observations;
    if (Array.isArray(results)) lab.results = results;
    if (reportDocumentName !== undefined) lab.reportDocumentName = reportDocumentName;
    if (status) lab.status = status;

    if (lab.status === 'Published') {
      lab.verifiedBy = req.authUser!.fullName;
      lab.publishedAt = new Date().toISOString();
      lab.reportDocumentName = lab.reportDocumentName || `${lab.requestCode}_Verified_Report.pdf`;

      const pat = db.patients.find((p) => p.id === lab.patientId);
      const doc = db.doctors.find((d) => d.id === lab.doctorId);

      // Generate lab charge bill
      const bill: Bill = {
        id: `bill-${crypto.randomUUID().slice(0, 6)}`,
        billNumber: nextCode(db, 'bill', 'INV'),
        hospitalId: db.hospitals[0]?.id || 'hosp-1',
        patientId: lab.patientId,
        date: new Date().toISOString().slice(0, 10),
        items: [
          {
            id: `bi-${crypto.randomUUID().slice(0, 6)}`,
            category: 'Laboratory',
            description: `${lab.testName} (${lab.requestCode})`,
            qty: 1,
            unitPrice: lab.price,
            total: lab.price,
          },
        ],
        subtotal: 0,
        discount: 0,
        tax: 0,
        totalAmount: 0,
        paidAmount: 0,
        status: 'Pending',
        createdBy: req.authUser!.fullName,
      };
      recalculateBillTotals(bill, db.systemConfig.defaultTaxRate);
      db.bills.unshift(bill);

      if (pat?.userId) {
        addNotification(db, {
          userId: pat.userId,
          type: 'lab',
          title: `Lab Report Published: ${lab.testName}`,
          message: `${lab.requestCode} verified${doc ? ` (${doc.fullName})` : ''}.`,
        });
      }
      if (doc?.userId) {
        addNotification(db, {
          userId: doc.userId,
          type: 'lab',
          title: `Lab Report Published: ${lab.testName}`,
          message: `${lab.requestCode} verified for ${pat?.fullName || lab.patientId}.`,
        });
      }
      broadcastEvent('bill:updated', { patientId: lab.patientId });
    }

    addAuditLog(db, req.authUser!, 'PROCESS_LAB', 'LabRequest', lab.requestCode, `Status=${lab.status}`);
    saveDb(db);
    broadcastEvent('lab:updated', lab);
    res.json({ labRequest: lab });
  });

  // =========================================================================
  // 13. BILLING, PAYMENTS, INSURANCE & REFUNDS
  // =========================================================================

  router.get('/bills', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const role = req.authUser!.role;
    let list = db.bills;
    if (role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((b) => b.patientId === pid);
    }
    const enriched = list.map((b) => ({
      ...b,
      patientName: db.patients.find((p) => p.id === b.patientId)?.fullName || '',
      patientCode: db.patients.find((p) => p.id === b.patientId)?.patientCode || '',
    }));
    res.json({ bills: enriched });
  });

  router.post('/bills', requireRoles('super_admin', 'hospital_admin', 'accountant', 'receptionist', 'pharmacist'), (req: AuthenticatedRequest, res) => {
    const { patientId, items, discount } = req.body;
    if (!patientId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Patient and at least one billable item are required.' });
      return;
    }
    const db = getDb();
    const normalizedItems: BillLineItem[] = items.map((i: { category: BillLineItem['category']; description: string; qty: number; unitPrice: number }) => ({
      id: `bi-${crypto.randomUUID().slice(0, 6)}`,
      category: i.category || 'Service',
      description: i.description,
      qty: Number(i.qty || 1),
      unitPrice: Number(i.unitPrice || 0),
      total: Number((Number(i.qty || 1) * Number(i.unitPrice || 0)).toFixed(2)),
    }));
    const bill: Bill = {
      id: `bill-${crypto.randomUUID().slice(0, 6)}`,
      billNumber: nextCode(db, 'bill', 'INV'),
      hospitalId: db.hospitals[0]?.id || 'hosp-1',
      patientId,
      date: new Date().toISOString().slice(0, 10),
      items: normalizedItems,
      subtotal: 0,
      discount: Number(discount || 0),
      tax: 0,
      totalAmount: 0,
      paidAmount: 0,
      status: 'Pending',
      createdBy: req.authUser!.fullName,
    };
    recalculateBillTotals(bill, db.systemConfig.defaultTaxRate);
    db.bills.unshift(bill);

    const pat = db.patients.find((p) => p.id === patientId);
    addNotification(db, {
      userId: pat?.userId,
      roleTarget: ['accountant'],
      type: 'payment',
      title: `Invoice Created: ${bill.billNumber}`,
      message: `Total ${db.systemConfig.currencySymbol}${bill.totalAmount.toFixed(2)} for ${pat?.fullName || patientId}.`,
    });
    addAuditLog(db, req.authUser!, 'CREATE_BILL', 'Bill', bill.billNumber, `Total=${bill.totalAmount}`);
    saveDb(db);
    broadcastEvent('bill:updated', bill);
    res.status(201).json({ bill });
  });

  router.get('/payments', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    let list = db.payments;
    if (req.authUser!.role === 'patient') {
      const pid = getPatientIdForUser(req.authUser!.id);
      list = list.filter((p) => p.patientId === pid);
    }
    const enriched = list.map((p) => ({
      ...p,
      patientName: db.patients.find((pt) => pt.id === p.patientId)?.fullName || '',
      billNumber: db.bills.find((b) => b.id === p.billId)?.billNumber || '',
    }));
    res.json({ payments: enriched });
  });

  router.post('/payments', (req: AuthenticatedRequest, res) => {
    const { billId, amount, method, transactionRef } = req.body;
    const db = getDb();
    const bill = db.bills.find((b) => b.id === billId);
    if (!bill) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    if (req.authUser!.role === 'patient' && bill.patientId !== getPatientIdForUser(req.authUser!.id)) {
      res.status(403).json({ error: 'Cannot pay another patient’s invoice.' });
      return;
    }
    const payAmount = Number(amount);
    const remaining = Number((bill.totalAmount - bill.paidAmount).toFixed(2));
    if (!payAmount || payAmount <= 0 || payAmount > remaining + 0.01) {
      res.status(400).json({ error: `Payment amount must be between 0.01 and ${remaining}.` });
      return;
    }
    const payment: Payment = {
      id: `pay-${crypto.randomUUID().slice(0, 6)}`,
      receiptNumber: nextCode(db, 'receipt', 'RCP'),
      billId: bill.id,
      patientId: bill.patientId,
      amount: payAmount,
      method: method || 'UPI',
      transactionRef: transactionRef || `TXN-${crypto.randomInt(1000000, 9999999)}`,
      status: 'Completed',
      paidAt: new Date().toISOString(),
      collectedBy: req.authUser!.fullName,
    };
    db.payments.unshift(payment);
    bill.paidAmount = Number((bill.paidAmount + payAmount).toFixed(2));
    recalculateBillTotals(bill, db.systemConfig.defaultTaxRate);

    // Check if all bills for patient are paid -> clear pending discharge requests
    const hasUnpaid = db.bills.some((b) => b.patientId === bill.patientId && b.status !== 'Paid' && b.status !== 'Refunded');
    if (!hasUnpaid) {
      db.dischargeRequests
        .filter((d) => d.patientId === bill.patientId)
        .forEach((d) => {
          d.billingCleared = true;
          if (d.nursingChecklistDone && d.status === 'Requested') d.status = 'Cleared';
        });
    }

    const pat = db.patients.find((p) => p.id === bill.patientId);
    addNotification(db, {
      userId: pat?.userId,
      roleTarget: ['accountant', 'receptionist'],
      type: 'payment',
      title: `Payment Received: ${payment.receiptNumber}`,
      message: `${db.systemConfig.currencySymbol}${payAmount.toFixed(2)} via ${payment.method} for ${bill.billNumber}.`,
    });
    addAuditLog(db, req.authUser!, 'RECORD_PAYMENT', 'Payment', payment.receiptNumber, `Paid ${payAmount} on ${bill.billNumber}`);
    saveDb(db);
    broadcastEvent('bill:updated', bill);
    res.status(201).json({ payment, bill });
  });

  // Insurance Claims
  router.get('/insurance', requireRoles('super_admin', 'hospital_admin', 'accountant', 'receptionist'), (_req, res) => {
    const db = getDb();
    const enriched = db.insuranceClaims.map((c) => ({
      ...c,
      patientName: db.patients.find((p) => p.id === c.patientId)?.fullName || '',
      billNumber: db.bills.find((b) => b.id === c.billId)?.billNumber || '',
    }));
    res.json({ claims: enriched });
  });

  router.post('/insurance', requireRoles('super_admin', 'hospital_admin', 'accountant'), (req: AuthenticatedRequest, res) => {
    const { billId, provider, policyNumber, claimAmount, notes } = req.body;
    const db = getDb();
    const bill = db.bills.find((b) => b.id === billId);
    if (!bill) {
      res.status(404).json({ error: 'Linked bill not found.' });
      return;
    }
    const claim: InsuranceClaim = {
      id: `clm-${crypto.randomUUID().slice(0, 6)}`,
      claimNumber: nextCode(db, 'claim', 'CLM-2026'),
      billId: bill.id,
      patientId: bill.patientId,
      provider,
      policyNumber,
      claimAmount: Number(claimAmount || bill.totalAmount),
      approvedAmount: 0,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
      notes,
    };
    db.insuranceClaims.unshift(claim);
    addAuditLog(db, req.authUser!, 'CREATE_CLAIM', 'InsuranceClaim', claim.claimNumber, `Provider=${provider}`);
    saveDb(db);
    res.status(201).json({ claim });
  });

  router.put('/insurance/:id', requireRoles('super_admin', 'hospital_admin', 'accountant'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const claim = db.insuranceClaims.find((c) => c.id === req.params.id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }
    if (req.body.status) claim.status = req.body.status;
    if (req.body.approvedAmount !== undefined) claim.approvedAmount = Number(req.body.approvedAmount);
    if (req.body.notes !== undefined) claim.notes = req.body.notes;
    if (claim.status === 'Settled' && claim.approvedAmount > 0) {
      const bill = db.bills.find((b) => b.id === claim.billId);
      if (bill) {
        bill.paidAmount = Math.min(bill.totalAmount, Number((bill.paidAmount + claim.approvedAmount).toFixed(2)));
        recalculateBillTotals(bill, db.systemConfig.defaultTaxRate);
      }
    }
    addAuditLog(db, req.authUser!, 'UPDATE_CLAIM', 'InsuranceClaim', claim.claimNumber, `Status=${claim.status}`);
    saveDb(db);
    res.json({ claim });
  });

  // Refunds
  router.get('/refunds', requireRoles('super_admin', 'hospital_admin', 'accountant', 'receptionist'), (_req, res) => {
    const db = getDb();
    const enriched = db.refundRequests.map((r) => ({
      ...r,
      patientName: db.patients.find((p) => p.id === r.patientId)?.fullName || '',
      billNumber: db.bills.find((b) => b.id === r.billId)?.billNumber || '',
    }));
    res.json({ refunds: enriched });
  });

  router.post('/refunds', requireRoles('super_admin', 'hospital_admin', 'accountant', 'receptionist'), (req: AuthenticatedRequest, res) => {
    const { billId, amount, reason } = req.body;
    const db = getDb();
    const bill = db.bills.find((b) => b.id === billId);
    if (!bill) {
      res.status(404).json({ error: 'Bill not found.' });
      return;
    }
    const ref: RefundRequest = {
      id: `ref-${crypto.randomUUID().slice(0, 6)}`,
      refundNumber: nextCode(db, 'refund', 'REF-2026'),
      billId: bill.id,
      patientId: bill.patientId,
      amount: Number(amount),
      reason: reason || 'Billing adjustment',
      status: 'Requested',
      requestedBy: req.authUser!.fullName,
      createdAt: new Date().toISOString(),
    };
    db.refundRequests.unshift(ref);
    addAuditLog(db, req.authUser!, 'REQUEST_REFUND', 'Refund', ref.refundNumber, `Amount=${ref.amount}`);
    saveDb(db);
    res.status(201).json({ refund: ref });
  });

  router.put('/refunds/:id', requireRoles('super_admin', 'hospital_admin', 'accountant'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const ref = db.refundRequests.find((r) => r.id === req.params.id);
    if (!ref) {
      res.status(404).json({ error: 'Refund request not found.' });
      return;
    }
    ref.status = req.body.status || 'Approved';
    ref.approvedBy = req.authUser!.fullName;
    if (ref.status === 'Processed') {
      const bill = db.bills.find((b) => b.id === ref.billId);
      if (bill) {
        bill.paidAmount = Math.max(0, Number((bill.paidAmount - ref.amount).toFixed(2)));
        if (bill.paidAmount === 0) bill.status = 'Refunded';
      }
    }
    addAuditLog(db, req.authUser!, 'UPDATE_REFUND', 'Refund', ref.refundNumber, `Status=${ref.status}`);
    saveDb(db);
    res.json({ refund: ref });
  });

  // =========================================================================
  // 14. ANALYTICS & REPORTS
  // =========================================================================
  router.get('/reports/analytics', requireRoles('super_admin', 'hospital_admin', 'pharmacist', 'accountant', 'lab_technician'), (_req, res) => {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const revenueByCategory = ['Consultation', 'Laboratory', 'Pharmacy', 'Bed', 'Service'].map((cat) => ({
      category: cat,
      amount: db.bills.reduce(
        (sum, b) => sum + b.items.filter((i) => i.category === cat).reduce((s, i) => s + i.total, 0),
        0,
      ),
    }));

    const doctorPerformance = db.doctors.map((d) => ({
      doctorId: d.id,
      doctorName: d.fullName,
      department: db.departments.find((dep) => dep.id === d.departmentId)?.name || '',
      totalAppointments: db.appointments.filter((a) => a.doctorId === d.id).length,
      completedConsultations: db.appointments.filter((a) => a.doctorId === d.id && a.status === 'Completed').length,
      prescriptionsIssued: db.prescriptions.filter((rx) => rx.doctorId === d.id).length,
      revenueGenerated: db.appointments.filter((a) => a.doctorId === d.id && a.status === 'Completed').length * d.consultationFee,
    }));

    const queueWaitAnalysis = db.departments.map((dep) => {
      const tokens = db.queueTokens.filter((q) => q.departmentId === dep.id);
      const avgWait = tokens.length > 0 ? Math.round(tokens.reduce((s, t) => s + t.estimatedWaitMinutes, 0) / tokens.length) : 0;
      return { department: dep.name, tokens: tokens.length, avgWaitMinutes: avgWait };
    });

    const labStats = {
      total: db.labRequests.length,
      requested: db.labRequests.filter((l) => l.status === 'Requested').length,
      processing: db.labRequests.filter((l) => ['Sample Collected', 'Processing', 'Pending Verification'].includes(l.status)).length,
      published: db.labRequests.filter((l) => l.status === 'Published').length,
    };

    const pharmacyStats = {
      totalSkus: db.medicines.length,
      totalUnits: db.medicines.reduce((s, m) => s + m.quantity, 0),
      inventoryValue: db.medicines.reduce((s, m) => s + m.quantity * m.sellingPrice, 0),
      lowStock: db.medicines.filter((m) => m.quantity <= m.reorderLevel).length,
      expired: db.medicines.filter((m) => m.expiryDate < today).length,
    };

    res.json({
      revenueByCategory,
      doctorPerformance,
      queueWaitAnalysis,
      labStats,
      pharmacyStats,
      bedOccupancy: {
        total: db.beds.length,
        occupied: db.beds.filter((b) => b.status === 'Occupied').length,
        available: db.beds.filter((b) => b.status === 'Available').length,
        maintenance: db.beds.filter((b) => b.status === 'Maintenance').length,
      },
      patientGrowth: [
        { label: 'Mon', registrations: 14, appointments: 32, revenue: 42500 },
        { label: 'Tue', registrations: 18, appointments: 38, revenue: 51200 },
        { label: 'Wed', registrations: 15, appointments: 35, revenue: 46800 },
        { label: 'Thu', registrations: 21, appointments: 44, revenue: 58900 },
        { label: 'Fri', registrations: 19, appointments: 41, revenue: 54100 },
        { label: 'Today', registrations: db.patients.length, appointments: db.appointments.length, revenue: db.payments.reduce((s, p) => s + p.amount, 0) },
      ],
    });
  });

  return router;
}
