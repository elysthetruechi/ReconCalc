import React, { useState, useMemo } from "react";
import {
  CheckCircle2, AlertTriangle, ChevronDown, Upload, FileEdit,
  Plug, Check
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import "./ReconciliationCalculator.css";
/* DESIGN TOKENS
   Ledger-paper system: pale green-tinted paper (real columnar-pad
   colour), ink text, hairline rules, slate-blue "correction ink"
   accent, and a restrained three-colour signal set used only for
   status, never decoration. */
const T = {
  paper: "#EDF1EA",
  paperRaised: "#F5F7F3",
  ink: "#1C2321",
  inkMuted: "#55645A",
  line: "#C7D2C2",
  lineStrong: "#9FB09A",
  accent: "#2C4A6E",
  good: "#1F6F4C",
  medium: "#A9781F",
  critical: "#9B3B2B",
};

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

/* A mock data for now shaped exactly like the FastAPI response models
   (KPISnapshotOut / PeriodOut / ExceptionOut) so wiring this to
   the real backend later is a fetch() swap, not a rewrite. */
const ACCOUNTS = [
  { id: "acc-1", name: "Current Account — NGN" },
  { id: "acc-2", name: "Settlement Account — USD" },
];

const PERIODS = [
  { id: "p-jun", label: "Jun 2026", start_date: "2026-06-01" },
  { id: "p-jul", label: "Jul 2026", start_date: "2026-07-01" },
];

const KPI_HISTORY = [
  { period: "Feb", rar: 92.1, uvr: 4.2, ftis: 81.4 },
  { period: "Mar", rar: 93.8, uvr: 3.6, ftis: 84.0 },
  { period: "Apr", rar: 95.0, uvr: 2.9, ftis: 87.2 },
  { period: "May", rar: 96.4, uvr: 2.1, ftis: 89.8 },
  { period: "Jun", rar: 97.5, uvr: 1.4, ftis: 92.6 },
  { period: "Jul", rar: 98.1, uvr: 0.9, ftis: 94.3 },
];

const CURRENT_KPI = {
  total_ledger_count: 5000,
  total_statement_count: 5500,
  matched_count: 6200,
  total_ledger_value: 5_000_000_000,
  total_statement_value: 5_200_000_000,
  unmatched_value: 92_000_000,
  rar: 98.1,
  uvr: 0.9,
  amer: 96.4,
  rvi: 88.7,
  ftis: 94.3,
};

const EXCEPTIONS = [
  { id: "e1", source: "ledger", category: "missing_counterpart", variance: null, created_at: "2026-07-28", sla_deadline: "2026-07-31", resolved_at: null },
  { id: "e2", source: "combined", category: "amount_mismatch", variance: -1250.0, created_at: "2026-07-27", sla_deadline: "2026-07-30", resolved_at: null },
  { id: "e3", source: "statement", category: "missing_counterpart", variance: null, created_at: "2026-07-25", sla_deadline: "2026-07-28", resolved_at: "2026-07-27" },
  { id: "e4", source: "combined", category: "amount_mismatch", variance: 340.5, created_at: "2026-07-20", sla_deadline: "2026-07-23", resolved_at: "2026-07-26" },
  { id: "e5", source: "ledger", category: "missing_counterpart", variance: null, created_at: "2026-07-18", sla_deadline: "2026-07-21", resolved_at: "2026-07-19" },
];

/*FORMATTERS */
const fmtNGN = (v) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(v);
const fmtNum = (v) => new Intl.NumberFormat("en-NG").format(v);
const fmtPct = (v) => `${v.toFixed(1)}%`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function signalFor(value, thresholds, inverted = false) {
  const { good, medium } = thresholds;
  if (inverted) {
    if (value <= good) return T.good;
    if (value <= medium) return T.medium;
    return T.critical;
  }
  if (value >= good) return T.good;
  if (value >= medium) return T.medium;
  return T.critical;
}

const THRESHOLDS = {
  rar: { good: 98, medium: 90 },
  uvr: { good: 1, medium: 3, inverted: true },
  amer: { good: 95, medium: 80 },
  rvi: { good: 85, medium: 65 },
};

/*
   SMALL PIECES */

// The signature element: classic accounting double-underline
// under a grand total figure.
function DoubleRule({ color = T.ink }) {
  return (
    <div
      style={{
        height: 4,
        marginTop: 6,
        borderBottom: `2px solid ${color}`,
        boxShadow: `0 4px 0 -1px ${color}`,
      }}
    />
  );
}

// Hand-tick check mark for matched/resolved rows, a small diagonal
function TickMark({ color = T.good, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 8.5 L6.5 13 L14 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dropdown({ value, options, onChange, labelKey = "name" }) {
  return (
    <div className="recon-dropdown-wrap">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: "'Inter', sans-serif",
          color: T.ink,
          background: "transparent",
          border: `1px solid ${T.line}`,
        }}
        className="recon-dropdown"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o[labelKey]}</option>
        ))}
      </select>
      <ChevronDown size={14} className="recon-dropdown-chevron" />
    </div>
  );
}

