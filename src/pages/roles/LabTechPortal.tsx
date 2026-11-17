import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardCheck,
  FileCheck,
  FlaskConical,
  History,
  LayoutDashboard,
  Microscope,
  TestTube2,
} from 'lucide-react';
import { AppShell, type NavItem } from '../../components/AppShell';
import { DataTable, Modal, PageHeader, StatCard, StatusLabel, useToast } from '../../components/UI';
import { useAuth } from '../../context/AuthContext';
import type { LabRequest, LabResultRow } from '../../types/hms';
import { apiFetch } from '../../utils/api';
import { exportLabReportPDF } from '../../utils/export';
import { NotificationsPage, ProfilePage } from '../CommonPages';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'requests', label: 'Test Requests', icon: ClipboardCheck },
  { key: 'samples', label: 'Sample Collection', icon: TestTube2 },
  { key: 'processing', label: 'Test Processing', icon: Microscope },
  { key: 'reports', label: 'Laboratory Reports', icon: FileCheck },
  { key: 'history', label: 'Test History', icon: History },
];

type EnrichedLab = LabRequest & {
  patientName?: string;
  patientCode?: string;
  doctorName?: string;
  catalogParameters?: { parameter: string; unit: string; referenceRange: string }[];
};

export const LabTechPortal: React.FC<{ onOpenQueueDisplay: () => void }> = ({ onOpenQueueDisplay }) => {
  const { subscribeEvent } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState('dashboard');
  const [unreadTrigger, setUnreadTrigger] = useState(0);

  const [labs, setLabs] = useState<EnrichedLab[]>([]);
  const [processTarget, setProcessTarget] = useState<EnrichedLab | null>(null);
  const [observations, setObservations] = useState('');
  const [reportDoc, setReportDoc] = useState('');
  const [resultRows, setResultRows] = useState<LabResultRow[]>([]);

  const loadAll = useCallback(async () => {
    try {
      const res = await apiFetch<{ labRequests: EnrichedLab[] }>('/labs');
      setLabs(res.labRequests);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadAll();
    const unsub = subscribeEvent('lab:updated', loadAll);
    return () => unsub();
  }, [loadAll, subscribeEvent]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = labs.filter((l) => l.status === 'Requested');
  const samplesCollected = labs.filter((l) => l.status === 'Sample Collected');
  const inProgress = labs.filter((l) => ['Sample Collected', 'Processing', 'Pending Verification'].includes(l.status));
  const completed = labs.filter((l) => l.status === 'Published');
  const todayCount = labs.filter((l) => l.requestedAt.startsWith(today)).length;

  const collectSample = async (id: string) => {
    const res = await apiFetch<{ labRequest: LabRequest }>(`/labs/${id}/collect-sample`, { method: 'POST' });
    toast(`Sample collected · Assigned ID ${res.labRequest.sampleId}`, 'success');
    loadAll();
  };

  const openProcessor = (l: EnrichedLab) => {
    setProcessTarget(l);
    setObservations(l.observations || '');
    setReportDoc(l.reportDocumentName || `${l.requestCode}_LabSheet.pdf`);
    const initialRows =
      l.results && l.results.length > 0
        ? l.results
        : (l.catalogParameters || []).map((p) => ({
            parameter: p.parameter,
            value: '',
            unit: p.unit,
            referenceRange: p.referenceRange,
            flag: 'Normal' as const,
          }));
    setResultRows(initialRows);
  };

  const saveProcessing = async (nextStatus: LabRequest['status']) => {
    if (!processTarget) return;
    await apiFetch(`/labs/${processTarget.id}/process`, {
      method: 'PUT',
      body: JSON.stringify({
        status: nextStatus,
        observations,
        results: resultRows,
        reportDocumentName: reportDoc,
      }),
    });
    toast(
      nextStatus === 'Published' ? 'Report verified & published to doctor and patient' : `Lab status updated to ${nextStatus}`,
      'success',
    );
    setProcessTarget(null);
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

      {page === 'dashboard' && (
        <div className="space-y-6">
          <PageHeader title="Diagnostic Laboratory Dashboard" subtitle="Manage doctor test orders, sample collections, analyzer values, and verified report publishing." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Pending Test Requests" value={pending.length} tone="amber" onClick={() => setPage('requests')} />
            <StatCard label="Tests In Progress" value={inProgress.length} tone="blue" onClick={() => setPage('processing')} />
            <StatCard label="Completed & Published" value={completed.length} tone="teal" onClick={() => setPage('reports')} />
            <StatCard label="Today's Requests" value={todayCount} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-semibold text-slate-900">Active Diagnostic Queue</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {labs.filter((l) => l.status !== 'Published').map((l) => (
                <div key={l.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900"><span className="font-mono text-sky-700">{l.requestCode}</span> · {l.testName}</p>
                    <p className="text-slate-500">{l.patientName} ({l.patientCode}) · Priority: {l.priority}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusLabel status={l.status} />
                    {l.status === 'Requested' ? (
                      <button type="button" onClick={() => collectSample(l.id)} className="px-3 py-1.5 font-semibold text-white bg-sky-600 rounded-md">
                        Collect Sample
                      </button>
                    ) : (
                      <button type="button" onClick={() => openProcessor(l)} className="px-3 py-1.5 font-semibold text-white bg-teal-600 rounded-md">
                        Process / Verify
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {labs.filter((l) => l.status !== 'Published').length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">All pending lab requests are verified and published.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {page === 'requests' && (
        <div className="space-y-6">
          <PageHeader title="Doctor-Requested Lab Tests" subtitle="Review incoming investigation orders prioritized by Routine, Urgent, and STAT." />
          <DataTable
            data={labs}
            rowKey={(l) => l.id}
            searchFilter={(l, q) => l.requestCode.toLowerCase().includes(q) || l.testName.toLowerCase().includes(q) || (l.patientName || '').toLowerCase().includes(q)}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'pat', header: 'Patient', render: (l) => `${l.patientName} (${l.patientCode})` },
              { key: 'test', header: 'Test Type', render: (l) => `${l.testName} (${l.testCategory})` },
              { key: 'prio', header: 'Priority', render: (l) => <StatusLabel status={l.priority} /> },
              { key: 'date', header: 'Requested', render: (l) => <span className="font-mono text-xs">{l.requestedAt.slice(0, 10)}</span> },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
            ]}
          />
        </div>
      )}

      {page === 'samples' && (
        <div className="space-y-6">
          <PageHeader title="Sample Collection Tracking" subtitle="Collect specimens, assign unique Sample IDs, and log collection timestamps." />
          <DataTable
            data={labs.filter((l) => l.status === 'Requested' || l.status === 'Sample Collected')}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'pat', header: 'Patient', render: (l) => `${l.patientName} (${l.patientCode})` },
              { key: 'test', header: 'Test', render: (l) => l.testName },
              { key: 'smp', header: 'Sample ID', render: (l) => <span className="font-mono text-xs font-bold text-teal-700">{l.sampleId || 'Pending'}</span> },
              { key: 'time', header: 'Collection Time', render: (l) => l.sampleCollectedAt ? <span className="font-mono text-xs">{new Date(l.sampleCollectedAt).toLocaleString()}</span> : '—' },
              {
                key: 'act',
                header: 'Action',
                align: 'right',
                render: (l) =>
                  l.status === 'Requested' ? (
                    <button type="button" onClick={() => collectSample(l.id)} className="px-3 py-1 text-xs font-semibold text-white bg-sky-600 rounded-md">
                      Record Collection
                    </button>
                  ) : (
                    <StatusLabel status="Sample Collected" />
                  ),
              },
            ]}
          />
        </div>
      )}

      {page === 'processing' && (
        <div className="space-y-6">
          <PageHeader title="Test Processing & Result Entry" subtitle="Enter quantitative test values, reference flags, clinical observations, and upload report metadata." />
          <DataTable
            data={inProgress}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'smp', header: 'Sample ID', render: (l) => <span className="font-mono text-xs">{l.sampleId}</span> },
              { key: 'pat', header: 'Patient', render: (l) => l.patientName },
              { key: 'test', header: 'Test', render: (l) => l.testName },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
              {
                key: 'act',
                header: 'Process',
                align: 'right',
                render: (l) => (
                  <button type="button" onClick={() => openProcessor(l)} className="px-3 py-1 text-xs font-semibold text-white bg-teal-600 rounded-md">
                    Enter Values
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      {page === 'reports' && (
        <div className="space-y-6">
          <PageHeader title="Laboratory Reports Verification & Publishing" subtitle="Verify reference ranges and publish completed diagnostic reports to physicians and patients." />
          <DataTable
            data={labs.filter((l) => l.status === 'Pending Verification' || l.status === 'Published')}
            rowKey={(l) => l.id}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'pat', header: 'Patient', render: (l) => l.patientName },
              { key: 'test', header: 'Test', render: (l) => l.testName },
              { key: 'ver', header: 'Verified By', render: (l) => l.verifiedBy || 'Awaiting Verification' },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
              {
                key: 'act',
                header: 'Actions',
                align: 'right',
                render: (l) =>
                  l.status === 'Pending Verification' ? (
                    <button type="button" onClick={() => openProcessor(l)} className="text-xs font-semibold text-teal-700 hover:underline">
                      Verify & Publish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        exportLabReportPDF({
                          requestCode: l.requestCode,
                          testName: l.testName,
                          patientName: l.patientName || '',
                          patientCode: l.patientCode || '',
                          doctorName: l.doctorName || '',
                          sampleId: l.sampleId,
                          publishedAt: l.publishedAt,
                          verifiedBy: l.verifiedBy,
                          observations: l.observations,
                          results: l.results,
                        })
                      }
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Download Report PDF
                    </button>
                  ),
              },
            ]}
          />
        </div>
      )}

      {page === 'history' && (
        <div className="space-y-6">
          <PageHeader title="Diagnostic Test History" subtitle="Search all completed and pending laboratory investigations." />
          <DataTable
            data={labs}
            rowKey={(l) => l.id}
            searchFilter={(l, q) => l.requestCode.toLowerCase().includes(q) || (l.patientName || '').toLowerCase().includes(q) || l.testName.toLowerCase().includes(q)}
            columns={[
              { key: 'code', header: 'Order #', render: (l) => <span className="font-mono text-xs font-semibold">{l.requestCode}</span> },
              { key: 'pat', header: 'Patient', render: (l) => `${l.patientName} (${l.patientCode})` },
              { key: 'test', header: 'Test', render: (l) => l.testName },
              { key: 'smp', header: 'Sample', render: (l) => <span className="font-mono text-xs">{l.sampleId || '—'}</span> },
              { key: 'status', header: 'Status', render: (l) => <StatusLabel status={l.status} /> },
              {
                key: 'pdf',
                header: 'Report',
                align: 'right',
                render: (l) =>
                  l.status === 'Published' ? (
                    <button
                      type="button"
                      onClick={() =>
                        exportLabReportPDF({
                          requestCode: l.requestCode,
                          testName: l.testName,
                          patientName: l.patientName || '',
                          patientCode: l.patientCode || '',
                          doctorName: l.doctorName || '',
                          sampleId: l.sampleId,
                          publishedAt: l.publishedAt,
                          verifiedBy: l.verifiedBy,
                          observations: l.observations,
                          results: l.results,
                        })
                      }
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      PDF
                    </button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      <Modal open={Boolean(processTarget)} onClose={() => setProcessTarget(null)} title={`Process & Verify — ${processTarget?.requestCode || ''}`} maxWidth="max-w-2xl">
        {processTarget && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Patient: <strong>{processTarget.patientName}</strong> · Test: <strong>{processTarget.testName}</strong> · Sample: <strong className="font-mono">{processTarget.sampleId}</strong>
            </p>
            <div className="space-y-2">
              {resultRows.map((row, idx) => (
                <div key={row.parameter} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-900 sm:col-span-2">{row.parameter} <span className="text-slate-400">({row.referenceRange} {row.unit})</span></span>
                  <input
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => setResultRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                  />
                  <select
                    value={row.flag}
                    onChange={(e) => setResultRows((prev) => prev.map((r, i) => (i === idx ? { ...r, flag: e.target.value as LabResultRow['flag'] } : r)))}
                    className="px-2 py-1.5 border border-slate-300 rounded bg-white sm:col-span-2"
                  >
                    <option>Normal</option><option>High</option><option>Low</option><option>Critical</option>
                  </select>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Technical Observations</label>
              <textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Report Document Attachment Name</label>
              <input type="text" value={reportDoc} onChange={(e) => setReportDoc(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => saveProcessing('Pending Verification')} className="px-4 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg">
                Submit for Verification
              </button>
              <button type="button" onClick={() => saveProcessing('Published')} className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700">
                Verify & Publish Report
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
};
