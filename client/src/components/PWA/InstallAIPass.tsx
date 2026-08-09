/* eslint-disable i18next/no-literal-string */
import { useCallback, useEffect, useState } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogDescription,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import { Download, MoreVertical, Share, Smartphone } from 'lucide-react';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

declare global {
  interface Window {
    __aipassInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

const isStandalone = () => {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
};

const isIosDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

export default function InstallAIPass() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => window.__aipassInstallPrompt ?? null,
  );
  const [installed, setInstalled] = useState(isStandalone);
  const [guideOpen, setGuideOpen] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [isIos, setIsIos] = useState(isIosDevice);

  useEffect(() => {
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const updateInstalledState = () => setInstalled(isStandalone());
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__aipassInstallPrompt = promptEvent;
      setInstallPrompt(promptEvent);
    };
    const handleInstallReady = () => {
      setInstallPrompt(window.__aipassInstallPrompt ?? null);
    };
    const handleInstalled = () => {
      window.__aipassInstallPrompt = null;
      setInstallPrompt(null);
      setInstalled(true);
      setGuideOpen(false);
    };

    setIsIos(isIosDevice());
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('aipass-install-ready', handleInstallReady);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener?.('change', updateInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('aipass-install-ready', handleInstallReady);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener?.('change', updateInstalledState);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    if (!installPrompt) {
      setGuideOpen(true);
      return;
    }

    setPrompting(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      window.__aipassInstallPrompt = null;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      window.__aipassInstallPrompt = null;
      setInstallPrompt(null);
      setGuideOpen(true);
    } finally {
      setPrompting(false);
    }
  }, [installPrompt]);

  if (installed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={requestInstall}
        disabled={prompting}
        aria-label="Install AI Pass"
        className="mx-1 inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4338CA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2 focus-visible:ring-offset-presentation disabled:cursor-wait disabled:opacity-70 sm:px-4"
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        <span className="hidden whitespace-nowrap sm:inline">
          {prompting ? 'Opening…' : 'Install AI Pass'}
        </span>
        <span className="whitespace-nowrap sm:hidden">{prompting ? 'Opening…' : 'Install'}</span>
      </button>

      <OGDialog open={guideOpen} onOpenChange={setGuideOpen}>
        <OGDialogContent className="w-11/12 max-w-md rounded-2xl border border-border-light bg-surface-primary p-0 shadow-2xl">
          <div className="flex flex-col gap-5 p-6">
            <OGDialogHeader className="text-left">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4F46E5]/10 text-[#4F46E5]">
                <Smartphone aria-hidden="true" className="h-6 w-6" />
              </div>
              <OGDialogTitle className="text-xl font-semibold text-text-primary">
                Install AI Pass
              </OGDialogTitle>
              <OGDialogDescription className="mt-1 text-sm leading-6 text-text-secondary">
                Keep every AI model one tap away in a full-screen app.
              </OGDialogDescription>
            </OGDialogHeader>

            {isIos ? (
              <ol className="space-y-4 text-sm text-text-primary">
                <li className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary font-semibold">
                    1
                  </span>
                  <span className="flex items-center gap-1.5">
                    Tap <Share aria-hidden="true" className="h-4 w-4 text-[#4F46E5]" /> Share in
                    Safari.
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary font-semibold">
                    2
                  </span>
                  <span>Choose “Add to Home Screen,” then tap Add.</span>
                </li>
              </ol>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-surface-secondary p-4 text-sm leading-6 text-text-primary">
                <MoreVertical aria-hidden="true" className="h-5 w-5 shrink-0 text-[#4F46E5]" />
                <p>Open your browser menu and choose “Install app” or “Add to Home Screen.”</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#4F46E5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2"
            >
              Got it
            </button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
