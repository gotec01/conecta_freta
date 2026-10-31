import type { Metadata } from 'next';
import PublicOrderConfirmation from './public-order-confirmation';

export const metadata: Metadata = {
  title: 'Confirmação do agendamento | Nexo',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PublicOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicOrderConfirmation token={token} />;
}
