import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from './SearchBar.jsx';

vi.mock('react-i18next', async (orig) => ({ ...(await orig()), useTranslation: () => ({ t: (k, o) => (o?.value ? `${o.value} km` : k) }) }));

const base = { category: '', from: '', to: '', lat: '', radiusKm: '' };
const setup = (f = base, q = '') => {
  const p = { q, setQ: vi.fn(), f, set: vi.fn(), locate: vi.fn(), clearLocation: vi.fn(), clearAll: vi.fn() };
  render(<SearchBar {...p} />);
  return p;
};

describe('SearchBar', () => {
  it('types into the search box and clears it', () => {
    const p = setup(base, 'keys');
    fireEvent.change(screen.getByLabelText('items.search'), { target: { value: 'wallet' } });
    expect(p.setQ).toHaveBeenCalledWith('wallet');
    fireEvent.click(screen.getByRole('button', { name: 'items.clear' }));
    expect(p.setQ).toHaveBeenCalledWith('');
  });
  it('picks and un-picks a category chip', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /cat\.wallet/ }));
    expect(p.set).toHaveBeenCalledWith('category', 'wallet');
  });
  it('un-picks the chosen category when it is pressed again', () => {
    const p = setup({ ...base, category: 'keys' });
    const chip = screen.getByRole('button', { name: /cat\.keys/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(p.set).toHaveBeenCalledWith('category', '');
  });
  it('asks for the location, then shows radii once it is on', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /items\.useLocation/ }));
    expect(p.locate).toHaveBeenCalled();
  });
  it('shows radii and the active-filter count when near-me is on, and clears everything', () => {
    const p = setup({ ...base, lat: '23.8', lng: '90.4', radiusKm: '5', category: 'bags' });
    expect(screen.getByRole('button', { name: '5 km' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '25 km' }));
    expect(p.set).toHaveBeenCalledWith('radiusKm', '25');
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /items\.clear/ }));
    expect(p.clearAll).toHaveBeenCalled();
  });
  it('sets the date range', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('items.fromDate'), { target: { value: '2026-11-01' } });
    expect(p.set).toHaveBeenCalledWith('from', '2026-11-01');
  });
});
