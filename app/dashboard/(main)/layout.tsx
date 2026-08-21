import { auth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FloatingSupportButton from '@/components/FloatingSupportButton';

/**
 * Layout for the MAIN dashboard route (`/dashboard`).
 *
 * This is a dedicated route group `(main)` so that the main dashboard — which
 * renders its own internal vertical tab sidebar + multi-column command center —
 * gets a wide, full-bleed chrome (Navbar + wide container + FloatingSupportButton
 * + Footer) WITHOUT the shared AuthedSidebarLayout. That shared sidebar would
 * otherwise collide with the dashboard's own internal nav, crushing the Live
 * Scores / Top Arbitrage / AI Analyst panels onto one cramped line.
 */
export default async function MainDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;

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
