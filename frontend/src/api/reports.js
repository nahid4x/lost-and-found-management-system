// Adjust BASE and getToken() to match how the rest of your app calls the gateway.
const BASE = import.meta.env.VITE_REPORTS_API || '/api/reports';
const getToken = () => localStorage.getItem('token');

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed. Try again.');
  return data;
}

export const createReport = (formData) => request('', { method: 'POST', form: formData });
export const getMyReports = () => request('/mine');
export const getReport = (id) => request(`/${id}`);

export const adminList = (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return request(`/admin?${q}`);
};
export const adminStats = () => request('/admin/stats');
export const adminUpdate = (id, body) => request(`/admin/${id}/status`, { method: 'PATCH', body });

// Image urls come back as /uploads/reports/xxx.webp
export const imageUrl = (u) => `${BASE.replace(/\/api\/reports$/, '')}${u}`;
