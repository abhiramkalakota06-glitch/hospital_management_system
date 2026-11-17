import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Appointment,
  AppNotification,
  AuditLog,
  Bed,
  Bill,
  Consultation,
  Department,
  DischargeRequest,
  DoctorProfile,
  Hospital,
  InsuranceClaim,
  LabRequest,
  LabTestCatalogItem,
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
  SystemConfig,
  UserRole,
  VitalRecord,
} from '../src/types/hms.ts';
import { hashPassword, type StoredUser } from './auth.ts';

export interface CarePlusDatabase {
  hospitals: Hospital[];
  departments: Department[];
  roles: RoleDefinition[];
  users: StoredUser[];
  doctors: DoctorProfile[];
  staff: StaffProfile[];
  patients: Patient[];
  appointments: Appointment[];
  queueTokens: QueueToken[];
  consultations: Consultation[];
  vitals: VitalRecord[];
  medicationsAdmin: MedicationAdminRecord[];
  nursingNotes: NursingNote[];
  dischargeRequests: DischargeRequest[];
  medicines: Medicine[];
  prescriptions: Prescription[];
  labCatalog: LabTestCatalogItem[];
  labRequests: LabRequest[];
  beds: Bed[];
  bills: Bill[];
  payments: Payment[];
  insuranceClaims: InsuranceClaim[];
  refundRequests: RefundRequest[];
  notifications: AppNotification[];
  auditLogs: AuditLog[];
  systemConfig: SystemConfig;
  counters: Record<string, number>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'careplus-db.json');

