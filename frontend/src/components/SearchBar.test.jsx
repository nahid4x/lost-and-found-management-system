import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SearchBar, { defaultRange } from './SearchBar.jsx';

vi.mock('react-i18next', async (orig) => ({ ...(await orig()), useTranslation: () => ({ t: (k, o) => (o?.value ? `${o.value} km` : k) }) }));

const base = { category: '', from: '', to: '', lat: '', radiusKm: '' };
// Local time, so the tests do not depend on the machine's time zone.
const NOW = new Date(2026, 10, 26, 12);
const DEF = { from: '2026-10-26', to: '2026-11-26' };
const freezeDate = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); };

const setup = (f = base, q = '') => {
  const p = { q, setQ: vi.fn(), f, set: vi.fn(), locate: vi.fn(), clearLocation: vi.fn(), clearAll: vi.fn() };
  render(<SearchBar {...p} />);
  return p;
};
const filter = (name) => screen.getByRole('button', { name: new RegExp(name) });

afterEach(() => vi.useRealTimers());

describe('defaultRange', () => {
  it('goes from the same day last month to today', () => {
    expect(defaultRange(NOW)).toEqual(DEF);
  });
  it('clamps to the end of a shorter month', () => {
    expect(defaultRange(new Date(2026, 2, 31))).toEqual({ from: '2026-02-28', to: '2026-03-31' });
  });
  it('crosses the year boundary', () => {
    expect(defaultRange(new Date(2026, 0, 15))).toEqual({ from: '2025-12-15', to: '2026-01-15' });
  });
});

