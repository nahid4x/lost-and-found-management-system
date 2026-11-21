import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings.jsx';
import { collectMyData } from '../lib/exportData.js';

const h = vi.hoisted(() => ({ api: { get: vi.fn(), del: vi.fn(), post: vi.fn() }, logout: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { resolvedLanguage: 'en', changeLanguage: vi.fn() } }) }));
vi.mock('../lib/api.js', () => ({ api: h.api }));
vi.mock('../lib/util.js', () => ({ errMsg: (e) => e.message, timeAgo: () => 'a while ago', fmtDate: () => 'some day' }));
vi.mock('../context/Auth.jsx', () => ({ useAuth: () => ({ logout: h.logout }) }));
vi.mock('../context/Toast.jsx', () => ({ useToast: () => h.toast }));

const sessions = [
  { id: 'cur-1', device: 'Chrome on Windows', ip: '10.0.0.x', loginAt: '2026-11-01T00:00:00Z', lastActive: '2026-11-19T00:00:00Z', current: true },
  { id: 'old-2', device: 'Safari on iOS', ip: '10.0.1.x', loginAt: '2026-11-02T00:00:00Z', lastActive: '2026-11-10T00:00:00Z', current: false },
];
const answers = {
  '/auth/sessions': { sessions },
  '/auth/me': { user: { id: 'u1', name: 'Nabil' } },
  '/items/mine': { items: [{ id: 'i1', title: 'Wallet' }] },
  '/claims/mine': { claims: [{ id: 'c1', itemTitle: 'Phone', answers: [{ question: 'Color?', answer: 'Black' }] }] },
  '/claims/received': { claims: [{ id: 'c2', itemId: 'i1', itemTitle: 'Wallet', status: 'pending', createdAt: 'x', claimantName: 'Sam', answers: [{ answer: 'secret' }], proofUrls: ['http://p'] }] },
  '/notify/notifications?limit=50': { items: [{ id: 'n1' }] },
  '/notify/preferences': { preferences: { emailWhenOnline: false } },
};
const draw = () => render(<MemoryRouter><Settings /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); delete document.documentElement.dataset.fs; delete document.documentElement.dataset.motion;
  h.api.get.mockImplementation(async (p) => { if (answers[p]) return answers[p]; throw new Error('nope'); });
  h.api.del.mockResolvedValue(null); h.api.post.mockResolvedValue(null); h.logout.mockResolvedValue();
});

describe('Settings: accessibility', () => {
  it('changes text size and reduced motion at once and can reset', () => {
    draw();
    fireEvent.click(screen.getByRole('radio', { name: /size_lg/ }));
    expect(document.documentElement.dataset.fs).toBe('lg');
    expect(screen.getByRole('radio', { name: /size_lg/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByLabelText('settings.a11y.motion'));
    expect(document.documentElement.dataset.motion).toBe('reduced');
    fireEvent.click(screen.getByText('settings.a11y.reset'));
    expect(document.documentElement.dataset.fs).toBe('md');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});

describe('Settings: devices', () => {
  it('lists devices, marks this one and only offers sign out for the others', async () => {
    draw();
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(screen.getByText('Safari on iOS')).toBeInTheDocument();
    expect(screen.getAllByText('settings.devices.thisDevice')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'settings.devices.signOut' })).toHaveLength(1);
  });
  it('signs one device out and reloads the list', async () => {
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'settings.devices.signOut' }));
    await waitFor(() => expect(h.api.del).toHaveBeenCalledWith('/auth/sessions/old-2'));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('settings.devices.signedOutToast'));
    expect(h.api.get.mock.calls.filter(([p]) => p === '/auth/sessions').length).toBeGreaterThanOrEqual(2);
  });
  it('asks first, then signs out of everything and leaves', async () => {
    draw();
    fireEvent.click(await screen.findByRole('button', { name: 'settings.devices.signOutAll' }));
    expect(h.api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'settings.devices.allConfirm' }));
    await waitFor(() => expect(h.api.post).toHaveBeenCalledWith('/auth/logout-all'));
    await waitFor(() => expect(h.logout).toHaveBeenCalled());
  });
  it('shows a clear message when the list cannot be loaded', async () => {
    h.api.get.mockRejectedValue(new Error('down'));
    draw();
    expect(await screen.findByText('settings.devices.loadFailed')).toBeInTheDocument();
  });
});

describe('Settings: my data as PDF', () => {
  it('opens a printable page for Save as PDF, then removes it when printing closes', async () => {
    const print = vi.fn(); window.print = print;
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'settings.data.pdf' }));
    const page = await waitFor(() => { const el = document.getElementById('data-print'); expect(el).toBeTruthy(); return el; });
    expect(page.textContent).toContain('Nabil');
    expect(page.textContent).toContain('Wallet');
    expect(page.textContent).not.toContain('secret');
    expect(page.textContent).not.toContain('Black');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.getElementById('data-print')).toBeNull());
  });

  it('still prints when a part fails and tells the person what is missing', async () => {
    window.print = vi.fn();
    h.api.get.mockImplementation(async (p) => { if (p === '/notify/notifications?limit=50') throw new Error('x'); if (answers[p]) return answers[p]; throw new Error('nope'); });
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'settings.data.pdf' }));
    await waitFor(() => expect(document.getElementById('data-print')).toBeTruthy());
    expect(h.toast.info).toHaveBeenCalledWith('settings.data.partial');
    window.dispatchEvent(new Event('afterprint'));
  });
});

describe('collectMyData', () => {
  it('keeps going when one part fails and says which', async () => {
    const api = { get: vi.fn(async (p) => { if (p === '/items/mine') throw new Error('x'); return answers[p]; }) };
    const d = await collectMyData(api);
    expect(d.missing).toEqual(['reports']);
    expect(d.reports).toEqual([]);
    expect(d.profile.name).toBe('Nabil');
  });
  it('exports only a summary of claims other people made, never their answers or proofs', async () => {
    const d = await collectMyData({ get: async (p) => answers[p] });
    expect(d.claimsOnMyItems).toEqual([{ id: 'c2', itemId: 'i1', itemTitle: 'Wallet', status: 'pending', createdAt: 'x', decidedAt: null }]);
    expect(JSON.stringify(d)).not.toMatch(/secret|http:\/\/p|Sam/);
    expect(d.claimsMade[0].answers[0].answer).toBe('Black'); // their own answers are theirs
  });
});