function buildInitialSeed(): CarePlusDatabase {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const defaultPasswordHash = hashPassword('CarePlus@2026');

  const hospitals: Hospital[] = [
    {
      id: 'hosp-1',
      code: 'CP-MUM-01',
      name: 'CarePlus Central Medical Center',
      city: 'Bengaluru',
      address: '420 Health Park Avenue, Indiranagar, Bengaluru 560038',
      phone: '+91 80 4120 9000',
      email: 'central@careplus.org',
      bedCapacity: 180,
      active: true,
      branches: [
        { id: 'br-1', name: 'Main Clinical Tower', address: '420 Health Park Ave, Wing A', phone: '+91 80 4120 9001' },
        { id: 'br-2', name: 'Diagnostic & Daycare Annex', address: '422 Health Park Ave, Wing B', phone: '+91 80 4120 9050' },
      ],
      createdAt: '2025-01-15T08:00:00.000Z',
    },
    {
      id: 'hosp-2',
      code: 'CP-HYD-02',
      name: 'CarePlus Jubilee Specialty Hospital',
      city: 'Hyderabad',
      address: '88 Jubilee Ridge Road, Hyderabad 500033',
      phone: '+91 40 2355 7800',
      email: 'jubilee@careplus.org',
      bedCapacity: 120,
      active: true,
      branches: [
        { id: 'br-3', name: 'Cardiology & Trauma Block', address: '88 Jubilee Ridge Road', phone: '+91 40 2355 7805' },
      ],
      createdAt: '2025-04-10T09:30:00.000Z',
    },
  ];

  const departments: Department[] = [
    { id: 'dept-1', hospitalId: 'hosp-1', code: 'CARD', name: 'Cardiology', headDoctorId: 'doc-1', description: 'Cardiac care, ECG, echocardiography & interventional cardiology', floor: '3rd Floor', active: true },
    { id: 'dept-2', hospitalId: 'hosp-1', code: 'GENM', name: 'General Medicine', headDoctorId: 'doc-2', description: 'Primary internal medicine, chronic care & preventive diagnostics', floor: '1st Floor', active: true },
    { id: 'dept-3', hospitalId: 'hosp-1', code: 'PEDI', name: 'Pediatrics', headDoctorId: 'doc-3', description: 'Neonatal, infant & adolescent clinical care', floor: '2nd Floor', active: true },
    { id: 'dept-4', hospitalId: 'hosp-1', code: 'ORTH', name: 'Orthopedics', headDoctorId: 'doc-4', description: 'Musculoskeletal surgery, fracture care & sports medicine', floor: '4th Floor', active: true },
    { id: 'dept-5', hospitalId: 'hosp-2', code: 'NEUR', name: 'Neurology', headDoctorId: 'doc-1', description: 'Neurovascular, stroke & epilepsy clinical unit', floor: '2nd Floor', active: true },
  ];

  const allResources = ['hospitals', 'users', 'roles', 'system', 'patients', 'doctors', 'staff', 'departments', 'appointments', 'queue', 'consultations', 'nursing', 'pharmacy', 'labs', 'beds', 'billing', 'reports'];
  const buildActions = (allowed: Record<string, { create?: boolean; read?: boolean; update?: boolean; delete?: boolean }>) => {
    const out: Record<string, { create: boolean; read: boolean; update: boolean; delete: boolean }> = {};
    for (const r of allResources) {
      const a = allowed[r] || {};
      out[r] = {
        create: Boolean(a.create),
        read: Boolean(a.read),
        update: Boolean(a.update),
        delete: Boolean(a.delete),
      };
    }
    return out;
  };

  const roles: RoleDefinition[] = [
    {
      id: 'role-super-admin',
      key: 'super_admin',
      name: 'Super Admin',
      description: 'Full platform governance across all hospitals, users, roles, system configuration, and audit logs.',
      permissions: {
        pages: ['dashboard', 'hospitals', 'users', 'roles', 'system', 'reports', 'profile', 'notifications'],
        actions: buildActions(Object.fromEntries(allResources.map((r) => [r, { create: true, read: true, update: true, delete: true }]))),
      },
    },
    {
      id: 'role-hospital-admin',
      key: 'hospital_admin',
      name: 'Hospital Admin',
      description: 'Daily facility operations including patients, doctors, staff, departments, beds, pharmacy, labs, billing, and reports.',
      permissions: {
        pages: ['dashboard', 'patients', 'doctors', 'staff', 'departments', 'appointments', 'beds', 'pharmacy', 'labs', 'billing', 'reports', 'settings', 'profile', 'notifications'],
        actions: buildActions({
          patients: { create: true, read: true, update: true, delete: true },
          doctors: { create: true, read: true, update: true, delete: true },
          staff: { create: true, read: true, update: true, delete: true },
          departments: { create: true, read: true, update: true, delete: true },
          appointments: { create: true, read: true, update: true, delete: true },
          queue: { create: true, read: true, update: true, delete: true },
          beds: { create: true, read: true, update: true, delete: true },
          pharmacy: { create: true, read: true, update: true, delete: true },
          labs: { create: true, read: true, update: true, delete: true },
          billing: { create: true, read: true, update: true, delete: true },
          reports: { read: true },
        }),
      },
    },
    {
      id: 'role-receptionist',
      key: 'receptionist',
      name: 'Receptionist',
      description: 'Front-desk patient registration, appointment booking, check-in, queue token management, billing, and discharge coordination.',
      permissions: {
        pages: ['dashboard', 'registration', 'search', 'booking', 'checkin', 'queue', 'billing', 'discharge', 'profile', 'notifications'],
        actions: buildActions({
          patients: { create: true, read: true, update: true },
          doctors: { read: true },
          departments: { read: true },
          appointments: { create: true, read: true, update: true },
          queue: { create: true, read: true, update: true },
          billing: { create: true, read: true, update: true },
        }),
      },
    },
    {
      id: 'role-doctor',
      key: 'doctor',
      name: 'Doctor',
      description: 'Consultations, EMR patient records, prescriptions, laboratory test orders, admission/discharge requests, and schedule control.',
      permissions: {
        pages: ['dashboard', 'appointments', 'records', 'consultation', 'prescriptions', 'labs', 'admission', 'schedule', 'profile', 'notifications'],
        actions: buildActions({
          patients: { read: true, update: true },
          appointments: { read: true, update: true },
          queue: { read: true, update: true },
          consultations: { create: true, read: true, update: true },
          pharmacy: { create: true, read: true },
          labs: { create: true, read: true },
          beds: { read: true },
        }),
      },
    },
    {
      id: 'role-nurse',
      key: 'nurse',
      name: 'Nurse',
      description: 'Ward patient care, vital signs recording, medication administration (MAR), nursing notes, and admission/discharge assistance.',
      permissions: {
        pages: ['dashboard', 'patients', 'vitals', 'medications', 'notes', 'admission', 'profile', 'notifications'],
        actions: buildActions({
          patients: { read: true, update: true },
          nursing: { create: true, read: true, update: true },
          beds: { read: true, update: true },
          pharmacy: { read: true },
        }),
      },
    },
    {
      id: 'role-pharmacist',
      key: 'pharmacist',
      name: 'Pharmacist',
      description: 'Medicine inventory, stock adjustments, expiry tracking, prescription verification/dispensing, and pharmacy billing.',
      permissions: {
        pages: ['dashboard', 'inventory', 'prescriptions', 'stock', 'billing', 'reports', 'profile', 'notifications'],
        actions: buildActions({
          pharmacy: { create: true, read: true, update: true, delete: true },
          billing: { create: true, read: true, update: true },
          reports: { read: true },
        }),
      },
    },
    {
      id: 'role-lab-tech',
      key: 'lab_technician',
      name: 'Laboratory Technician',
      description: 'Diagnostic test queue, sample collection tracking, lab result entry, report verification/publishing, and test history.',
      permissions: {
        pages: ['dashboard', 'requests', 'samples', 'processing', 'reports', 'history', 'profile', 'notifications'],
        actions: buildActions({
          labs: { create: true, read: true, update: true },
        }),
      },
    },
    {
      id: 'role-accountant',
      key: 'accountant',
      name: 'Accountant / Billing Staff',
      description: 'Invoice creation, multi-mode payment processing, insurance claim management, refund workflows, and financial reporting.',
      permissions: {
        pages: ['dashboard', 'billing', 'payments', 'insurance', 'refunds', 'reports', 'profile', 'notifications'],
        actions: buildActions({
          billing: { create: true, read: true, update: true, delete: true },
          reports: { read: true },
        }),
      },
    },
    {
      id: 'role-patient',
      key: 'patient',
      name: 'Patient',
      description: 'Personal patient portal for profile, appointment booking, medical records, prescriptions, bills, and lab reports.',
      permissions: {
        pages: ['dashboard', 'profile', 'book', 'appointments', 'records', 'prescriptions', 'bills', 'reports', 'notifications'],
        actions: buildActions({
          appointments: { create: true, read: true, update: true },
          billing: { read: true, update: true },
        }),
      },
    },
  ];

  const users: StoredUser[] = [
    {
      id: 'usr-super',
      username: 'superadmin',
      email: 'superadmin@careplus.org',
      fullName: 'Vikram Deshmukh',
      role: 'super_admin',
      hospitalId: 'hosp-1',
      designation: 'Chief Platform Administrator',
      employeeOrPatientId: 'EMP-SA-001',
      phone: '+91 98450 11001',
      address: '12 Executive Enclave, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: false, labResults: false, billing: true, system: true },
      createdAt: '2025-01-15T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-admin',
      username: 'admin',
      email: 'admin@careplus.org',
      fullName: 'Meera Nair',
      role: 'hospital_admin',
      hospitalId: 'hosp-1',
      designation: 'Hospital Operations Director',
      employeeOrPatientId: 'EMP-HA-012',
      phone: '+91 98450 11002',
      address: '45 Indiranagar 2nd Stage, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_female_1794826955466.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: true, system: true },
      createdAt: '2025-01-20T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-recep',
      username: 'reception',
      email: 'reception@careplus.org',
      fullName: 'Ananya Rao',
      role: 'receptionist',
      hospitalId: 'hosp-1',
      departmentId: 'dept-2',
      designation: 'Senior Front Desk Coordinator',
      employeeOrPatientId: 'EMP-RC-024',
      phone: '+91 98450 11003',
      address: '18 Koramangala 4th Block, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: false, labResults: false, billing: true, system: true },
      createdAt: '2025-02-01T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-doc-1',
      username: 'dr.jenkins',
      email: 'sarah.jenkins@careplus.org',
      fullName: 'Dr. Sarah Jenkins, MD',
      role: 'doctor',
      hospitalId: 'hosp-1',
      departmentId: 'dept-1',
      designation: 'Senior Consultant Cardiologist',
      employeeOrPatientId: 'EMP-DR-101',
      phone: '+91 98450 11004',
      address: '72 Sadashivanagar, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_female_1794826955466.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: '2025-01-25T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-doc-2',
      username: 'dr.bennett',
      email: 'bennett@careplus.org',
      fullName: 'Dr. Alexander Bennett, MD',
      role: 'doctor',
      hospitalId: 'hosp-1',
      departmentId: 'dept-2',
      designation: 'Head of Internal Medicine',
      employeeOrPatientId: 'EMP-DR-102',
      phone: '+91 98450 11005',
      address: '19 Ulsoor Lake Rd, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: '2025-01-25T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-doc-3',
      username: 'dr.kavita',
      email: 'kavita@careplus.org',
      fullName: 'Dr. Kavita Kulkarni, DCH',
      role: 'doctor',
      hospitalId: 'hosp-1',
      departmentId: 'dept-3',
      designation: 'Consultant Pediatrician',
      employeeOrPatientId: 'EMP-DR-103',
      phone: '+91 98450 11006',
      address: '91 Jayanagar 3rd Block, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_female_1794826955466.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: '2025-02-10T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-doc-4',
      username: 'dr.rohan',
      email: 'rohan@careplus.org',
      fullName: 'Dr. Rohan Kapoor, MS',
      role: 'doctor',
      hospitalId: 'hosp-1',
      departmentId: 'dept-4',
      designation: 'Orthopedic Surgeon',
      employeeOrPatientId: 'EMP-DR-104',
      phone: '+91 98450 11007',
      address: '30 Malleswaram, Bengaluru',
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: '2025-02-12T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-nurse',
      username: 'nurse',
      email: 'nurse@careplus.org',
      fullName: 'Priya Menon, RN',
      role: 'nurse',
      hospitalId: 'hosp-1',
      departmentId: 'dept-1',
      designation: 'Charge Nurse — Cardiology & ICU',
      employeeOrPatientId: 'EMP-NR-201',
      phone: '+91 98450 11008',
      address: '54 HSR Layout Sector 2, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: false, prescriptions: true, labResults: true, billing: false, system: true },
      createdAt: '2025-02-15T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-pharm',
      username: 'pharmacist',
      email: 'pharmacy@careplus.org',
      fullName: 'Karthik Iyer, B.Pharm',
      role: 'pharmacist',
      hospitalId: 'hosp-1',
      designation: 'Chief Clinical Pharmacist',
      employeeOrPatientId: 'EMP-PH-301',
      phone: '+91 98450 11009',
      address: '27 JP Nagar 6th Phase, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: false, prescriptions: true, labResults: false, billing: true, system: true },
      createdAt: '2025-02-18T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-lab',
      username: 'labtech',
      email: 'lab@careplus.org',
      fullName: 'Siddharth Verma',
      role: 'lab_technician',
      hospitalId: 'hosp-1',
      designation: 'Lead Diagnostic Technologist',
      employeeOrPatientId: 'EMP-LB-401',
      phone: '+91 98450 11010',
      address: '14 Richmond Town, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: false, prescriptions: false, labResults: true, billing: false, system: true },
      createdAt: '2025-02-20T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-acc',
      username: 'accountant',
      email: 'billing@careplus.org',
      fullName: 'Neha Sharma',
      role: 'accountant',
      hospitalId: 'hosp-1',
      designation: 'Senior Revenue & Billing Officer',
      employeeOrPatientId: 'EMP-AC-501',
      phone: '+91 98450 11011',
      address: '63 Whitefield Main Rd, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: false, prescriptions: false, labResults: false, billing: true, system: true },
      createdAt: '2025-02-22T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-patient-1',
      username: 'arjun.mehta',
      email: 'patient@careplus.org',
      fullName: 'Arjun Mehta',
      role: 'patient',
      hospitalId: 'hosp-1',
      designation: 'Registered Patient',
      employeeOrPatientId: 'CP-PT-1001',
      phone: '+91 99001 44501',
      address: '104 Emerald Residences, Indiranagar, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: true, system: true },
      createdAt: '2025-03-01T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
    {
      id: 'usr-patient-2',
      username: 'divya.krishnan',
      email: 'divya.k@example.com',
      fullName: 'Divya Krishnan',
      role: 'patient',
      hospitalId: 'hosp-1',
      designation: 'Registered Patient',
      employeeOrPatientId: 'CP-PT-1002',
      phone: '+91 99001 44502',
      address: '22 Residency Road, Bengaluru',
      active: true,
      activated: true,
      notificationPreferences: { appointments: true, prescriptions: true, labResults: true, billing: true, system: true },
      createdAt: '2025-03-05T08:00:00.000Z',
      passwordHash: defaultPasswordHash,
    },
  ];

  const doctors: DoctorProfile[] = [
    {
      id: 'doc-1',
      userId: 'usr-doc-1',
      hospitalId: 'hosp-1',
      departmentId: 'dept-1',
      fullName: 'Dr. Sarah Jenkins, MD',
      specialization: 'Interventional Cardiology',
      qualifications: 'MBBS, MD (Cardiology), FACC',
      consultationFee: 1200,
      available: true,
      avatarUrl: '/src/assets/images/avatar_doctor_female_1794826955466.jpg',
      schedule: {
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        startTime: '09:00',
        endTime: '17:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        slotDurationMinutes: 30,
      },
      leaveRequests: [],
    },
    {
      id: 'doc-2',
      userId: 'usr-doc-2',
      hospitalId: 'hosp-1',
      departmentId: 'dept-2',
      fullName: 'Dr. Alexander Bennett, MD',
      specialization: 'Internal & Metabolic Medicine',
      qualifications: 'MBBS, MD (General Medicine), FACP',
      consultationFee: 800,
      available: true,
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      schedule: {
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        startTime: '09:00',
        endTime: '17:00',
        breakStart: '13:00',
        breakEnd: '14:00',
        slotDurationMinutes: 30,
      },
      leaveRequests: [],
    },
    {
      id: 'doc-3',
      userId: 'usr-doc-3',
      hospitalId: 'hosp-1',
      departmentId: 'dept-3',
      fullName: 'Dr. Kavita Kulkarni, DCH',
      specialization: 'General & Neonatal Pediatrics',
      qualifications: 'MBBS, DCH, DNB (Pediatrics)',
      consultationFee: 900,
      available: true,
      avatarUrl: '/src/assets/images/avatar_doctor_female_1794826955466.jpg',
      schedule: {
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        startTime: '09:30',
        endTime: '16:30',
        breakStart: '13:00',
        breakEnd: '14:00',
        slotDurationMinutes: 30,
      },
      leaveRequests: [],
    },
    {
      id: 'doc-4',
      userId: 'usr-doc-4',
      hospitalId: 'hosp-1',
      departmentId: 'dept-4',
      fullName: 'Dr. Rohan Kapoor, MS',
      specialization: 'Joint Replacement & Arthroscopy',
      qualifications: 'MBBS, MS (Orthopedics)',
      consultationFee: 1100,
      available: true,
      avatarUrl: '/src/assets/images/avatar_doctor_male_1794826956951.jpg',
      schedule: {
        workingDays: ['Mon', 'Wed', 'Thu', 'Fri', 'Sat'],
        startTime: '10:00',
        endTime: '18:00',
        breakStart: '13:30',
        breakEnd: '14:30',
        slotDurationMinutes: 30,
      },
      leaveRequests: [],
    },
  ];

  const staff: StaffProfile[] = [
    { id: 'stf-1', userId: 'usr-nurse', hospitalId: 'hosp-1', departmentId: 'dept-1', fullName: 'Priya Menon, RN', role: 'nurse', designation: 'Charge Nurse — ICU & Cardiology', shift: 'Morning (07:00 - 15:00)', available: true, phone: '+91 98450 11008' },
    { id: 'stf-2', userId: 'usr-recep', hospitalId: 'hosp-1', departmentId: 'dept-2', fullName: 'Ananya Rao', role: 'receptionist', designation: 'Front Desk Coordinator', shift: 'Morning (07:00 - 15:00)', available: true, phone: '+91 98450 11003' },
    { id: 'stf-3', userId: 'usr-pharm', hospitalId: 'hosp-1', departmentId: 'dept-2', fullName: 'Karthik Iyer, B.Pharm', role: 'pharmacist', designation: 'Chief Clinical Pharmacist', shift: 'Morning (07:00 - 15:00)', available: true, phone: '+91 98450 11009' },
    { id: 'stf-4', userId: 'usr-lab', hospitalId: 'hosp-1', departmentId: 'dept-2', fullName: 'Siddharth Verma', role: 'lab_technician', designation: 'Lead Lab Technologist', shift: 'Morning (07:00 - 15:00)', available: true, phone: '+91 98450 11010' },
    { id: 'stf-5', userId: 'usr-acc', hospitalId: 'hosp-1', departmentId: 'dept-2', fullName: 'Neha Sharma', role: 'accountant', designation: 'Billing Officer', shift: 'Morning (07:00 - 15:00)', available: true, phone: '+91 98450 11011' },
  ];

  const beds: Bed[] = [
    { id: 'bed-1', hospitalId: 'hosp-1', bedNumber: 'ICU-01', wardName: 'Cardiac ICU', wardType: 'ICU', dailyRate: 6500, status: 'Occupied', patientId: 'pat-2', assignedAt: `${yesterday}T10:15:00.000Z` },
    { id: 'bed-2', hospitalId: 'hosp-1', bedNumber: 'ICU-02', wardName: 'Cardiac ICU', wardType: 'ICU', dailyRate: 6500, status: 'Available' },
    { id: 'bed-3', hospitalId: 'hosp-1', bedNumber: 'ICU-03', wardName: 'Surgical ICU', wardType: 'ICU', dailyRate: 6500, status: 'Available' },
    { id: 'bed-4', hospitalId: 'hosp-1', bedNumber: 'GEN-101', wardName: 'General Ward A', wardType: 'General', dailyRate: 2200, status: 'Occupied', patientId: 'pat-4', assignedAt: `${twoDaysAgo}T14:00:00.000Z` },
    { id: 'bed-5', hospitalId: 'hosp-1', bedNumber: 'GEN-102', wardName: 'General Ward A', wardType: 'General', dailyRate: 2200, status: 'Available' },
    { id: 'bed-6', hospitalId: 'hosp-1', bedNumber: 'GEN-103', wardName: 'General Ward B', wardType: 'General', dailyRate: 2200, status: 'Available' },
    { id: 'bed-7', hospitalId: 'hosp-1', bedNumber: 'PVT-201', wardName: 'Private Deluxe Suite', wardType: 'Private', dailyRate: 4800, status: 'Available' },
    { id: 'bed-8', hospitalId: 'hosp-1', bedNumber: 'ER-01', wardName: 'Emergency Bay', wardType: 'Emergency', dailyRate: 3500, status: 'Maintenance' },
  ];

  const patients: Patient[] = [
    {
      id: 'pat-1',
      patientCode: 'CP-PT-1001',
      userId: 'usr-patient-1',
      hospitalId: 'hosp-1',
      fullName: 'Arjun Mehta',
      dateOfBirth: '1986-05-14',
      gender: 'Male',
      phone: '+91 99001 44501',
      email: 'patient@careplus.org',
      address: '104 Emerald Residences, Indiranagar, Bengaluru',
      emergencyContact: 'Ritu Mehta (+91 99001 44599)',
      bloodGroup: 'O+',
      allergies: ['Penicillin'],
      existingConditions: ['Mild Hypertension'],
      status: 'Outpatient',
      assignedDoctorId: 'doc-1',
      registeredAt: `${twoDaysAgo}T09:00:00.000Z`,
    },
    {
      id: 'pat-2',
      patientCode: 'CP-PT-1002',
      userId: 'usr-patient-2',
      hospitalId: 'hosp-1',
      fullName: 'Divya Krishnan',
      dateOfBirth: '1978-11-22',
      gender: 'Female',
      phone: '+91 99001 44502',
      email: 'divya.k@example.com',
      address: '22 Residency Road, Bengaluru',
      emergencyContact: 'Suresh Krishnan (+91 99001 44580)',
      bloodGroup: 'A+',
      allergies: ['Sulfa drugs'],
      existingConditions: ['Atrial Fibrillation', 'Type 2 Diabetes'],
      status: 'Admitted',
      assignedDoctorId: 'doc-1',
      assignedNurseId: 'usr-nurse',
      bedId: 'bed-1',
      admissionDate: `${yesterday}T10:15:00.000Z`,
      admissionNotes: 'Admitted for rhythm monitoring and IV rate control.',
      registeredAt: `${twoDaysAgo}T11:30:00.000Z`,
    },
    {
      id: 'pat-3',
      patientCode: 'CP-PT-1003',
      hospitalId: 'hosp-1',
      fullName: 'Ramesh Gowda',
      dateOfBirth: '1965-02-09',
      gender: 'Male',
      phone: '+91 98802 33104',
      email: 'ramesh.g@example.com',
      address: '77 Malleswaram 8th Cross, Bengaluru',
      emergencyContact: 'Lakshmi Gowda (+91 98802 33105)',
      bloodGroup: 'B+',
      allergies: [],
      existingConditions: ['Hypercholesterolemia'],
      status: 'Outpatient',
      assignedDoctorId: 'doc-2',
      registeredAt: `${today}T08:15:00.000Z`,
    },
    {
      id: 'pat-4',
      patientCode: 'CP-PT-1004',
      hospitalId: 'hosp-1',
      fullName: 'Farah Siddiqui',
      dateOfBirth: '1993-08-30',
      gender: 'Female',
      phone: '+91 97411 66201',
      email: 'farah.s@example.com',
      address: '15 Frazer Town, Bengaluru',
      emergencyContact: 'Tariq Siddiqui (+91 97411 66202)',
      bloodGroup: 'AB+',
      allergies: ['Latex'],
      existingConditions: ['Post-op ACL reconstruction'],
      status: 'Admitted',
      assignedDoctorId: 'doc-4',
      assignedNurseId: 'usr-nurse',
      bedId: 'bed-4',
      admissionDate: `${twoDaysAgo}T14:00:00.000Z`,
      admissionNotes: 'Post-operative orthopedic recovery, physiotherapy scheduled.',
      registeredAt: `${twoDaysAgo}T13:00:00.000Z`,
    },
    {
      id: 'pat-5',
      patientCode: 'CP-PT-1005',
      hospitalId: 'hosp-1',
      fullName: 'Aarav Patel',
      dateOfBirth: '2018-04-12',
      gender: 'Male',
      phone: '+91 98455 77101',
      email: 'parent.patel@example.com',
      address: '92 Whitefield Palm Meadows, Bengaluru',
      emergencyContact: 'Nidhi Patel (+91 98455 77102)',
      bloodGroup: 'O-',
      allergies: [],
      existingConditions: ['Seasonal Asthma'],
      status: 'Outpatient',
      assignedDoctorId: 'doc-3',
      registeredAt: `${today}T08:40:00.000Z`,
    },
    {
      id: 'pat-6',
      patientCode: 'CP-PT-1006',
      hospitalId: 'hosp-1',
      fullName: 'Suhasini Murthy',
      dateOfBirth: '1959-12-03',
      gender: 'Female',
      phone: '+91 98440 55901',
      email: 'suhasini.m@example.com',
      address: '41 Basavanagudi, Bengaluru',
      emergencyContact: 'Prakash Murthy (+91 98440 55902)',
      bloodGroup: 'A-',
      allergies: ['Aspirin'],
      existingConditions: ['Osteoarthritis'],
      status: 'Discharged',
      assignedDoctorId: 'doc-2',
      registeredAt: `${pastDate}T09:20:00.000Z`,
    },
  ];

  const appointments: Appointment[] = [
    {
      id: 'apt-1',
      appointmentNumber: 'CP-APT-1001',
      hospitalId: 'hosp-1',
      patientId: 'pat-1',
      departmentId: 'dept-1',
      doctorId: 'doc-1',
      date: today,
      timeSlot: '09:30',
      reason: 'Blood pressure follow-up & ECG review',
      status: 'In Consultation',
      createdAt: `${yesterday}T14:00:00.000Z`,
      updatedAt: `${today}T09:25:00.000Z`,
    },
    {
      id: 'apt-2',
      appointmentNumber: 'CP-APT-1002',
      hospitalId: 'hosp-1',
      patientId: 'pat-3',
      departmentId: 'dept-1',
      doctorId: 'doc-1',
      date: today,
      timeSlot: '10:00',
      reason: 'Chest tightness evaluation & lipid check',
      status: 'Checked-In',
      createdAt: `${yesterday}T16:20:00.000Z`,
      updatedAt: `${today}T09:45:00.000Z`,
    },
    {
      id: 'apt-3',
      appointmentNumber: 'CP-APT-1003',
      hospitalId: 'hosp-1',
      patientId: 'pat-5',
      departmentId: 'dept-3',
      doctorId: 'doc-3',
      date: today,
      timeSlot: '10:30',
      reason: 'Pediatric asthma inhaler checkup',
      status: 'Checked-In',
      createdAt: `${today}T08:42:00.000Z`,
      updatedAt: `${today}T09:50:00.000Z`,
    },
    {
      id: 'apt-4',
      appointmentNumber: 'CP-APT-1004',
      hospitalId: 'hosp-1',
      patientId: 'pat-1',
      departmentId: 'dept-2',
      doctorId: 'doc-2',
      date: today,
      timeSlot: '14:30',
      reason: 'Routine annual metabolic panel review',
      status: 'Approved',
      createdAt: `${yesterday}T18:00:00.000Z`,
      updatedAt: `${yesterday}T18:15:00.000Z`,
    },
    {
      id: 'apt-5',
      appointmentNumber: 'CP-APT-1005',
      hospitalId: 'hosp-1',
      patientId: 'pat-6',
      departmentId: 'dept-2',
      doctorId: 'doc-2',
      date: yesterday,
      timeSlot: '11:00',
      reason: 'Post-discharge wellness assessment',
      status: 'Completed',
      createdAt: `${twoDaysAgo}T10:00:00.000Z`,
      updatedAt: `${yesterday}T11:30:00.000Z`,
    },
  ];

  const queueTokens: QueueToken[] = [
    {
      id: 'q-1',
      tokenNumber: 'T-101',
      hospitalId: 'hosp-1',
      appointmentId: 'apt-1',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      departmentId: 'dept-1',
      status: 'In Consultation',
      estimatedWaitMinutes: 0,
      checkInTime: `${today}T09:15:00.000Z`,
      calledTime: `${today}T09:25:00.000Z`,
    },
    {
      id: 'q-2',
      tokenNumber: 'T-102',
      hospitalId: 'hosp-1',
      appointmentId: 'apt-2',
      patientId: 'pat-3',
      doctorId: 'doc-1',
      departmentId: 'dept-1',
      status: 'Waiting',
      estimatedWaitMinutes: 15,
      checkInTime: `${today}T09:45:00.000Z`,
    },
    {
      id: 'q-3',
      tokenNumber: 'T-103',
      hospitalId: 'hosp-1',
      appointmentId: 'apt-3',
      patientId: 'pat-5',
      doctorId: 'doc-3',
      departmentId: 'dept-3',
      status: 'Called',
      estimatedWaitMinutes: 5,
      checkInTime: `${today}T09:50:00.000Z`,
      calledTime: `${today}T10:02:00.000Z`,
    },
  ];

  const consultations: Consultation[] = [
    {
      id: 'cons-1',
      patientId: 'pat-1',
      appointmentId: 'apt-5',
      doctorId: 'doc-1',
      date: yesterday,
      complaints: 'Intermittent evening headache and mild ankle swelling',
      symptoms: 'Elevated evening BP readings (142/90 mmHg), fatigue',
      vitalSigns: {
        bloodPressure: '138/88 mmHg',
        temperature: '98.4 °F',
        pulseRate: '76 bpm',
        respiratoryRate: '16 /min',
        oxygenSaturation: '99%',
      },
      physicalExam: 'Heart sounds S1 S2 normal, no murmurs. Mild bilateral pedal edema.',
      diagnosis: 'Essential Hypertension — Stage 1 (Controlled adjustment needed)',
      treatmentPlan: 'Adjust antihypertensive regimen, low-sodium diet (<2g/day), repeat lipid & renal profile.',
      doctorNotes: 'Patient advised home BP log twice daily for 2 weeks.',
      followUpDate: nextMonth,
      createdAt: `${yesterday}T11:30:00.000Z`,
    },
  ];

  const vitals: VitalRecord[] = [
    {
      id: 'vit-1',
      patientId: 'pat-2',
      recordedBy: 'usr-nurse',
      recordedByName: 'Priya Menon, RN',
      recordedAt: `${today}T08:00:00.000Z`,
      bloodPressure: '126/80 mmHg',
      temperature: '98.6 °F',
      pulseRate: '84 bpm',
      respiratoryRate: '18 /min',
      oxygenSaturation: '98%',
      notes: 'Sinus rhythm restored overnight. Comfortable at rest.',
    },
    {
      id: 'vit-2',
      patientId: 'pat-4',
      recordedBy: 'usr-nurse',
      recordedByName: 'Priya Menon, RN',
      recordedAt: `${today}T08:20:00.000Z`,
      bloodPressure: '118/74 mmHg',
      temperature: '99.1 °F',
      pulseRate: '78 bpm',
      respiratoryRate: '16 /min',
      oxygenSaturation: '99%',
      notes: 'Surgical dressing dry and intact. Pain score 3/10.',
    },
  ];

  const medicationsAdmin: MedicationAdminRecord[] = [
    {
      id: 'mar-1',
      patientId: 'pat-2',
      medicineName: 'Metoprolol Succinate 50mg',
      dosage: '50 mg Oral',
      scheduledTime: `${today} 08:00`,
      status: 'Administered',
      administeredBy: 'Priya Menon, RN',
      administeredAt: `${today}T08:05:00.000Z`,
      notes: 'Taken with breakfast.',
    },
    {
      id: 'mar-2',
      patientId: 'pat-2',
      medicineName: 'Apixaban 5mg',
      dosage: '5 mg Oral',
      scheduledTime: `${today} 20:00`,
      status: 'Scheduled',
    },
    {
      id: 'mar-3',
      patientId: 'pat-4',
      medicineName: 'Paracetamol 650mg',
      dosage: '650 mg Oral',
      scheduledTime: `${today} 14:00`,
      status: 'Scheduled',
    },
  ];

  const nursingNotes: NursingNote[] = [
    {
      id: 'nn-1',
      patientId: 'pat-2',
      nurseId: 'usr-nurse',
      nurseName: 'Priya Menon, RN',
      condition: 'Stable',
      observation: 'Telemetry strip shows steady normal sinus rhythm at 82–86 bpm.',
      progressNote: 'Patient ambulated 20m in ICU corridor without dizziness.',
      escalated: false,
      createdAt: `${today}T08:30:00.000Z`,
    },
    {
      id: 'nn-2',
      patientId: 'pat-4',
      nurseId: 'usr-nurse',
      nurseName: 'Priya Menon, RN',
      condition: 'Improving',
      observation: 'Post-op knee flexion reached 75 degrees during morning session.',
      progressNote: 'Ice pack compression applied for 20 minutes post-physio.',
      escalated: false,
      createdAt: `${today}T09:00:00.000Z`,
    },
  ];

  const dischargeRequests: DischargeRequest[] = [
    {
      id: 'dis-1',
      patientId: 'pat-4',
      doctorId: 'doc-4',
      dischargeSummary: 'Uncomplicated post-op ACL reconstruction recovery. Cleared for outpatient physiotherapy.',
      treatmentInstructions: 'Continue knee brace for 3 weeks; weight-bearing as tolerated; follow up in 10 days for suture removal.',
      billingCleared: false,
      nursingChecklistDone: true,
      status: 'Requested',
      createdAt: `${today}T09:10:00.000Z`,
    },
  ];

  const medicines: Medicine[] = [
    { id: 'med-1', medicineCode: 'MED-101', name: 'Amlodipine 5mg Tablet', category: 'Cardiovascular', manufacturer: 'Cipla Health', batchNumber: 'BATCH-AM26', quantity: 420, reorderLevel: 80, expiryDate: nextYear, purchasePrice: 3.5, sellingPrice: 8.0, updatedAt: nowIso },
    { id: 'med-2', medicineCode: 'MED-102', name: 'Atorvastatin 20mg Tablet', category: 'Lipid Lowering', manufacturer: 'Sun Pharma', batchNumber: 'BATCH-AT91', quantity: 280, reorderLevel: 60, expiryDate: nextYear, purchasePrice: 6.0, sellingPrice: 14.0, updatedAt: nowIso },
    { id: 'med-3', medicineCode: 'MED-103', name: 'Metoprolol Succinate 50mg', category: 'Cardiovascular', manufacturer: 'AstraZeneca', batchNumber: 'BATCH-MP14', quantity: 35, reorderLevel: 50, expiryDate: nextYear, purchasePrice: 9.0, sellingPrice: 18.0, updatedAt: nowIso },
    { id: 'med-4', medicineCode: 'MED-104', name: 'Amoxicillin + Clavulanate 625mg', category: 'Antibiotic', manufacturer: 'GSK', batchNumber: 'BATCH-AC08', quantity: 190, reorderLevel: 40, expiryDate: nextMonth, purchasePrice: 15.0, sellingPrice: 28.0, updatedAt: nowIso },
    { id: 'med-5', medicineCode: 'MED-105', name: 'Paracetamol 650mg Tablet', category: 'Analgesic', manufacturer: 'Micro Labs', batchNumber: 'BATCH-PC44', quantity: 650, reorderLevel: 100, expiryDate: nextYear, purchasePrice: 1.5, sellingPrice: 4.0, updatedAt: nowIso },
    { id: 'med-6', medicineCode: 'MED-106', name: 'Salbutamol Inhaler 100mcg', category: 'Respiratory', manufacturer: 'Cipla Health', batchNumber: 'BATCH-SB02', quantity: 18, reorderLevel: 25, expiryDate: pastDate, purchasePrice: 95.0, sellingPrice: 165.0, updatedAt: nowIso },
  ];

  const prescriptions: Prescription[] = [
    {
      id: 'rx-1',
      prescriptionCode: 'RX-2026-101',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      consultationId: 'cons-1',
      date: yesterday,
      items: [
        { medicineId: 'med-1', medicineName: 'Amlodipine 5mg Tablet', dosage: '5 mg', frequency: 'Once daily (Morning)', duration: '30 days', instructions: 'Take after breakfast', quantity: 30 },
        { medicineId: 'med-2', medicineName: 'Atorvastatin 20mg Tablet', dosage: '20 mg', frequency: 'Once daily (Night)', duration: '30 days', instructions: 'Take at bedtime', quantity: 30 },
      ],
      status: 'Dispensed',
      verifiedBy: 'Karthik Iyer, B.Pharm',
      dispensedBy: 'Karthik Iyer, B.Pharm',
      dispensedAt: `${yesterday}T12:10:00.000Z`,
    },
    {
      id: 'rx-2',
      prescriptionCode: 'RX-2026-102',
      patientId: 'pat-2',
      doctorId: 'doc-1',
      date: today,
      items: [
        { medicineId: 'med-3', medicineName: 'Metoprolol Succinate 50mg', dosage: '50 mg', frequency: 'Twice daily', duration: '14 days', instructions: 'Monitor pulse before evening dose', quantity: 28 },
      ],
      status: 'Pending',
    },
  ];

  const labCatalog: LabTestCatalogItem[] = [
    {
      id: 'cat-1',
      code: 'CBC-01',
      name: 'Complete Blood Count (CBC)',
      category: 'Blood',
      price: 550,
      sampleType: 'EDTA Whole Blood',
      parameters: [
        { parameter: 'Hemoglobin', unit: 'g/dL', referenceRange: '13.5 - 17.5' },
        { parameter: 'WBC Count', unit: 'x10^3/µL', referenceRange: '4.5 - 11.0' },
        { parameter: 'Platelet Count', unit: 'x10^3/µL', referenceRange: '150 - 450' },
      ],
    },
    {
      id: 'cat-2',
      code: 'LIP-02',
      name: 'Lipid Profile Panel',
      category: 'Biochemistry',
      price: 950,
      sampleType: 'Fasting Serum',
      parameters: [
        { parameter: 'Total Cholesterol', unit: 'mg/dL', referenceRange: '< 200' },
        { parameter: 'LDL Cholesterol', unit: 'mg/dL', referenceRange: '< 100' },
        { parameter: 'HDL Cholesterol', unit: 'mg/dL', referenceRange: '> 40' },
        { parameter: 'Triglycerides', unit: 'mg/dL', referenceRange: '< 150' },
      ],
    },
    {
      id: 'cat-3',
      code: 'URN-03',
      name: 'Routine Urine Examination',
      category: 'Urine',
      price: 350,
      sampleType: 'Midstream Urine',
      parameters: [
        { parameter: 'pH', unit: '', referenceRange: '5.0 - 8.0' },
        { parameter: 'Glucose', unit: 'mg/dL', referenceRange: 'Negative' },
        { parameter: 'Protein', unit: 'mg/dL', referenceRange: 'Negative' },
      ],
    },
    {
      id: 'cat-4',
      code: 'TRP-04',
      name: 'High-Sensitivity Troponin-I',
      category: 'Blood',
      price: 1600,
      sampleType: 'Heparin Plasma',
      parameters: [
        { parameter: 'Troponin I (hs)', unit: 'ng/L', referenceRange: '< 19.0' },
      ],
    },
  ];

  const labRequests: LabRequest[] = [
    {
      id: 'lab-1',
      requestCode: 'LAB-2026-101',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      testCatalogId: 'cat-2',
      testName: 'Lipid Profile Panel',
      testCategory: 'Biochemistry',
      priority: 'Routine',
      price: 950,
      status: 'Published',
      sampleId: 'SMP-9001',
      sampleCollectedAt: `${yesterday}T10:15:00.000Z`,
      sampleCollectedBy: 'Siddharth Verma',
      observations: 'Clear fasting serum sample processed on Cobas analyzer.',
      results: [
        { parameter: 'Total Cholesterol', value: '194', unit: 'mg/dL', referenceRange: '< 200', flag: 'Normal' },
        { parameter: 'LDL Cholesterol', value: '112', unit: 'mg/dL', referenceRange: '< 100', flag: 'High' },
        { parameter: 'HDL Cholesterol', value: '48', unit: 'mg/dL', referenceRange: '> 40', flag: 'Normal' },
        { parameter: 'Triglycerides', value: '136', unit: 'mg/dL', referenceRange: '< 150', flag: 'Normal' },
      ],
      reportDocumentName: 'Lipid_Profile_CP-PT-1001.pdf',
      verifiedBy: 'Siddharth Verma',
      requestedAt: `${yesterday}T09:40:00.000Z`,
      publishedAt: `${yesterday}T14:20:00.000Z`,
    },
    {
      id: 'lab-2',
      requestCode: 'LAB-2026-102',
      patientId: 'pat-2',
      doctorId: 'doc-1',
      testCatalogId: 'cat-4',
      testName: 'High-Sensitivity Troponin-I',
      testCategory: 'Blood',
      priority: 'STAT',
      price: 1600,
      status: 'Processing',
      sampleId: 'SMP-9002',
      sampleCollectedAt: `${today}T08:45:00.000Z`,
      sampleCollectedBy: 'Siddharth Verma',
      results: [],
      requestedAt: `${today}T08:30:00.000Z`,
    },
    {
      id: 'lab-3',
      requestCode: 'LAB-2026-103',
      patientId: 'pat-3',
      doctorId: 'doc-1',
      testCatalogId: 'cat-1',
      testName: 'Complete Blood Count (CBC)',
      testCategory: 'Blood',
      priority: 'Urgent',
      price: 550,
      status: 'Requested',
      results: [],
      requestedAt: `${today}T09:50:00.000Z`,
    },
  ];

  const bills: Bill[] = [
    {
      id: 'bill-1',
      billNumber: 'INV-2026-101',
      hospitalId: 'hosp-1',
      patientId: 'pat-1',
      date: yesterday,
      items: [
        { id: 'bi-1', category: 'Consultation', description: 'Cardiology Consultation — Dr. Sarah Jenkins', qty: 1, unitPrice: 1200, total: 1200 },
        { id: 'bi-2', category: 'Laboratory', description: 'Lipid Profile Panel', qty: 1, unitPrice: 950, total: 950 },
        { id: 'bi-3', category: 'Pharmacy', description: 'Dispensed RX-2026-101 (Amlodipine + Atorvastatin)', qty: 1, unitPrice: 660, total: 660 },
      ],
      subtotal: 2810,
      discount: 0,
      tax: 140.5,
      totalAmount: 2950.5,
      paidAmount: 2950.5,
      status: 'Paid',
      createdBy: 'Neha Sharma',
    },
    {
      id: 'bill-2',
      billNumber: 'INV-2026-102',
      hospitalId: 'hosp-1',
      patientId: 'pat-2',
      date: today,
      items: [
        { id: 'bi-4', category: 'Bed', description: 'Cardiac ICU (ICU-01) — 2 Days', qty: 2, unitPrice: 6500, total: 13000 },
        { id: 'bi-5', category: 'Laboratory', description: 'High-Sensitivity Troponin-I (STAT)', qty: 1, unitPrice: 1600, total: 1600 },
      ],
      subtotal: 14600,
      discount: 500,
      tax: 705,
      totalAmount: 14805,
      paidAmount: 5000,
      status: 'Partial',
      createdBy: 'Neha Sharma',
    },
    {
      id: 'bill-3',
      billNumber: 'INV-2026-103',
      hospitalId: 'hosp-1',
      patientId: 'pat-4',
      date: today,
      items: [
        { id: 'bi-6', category: 'Bed', description: 'General Ward A (GEN-101) — 2 Days', qty: 2, unitPrice: 2200, total: 4400 },
        { id: 'bi-7', category: 'Service', description: 'Physiotherapy & Post-Op Dressing', qty: 2, unitPrice: 750, total: 1500 },
      ],
      subtotal: 5900,
      discount: 0,
      tax: 295,
      totalAmount: 6195,
      paidAmount: 0,
      status: 'Pending',
      createdBy: 'Ananya Rao',
    },
  ];

  const payments: Payment[] = [
    {
      id: 'pay-1',
      receiptNumber: 'RCP-2026-101',
      billId: 'bill-1',
      patientId: 'pat-1',
      amount: 2950.5,
      method: 'UPI',
      transactionRef: 'UPI-4319827610',
      status: 'Completed',
      paidAt: `${yesterday}T12:25:00.000Z`,
      collectedBy: 'Ananya Rao',
    },
    {
      id: 'pay-2',
      receiptNumber: 'RCP-2026-102',
      billId: 'bill-2',
      patientId: 'pat-2',
      amount: 5000,
      method: 'Card',
      transactionRef: 'VISA-8812-AUTH99',
      status: 'Completed',
      paidAt: `${today}T09:10:00.000Z`,
      collectedBy: 'Neha Sharma',
    },
  ];

  const insuranceClaims: InsuranceClaim[] = [
    {
      id: 'clm-1',
      claimNumber: 'CLM-2026-041',
      billId: 'bill-2',
      patientId: 'pat-2',
      provider: 'Star Health & Allied Insurance',
      policyNumber: 'SH-BLR-8829104',
      claimAmount: 9805,
      approvedAmount: 0,
      status: 'Under Review',
      submittedAt: `${today}T09:30:00.000Z`,
      notes: 'Pre-authorization sent for Cardiac ICU stay.',
    },
  ];

  const refundRequests: RefundRequest[] = [
    {
      id: 'ref-1',
      refundNumber: 'REF-2026-011',
      billId: 'bill-1',
      patientId: 'pat-1',
      amount: 140,
      reason: 'Senior Wellness Discount adjustment on Lipid Panel',
      status: 'Requested',
      requestedBy: 'Ananya Rao',
      createdAt: `${today}T09:40:00.000Z`,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'not-1',
      roleTarget: ['doctor', 'receptionist'],
      type: 'appointment',
      title: 'Patient Checked-In: Ramesh Gowda',
      message: 'Token T-102 assigned for Dr. Sarah Jenkins (Cardiology).',
      readBy: [],
      createdAt: `${today}T09:45:00.000Z`,
    },
    {
      id: 'not-2',
      roleTarget: ['pharmacist'],
      type: 'prescription',
      title: 'New Prescription RX-2026-102',
      message: 'Metoprolol Succinate 50mg ordered for Divya Krishnan (ICU-01).',
      readBy: [],
      createdAt: `${today}T08:50:00.000Z`,
    },
    {
      id: 'not-3',
      roleTarget: ['lab_technician', 'doctor'],
      type: 'lab',
      title: 'STAT Lab Request: LAB-2026-102',
      message: 'High-Sensitivity Troponin-I sample SMP-9002 currently processing.',
      readBy: [],
      createdAt: `${today}T08:45:00.000Z`,
    },
    {
      id: 'not-4',
      userId: 'usr-patient-1',
      type: 'lab',
      title: 'Lab Report Published: Lipid Profile Panel',
      message: 'Your Lipid Profile Panel report (LAB-2026-101) is verified and ready to download.',
      readBy: [],
      createdAt: `${yesterday}T14:20:00.000Z`,
    },
    {
      id: 'not-5',
      roleTarget: ['accountant', 'hospital_admin'],
      type: 'payment',
      title: 'Advance Payment Recorded (₹5,000)',
      message: 'Card payment RCP-2026-102 received for invoice INV-2026-102.',
      readBy: [],
      createdAt: `${today}T09:10:00.000Z`,
    },
    {
      id: 'not-6',
      roleTarget: ['super_admin', 'hospital_admin', 'pharmacist'],
      type: 'system',
      title: 'Pharmacy Inventory Alert',
      message: 'Metoprolol Succinate 50mg is below reorder level (35 left). Salbutamol Inhaler has expired batch.',
      readBy: [],
      createdAt: `${today}T07:30:00.000Z`,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud-1',
      actorId: 'usr-recep',
      actorName: 'Ananya Rao',
      actorRole: 'receptionist',
      action: 'CHECK_IN',
      resource: 'Appointment',
      resourceId: 'CP-APT-1002',
      details: 'Checked in Ramesh Gowda and generated Queue Token T-102',
      createdAt: `${today}T09:45:00.000Z`,
    },
    {
      id: 'aud-2',
      actorId: 'usr-pharm',
      actorName: 'Karthik Iyer, B.Pharm',
      actorRole: 'pharmacist',
      action: 'DISPENSE',
      resource: 'Prescription',
      resourceId: 'RX-2026-101',
      details: 'Verified and dispensed 30x Amlodipine 5mg and 30x Atorvastatin 20mg',
      createdAt: `${yesterday}T12:10:00.000Z`,
    },
    {
      id: 'aud-3',
      actorId: 'usr-lab',
      actorName: 'Siddharth Verma',
      actorRole: 'lab_technician',
      action: 'PUBLISH_REPORT',
      resource: 'LabRequest',
      resourceId: 'LAB-2026-101',
      details: 'Verified and published Lipid Profile Panel for CP-PT-1001',
      createdAt: `${yesterday}T14:20:00.000Z`,
    },
  ];

  const systemConfig: SystemConfig = {
    platformName: 'CarePlus Health Network',
    supportEmail: 'it-support@careplus.org',
    maintenanceMode: false,
    defaultTaxRate: 5,
    sessionTimeoutMinutes: 60,
    passwordMinLength: 8,
    enforce2FA: false,
    backupRetentionDays: 30,
    lastBackupAt: `${yesterday}T23:00:00.000Z`,
    workingHoursStart: '08:00',
    workingHoursEnd: '20:00',
    appointmentSlotMinutes: 30,
    currencySymbol: '₹',
  };

  return {
    hospitals,
    departments,
    roles,
    users,
    doctors,
    staff,
    patients,
    appointments,
    queueTokens,
    consultations,
    vitals,
    medicationsAdmin,
    nursingNotes,
    dischargeRequests,
    medicines,
    prescriptions,
    labCatalog,
    labRequests,
    beds,
    bills,
    payments,
    insuranceClaims,
    refundRequests,
    notifications,
    auditLogs,
    systemConfig,
    counters: {
      patient: 1006,
      appointment: 1005,
      token: 103,
      prescription: 102,
      lab: 103,
      sample: 9002,
      bill: 103,
      receipt: 102,
      claim: 41,
      refund: 11,
      medicine: 106,
    },
  };
}

let cachedDb: CarePlusDatabase | null = null;

export function getDb(): CarePlusDatabase {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDb = JSON.parse(raw) as CarePlusDatabase;
      const legacyDoc = cachedDb.users.find((u) => u.id === 'usr-doc-1' && u.email === 'doctor@careplus.org');
      if (legacyDoc && !cachedDb.users.some((u) => u.email === 'sarah.jenkins@careplus.org')) {
        legacyDoc.email = 'sarah.jenkins@careplus.org';
        saveDb(cachedDb);
      }
      return cachedDb;
    } catch {
      // Fallback to fresh seed if corrupted
    }
  }
  cachedDb = buildInitialSeed();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: CarePlusDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
  cachedDb = db;
}

