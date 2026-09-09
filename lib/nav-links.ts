/**
 * Single source of truth for authenticated navigation.
 *
 * Previously each nav surface (top Navbar, AuthedSidebarLayout, the dashboard's
 * own internal sidebar) hard-coded its own list of links. They drifted badly:
 * the dashboard had no link to Account or DiamondDraft, DiamondDraft was only
 * reachable from the profile page, and there was no mobile menu at all. Every
 * nav surface now renders from these arrays, so adding a destination once makes
 * it appear everywhere.
 */

import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  User as UserIcon,
  Shield,
  Link as LinkIcon,
  LifeBuoy,
  Headphones,
  Code2,
  Trophy,
  CalendarDays,
  DollarSign,
  GraduationCap,
  Newspaper,
  BookOpen,
  Tags,
  Brain,
  KeyRound,
  FileText,
  PenLine,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Short hint shown in the command palette / mobile drawer. */
  description?: string;
  /** Only render for admins. */
  adminOnly?: boolean;
  /** Only render for users with the writer role (admins always qualify). */
  writerOnly?: boolean;
  /** Extra search terms for the command palette. */
  keywords?: string[];
}

export interface NavSection {
  title: string;
  links: NavLink[];
}

/** Core signed-in destinations — the things people use every day. */
export const PRIMARY_LINKS: NavLink[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Command center, odds, arbitrage and AI picks',
    keywords: ['home', 'overview', 'command center'],
  },
  {
    href: '/dashboard/games/mlb',
    label: 'Games',
    icon: CalendarDays,
    description: 'Scores, matchups, box scores and game news',
    keywords: ['scores', 'schedule', 'matchups', 'box score'],
  },
  {
    href: '/dd',
    label: 'DiamondDraft',
    icon: Trophy,
    description: 'Free fantasy leagues and live drafts',
    keywords: ['fantasy', 'draft', 'league', 'diamond draft'],
  },
  {
    href: '/arbitrage',
    label: 'Arbitrage',
    icon: DollarSign,
    description: 'Live guaranteed-profit betting opportunities',
    keywords: ['arb', 'sure bet', 'edge'],
  },
  {
    href: '/dashboard/chat',
    label: 'AI Chat',
    icon: MessageSquare,
    description: 'Ask the AI analyst about any matchup',
    keywords: ['assistant', 'analyst', 'bot'],
  },
  {
    href: '/dashboard/stats',
    label: 'Your Stats',
    icon: BarChart3,
    description: 'Your tracked bets and performance',
    keywords: ['performance', 'history', 'roi'],
  },
];

/** Account / billing / integration destinations. */
export const ACCOUNT_LINKS: NavLink[] = [
  {
    href: '/account',
    label: 'Profile & Account',
    icon: UserIcon,
    description: 'Your profile, plan and billing',
    keywords: ['profile', 'settings', 'billing', 'subscription', 'plan', 'me'],
  },
  {
    href: '/account/link-discord',
    label: 'Link Discord',
    icon: LinkIcon,
    description: 'Connect your Discord account for alerts',
    keywords: ['discord', 'connect', 'integration'],
  },
  {
    href: '/api-access/manage',
    label: 'API Keys',
    icon: KeyRound,
    description: 'Manage your API keys and usage',
    keywords: ['api', 'developer', 'keys', 'tokens'],
  },
  {
    href: '/pricing',
    label: 'Plans & Pricing',
    icon: Tags,
    description: 'Compare plans and upgrade',
    keywords: ['upgrade', 'subscribe', 'premium', 'vip', 'cost'],
  },
  {
    href: '/dashboard/support',
    label: 'Support',
    icon: LifeBuoy,
    description: 'Get help from the team',
    keywords: ['help', 'contact', 'ticket', 'issue'],
  },
  {
    href: '/dashboard/news',
    label: 'My Articles',
    icon: PenLine,
    description: 'Write and submit articles for ValorOdds',
    keywords: ['write', 'writer', 'drafts', 'articles', 'newsroom'],
    writerOnly: true,
  },
];

