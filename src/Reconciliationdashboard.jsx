import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, ChevronDown, Upload, FileEdit, Plug, Check, Loader2
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import { api } from "./api";
import "./ReconciliationDashboard.css";

/*FORMATTERS
    */
const fmtNGN = (v) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(v);
const fmtPct = (v) => `${Number(v ?? 0).toFixed(1)}%`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—");

function signalFor(value, thresholds, inverted = false) {
  const v = Number(value ?? 0);
  const { good, medium } = thresholds;
  if (inverted) {
    if (v <= good) return "var(--good)";
    if (v <= medium) return "var(--medium)";
    return "var(--critical)";
  }
  if (v >= good) return "var(--good)";
  if (v >= medium) return "var(--medium)";
  return "var(--critical)";
}

const THRESHOLDS = {
  rar: { good: 98, medium: 90 },
  uvr: { good: 1, medium: 3, inverted: true },
  amer: { good: 95, medium: 80 },
  rvi: { good: 85, medium: 65 },
  ftis: { good: 95, medium: 85 },
};

/* SMALL PIECES */
function DoubleRule({ color = "var(--ink)" }) {
  return <div className="recon-double-rule" style={{ color }} />;
}

function TickMark({ color = "var(--good)", size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 8.5 L6.5 13 L14 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dropdown({ value, options, onChange, labelKey = "name" }) {
  return (
    <div className="recon-dropdown-wrap">
      <select className="recon-dropdown" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o[labelKey]}</option>
        ))}
      </select>
      <ChevronDown size={14} className="recon-dropdown-chevron" />
    </div>
  );
}

function KpiBlock({ label, value, target, color }) {
  return (
    <div className="recon-kpi-block">
      <div className="recon-kpi-label-row">
        <span className="recon-dot" style={{ background: color }} />
        <span className="recon-label">{label}</span>
      </div>
      <div className="recon-kpi-value">{value}</div>
      <DoubleRule color="var(--line)" />
      <div className="recon-kpi-target">{target}</div>
    </div>
  );
}

const SOURCE_LABEL = { ledger: "Ledger", statement: "Statement", combined: "Combined" };
const CATEGORY_LABEL = { missing_counterpart: "No counterpart", amount_mismatch: "Amount mismatch", unresolved: "Unresolved" };

function ExceptionRow({ exc, onResolve, resolving }) {
  const isResolved = !!exc.resolved_at;
  const withinSla = isResolved && exc.sla_deadline && new Date(exc.resolved_at) <= new Date(exc.sla_deadline);
  const overdue = !isResolved && exc.sla_deadline && new Date() > new Date(exc.sla_deadline);

  let statusColor = "var(--medium)";
  let statusLabel = "Open";
  if (isResolved) {
    statusColor = withinSla ? "var(--good)" : "var(--medium)";
    statusLabel = withinSla ? "Resolved · within SLA" : "Resolved · late";
  } else if (overdue) {
    statusColor = "var(--critical)";
    statusLabel = "Overdue";
  }

  return (
    <tr>
      <td>{SOURCE_LABEL[exc.source] || exc.source}</td>
      <td>{CATEGORY_LABEL[exc.category] || exc.category}</td>
      <td className="recon-td-variance" style={{ color: exc.variance ? "var(--critical)" : "var(--ink-muted)" }}>
        {exc.variance ? fmtNGN(exc.variance) : "—"}
      </td>
      <td className="recon-td-muted">{fmtDate(exc.created_at)}</td>
      <td className="recon-td-muted">{fmtDate(exc.sla_deadline)}</td>
      <td>
        <div className="recon-status-cell">
          {isResolved && <TickMark color={statusColor} />}
          <span className="recon-status-label" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </td>
      <td className="recon-align-right">
        {!isResolved && (
          <button
            className="recon-resolve-btn"
            disabled={resolving}
            onClick={() => onResolve(exc.id)}
          >
            {resolving ? "Resolving…" : "Mark resolved"}
          </button>
        )}
      </td>
    </tr>
  );
}

