import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FloatingSupportButton from '@/components/FloatingSupportButton';
import AuthedSidebarLayout from '@/components/AuthedSidebarLayout';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  // Check if current page is the main dashboard (DashboardClient)
  const isMainDashboard = children && typeof children === 'object' && 'type' in children && (children.type as any)?.displayName === 'DashboardClient';

  // If main dashboard, use a wide layout that fills the desktop viewport.
  // The dashboard manages its own internal sidebar + content grid, so we
  // avoid capping the width here — the sidebar + multi-column content need
  // the full screen on large monitors.
  if (isMainDashboard) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-[1600px] py-3 sm:py-5 px-3 sm:px-5 lg:px-8">
          {children}
        </div>
        <FloatingSupportButton isAdmin={user?.isAdmin ?? false} />
        <Footer />
      </>
    );
  }

  // Other dashboard pages (stats, chat, etc.) share the same sidebar layout
  // used by /account and /account/link-discord for a consistent nav.
  return <AuthedSidebarLayout user={user}>{children}</AuthedSidebarLayout>;
}