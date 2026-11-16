import { useState } from 'react';
import {
  BarChart3,
  Clock,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { NavSection } from '../types/analytics';
import { MoonLogo } from './MoonLogo';

interface SidebarNavProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  userEmail: string;
  isAdmin: boolean;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'history', label: 'Message History', icon: Clock },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'group', label: 'Group Information', icon: Info },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'admin', label: 'Admin Panel', icon: ShieldCheck },
];

export function SidebarNav({
  activeSection,
  onSelect,
  userEmail,
  isAdmin,
  onSignOut,
}: SidebarNavProps) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const primaryMobileItems = NAV_ITEMS.slice(0, 4);
  const secondaryMobileItems = NAV_ITEMS.slice(4);

  const handleSelect = (id: NavSection) => {
    onSelect(id);
    setMobileMoreOpen(false);
  };

  return (
    <>
      {/* Desktop & Tablet Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 bg-[#0D0D13] border-r border-violet-300/10 z-30">
        <div className="px-5 py-5 border-b border-violet-300/10 flex items-center gap-3">
          <MoonLogo className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <div className="font-display font-semibold text-sm text-zinc-100 leading-tight truncate">
              MoonLight Gang Analytics
            </div>
            <div className="text-xs text-zinc-400 mt-0.5 truncate">
              TikTok Group Monitor
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                  active
                    ? 'bg-violet-500/15 text-violet-200 border border-violet-400/25'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-violet-300' : 'text-zinc-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-violet-300/10 space-y-3">
          <div className="text-xs text-zinc-400 space-y-0.5">
            <div className="text-zinc-200 font-medium truncate">{userEmail}</div>
            <div>{isAdmin ? 'Administrator' : 'Verified Viewer'} · Asia/Dhaka</div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-violet-300/10 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Header */}
      <header className="md:hidden sticky top-0 z-30 h-14 px-4 bg-[#0D0D13]/95 backdrop-blur-md border-b border-violet-300/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <MoonLogo className="w-8 h-8 shrink-0" />
          <span className="font-display font-semibold text-sm text-zinc-100 truncate">
            MoonLight Gang Analytics
          </span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          className="h-10 px-3 rounded-lg text-xs font-medium text-zinc-300 bg-white/[0.04] border border-violet-300/10 flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign out</span>
        </button>
      </header>

      {/* Mobile Bottom Navigation (4 primary + More sheet toggle) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-[#0D0D13]/95 backdrop-blur-md border-t border-violet-300/15 grid grid-cols-5"
        aria-label="Mobile Navigation"
      >
        {primaryMobileItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] px-1 text-[11px] font-medium transition-colors ${
                active ? 'text-violet-300' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-full">
                {item.id === 'history' ? 'History' : item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-1 min-h-[44px] px-1 text-[11px] font-medium transition-colors ${
            secondaryMobileItems.some((s) => s.id === activeSection) || mobileMoreOpen
              ? 'text-violet-300'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {mobileMoreOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>More</span>
        </button>
      </nav>

      {/* Mobile Slide-Up More Drawer */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/70" onClick={() => setMobileMoreOpen(false)}>
          <div
            className="absolute bottom-16 inset-x-0 bg-[#12121B] border-t border-violet-300/15 rounded-t-2xl p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-zinc-400 px-2 pb-1">
              {userEmail} · {isAdmin ? 'Admin' : 'Viewer'}
            </div>
            {secondaryMobileItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium min-h-[44px] ${
                    active
                      ? 'bg-violet-500/15 text-violet-200 border border-violet-400/25'
                      : 'text-zinc-300 bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 text-violet-300 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
