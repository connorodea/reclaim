import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Reclaim — Recovery intelligence',
  description: 'Know what every return is worth. Compare recovery routes, make accountable decisions, and measure realized outcomes.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
