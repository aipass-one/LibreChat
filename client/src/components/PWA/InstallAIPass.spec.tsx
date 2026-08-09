import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstallAIPass from './InstallAIPass';
import type { BeforeInstallPromptEvent } from './InstallAIPass';

const setStandaloneDisplayMode = (matches: boolean) => {
  window.matchMedia = jest.fn().mockReturnValue({
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
};

beforeEach(() => {
  setStandaloneDisplayMode(false);
  window.__aipassInstallPrompt = null;
});

describe('InstallAIPass', () => {
  it('uses the browser install prompt and hides after acceptance', async () => {
    const user = userEvent.setup();
    const prompt = jest.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' } as const),
    }) as BeforeInstallPromptEvent;

    render(<InstallAIPass />);
    act(() => window.dispatchEvent(installEvent));
    await user.click(screen.getByRole('button', { name: 'Install AI Pass' }));

    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Install AI Pass' })).not.toBeInTheDocument();
    });
  });

  it('shows iPhone home-screen instructions when a native prompt is unavailable', async () => {
    const user = userEvent.setup();
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');

    render(<InstallAIPass />);
    await user.click(screen.getByRole('button', { name: 'Install AI Pass' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Tap/)).toHaveTextContent('Share in Safari');
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('does not show the install control inside the installed app', () => {
    setStandaloneDisplayMode(true);

    render(<InstallAIPass />);

    expect(screen.queryByRole('button', { name: 'Install AI Pass' })).not.toBeInTheDocument();
  });
});
