import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { Droplets, TrendingUp, Bell, LogOut, Plus, Search, X, Check, AlertTriangle, Home, Menu, Boxes, Clock, CheckCircle, XCircle, Info, Archive, Shield, Edit2, Trash2, Lock, RefreshCw, Loader2, UserCog, UserPlus, ScanBarcode } from "lucide-react";
import PondManagement from "./modules/PondManagement";
import { loadKoiFish, saveKoiFish, loadCustomerKoi, saveCustomerKoi, loadPondData, savePondData } from "./lib/koiStorage";
import { loadProducts, saveProducts, loadStockLog, saveStockLog } from "./lib/farmStorage";
import { markLowStockAlertShownToday, wasLowStockAlertShownToday } from "./lib/lowStockAlert";
import { clearLocalOnlyStorage, emptyPondData, resolveCloudKoiPayload, resolveCloudWhatsappGroups } from "./lib/cloudData";
import { adjustProductStockInList, buildStockLogEntry, findProductByBarcode, formatRestockLogNote, genStockLogId, getLowStockProducts, normalizeProductRecord, parseStockQty, sameProductId, sortStockLog, validateProductFields } from "./lib/inventoryOps";
import { stockProducts } from "./lib/productCatalog";
import { reconcileKoiSoldFromInvoices } from "./lib/koiInvoice";
import { sortInvoices } from './lib/invoiceDesign';
import { computeDashboardMetrics } from './lib/dashboardMetrics';
import { normalizeCustomerKoiForCache, normalizeKoiFishForCache } from "./lib/farmImage";
import { loadWhatsappGroups } from "./lib/deliveryWhatsApp";
import {
  defaultPermissionsForRole, getUserDeactivateBlockReason, getUserDeleteBlockReason, userProfileChanged,
  normalizeUserRecord, sameUserId, userInitial, validateUserFields,
} from "./lib/teamOps";
import { findLocalUserByPin, sanitizePinInput, validateChangePinForm, validateLoginPin, validateSetupOwnerFields } from "./lib/loginOps";
import { SYNC_ENTITIES } from "./lib/cloudSync";
import * as db from "./lib/database";
import * as auth from "./lib/auth";
import { applyCloudRetention, isAppVisibleStockLog } from "./lib/retention";
import { isSupabaseConfigured } from "./lib/supabase";
import { clearAllDeletions, peekDeletions } from "./lib/syncDeletions";
import { applyServerTombstones, filterMergeDeletions, mergeLiveByEntityWithLocal, pruneLocalOnlyCloudRows, stripTombstonedRows } from "./lib/tombstones";
import { writeCloudFirst, writeInventoryCloudFirst } from "./lib/cloudWrite";
import { mergeRecords, mergePondData, mergeInvoices, mergeStockLog, mergeProducts, mergeKoiFish, mergeCustomerKoi, resolveExpenseConflict, resolveEventConflict } from "./lib/cloudMerge";
import { countIncomingTeamChanges, TEAM_SYNC_EVENT_THROTTLE_MS, TEAM_SYNC_POLL_THROTTLE_MS, TEAM_SYNC_USER_IDLE_MS } from "./lib/teamSyncDetect";
import { applyInvoicePins } from "./lib/invoicePins";
import { touchPondData, touchUpdatedAt } from "./lib/syncMeta";
import { syncPondCalendarAssignees } from "./lib/pondReminderCalendar";
import { PRODUCT_CATEGORIES, LIST_PAGE_SIZE, ALL_PERMISSIONS, formatSGD, INITIAL_PRODUCTS, INITIAL_CUSTOMERS, INITIAL_INVOICES, INITIAL_EXPENSES, INITIAL_DELIVERIES, INITIAL_EVENTS, LOCAL_DEMO_USERS } from "./data/constants";
import logo from "./assets/logo.png";
import Fab from "./components/Fab";
import MobileBottomNav from "./components/MobileBottomNav";
import ToastStack from "./components/ToastStack";
import BarcodeScannerModal from "./components/BarcodeScannerModal";
import ErrorBoundary from "./components/ErrorBoundary";
import EmptyState from "./components/ui/EmptyState";
import ModuleSkeleton from "./components/ui/ModuleSkeleton";
import PaginationControls from "./components/ui/PaginationControls";
import { usePagination } from "./hooks/usePagination";
import { useTeamSyncPoll } from "./hooks/useTeamSyncPoll";
import { buildTeamNotification, buildToastNotification, isTeamNotification } from "./lib/notifications";
import { getConnectionState, onConnectionChange, isTransientSyncError } from "./lib/connectionManager";
import { cacheWriteAllData, cacheReadAllData } from "./lib/localCache";
import { logSyncEvent } from "./lib/syncAnalytics";
import ConnectionStatus from "./components/ConnectionStatus";
import PushNotificationPrompt from "./components/PushNotificationPrompt";
import { mergeIncomingTeamNotifications } from "./lib/teamNotifications";
import { filterNotificationsForUser, isTeamNotificationForUser } from "./lib/assignTeam";
import { ensurePushSubscription } from "./lib/webPush";

function AppLogo({ size = "md", className = "" }) {
  const sizes = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-20 h-20" };
  return (
    <img
      src={logo}
      alt="Marugen Koi Farm"
      className={`${sizes[size]} rounded-full object-cover shrink-0 ${className}`}
    />
  );
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === "owner") return true;
  // Pond Mgmt is available to every active team member (view + complete reminders).
  if (permission === "ponds") return user.active !== false;
  return user.permissions?.includes(permission) ?? false;
}

function canEditRecords(user) {
  return hasPermission(user, "edit");
}

function canDeleteRecords(user) {
  return hasPermission(user, "delete");
}

function notifyPermissionDenied(addNotification, permissionId) {
  const label = ALL_PERMISSIONS.find((p) => p.id === permissionId)?.label || permissionId;
  addNotification({
    type: "error",
    title: "Permission Denied",
    message: `You need the "${label}" permission. Contact the farm owner.`,
  });
}

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}
function Badge({ children, className = "" }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl ${className}`}>{children}</div>;
}

const MODAL_CLICK_GUARD_MS = 100;

function ConfirmModalFooter({ onCancel, cancelLabel = "Cancel", cancelDisabled = false, children }) {
  return (
    <div className="modal-actions !mt-0 w-full">
      <Btn variant="secondary" onClick={onCancel} disabled={cancelDisabled} className="w-full sm:w-auto justify-center">{cancelLabel}</Btn>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, children, size = "md", priority = false, footer = null, backdropClose = true }) {
  const [guardActive, setGuardActive] = useState(false);
  const guardTimerRef = useRef(null);
  const prevOpenRef = useRef(open);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setGuardActive(true);
      if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
      guardTimerRef.current = window.setTimeout(() => setGuardActive(false), MODAL_CLICK_GUARD_MS);
    }
    prevOpenRef.current = open;
  }, [open]);

  useEffect(() => () => {
    if (guardTimerRef.current) clearTimeout(guardTimerRef.current);
  }, []);

  if (!open && !guardActive) return null;

  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl", full: "max-w-[900px]" };
  const isCompact = size === "sm";
  const panelHeightClass = isCompact
    ? "h-auto max-h-[92dvh]"
    : "h-[92dvh] sm:h-auto max-h-[92dvh] sm:max-h-[90vh]";
  const zClass = priority ? "z-[90]" : "z-[80]";
  const guardZClass = priority ? "z-[95]" : "z-[85]";

  const handleBackdropPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    backdropDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropPointerUp = (e) => {
    if (!backdropClose || !onClose) return;
    if (e.target === e.currentTarget && backdropDownRef.current) onClose();
    backdropDownRef.current = false;
  };

  return (
    <>
      {guardActive && !open && (
        <div className={`fixed inset-0 ${guardZClass} pointer-events-none`} aria-hidden />
      )}
      {open && (
        <div
          className={`fixed inset-0 ${zClass} flex ${isCompact ? 'items-center p-4' : 'items-end sm:items-center p-0 sm:p-4'} justify-center bg-black/70 backdrop-blur-sm touch-manipulation`}
          onPointerDown={handleBackdropPointerDown}
          onPointerUp={handleBackdropPointerUp}
        >
          <div
            className={`bg-slate-800 border border-slate-700 ${isCompact ? 'rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'} w-full ${sizes[size]} ${panelHeightClass} flex flex-col shadow-2xl overflow-hidden`}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-700 shrink-0 bg-slate-800 pt-[max(1rem,env(safe-area-inset-top,0px))]">
              <h3 className="text-base sm:text-lg font-bold text-white pr-2 min-w-0 truncate">{title}</h3>
              {onClose && backdropClose && (
                <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white p-2 -mr-1 rounded-lg hover:bg-slate-700 transition-colors touch-manipulation shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={20} /></button>
              )}
            </div>
            <div className="overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 flex-1 min-h-0 p-4 sm:p-5">{children}</div>
            {footer && (
              <div className="relative z-20 sticky bottom-0 shrink-0 border-t border-slate-700 bg-slate-800/95 backdrop-blur-sm p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
                {footer}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Input({ label, value, onChange, onBlur, type = "text", placeholder, className = "", required, min, max, step, readOnly, inputMode }) {
  const isDateTimeField = type === "date" || type === "time" || type === "datetime-local";
  const fieldClass = "w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all";
  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      {isDateTimeField ? (
        <div className="w-full max-w-full min-w-0 overflow-hidden">
          <input type={type} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} min={min} max={max} step={step} readOnly={readOnly} inputMode={inputMode}
            className={`datetime-field ${fieldClass} ${readOnly ? "opacity-80 cursor-default" : ""}`} />
        </div>
      ) : (
        <input type={type} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} min={min} max={max} step={step} readOnly={readOnly} inputMode={inputMode}
          className={`${fieldClass} ${readOnly ? "opacity-80 cursor-default" : ""}`} />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, className = "", required }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      <select value={value} onChange={onChange}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all">
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder, rows = 3, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</label>}
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all resize-none" />
    </div>
  );
}

/** Barcode text field with an inline scan-camera button (product add/edit forms). */
function BarcodeInputField({ value, onChange, onScan, className = "" }) {
  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Barcode</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="Scan or type barcode"
          className="w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-600 rounded-lg pl-3 pr-12 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
        />
        <button
          type="button"
          onClick={onScan}
          aria-label="Scan barcode with camera"
          className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center rounded-md text-cyan-400 hover:text-cyan-300 hover:bg-slate-700/60 active:bg-slate-700 touch-manipulation"
        >
          <ScanBarcode size={18} />
        </button>
      </div>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", className = "", disabled, type = "button" }) {
  const variants = {
    primary: "bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold shadow-lg shadow-cyan-500/20",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white",
    danger: "bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30",
    success: "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30",
    ghost: "text-slate-400 hover:text-white hover:bg-slate-700",
  };
  const sizes = { sm: "px-3 py-2 text-xs min-h-[44px]", md: "px-4 py-2.5 text-sm min-h-[44px]", lg: "px-6 py-3 text-base min-h-[48px]" };
  const handleClick = (e) => {
    if (disabled || !onClick) return;
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  };
  const handlePointerDown = (e) => {
    if (disabled) return;
    e.stopPropagation();
  };
  return (
    <button type={type} onClick={handleClick} onPointerDown={handlePointerDown} disabled={disabled}
      className={`rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${variants[variant]} ${sizes[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}>
      {children}
    </button>
  );
}

function AccessDenied({ moduleName }) {
  return (
    <Card className="p-12 flex flex-col items-center justify-center text-center">
      <Shield size={48} className="text-slate-500 mb-4" />
      <h3 className="text-xl font-black text-white mb-2">Access Denied</h3>
      <p className="text-slate-400 text-sm max-w-sm">
        You don&apos;t have permission to access {moduleName}. Contact the farm owner to update your permissions.
      </p>
    </Card>
  );
}

function actorLabel(n) {
  if (!n.actor) return null;
  if (n.actorRole === "owner") return `Owner · ${n.actor}`;
  if (n.actorRole === "system") return "System alert";
  return `${n.actor}`;
}

