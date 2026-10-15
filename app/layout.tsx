import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexo | Central de integrações',
  description: 'Organize e publique seus agendamentos em vários portais, em um só lugar.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
