import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  User as UserIcon,
  X,
} from 'lucide-react';
import { CarePlusLogo } from './UI';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, type AppNotification } from '../types/hms';
import { apiFetch } from '../utils/api';

export interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SearchHit {
  category: string;
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

export const AppShell: React.FC<{
  navItems: NavItem[];
  activePage: string;
  onNavigate: (key: string) => void;
  onOpenQueueDisplay?: () => void;
  unreadTrigger?: number;
  children: React.ReactNode;
}> = ({ navItems, activePage, onNavigate, onOpenQueueDisplay, unreadTrigger, children }) => {
  const { user, logout, subscribeEvent } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Unread notification counter
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnread = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: (AppNotification & { isRead: boolean })[] }>('/notifications');
      setUnreadCount(res.notifications.filter((n) => !n.isRead).length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const unsub = subscribeEvent('notification:created', () => loadUnread());
    return () => unsub();
  }, [loadUnread, subscribeEvent, unreadTrigger]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ results: SearchHit[] }>(`/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.results);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const activeNav = navItems.find((n) => n.key === activePage);
  const activeTitle =
    activePage === 'profile'
      ? 'My Profile'
      : activePage === 'notifications'
      ? 'Notifications'
      : activeNav?.label || 'Dashboard';

  const SidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left min-w-0"
        >
          <CarePlusLogo size={30} />
          {!collapsed && <span className="font-display text-base font-bold text-slate-900 truncate">CarePlus</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:inline-flex p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
          <p className="text-[11px] font-medium text-slate-500">Workspace Portal</p>
          <p className="text-xs font-semibold text-sky-700 truncate mt-0.5">{ROLE_LABELS[user.role]}</p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onNavigate(item.key);
                setMobileOpen(false);
              }}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-sky-50 text-sky-800 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-500'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-slate-200 space-y-1">
        {onOpenQueueDisplay && user.role !== 'patient' && (
          <button
            type="button"
            onClick={onOpenQueueDisplay}
            title={collapsed ? 'Queue Display Screen' : undefined}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors whitespace-nowrap"
          >
            <MonitorPlay className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">Waiting Room Display</span>}
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block shrink-0 transition-all duration-200 ${collapsed ? 'w-[70px]' : 'w-64'}`}>
        <div className={`fixed top-0 bottom-0 left-0 z-30 transition-all duration-200 ${collapsed ? 'w-[70px]' : 'w-64'}`}>
          {SidebarContent}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 h-full">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <span className="font-medium text-slate-600">{ROLE_LABELS[user.role]}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-900">{activeTitle}</span>
            </nav>
          </div>

          {/* Global Permission-Filtered Search */}
          <div ref={searchBoxRef} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients, doctors, appointments, bills..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-sky-500"
            />
            {searchOpen && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto z-40 divide-y divide-slate-100">
                {searchResults.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">No matching records permitted for your role.</p>
                ) : (
                  searchResults.map((hit) => (
                    <button
                      key={`${hit.category}-${hit.id}`}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery('');
                        onNavigate(hit.route);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{hit.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{hit.subtitle}</p>
                      </div>
                      <span className="text-[11px] font-medium text-sky-700 shrink-0">{hit.category}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Controls: Notifications & Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('notifications')}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.fullName} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <UserIcon className="w-4 h-4 text-slate-600" />
                )}
                <span className="hidden md:inline text-xs font-semibold text-slate-800 max-w-[140px] truncate">{user.fullName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user.fullName}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <UserIcon className="w-3.5 h-3.5" />
                    <span>My Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('notifications');
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Notifications ({unreadCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-red-700 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};
