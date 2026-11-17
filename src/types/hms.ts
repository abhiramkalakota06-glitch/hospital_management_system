export type UserRole =
  | 'super_admin'
  | 'hospital_admin'
  | 'receptionist'
  | 'doctor'
  | 'nurse'
  | 'pharmacist'
  | 'lab_technician'
  | 'accountant'
  | 'patient';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  hospital_admin: 'Hospital Admin',
  receptionist: 'Receptionist',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pharmacist: 'Pharmacist',
  lab_technician: 'Laboratory Technician',
  accountant: 'Accountant / Billing Staff',
  patient: 'Patient',
};

export interface PermissionMatrix {
  pages: string[];
  actions: {
    [resource: string]: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
    };
  };
}

export interface RoleDefinition {
  id: string;
  key: UserRole | string;
  name: string;
  description: string;
  permissions: PermissionMatrix;
}

export interface NotificationPreferences {
  appointments: boolean;
  prescriptions: boolean;
  labResults: boolean;
  billing: boolean;
  system: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  hospitalId: string;
  departmentId?: string;
  designation: string;
  employeeOrPatientId: string;
  phone: string;
  address: string;
  avatarUrl?: string;
  active: boolean;
  activated: boolean;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
}

export interface HospitalBranch {
  id: string;
  name: string;
  address: string;
  phone: string;
}

export interface Hospital {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  bedCapacity: number;
  active: boolean;
  branches: HospitalBranch[];
  createdAt: string;
}

export interface Department {
  id: string;
  hospitalId: string;
  code: string;
  name: string;
  headDoctorId?: string;
  description: string;
  floor: string;
  active: boolean;
}

