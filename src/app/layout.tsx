import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, JetBrains_Mono, STIX_Two_Text } from 'next/font/google';
import type { ReactNode } from 'react';

import { CommandPalette } from '@/components/CommandPalette';
import { DesignThemeApplier } from '@/components/DesignThemeApplier';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';
import './design-themes.css';

const stix = STIX_Two_Text({ subsets: ['latin', 'latin-ext'], variable: '--font-stix', display: 'swap' });
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' });
// Used by the optional Terminal design theme (Settings → Design).
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plexmono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Reader',
  description: 'Markdown Reader fuer Nextcloud',
  manifest: '/manifest.webmanifest',
  applicationName: 'Reader'
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#16130f' }
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="de" suppressHydrationWarning className={`${stix.variable} ${jbMono.variable} ${plexMono.variable}`}>
      <body>
        <ThemeProvider>
          {children}
          <CommandPalette />
          <DesignThemeApplier />
        </ThemeProvider>
      </body>
    </html>
  );
}
