import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { BarChart, DonutBreakdown, TrendChart } from './Charts';
import { DataTable, PageHeader, StatCard, type ColumnDef } from './UI';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/api';
import { exportTableToPDF, exportToExcel } from '../utils/export';

interface AnalyticsPayload {
  revenueByCategory: { category: string; amount: number }[];
  doctorPerformance: {
    doctorId: string;
    doctorName: string;
    department: string;
    totalAppointments: number;
    completedConsultations: number;
    prescriptionsIssued: number;
    revenueGenerated: number;
  }[];
  queueWaitAnalysis: { department: string; tokens: number; avgWaitMinutes: number }[];
  labStats: { total: number; requested: number; processing: number; published: number };
  pharmacyStats: { totalSkus: number; totalUnits: number; inventoryValue: number; lowStock: number; expired: number };
  bedOccupancy: { total: number; occupied: number; available: number; maintenance: number };
  patientGrowth: { label: string; registrations: number; appointments: number; revenue: number }[];
}

export const AnalyticsReportView: React.FC<{ title?: string; subtitle?: string }> = ({
  title = 'Reports & Analytics',
  subtitle = 'Operational performance, clinical throughput, revenue trends, and resource utilization.',
}) => {
  const { systemConfig } = useAuth();
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    apiFetch<AnalyticsPayload>('/reports/analytics')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={title} subtitle={subtitle} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const currency = systemConfig.currencySymbol;
  const totalRevenue = data.revenueByCategory.reduce((s, r) => s + r.amount, 0);

  const doctorColumns: ColumnDef<AnalyticsPayload['doctorPerformance'][number]>[] = [
    { key: 'name', header: 'Physician', sortValue: (r) => r.doctorName, render: (r) => <span className="font-semibold text-slate-900">{r.doctorName}</span> },
    { key: 'dept', header: 'Department', sortValue: (r) => r.department, render: (r) => r.department },
    { key: 'apts', header: 'Appointments', align: 'right', sortValue: (r) => r.totalAppointments, render: (r) => r.totalAppointments },
    { key: 'comp', header: 'Completed', align: 'right', sortValue: (r) => r.completedConsultations, render: (r) => r.completedConsultations },
    { key: 'rx', header: 'Prescriptions', align: 'right', sortValue: (r) => r.prescriptionsIssued, render: (r) => r.prescriptionsIssued },
    {
      key: 'rev',
      header: 'Consultation Revenue',
      align: 'right',
      sortValue: (r) => r.revenueGenerated,
      render: (r) => `${currency}${r.revenueGenerated.toLocaleString()}`,
    },
  ];

  const handleExportPDF = () => {
    exportTableToPDF(
      `CarePlus_Analytics_${period}`,
      `${title} (${period.toUpperCase()})`,
      `Revenue Total: ${currency}${totalRevenue.toLocaleString()} · Bed Occupancy: ${data.bedOccupancy.occupied}/${data.bedOccupancy.total}`,
      ['Physician', 'Department', 'Appointments', 'Completed', 'Prescriptions', 'Revenue'],
      data.doctorPerformance.map((d) => [
        d.doctorName,
        d.department,
        d.totalAppointments,
        d.completedConsultations,
        d.prescriptionsIssued,
        `${currency}${d.revenueGenerated.toLocaleString()}`,
      ]),
    );
  };

  const handleExportExcel = () => {
    exportToExcel(
      `CarePlus_Analytics_${period}`,
      'Doctor Performance',
      data.doctorPerformance.map((d) => ({
        Physician: d.doctorName,
        Department: d.department,
        Appointments: d.totalAppointments,
        Completed: d.completedConsultations,
        Prescriptions: d.prescriptionsIssued,
        Revenue: d.revenueGenerated,
      })),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize ${
                    period === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Billed Revenue Breakdown" value={`${currency}${totalRevenue.toLocaleString()}`} tone="blue" helper="Across all clinical services" />
        <StatCard label="Pharmacy Inventory Value" value={`${currency}${data.pharmacyStats.inventoryValue.toLocaleString()}`} tone="teal" helper={`${data.pharmacyStats.totalUnits} units · ${data.pharmacyStats.lowStock} low stock`} />
        <StatCard label="Diagnostic Lab Volume" value={data.labStats.total} helper={`${data.labStats.published} published · ${data.labStats.processing} in progress`} />
        <StatCard label="Bed Occupancy" value={`${data.bedOccupancy.occupied} / ${data.bedOccupancy.total}`} tone="amber" helper={`${data.bedOccupancy.available} beds ready`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendChart
          title="Revenue Trend"
          subtitle="Daily collections trajectory"
          points={data.patientGrowth.map((p) => ({ label: p.label, value: p.revenue }))}
          valuePrefix={currency}
        />
        <BarChart
          title="Revenue by Clinical Stream"
          subtitle="Billed service categories"
          data={data.revenueByCategory.map((r) => ({ label: r.category, value: r.amount }))}
          valuePrefix={currency}
        />
        <DonutBreakdown
          title="Bed & Lab Distribution"
          segments={[
            { label: 'Occupied Beds', value: data.bedOccupancy.occupied, color: '#0284C7' },
            { label: 'Available Beds', value: data.bedOccupancy.available, color: '#0D9488' },
            { label: 'Published Labs', value: data.labStats.published, color: '#16A34A' },
            { label: 'Pending Labs', value: data.labStats.requested + data.labStats.processing, color: '#D97706' },
          ]}
        />
      </div>

      <BarChart
        title="Queue Waiting-Time Analysis by Department"
        subtitle="Average estimated wait minutes across active outpatient queues"
        data={data.queueWaitAnalysis.map((q) => ({
          label: q.department,
          value: q.avgWaitMinutes,
          secondary: `${q.tokens} token(s)`,
        }))}
        color="#0D9488"
      />

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Doctor Clinical Performance</h3>
        <DataTable
          data={data.doctorPerformance}
          columns={doctorColumns}
          rowKey={(r) => r.doctorId}
          searchFilter={(r, q) => r.doctorName.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)}
          searchPlaceholder="Filter physician or department..."
        />
      </div>
    </div>
  );
};