function KpiBlock({ label, value, target, formula, color }) {
  return (
    <div className="recon-kpi-block">
      <div className="recon-kpi-label-row">
        <span
          style={{ background: color }}
          className="recon-dot"
        />
        <span style={{ color: T.inkMuted, fontFamily: "'Inter', sans-serif" }} className="recon-label">
          {label}
        </span>
      </div>
      <div
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.ink, fontVariantNumeric: "tabular-nums" }}
        className="recon-kpi-value"
      >
        {value}
      </div>
      <DoubleRule color={T.line} />
      <div style={{ color: T.inkMuted, fontFamily: "'Inter', sans-serif" }} className="recon-kpi-target">
        {target}
      </div>
    </div>
  );
}

const SOURCE_LABEL = { ledger: "Ledger", statement: "Statement", combined: "Combined" };
const CATEGORY_LABEL = { missing_counterpart: "No counterpart", amount_mismatch: "Amount mismatch", unresolved: "Unresolved" };

function ExceptionRow({ exc, onResolve }) {
  const isResolved = !!exc.resolved_at;
  const withinSla = isResolved && new Date(exc.resolved_at) <= new Date(exc.sla_deadline);
  const overdue = !isResolved && new Date() > new Date(exc.sla_deadline);

  let statusColor = T.medium;
  let statusLabel = "Open";
  if (isResolved) {
    statusColor = withinSla ? T.good : T.medium;
    statusLabel = withinSla ? "Resolved · within SLA" : "Resolved · late";
  } else if (overdue) {
    statusColor = T.critical;
    statusLabel = "Overdue";
  }

  return (
    <tr style={{ borderBottom: `1px solid ${T.line}` }}>
      <td style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
        {SOURCE_LABEL[exc.source]}
      </td>
      <td style={{ fontFamily: "'Inter', sans-serif", color: T.ink }}>
        {CATEGORY_LABEL[exc.category]}
      </td>
      <td
        className="recon-td-variance"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: exc.variance ? T.critical : T.inkMuted, fontVariantNumeric: "tabular-nums" }}
      >
        {exc.variance ? fmtNGN(exc.variance) : "—"}
      </td>
      <td className="recon-td-muted" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkMuted }}>
        {fmtDate(exc.created_at)}
      </td>
      <td className="recon-td-muted" style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.inkMuted }}>
        {fmtDate(exc.sla_deadline)}
      </td>
      <td>
        <div className="recon-status-cell">
          {isResolved && <TickMark color={statusColor} />}
          <span style={{ fontFamily: "'Inter', sans-serif", color: statusColor }} className="recon-status-label">
            {statusLabel}
          </span>
        </div>
      </td>
      <td className="recon-align-right">
        {!isResolved && (
          <button
            onClick={() => onResolve(exc.id)}
            style={{ fontFamily: "'Inter', sans-serif", color: T.accent, border: `1px solid ${T.accent}` }}
            className="recon-resolve-btn"
          >
            Mark resolved
          </button>
        )}
      </td>
    </tr>
  );
}