export function nextCode(db: CarePlusDatabase, counterKey: string, prefix: string): string {
  const next = (db.counters[counterKey] || 100) + 1;
  db.counters[counterKey] = next;
  return `${prefix}-${next}`;
}

export function addAuditLog(
  db: CarePlusDatabase,
  actor: { id: string; fullName: string; role: string },
  action: string,
  resource: string,
  resourceId: string,
  details: string,
): AuditLog {
  const entry: AuditLog = {
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    resource,
    resourceId,
    details,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) db.auditLogs.length = 500;
  return entry;
}

export function addNotification(
  db: CarePlusDatabase,
  params: {
    userId?: string;
    roleTarget?: UserRole[];
    type: AppNotification['type'];
    title: string;
    message: string;
  },
): AppNotification {
  const notif: AppNotification = {
    id: `not-${crypto.randomUUID().slice(0, 8)}`,
    userId: params.userId,
    roleTarget: params.roleTarget,
    type: params.type,
    title: params.title,
    message: params.message,
    readBy: [],
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notif);
  if (db.notifications.length > 300) db.notifications.length = 300;
  return notif;
}

export function recalculateBillTotals(bill: Bill, taxRate: number): void {
  bill.subtotal = Number(bill.items.reduce((acc, item) => acc + item.total, 0).toFixed(2));
  const taxable = Math.max(0, bill.subtotal - (bill.discount || 0));
  bill.tax = Number(((taxable * taxRate) / 100).toFixed(2));
  bill.totalAmount = Number((taxable + bill.tax).toFixed(2));
  if (bill.status !== 'Refunded') {
    if (bill.paidAmount >= bill.totalAmount && bill.totalAmount > 0) {
      bill.status = 'Paid';
    } else if (bill.paidAmount > 0) {
      bill.status = 'Partial';
    } else {
      bill.status = 'Pending';
    }
  }
}
