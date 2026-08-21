import { auth } from '@/lib/auth';
import AuthedSidebarLayout from '@/components/AuthedSidebarLayout';

/**
 * Layout for dashboard SUB-pages (`/dashboard/chat`, `/dashboard/stats`,
 * `/dashboard/support`). These share the sidebar nav used by /account and
 * /account/link-discord for a consistent signed-in experience.
 */
export default async function DashboardSubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;

  return <AuthedSidebarLayout user={user}>{children}</AuthedSidebarLayout>;
}