function NotificationPanel({ notifications, onDismiss, onClear, onMarkRead }) {
  const unread = notifications.filter(n => !n.read).length;
  return (
    <div className="space-y-2 w-full">
      {notifications.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Bell size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No team alerts</p>
          <p className="text-xs text-slate-600 mt-1">Important actions by staff or owner appear here.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400">{unread} unread</span>
            <button onClick={onClear} className="text-xs text-cyan-400 hover:text-cyan-300">Clear all</button>
          </div>
          {notifications.map(n => (
            <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${n.read ? "bg-slate-800/30 border-slate-700/30" : "bg-slate-700/40 border-slate-600/50"}`}
              onClick={() => onMarkRead(n.id)}>
              <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${n.type === "warning" ? "bg-amber-500/20 text-amber-400" : n.type === "success" ? "bg-emerald-500/20 text-emerald-400" : n.type === "error" ? "bg-red-500/20 text-red-400" : "bg-cyan-500/20 text-cyan-400"}`}>
                {n.type === "warning" ? <AlertTriangle size={12} /> : n.type === "success" ? <CheckCircle size={12} /> : n.type === "error" ? <XCircle size={12} /> : <Info size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium leading-tight">{n.title}</p>
                {actorLabel(n) && (
                  <p className="text-[11px] text-cyan-400/90 font-semibold mt-0.5">{actorLabel(n)}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">{n.message}</p>
                <p className="text-xs text-slate-500 mt-1">{n.time}</p>
              </div>
              {!n.read && <div className="w-2 h-2 bg-cyan-400 rounded-full mt-1.5 flex-shrink-0" />}
              <button onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><X size={12} /></button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AuthDeveloperFooter() {
  return (
    <footer className="pb-4 sm:pb-6 text-center shrink-0">
      <p className="text-[10px] sm:text-xs text-slate-600 tracking-wide">
        Developed by <span className="text-slate-500">Nyi Nyi Khine</span>
      </p>
    </footer>
  );
}

function SetupScreen({ onComplete }) {
  const [name, setName] = useState("Marugen Owner");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    const check = validateSetupOwnerFields({ name, pin, confirmPin });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await auth.setupOwner({ name: check.name, pin: check.pin, confirmPin: check.pin });
      const appUser = auth.toAppUser(result.user);
      if (!appUser) throw new Error("Setup completed but user profile is invalid.");
      onComplete(appUser);
    } catch (err) {
      setError(err.message || "Setup failed.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 flex flex-col safe-bottom" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 60%), #0f172a" }}>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <AppLogo size="lg" className="mx-auto mb-4 shadow-2xl shadow-black/50 ring-2 ring-slate-700" />
            <h1 className="text-xl sm:text-2xl font-black text-white">Welcome to Marugen Farm</h1>
            <p className="text-slate-400 text-sm mt-1">Create your owner account to get started</p>
          </div>
          <Card className="p-5 sm:p-6 space-y-4">
            <Input label="Owner Name" value={name} onChange={e => setName(e.target.value)} required />
            <Input label="Choose PIN (4–6 digits)" type="password" inputMode="numeric" value={pin} onChange={e => setPin(sanitizePinInput(e.target.value))} required />
            <Input label="Confirm PIN" type="password" inputMode="numeric" value={confirmPin} onChange={e => setConfirmPin(sanitizePinInput(e.target.value))} required />
            {error && <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={14} />{error}</div>}
            <Btn onClick={handleSetup} disabled={loading} className="w-full justify-center" size="lg">{loading ? "Setting up..." : "Create Account →"}</Btn>
          </Card>
        </div>
      </div>
      <AuthDeveloperFooter />
    </div>
  );
}

function LoginScreen({ onLogin, users, cloudMode }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const pinCheck = validateLoginPin(pin);
    if (!pinCheck.ok) {
      setError(pinCheck.message);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (cloudMode) {
        const result = await auth.loginWithPin(pinCheck.pin);
        const appUser = auth.toAppUser(result.user);
        if (!appUser) throw new Error("Login succeeded but user profile is invalid.");
        onLogin(appUser);
      } else {
        const match = findLocalUserByPin(users, pinCheck.pin);
        if (!match.ok) {
          setError(match.message);
        } else {
          const user = match.user;
          auth.setSession({
            token: "local",
            user: {
              id: user.id,
              name: user.name,
              role: user.role,
              permissions: user.permissions,
              active: user.active !== false,
            },
          });
          const appUser = auth.toAppUser(user);
          if (!appUser) throw new Error("Login succeeded but user profile is invalid.");
          onLogin(appUser);
        }
      }
    } catch (err) {
      setError(err.message || "Login failed.");
    }
    setLoading(false);
  };

  const activeUsers = users.filter((u) => u.active !== false);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 flex flex-col safe-bottom" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 60%), #0f172a" }}>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6 sm:mb-8">
            <AppLogo size="lg" className="mx-auto mb-4 shadow-2xl shadow-black/50 ring-2 ring-slate-700" />
            <h1 className="text-xl sm:text-2xl font-black text-white">Marugen Koi Farm</h1>
            <p className="text-cyan-400 text-sm font-medium mt-1">Koi & Arowana Singapore</p>
          </div>
          <Card className="p-5 sm:p-6">
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1"><Lock size={12} /> PIN Login</label>
              <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(sanitizePinInput(e.target.value))} placeholder="••••"
                onKeyDown={e => { if (e.key === "Enter" && !loading) { e.preventDefault(); handleLogin(); } }}
                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 py-4 text-white text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 touch-manipulation" />
              <p className="text-xs text-slate-500 mt-2 text-center">
                {cloudMode ? "Sign in with the PIN your owner gave you." : "Enter your PIN to sign in."}
              </p>
            </div>
            {cloudMode ? null : activeUsers.length > 0 ? (
              <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-semibold">Registered Users</p>
                <div className="space-y-1">
                  {activeUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{u.name}</span>
                      <Badge className={u.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}>{u.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {error && <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={14} />{error}</div>}
            <Btn onClick={handleLogin} disabled={loading} className="w-full justify-center" size="lg">{loading ? "Logging in..." : "Login →"}</Btn>
          </Card>
        </div>
      </div>
      <AuthDeveloperFooter />
    </div>
  );
}

function Dashboard({
  products, stockLog = [], currentUser, onNavigate, onRetrySync, cloudStale,
}) {
  const can = useCallback((perm) => hasPermission(currentUser, perm), [currentUser]);
  const go = useCallback((tab) => { if (hasPermission(currentUser, tab)) onNavigate?.(tab); }, [currentUser, onNavigate]);

  const metrics = useMemo(
    () => computeDashboardMetrics({
      products: can("inventory") ? products : [],
      can,
    }),
    [products, can],
  );

  const { kpiCards, lowStock } = metrics;

  const recentActivity = useMemo(
    () => (can("inventory") ? sortStockLog(stockLog).slice(0, 6) : []),
    [can, stockLog],
  );

  const displayDate = new Date().toLocaleDateString("en-SG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

  const sectionLink = (tab, label) => can(tab) ? (
    <button type="button" onClick={() => go(tab)} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold touch-manipulation">{label}</button>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Dashboard</h2>
          <p className="text-slate-400 text-sm mt-0.5">Welcome back, {currentUser?.displayName || currentUser?.name || "there"}</p>
        </div>
        <p className="text-xs text-slate-500 shrink-0">{displayDate}</p>
      </div>
      {cloudStale && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-100 text-xs leading-relaxed">
              Cloud sync paused — figures reflect this device only until sync resumes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRetrySync?.()}
            className="text-amber-300 text-xs font-semibold shrink-0 hover:text-amber-100 touch-manipulation"
          >
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiCards.length === 0 ? (
          <Card className="p-4 col-span-2 lg:col-span-3 border-slate-700/50">
            <p className="text-slate-400 text-sm">No summary modules assigned yet. Contact the farm owner for access to inventory.</p>
          </Card>
        ) : kpiCards.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => k.tab && go(k.tab)}
            className="text-left bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-cyan-500/30 transition-colors touch-manipulation"
          >
            <p className="text-slate-400 text-xs uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{k.value}</p>
            {k.subtitle && <p className="text-xs text-cyan-400 mt-1 truncate">{k.subtitle}</p>}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {can("inventory") && (
          <Card className={`p-4 ${lowStock.length > 0 ? "border-amber-500/20 bg-amber-500/5" : ""}`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className={`text-sm font-bold flex items-center gap-2 ${lowStock.length > 0 ? "text-amber-300" : "text-white"}`}><AlertTriangle size={14} />Low Stock ({lowStock.length})</h3>
              {sectionLink("inventory", "Inventory →")}
            </div>
            {lowStock.length === 0 ? (
              <p className="text-slate-500 text-xs">All products sufficiently stocked</p>
            ) : lowStock.slice(0, 4).map((p) => (
              <div key={p.id} className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 truncate">{p.name}</span>
                <span className="text-amber-400 font-bold ml-2">{p.stock} {p.unit}</span>
              </div>
            ))}
          </Card>
        )}
        {can("ponds") && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Droplets size={14} className="text-cyan-400" />Pond Calculator</h3>
              {sectionLink("ponds", "Open →")}
            </div>
            <p className="text-slate-500 text-xs">Calculate pond water volume and salt dosing.</p>
          </Card>
        )}
        {can("users") && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><UserCog size={14} className="text-cyan-400" />Team & Permissions</h3>
              {sectionLink("users", "Manage →")}
            </div>
            <p className="text-slate-500 text-xs">Add staff accounts and set what each person can access.</p>
          </Card>
        )}
      </div>
      {can("inventory") && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Boxes size={14} className="text-cyan-400" />Recent Stock Activity</h3>
            {sectionLink("inventory", "View log →")}
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-slate-500 text-xs">No stock activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 text-xs border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-slate-200 font-medium truncate">{l.productName}</p>
                    <p className="text-slate-500 mt-0.5">{l.date} · By {l.by || "Staff"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge className={l.type === "restock" ? "bg-purple-500/20 text-purple-300" : l.type === "sell" ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}>{l.type}</Badge>
                    <p className="text-white font-bold mt-1">×{l.qty}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TEAM / STAFF MODULE (owner-only)
// ─────────────────────────────────────────────
function TeamModule({ users, setUsers, currentUser, addNotification, onCurrentUserUpdate, cloudMode, apiEnabled, onOpenChangePin }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const deletingUserRef = useRef(false);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ name: "", role: "staff", pin: "", permissions: defaultPermissionsForRole("staff"), active: true });

  if (!hasPermission(currentUser, "users")) return <AccessDenied moduleName="Team & Permissions" />;

  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);

  const openAdd = () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setForm({ name: "", role: "staff", pin: "", permissions: defaultPermissionsForRole("staff"), active: true });
    setEditUser(null);
    setShowAdd(true);
  };

  const openEdit = (user) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setForm({ name: user.name, role: user.role, pin: "", permissions: [...user.permissions], active: user.active !== false });
    setEditUser(user);
    setShowAdd(true);
  };

  const togglePermission = (permId) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permId)
        ? f.permissions.filter((p) => p !== permId)
        : [...f.permissions, permId],
    }));
  };

  const handleRoleChange = (e) => {
    const role = e.target.value;
    setForm((f) => {
      if (f.role === role) return f;
      return { ...f, role, permissions: defaultPermissionsForRole(role) };
    });
  };

  const saveUser = async () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const validated = validateUserFields(form, {
      isNew: !editUser,
      users,
      editUser,
      currentUserId: currentUser.id,
    });
    if (!validated.ok) {
      addNotification({ type: "error", title: "Validation Error", message: validated.message });
      return;
    }
    if (validated.pinChanging && !apiEnabled) {
      const pinTaken = users.some((u) => u.pin === validated.pin && !sameUserId(u.id, editUser?.id));
      if (pinTaken) {
        addNotification({ type: "error", title: "PIN In Use", message: "This PIN is already assigned to another user." });
        return;
      }
    }

    setSaving(true);
    try {
      if (apiEnabled) {
        if (editUser) {
          const saved = await db.updateUser({
            userId: editUser.id,
            name: validated.name,
            role: validated.role,
            pin: validated.pinChanging ? validated.pin : undefined,
            permissions: validated.permissions,
            active: validated.active,
          });
          if (saved) {
            setUsers((prev) => prev.map((u) => (sameUserId(u.id, saved.id) ? { ...u, ...saved } : u)));
          }
          try {
            const refreshed = await db.fetchUsers();
            if (refreshed?.length) setUsers(refreshed);
          } catch {
            /* keep saved row */
          }
          if (sameUserId(editUser.id, currentUser.id) && onCurrentUserUpdate) {
            onCurrentUserUpdate({
              name: validated.name,
              role: validated.role,
              permissions: validated.permissions,
              active: validated.active,
            });
          }
          const sessionsRevoked = !sameUserId(editUser.id, currentUser.id);
          const msg = validated.pinChanging
            ? `${validated.name} updated (PIN changed).${sessionsRevoked ? " They must log in again." : ""}`
            : `${validated.name} saved.${sessionsRevoked ? " They must log in again." : ""}`;
          addNotification({ type: "success", title: "User Updated", message: msg });
        } else {
          await db.addUser({
            name: validated.name,
            role: validated.role,
            pin: validated.pin,
            permissions: validated.permissions,
            active: validated.active,
          });
          const refreshed = await db.fetchUsers();
          if (refreshed) setUsers(refreshed);
          addNotification({ type: "success", title: "User Added", message: `${validated.name} (${validated.role}) account created. Share their PIN securely.` });
        }
      } else if (editUser) {
        setUsers((prev) => prev.map((u) => {
          if (!sameUserId(u.id, editUser.id)) return u;
          const next = {
            ...u,
            name: validated.name,
            role: validated.role,
            permissions: validated.permissions,
            active: validated.active,
          };
          if (validated.pinChanging) next.pin = validated.pin;
          return next;
        }));
        if (sameUserId(editUser.id, currentUser.id) && onCurrentUserUpdate) {
          onCurrentUserUpdate({
            name: validated.name,
            role: validated.role,
            permissions: validated.permissions,
            active: validated.active,
          });
        }
        addNotification({ type: "success", title: "User Updated", message: `${validated.name} saved locally.` });
      } else {
        const newUser = {
          id: Date.now(),
          name: validated.name,
          role: validated.role,
          pin: validated.pin,
          permissions: validated.permissions,
          active: validated.active,
        };
        setUsers((prev) => [...prev, newUser]);
        addNotification({ type: "success", title: "User Added", message: `${validated.name} added locally (offline mode).` });
      }
      setShowAdd(false);
      setEditUser(null);
    } catch (err) {
      addNotification({ type: "error", title: editUser ? "Update Failed" : "Add Failed", message: err?.message || "Could not save user to server." });
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteUser = (user) => {
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const blockReason = getUserDeleteBlockReason(user, { users, currentUserId: currentUser.id });
    if (blockReason) {
      addNotification({ type: "error", title: "Cannot Delete", message: blockReason });
      return;
    }
    setDeleteConfirm(user);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirm || deletingUserRef.current) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const user = deleteConfirm;
    deletingUserRef.current = true;
    setDeletingUser(true);
    try {
      if (apiEnabled) {
        await db.deleteUser(user.id);
        const data = await db.fetchAllData();
        if (data?.users) setUsers(data.users);
        else setUsers((prev) => prev.filter((u) => !sameUserId(u.id, user.id)));
      } else {
        setUsers((prev) => prev.filter((u) => !sameUserId(u.id, user.id)));
      }
      addNotification({ type: "info", title: "User Removed", message: `${user.name} has been permanently removed.` });
      setDeleteConfirm(null);
    } catch (err) {
      addNotification({ type: "error", title: "Delete Failed", message: err?.message || "Could not remove user from server." });
    } finally {
      deletingUserRef.current = false;
      setDeletingUser(false);
    }
  };

  const toggleActive = async (user) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (togglingUserId) return;
    const nextActive = user.active === false;
    if (!nextActive) {
      const blockReason = getUserDeactivateBlockReason(user, { users, currentUserId: currentUser.id });
      if (blockReason) {
        addNotification({ type: "error", title: "Cannot Deactivate", message: blockReason });
        return;
      }
    }
    setTogglingUserId(user.id);
    try {
      if (apiEnabled) {
        await db.updateUser({
          userId: user.id,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          active: nextActive,
        });
        const refreshed = await db.fetchUsers();
        if (refreshed) setUsers(refreshed);
      } else {
        setUsers((prev) => prev.map((u) => (sameUserId(u.id, user.id) ? { ...u, active: nextActive } : u)));
      }
      addNotification({ type: "info", title: nextActive ? "User Activated" : "User Deactivated", message: user.name });
    } catch (err) {
      addNotification({ type: "error", title: "Update Failed", message: err?.message || "Could not update user on server." });
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><UserCog size={22} className="text-cyan-400 shrink-0" />Team & Permissions</h2>
        <p className="text-slate-400 text-sm">Manage staff & owner accounts with module access</p>
      </div>
      <Fab onClick={openAdd} label="Add User" icon={UserPlus} hidden={showAdd || !!deleteConfirm || !canEdit} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-yellow-500/20 bg-yellow-500/5">
          <p className="text-xs text-slate-400">Owners</p>
          <p className="text-2xl font-black text-yellow-400">{users.filter((u) => u.role === "owner").length}</p>
        </Card>
        <Card className="p-4 border-blue-500/20 bg-blue-500/5">
          <p className="text-xs text-slate-400">Staff</p>
          <p className="text-2xl font-black text-blue-400">{users.filter((u) => u.role === "staff").length}</p>
        </Card>
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <p className="text-xs text-slate-400">Active</p>
          <p className="text-2xl font-black text-emerald-400">{users.filter((u) => u.active !== false).length}</p>
        </Card>
      </div>

      <div className="space-y-3">
        {users.length === 0 ? (
          <Card className="p-10 text-center">
            <UserCog size={40} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm">No team accounts yet.</p>
            <Btn className="mt-4 mx-auto" onClick={openAdd} disabled={!canEdit}><UserPlus size={14} />Add first user</Btn>
          </Card>
        ) : users.map((user) => (
          <Card key={user.id} className={`p-4 ${user.active === false ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${user.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}`}>
                  {userInitial(user.name)}
                </div>
                <div>
                  <p className="text-white font-bold flex items-center gap-2">
                    {user.name}
                    {sameUserId(user.id, currentUser.id) && <Badge className="bg-cyan-500/20 text-cyan-300">You</Badge>}
                    {user.active === false && <Badge className="bg-red-500/20 text-red-300">Inactive</Badge>}
                  </p>
                  <p className="text-slate-500 text-xs flex items-center gap-2 mt-0.5">
                    <Badge className={user.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}>{user.role}</Badge>
                    <span className="flex items-center gap-1"><Lock size={10} />PIN: ••••</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {canEdit && <Btn variant="ghost" size="sm" onClick={() => openEdit(user)}><Edit2 size={12} />Edit</Btn>}
                {canEdit && (
                  <Btn variant={user.active === false ? "success" : "secondary"} size="sm" disabled={!!togglingUserId} onClick={() => toggleActive(user)}>
                    {togglingUserId === user.id ? "Saving…" : user.active === false ? "Activate" : "Deactivate"}
                  </Btn>
                )}
                {!user.isSystem && canDelete && <Btn variant="danger" size="sm" onClick={() => requestDeleteUser(user)}><Trash2 size={12} /></Btn>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-700/50">
              {ALL_PERMISSIONS.map((p) => (
                <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${user.permissions?.includes(p.id) ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-700/50 text-slate-600 line-through"}`}>
                  {p.label}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditUser(null); }} title={editUser ? `Edit — ${editUser.name}` : "Add User"} size="lg">
        <div className="space-y-4">
          {editUser && sameUserId(editUser.id, currentUser.id) && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3 text-sm text-slate-300">
              To change <span className="text-white font-semibold">your own login PIN</span>, use{" "}
              <button type="button" onClick={() => { setShowAdd(false); setEditUser(null); onOpenChangePin?.(); }}
                className="text-cyan-400 font-bold hover:text-cyan-300 underline touch-manipulation">
                Change My PIN
              </button>{" "}
              (lock icon in sidebar) — it verifies your current PIN.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="sm:col-span-2" />
            <Select label="Role" value={form.role} onChange={handleRoleChange} options={[{ value: "owner", label: "Owner" }, { value: "staff", label: "Staff" }]} />
            <div>
              <Input
                label={editUser ? "New PIN (optional)" : "PIN (4 digits)"}
                type="password"
                inputMode="numeric"
                value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                placeholder={editUser ? "Leave blank to keep current PIN" : "e.g. 1234"}
                required={!editUser}
              />
              {editUser && (
                <p className="text-xs text-slate-500 mt-1">
                  {cloudMode ? "PIN is hidden for security. Enter a new PIN only to reset this user's login." : "Leave blank to keep the current PIN."}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Module Permissions</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_PERMISSIONS.map((p) => (
                <button key={p.id} type="button" onClick={() => togglePermission(p.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-all ${form.permissions.includes(p.id) ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                  {form.permissions.includes(p.id) ? <Check size={10} className="inline mr-1" /> : null}{p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Role change applies default permissions — customize as needed.</p>
          </div>
        </div>
        <div className="modal-actions">
          <Btn variant="secondary" onClick={() => { setShowAdd(false); setEditUser(null); }}>Cancel</Btn>
          <Btn onClick={saveUser} disabled={saving || !canEdit}><Check size={14} />{saving ? "Saving..." : editUser ? "Save Changes" : "Add User"}</Btn>
        </div>
      </Modal>

      <Modal
        open={!!deleteConfirm}
        onClose={() => { if (!deletingUser) setDeleteConfirm(null); }}
        title="Remove User"
        size="sm"
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={26} className="text-red-400" />
              </div>
            </div>
            <p className="text-slate-300 text-sm text-center">
              Remove <strong className="text-white">{deleteConfirm.name}</strong> permanently? Their login sessions will be revoked.
            </p>
            {deleteConfirm.role === "owner" && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                This user is an owner. Ensure another active owner remains before removing them.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Btn variant="danger" onClick={confirmDeleteUser} disabled={deletingUser} className="w-full justify-center">
                <Trash2 size={14} />{deletingUser ? 'Removing…' : 'Remove User'}
              </Btn>
              <Btn variant="secondary" onClick={() => { if (!deletingUser) setDeleteConfirm(null); }} disabled={deletingUser} className="w-full justify-center">Cancel</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// INVENTORY / PRODUCTS MODULE
// ─────────────────────────────────────────────
const EMPTY_PRODUCT_FORM = { name: "", category: "Fish Food", sku: "", barcode: "", price: "", unit: "kg", stock: "", minStock: "", description: "", trackStock: true };

function InventoryModule({ products, setProducts, stockLog, setStockLog, addNotification, currentUser, onProductsSaved, onInventorySaved, onAdjustStockCloud }) {
  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);
  const [tab, setTab] = useState("stock");
  const [showAdd, setShowAdd] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const addingProductRef = useRef(false);
  const [editProduct, setEditProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const savingProductRef = useRef(false);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const deletingProductRef = useRef(false);
  const [showUse, setShowUse] = useState(null);
  const [showRestock, setShowRestock] = useState(null);
  const [showAdjust, setShowAdjust] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [restockQty, setRestockQty] = useState(1);
  const [restockNote, setRestockNote] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [useQty, setUseQty] = useState(1);
  const [useNote, setUseNote] = useState("");
  const [usingStock, setUsingStock] = useState(false);
  const usingStockRef = useRef(false);
  const [restocking, setRestocking] = useState(false);
  const restockingRef = useRef(false);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const adjustingStockRef = useRef(false);
  const [showOlderStockLog, setShowOlderStockLog] = useState(false);
  const [form, setForm] = useState(EMPTY_PRODUCT_FORM);
  const [formScanTarget, setFormScanTarget] = useState(null); // "add" | "edit" | null
  const [lookupScanOpen, setLookupScanOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scanMatch, setScanMatch] = useState(null);
  const lastScanRef = useRef({ code: "", at: 0 });
  const scanFeedbackTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(scanFeedbackTimerRef.current), []);

  const visibleStockLog = useMemo(
    () => sortStockLog(stockLog.filter((l) => showOlderStockLog || isAppVisibleStockLog(l))),
    [stockLog, showOlderStockLog],
  );
  const hiddenStockLogCount = stockLog.filter((l) => !isAppVisibleStockLog(l)).length;

  const stockItems = useMemo(() => stockProducts(products), [products]);

  const searchLower = search.toLowerCase();
  const filtered = stockItems.filter((p) =>
    (catFilter === "All" || p.category === catFilter) &&
    (
      (p.name || "").toLowerCase().includes(searchLower)
      || (p.sku || "").toLowerCase().includes(searchLower)
      || (p.description || "").toLowerCase().includes(searchLower)
    )
  );
  const productPage = usePagination(filtered, LIST_PAGE_SIZE, `${tab}-${search}-${catFilter}`);
  const stockLogPage = usePagination(visibleStockLog, LIST_PAGE_SIZE, String(showOlderStockLog));

  const openUseFor = (p) => { setShowUse(p); setUseQty(1); setUseNote(""); };
  const openRestockFor = (p) => { setShowRestock(p); setRestockQty(1); setRestockNote(""); };

  const handleFormScanDetect = (code) => {
    if (formScanTarget === "edit") {
      setEditProduct((p) => (p ? { ...p, barcode: code } : p));
    } else {
      setForm((f) => ({ ...f, barcode: code }));
    }
    setFormScanTarget(null);
  };

  const handleLookupScanDetect = (code, { manual = false } = {}) => {
    const now = Date.now();
    if (!manual && lastScanRef.current.code === code && now - lastScanRef.current.at < 2000) return;
    lastScanRef.current = { code, at: now };
    clearTimeout(scanFeedbackTimerRef.current);

    const match = findProductByBarcode(stockItems, code);
    if (match) {
      setLookupScanOpen(false);
      setScanMatch(match);
    } else {
      setScanFeedback({ tone: "error", message: `No product matches "${code}"` });
      scanFeedbackTimerRef.current = setTimeout(() => setScanFeedback(null), 2600);
    }
  };

  const persistInventory = async (nextProducts, nextStockLog) => {
    if (!onInventorySaved) {
      setProducts(nextProducts);
      setStockLog(nextStockLog);
      return true;
    }
    try {
      await writeInventoryCloudFirst({
        nextProducts,
        nextStockLog,
        setProducts,
        setStockLog,
        flush: onInventorySaved,
      });
      return true;
    } catch (err) {
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || "Could not save inventory to cloud.",
      });
      return false;
    }
  };

  const addProduct = async () => {
    if (addingProductRef.current || addingProduct) return;
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const check = validateProductFields(form);
    if (!check.ok) {
      addNotification({ type: "error", title: "Invalid Product", message: check.message });
      return;
    }

    addingProductRef.current = true;
    setAddingProduct(true);
    try {
      const normalized = normalizeProductRecord(form);
      const p = touchUpdatedAt({ ...form, ...normalized, id: genStockLogId() });
      const productsSnapshot = products;
      const stockSnapshot = stockLog;
      const nextProducts = [...productsSnapshot, p];
      let nextStockLog = stockSnapshot;
      if (p.stock > 0) {
        nextStockLog = [
          buildStockLogEntry(p, "restock", {
            qty: p.stock,
            note: "Opening stock",
            by: currentUser?.name || "Staff",
          }),
          ...stockSnapshot,
        ];
      }
      if (!(await persistInventory(nextProducts, nextStockLog))) return;
      addNotification({
        type: "success",
        title: "Product Added",
        message: `${p.name} added to inventory`,
      });
      setShowAdd(false);
      setForm(EMPTY_PRODUCT_FORM);
    } finally {
      addingProductRef.current = false;
      setAddingProduct(false);
    }
  };

  const openAddProduct = () => {
    setForm(EMPTY_PRODUCT_FORM);
    setShowAdd(true);
  };

  const saveEditProduct = async () => {
    if (!editProduct || savingProductRef.current || savingProduct) return;
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const current = products.find((p) => sameProductId(p.id, editProduct.id));
    const check = validateProductFields(editProduct);
    if (!check.ok) {
      addNotification({ type: "error", title: "Invalid Product", message: check.message });
      return;
    }
    savingProductRef.current = true;
    setSavingProduct(true);
    const normalized = normalizeProductRecord(editProduct);
    const base = current
      ? { ...current, ...normalized, id: current.id }
      : { ...editProduct, ...normalized };
    const updated = touchUpdatedAt(base);
    const prevName = current?.name;
    const productsSnapshot = products;
    const stockSnapshot = stockLog;
    const nextProducts = productsSnapshot.map((p) => (sameProductId(p.id, updated.id) ? updated : p));
    let nextStockLog = stockSnapshot;
    if (prevName && prevName !== updated.name) {
      nextStockLog = stockSnapshot.map((l) => (
        sameProductId(l.productId, updated.id) ? { ...l, productName: updated.name } : l
      ));
    }
    try {
      if (onInventorySaved) {
        await writeInventoryCloudFirst({
          nextProducts,
          nextStockLog,
          setProducts,
          setStockLog,
          flush: onInventorySaved,
        });
      } else {
        await writeCloudFirst({
          next: nextProducts,
          setState: setProducts,
          flush: (n) => onProductsSaved?.(n),
        });
        if (prevName && prevName !== updated.name) setStockLog(nextStockLog);
      }
    } catch (err) {
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || "Could not save product to cloud.",
      });
      return;
    } finally {
      savingProductRef.current = false;
      setSavingProduct(false);
    }
    addNotification({ type: "success", title: "Product Updated", message: `${updated.name} saved` });
    setEditProduct(null);
  };

  const confirmDeleteProduct = async () => {
    if (!deleteProduct || deletingProductRef.current) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const snapshot = products;
    const id = deleteProduct.id;
    const name = deleteProduct.name;
    const nextProducts = snapshot.filter((p) => !sameProductId(p.id, id));
    deletingProductRef.current = true;
    setDeletingProduct(true);
    try {
      await writeCloudFirst({
        next: nextProducts,
        setState: setProducts,
        flush: (n) => onProductsSaved?.(n),
        deleteMeta: { entity: "products", id },
      });
      addNotification({ type: "info", title: "Product Deleted", message: `${name} removed from inventory` });
      setDeleteProduct(null);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Delete Failed",
        message: err?.message || "Could not remove product. Try again.",
      });
    } finally {
      deletingProductRef.current = false;
      setDeletingProduct(false);
    }
  };

  const confirmUseStock = async (product) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (!product || usingStockRef.current || usingStock) return;
    const qty = parseStockQty(useQty);
    const available = Number(product.stock) || 0;
    if (qty <= 0) {
      addNotification({ type: "error", title: "Invalid Quantity", message: "Enter a quantity of at least 1." });
      return;
    }
    if (qty > available) {
      addNotification({
        type: "error",
        title: "Insufficient Stock",
        message: `Only ${available} ${product.unit || "unit"} of ${product.name} available.`,
      });
      return;
    }

    usingStockRef.current = true;
    setUsingStock(true);
    try {
      if (onAdjustStockCloud) {
        let response;
        try {
          response = await onAdjustStockCloud({
            productId: product.id,
            delta: -qty,
            note: useNote || "Manual use",
          });
        } catch (err) {
          addNotification({
            type: "error",
            title: "Use Failed",
            message: err?.message || "Could not save stock use to cloud.",
          });
          return;
        }
        const remaining = Number(response?.product?.stock) || 0;
        if (product.minStock > 0 && remaining <= product.minStock) {
          addNotification({
            type: "warning",
            title: "Low Stock",
            message: `${product.name} stock is low (${remaining} ${product.unit} remaining)`,
          });
        } else {
          addNotification({ type: "success", title: "Stock Used", message: `Used ${qty} ${product.unit || "unit"} of ${product.name}` });
        }
        setShowUse(null);
        setUseQty(1);
        setUseNote("");
        return;
      }

      const productsSnapshot = products;
      const stockSnapshot = stockLog;
      const adjusted = adjustProductStockInList(productsSnapshot, product.id, -qty);
      if (!adjusted.ok) {
        addNotification({
          type: "error",
          title: "Insufficient Stock",
          message: adjusted.message,
        });
        return;
      }
      const nextProducts = adjusted.products;
      const nextStockLog = [
        buildStockLogEntry(product, "use", { qty, note: useNote, by: currentUser?.name || "Staff" }),
        ...stockSnapshot,
      ];
      if (!(await persistInventory(nextProducts, nextStockLog))) return;
      const remaining = available - qty;
      if (product.minStock > 0 && remaining <= product.minStock) {
        addNotification({
          type: "warning",
          title: "Low Stock",
          message: `${product.name} stock is low (${remaining} ${product.unit} remaining)`,
        });
      } else {
        addNotification({ type: "success", title: "Stock Used", message: `Used ${qty} ${product.unit || "unit"} of ${product.name}` });
      }
      setShowUse(null);
      setUseQty(1);
      setUseNote("");
    } finally {
      usingStockRef.current = false;
      setUsingStock(false);
    }
  };

  const restock = async (product, qty, note) => {
    const amount = parseStockQty(qty);
    if (amount <= 0) {
      addNotification({ type: "error", title: "Invalid Quantity", message: "Enter a quantity of at least 1." });
      return false;
    }
    if (onAdjustStockCloud) {
      try {
        await onAdjustStockCloud({
          productId: product.id,
          delta: amount,
          note: formatRestockLogNote(note),
        });
      } catch (err) {
        addNotification({
          type: "error",
          title: "Restock Failed",
          message: err?.message || "Could not save restock to cloud.",
        });
        return false;
      }
      addNotification({
        type: "info",
        title: "Restocked",
        message: `${product.name} restocked by ${amount} ${product.unit}`,
      });
      return true;
    }

    const productsSnapshot = products;
    const stockSnapshot = stockLog;
    const adjusted = adjustProductStockInList(productsSnapshot, product.id, amount);
    if (!adjusted.ok) {
      addNotification({ type: "error", title: "Restock Failed", message: adjusted.message });
      return false;
    }
    const nextProducts = adjusted.products;
    const logNote = formatRestockLogNote(note);
    const nextStockLog = [
      buildStockLogEntry(product, "restock", {
        qty: amount,
        note: logNote,
        by: currentUser?.name || "Staff",
      }),
      ...stockSnapshot,
    ];
    if (!(await persistInventory(nextProducts, nextStockLog))) return false;
    addNotification({
      type: "info",
      title: "Restocked",
      message: `${product.name} restocked by ${amount} ${product.unit}${logNote !== "Manual restock" ? ` (${logNote})` : ""}`,
    });
    return true;
  };

  const confirmRestock = async (product) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (!product || restockingRef.current || restocking) return;
    const q = parseStockQty(restockQty);
    if (q <= 0) {
      addNotification({ type: "error", title: "Invalid Quantity", message: "Enter a quantity of at least 1." });
      return;
    }

    restockingRef.current = true;
    setRestocking(true);
    try {
      const ok = await restock(product, q, restockNote);
      if (!ok) return;
      setShowRestock(null);
      setRestockQty(1);
      setRestockNote("");
    } finally {
      restockingRef.current = false;
      setRestocking(false);
    }
  };

  const openAdjustStock = (product) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (!product || product.trackStock === false) return;
    setShowAdjust(product);
    setAdjustQty("");
    setAdjustReason("");
  };

  const confirmAdjustStock = async () => {
    if (!showAdjust || adjustingStockRef.current || adjustingStock) return;
    const delta = Number(adjustQty);
    if (!Number.isFinite(delta) || delta === 0) {
      addNotification({ type: "error", title: "Invalid Adjustment", message: "Enter a positive or negative quantity (not zero)." });
      return;
    }
    const reason = String(adjustReason || "").trim();
    if (!reason) {
      addNotification({ type: "error", title: "Reason Required", message: "Enter a reason for this stock adjustment." });
      return;
    }

    adjustingStockRef.current = true;
    setAdjustingStock(true);
    try {
      if (onAdjustStockCloud) {
        let response;
        try {
          response = await onAdjustStockCloud({
            productId: showAdjust.id,
            delta,
            note: `Manual adjust: ${reason}`,
          });
        } catch (err) {
          addNotification({
            type: "error",
            title: "Adjust Failed",
            message: err?.message || "Could not save stock adjustment to cloud.",
          });
          return;
        }
        setEditProduct((prev) => (prev && sameProductId(prev.id, showAdjust.id)
          ? { ...prev, stock: Number(response?.product?.stock) || Number(prev.stock) }
          : prev));
        addNotification({
          type: "info",
          title: "Stock Adjusted",
          message: `${showAdjust.name}: ${delta > 0 ? "+" : ""}${delta} ${showAdjust.unit || "unit"} (${reason})`,
        });
        setShowAdjust(null);
        setAdjustQty("");
        setAdjustReason("");
        return;
      }

      const productsSnapshot = products;
      const stockSnapshot = stockLog;
      const adjusted = adjustProductStockInList(productsSnapshot, showAdjust.id, delta);
      if (!adjusted.ok) {
        addNotification({ type: "error", title: "Adjust Failed", message: adjusted.message });
        return;
      }

      const qty = Math.abs(delta);
      const type = delta > 0 ? "restock" : "use";
      const note = `Manual adjust: ${reason}`;
      const nextStockLog = [
        buildStockLogEntry(showAdjust, type, { qty, note, by: currentUser?.name || "Staff" }),
        ...stockSnapshot,
      ];
      if (!(await persistInventory(adjusted.products, nextStockLog))) return;

      const updated = adjusted.products.find((p) => sameProductId(p.id, showAdjust.id));
      if (updated) {
        setEditProduct((prev) => (prev && sameProductId(prev.id, updated.id) ? { ...prev, stock: updated.stock } : prev));
      }
      addNotification({
        type: "info",
        title: "Stock Adjusted",
        message: `${showAdjust.name}: ${delta > 0 ? "+" : ""}${delta} ${showAdjust.unit || "unit"} (${reason})`,
      });
      setShowAdjust(null);
      setAdjustQty("");
      setAdjustReason("");
    } finally {
      adjustingStockRef.current = false;
      setAdjustingStock(false);
    }
  };

  const totalStockValue = stockItems.reduce((s, p) => s + p.stock * p.price, 0);
  const lowStockItems = stockItems.filter((p) => p.minStock > 0 && p.stock <= p.minStock);

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white">Inventory</h2>
        <p className="text-slate-400 text-sm">Stock tracking & invoice price list</p>
      </div>
      <Fab onClick={openAddProduct} label="Add Product" hidden={!canEdit || showAdd || !!editProduct || !!deleteProduct || !!showUse || !!showRestock || !!showAdjust} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Stock Products", value: stockItems.length, icon: Boxes, color: "text-cyan-400" },
          { label: "Low Stock Items", value: lowStockItems.length, icon: AlertTriangle, color: lowStockItems.length > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Stock Value (Selling)", value: formatSGD(totalStockValue), icon: TrendingUp, color: "text-emerald-400" },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <s.icon size={20} className={`${s.color} mb-2`} />
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-xs">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-700 pb-0">
        {[
          { id: "stock", label: "📦 Stock" },
          { id: "log", label: "📜 Activity Log" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${tab === t.id ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-3 sm:py-2 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            </div>
            <button
                type="button"
                onClick={() => { clearTimeout(scanFeedbackTimerRef.current); setScanFeedback(null); setLookupScanOpen(true); }}
                aria-label="Scan a product barcode"
                className="flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-lg bg-slate-800 border border-slate-700 text-cyan-400 text-sm font-bold hover:bg-slate-700 hover:border-cyan-500/40 active:bg-slate-700 touch-manipulation shrink-0"
              >
                <ScanBarcode size={16} />
                <span>Scan</span>
              </button>
            <div className="flex gap-2 flex-wrap">
              {["All", ...PRODUCT_CATEGORIES].map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${catFilter === c ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <Card className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  emoji="📦"
                  title={stockItems.length === 0 ? "No products yet" : "No products match your filters"}
                  hint={stockItems.length === 0 ? "Tap Add Product to get started" : "Try a different search or category"}
                  actionLabel={stockItems.length === 0 && canEdit ? "Add Product" : undefined}
                  onAction={stockItems.length === 0 && canEdit ? openAddProduct : undefined}
                />
              </Card>
            ) : productPage.paginatedItems.map((p) => {
              const isLow = p.minStock > 0 && p.stock <= p.minStock;
              return (
                <Card key={p.id} className={`p-4 ${isLow ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm">{p.name}</p>
                      <p className="text-slate-500 text-xs">{p.sku || "—"} · {p.category || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isLow && <Badge className="bg-amber-500/20 text-amber-300">Low Stock</Badge>}
                      {canEdit && <Btn variant="ghost" size="sm" onClick={() => setEditProduct({ ...p })} title="Edit"><Edit2 size={12} /></Btn>}
                      {canDelete && <Btn variant="danger" size="sm" onClick={() => setDeleteProduct(p)} title="Delete"><Trash2 size={12} /></Btn>}
                    </div>
                  </div>
                  <div className="grid gap-2 mb-4 text-center grid-cols-2">
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className={`text-lg font-black ${isLow ? "text-amber-400" : "text-white"}`}>{p.stock}</p>
                      <p className="text-slate-500 text-xs">In stock ({p.unit})</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className="text-lg font-black text-cyan-400">{formatSGD(p.price)}</p>
                      <p className="text-slate-500 text-xs">Selling price</p>
                    </div>
                  </div>
                  {p.minStock > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Stock Level</span><span>Min: {p.minStock}</span></div>
                      <div className="h-1.5 bg-slate-700 rounded-full"><div className={`h-full rounded-full ${isLow ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min((p.stock / (p.minStock * 3)) * 100, 100)}%` }} /></div>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Btn variant="secondary" size="sm" onClick={() => { setShowUse(p); setUseQty(1); setUseNote(""); }} disabled={!canEdit}><Archive size={12} />Use</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => { setShowRestock(p); setRestockQty(1); setRestockNote(""); }} disabled={!canEdit}><Plus size={12} />Restock</Btn>
                  </div>
                </Card>
              );
            })}
          </div>
          <PaginationControls {...productPage} />
        </>
      )}

      {tab === "log" && (
        <Card className="overflow-hidden">
          {hiddenStockLogCount > 0 && (
            <div className="px-3 pt-3">
              <button
                type="button"
                onClick={() => setShowOlderStockLog((v) => !v)}
                className="text-xs text-slate-500 hover:text-cyan-400 touch-manipulation"
              >
                {showOlderStockLog ? "Hide older activity" : `Show ${hiddenStockLogCount} older entr${hiddenStockLogCount === 1 ? "y" : "ies"} (2+ years)`}
              </button>
            </div>
          )}
          <div className="md:hidden space-y-2 p-3">
            {visibleStockLog.length === 0 ? (
              <EmptyState emoji="📦" title="No stock activity yet" hint="Use or restock products to see entries here" className="py-10" />
            ) : stockLogPage.paginatedItems.map((l) => (
              <div key={l.id} className="bg-slate-800 rounded-lg p-3 mb-2 border border-slate-700">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-white truncate">{l.productName}</span>
                  <Badge className={l.type === "sell" ? "bg-emerald-500/20 text-emerald-300" : l.type === "use" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}>{l.type}</Badge>
                </div>
                <div className="text-slate-400 text-sm mt-1 flex justify-between">
                  <span>{l.date}</span>
                  <span className="text-white font-bold">×{l.qty}</span>
                </div>
                {l.note && <p className="text-slate-500 text-xs mt-1">{l.note}</p>}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="bg-slate-700/30 text-slate-400 text-xs">
              <th className="text-left p-3">Date</th><th className="text-left p-3">Product</th><th className="text-left p-3">Type</th>
              <th className="text-right p-3">Qty</th><th className="text-right p-3">Value</th><th className="text-left p-3">Note</th><th className="text-left p-3">By</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {visibleStockLog.length === 0 ? (
                <tr><td colSpan={7} className="p-0"><EmptyState emoji="📦" title="No stock activity yet" hint="Use or restock products to see entries here" className="py-10" /></td></tr>
              ) : stockLogPage.paginatedItems.map(l => (
                <tr key={l.id} className="text-slate-300 hover:bg-slate-700/20">
                  <td className="p-3 text-slate-500 text-xs">{l.date}</td>
                  <td className="p-3 font-medium">{l.productName}</td>
                  <td className="p-3"><Badge className={l.type === "sell" ? "bg-emerald-500/20 text-emerald-300" : l.type === "use" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}>{l.type}</Badge></td>
                  <td className="p-3 text-right font-bold">{l.qty}</td>
                  <td className="p-3 text-right text-emerald-400">{l.total ? formatSGD(l.total) : "-"}</td>
                  <td className="p-3 text-slate-500 text-xs max-w-[10rem] truncate" title={l.note || ""}>{l.note || "—"}</td>
                  <td className="p-3 text-slate-400 text-xs">{l.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <PaginationControls {...stockLogPage} className="px-3 pb-3" />
        </Card>
      )}

      {/* Add Product Modal */}
      <Modal open={showAdd} onClose={() => { if (!addingProduct) setShowAdd(false); }} title="Add New Product" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Product Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="sm:col-span-2" />
          <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={PRODUCT_CATEGORIES} />
          <Input label="SKU" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="FF001" />
          <BarcodeInputField value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} onScan={() => setFormScanTarget("add")} />
          <Input label="Selling Price (S$)" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step="0.01" required />
          <Input label="Current Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
          <Input label="Min Stock Alert" type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
          <Input label="Unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="bag / bottle / pcs" />
          <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sm:col-span-2" />
        </div>
        <div className="modal-actions">
          <Btn variant="secondary" onClick={() => { if (!addingProduct) setShowAdd(false); }} disabled={addingProduct}>Cancel</Btn>
          <Btn onClick={addProduct} disabled={addingProduct}>
            {addingProduct
              ? <><Loader2 size={14} className="animate-spin" />Saving...</>
              : <><Plus size={14} />Add Product</>}
          </Btn>
        </div>
      </Modal>

      {/* Edit Product Modal */}
      <Modal open={!!editProduct} onClose={() => { if (!savingProduct) setEditProduct(null); }} title="Edit Product" size="lg">
        {editProduct && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Product Name" value={editProduct.name} onChange={e => setEditProduct(p => ({ ...p, name: e.target.value }))} required className="sm:col-span-2" />
              <Select label="Category" value={editProduct.category} onChange={e => setEditProduct(p => ({ ...p, category: e.target.value }))} options={PRODUCT_CATEGORIES} />
              <Input label="SKU" value={editProduct.sku} onChange={e => setEditProduct(p => ({ ...p, sku: e.target.value }))} placeholder="FF001" />
              <BarcodeInputField value={editProduct.barcode || ""} onChange={e => setEditProduct(p => ({ ...p, barcode: e.target.value }))} onScan={() => setFormScanTarget("edit")} />
              <Input label="Selling Price (S$)" type="number" value={editProduct.price} onChange={e => setEditProduct(p => ({ ...p, price: e.target.value }))} step="0.01" required />
              <div className="sm:col-span-2">
                <Input label="Current Stock" type="number" value={editProduct.stock} readOnly className="pointer-events-none opacity-80" />
                <p className="text-[11px] text-slate-500 mt-1">Stock is read-only here. Use Adjust Stock to keep history in activity log.</p>
                <div className="mt-2">
                  <Btn type="button" variant="ghost" size="sm" onClick={() => openAdjustStock(editProduct)} disabled={savingProduct || !canEdit}>
                    <Plus size={12} />Adjust Stock
                  </Btn>
                  {!canEdit && <p className="text-[11px] text-amber-400 mt-1">Edit permission is required to adjust stock.</p>}
                </div>
              </div>
              <Input label="Min Stock Alert" type="number" value={editProduct.minStock} onChange={e => setEditProduct(p => ({ ...p, minStock: e.target.value }))} />
              <Input label="Unit" value={editProduct.unit} onChange={e => setEditProduct(p => ({ ...p, unit: e.target.value }))} placeholder="bag / bottle / pcs" />
              <Textarea label="Description" value={editProduct.description} onChange={e => setEditProduct(p => ({ ...p, description: e.target.value }))} className="sm:col-span-2" />
            </div>
            <div className="modal-actions">
              <Btn variant="secondary" onClick={() => { if (!savingProduct) setEditProduct(null); }} disabled={savingProduct}>Cancel</Btn>
              <Btn onClick={saveEditProduct} disabled={savingProduct}>
                {savingProduct ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Check size={14} />Save Changes</>}
              </Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal
        open={!!showAdjust}
        onClose={() => { if (!adjustingStock) setShowAdjust(null); }}
        title={`Adjust Stock: ${showAdjust?.name}`}
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={() => { if (!adjustingStock) setShowAdjust(null); }} cancelDisabled={adjustingStock}>
            <Btn onClick={confirmAdjustStock} disabled={adjustingStock} className="w-full sm:w-auto justify-center">
              {adjustingStock ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Check size={14} />Apply Adjustment</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-400 text-sm mb-3">
          Current stock: <span className="text-white font-bold">{showAdjust?.stock} {showAdjust?.unit || "unit"}</span>
        </p>
        <Input
          label="Adjustment Quantity (+/-)"
          type="number"
          value={adjustQty}
          onChange={(e) => setAdjustQty(e.target.value)}
          step="1"
          placeholder="e.g. +5 or -3"
          className="mb-3"
        />
        <Textarea
          label="Reason (required)"
          value={adjustReason}
          onChange={(e) => setAdjustReason(e.target.value)}
          rows={2}
          placeholder="Damaged bags, stock recount, supplier correction..."
        />
      </Modal>

      {/* Delete Product Modal */}
      <Modal
        open={!!deleteProduct}
        onClose={() => { if (!deletingProduct) setDeleteProduct(null); }}
        title="Delete Product"
        size="sm"
      >
        {deleteProduct && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                <Trash2 size={26} className="text-red-400" />
              </div>
            </div>
            <p className="text-slate-300 text-sm text-center">
              Remove <strong className="text-white">{deleteProduct.name}</strong> from inventory?
              Activity log history for this product will be kept.
            </p>
            <div className="flex flex-col gap-2">
              <Btn variant="danger" onClick={confirmDeleteProduct} disabled={deletingProduct} className="w-full justify-center">
                <Trash2 size={14} />{deletingProduct ? 'Deleting…' : 'Delete Product'}
              </Btn>
              <Btn variant="secondary" onClick={() => { if (!deletingProduct) setDeleteProduct(null); }} disabled={deletingProduct} className="w-full justify-center">Cancel</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Barcode scan → found product → choose Use or Restock */}
      <Modal
        open={!!scanMatch}
        onClose={() => setScanMatch(null)}
        title="Barcode Matched"
        size="sm"
      >
        {scanMatch && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                <ScanBarcode size={18} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold truncate">{scanMatch.name}</p>
                <p className="text-slate-500 text-xs">In stock: {scanMatch.stock} {scanMatch.unit || "unit"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Btn
                variant="secondary"
                disabled={!canEdit}
                onClick={() => { openUseFor(scanMatch); setScanMatch(null); }}
                className="justify-center"
              >
                <Archive size={14} />Use
              </Btn>
              <Btn
                disabled={!canEdit}
                onClick={() => { openRestockFor(scanMatch); setScanMatch(null); }}
                className="justify-center"
              >
                <Plus size={14} />Restock
              </Btn>
            </div>
            {!canEdit && <p className="text-[11px] text-amber-400 text-center">Edit permission is required to use or restock.</p>}
          </div>
        )}
      </Modal>

      {lookupScanOpen && (
        <BarcodeScannerModal
          onClose={() => setLookupScanOpen(false)}
          onDetect={handleLookupScanDetect}
          title="Scan Product Barcode"
          hint="Point the camera at a product's barcode"
          feedback={scanFeedback}
        />
      )}

      {!!formScanTarget && (
        <BarcodeScannerModal
          onClose={() => setFormScanTarget(null)}
          onDetect={handleFormScanDetect}
          title="Scan Barcode"
          hint="Point the camera at the barcode to fill it in"
        />
      )}

      {/* Use Stock Modal */}
      <Modal
        open={!!showUse}
        onClose={() => { if (!usingStock) setShowUse(null); }}
        title={`Use: ${showUse?.name}`}
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={() => { if (!usingStock) setShowUse(null); }} cancelDisabled={usingStock}>
            <Btn
              onClick={() => confirmUseStock(showUse)}
              disabled={usingStock || parseStockQty(useQty) <= 0}
              className="w-full sm:w-auto justify-center"
            >
              <><Archive size={14} />{usingStock ? 'Saving…' : 'Confirm Use'}</>
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-400 text-sm mb-4">Available: <span className="text-white font-bold">{(products.find((p) => sameProductId(p.id, showUse?.id))?.stock ?? showUse?.stock)} {showUse?.unit}</span></p>
        <Input label="Quantity to Use" type="number" value={useQty} onChange={(e) => setUseQty(parseStockQty(e.target.value) || "")} min="1" className="mb-3" />
        <Textarea label="Note (optional)" value={useNote} onChange={e => setUseNote(e.target.value)} rows={2} />
      </Modal>

      {/* Restock Modal */}
      <Modal
        open={!!showRestock}
        onClose={() => { if (!restocking) { setShowRestock(null); setRestockNote(""); } }}
        title={`Restock: ${showRestock?.name}`}
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={() => { if (!restocking) { setShowRestock(null); setRestockNote(""); } }} cancelDisabled={restocking}>
            <Btn
              onClick={() => confirmRestock(showRestock)}
              disabled={restocking || parseStockQty(restockQty) <= 0}
              className="w-full sm:w-auto justify-center"
            >
              <><Plus size={14} />{restocking ? 'Saving…' : 'Confirm Restock'}</>
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-400 text-sm mb-4">Current stock: <span className="text-white font-bold">{(products.find((p) => sameProductId(p.id, showRestock?.id))?.stock ?? showRestock?.stock)} {showRestock?.unit}</span></p>
        <Input label="Quantity to Add" type="number" value={restockQty} onChange={(e) => setRestockQty(parseStockQty(e.target.value) || "")} min="1" className="mb-3" />
        <Input label="Invoice No. (optional)" value={restockNote} onChange={(e) => setRestockNote(e.target.value)} placeholder="INV20260615-01" />
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// CHANGE MY PIN
// ─────────────────────────────────────────────
function ChangePinModal({ open, onClose, currentUser, users, setUsers, addNotification }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    setError("");
    const check = validateChangePinForm({ currentPin, newPin, confirmPin });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        await auth.changeMyPin({
          currentPin: check.currentPin,
          newPin: check.newPin,
          confirmPin: check.newPin,
        });
      } else {
        const me = users.find((u) => sameUserId(u.id, currentUser.id));
        if (!me || me.pin !== check.currentPin) {
          setError("Current PIN is incorrect.");
          setSaving(false);
          return;
        }
        if (users.some((u) => u.pin === check.newPin && !sameUserId(u.id, currentUser.id))) {
          setError("This PIN is already assigned to another user.");
          setSaving(false);
          return;
        }
        setUsers((prev) => prev.map((u) => (sameUserId(u.id, currentUser.id) ? { ...u, pin: check.newPin } : u)));
      }
      addNotification({ type: "success", title: "PIN Updated", message: "Your login PIN has been changed successfully." });
      handleClose();
    } catch (err) {
      setError(err?.message || "Failed to change PIN.");
    }
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Change My PIN"
      size="sm"
      footer={(
        <ConfirmModalFooter onCancel={handleClose} cancelDisabled={saving}>
          <Btn onClick={handleSave} disabled={saving} className="w-full sm:w-auto justify-center"><Lock size={14} />{saving ? "Saving..." : "Update PIN"}</Btn>
        </ConfirmModalFooter>
      )}
    >
      <p className="text-slate-400 text-sm mb-4">
        Update your login PIN for <span className="text-white font-semibold">{currentUser.name}</span>.
        {currentUser.role === "owner" && " As admin, keep your PIN private and unique."}
      </p>
      <div className="space-y-4">
        <Input label="Current PIN" type="password" inputMode="numeric" value={currentPin}
          onChange={e => setCurrentPin(sanitizePinInput(e.target.value))} placeholder="••••" required />
        <Input label="New PIN (4–6 digits)" type="password" inputMode="numeric" value={newPin}
          onChange={e => setNewPin(sanitizePinInput(e.target.value))} placeholder="••••" required />
        <Input label="Confirm New PIN" type="password" inputMode="numeric" value={confirmPin}
          onChange={e => setConfirmPin(sanitizePinInput(e.target.value))} placeholder="••••" required />
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={14} />{error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
const ALL_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "ponds", label: "Pond Calc", icon: Droplets },
  { id: "users", label: "Team", icon: UserCog },
];

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center p-8 safe-top safe-bottom">
      <AppLogo size="lg" className="ring-2 ring-slate-700 shadow-2xl shadow-black/40 mb-6" />
      <Loader2 size={32} className="text-cyan-400 animate-spin mb-4" aria-hidden />
      <p className="text-slate-400 text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState(() => {
    const session = auth.getSession();
    return session?.user ? auth.toAppUser(session.user) : null;
  });
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && ALL_NAV_ITEMS.some((item) => item.id === tab)) return tab;
    return "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dataReady, setDataReady] = useState(!isSupabaseConfigured);
  const [cloudHydrated, setCloudHydrated] = useState(!isSupabaseConfigured);
  const [cloudSync, setCloudSync] = useState(isSupabaseConfigured);
  const [cloudError, setCloudError] = useState(null);
  const [cloudRetrying, setCloudRetrying] = useState(false);
  const [cloudPulling, setCloudPulling] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheCachedAt, setCacheCachedAt] = useState(null);
  const [syncFailCount, setSyncFailCount] = useState(0);
  const syncFailCountRef = useRef(0);
  const lowStockNotified = useRef(false);
  const lastSyncWarnRef = useRef(0);
  const syncWarnQueueRef = useRef([]);
  const syncWarnFlushTimerRef = useRef(null);
  const lastCloudPullAt = useRef(0);
  const lastUserActivityAt = useRef(0);
  const syncTimersRef = useRef({});
  const syncInFlightRef = useRef(0);
  const explicitFlushAtRef = useRef({ expenses: 0, invoices: 0, calendar: 0, customerkoi: 0, koifish: 0 });
  const syncStateRef = useRef({});
  const inventorySyncPendingRef = useRef(false);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [users, setUsers] = useState(isSupabaseConfigured ? [] : LOCAL_DEMO_USERS);
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [products, setProducts] = useState(() => (isSupabaseConfigured ? INITIAL_PRODUCTS : loadProducts()));
  const [deliveries, setDeliveries] = useState(INITIAL_DELIVERIES);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const setEventsWithRef = useCallback((updater) => {
    setEvents((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncStateRef.current = { ...syncStateRef.current, events: next };
      return next;
    });
  }, []);
  const [stockLog, setStockLog] = useState(() => (isSupabaseConfigured ? [] : loadStockLog()));
  const [koiFishList, setKoiFishList] = useState(() => (isSupabaseConfigured ? [] : loadKoiFish()));
  const [customerKoiList, setCustomerKoiList] = useState(() => (isSupabaseConfigured ? [] : loadCustomerKoi()));
  const [pondData, setPondData] = useState(() => loadPondData());
  const setPondDataWithRef = useCallback((updater) => {
    setPondData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncStateRef.current = { ...syncStateRef.current, pondData: next };
      return next;
    });
  }, []);
  const [whatsappGroups, setWhatsappGroups] = useState(() => (isSupabaseConfigured ? [] : loadWhatsappGroups()));
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showProminentToast = useCallback((n) => {
    const id = n.id || `prominent-${Date.now()}`;
    const toast = { ...buildToastNotification({ ...n, id }), prominent: true, id };
    const existingTimer = toastTimers.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    setToasts((prev) => [...prev.filter((t) => t.id !== id), toast].slice(-3));
    const duration = n.duration ?? 15000;
    if (duration > 0) {
      const timer = setTimeout(() => dismissToast(id), duration);
      toastTimers.current.set(id, timer);
    }
  }, [dismissToast]);

  const touchLastSync = useCallback(() => {
    setLastSyncAt(new Date());
  }, []);

  const warnCloudSaveFailed = useCallback((detail, { force = false } = {}) => {
    if (detail) syncWarnQueueRef.current.push(detail);

    const flush = (forced) => {
      syncWarnFlushTimerRef.current = null;
      const parts = [...new Set(syncWarnQueueRef.current)];
      syncWarnQueueRef.current = [];
      if (!parts.length) return;

      const now = Date.now();
      if (!forced && now - lastSyncWarnRef.current < 20000) return;
      lastSyncWarnRef.current = now;

      const moduleNames = parts.map((part) => {
        const match = String(part).match(/^([^:]+):/);
        return match ? match[1].trim() : part;
      });
      const uniqueModules = [...new Set(moduleNames)];
      const message = uniqueModules.length === 1 && parts.length === 1
        ? `Sync failed: ${parts[0]}. Do not refresh — use Retry save when back online.`
        : `Sync failed: ${uniqueModules.join(", ")}. Check internet connection, then use Retry save when back online.`;

      showProminentToast({
        id: "cloud-sync-warn",
        type: "error",
        title: "Not saved to cloud",
        message,
        duration: 20000,
      });
    };

    if (force) {
      if (syncWarnFlushTimerRef.current) {
        clearTimeout(syncWarnFlushTimerRef.current);
        syncWarnFlushTimerRef.current = null;
      }
      flush(true);
      return;
    }

    if (syncWarnFlushTimerRef.current) clearTimeout(syncWarnFlushTimerRef.current);
    syncWarnFlushTimerRef.current = setTimeout(() => flush(false), 400);
  }, [showProminentToast]);

  const teamPushUrl = useCallback((title) => {
    const t = String(title || "");
    if (/invoice|payment|receipt/i.test(t)) return "/?tab=invoices";
    if (/delivery/i.test(t)) return "/?tab=deliveries";
    if (/pond|treatment|reminder|maintenance/i.test(t)) return "/?tab=ponds";
    if (/koi|fish|sold|refund/i.test(t)) return "/?tab=koifish";
    if (/customer/i.test(t)) return "/?tab=customers";
    if (/expense/i.test(t)) return "/?tab=expenses";
    if (/stock|inventory|product|restock/i.test(t)) return "/?tab=inventory";
    if (/calendar|event/i.test(t)) return "/?tab=calendar";
    return "/?tab=dashboard";
  }, []);

  const addNotification = useCallback((n) => {
    if (isTeamNotification(n)) {
      const teamActor = n.actorRole === "system" ? n.actor || "System" : (n.actor || currentUser?.name || "Unknown");
      const teamRow = buildTeamNotification({ ...n, actor: teamActor }, currentUser);
      if (isTeamNotificationForUser(teamRow, {
        currentUserId: currentUser?.id,
        isOwner: currentUser?.role === "owner",
      })) {
        setNotifications((prev) => [teamRow, ...prev].slice(0, 30));
      }
      if (isSupabaseConfigured && auth.hasCloudSession() && n.title) {
        db.notifyTeamPush({
          title: n.title,
          message: n.message,
          actor: teamActor,
          actorRole: n.actorRole || currentUser?.role || "staff",
          type: n.type || "info",
          url: n.url || teamPushUrl(n.title),
          tag: `team-${String(n.title).replace(/\s+/g, "-").toLowerCase()}`,
          targetUserIds: n.targetUserIds,
        }).catch(() => {});
      }
      return;
    }
    const toast = buildToastNotification(n);
    setToasts((prev) => [...prev, toast].slice(-4));
    const timer = setTimeout(() => dismissToast(toast.id), 4500);
    toastTimers.current.set(toast.id, timer);
  }, [currentUser, dismissToast, teamPushUrl]);

  useEffect(() => {
    const list = isSupabaseConfigured
      ? koiFishList.map((k) => normalizeKoiFishForCache(k))
      : koiFishList
    saveKoiFish(list)
  }, [koiFishList]);
  useEffect(() => {
    const list = isSupabaseConfigured
      ? customerKoiList.map((r) => normalizeCustomerKoiForCache(r))
      : customerKoiList
    saveCustomerKoi(list)
  }, [customerKoiList]);
  useEffect(() => { savePondData(pondData) }, [pondData]);
  useEffect(() => { if (!isSupabaseConfigured) saveProducts(products) }, [products]);
  useEffect(() => { if (!isSupabaseConfigured) saveStockLog(stockLog) }, [stockLog]);

  const mergeCloudTeamNotifications = useCallback((remoteRows) => {
    if (!remoteRows?.length) return;
    setNotifications((prev) => {
      const { list, added, latest } = mergeIncomingTeamNotifications(prev, remoteRows, {
        currentUserId: currentUser?.id,
        isOwner: currentUser?.role === "owner",
      });
      if (added > 0 && typeof document !== "undefined" && document.visibilityState === "hidden" && latest) {
        db.notifySelfPush({
          title: latest.title,
          message: latest.message || latest.title,
          url: teamPushUrl(latest.title),
          tag: `team-cloud-${latest.cloudId}`,
        }).catch(() => {});
      }
      return list;
    });
  }, [currentUser, teamPushUrl]);

  const applyCloudData = useCallback((data, { mode = "replace" } = {}) => {
    if (!data) return;

    const koi = resolveCloudKoiPayload(data);
    const whatsapp = resolveCloudWhatsappGroups(data.whatsappGroups);
    const { data: cleaned, purged, stats } = applyCloudRetention({
      users: data.users,
      customers: data.customers || [],
      products: data.products || [],
      invoices: (data.invoices || []).map(db.sanitizeInvoiceForSync),
      expenses: data.expenses || [],
      deliveries: data.deliveries || [],
      events: data.events || [],
      stockLog: data.stockActivity || [],
      koiFishList: koi.koiFish,
      customerKoiList: koi.customerKoi,
      pondData: koi.pondData,
      whatsappGroups: whatsapp.groups,
    });

    const syncTombstones = data.syncTombstones || [];
    const localSnap = syncStateRef.current;
    const liveByEntity = mergeLiveByEntityWithLocal(cleaned, localSnap);
    applyServerTombstones(syncTombstones, liveByEntity);
    cleaned.invoices = stripTombstonedRows(cleaned.invoices, "invoices", syncTombstones, {
      remoteRows: cleaned.invoices,
    });
    cleaned.customers = stripTombstonedRows(cleaned.customers, "customers", syncTombstones);
    cleaned.products = stripTombstonedRows(cleaned.products, "products", syncTombstones);
    cleaned.expenses = stripTombstonedRows(cleaned.expenses, "expenses", syncTombstones);
    cleaned.deliveries = stripTombstonedRows(cleaned.deliveries, "deliveries", syncTombstones);
    cleaned.events = stripTombstonedRows(cleaned.events, "events", syncTombstones);
    cleaned.stockLog = stripTombstonedRows(cleaned.stockLog, "stock_activity", syncTombstones);
    cleaned.koiFishList = stripTombstonedRows(cleaned.koiFishList, "koi_fish", syncTombstones);
    cleaned.customerKoiList = stripTombstonedRows(cleaned.customerKoiList, "customer_koi", syncTombstones);
    cleaned.whatsappGroups = stripTombstonedRows(cleaned.whatsappGroups, "whatsapp_groups", syncTombstones);

    const merge = mode === "merge";
    const cloudUsers = cleaned.users || data.users || [];
    setUsers(cloudUsers);

    const me = currentUserRef.current;
    if (me) {
      const myRow = cloudUsers.find((u) => sameUserId(u.id, me.id));
      if (myRow) {
        if (myRow.active === false) {
          auth.clearSession();
          setCurrentUser(null);
        } else if (userProfileChanged(me, myRow)) {
          const normalized = normalizeUserRecord(myRow);
          setCurrentUser((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              name: normalized.name,
              role: normalized.role,
              permissions: normalized.permissions,
              active: normalized.active,
              displayName: normalized.role === "owner" ? `🐟 ${normalized.name}` : `👤 ${normalized.name}`,
            };
          });
          auth.patchSessionUser({
            name: normalized.name,
            role: normalized.role,
            permissions: normalized.permissions,
            active: normalized.active,
          });
        }
      }
    }

    if (merge) {
      setCustomers((prev) => mergeRecords(prev, cleaned.customers, peekDeletions("customers")));
      setProducts((prev) => mergeProducts(prev, cleaned.products, peekDeletions("products")));
      const localInvoices = localSnap.invoices ?? [];
      const mergedInvoices = applyInvoicePins(mergeInvoices(
        stripTombstonedRows(localInvoices, "invoices", syncTombstones, { remoteRows: cleaned.invoices }),
        cleaned.invoices,
        filterMergeDeletions(
          "invoices",
          syncTombstones,
          localInvoices,
          cleaned.invoices,
          peekDeletions("invoices"),
        ),
      ));
      setInvoices(mergedInvoices);
      setExpenses((prev) => mergeRecords(prev, cleaned.expenses, peekDeletions("expenses"), resolveExpenseConflict));
      setDeliveries((prev) => mergeRecords(prev, cleaned.deliveries, peekDeletions("deliveries")));
      const mergedPond = mergePondData(syncStateRef.current.pondData || loadPondData(), cleaned.pondData);
      const mergedEvents = mergeRecords(
        syncStateRef.current.events || [],
        cleaned.events,
        peekDeletions("events"),
        resolveEventConflict,
      );
      const mergeSyncUser = currentUserRef.current;
      if (mergeSyncUser && hasPermission(mergeSyncUser, "calendar") && hasPermission(mergeSyncUser, "ponds")) {
        const syncedOnMerge = syncPondCalendarAssignees(mergedEvents, mergedPond.reminders, {
          createdBy: mergeSyncUser.name || "Staff",
          pondsReady: true,
        });
        setPondDataWithRef(touchPondData({ ...mergedPond, reminders: syncedOnMerge.reminders }));
        setEventsWithRef(syncedOnMerge.events);
      } else {
        setPondDataWithRef(mergedPond);
        setEventsWithRef(mergedEvents);
      }
      setStockLog((prev) => mergeStockLog(prev, cleaned.stockLog, peekDeletions("stock_activity")));
      const remoteKoi = cleaned.koiFishList
      const localKoi = pruneLocalOnlyCloudRows(
        localSnap.koiFishList ?? [],
        "koi_fish",
        syncTombstones,
        remoteKoi,
        { inFlightAt: explicitFlushAtRef.current.koifish },
      )
      setKoiFishList(reconcileKoiSoldFromInvoices(
        mergeKoiFish(
          localKoi,
          stripTombstonedRows(remoteKoi, "koi_fish", syncTombstones, { remoteRows: remoteKoi }),
          filterMergeDeletions(
            "koi_fish",
            syncTombstones,
            localKoi,
            remoteKoi,
            peekDeletions("koi_fish"),
          ),
        ),
        mergedInvoices,
      ));
      setCustomerKoiList((prev) => mergeCustomerKoi(
        pruneLocalOnlyCloudRows(
          prev,
          "customer_koi",
          syncTombstones,
          cleaned.customerKoiList,
          { inFlightAt: explicitFlushAtRef.current.customerkoi },
        ),
        cleaned.customerKoiList,
        filterMergeDeletions(
          "customer_koi",
          syncTombstones,
          prev,
          cleaned.customerKoiList,
          peekDeletions("customer_koi"),
        ),
      ));
      setWhatsappGroups((prev) => mergeRecords(prev, cleaned.whatsappGroups || whatsapp.groups, peekDeletions("whatsapp_groups")));
    } else {
      setCustomers(cleaned.customers);
      setProducts(cleaned.products);
      const loadedInvoices = sortInvoices(applyInvoicePins(cleaned.invoices));
      setInvoices(loadedInvoices);
      setExpenses(cleaned.expenses);
      setDeliveries(cleaned.deliveries);
      const syncedOnLoad = syncPondCalendarAssignees(
        cleaned.events || [],
        cleaned.pondData?.reminders || [],
        {
          createdBy: currentUserRef.current?.name || "Staff",
          pondsReady: true,
        },
      );
      setPondDataWithRef(touchPondData({
        ...(cleaned.pondData || emptyPondData()),
        reminders: syncedOnLoad.reminders,
      }));
      setEventsWithRef(syncedOnLoad.events);
      setStockLog(sortStockLog(cleaned.stockLog));
      setKoiFishList(reconcileKoiSoldFromInvoices(cleaned.koiFishList, loadedInvoices));
      setCustomerKoiList(cleaned.customerKoiList);
      setWhatsappGroups(cleaned.whatsappGroups || whatsapp.groups);
    }

    if (koi.migratedFromLocal || whatsapp.migratedFromLocal) {
      clearLocalOnlyStorage();
      addNotification({
        type: "info",
        title: "Uploaded to Cloud",
        message: "Data from this device was saved to Supabase. You can now access it on any device after login.",
      });
    }

    if (purged) {
      const parts = Object.entries(stats).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`)
      addNotification({
        type: "info",
        title: "Data Retention",
        message: `Expired records cleaned from cloud: ${parts.join(", ")}.`,
        actor: "System",
        actorRole: "system",
      });
    }
    if (data.teamNotifications?.length) {
      mergeCloudTeamNotifications(data.teamNotifications);
    }

    setCloudHydrated(true);
    setIsFromCache(false);
    setCacheCachedAt(null);
    touchLastSync();
    if (isSupabaseConfigured) {
      cacheWriteAllData(data).catch(() => {});
    }
  }, [addNotification, touchLastSync, mergeCloudTeamNotifications, setEventsWithRef, setPondDataWithRef]);

  const resetCloudBusinessState = useCallback(() => {
    setCustomers(INITIAL_CUSTOMERS);
    setProducts(INITIAL_PRODUCTS);
    setInvoices(INITIAL_INVOICES);
    setExpenses(INITIAL_EXPENSES);
    setDeliveries(INITIAL_DELIVERIES);
    setEventsWithRef(INITIAL_EVENTS);
    setStockLog([]);
    setKoiFishList([]);
    setCustomerKoiList([]);
    setPondDataWithRef(emptyPondData());
    setWhatsappGroups([]);
    clearAllDeletions();
    setCloudHydrated(false);
  }, [setEventsWithRef, setPondDataWithRef]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    async function loadFromCloud() {
      try {
        const status = await auth.authStatus();
        if (status.needsSetup) {
          setNeedsSetup(true);
          setDataReady(true);
          return;
        }
        let sessionUser = auth.getSession()?.user;
        if (!sessionUser) {
          setCurrentUser(null);
          setCloudSync(true);
          setCloudError(null);
          setDataReady(true);
          return;
        }
        if (auth.sessionNeedsRefresh()) {
          const booted = await auth.bootstrapCloudSession();
          sessionUser = auth.getSession()?.user;
          if (!booted || !sessionUser) {
            auth.clearSession();
            setCurrentUser(null);
            setCloudSync(true);
            setCloudError(null);
            setDataReady(true);
            return;
          }
        }
        const data = await db.fetchAllData();
        applyCloudData(data);
        syncFailCountRef.current = 0;
        setSyncFailCount(0);
        setCloudSync(true);
        setCloudError(null);
        setCurrentUser(auth.toAppUser(sessionUser));
      } catch (err) {
        const cached = await cacheReadAllData();
        if (cached?.data) {
          applyCloudData(cached.data);
          setIsFromCache(true);
          setCacheCachedAt(cached.cachedAt);
          setCloudSync(getConnectionState().mode === 'cloud');
          setCloudError(err.message);
          logSyncEvent('load_from_cache', { reason: err.message });
        } else {
          setCloudSync(false);
          setCloudError(err.message);
        }
        if (auth.isSessionExpiredError(err.message)) {
          auth.clearSession();
          setCurrentUser(null);
          resetCloudBusinessState();
        }
      } finally {
        setDataReady(true);
      }
    }

    loadFromCloud();
  }, [applyCloudData, resetCloudBusinessState]);

  const resetSyncHealth = useCallback(() => {
    syncFailCountRef.current = 0;
    setSyncFailCount(0);
    setCloudSync(true);
    setCloudError(null);
    setIsFromCache(false);
    setCacheCachedAt(null);
  }, []);

  const handleSyncFailure = useCallback((err) => {
    const msg = err?.message || "Sync failed";
    logSyncEvent('sync_failed', { message: msg });

    if (auth.isSessionExpiredError(msg)) {
      syncFailCountRef.current = 0;
      setSyncFailCount(0);
      setCloudError(msg);
      setCloudSync(false);
      auth.clearSession();
      setCurrentUser(null);
      resetCloudBusinessState();
      warnCloudSaveFailed(msg, { force: true });
      return;
    }

    const conn = getConnectionState();
    const transient = isTransientSyncError(msg);
    const nextCount = syncFailCountRef.current + 1;
    syncFailCountRef.current = nextCount;
    setSyncFailCount(nextCount);
    setCloudError(msg);

    const enterLocalMode = !conn.isOnline
      || !conn.isApiReachable
      || !transient
      || nextCount >= 3;

    if (enterLocalMode) {
      setCloudSync(false);
      logSyncEvent('entered_local_mode', { message: msg, failCount: nextCount });
      warnCloudSaveFailed(msg, { force: nextCount >= 3 });
    } else {
      warnCloudSaveFailed(msg);
    }
  }, [warnCloudSaveFailed, resetCloudBusinessState]);

  const syncState = useMemo(() => ({
    customers, products, invoices, expenses, deliveries, events, stockLog,
    koiFishList, customerKoiList, pondData, whatsappGroups,
  }), [customers, products, invoices, expenses, deliveries, events, stockLog, koiFishList, customerKoiList, pondData, whatsappGroups]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const ensureCloudSyncReady = useCallback(async () => {
    if (!isSupabaseConfigured || !auth.hasCloudSession()) return false;
    if (auth.getSessionToken()) return true;
    if (!auth.sessionNeedsRefresh()) return false;
    try {
      return await auth.bootstrapCloudSession();
    } catch {
      return false;
    }
  }, []);

  const flushPendingCloudSync = useCallback(async () => {
    if (!cloudHydrated || !isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) return;
    if (!(await ensureCloudSyncReady())) return;
    Object.values(syncTimersRef.current).forEach((t) => clearTimeout(t));
    syncTimersRef.current = {};
    const tasks = SYNC_ENTITIES.filter((e) => hasPermission(currentUser, e.perm));
    if (!tasks.length) return;
    syncInFlightRef.current += 1;
    try {
      await Promise.all(tasks.map((e) => e.sync(syncStateRef.current[e.key])));
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushProductSync = useCallback(async (productsOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "inventory")) {
      throw new Error("Permission denied (inventory).");
    }
    const productKey = "inventory:Inventory";
    if (syncTimersRef.current[productKey]) {
      clearTimeout(syncTimersRef.current[productKey]);
      delete syncTimersRef.current[productKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = productsOverride ?? syncStateRef.current.products ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncProducts(payload);
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushInventorySync = useCallback(async (productsOverride, stockLogOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "inventory")) {
      throw new Error("Permission denied (inventory).");
    }
    const productKey = "inventory:Inventory";
    const stockKey = "inventory:Stock activity";
    if (syncTimersRef.current[productKey]) {
      clearTimeout(syncTimersRef.current[productKey]);
      delete syncTimersRef.current[productKey];
    }
    if (syncTimersRef.current[stockKey]) {
      clearTimeout(syncTimersRef.current[stockKey]);
      delete syncTimersRef.current[stockKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const nextProducts = productsOverride ?? syncStateRef.current.products ?? [];
    const nextStockLog = stockLogOverride ?? syncStateRef.current.stockLog ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncProducts(nextProducts);
      await db.syncStockActivity(nextStockLog);
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const adjustInventoryStockCloud = useCallback(async ({ productId, delta, note }) => {
    if (!isSupabaseConfigured) throw new Error("Cloud sync is not configured.");
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "inventory")) {
      throw new Error("Permission denied (inventory).");
    }
    if (!canEditRecords(currentUser)) {
      throw new Error("Permission denied (edit).");
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }

    syncInFlightRef.current += 1;
    try {
      const result = await db.adjustInventoryStockCloud({
        productId,
        delta,
        note,
      });
      setProducts((prev) => prev.map((p) => (sameProductId(p.id, result.product.id) ? result.product : p)));
      setStockLog((prev) => sortStockLog([result.stockEntry, ...prev.filter((l) => String(l.id) !== String(result.stockEntry.id))]));
      syncStateRef.current = {
        ...syncStateRef.current,
        products: (syncStateRef.current.products || []).map((p) => (sameProductId(p.id, result.product.id) ? result.product : p)),
        stockLog: sortStockLog([result.stockEntry, ...(syncStateRef.current.stockLog || []).filter((l) => String(l.id) !== String(result.stockEntry.id))]),
      };
      explicitFlushAtRef.current.inventory = Date.now();
      resetSyncHealth();
      touchLastSync();
      return result;
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const syncDebounced = useCallback((perm, label, fn, data) => {
    if (!dataReady || !cloudHydrated || !isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) return;
    if (!hasPermission(currentUser, perm)) return;
    const key = `${perm}:${label}`;
    if (syncTimersRef.current[key]) clearTimeout(syncTimersRef.current[key]);
    syncTimersRef.current[key] = setTimeout(() => {
      delete syncTimersRef.current[key];
      const flushKey = perm === "calendar" ? "calendar" : perm;
      if (Date.now() - (explicitFlushAtRef.current[flushKey] || 0) < 12000) return;
      syncInFlightRef.current += 1;
      (async () => {
        const ready = await ensureCloudSyncReady();
        if (!ready) {
          throw new Error("Session needs refresh. Log out and log in again.");
        }
        const refKey = perm === "ponds" ? "pondData" : perm === "calendar" ? "events" : perm === "invoices" ? "invoices" : perm === "expenses" ? "expenses" : null;
        const payload = refKey ? (syncStateRef.current[refKey] ?? data) : data;
        await fn(payload);
      })()
        .then(() => {
          resetSyncHealth();
          touchLastSync();
        })
        .catch((err) => {
          const msg = err?.message || "Sync failed";
          handleSyncFailure(new Error(`${label}: ${msg}`));
        })
        .finally(() => {
          syncInFlightRef.current -= 1;
        });
    }, 800);
    return () => {
      if (syncTimersRef.current[key]) clearTimeout(syncTimersRef.current[key]);
      delete syncTimersRef.current[key];
    };
  }, [dataReady, cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  useEffect(() => {
    if (!inventorySyncPendingRef.current) return;
    if (!dataReady || !cloudHydrated || !isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) return;
    if (!hasPermission(currentUser, "inventory")) {
      inventorySyncPendingRef.current = false;
      return;
    }
    inventorySyncPendingRef.current = false;

    const productKey = "inventory:Inventory";
    const stockKey = "inventory:Stock activity";
    if (syncTimersRef.current[productKey]) {
      clearTimeout(syncTimersRef.current[productKey]);
      delete syncTimersRef.current[productKey];
    }
    if (syncTimersRef.current[stockKey]) {
      clearTimeout(syncTimersRef.current[stockKey]);
      delete syncTimersRef.current[stockKey];
    }

    syncInFlightRef.current += 1;
    (async () => {
      try {
        if (!(await ensureCloudSyncReady())) return;
        const snap = syncStateRef.current;
        await db.syncProducts(snap.products || []);
        await db.syncStockActivity(snap.stockLog || []);
        resetSyncHealth();
        touchLastSync();
      } catch (err) {
        handleSyncFailure(err);
      } finally {
        syncInFlightRef.current -= 1;
      }
    })();
  }, [products, stockLog, dataReady, cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const retryCloudSync = useCallback(async () => {
    if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser || !cloudHydrated) return;
    setCloudRetrying(true);
    try {
      if (!(await ensureCloudSyncReady())) {
        throw new Error("Session needs refresh. Log out and log in again.");
      }
      const tasks = SYNC_ENTITIES.filter((e) => hasPermission(currentUser, e.perm));
      const results = await Promise.allSettled(
        tasks.map((e) => e.sync(syncState[e.key])),
      );
      const failed = results
        .map((r, i) => (r.status === "rejected" ? tasks[i].label : null))
        .filter(Boolean);
      if (failed.length) {
        const reason = results.find((r) => r.status === "rejected")?.reason;
        throw new Error(`Sync failed: ${failed.join(", ")} — ${reason?.message || "unknown error"}`);
      }
      resetSyncHealth();
      touchLastSync();
      dismissToast("cloud-sync-warn");
      const skipped = SYNC_ENTITIES.length - tasks.length;
      showProminentToast({
        id: "cloud-sync-ok",
        type: "success",
        title: "Saved to cloud",
        message: skipped
          ? `Your permitted modules synced to Supabase (${skipped} module${skipped === 1 ? "" : "s"} skipped — no permission).`
          : "All farm data synced to Supabase.",
        duration: 6000,
      });
    } catch (err) {
      handleSyncFailure(err);
    } finally {
      setCloudRetrying(false);
    }
  }, [
    currentUser, cloudHydrated, syncState, ensureCloudSyncReady, handleSyncFailure, dismissToast, showProminentToast, touchLastSync, resetSyncHealth,
  ]);

  const refreshFromCloud = useCallback(async ({ force = false, quiet = false, source = "event" } = {}) => {
    if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) return;
    const now = Date.now();
    const throttleMs = force
      ? 0
      : source === "poll"
        ? TEAM_SYNC_POLL_THROTTLE_MS
        : TEAM_SYNC_EVENT_THROTTLE_MS;
    if (!force && now - lastCloudPullAt.current < throttleMs) return;

    const pendingPush = Object.keys(syncTimersRef.current).length > 0;
    if (source === "poll") {
      if (pendingPush || syncInFlightRef.current > 0) return;
      if (now - lastUserActivityAt.current < TEAM_SYNC_USER_IDLE_MS) return;
    }

    const showBlockingPullUi = source === "manual" || !quiet;
    if (showBlockingPullUi) setCloudPulling(true);
    try {
      let waited = 0;
      while (syncInFlightRef.current > 0 && waited < 3000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }
      if (syncInFlightRef.current > 0) return;

      if (pendingPush && source !== "poll") {
        await flushPendingCloudSync();
      }

      const data = await db.fetchAllData();
      const teamChanges = source === "poll" && cloudHydrated
        ? countIncomingTeamChanges(syncStateRef.current, data, peekDeletions)
        : 0;

      lastCloudPullAt.current = Date.now();

      if (source === "poll" && cloudHydrated && teamChanges === 0) {
        resetSyncHealth();
        return;
      }

      applyCloudData(data, { mode: cloudHydrated ? "merge" : "replace" });
      resetSyncHealth();
      touchLastSync();
      dismissToast("cloud-sync-warn");
      if (quiet && source === "poll" && teamChanges > 0) {
        addNotification({
          type: "info",
          title: "Team data updated",
          message: `${teamChanges} update${teamChanges === 1 ? "" : "s"} from other devices synced.`,
          actor: "System",
          actorRole: "system",
        });
      }
      if (!quiet) {
        showProminentToast({
          id: "cloud-pull-ok",
          type: "success",
          title: "Loaded from cloud",
          message: `${(data.products || []).length} products · ${(data.customers || []).length} customers synced to this device.`,
          duration: 4000,
        });
      }
    } catch (err) {
      handleSyncFailure(err);
    } finally {
      if (showBlockingPullUi) setCloudPulling(false);
    }
  }, [
    currentUser, cloudHydrated, applyCloudData, handleSyncFailure, dismissToast,
    showProminentToast, flushPendingCloudSync, touchLastSync, resetSyncHealth, addNotification,
  ]);

  useEffect(() => {
    const markActive = () => { lastUserActivityAt.current = Date.now(); };
    window.addEventListener("pointerdown", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser || !cloudHydrated) return;
    ensurePushSubscription().catch(() => {});
  }, [currentUser, cloudHydrated]);

  useTeamSyncPoll({
    enabled: isSupabaseConfigured && Boolean(currentUser) && cloudHydrated && cloudSync,
    onPoll: () => refreshFromCloud({ quiet: true, source: "poll" }),
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshFromCloud({ quiet: true, source: "event" });
      } else if (document.visibilityState === "hidden") {
        flushPendingCloudSync();
      }
    };
    const onOnline = () => refreshFromCloud({ quiet: true, source: "event" });
    const onPageShow = (event) => {
      if (event.persisted) refreshFromCloud({ quiet: true, source: "event" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [currentUser, refreshFromCloud, flushPendingCloudSync]);

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser) return;
    return onConnectionChange(({ mode }) => {
      if (mode !== 'cloud') return;
      refreshFromCloud({ quiet: true, source: "event" });
      if (!cloudSync && cloudError) {
        retryCloudSync();
      }
    });
  }, [currentUser, cloudSync, cloudError, refreshFromCloud, retryCloudSync]);

  useEffect(() => syncDebounced("inventory", "Inventory", db.syncProducts, products), [products, syncDebounced]);
  useEffect(() => syncDebounced("inventory", "Stock activity", db.syncStockActivity, stockLog), [stockLog, syncDebounced]);
  useEffect(() => syncDebounced("ponds", "Pond data", db.syncPondData, pondData), [pondData, syncDebounced]);

  useEffect(() => {
    if (!currentUser || !hasPermission(currentUser, "inventory")) return;
    const lowStock = getLowStockProducts(products);
    if (lowStock.length === 0) {
      lowStockNotified.current = false;
      return;
    }
    const userId = currentUser.id;
    if (lowStockNotified.current || wasLowStockAlertShownToday(userId)) return;
    lowStockNotified.current = true;
    markLowStockAlertShownToday(userId);
    addNotification({
      type: "warning",
      title: "Low Stock Alert",
      message: `${lowStock.length} product(s) need restocking: ${lowStock.map(p => p.name).join(", ")}`,
      team: false,
    });
  }, [products, currentUser, addNotification]);

  const navItems = currentUser
    ? ALL_NAV_ITEMS.filter((item) => hasPermission(currentUser, item.id))
    : ALL_NAV_ITEMS;

  const effectiveTab = useMemo(() => {
    if (!currentUser || hasPermission(currentUser, activeTab)) return activeTab;
    return ALL_NAV_ITEMS.find((item) => hasPermission(currentUser, item.id))?.id || "dashboard";
  }, [currentUser, activeTab]);

  const visibleNotifications = useMemo(
    () => filterNotificationsForUser(notifications, {
      currentUserId: currentUser?.id,
      isOwner: currentUser?.role === "owner",
    }),
    [notifications, currentUser],
  );
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const handleLogin = async (user) => {
    if (!user || user.active === false) {
      auth.clearSession();
      setCurrentUser(null);
      addNotification({
        type: "error",
        title: "Login blocked",
        message: "This account is inactive. Contact the farm owner.",
      });
      return;
    }

    setNeedsSetup(false);
    setCloudHydrated(false);
    if (isSupabaseConfigured) {
      try {
        if (!auth.getSessionToken()) {
          throw new Error("Session token missing after login. Please try again.");
        }
        const data = await db.fetchAllData();
        applyCloudData(data);
        setCloudSync(true);
        setCloudError(null);
        setCurrentUser(user);
        const allowed = ALL_NAV_ITEMS.filter((item) => hasPermission(user, item.id));
        setActiveTab(allowed[0]?.id || "dashboard");
      } catch (loginErr) {
        let cloudErr = loginErr;
        if (await auth.tryRefreshSession()) {
          try {
            const data = await db.fetchAllData();
            applyCloudData(data);
            setCloudSync(true);
            setCloudError(null);
            setCurrentUser(user);
            const allowed = ALL_NAV_ITEMS.filter((item) => hasPermission(user, item.id));
            setActiveTab(allowed[0]?.id || "dashboard");
            setCloudHydrated(true);
            return;
          } catch (retryErr) {
            cloudErr = retryErr;
          }
        }
        if (auth.isSessionExpiredError(cloudErr?.message)) {
          auth.clearSession();
          setCurrentUser(null);
          resetCloudBusinessState();
        } else {
          setCurrentUser(user);
        }
        setCloudSync(false);
        setCloudError(cloudErr?.message || "Failed to load cloud data");
        addNotification({
          type: "error",
          title: auth.isSessionExpiredError(cloudErr?.message) ? "Session expired" : "Could not load farm data",
          message: cloudErr?.message || "Please try again. Your connection may be unstable.",
        });
      }
      return;
    }
    setCloudHydrated(true);
    setCurrentUser(user);
    const allowed = ALL_NAV_ITEMS.filter((item) => hasPermission(user, item.id));
    setActiveTab(allowed[0]?.id || "dashboard");
  };

  const handleLogout = async () => {
    await auth.logout();
    setCurrentUser(null);
    resetCloudBusinessState();
    setNotifOpen(false);
    setToasts([]);
    toastTimers.current.forEach((t) => clearTimeout(t));
    toastTimers.current.clear();
  };

  const handleUserUpdate = (updatedFields) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const role = updatedFields.role ?? prev.role;
      const name = updatedFields.name ?? prev.name;
      const permissions = updatedFields.permissions ?? prev.permissions;
      const active = updatedFields.active !== false;
      const next = {
        ...prev,
        ...updatedFields,
        permissions,
        active,
        displayName: role === "owner" ? `🐟 ${name}` : `👤 ${name}`,
      };
      auth.patchSessionUser({
        name: next.name,
        role: next.role,
        permissions: next.permissions,
        active: next.active,
      });
      return next;
    });
  };

  const handleSetupComplete = async (user) => {
    if (!user) {
      auth.clearSession();
      return;
    }
    setNeedsSetup(false);
    setCloudHydrated(false);
    try {
      if (!auth.getSessionToken()) {
        throw new Error("Session token missing after setup. Please log in again.");
      }
      const data = await db.fetchAllData();
      applyCloudData(data);
      setCloudSync(true);
      setCloudError(null);
      setCurrentUser(user);
      setActiveTab("dashboard");
    } catch (err) {
      auth.clearSession();
      setCloudError(err.message);
      setCloudSync(false);
      resetCloudBusinessState();
      setCurrentUser(null);
      addNotification({
        type: "error",
        title: "Could not finish setup",
        message: err?.message || "Please try logging in again.",
      });
    }
  };

  const goToTab = useCallback((tabId) => {
    setActiveTab(tabId);
    if (isMobile) {
      setSidebarOpen(false);
      setNotifOpen(false);
    }
  }, [isMobile]);

  const goToTabRef = useRef(goToTab);
  useEffect(() => {
    goToTabRef.current = goToTab;
  }, [goToTab]);

  useEffect(() => {
    lastUserActivityAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== "push-navigate") return;
      const tab = event.data.tab;
      if (tab && ALL_NAV_ITEMS.some((item) => item.id === tab)) {
        goToTabRef.current(tab);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  if (!dataReady) {
    return <LoadingScreen message={isSupabaseConfigured ? "Loading from Supabase..." : "Loading..."} />;
  }

  if (needsSetup) return <SetupScreen onComplete={handleSetupComplete} />;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} cloudMode={isSupabaseConfigured} />;

  const guard = (permission, label, content) => {
    if (!hasPermission(currentUser, permission)) return <AccessDenied moduleName={label} />;
    return <ErrorBoundary>{content}</ErrorBoundary>;
  };

  const renderModule = () => {
    const dashboardCloudStale = isSupabaseConfigured && Boolean(cloudError);
    switch (effectiveTab) {
      case "dashboard": return guard("dashboard", "Dashboard", (
        <Dashboard
          products={products}
          stockLog={stockLog}
          currentUser={currentUser}
          onNavigate={goToTab}
          onRetrySync={refreshFromCloud}
          cloudStale={dashboardCloudStale}
        />
      ));
      case "inventory": return guard("inventory", "Inventory", <InventoryModule products={products} setProducts={setProducts} stockLog={stockLog} setStockLog={setStockLog} addNotification={addNotification} currentUser={currentUser} onProductsSaved={flushProductSync} onInventorySaved={flushInventorySync} onAdjustStockCloud={isSupabaseConfigured ? adjustInventoryStockCloud : undefined} />);
      case "ponds": return guard("ponds", "Pond Calculator", <PondManagement />);
      case "users": return guard("users", "Team & Permissions", <TeamModule users={users} setUsers={setUsers} currentUser={currentUser} addNotification={addNotification} onCurrentUserUpdate={handleUserUpdate} cloudMode={isSupabaseConfigured && cloudSync} apiEnabled={isSupabaseConfigured} onOpenChangePin={() => setShowChangePin(true)} />);
      default: return null;
    }
  };

  const activeNav = navItems.find((item) => item.id === effectiveTab);

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-950 text-white flex" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      {isMobile && sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on phone, rail on desktop */}
      <div
        className={`bg-slate-900 border-r border-slate-800 flex flex-col min-h-0 z-50
          ${isMobile
            ? `fixed left-0 top-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] w-[min(18rem,85vw)] transition-transform duration-300 safe-top ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarOpen ? "w-56" : "w-16"} flex-shrink-0 relative transition-all duration-300`
          }`}
      >
        <div className={`p-4 border-b border-slate-800 flex items-center gap-3 shrink-0 ${isMobile ? "" : "safe-top"}`}>
          <AppLogo size="sm" className="ring-1 ring-slate-700" />
          {(sidebarOpen || isMobile) && (
            <div className="overflow-hidden flex-1 min-w-0">
              <p className="text-white font-black text-sm leading-tight">Marugen</p>
              <p className="text-cyan-400 text-xs">Koi Farm</p>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white p-2 -mr-1 rounded-lg hover:bg-slate-800 touch-manipulation">
              <X size={18} />
            </button>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overscroll-contain">
          {navItems.map(item => (
            <button key={item.id} onClick={() => goToTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all touch-manipulation ${effectiveTab === item.id ? "bg-cyan-500 text-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}>
              <item.icon size={18} className="flex-shrink-0" />
              {(sidebarOpen || isMobile) ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className={`p-3 border-t border-slate-800 shrink-0 ${isMobile ? "" : "safe-bottom"}`}>
          {(sidebarOpen || isMobile) ? (
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black">
                  {currentUser.name[0].toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden min-w-0">
                  <p className="text-white text-xs font-bold truncate">{currentUser.name}</p>
                  <p className="text-slate-500 text-xs capitalize">{currentUser.role}</p>
                </div>
                <button onClick={() => setShowChangePin(true)} title="Change My PIN" className="text-slate-500 hover:text-cyan-400 transition-colors p-2 touch-manipulation"><Lock size={14} /></button>
                <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-2 touch-manipulation"><LogOut size={14} /></button>
              </div>
              {isSupabaseConfigured && lastSyncAt && (
                <p className="text-slate-500 text-[10px] mt-2 flex items-center gap-1 pl-0.5" title={format(lastSyncAt, "dd MMM yyyy, HH:mm")}>
                  <Clock size={10} className="shrink-0" />
                  Last synced {format(lastSyncAt, "HH:mm")}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button onClick={handleLogout} className="w-full flex justify-center text-slate-500 hover:text-red-400 p-2 touch-manipulation"><LogOut size={16} /></button>
              {isSupabaseConfigured && lastSyncAt && (
                <span className="text-slate-600 text-[9px]" title={format(lastSyncAt, "dd MMM yyyy, HH:mm")}>
                  {format(lastSyncAt, "HH:mm")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 overflow-hidden">
        <header className="safe-header bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 flex-shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-slate-400 hover:text-white transition-colors p-2 -ml-1 rounded-xl hover:bg-slate-800 touch-manipulation"
            aria-label={isMobile ? "Open menu" : "Toggle sidebar"}
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1 lg:flex-none flex items-center gap-2">
            <p className="text-white text-sm font-bold truncate lg:hidden">{activeNav?.label || "Marugen"}</p>
            {cloudSync && !cloudError && (
              <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] sm:text-xs shrink-0">☁️ Supabase</Badge>
            )}
            {isSupabaseConfigured && lastSyncAt && (
              <span className="hidden md:inline text-slate-500 text-[10px] shrink-0" title={format(lastSyncAt, "dd MMM yyyy, HH:mm")}>
                <Clock size={10} className="inline mr-0.5 -mt-px" />
                Last synced {format(lastSyncAt, "HH:mm")}
              </span>
            )}
            {cloudError && !cloudSync && (
              <Badge className="bg-amber-500/25 text-amber-200 text-[10px] sm:text-xs animate-pulse shrink-0" title={cloudError}>⚠️ Local mode</Badge>
            )}
            {cloudError && cloudSync && syncFailCount > 0 && (
              <Badge className="bg-cyan-500/20 text-cyan-200 text-[10px] sm:text-xs shrink-0" title={cloudError}>⏳ Sync retry</Badge>
            )}
            {isFromCache && !cloudError && (
              <Badge className="bg-amber-500/15 text-amber-300 text-[10px] sm:text-xs shrink-0">📦 Cached</Badge>
            )}
            {isSupabaseConfigured && currentUser && (
              <button
                type="button"
                onClick={() => refreshFromCloud({ force: true, source: "manual" })}
                disabled={cloudPulling}
                title="Load latest data from cloud (use after changes on another device)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors touch-manipulation disabled:opacity-40 shrink-0"
                aria-label="Refresh from cloud"
              >
                <RefreshCw size={16} className={cloudPulling ? "animate-spin" : ""} />
              </button>
            )}
          </div>

          <div className="flex-1 hidden lg:block" />

          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)}
              className={`relative p-2.5 rounded-xl transition-all touch-manipulation ${notifOpen ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              aria-label="Team alerts">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>

            {notifOpen && (
              <>
                <button type="button" className="fixed inset-0 z-40" aria-label="Close notifications" onClick={() => setNotifOpen(false)} />
                <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto sm:right-0 top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-12 w-auto sm:w-80 max-w-none bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 max-h-[70dvh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-white flex items-center gap-2"><Bell size={14} className="text-cyan-400" />Team Alerts</h4>
                    <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-white p-2 touch-manipulation"><X size={14} /></button>
                  </div>
                  <NotificationPanel
                    notifications={visibleNotifications}
                    onDismiss={id => setNotifications(prev => prev.filter(n => n.id !== id))}
                    onClear={() => setNotifications([])}
                    onMarkRead={id => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
                  />
                </div>
              </>
            )}
          </div>
        </header>

        {isSupabaseConfigured && currentUser && (
          <ConnectionStatus
            cloudSync={cloudSync}
            cloudError={cloudError}
            cloudRetrying={cloudRetrying}
            onRetry={retryCloudSync}
            isFromCache={isFromCache}
            cacheCachedAt={cacheCachedAt}
            syncFailCount={syncFailCount}
          />
        )}

        {isSupabaseConfigured && currentUser && cloudHydrated && (
          <PushNotificationPrompt addNotification={addNotification} />
        )}

        <main className={`flex-1 min-h-0 overscroll-y-contain ${
          isMobile && effectiveTab === "chat"
            ? "flex flex-col overflow-hidden p-0 pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
            : `overflow-y-auto overflow-x-hidden p-4 sm:p-6 ${isMobile ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))]" : ""}`
        }`}>
          {cloudPulling ? <ModuleSkeleton tab={effectiveTab} /> : renderModule()}
        </main>
      </div>

      <ChangePinModal
        open={showChangePin}
        onClose={() => setShowChangePin(false)}
        currentUser={currentUser}
        users={users}
        setUsers={setUsers}
        addNotification={addNotification}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {isMobile && (
        <MobileBottomNav items={navItems} activeTab={effectiveTab} onSelect={goToTab} />
      )}
    </div>
  );
}