/*MAIN*/
export default function ReconciliationDashboard() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);

  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState(null);

  const [periodDetail, setPeriodDetail] = useState(null); // includes .kpi
  const [kpiHistory, setKpiHistory] = useState([]);
  const [exceptions, setExceptions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  // ---- Load accounts on mount ----
  useEffect(() => {
    api.listAccounts()
      .then((data) => {
        setAccounts(data);
        if (data.length) setAccountId(data[0].id);
        else setLoading(false); // no accounts yet -- nothing more to load
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  // ---- When account changes: load its periods + kpi history ----
  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    Promise.all([api.listPeriods(accountId), api.getKpiHistory(accountId)])
      .then(([periodsData, historyData]) => {
        setPeriods(periodsData);
        setKpiHistory(
          historyData.map((h, i) => ({
            period: `#${i + 1}`,
            rar: h.rar,
            uvr: h.uvr,
            ftis: h.ftis,
          }))
        );
        if (periodsData.length) setPeriodId(periodsData[0].id);
        else { setPeriodDetail(null); setExceptions([]); setLoading(false); }
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [accountId]);

  // ---- When period changes: load its detail + exceptions ----
  const loadPeriodData = useCallback((id) => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.getPeriod(id), api.getExceptions(id)])
      .then(([detail, excs]) => {
        setPeriodDetail(detail);
        setExceptions(excs);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPeriodData(periodId); }, [periodId, loadPeriodData]);

  // ---- Resolve an exception, then refresh both exceptions and the KPI snapshot ----
  const handleResolve = async (exceptionId) => {
    setResolvingId(exceptionId);
    try {
      const updatedSnapshot = await api.resolveException(exceptionId, "current-user");
      setPeriodDetail((prev) => (prev ? { ...prev, kpi: updatedSnapshot } : prev));
      const freshExceptions = await api.getExceptions(periodId);
      setExceptions(freshExceptions);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolvingId(null);
    }
  };

  const kpi = periodDetail?.kpi;
  const openCount = exceptions.filter((e) => !e.resolved_at).length;

  const inputMethodMeta = {
    manual: { label: "Manual entry", icon: FileEdit },
    upload: { label: "File upload", icon: Upload },
    api: { label: "API connected", icon: Plug },
  }[periodDetail?.input_method] || { label: "—", icon: Plug };

  if (error) {
    return (
      <div className="recon-dash">
         {/*<div className="recon-container">
         <div className="recon-card" style={{ color: "var(--critical)" }}>
            Couldn't reach the backend: {error}
            <div className="recon-footnote">
              Check that the API is running and VITE_API_BASE_URL points at it.
            </div>
          </div>
        </div>*/}
      </div>
    );
  }

  if (accounts.length === 0 && !loading) {
    return (
      <div className="recon-dash">
        <div className="recon-container">
          <div className="recon-card">No accounts yet. Create one via POST /accounts to get started.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="recon-dash">
      <div className="recon-container">
        {/* ---------- Masthead ---------- */}
        <div className="recon-masthead">
          <div>
            <div className="recon-eyebrow">Reconciliation Ledger</div>
            <h1 className="recon-title">Account Health Check</h1>
          </div>
          <div className="recon-controls">
            {loading && <Loader2 size={16} className="recon-spin" style={{ color: "var(--ink-muted)" }} />}
            <Dropdown value={accountId} options={accounts} onChange={setAccountId} />
            <Dropdown
              value={periodId}
              options={periods.map((p) => ({ id: p.id, label: `${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}` }))}
              onChange={setPeriodId}
              labelKey="label"
            />
            <div className="recon-chip">
              <inputMethodMeta.icon size={13} />
              {inputMethodMeta.label}
            </div>
          </div>
        </div>

        {!kpi && !loading && (
          <div className="recon-card">No data for this period yet.</div>
        )}

        {kpi && (
          <>
            {/* ---------- FTIS hero + KPI strip ---------- */}
            <div className="recon-card">
              <div className="recon-hero-row">
                <div className="recon-hero-block">
                  <div className="recon-label">FTIS — Financial Truth Integrity Score</div>
                  <div className="recon-hero-value" style={{ color: signalFor(kpi.ftis, THRESHOLDS.ftis) }}>
                    {Number(kpi.ftis ?? 0).toFixed(1)}
                  </div>
                  <DoubleRule color="var(--ink)" />
                  <div className="recon-hero-formula">
                    RAR ×0.4 + AMER ×0.3 + (100−UVR) ×0.2 + RVI ×0.1
                  </div>
                </div>

                <div className="recon-kpi-row">
                  <KpiBlock label="RAR" value={fmtPct(kpi.rar)} target="Target ≥ 98%" color={signalFor(kpi.rar, THRESHOLDS.rar)} />
                  <KpiBlock
                    label="UVR"
                    value={fmtPct(kpi.uvr)}
                    target={`${fmtNGN(kpi.unmatched_value)} at risk`}
                    color={signalFor(kpi.uvr, THRESHOLDS.uvr, true)}
                  />
                  <KpiBlock label="AMER" value={fmtPct(kpi.amer)} target="Automation maturity" color={signalFor(kpi.amer, THRESHOLDS.amer)} />
                  <KpiBlock label="RVI" value={fmtPct(kpi.rvi)} target="Target ≥ 85%" color={signalFor(kpi.rvi, THRESHOLDS.rvi)} />
                </div>
              </div>
            </div>

            {/* ---------- Trend ---------- */}
            <div className="recon-card">
              <div className="recon-chart-title">Trend across stored periods</div>
              {kpiHistory.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={kpiHistory} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="0" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#55645A" }} axisLine={{ stroke: "#9FB09A" }} tickLine={false} />
                    <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#55645A" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip contentStyle={{ background: "#F5F7F3", border: "1px solid #C7D2C2", fontFamily: "Inter", fontSize: 12 }} />
                    <Line type="monotone" dataKey="ftis" stroke="#1C2321" strokeWidth={2} dot={{ r: 2.5 }} name="FTIS" />
                    <Line type="monotone" dataKey="rar" stroke="#2C4A6E" strokeWidth={1.5} dot={{ r: 2 }} name="RAR" />
                    <Line type="monotone" dataKey="uvr" stroke="#9B3B2B" strokeWidth={1.5} dot={{ r: 2 }} name="UVR" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="recon-label">Not enough periods yet for a trend line.</div>
              )}
            </div>

            {/* ---------- Exceptions worklist ---------- */}
            <div className="recon-card">
              <div className="recon-table-header-row">
                <div className="recon-chart-title" style={{ marginBottom: 0 }}>Exceptions worklist</div>
                <div className="recon-open-count" style={{ color: openCount > 0 ? "var(--medium)" : "var(--good)" }}>
                  {openCount > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                  {openCount} open
                </div>
              </div>
              {exceptions.length === 0 ? (
                <div className="recon-label">No exceptions recorded for this period.</div>
              ) : (
                <table className="recon-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Category</th>
                      <th className="recon-align-right">Variance</th>
                      <th>Raised</th>
                      <th>SLA due</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((exc) => (
                      <ExceptionRow key={exc.id} exc={exc} onResolve={handleResolve} resolving={resolvingId === exc.id} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <div className="recon-footnote">
          <Check size={12} />
          Live data from the reconciliation API.
        </div>
      </div>
    </div>
  );
}