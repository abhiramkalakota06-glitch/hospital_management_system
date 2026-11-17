/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CarePlusLogo, ToastProvider } from './components/UI';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { QueueDisplayPage } from './pages/QueueDisplayPage';
import { AccountantPortal } from './pages/roles/AccountantPortal';
import { DoctorPortal } from './pages/roles/DoctorPortal';
import { HospitalAdminPortal } from './pages/roles/HospitalAdminPortal';
import { LabTechPortal } from './pages/roles/LabTechPortal';
import { NursePortal } from './pages/roles/NursePortal';
import { PatientPortal } from './pages/roles/PatientPortal';
import { PharmacistPortal } from './pages/roles/PharmacistPortal';
import { ReceptionistPortal } from './pages/roles/ReceptionistPortal';
import { SuperAdminPortal } from './pages/roles/SuperAdminPortal';

const CarePlusRouter: React.FC = () => {
  const { user, loading } = useAuth();
  const [queueDisplayOpen, setQueueDisplayOpen] = useState(
    () => window.location.pathname === '/queue-display' || window.location.hash === '#queue-display',
  );

  if (queueDisplayOpen) {
    return <QueueDisplayPage onBack={() => setQueueDisplayOpen(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <CarePlusLogo size={42} />
        <p className="text-sm font-medium text-slate-600">Loading CarePlus Clinical Workspace...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onOpenQueueDisplay={() => setQueueDisplayOpen(true)} />;
  }

  const openQueue = () => setQueueDisplayOpen(true);

  switch (user.role) {
    case 'super_admin':
      return <SuperAdminPortal onOpenQueueDisplay={openQueue} />;
    case 'hospital_admin':
      return <HospitalAdminPortal onOpenQueueDisplay={openQueue} />;
    case 'receptionist':
      return <ReceptionistPortal onOpenQueueDisplay={openQueue} />;
    case 'doctor':
      return <DoctorPortal onOpenQueueDisplay={openQueue} />;
    case 'nurse':
      return <NursePortal onOpenQueueDisplay={openQueue} />;
    case 'pharmacist':
      return <PharmacistPortal onOpenQueueDisplay={openQueue} />;
    case 'lab_technician':
      return <LabTechPortal onOpenQueueDisplay={openQueue} />;
    case 'accountant':
      return <AccountantPortal onOpenQueueDisplay={openQueue} />;
    case 'patient':
      return <PatientPortal />;
    default:
      return <LoginPage onOpenQueueDisplay={openQueue} />;
  }
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CarePlusRouter />
      </AuthProvider>
    </ToastProvider>
  );
}
