import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/Auth.jsx';
import { ToastProvider } from '../context/Toast.jsx';
import AuthPages from './AuthPages.jsx';

const renderAt = (mode, path = '/') => render(<MemoryRouter initialEntries={[path]}><ToastProvider><AuthProvider><AuthPages mode={mode} /></AuthProvider></ToastProvider></MemoryRouter>);

describe('auth screens', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => '{}' }); });

  it('login: tabs, labelled fields, password toggle and validation messages', async () => {
    renderAt('login');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument());
    expect(screen.getByRole('navigation', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('aria-current', 'page');
    const pw = screen.getByLabelText('Password', { exact: true });
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith('/api/auth/login', expect.anything()); // nothing is sent while invalid
  });

  it('register: name field, strength meter and password rules', async () => {
    renderAt('register');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument());
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'abc' } });
    expect(screen.getByText(/Strength: too weak/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Correct-Horse-Battery-9' } });
    expect(screen.getByText(/Strength: strong/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Create account/ }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
  });

  it('forgot and reset modes render their own forms', async () => {
    const { unmount } = renderAt('forgot');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Password', { exact: true })).toBeNull();
    unmount();
    renderAt('reset', '/reset-password?token=' + 'a'.repeat(64));
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeInTheDocument());
  });

  it('open-redirect safe: the ?next= link keeps only a same-site path', async () => {
    renderAt('login', '/login?next=https://evil.example');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Create account' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/register?next=%2F');
  });
});
