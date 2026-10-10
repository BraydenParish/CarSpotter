import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createContext, VEHICLES } from '../data/dataset';
import { fixturePhotos } from '../dev/fixtures';

function seed(key: string) {
  localStorage.setItem(key, JSON.stringify({ version: 1, introSeen: true }));
}

describe('app shell', () => {
  it('shows an honest empty state when no photos are approved', () => {
    seed('carspotter:profile');
    window.location.hash = '#/';
    render(<App ctx={createContext(VEHICLES, [])} fixtures={false} />);
    expect(screen.getByText(/photo collection is being verified/i)).toBeTruthy();
    expect(screen.queryByText(/Game modes/i)).toBeNull();
  });

  it('only offers modes the data can support', () => {
    seed('carspotter:profile:fixtures');
    window.location.hash = '#/';
    render(<App ctx={createContext(VEHICLES, fixturePhotos(VEHICLES))} fixtures />);
    const practice = screen.getByRole('button', { name: /Practice/ });
    expect((practice as HTMLButtonElement).disabled).toBe(true); // nothing missed yet
    const detail = screen.getByRole('button', { name: /Detail Challenge/ });
    expect((detail as HTMLButtonElement).disabled).toBe(true); // fixtures() without crops
    expect((screen.getByRole('button', { name: /Time Attack/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('plays a Normal round with a neutral alt text and reveals the answer', async () => {
    seed('carspotter:profile:fixtures');
    window.location.hash = '#/';
    const user = userEvent.setup();
    render(<App ctx={createContext(VEHICLES, fixturePhotos(VEHICLES))} fixtures />);
    await user.click(screen.getByRole('button', { name: /10-Round Session/ }));
    // jsdom doesn't implement <dialog>.showModal(), so the sheet is queried as hidden.
    await user.click(within(document.querySelector('dialog')!).getByRole('button', { name: /^Start/, hidden: true }));
    const img = (await screen.findByAltText('A car to identify')) as HTMLImageElement;
    img.dispatchEvent(new Event('load'));
    const group = await screen.findByRole('group', { name: 'Answer choices' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    await user.click(buttons[0]);
    expect(await screen.findByRole('region', { name: 'Answer reveal' })).toBeTruthy();
    // After the reveal the alt text names the car.
    expect(document.querySelector('main img')!.getAttribute('alt')).not.toBe('A car to identify');
  });
});