/** Research / learning destinations. */
export const EXPLORE_LINKS: NavLink[] = [
  {
    href: '/news',
    label: 'News',
    icon: FileText,
    description: 'ValorOdds originals and live headlines',
    keywords: ['articles', 'stories', 'newsroom', 'originals', 'spotlight'],
  },
  {
    href: '/sports',
    label: 'Sports Hub',
    icon: Newspaper,
    description: 'Browse every sport we cover',
    keywords: ['leagues', 'nfl', 'nba', 'mlb', 'nhl', 'soccer'],
  },
  {
    href: '/market-intelligence',
    label: 'Market Intelligence',
    icon: Brain,
    description: 'Sharp money and line-movement insights',
    keywords: ['steam', 'sharp', 'line movement', 'market'],
  },
  {
    href: '/learn',
    label: 'Learn',
    icon: GraduationCap,
    description: 'Betting guides and strategy articles',
    keywords: ['education', 'guides', 'strategy', 'how to'],
  },
  {
    href: '/learn/glossary',
    label: 'Glossary',
    icon: BookOpen,
    description: 'Betting terms explained',
    keywords: ['terms', 'definitions', 'vocabulary'],
  },
  {
    href: '/docs',
    label: 'API Docs',
    icon: Code2,
    description: 'Developer documentation',
    keywords: ['documentation', 'developer', 'reference'],
  },
];

/** Admin-only destinations. */
export const ADMIN_LINKS: NavLink[] = [
  {
    href: '/admin',
    label: 'Admin Panel',
    icon: Shield,
    description: 'Site administration',
    adminOnly: true,
    keywords: ['admin', 'manage'],
  },
  {
    href: '/admin/news',
    label: 'News Studio',
    icon: FileText,
    description: 'Generate, review and publish articles',
    adminOnly: true,
    keywords: ['articles', 'news', 'generate', 'ai', 'writers', 'editorial'],
  },
  {
    href: '/admin/support',
    label: 'Support Tickets',
    icon: Headphones,
    description: 'Respond to user tickets',
    adminOnly: true,
    keywords: ['tickets', 'inbox'],
  },
  {
    href: '/admin/api-access',
    label: 'API Monetization',
    icon: Code2,
    description: 'API plans and revenue',
    adminOnly: true,
    keywords: ['api', 'revenue', 'monetization'],
  },
  {
    href: '/admin/api-monitor',
    label: 'API Monitor',
    icon: BarChart3,
    description: 'Live API health and usage',
    adminOnly: true,
    keywords: ['monitor', 'health', 'usage'],
  },
  {
    href: '/admin/notifications',
    label: 'Notifications',
    icon: LifeBuoy,
    description: 'Send push notifications',
    adminOnly: true,
    keywords: ['push', 'broadcast', 'alerts'],
  },
];

/**
 * Grouped sections used by the mobile drawer and command palette.
/**
 * Grouped sections used by the mobile drawer and command palette.
 * Admin section is filtered out for non-admins; writer-only links are
 * filtered out for non-writers. Admins always qualify as writers.
 */
export function getNavSections(isAdmin: boolean, isWriter = false): NavSection[] {
  const writer = isWriter || isAdmin;
  const filterLinks = (links: NavLink[]) =>
    links.filter((l) => (l.adminOnly ? isAdmin : true) && (l.writerOnly ? writer : true));
  const sections: NavSection[] = [
    { title: 'Product', links: filterLinks(PRIMARY_LINKS) },
    { title: 'Explore', links: filterLinks(EXPLORE_LINKS) },
    { title: 'Account', links: filterLinks(ACCOUNT_LINKS) },
  ];
  if (isAdmin) sections.push({ title: 'Admin', links: filterLinks(ADMIN_LINKS) });
  return sections;
}

/** Flat list of every destination — used to power command-palette search. */
export function getAllNavLinks(isAdmin: boolean, isWriter = false): NavLink[] {
  return getNavSections(isAdmin, isWriter).flatMap((s) => s.links);
}
