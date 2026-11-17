import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock, Stethoscope, Users } from 'lucide-react';
import { CarePlusLogo, StatusLabel } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';

interface PublicQueueToken {
  id: string;
  tokenNumber: string;
  patientDisplay: string;
  doctorId: string;
  doctorName: string;
  doctorAvailable: boolean;
  departmentId: string;
  departmentName: string;
  floor: string;
  status: string;
  estimatedWaitMinutes: number;
}

interface PublicDoctor {
  id: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  available: boolean;
}

export const QueueDisplayPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { subscribeEvent, wsConnected } = useAuth();
  const [hospitalName, setHospitalName] = useState('CarePlus Central Medical Center');
  const [tokens, setTokens] = useState<PublicQueueToken[]>([]);
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());

  const loadQueue = useCallback(async () => {
    try {
      const data = await apiFetch<{ hospitalName: string; tokens: PublicQueueToken[]; doctors: PublicDoctor[] }>('/queue/public');
      setHospitalName(data.hospitalName);
      setTokens(data.tokens);
      setDoctors(data.doctors);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const unsub = subscribeEvent('queue:updated', () => {
      loadQueue();
    });
    const timer = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [loadQueue, subscribeEvent]);

  const departments = Array.from(new Set(doctors.map((d) => d.departmentName).filter(Boolean)));
  const filteredTokens = selectedDept === 'all' ? tokens : tokens.filter((t) => t.departmentName === selectedDept);

  const activeTokens = filteredTokens.filter((t) => t.status === 'Called' || t.status === 'In Consultation');
  const waitingTokens = filteredTokens.filter((t) => t.status === 'Waiting');
  const skippedTokens = filteredTokens.filter((t) => t.status === 'Skipped');

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CarePlusLogo size={34} />
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-white">{hospitalName}</h1>
            <p className="text-xs text-slate-400">Outpatient Waiting Area Queue Display</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-teal-400' : 'bg-amber-400'}`} />
            <span>{wsConnected ? 'Live WebSocket Sync' : 'Reconnecting'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold text-white">{clock}</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Display</span>
          </button>
        </div>
      </header>

      {/* Department Filter Bar */}
      <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedDept('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            selectedDept === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          All Departments
        </button>
        {departments.map((dept) => (
          <button
            key={dept}
            type="button"
            onClick={() => setSelectedDept(dept)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              selectedDept === dept ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Now Serving & Called */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-teal-400 tracking-wide uppercase mb-4">Now Serving & Called</h2>
            {activeTokens.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">No tokens currently called in this view.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeTokens.map((t) => (
                  <div key={t.id} className="rounded-xl bg-slate-950 border border-teal-500/40 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono tabular-nums text-4xl font-extrabold text-teal-400">{t.tokenNumber}</span>
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-semibold text-white">{t.patientDisplay}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {t.doctorName} · {t.departmentName} ({t.floor})
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Doctor Availability Strip */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-white">Physician Consultation Availability</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {doctors.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-white">{doc.fullName}</p>
                    <p className="text-xs text-slate-400">{doc.departmentName}</p>
                  </div>
                  <StatusLabel status={doc.available ? 'Available' : 'Unavailable'} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Waiting Queue & Skipped */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Waiting Queue</h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">{waitingTokens.length} waiting</span>
            </div>

            {waitingTokens.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Waiting queue is currently clear.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {waitingTokens.map((t) => (
                  <div key={t.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="font-mono tabular-nums text-xl font-bold text-sky-400 w-16">{t.tokenNumber}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{t.patientDisplay}</p>
                        <p className="text-xs text-slate-400">{t.doctorName} · {t.departmentName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-amber-300">
                        <Clock className="w-3.5 h-3.5" />
                        ~{t.estimatedWaitMinutes} min
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {skippedTokens.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">Skipped / Please Report to Reception</h3>
              <div className="flex flex-wrap gap-2">
                {skippedTokens.map((t) => (
                  <span key={t.id} className="px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-500/30 font-mono text-sm text-amber-300">
                    {t.tokenNumber} · {t.patientDisplay}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
