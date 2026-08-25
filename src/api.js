const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (_) {
      /* response wasn't JSON */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  // 204 / empty body responses
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  listAccounts: () => request("/accounts"),
  createAccount: (payload) =>
    request("/accounts", { method: "POST", body: JSON.stringify(payload) }),

  listPeriods: (accountId) => request(`/accounts/${accountId}/periods`),
  getPeriod: (periodId) => request(`/periods/${periodId}`),
  getKpiHistory: (accountId) => request(`/accounts/${accountId}/kpi-history`),
  getExceptions: (periodId) => request(`/periods/${periodId}/exceptions`),

  resolveException: (exceptionId, resolvedBy) =>
    request(`/exceptions/${exceptionId}/resolve`, {
      method: "PATCH",
      body: JSON.stringify({ resolved_by: resolvedBy }),
    }),

  submitManualPeriod: (accountId, payload) =>
    request(`/accounts/${accountId}/periods/manual`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  uploadSeparate: (accountId, { startDate, endDate, ledgerFile, statementFile }) => {
    const form = new FormData();
    form.append("start_date", startDate);
    form.append("end_date", endDate);
    form.append("ledger_file", ledgerFile);
    form.append("statement_file", statementFile);
    return fetch(`${API_BASE}/accounts/${accountId}/periods/upload/separate`, {
      method: "POST",
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || res.statusText);
      }
      return res.json();
    });
  },

  uploadCombined: (accountId, { startDate, endDate, file }) => {
    const form = new FormData();
    form.append("start_date", startDate);
    form.append("end_date", endDate);
    form.append("file", file);
    return fetch(`${API_BASE}/accounts/${accountId}/periods/upload/combined`, {
      method: "POST",
      body: form,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || res.statusText);
      }
      return res.json();
    });
  },
};