/*MAIN Page */
export default function ReconciliationDashboard() {
  const [account, setAccount] = useState(ACCOUNTS[0].id);
  const [period, setPeriod] = useState(PERIODS[1].id);
  const [inputMethod, setInputMethod] = useState("upload"); // 'manual' | 'upload' | 'api'
  const [exceptions, setExceptions] = useState(EXCEPTIONS);

  const handleResolve = (id) => {
    // In production this calls PATCH /exceptions/{id}/resolve and
    // replaces the KPI snapshot with the server's recomputed RVI/FTIS.
    setExceptions((prev) =>
      prev.map((e) => (e.id === id ? { ...e, resolved_at: new Date().toISOString() } : e))
    );
  };

  const openCount = useMemo(() => exceptions.filter((e) => !e.resolved_at).length, [exceptions]);

  const inputMethodMeta = {
    manual: { label: "Manual entry", icon: FileEdit },
    upload: { label: "File upload", icon: Upload },
    api: { label: "API connected", icon: Plug },
  }[inputMethod];

  return (
    <div style={{ background: T.paper, minHeight: "100%", fontFamily: "'Inter', sans-serif" }} className="recon-dash">
      <style>{FONT_IMPORT}</style>

      <div className="recon-container">
        {/* Masthead*/}
        <div className="recon-masthead" style={{ borderBottom: `1px solid ${T.lineStrong}` }}>
          <div>
            <div style={{ color: T.inkMuted, fontFamily: "'Inter', sans-serif" }} className="recon-eyebrow">
              Reconciliation Ledger
            </div>
            <h1 style={{ fontFamily: "'Newsreader', serif", color: T.ink }} className="recon-title">
              Account Health Check
            </h1>
          </div>
          <div className="recon-controls">
            <Dropdown value={account} options={ACCOUNTS} onChange={setAccount} />
            <Dropdown value={period} options={PERIODS} onChange={setPeriod} labelKey="label" />
            <div
              style={{ borderColor: T.line, color: T.inkMuted }}
              className="recon-chip"
            >
              <inputMethodMeta.icon size={13} />
              {inputMethodMeta.label}
            </div>
          </div>
        </div>

        {/*  FTIS hero + KPI strip  */}
        <div
          style={{ background: T.paperRaised, border: `1px solid ${T.line}` }}
          className="recon-card"
        >
          <div className="recon-hero-row">
            <div style={{ minWidth: 180 }}>
              <div style={{ color: T.inkMuted }} className="recon-label">
                FTIS — Financial Truth Integrity Score
              </div>
              <div
                style={{ fontFamily: "'Newsreader', serif", color: signalFor(CURRENT_KPI.ftis, { good: 95, medium: 85 }) }}
                className="recon-hero-value"
              >
                {CURRENT_KPI.ftis.toFixed(1)}
              </div>
              <DoubleRule color={T.ink} />
              <div style={{ color: T.inkMuted, fontFamily: "'IBM Plex Mono', monospace" }} className="recon-hero-formula">
                RAR ×0.4 + AMER ×0.3 + (100−UVR) ×0.2 + RVI ×0.1
              </div>
            </div>

            <div className="recon-kpi-row">
              <KpiBlock
                label="RAR"
                value={fmtPct(CURRENT_KPI.rar)}
                target="Target ≥ 98%"
                color={signalFor(CURRENT_KPI.rar, THRESHOLDS.rar)}
              />
              <KpiBlock
                label="UVR"
                value={fmtPct(CURRENT_KPI.uvr)}
                target={`${fmtNGN(CURRENT_KPI.unmatched_value)} at risk`}
                color={signalFor(CURRENT_KPI.uvr, THRESHOLDS.uvr, true)}
              />
              <KpiBlock
                label="AMER"
                value={fmtPct(CURRENT_KPI.amer)}
                target="Automation maturity"
                color={signalFor(CURRENT_KPI.amer, THRESHOLDS.amer)}
              />
              <KpiBlock
                label="RVI"
                value={fmtPct(CURRENT_KPI.rvi)}
                target="Target ≥ 85%"
                color={signalFor(CURRENT_KPI.rvi, THRESHOLDS.rvi)}
              />
            </div>
          </div>
        </div>

        {/* Trend */}
        <div style={{ background: T.paperRaised, border: `1px solid ${T.line}` }} className="recon-card">
          <div style={{ color: T.inkMuted }} className="recon-chart-title">
            Six-period trend
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={KPI_HISTORY} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={T.line} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: T.inkMuted }}
                axisLine={{ stroke: T.lineStrong }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: T.inkMuted }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{ background: T.paperRaised, border: `1px solid ${T.line}`, fontFamily: "Inter", fontSize: 12 }}
                labelStyle={{ color: T.ink }}
              />
              <Line type="monotone" dataKey="ftis" stroke={T.ink} strokeWidth={2} dot={{ r: 2.5 }} name="FTIS" />
              <Line type="monotone" dataKey="rar" stroke={T.accent} strokeWidth={1.5} dot={{ r: 2 }} name="RAR" />
              <Line type="monotone" dataKey="uvr" stroke={T.critical} strokeWidth={1.5} dot={{ r: 2 }} name="UVR" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Exceptions worklist */}
        <div style={{ background: T.paperRaised, border: `1px solid ${T.line}` }} className="recon-card">
          <div className="recon-table-header-row">
            <div style={{ color: T.inkMuted }} className="recon-label">
              Exceptions worklist
            </div>
            <div className="recon-open-count" style={{ color: openCount > 0 ? T.medium : T.good, fontFamily: "'IBM Plex Mono', monospace" }}>
              {openCount > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              <span>{openCount} open</span>
            </div>
          </div>
          <table className="recon-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.lineStrong}` }}>
                {["Source", "Category", "Variance", "Raised", "SLA due", "Status", ""].map((h) => (
                  <th
                    key={h}
                    style={{ color: T.inkMuted, fontFamily: "'Inter', sans-serif" }}
                    className={h === "Variance" ? "recon-align-right" : ""}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exceptions.map((exc) => (
                <ExceptionRow key={exc.id} exc={exc} onResolve={handleResolve} />
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ color: T.inkMuted }} className="recon-footnote">
          <Check size={12} />
          Figures shown are illustrative — connect to the reconciliation API to replace mock data.
        </div>
      </div>
    </div>
  );
}