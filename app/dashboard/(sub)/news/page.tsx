import { auth } from '@/lib/auth';
import Link from 'next/link';
import { isWriterUser } from '@/lib/news-platform';
import WriterWorkspaceClient from './WriterWorkspaceClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Articles — Writer Workspace' };

/**
 * Writer workspace: /dashboard/news
 *
 * Writers (role granted by an admin) draft and submit articles here.
 * Admins can write and publish directly from the News Studio instead.
 */
export default async function WriterWorkspacePage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold">Writer Workspace</h1>
        <p className="mt-2 text-brand-muted">Sign in to write for ValorOdds.</p>
        <Link href="/login" className="btn-primary mt-4 w-fit">Sign in</Link>
      </div>
    );
  }

  const canWrite = await isWriterUser(user.id);
  if (!canWrite) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold">Writer Workspace</h1>
        <p className="mt-2 text-brand-muted">
          The writer role is granted by the ValorOdds team. If you&apos;re interested in
          contributing, reach out from the <Link href="/dashboard/support" className="text-brand-primary hover:underline">support page</Link>.
        </p>
      </div>
    );
  }

  return <WriterWorkspaceClient />;
}