describe('SearchBar', () => {
  it('types into the search box and clears it', () => {
    const p = setup(base, 'keys');
    fireEvent.change(screen.getByLabelText('items.search'), { target: { value: 'wallet' } });
    expect(p.setQ).toHaveBeenCalledWith('wallet');
    fireEvent.click(screen.getByRole('button', { name: 'items.clear' }));
    expect(p.setQ).toHaveBeenCalledWith('');
  });
  it('shows the category options only after the button is pressed, and closes after picking one', () => {
    const p = setup();
    expect(screen.queryByRole('button', { name: 'cat.wallet' })).toBeNull();
    fireEvent.click(filter('items.allCategories'));
    fireEvent.click(screen.getByRole('button', { name: 'cat.wallet' }));
    expect(p.set).toHaveBeenCalledWith('category', 'wallet');
    expect(screen.queryByRole('button', { name: 'cat.wallet' })).toBeNull();
  });
  it('shows the chosen category on the button and lets All categories reset it', () => {
    const p = setup({ ...base, category: 'keys' });
    fireEvent.click(filter('cat.keys'));
    fireEvent.click(screen.getAllByRole('button', { name: 'items.allCategories' })[0]);
    expect(p.set).toHaveBeenCalledWith('category', '');
  });
  it('closes the open panel on Escape', () => {
    setup();
    fireEvent.click(filter('items.allCategories'));
    expect(screen.getByRole('button', { name: 'cat.keys' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'cat.keys' })).toBeNull();
  });

  describe('dates', () => {
    it('shows From and To inputs in the bar, with no Any date button', () => {
      setup({ ...base, from: '2026-01-02', to: '2026-02-03' });
      expect(screen.getByLabelText('items.fromDate').value).toBe('2026-01-02');
      expect(screen.getByLabelText('items.toDate').value).toBe('2026-02-03');
      expect(screen.queryByRole('button', { name: /items.anyDate/ })).toBeNull();
    });
    it('fills last month to today when both dates are empty, one field at a time', () => {
      freezeDate();
      const p = { q: '', setQ: vi.fn(), set: vi.fn(), locate: vi.fn(), clearLocation: vi.fn(), clearAll: vi.fn() };
      const { rerender } = render(<SearchBar {...p} f={{ ...base }} />);
      expect(p.set).toHaveBeenCalledTimes(1);
      expect(p.set).toHaveBeenLastCalledWith('from', DEF.from);
      rerender(<SearchBar {...p} f={{ ...base, from: DEF.from }} />);
      expect(p.set).toHaveBeenCalledTimes(2);
      expect(p.set).toHaveBeenLastCalledWith('to', DEF.to);
      rerender(<SearchBar {...p} f={{ ...base, ...DEF }} />);
      expect(p.set).toHaveBeenCalledTimes(2);
    });
    it('keeps dates the user already has', () => {
      const p = setup({ ...base, from: '2026-01-02', to: '2026-02-03' });
      expect(p.set).not.toHaveBeenCalled();
    });
    it('lets the user pick their own dates', () => {
      const p = setup({ ...base, from: '2026-01-02', to: '2026-02-03' });
      fireEvent.change(screen.getByLabelText('items.fromDate'), { target: { value: '2026-01-05' } });
      expect(p.set).toHaveBeenCalledWith('from', '2026-01-05');
      fireEvent.change(screen.getByLabelText('items.toDate'), { target: { value: '2026-02-10' } });
      expect(p.set).toHaveBeenCalledWith('to', '2026-02-10');
    });
    it('does not allow To before From, or dates after today', () => {
      freezeDate();
      setup({ ...base, from: '2026-10-01', to: '2026-11-01' });
      expect(screen.getByLabelText('items.toDate').min).toBe('2026-10-01');
      expect(screen.getByLabelText('items.toDate').max).toBe(DEF.to);
      expect(screen.getByLabelText('items.fromDate').max).toBe('2026-11-01');
    });
  });

  it('shows the radius choices before the location is on, and asks for the location', () => {
    const p = setup();
    fireEvent.click(filter('items.nearMe'));
    fireEvent.click(screen.getByRole('button', { name: '25 km' }));
    expect(p.set).toHaveBeenCalledWith('radiusKm', '25');
    fireEvent.click(screen.getByRole('button', { name: /items.useLocation/ }));
    expect(p.locate).toHaveBeenCalled();
  });
  it('picks a radius and turns the location off', () => {
    const p = setup({ ...base, lat: '23.7', lng: '90.4', radiusKm: '5' });
    fireEvent.click(filter('items.nearMe'));
    fireEvent.click(screen.getByRole('button', { name: '25 km' }));
    expect(p.set).toHaveBeenCalledWith('radiusKm', '25');
    fireEvent.click(within(document.querySelector('.sbar-panel')).getByRole('button', { name: 'items.clear' }));
    expect(p.clearLocation).toHaveBeenCalled();
  });

  describe('Clear button', () => {
    it('is hidden when nothing is filtered', () => {
      setup();
      expect(screen.queryByRole('button', { name: 'items.clear' })).toBeNull();
    });
    it('is hidden while the dates are still the default range', () => {
      freezeDate();
      setup({ ...base, ...DEF });
      expect(screen.queryByRole('button', { name: 'items.clear' })).toBeNull();
    });
    it('shows once the user changes a date, and clears everything', () => {
      freezeDate();
      const p = setup({ ...base, from: '2026-10-01', to: DEF.to });
      fireEvent.click(screen.getByRole('button', { name: /items.clear/ }));
      expect(p.clearAll).toHaveBeenCalled();
    });
    it('clears all filters', () => {
      const p = setup({ ...base, category: 'keys' });
      fireEvent.click(screen.getAllByRole('button', { name: /items.clear/ }).at(-1));
      expect(p.clearAll).toHaveBeenCalled();
    });
    it('puts the default dates back after the filters are cleared', () => {
      freezeDate();
      const p = { q: '', setQ: vi.fn(), set: vi.fn(), locate: vi.fn(), clearLocation: vi.fn(), clearAll: vi.fn() };
      const f = { ...base, category: 'keys', from: '2026-01-02', to: '2026-02-03' };
      const { rerender } = render(<SearchBar {...p} f={f} />);
      fireEvent.click(screen.getAllByRole('button', { name: /items.clear/ }).at(-1));
      p.set.mockClear();
      rerender(<SearchBar {...p} f={{ ...base }} />);
      expect(p.set).toHaveBeenLastCalledWith('from', DEF.from);
      rerender(<SearchBar {...p} f={{ ...base, from: DEF.from }} />);
      expect(p.set).toHaveBeenLastCalledWith('to', DEF.to);
    });
  });
});