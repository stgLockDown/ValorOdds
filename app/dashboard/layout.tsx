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

  // If main dashboard, use simpler layout without sidebar
  if (isMainDashboard) {
    return (
      <>
        <Navbar />
        <div className="mx-auto max-w-7xl py-3 sm:py-4 px-3 sm:px-4 lg:px-6">
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