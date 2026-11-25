import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SearchBar from './SearchBar.jsx';

vi.mock('react-i18next', async (orig) => ({ ...(await orig()), useTranslation: () => ({ t: (k, o) => (o?.value ? `${o.value} km` : k) }) }));

const base = { category: '', from: '', to: '', lat: '', radiusKm: '' };
const setup = (f = base, q = '') => {
  const p = { q, setQ: vi.fn(), f, set: vi.fn(), locate: vi.fn(), clearLocation: vi.fn(), clearAll: vi.fn() };
  render(<SearchBar {...p} />);
  return p;
};
const filter = (name) => screen.getByRole('button', { name: new RegExp(name) });

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
  it('edits and clears the dates in the date panel', () => {
    const p = setup({ ...base, from: '2026-01-02' });
    fireEvent.click(filter('items.fromDate'));
    fireEvent.change(screen.getByLabelText('items.toDate'), { target: { value: '2026-02-03' } });
    expect(p.set).toHaveBeenCalledWith('to', '2026-02-03');
    fireEvent.click(screen.getByRole('button', { name: 'items.clear items.fromDate' }));
    expect(p.set).toHaveBeenCalledWith('from', '');
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
  it('shows Clear only when a filter is on, and resets everything', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'items.clear' })).toBeNull();
  });
  it('clears all filters', () => {
    const p = setup({ ...base, category: 'keys' });
    fireEvent.click(screen.getAllByRole('button', { name: /items.clear/ }).at(-1));
    expect(p.clearAll).toHaveBeenCalled();
  });
});