export interface DoctorSchedule {
  workingDays: string[];
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
  slotDurationMinutes: number;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface DoctorProfile {
  id: string;
  userId: string;
  hospitalId: string;
  departmentId: string;
  fullName: string;
  specialization: string;
  qualifications: string;
  consultationFee: number;
  available: boolean;
  avatarUrl?: string;
  schedule: DoctorSchedule;
  leaveRequests: LeaveRequest[];
}

export interface StaffProfile {
  id: string;
  userId: string;
  hospitalId: string;
  departmentId: string;
  fullName: string;
  role: UserRole;
  designation: string;
  shift: 'Morning (07:00 - 15:00)' | 'Evening (15:00 - 23:00)' | 'Night (23:00 - 07:00)';
  available: boolean;
  phone: string;
}

export interface Patient {
  id: string;
  patientCode: string;
  userId?: string;
  hospitalId: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other';
  phone: string;
  email: string;
  address: string;
  emergencyContact: string;
  bloodGroup: string;
  allergies: string[];
  existingConditions: string[];
  status: 'Outpatient' | 'Admitted' | 'Discharged';
  assignedDoctorId?: string;
  assignedNurseId?: string;
  bedId?: string;
  admissionDate?: string;
  admissionNotes?: string;
  registeredAt: string;
}

export type AppointmentStatus =
  | 'Pending'
  | 'Approved'
  | 'Checked-In'
  | 'In Consultation'
  | 'Completed'
  | 'Cancelled'
  | 'Absent'
  | 'Reschedule Requested';

export interface Appointment {
  id: string;
  appointmentNumber: string;
  hospitalId: string;
  patientId: string;
  departmentId: string;
  doctorId: string;
  date: string;
  timeSlot: string;
  reason: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus =
  | 'Waiting'
  | 'Called'
  | 'In Consultation'
  | 'Completed'
  | 'Skipped'
  | 'Cancelled';

export interface QueueToken {
  id: string;
  tokenNumber: string;
  hospitalId: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  status: QueueStatus;
  estimatedWaitMinutes: number;
  checkInTime: string;
  calledTime?: string;
  completedTime?: string;
}

export interface VitalSignsSnapshot {
  bloodPressure: string;
  temperature: string;
  pulseRate: string;
  respiratoryRate: string;
  oxygenSaturation: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  appointmentId?: string;
  doctorId: string;
  date: string;
  complaints: string;
  symptoms: string;
  vitalSigns: VitalSignsSnapshot;
  physicalExam: string;
  diagnosis: string;
  treatmentPlan: string;
  doctorNotes: string;
  followUpDate?: string;
  createdAt: string;
}

export interface VitalRecord extends VitalSignsSnapshot {
  id: string;
  patientId: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  notes?: string;
}

export interface MedicationAdminRecord {
  id: string;
  patientId: string;
  prescriptionId?: string;
  medicineName: string;
  dosage: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Administered' | 'Missed';
  administeredBy?: string;
  administeredAt?: string;
  notes?: string;
}

export interface NursingNote {
  id: string;
  patientId: string;
  nurseId: string;
  nurseName: string;
  condition: 'Stable' | 'Improving' | 'Needs Attention' | 'Critical';
  observation: string;
  progressNote: string;
  escalated: boolean;
  createdAt: string;
}

export interface DischargeRequest {
  id: string;
  patientId: string;
  doctorId: string;
  dischargeSummary: string;
  treatmentInstructions: string;
  billingCleared: boolean;
  nursingChecklistDone: boolean;
  status: 'Requested' | 'Cleared' | 'Completed';
  createdAt: string;
  completedAt?: string;
}

export interface Medicine {
  id: string;
  medicineCode: string;
  name: string;
  category: string;
  manufacturer: string;
  batchNumber: string;
  quantity: number;
  reorderLevel: number;
  expiryDate: string;
  purchasePrice: number;
  sellingPrice: number;
  updatedAt: string;
}

export interface PrescriptionItem {
  medicineId?: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

export interface Prescription {
  id: string;
  prescriptionCode: string;
  patientId: string;
  doctorId: string;
  consultationId?: string;
  date: string;
  items: PrescriptionItem[];
  status: 'Pending' | 'Verified' | 'Dispensed';
  verifiedBy?: string;
  dispensedBy?: string;
  dispensedAt?: string;
}

export interface LabTestCatalogItem {
  id: string;
  code: string;
  name: string;
  category: 'Blood' | 'Urine' | 'Imaging' | 'Microbiology' | 'Biochemistry';
  price: number;
  sampleType: string;
  parameters: { parameter: string; unit: string; referenceRange: string }[];
}

export interface LabResultRow {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: 'Normal' | 'High' | 'Low' | 'Critical';
}

export interface LabRequest {
  id: string;
  requestCode: string;
  patientId: string;
  doctorId: string;
  testCatalogId: string;
  testName: string;
  testCategory: string;
  priority: 'Routine' | 'Urgent' | 'STAT';
  price: number;
  status: 'Requested' | 'Sample Collected' | 'Processing' | 'Pending Verification' | 'Published';
  sampleId?: string;
  sampleCollectedAt?: string;
  sampleCollectedBy?: string;
  observations?: string;
  results: LabResultRow[];
  reportDocumentName?: string;
  verifiedBy?: string;
  requestedAt: string;
  publishedAt?: string;
}

export interface Bed {
  id: string;
  hospitalId: string;
  bedNumber: string;
  wardName: string;
  wardType: 'ICU' | 'General' | 'Private' | 'Emergency';
  dailyRate: number;
  status: 'Available' | 'Occupied' | 'Maintenance';
  patientId?: string;
  assignedAt?: string;
}

export interface BillLineItem {
  id: string;
  category: 'Consultation' | 'Laboratory' | 'Pharmacy' | 'Bed' | 'Service';
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Bill {
  id: string;
  billNumber: string;
  hospitalId: string;
  patientId: string;
  date: string;
  items: BillLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  status: 'Pending' | 'Partial' | 'Paid' | 'Refunded';
  createdBy: string;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  billId: string;
  patientId: string;
  amount: number;
  method: 'Cash' | 'Card' | 'UPI' | 'Online';
  transactionRef: string;
  status: 'Completed' | 'Pending' | 'Failed';
  paidAt: string;
  collectedBy: string;
}

export interface InsuranceClaim {
  id: string;
  claimNumber: string;
  billId: string;
  patientId: string;
  provider: string;
  policyNumber: string;
  claimAmount: number;
  approvedAmount: number;
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Settled';
  submittedAt: string;
  notes?: string;
}

export interface RefundRequest {
  id: string;
  refundNumber: string;
  billId: string;
  patientId: string;
  amount: number;
  reason: string;
  status: 'Requested' | 'Approved' | 'Rejected' | 'Processed';
  requestedBy: string;
  approvedBy?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId?: string;
  roleTarget?: UserRole[];
  type: 'appointment' | 'registration' | 'prescription' | 'lab' | 'payment' | 'system';
  title: string;
  message: string;
  readBy: string[];
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  createdAt: string;
}

export interface SystemConfig {
  platformName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultTaxRate: number;
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  enforce2FA: boolean;
  backupRetentionDays: number;
  lastBackupAt: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  appointmentSlotMinutes: number;
  currencySymbol: string;
}
