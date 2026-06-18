import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { Users, Fish, FishSymbol, Contact, Droplets, FileText, TrendingUp, Truck, Calendar, MessageSquare, Bell, LogOut, Plus, Search, X, Check, AlertTriangle, Home, Menu, Boxes, Eye, Send, Phone, MapPin, Navigation, Star, Zap, Clock, CheckCircle, XCircle, Info, Archive, ShoppingBag, Shield, UserCog, UserPlus, Edit2, Trash2, Lock, Printer, BookCheck, ImagePlus, Images, Camera, ScanLine, RefreshCw, Download, Loader2 } from "lucide-react";
import KoiFish from "./modules/KoiFish";
import CustomerKoi from "./modules/CustomerKoi";
import PondManagement from "./modules/PondManagement";
import { loadKoiFish, saveKoiFish, loadCustomerKoi, saveCustomerKoi, loadPondData, savePondData } from "./lib/koiStorage";
import { loadProducts, saveProducts, loadStockLog, saveStockLog } from "./lib/farmStorage";
import { markLowStockAlertShownToday, wasLowStockAlertShownToday } from "./lib/lowStockAlert";
import {
  clearLocalOnlyStorage, emptyPondData, resolveCloudKoiPayload, resolveCloudWhatsappGroups,
} from "./lib/cloudData";
import { applyStockPreview, deductStockForInvoice, restoreStockForInvoice, serializeInvoiceItem, validateStockForItems, previewDeductStockForInvoice, previewRestoreStockForInvoice } from "./lib/inventoryStock";
import {
  adjustProductStockInList, buildStockLogEntry, formatRestockLogNote, genStockLogId, getLowStockProducts, isProductOnActiveInvoice,
  normalizeProductRecord, parseStockQty, sameProductId, sortStockLog, validateProductFields,
} from "./lib/inventoryOps";
import { isStockTracked, priceListProducts, stockProducts } from "./lib/productCatalog";
import {
  applyInvoiceKoiSales, restoreInvoiceKoiSales, previewRestoreInvoiceKoiSales, previewApplyInvoiceKoiSales, availableKoiForInvoice, reconcileKoiSoldFromInvoices,
  formatKoiInvoiceLineName, validateInvoiceKoiSales, findLinkedKoiInvoices, findInvoicesForKoiRefund, buildKoiRefundUpdate,
  isRefundCreditNoteInvoice, buildInvoiceFromKoiSaleDraft, hasActiveInvoiceForKoi,
} from "./lib/koiInvoice";
import { sameKoiId } from "./lib/koiOps";
import { PondNameInput } from "./components/ui";
import BackupExportPanel from "./components/BackupExportPanel";
import { backupBaseName, downloadFile, expensesToCsv, invoicesToCsv } from "./lib/backupExport";
import InvoiceDocument from "./components/InvoiceDocument";
import InvoicePreviewFrame from "./components/InvoicePreviewFrame";
import { downloadInvoicePdf } from "./lib/generateInvoicePdf";
import { calcInvoiceAmounts, sortInvoices } from './lib/invoiceDesign';
import { computeDashboardMetrics, dashboardInvoiceTotal } from './lib/dashboardMetrics';
import { compressDeliveryPhoto, compressReceiptImage, deliveryPhotoSrc, expenseImageSrc } from "./lib/compressImage";
import { persistCustomerKoiList } from "./lib/imageUploadOps";
import {
  normalizeCustomerKoiForCache,
  normalizeKoiFishForCache,
  resolvePhotoRefFromKoi,
  uploadInlinePhotoIfNeeded,
} from "./lib/farmImage";
import { enrichInvoiceCustomer, findCustomerWhatsApp, formatCustomerAddress, findCustomerRecord, openWhatsAppChat, resolveInvoiceCustomer, resolveInvoiceWhatsApp } from "./lib/invoiceWhatsApp";
import { lookupSingaporePostalAddress } from "./lib/sgPostalLookup";
import {
  buildDeliveryWhatsAppRecipients, formatDeliveryRecipientLabel, formatDeliverySchedule,
  loadWhatsappGroups, saveWhatsappGroups, sendDeliveryToRecipient,
} from "./lib/deliveryWhatsApp";
import { formatDeliveryLocation, openDeliveryMap } from "./lib/deliveryMaps";
import { normalizeWhatsAppGroupLink } from "./lib/invoiceWhatsApp";
import { fetchAiUsage, fetchAiUsageStats, sendChatMessage } from "./lib/gemini";
import { readChatImageFile, MAX_CHAT_IMAGES } from "./lib/chatImage";
import { AI_DAILY_FREE_TOKENS, AI_WARN_AT_TOKENS, formatTokens } from "./lib/aiUsage";
import { AI_TOOL_DEFINITIONS } from "./lib/aiTools";
import {
  buildAssistantReplyText, buildChatApiThread, CHAT_BUSY_MESSAGE, CHAT_HISTORY_MAX,
  CHAT_UNAVAILABLE_MESSAGE, chatError, getChatSimulateMode, isChatUnavailable,
  sanitizeStoredChatMessages, slimChatMessageForStorage, validateChatOutgoingMessage,
} from "./lib/chatOps";
import {
  defaultPermissionsForRole, getUserDeactivateBlockReason, getUserDeleteBlockReason, userProfileChanged,
  normalizeUserRecord, sameUserId, userInitial, validateUserFields,
} from "./lib/teamOps";
import {
  findLocalUserByPin, sanitizePinInput, validateChangePinForm,
  validateLoginPin, validateSetupOwnerFields,
} from "./lib/loginOps";
import { buildBusinessContext, executeAiActions, resolvePendingAiActions } from "./lib/aiActions";
import * as db from "./lib/database";
import { SYNC_ENTITIES } from "./lib/cloudSync";
import {
  applyCloudRetention, isAppVisibleInvoice, isAppVisibleExpense, isAppVisibleDelivery,
  isAppVisibleEvent, isAppVisibleStockLog,
} from "./lib/retention";
import { isSupabaseConfigured } from "./lib/supabase";
import * as auth from "./lib/auth";
import { markDeleted, clearAllDeletions, peekDeletions, unmarkDeleted } from "./lib/syncDeletions";
import { peekReservedInvoiceIds, reserveInvoiceId } from "./lib/invoiceIdReserve";
import { applyServerTombstones, filterMergeDeletions, mergeLiveByEntityWithLocal, pruneLocalOnlyCloudRows, stripTombstonedRows } from "./lib/tombstones";
import { writeCloudFirst, writeInventoryCloudFirst } from "./lib/cloudWrite";
import { mergeRecords, mergePondData, mergeInvoices, mergeStockLog, mergeProducts, mergeKoiFish, mergeCustomerKoi, resolveInvoiceConflict, resolveExpenseConflict, resolveEventConflict } from "./lib/cloudMerge";
import {
  countIncomingTeamChanges,
  TEAM_SYNC_EVENT_THROTTLE_MS,
  TEAM_SYNC_POLL_THROTTLE_MS,
  TEAM_SYNC_USER_IDLE_MS,
} from "./lib/teamSyncDetect";
import { applyInvoicePins, pinInvoice, unpinInvoice, releaseInvoicePinAfterConfirm } from "./lib/invoicePins";
import { saveInvoicePendingCreate, clearInvoicePendingCreate, readInvoicePendingCreate } from "./lib/invoicePendingOp";
import { touchPondData, touchUpdatedAt } from "./lib/syncMeta";
import {
  applyCustomerPaidDelta, buildNewCustomerRecord, buildUpdatedCustomerRecord, getCustomerDeleteWarnings,
  isDuplicateCustomerName, propagateCustomerProfileChange, sameCustomerId,
} from "./lib/customerOps";
import {
  buildExpenseReceiptRecord, sameExpenseId, validateExpenseDateUpdate,
} from "./lib/expenseOps";
import {
  buildDeliveryStatusPatch, buildNewDeliveryRecord, buildUpdatedDeliveryRecord,
  resolveDeliveryArea, sameDeliveryId,
} from "./lib/deliveryOps";
import {
  pendingRemindersSyncKey, syncPondCalendarAssignees,
  removeCalendarEventForReminder, upsertCalendarEventForReminder,
} from "./lib/pondReminderCalendar";
import {
  buildNewEventRecord, buildUpdatedEventRecord, EVENT_TYPE_OPTIONS,
  sameEventId, sortEventsBySchedule,
} from "./lib/calendarOps";
import {
  FISH_TYPES, PRODUCT_CATEGORIES, LIST_PAGE_SIZE,
  CUSTOMER_TIERS, ALL_PERMISSIONS,
  formatSGD, formatInvoiceDate, today, genId, genInvoiceId, getInvoiceStatus, calcCustomerTier, KOI_STATUS, CUSTOMER_KOI_STATUS,
  INITIAL_PRODUCTS, INITIAL_CUSTOMERS, INITIAL_INVOICES, INITIAL_EXPENSES,
  INITIAL_DELIVERIES, INITIAL_EVENTS, LOCAL_DEMO_USERS, customerDeliveryFields, invoiceDeliveryFields, makeBookedPatch,
} from "./data/constants";
import logo from "./assets/logo.png";
import Fab from "./components/Fab";
import MobileBottomNav from "./components/MobileBottomNav";
import ProductSearchPicker from "./components/ProductSearchPicker";
import ToastStack from "./components/ToastStack";
import ErrorBoundary from "./components/ErrorBoundary";
import StoredImage from "./components/StoredImage";
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
import { notifyAssignmentChange } from "./lib/teamAssignNotify";
import {
  filterNotificationsForUser,
  hasAssignedTeam,
  isTeamNotificationForUser,
  newlyAssignedUserIds,
  normalizeAssignedUserIds,
} from "./lib/assignTeam";
import { ensurePushSubscription } from "./lib/webPush";
import StaffAssignPicker, { AssigneeBadges } from "./components/StaffAssignPicker";

function BookedBadge({ booked, bookedBy }) {
  if (booked) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300 text-[10px]" title={bookedBy ? `Entered by ${bookedBy}` : "Entered in external accounts"}>
        <BookCheck size={10} className="inline mr-0.5" />In accounts
      </Badge>
    );
  }
  return <Badge className="bg-amber-500/15 text-amber-300 text-[10px]">Pending accounts</Badge>;
}

function AccountsMarkConfirmModal({ open, recordLabel, currentlyBooked, onCancel, onSubmit }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={currentlyBooked ? "Remove accounts mark?" : "Mark in accounts?"}
      size="sm"
      priority
      footer={(
        <ConfirmModalFooter onCancel={onCancel}>
          <Btn variant={currentlyBooked ? "danger" : "success"} onClick={onSubmit} className="w-full sm:w-auto justify-center">
            <BookCheck size={14} />{currentlyBooked ? "Remove mark" : "Submit"}
          </Btn>
        </ConfirmModalFooter>
      )}
    >
      <p className="text-slate-300 text-sm">
        {currentlyBooked
          ? <>Remove <strong className="text-white">{recordLabel}</strong> from accounts? It will show as <span className="text-amber-300">Pending accounts</span> again.</>
          : <>Confirm <strong className="text-white">{recordLabel}</strong> has been entered in your external accounting app.</>}
      </p>
    </Modal>
  );
}

function InvoiceCancelConfirmModal({ open, invoiceId, customerName, onCancel, onConfirm, loading = false }) {
  const handleKeep = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!loading) onCancel();
  };
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title="Cancel invoice?"
      size="sm"
      priority
      backdropClose={!loading}
      footer={(
        <ConfirmModalFooter onCancel={handleKeep} cancelLabel="Keep invoice" cancelDisabled={loading}>
          <Btn variant="danger" onClick={onConfirm} disabled={loading} className="w-full sm:w-auto justify-center">
            {loading ? <><Loader2 size={14} className="animate-spin" />Cancelling...</> : <><XCircle size={14} />Cancel invoice</>}
          </Btn>
        </ConfirmModalFooter>
      )}
    >
      <p className="text-slate-300 text-sm">
        Cancel <strong className="text-white">{invoiceId}</strong> for <strong className="text-white">{customerName}</strong>?
        Inventory and fish stock will be restored where applicable. This cannot be undone.
      </p>
    </Modal>
  );
}

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

function canMarkAccounting(user) {
  return hasPermission(user, "accounting");
}

function canEditRecords(user) {
  return hasPermission(user, "edit");
}

function canDeleteRecords(user) {
  return hasPermission(user, "delete");
}

function canRefundSales(user) {
  return hasPermission(user, "refund");
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
const tierColor = { Bronze: "text-orange-400", Silver: "text-slate-300", Gold: "text-yellow-400", Platinum: "text-cyan-400" };
const statusColor = { paid: "bg-emerald-500/20 text-emerald-300", pending: "bg-amber-500/20 text-amber-300", overdue: "bg-red-500/20 text-red-300", scheduled: "bg-blue-500/20 text-blue-300", delivered: "bg-emerald-500/20 text-emerald-300", cancelled: "bg-red-500/20 text-red-300", transit: "bg-purple-500/20 text-purple-300" };
const eventTypeColor = { maintenance: "bg-blue-500/20 text-blue-300 border-blue-500/30", feeding: "bg-green-500/20 text-green-300 border-green-500/30", purchase: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", customer: "bg-purple-500/20 text-purple-300 border-purple-500/30", other: "bg-slate-500/20 text-slate-300 border-slate-500/30" };
const STOCK_NOTE_INVOICE_RE = /^Invoice (INV\d{8}-\d+)$/i;
const STOCK_NOTE_CANCELLED_RE = /^Invoice cancelled (INV\d{8}-\d+)$/i;

function linkedInvoiceIdFromStockNote(note) {
  const text = String(note || "").trim();
  const hit = text.match(STOCK_NOTE_INVOICE_RE) || text.match(STOCK_NOTE_CANCELLED_RE);
  return hit?.[1] || null;
}

function pruneOrphanInvoiceStockLogs(stockRows = [], invoices = []) {
  const liveInvoiceIds = new Set((invoices || []).map((inv) => String(inv?.id || "")));
  const nextRows = [];
  const removedIds = [];
  for (const row of stockRows || []) {
    const invoiceId = linkedInvoiceIdFromStockNote(row?.note);
    if (invoiceId && !liveInvoiceIds.has(invoiceId)) {
      if (row?.id != null && row.id !== "") removedIds.push(String(row.id));
      continue;
    }
    nextRows.push(row);
  }
  return { nextRows, removedIds };
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
          className={`fixed inset-0 ${zClass} flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm touch-manipulation`}
          onPointerDown={handleBackdropPointerDown}
          onPointerUp={handleBackdropPointerUp}
        >
          <div
            className={`bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full ${sizes[size]} ${panelHeightClass} flex flex-col shadow-2xl overflow-hidden`}
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
    <div className="space-y-2 w-full max-w-[min(100vw-2rem,320px)] sm:min-w-[320px]">
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
  invoices, expenses, customers, products, events, deliveries, koiFishList, customerKoiList,
  currentUser, onNavigate, onOpenInvoice, onRetrySync, cloudStale,
}) {
  const can = useCallback((perm) => hasPermission(currentUser, perm), [currentUser]);
  const go = useCallback((tab) => { if (hasPermission(currentUser, tab)) onNavigate?.(tab); }, [currentUser, onNavigate]);

  const metrics = useMemo(
    () => computeDashboardMetrics({
      invoices: can("invoices") ? invoices : [],
      expenses: can("expenses") ? expenses : [],
      customers: can("customers") ? customers : [],
      products: can("inventory") ? products : [],
      events: can("calendar") ? events : [],
      deliveries: can("deliveries") ? deliveries : [],
      koiFishList: can("koifish") ? koiFishList : [],
      customerKoiList: can("customerkoi") ? customerKoiList : [],
      can,
    }),
    [invoices, expenses, customers, products, events, deliveries, koiFishList, customerKoiList, can],
  );

  const {
    kpiCards,
    lowStock,
    todayEvents,
    scheduledDeliveries,
    todayDeliveries,
    recentInvoices,
    recentCustomers,
    koiAvailable,
    koiSold,
    koiInPond,
    showKoiSummary,
    showPendingAccounts,
    pendingAccountsCount,
    pendingAccountsTab,
    pendingAccountsSubtitle,
  } = metrics;

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

  const openInvoice = (invoiceId) => {
    if (!can("invoices") || !invoiceId) return;
    if (onOpenInvoice) onOpenInvoice(invoiceId);
    else go("invoices");
  };

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
            <p className="text-slate-400 text-sm">No summary modules assigned yet. Contact the farm owner for access to invoices, expenses, or inventory.</p>
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
      {showPendingAccounts && (
        <button
          type="button"
          onClick={() => pendingAccountsTab && go(pendingAccountsTab)}
          disabled={!pendingAccountsTab}
          className={`w-full sm:w-72 text-left p-4 border rounded-xl transition-colors touch-manipulation bg-cyan-500/10 border-cyan-500/20 ${pendingAccountsTab ? "hover:brightness-110" : "opacity-70 cursor-default"}`}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-cyan-500/10">
            <BookCheck size={18} className="text-cyan-400" />
          </div>
          <p className="text-xl font-black text-cyan-400">{pendingAccountsCount}</p>
          <p className="text-slate-400 text-xs mt-1">Pending Accounts</p>
          <p className="text-cyan-400/80 text-[10px] mt-1 truncate">{pendingAccountsSubtitle}</p>
        </button>
      )}
      {showKoiSummary && (
        <Card className="p-4 border-cyan-500/20 bg-cyan-500/5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Fish size={16} className="text-cyan-400" />Koi Summary</h3>
            <div className="flex gap-3">
              {can("koifish") && sectionLink("koifish", "Farm stock →")}
              {can("customerkoi") && sectionLink("customerkoi", "Customer koi →")}
            </div>
          </div>
          <div className={`grid gap-3 ${(can("koifish") && can("customerkoi")) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
            {can("koifish") && (
              <button type="button" onClick={() => go("koifish")} className="bg-slate-900/50 rounded-xl p-4 text-center hover:bg-slate-800/80 transition-colors touch-manipulation">
                <p className="text-2xl font-black text-emerald-400">{koiAvailable}</p>
                <p className="text-slate-400 text-xs mt-1">Available</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Farm stock</p>
              </button>
            )}
            {can("koifish") && (
              <button type="button" onClick={() => go("koifish")} className="bg-slate-900/50 rounded-xl p-4 text-center hover:bg-slate-800/80 transition-colors touch-manipulation">
                <p className="text-2xl font-black text-blue-400">{koiSold}</p>
                <p className="text-slate-400 text-xs mt-1">Sold</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Farm stock</p>
              </button>
            )}
            {can("customerkoi") && (
              <button type="button" onClick={() => go("customerkoi")} className="bg-slate-900/50 rounded-xl p-4 text-center hover:bg-slate-800/80 transition-colors touch-manipulation">
                <p className="text-2xl font-black text-cyan-400">{koiInPond}</p>
                <p className="text-slate-400 text-xs mt-1">In Pond</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Customer koi</p>
              </button>
            )}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {can("invoices") && (
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-4 gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><FileText size={16} className="text-cyan-400" />Recent Invoices</h3>
              {sectionLink("invoices", "View all →")}
            </div>
            <div className="space-y-2">
              {recentInvoices.length === 0 ? (
                <EmptyState emoji="🧾" title="No invoices yet" hint="Create your first invoice" className="py-8" />
              ) : recentInvoices.map((inv) => (
                <button key={inv.id} type="button" onClick={() => openInvoice(inv.id)} className="w-full flex items-center justify-between text-sm py-1.5 border-b border-slate-700/40 last:border-0 hover:bg-slate-700/20 rounded-lg px-1 -mx-1 touch-manipulation text-left">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{inv.customerName}</p>
                    <p className="text-slate-500 text-xs font-mono">{inv.id} · {inv.date || "—"}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3 space-y-1">
                    <p className="text-emerald-400 font-bold">{formatSGD(dashboardInvoiceTotal(inv))}</p>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge className={statusColor[getInvoiceStatus(inv)]}>{getInvoiceStatus(inv)}</Badge>
                      <BookedBadge booked={inv.booked} bookedBy={inv.bookedBy} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}
        <div className="space-y-4">
          {can("inventory") && lowStock.length > 0 && (
            <Card className="p-4 border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2"><AlertTriangle size={14} />Low Stock ({lowStock.length})</h3>
                {sectionLink("inventory", "Inventory →")}
              </div>
              {lowStock.slice(0, 4).map((p) => (
                <div key={p.id} className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 truncate">{p.name}</span>
                  <span className="text-amber-400 font-bold ml-2">{p.stock} {p.unit}</span>
                </div>
              ))}
            </Card>
          )}
          {can("calendar") && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Calendar size={14} className="text-cyan-400" />Today&apos;s Schedule</h3>
                {sectionLink("calendar", "Calendar →")}
              </div>
              {todayEvents.length === 0 ? <p className="text-slate-500 text-xs">No events today</p> : todayEvents.map((e) => (
                <div key={e.id} className={`text-xs p-2 rounded-lg border mb-2 ${eventTypeColor[e.type] || eventTypeColor.other}`}>
                  <p className="font-semibold">{e.time || "—"} — {e.title}</p>
                </div>
              ))}
            </Card>
          )}
          {can("deliveries") && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Truck size={14} className="text-cyan-400" />Deliveries</h3>
                {sectionLink("deliveries", "View all →")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <span className="text-blue-300 text-lg font-black">{scheduledDeliveries}</span>
                  </div>
                  <div><p className="text-white font-bold text-sm">Scheduled</p><p className="text-slate-400 text-xs">Upcoming</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                    <span className="text-cyan-300 text-lg font-black">{todayDeliveries}</span>
                  </div>
                  <div><p className="text-white font-bold text-sm">Today</p><p className="text-slate-400 text-xs">On schedule</p></div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
      {can("customers") && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><Users size={14} className="text-cyan-400" />Top Customers</h3>
            {sectionLink("customers", "View all →")}
          </div>
          {recentCustomers.length === 0 ? (
            <p className="text-slate-500 text-sm">No customers yet</p>
          ) : (
            <>
              <div className="block md:hidden space-y-2">
                {recentCustomers.map((c) => (
                  <button key={c.id} type="button" onClick={() => go("customers")} className="w-full text-left bg-slate-800 rounded-lg p-3 border border-slate-700 touch-manipulation">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-white truncate">{c.name}</span>
                      <span className="text-emerald-400 font-bold shrink-0">{formatSGD(c.dashboardSpent)}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1">{c.area || "—"} · {c.tier || "Bronze"}</p>
                  </button>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead><tr className="text-slate-500 text-xs border-b border-slate-700">
                    <th className="text-left pb-2">Name</th><th className="text-left pb-2">Area</th><th className="text-left pb-2">Fish</th><th className="text-left pb-2">Tier</th><th className="text-right pb-2">Total Spent</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {recentCustomers.map((c) => (
                      <tr key={c.id} className="text-slate-300">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2 text-slate-400">{c.area || "—"}</td>
                        <td className="py-2"><div className="flex flex-wrap gap-1">{(c.fishTypes || []).slice(0, 2).map((f) => <Badge key={f} className="bg-slate-700 text-slate-300">{f}</Badge>)}</div></td>
                        <td className="py-2"><span className={`font-bold ${tierColor[c.tier] || "text-slate-300"}`}>{c.tier || "—"}</span></td>
                        <td className="py-2 text-right font-bold text-emerald-400">{formatSGD(c.dashboardSpent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// INVENTORY / PRODUCTS MODULE
// ─────────────────────────────────────────────
const EMPTY_PRODUCT_FORM = { name: "", category: "Fish Food", sku: "", price: "", unit: "kg", stock: "", minStock: "", description: "", trackStock: true };

function InventoryModule({ products, setProducts, stockLog, setStockLog, invoices = [], addNotification, currentUser, onProductsSaved, onInventorySaved, onAdjustStockCloud }) {
  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);
  const [tab, setTab] = useState("stock");
  const [showAdd, setShowAdd] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const addingProductRef = useRef(false);
  const [addCatalogOnly, setAddCatalogOnly] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const savingProductRef = useRef(false);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
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

  const visibleStockLog = useMemo(
    () => sortStockLog(stockLog.filter((l) => showOlderStockLog || isAppVisibleStockLog(l))),
    [stockLog, showOlderStockLog],
  );
  const hiddenStockLogCount = stockLog.filter((l) => !isAppVisibleStockLog(l)).length;

  const stockItems = useMemo(() => stockProducts(products), [products]);
  const catalogItems = useMemo(() => priceListProducts(products), [products]);
  const tabProducts = tab === "pricelist" ? catalogItems : stockItems;

  const searchLower = search.toLowerCase();
  const filtered = tabProducts.filter((p) =>
    (catFilter === "All" || p.category === catFilter) &&
    (
      (p.name || "").toLowerCase().includes(searchLower)
      || (p.sku || "").toLowerCase().includes(searchLower)
      || (p.description || "").toLowerCase().includes(searchLower)
    )
  );
  const productPage = usePagination(filtered, LIST_PAGE_SIZE, `${tab}-${search}-${catFilter}`);
  const stockLogPage = usePagination(visibleStockLog, LIST_PAGE_SIZE, String(showOlderStockLog));

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
    const catalogOnly = addCatalogOnly || form.trackStock === false;
    const check = validateProductFields(form, { catalogOnly });
    if (!check.ok) {
      addNotification({ type: "error", title: "Invalid Product", message: check.message });
      return;
    }

    addingProductRef.current = true;
    setAddingProduct(true);
    try {
      const normalized = normalizeProductRecord(form, { catalogOnly });
      const p = touchUpdatedAt({ ...form, ...normalized, id: genStockLogId() });
      const productsSnapshot = products;
      const stockSnapshot = stockLog;
      const nextProducts = [...productsSnapshot, p];
      let nextStockLog = stockSnapshot;
      if (!catalogOnly && p.stock > 0) {
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
        title: catalogOnly ? "Price List Item Added" : "Product Added",
        message: `${p.name} ${catalogOnly ? "added to invoice price list" : "added to inventory"}`,
      });
      setShowAdd(false);
      setAddCatalogOnly(false);
      setForm(EMPTY_PRODUCT_FORM);
    } finally {
      addingProductRef.current = false;
      setAddingProduct(false);
    }
  };

  const openAddProduct = (catalogOnly = false) => {
    setAddCatalogOnly(catalogOnly);
    setForm(catalogOnly
      ? { ...EMPTY_PRODUCT_FORM, trackStock: false, stock: 0, minStock: 0, unit: "bag" }
      : EMPTY_PRODUCT_FORM);
    setShowAdd(true);
  };

  const saveEditProduct = async () => {
    if (!editProduct || savingProductRef.current || savingProduct) return;
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const current = products.find((p) => sameProductId(p.id, editProduct.id));
    const catalogOnly = editProduct.trackStock === false;
    const check = validateProductFields(editProduct, { catalogOnly });
    if (!check.ok) {
      addNotification({ type: "error", title: "Invalid Product", message: check.message });
      return;
    }
    savingProductRef.current = true;
    setSavingProduct(true);
    const normalized = normalizeProductRecord(editProduct, { catalogOnly });
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
    if (!deleteProduct || deletingProduct) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    if (isProductOnActiveInvoice(deleteProduct.id, invoices)) {
      addNotification({
        type: "error",
        title: "Cannot Delete",
        message: `${deleteProduct.name} is on an active invoice. Cancel or edit that invoice first.`,
      });
      setDeleteProduct(null);
      return;
    }
    const snapshot = products;
    const id = deleteProduct.id;
    const name = deleteProduct.name;
    const nextProducts = snapshot.filter((p) => !sameProductId(p.id, id));
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
      <Fab onClick={() => openAddProduct(tab === "pricelist")} label={tab === "pricelist" ? "Add Price Item" : "Add Product"} hidden={!canEdit || showAdd || !!editProduct || !!deleteProduct || !!showUse || !!showRestock || !!showAdjust} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Stock Products", value: stockItems.length, icon: Boxes, color: "text-cyan-400" },
          { label: "Price List Items", value: catalogItems.length, icon: FileText, color: "text-violet-400" },
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
          { id: "pricelist", label: "📋 Price List" },
          { id: "log", label: "📜 Activity Log" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-all ${tab === t.id ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "stock" || tab === "pricelist") && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-3 sm:py-2 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            </div>
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
                  title={tabProducts.length === 0
                    ? (tab === "pricelist" ? "No price list items yet" : "No products yet")
                    : "No products match your filters"}
                  hint={tabProducts.length === 0 ? (tab === "pricelist" ? "Tap Add Price Item to get started" : "Tap Add Product to get started") : "Try a different search or category"}
                  actionLabel={tabProducts.length === 0 && canEdit ? (tab === "pricelist" ? "Add Price Item" : "Add Product") : undefined}
                  onAction={tabProducts.length === 0 && canEdit ? () => openAddProduct(tab === "pricelist") : undefined}
                />
              </Card>
            ) : productPage.paginatedItems.map((p) => {
              const isCatalog = !isStockTracked(p);
              const isLow = !isCatalog && p.minStock > 0 && p.stock <= p.minStock;
              return (
                <Card key={p.id} className={`p-4 ${isLow ? "border-amber-500/30 bg-amber-500/5" : isCatalog ? "border-violet-500/20" : ""}`}>
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm">{p.name}</p>
                      <p className="text-slate-500 text-xs">{p.sku || "—"} · {p.category || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isCatalog && <Badge className="bg-violet-500/20 text-violet-300">Invoice only</Badge>}
                      {isLow && <Badge className="bg-amber-500/20 text-amber-300">Low Stock</Badge>}
                      {canEdit && <Btn variant="ghost" size="sm" onClick={() => setEditProduct({ ...p })} title="Edit"><Edit2 size={12} /></Btn>}
                      {canDelete && <Btn variant="danger" size="sm" onClick={() => setDeleteProduct(p)} title="Delete"><Trash2 size={12} /></Btn>}
                    </div>
                  </div>
                  <div className={`grid gap-2 mb-4 text-center ${isCatalog ? "grid-cols-1" : "grid-cols-2"}`}>
                    {!isCatalog && (
                      <div className="bg-slate-900/50 rounded-lg p-2">
                        <p className={`text-lg font-black ${isLow ? "text-amber-400" : "text-white"}`}>{p.stock}</p>
                        <p className="text-slate-500 text-xs">In stock ({p.unit})</p>
                      </div>
                    )}
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className="text-lg font-black text-cyan-400">{formatSGD(p.price)}</p>
                      <p className="text-slate-500 text-xs">{isCatalog ? "Invoice price" : "Selling price"}</p>
                    </div>
                  </div>
                  {!isCatalog && p.minStock > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Stock Level</span><span>Min: {p.minStock}</span></div>
                      <div className="h-1.5 bg-slate-700 rounded-full"><div className={`h-full rounded-full ${isLow ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min((p.stock / (p.minStock * 3)) * 100, 100)}%` }} /></div>
                    </div>
                  )}
                  {!isCatalog && (
                    <div className="flex gap-2 flex-wrap">
                      <Btn variant="secondary" size="sm" onClick={() => { setShowUse(p); setUseQty(1); setUseNote(""); }} disabled={!canEdit}><Archive size={12} />Use</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setShowRestock(p); setRestockQty(1); setRestockNote(""); }} disabled={!canEdit}><Plus size={12} />Restock</Btn>
                    </div>
                  )}
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
      <Modal open={showAdd} onClose={() => { if (!addingProduct) { setShowAdd(false); setAddCatalogOnly(false); } }} title={addCatalogOnly ? "Add Price List Item" : "Add New Product"} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {addCatalogOnly && (
            <p className="sm:col-span-2 text-violet-300 text-xs bg-violet-500/10 border border-violet-500/30 rounded-lg p-2">
              Invoice price list only — not tracked in stock. Use on invoices without deducting inventory.
            </p>
          )}
          <Input label="Product Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="sm:col-span-2" />
          <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={PRODUCT_CATEGORIES} />
          <Input label="SKU" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="FF001" />
          <Input label="Selling Price (S$)" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step="0.01" required />
          {!addCatalogOnly && (
            <>
              <Input label="Current Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
              <Input label="Min Stock Alert" type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
            </>
          )}
          <Input label="Unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="bag / bottle / pcs" />
          <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="sm:col-span-2" />
        </div>
        <div className="modal-actions">
          <Btn variant="secondary" onClick={() => { if (!addingProduct) { setShowAdd(false); setAddCatalogOnly(false); } }} disabled={addingProduct}>Cancel</Btn>
          <Btn onClick={addProduct} disabled={addingProduct}>
            {addingProduct
              ? <><Loader2 size={14} className="animate-spin" />Saving...</>
              : <><Plus size={14} />{addCatalogOnly ? "Add to Price List" : "Add Product"}</>}
          </Btn>
        </div>
      </Modal>

      {/* Edit Product Modal */}
      <Modal open={!!editProduct} onClose={() => { if (!savingProduct) setEditProduct(null); }} title={editProduct?.trackStock === false ? "Edit Price List Item" : "Edit Product"} size="lg">
        {editProduct && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Product Name" value={editProduct.name} onChange={e => setEditProduct(p => ({ ...p, name: e.target.value }))} required className="sm:col-span-2" />
              <Select label="Category" value={editProduct.category} onChange={e => setEditProduct(p => ({ ...p, category: e.target.value }))} options={PRODUCT_CATEGORIES} />
              <Input label="SKU" value={editProduct.sku} onChange={e => setEditProduct(p => ({ ...p, sku: e.target.value }))} placeholder="FF001" />
              <Input label="Selling Price (S$)" type="number" value={editProduct.price} onChange={e => setEditProduct(p => ({ ...p, price: e.target.value }))} step="0.01" required />
              {editProduct.trackStock !== false && (
                <>
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
                </>
              )}
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
        onClose={() => setDeleteProduct(null)}
        title="Delete Product"
        size="sm"
        footer={deleteProduct && (
          <ConfirmModalFooter onCancel={() => { if (!deletingProduct) setDeleteProduct(null); }} cancelDisabled={deletingProduct}>
            <Btn variant="danger" onClick={confirmDeleteProduct} disabled={deletingProduct} className="w-full sm:w-auto justify-center">
              {deletingProduct ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteProduct && (
          <p className="text-slate-300 text-sm">
            Remove <strong className="text-white">{deleteProduct.name}</strong> from inventory?
            Activity log history for this product will be kept.
          </p>
        )}
      </Modal>

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
              {usingStock ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Archive size={14} />Confirm Use</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-400 text-sm mb-4">Available: <span className="text-white font-bold">{showUse?.stock} {showUse?.unit}</span></p>
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
              {restocking ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Plus size={14} />Confirm Restock</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-400 text-sm mb-4">Current stock: <span className="text-white font-bold">{showRestock?.stock} {showRestock?.unit}</span></p>
        <Input label="Quantity to Add" type="number" value={restockQty} onChange={(e) => setRestockQty(parseStockQty(e.target.value) || "")} min="1" className="mb-3" />
        <Input label="Invoice No. (optional)" value={restockNote} onChange={(e) => setRestockNote(e.target.value)} placeholder="INV20260615-01" />
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// INVOICE MODULE
// ─────────────────────────────────────────────
function InvoiceModule({
  invoices, setInvoices, setProducts, setStockLog, stockLog = [], customers, products,
  koiFishList, setKoiFishList, onKoiSold, setCustomerKoiList, customerKoiList = [],
  addNotification, currentUser, openDraft, onDraftApplied, openViewId, onViewOpened,
  onMarkInvoicePaid, onCancelInvoiceCloud, onCreateInvoiceCloud, onPatchInvoiceCloud, onInventorySideEffect,
  onSyncKoiFishToCloud, onSyncInventoryToCloud, onSyncCustomerKoiToCloud, onRefreshFromCloud, onBookedChange,
  draftSignal = 0,
}) {
  const emptyItem = useCallback(() => ({ name: "", qty: 1, price: "", productId: "", manual: true }), []);
  const buildFormFromDraft = useCallback((draft) => ({
    customerId: draft.customerId || "",
    customerName: draft.customerName || "",
    manualCustomer: !!draft.manualCustomer,
    items: draft.items?.length ? draft.items : [emptyItem()],
    notes: draft.notes || "",
    due: draft.due || today(),
    discountType: draft.discountType || "none",
    discountValue: draft.discountValue || "",
    shipping: draft.shipping ?? "",
    tax: draft.tax ?? "",
  }), [emptyItem]);
  const emptyForm = useCallback(() => ({
    customerId: "", customerName: "", manualCustomer: false, items: [emptyItem()], notes: "", due: today(),
    discountType: "none", discountValue: "", shipping: "", tax: "",
  }), [emptyItem]);

  const [showNew, setShowNew] = useState(!!openDraft);
  const [viewInv, setViewInv] = useState(null);
  const [filter, setFilter] = useState("all");
  const [bookedFilter, setBookedFilter] = useState("all");
  const [showOlderInvoices, setShowOlderInvoices] = useState(false);
  const [bookedConfirm, setBookedConfirm] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [savingInvoiceFeesId, setSavingInvoiceFeesId] = useState(null);
  const [highlightInvId, setHighlightInvId] = useState(null);
  const [blockViewDismiss, setBlockViewDismiss] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [showWhatsappInput, setShowWhatsappInput] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [shippingDraft, setShippingDraft] = useState("");
  const [taxDraft, setTaxDraft] = useState("");
  const [form, setForm] = useState(() => (openDraft ? buildFormFromDraft(openDraft) : emptyForm()));
  const openedFromNavRef = useRef(null);
  const creatingInvoiceRef = useRef(false);

  const resetFeeDrafts = useCallback((inv) => {
    const savedShipping = Number(inv?.shipping) || 0;
    setShippingDraft(savedShipping > 0 ? String(savedShipping) : "");
    const savedTax = Number(inv?.tax) || 0;
    setTaxDraft(savedTax > 0 ? String(savedTax) : "");
  }, []);

  const openViewInvoiceRef = useRef(null);

  useEffect(() => {
    if (!openDraft || !draftSignal) return;
    queueMicrotask(() => {
      setForm(buildFormFromDraft(openDraft));
      setShowNew(true);
      setFormError("");
      onDraftApplied?.();
    });
  }, [draftSignal, openDraft, onDraftApplied, buildFormFromDraft]);

  useEffect(() => {
    if (!openViewId) {
      openedFromNavRef.current = null;
      return;
    }
    if (openedFromNavRef.current === openViewId) return;
    const inv = invoices.find((i) => String(i.id) === String(openViewId));
    if (!inv) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || openedFromNavRef.current === openViewId) return;
      openedFromNavRef.current = openViewId;
      openViewInvoiceRef.current?.(inv);
      setHighlightInvId(inv.id);
      setShowNew(false);
      setFormError("");
      onViewOpened?.();
    });
    return () => { cancelled = true; };
  }, [openViewId, invoices, onViewOpened]);

  const refundInvoiceCount = useMemo(
    () => invoices.filter((i) => isAppVisibleInvoice(i) && isRefundCreditNoteInvoice(i)).length,
    [invoices],
  );

  const filtered = useMemo(() => sortInvoices(invoices.filter((i) => {
    if (!showOlderInvoices && !isAppVisibleInvoice(i)) return false;
    if (filter === "refunds") {
      if (!isRefundCreditNoteInvoice(i)) return false;
    } else if (filter !== "all" && getInvoiceStatus(i) !== filter) return false;
    if (bookedFilter === "booked" && !i.booked) return false;
    if (bookedFilter === "unbooked" && i.booked) return false;
    return true;
  })), [invoices, showOlderInvoices, filter, bookedFilter]);
  const hiddenInvoiceCount = invoices.filter((i) => !isAppVisibleInvoice(i)).length;
  const unbookedInvoiceCount = invoices.filter((i) => !i.booked && getInvoiceStatus(i) !== "cancelled").length;
  const invoicePage = usePagination(filtered, LIST_PAGE_SIZE, `${filter}-${bookedFilter}-${showOlderInvoices}`);
  const activeViewInv = useMemo(() => {
    if (!viewInv) return null;
    return invoices.find((i) => String(i.id) === String(viewInv.id)) || viewInv;
  }, [viewInv, invoices]);

  useEffect(() => {
    if (!highlightInvId) return undefined;
    const timer = setTimeout(() => setHighlightInvId(null), 4000);
    const el = document.querySelector(`[data-invoice-id="${CSS.escape(highlightInvId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return () => clearTimeout(timer);
  }, [highlightInvId]);

  const closeCancelConfirm = () => {
    setBlockViewDismiss(true);
    setCancelConfirm(null);
    setTimeout(() => setBlockViewDismiss(false), 400);
  };

  const canCancelInvoice = (inv) => ["pending", "overdue"].includes(getInvoiceStatus(inv));
  const canMarkPaid = (inv) => ["pending", "overdue"].includes(getInvoiceStatus(inv));
  const canRecordPayment = (inv) => canMarkPaid(inv) && canEditRecords(currentUser);

  const invoiceForDisplay = (inv) => enrichInvoiceCustomer(
    { ...inv, status: getInvoiceStatus(inv) },
    customers,
  );

  const invoiceWithDraftShipping = (inv) => {
    if (!inv || !activeViewInv || String(activeViewInv.id) !== String(inv.id)) return inv;
    if (!["pending", "overdue"].includes(getInvoiceStatus(inv)) || !canEditRecords(currentUser)) return inv;
    const draftShipping = shippingDraft === "" ? 0 : (+shippingDraft || 0);
    return { ...activeViewInv, shipping: draftShipping };
  };

  const persistShippingDraftIfDirty = async (inv) => {
    if (!inv) return;
    const savedShipping = Number(inv.shipping) || 0;
    const draftShipping = shippingDraft === "" ? 0 : (+shippingDraft || 0);
    if (savedShipping === draftShipping) return;
    await commitInvoiceShipping(inv, shippingDraft, { silent: true });
  };

  const invoiceWithDraftFees = (inv) => {
    if (!inv || !activeViewInv || String(activeViewInv.id) !== String(inv.id)) return inv;
    if (!["pending", "overdue"].includes(getInvoiceStatus(inv)) || !canEditRecords(currentUser)) return inv;
    const draftShipping = shippingDraft === "" ? 0 : (+shippingDraft || 0);
    const draftTax = taxDraft === "" ? 0 : (+taxDraft || 0);
    return { ...activeViewInv, shipping: draftShipping, tax: draftTax };
  };

  const invoiceForPdfExport = (inv) => invoiceForDisplay(invoiceWithDraftFees(inv));

  const requestInvoiceBookedChange = (id) => {
    if (!canMarkAccounting(currentUser)) {
      addNotification({ type: "error", title: "Permission Denied", message: "Accounting marks permission is required." });
      return;
    }
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    setBookedConfirm({ id, label: inv.id, currentlyBooked: !!inv.booked });
  };

  const applyInvoiceBookedConfirm = async () => {
    if (!bookedConfirm) return;
    const { id, currentlyBooked } = bookedConfirm;
    const inv = invoices.find((i) => String(i.id) === String(id));
    setBookedConfirm(null);
    if (!inv || !onBookedChange) return;
    try {
      await onBookedChange(inv, { booked: !currentlyBooked, bookedBy: currentUser.name });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Accounts Mark Not Saved",
        message: err?.message || "Could not sync accounts mark to cloud. Try again.",
      });
    }
  };

  const patchInvoice = (id, patch) => {
    const normalized = { ...patch };
    if ("customerId" in normalized) {
      normalized.customerId = normalized.customerId == null || normalized.customerId === "" ? null : normalized.customerId;
    }
    const apply = (i) => {
      if (i.id !== id) return i;
      const needsAmountRecalc = "discountType" in normalized || "discountValue" in normalized || "shipping" in normalized || "tax" in normalized;
      const base = needsAmountRecalc ? invoiceWithDraftFees(i) : i;
      let merged = touchUpdatedAt(db.sanitizeInvoiceForSync({ ...base, ...normalized }));
      if (needsAmountRecalc) {
        merged = { ...merged, total: calcInvoiceAmounts(merged).total };
      }
      return merged;
    };
    setInvoices((prev) => sortInvoices(prev.map(apply)));
    setViewInv((prev) => (prev?.id === id ? apply(prev) : prev));
  };

  const applyInvoiceDiscount = async (inv, discountType, discountValueRaw) => {
    if (!canEditRecords(currentUser)) {
      notifyPermissionDenied(addNotification, "edit");
      return false;
    }
    if (discountType === "percent" && (+discountValueRaw <= 0 || +discountValueRaw > 100)) {
      addNotification({ type: "error", title: "Invalid Discount", message: "Percentage must be between 1 and 100." });
      return false;
    }
    if (discountType === "fixed" && +discountValueRaw <= 0) {
      addNotification({ type: "error", title: "Invalid Discount", message: "Enter a discount amount greater than zero." });
      return false;
    }
    const discountValue = discountType === "none" ? 0 : +discountValueRaw || 0;
    const latest = invoices.find((i) => String(i.id) === String(inv.id)) || inv;
    const base = invoiceWithDraftFees(latest);
    const merged = touchUpdatedAt(db.sanitizeInvoiceForSync({
      ...base,
      discountType,
      discountValue,
      total: calcInvoiceAmounts({ ...base, discountType, discountValue }).total,
    }));
    setSavingInvoiceFeesId(inv.id);
    try {
      const saved = await onPatchInvoiceCloud?.(merged);
      if (saved) setViewInv((prev) => (prev?.id === inv.id ? saved : prev));
      addNotification({
        type: "success",
        title: "Discount Updated",
        message: `Total is now ${formatSGD((saved || merged).total)}`,
      });
      return true;
    } catch (err) {
      addNotification({
        type: "error",
        title: "Discount Not Saved",
        message: err?.message || "Could not save discount to cloud. Try again.",
      });
      return false;
    } finally {
      setSavingInvoiceFeesId(null);
    }
  };

  const commitInvoiceShipping = async (inv, shippingRaw, { silent = false } = {}) => {
    if (!inv) return inv;
    if (!canEditRecords(currentUser)) {
      if (!silent) notifyPermissionDenied(addNotification, "edit");
      return inv;
    }
    const shipping = shippingRaw === "" || shippingRaw == null ? 0 : +shippingRaw || 0;
    if (shipping < 0) {
      if (!silent) {
        addNotification({ type: "error", title: "Invalid Shipping", message: "Shipping fee cannot be negative." });
      }
      return inv;
    }
    const latest = invoices.find((i) => String(i.id) === String(inv.id)) || inv;
    const prevShipping = Number(latest.shipping) || 0;
    if (prevShipping === shipping) {
      setShippingDraft(shipping > 0 ? String(shipping) : "");
      return latest;
    }
    const merged = touchUpdatedAt(db.sanitizeInvoiceForSync({
      ...latest,
      shipping,
      total: calcInvoiceAmounts({ ...latest, shipping }).total,
    }));
    if (!silent) setSavingInvoiceFeesId(inv.id);
    try {
      const saved = await onPatchInvoiceCloud?.(merged);
      const row = saved || merged;
      setShippingDraft(shipping > 0 ? String(shipping) : "");
      if (saved) setViewInv((prev) => (prev?.id === inv.id ? saved : prev));
      if (!silent) {
        addNotification({ type: "success", title: "Shipping Updated", message: `Total is now ${formatSGD(row.total)}` });
      }
      return row;
    } catch (err) {
      if (!silent) {
        addNotification({
          type: "error",
          title: "Shipping Not Saved",
          message: err?.message || "Could not save shipping to cloud. Try again.",
        });
      }
      return latest;
    } finally {
      if (!silent) setSavingInvoiceFeesId(null);
    }
  };

  const applyInvoiceShipping = async (inv, shippingRaw) => {
    if (!canEditRecords(currentUser)) {
      notifyPermissionDenied(addNotification, "edit");
      return false;
    }
    await commitInvoiceShipping(inv, shippingRaw);
    return true;
  };

  const commitInvoiceTax = async (inv, taxRaw, { silent = false } = {}) => {
    if (!inv) return inv;
    if (!canEditRecords(currentUser)) {
      if (!silent) notifyPermissionDenied(addNotification, "edit");
      return inv;
    }
    const tax = taxRaw === "" || taxRaw == null ? 0 : +taxRaw || 0;
    if (tax < 0) {
      if (!silent) {
        addNotification({ type: "error", title: "Invalid GST", message: "GST amount cannot be negative." });
      }
      return inv;
    }
    const latest = invoices.find((i) => String(i.id) === String(inv.id)) || inv;
    const prevTax = Number(latest.tax) || 0;
    if (prevTax === tax) {
      setTaxDraft(tax > 0 ? String(tax) : "");
      return latest;
    }
    const merged = touchUpdatedAt(db.sanitizeInvoiceForSync({
      ...latest,
      tax,
      total: calcInvoiceAmounts({ ...latest, tax }).total,
    }));
    if (!silent) setSavingInvoiceFeesId(inv.id);
    try {
      const saved = await onPatchInvoiceCloud?.(merged);
      const row = saved || merged;
      setTaxDraft(tax > 0 ? String(tax) : "");
      if (saved) setViewInv((prev) => (prev?.id === inv.id ? saved : prev));
      if (!silent) {
        addNotification({ type: "success", title: "GST Updated", message: `Total is now ${formatSGD(row.total)}` });
      }
      return row;
    } catch (err) {
      if (!silent) {
        addNotification({
          type: "error",
          title: "GST Not Saved",
          message: err?.message || "Could not save GST to cloud. Try again.",
        });
      }
      return latest;
    } finally {
      if (!silent) setSavingInvoiceFeesId(null);
    }
  };

  const applyInvoiceTax = async (inv, taxRaw) => {
    if (!canEditRecords(currentUser)) {
      notifyPermissionDenied(addNotification, "edit");
      return false;
    }
    await commitInvoiceTax(inv, taxRaw);
    return true;
  };

  const resolveInvForPayment = async (inv) => {
    if (!inv || !activeViewInv || String(activeViewInv.id) !== String(inv.id)) return inv;
    if (!["pending", "overdue"].includes(getInvoiceStatus(inv))) return inv;
    const withShipping = await commitInvoiceShipping(activeViewInv, shippingDraft, { silent: true });
    return commitInvoiceTax(withShipping, taxDraft, { silent: true });
  };

  const persistFeeDraftsIfDirty = async (inv, {
    shippingRaw = shippingDraft,
    taxRaw = taxDraft,
  } = {}) => {
    if (!inv || !canEditRecords(currentUser)) return inv;
    if (!["pending", "overdue"].includes(getInvoiceStatus(inv))) return inv;
    let latest = invoices.find((i) => String(i.id) === String(inv.id)) || inv;
    const draftShipping = shippingRaw === "" ? 0 : (+shippingRaw || 0);
    const prevShipping = Number(latest.shipping) || 0;
    if (draftShipping !== prevShipping) {
      latest = await commitInvoiceShipping(latest, shippingRaw, { silent: true });
    }
    const draftTax = taxRaw === "" ? 0 : (+taxRaw || 0);
    const prevTax = Number(latest.tax) || 0;
    if (draftTax !== prevTax) {
      latest = await commitInvoiceTax(latest, taxRaw, { silent: true });
    }
    return latest;
  };

  const openViewInvoice = async (inv) => {
    if (activeViewInv && String(activeViewInv.id) !== String(inv?.id)) {
      await persistFeeDraftsIfDirty(activeViewInv);
      resetFeeDrafts(inv);
    } else if (!activeViewInv) {
      resetFeeDrafts(inv);
    }
    setViewInv(inv);
  };

  const closeViewInvoice = async () => {
    if (cancelConfirm || blockViewDismiss) return;
    await persistFeeDraftsIfDirty(activeViewInv);
    setViewInv(null);
    setShowWhatsappInput(false);
    setShippingDraft("");
    setTaxDraft("");
  };

  const shippingDraftRef = useRef(shippingDraft);
  const taxDraftRef = useRef(taxDraft);
  const viewInvRef = useRef(viewInv);
  const invoicesRef = useRef(invoices);
  const persistFeeDraftsRef = useRef(persistFeeDraftsIfDirty);

  useEffect(() => {
    shippingDraftRef.current = shippingDraft;
    taxDraftRef.current = taxDraft;
    viewInvRef.current = viewInv;
    invoicesRef.current = invoices;
    persistFeeDraftsRef.current = persistFeeDraftsIfDirty;
    openViewInvoiceRef.current = openViewInvoice;
  });

  useEffect(() => () => {
    const id = viewInvRef.current?.id;
    if (!id) return;
    const inv = invoicesRef.current.find((i) => String(i.id) === String(id));
    if (inv) {
      void persistFeeDraftsRef.current(inv, {
        shippingRaw: shippingDraftRef.current,
        taxRaw: taxDraftRef.current,
      });
    }
  }, []);

  const stripBlankItems = (items) => items.filter(
    (it) => it.koiId || it.productId || (it.manual && it.name?.trim()),
  );

  const addManualItem = () => setForm(f => ({ ...f, items: [...stripBlankItems(f.items), emptyItem()] }));
  const addKoiItem = (koiId) => {
    const koi = koiFishList.find((k) => String(k.id) === String(koiId));
    if (!koi) return;
    const usedIds = form.items.filter((it) => it.koiId).map((it) => String(it.koiId));
    if (usedIds.includes(String(koiId))) {
      addNotification({ type: "warning", title: "Already Added", message: `${koi.id} is already on this invoice.` });
      return;
    }
    setForm((f) => {
      const base = stripBlankItems(f.items);
      return {
        ...f,
        items: [...base, {
          name: formatKoiInvoiceLineName(koi),
          qty: 1,
          price: koi.price,
          productId: "",
          manual: false,
          koiId: koi.id,
          koiDisposition: "taken",
          keepPondName: koi.pondName || "A1",
          koiAlreadySold: false,
        }],
      };
    });
  };
  const addProductItem = (productId) => {
    const p = products.find((x) => String(x.id) === String(productId));
    if (!p) return;
    const activeItems = stripBlankItems(form.items);
    const existingIdx = activeItems.findIndex((it) => String(it.productId) === String(productId));
    if (existingIdx >= 0) {
      const existing = activeItems[existingIdx];
      const nextQty = (+existing.qty || 0) + 1;
      if (isStockTracked(p) && nextQty > p.stock) {
        addNotification({
          type: "warning",
          title: "Insufficient Stock",
          message: `Only ${p.stock} ${p.unit || "unit"} of ${p.name} available.`,
        });
        return;
      }
      setForm((f) => {
        const items = stripBlankItems(f.items);
        const idx = items.findIndex((it) => String(it.productId) === String(productId));
        if (idx < 0) return f;
        return {
          ...f,
          items: items.map((it, i) => (i === idx ? { ...it, qty: nextQty } : it)),
        };
      });
      return;
    }
    if (isStockTracked(p) && p.stock <= 0) {
      addNotification({ type: "warning", title: "Out of Stock", message: `${p.name} has no stock left.` });
      return;
    }
    setForm(f => ({
      ...f,
      items: [...stripBlankItems(f.items), { name: p.name, qty: 1, price: p.price, productId: p.id, manual: false }],
    }));
  };
  const removeItem = (idx) => setForm(f => {
    const next = f.items.filter((_, i) => i !== idx);
    return { ...f, items: next.length ? next : [emptyItem()] };
  });
  const updateItem = (idx, field, val) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));
  const updateKoiDisposition = (idx, disposition) => setForm(f => ({
    ...f,
    items: f.items.map((it, i) => i === idx ? { ...it, koiDisposition: disposition } : it),
  }));
  const convertToManualItem = (idx) => setForm((f) => {
    const it = f.items[idx];
    const linked = it?.productId ? products.find((p) => String(p.id) === String(it.productId)) : null;
    if (linked && isStockTracked(linked)) return f;
    return {
      ...f,
      items: f.items.map((row, i) => i === idx ? { ...row, productId: "", manual: true } : row),
    };
  });

  const formAmounts = calcInvoiceAmounts({
    items: form.items.map((it) => ({ name: it.name, qty: +it.qty || 0, price: +it.price || 0 })),
    discountType: form.discountType,
    discountValue: form.discountType === "none" ? 0 : +form.discountValue || 0,
    shipping: +form.shipping || 0,
    tax: +form.tax || 0,
  });

  const createInvoice = async () => {
    if (creatingInvoiceRef.current || creatingInvoice) return;
    setFormError("");
    const activeItems = stripBlankItems(form.items);
    if (!activeItems.length) {
      setFormError("Add at least one invoice item.");
      return;
    }
    if (!form.customerName?.trim()) {
      setFormError("Please select or enter a customer name.");
      return;
    }
    if (activeItems.some((it) => it.koiId) && (form.manualCustomer || !form.customerId)) {
      setFormError("Fish stock lines require a registered customer.");
      return;
    }
    if (activeItems.some(it => !it.name?.trim() || it.price === '' || it.price == null)) {
      setFormError("Each item needs a name and price.");
      return;
    }
    if (activeItems.some((it) => !it.koiId && (+it.qty || 0) <= 0)) {
      setFormError("Each item needs quantity of at least 1.");
      return;
    }
    if (activeItems.some((it) => +it.price < 0)) {
      setFormError("Item prices cannot be negative.");
      return;
    }
    if (form.discountType === "percent" && (+form.discountValue <= 0 || +form.discountValue > 100)) {
      setFormError("Discount percentage must be between 1 and 100.");
      return;
    }
    if (form.discountType === "fixed" && +form.discountValue <= 0) {
      setFormError("Enter a discount amount greater than zero.");
      return;
    }
    if (form.shipping !== "" && +form.shipping < 0) {
      setFormError("Shipping fee cannot be negative.");
      return;
    }
    if (form.tax !== "" && +form.tax < 0) {
      setFormError("GST amount cannot be negative.");
      return;
    }
    const hasStockTrackedLines = activeItems.some((it) => {
      if (!it.productId) return false;
      const p = products.find((x) => String(x.id) === String(it.productId));
      return p && isStockTracked(p);
    });
    if (hasStockTrackedLines && !hasPermission(currentUser, "inventory")) {
      notifyPermissionDenied(addNotification, "inventory");
      setFormError("Inventory permission is required to sell stock-tracked products on an invoice.");
      return;
    }
    const customerRecord = findCustomerRecord(customers, form.customerId, form.customerName);
    const customerDetails = resolveInvoiceCustomer({ customerId: form.customerId, customerName: form.customerName }, customers);
    const discountValue = form.discountType === "none" ? 0 : +form.discountValue || 0;
    const issueDate = today();
    const dueDate = form.due?.trim() || issueDate;
    if (dueDate < issueDate) {
      setFormError("Due date cannot be before the invoice date.");
      return;
    }

    creatingInvoiceRef.current = true;
    setCreatingInvoice(true);

    let invId;
    let invoiceItems;
    let stockPreview;
    let koiSalePreview;
    const stockSideEffectMeta = { by: currentUser?.name || "Staff" };

    const productsBeforeCreate = products;
    const stockLogBeforeCreate = stockLog;
    const restoreCreateStockSnapshot = () => {
      setProducts(productsBeforeCreate);
      setStockLog(stockLogBeforeCreate);
    };

    try {
      invId = genInvoiceId(invoices, issueDate, {
        reservedIds: [...peekDeletions('invoices'), ...peekReservedInvoiceIds()],
      });
      stockSideEffectMeta.invoiceId = invId;
      invoiceItems = activeItems.map(serializeInvoiceItem);
      stockPreview = previewDeductStockForInvoice(products, stockLog, invoiceItems, stockSideEffectMeta);
      const koiValidate = validateInvoiceKoiSales({
        items: activeItems, koiList: koiFishList, customerId: form.customerId, customers,
      });
      if (!koiValidate.ok) {
        setFormError(koiValidate.message);
        addNotification({ type: "error", title: "Fish Stock", message: koiValidate.message });
        return;
      }
      if (!stockPreview.ok) {
        setFormError(stockPreview.message);
        addNotification({ type: "error", title: "Insufficient Stock", message: stockPreview.message });
        return;
      }
      koiSalePreview = previewApplyInvoiceKoiSales({
        items: activeItems,
        koiList: koiFishList,
        customerId: form.customerId,
        customers,
        soldDate: issueDate,
      });
      let koiApply;
      try {
        koiApply = await applyInvoiceKoiSales({
          items: activeItems,
          koiList: koiFishList,
          setKoiList: setKoiFishList,
          customerId: form.customerId,
          customers,
          soldDate: issueDate,
          onKoiSold,
          addNotification,
        });
      } catch (err) {
        restoreCreateStockSnapshot();
        restoreInvoiceKoiSales(invoiceItems, setKoiFishList, setCustomerKoiList);
        setFormError(err?.message || "Could not save keep-at-farm Customer Koi record.");
        addNotification({
          type: "error",
          title: "Fish Stock",
          message: err?.message || "Could not save Customer Koi record for this sale.",
        });
        return;
      }
      if (!koiApply.ok) {
        restoreCreateStockSnapshot();
        restoreInvoiceKoiSales(invoiceItems, setKoiFishList, setCustomerKoiList);
        setFormError(koiApply.message);
        addNotification({ type: "error", title: "Fish Stock", message: koiApply.message });
        return;
      }
      saveInvoicePendingCreate({ invoiceId: invId, items: invoiceItems });
      const inv = touchUpdatedAt(db.sanitizeInvoiceForSync({
        id: invId,
        customerId: form.manualCustomer || !form.customerId ? null : form.customerId,
        customerName: form.customerName,
        customerWhatsapp: customerDetails.phone,
        customerPhone: customerDetails.phone,
        customerAddress: customerDetails.address || formatCustomerAddress(customerRecord),
        items: invoiceItems,
        discountType: form.discountType,
        discountValue,
        shipping: +form.shipping || 0,
        tax: +form.tax || 0,
        total: formAmounts.total,
        status: "pending",
        date: issueDate,
        due: dueDate,
        notes: form.notes,
        createdBy: currentUser.name,
        booked: false,
        bookedAt: null,
        bookedBy: "",
      }));

      await onCreateInvoiceCloud?.(inv, {
        koiFishList: koiSalePreview.hasKoiLines ? koiSalePreview.nextKoiList : undefined,
        revertKoi: koiSalePreview.hasKoiLines
          ? previewRestoreInvoiceKoiSales(invoiceItems, koiSalePreview.nextKoiList, customerKoiList)
          : undefined,
      });
      clearInvoicePendingCreate();
      setShowNew(false);
      setFormError("");
      setForm(emptyForm());
      setHighlightInvId(inv.id);
      addNotification({
        type: "success",
        title: "Invoice Created",
        message: `${inv.id} saved as pending for ${inv.customerName} — ${formatSGD(inv.total)}. Tap the row to open when ready.`,
      });
      if (!customerDetails.phone && !form.manualCustomer && form.customerId) {
        addNotification({ type: "info", title: "No WhatsApp Number", message: "Add a WhatsApp number to this customer, then use Send WhatsApp when ready." });
      }
    } catch (err) {
      if (invId) reserveInvoiceId(invId);
      if (invId && invoiceItems) {
        restoreCreateStockSnapshot();
        restoreInvoiceKoiSales(invoiceItems, setKoiFishList, setCustomerKoiList);
        if (koiSalePreview?.hasKoiLines) {
          const restored = previewRestoreInvoiceKoiSales(
            invoiceItems,
            koiSalePreview.nextKoiList,
            customerKoiList,
          );
          try {
            await onSyncKoiFishToCloud?.(restored.nextKoiList);
          } catch (syncErr) {
            addNotification({
              type: "warning",
              title: "Koi Sync Incomplete",
              message: syncErr?.message || "Local koi was restored but cloud sync may need a retry.",
            });
          }
          try {
            await onSyncCustomerKoiToCloud?.(restored.nextCustomerKoiList);
          } catch (syncErr) {
            addNotification({
              type: "warning",
              title: "Customer Koi Sync Incomplete",
              message: syncErr?.message || "Local customer koi was restored but cloud sync may need a retry.",
            });
          }
        }
        setInvoices((prev) => prev.filter((i) => String(i.id) !== String(invId)));
      }
      clearInvoicePendingCreate();
      const conflictMsg = /already in use/i.test(String(err?.message || ""));
      if (conflictMsg) {
        try {
          await onRefreshFromCloud?.({ quiet: true, force: true });
        } catch (_) { /* best effort */ }
      }
      const fallback = "Could not save invoice to cloud. Check connection and try again.";
      const message = err?.message || fallback;
      setFormError(conflictMsg
        ? "That invoice number was already used. Invoices refreshed — tap Create again (a new number will be assigned)."
        : message);
      addNotification({
        type: "error",
        title: conflictMsg ? "Invoice Number Conflict" : "Invoice Not Saved",
        message: conflictMsg
          ? "That invoice number was already used. Your list is updated — tap Create again."
          : (err?.message || "Cloud save failed. Your invoice was not created."),
      });
    } finally {
      creatingInvoiceRef.current = false;
      setCreatingInvoice(false);
    }
  };

  const cancelInvoice = (id) => {
    if (cancellingId || cancelConfirm) return;
    if (!canDeleteRecords(currentUser)) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const inv = invoices.find((i) => String(i.id) === String(id));
    if (!inv || !canCancelInvoice(inv)) return;
    setCancelConfirm({ id: inv.id, customerName: inv.customerName });
  };

  const confirmCancelInvoice = async () => {
    const id = cancelConfirm?.id;
    if (!id || cancellingId) return;
    const invId = String(id);
    const inv = invoices.find((i) => String(i.id) === invId);
    if (!inv || !canCancelInvoice(inv)) {
      setCancelConfirm(null);
      return;
    }
    setCancellingId(id);

    try {
      await onCancelInvoiceCloud?.(inv);
      setCancelConfirm(null);
      setViewInv((prev) => (prev && String(prev.id) === invId ? null : prev));
      addNotification({ type: "info", title: "Invoice Cancelled", message: `${invId} has been cancelled. Inventory and fish stock restored where applicable.` });
    } catch (err) {
      setInvoices((prev) => sortInvoices(prev.map((i) => (String(i.id) === invId ? inv : i))));
      addNotification({
        type: "error",
        title: "Cancel Failed",
        message: err?.message || `${invId} could not be cancelled on cloud. Try again.`,
      });
    } finally {
      setCancellingId(null);
    }
  };

  const markPaid = async (id) => {
    if (markingPaidId) return;
    if (!canEditRecords(currentUser)) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const invId = String(id);
    const inv = await resolveInvForPayment(invoices.find((i) => String(i.id) === invId));
    if (!inv) return;
    if (getInvoiceStatus(inv) === "paid") return;
    if (!canMarkPaid(inv)) {
      addNotification({ type: "warning", title: "Cannot Mark Paid", message: `${invId} is ${getInvoiceStatus(inv)}.` });
      return;
    }
    const paidTotal = calcInvoiceAmounts(inv).total;

    setMarkingPaidId(id);

    try {
      await onMarkInvoicePaid?.(inv, paidTotal);
      const paidInv = touchUpdatedAt(db.sanitizeInvoiceForSync({ ...inv, status: "paid" }));
      setViewInv((prev) => (prev && String(prev.id) === invId ? paidInv : prev));
      addNotification({ type: "success", title: "Payment Received", message: `${invId} marked as paid - ${formatSGD(paidTotal)}` });
    } catch (err) {
      setViewInv((prev) => (prev && String(prev.id) === invId ? inv : prev));
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || `${invId} could not be saved to cloud. Try again.`,
      });
    } finally {
      setMarkingPaidId(null);
    }
  };

  const downloadPdf = async (inv) => {
    setPdfLoading(true);
    try {
      const filename = await downloadInvoicePdf(invoiceForPdfExport(inv));
      addNotification({ type: "success", title: "PDF Downloaded", message: `${filename} saved to your device.` });
    } catch (err) {
      addNotification({ type: "error", title: "PDF Failed", message: err?.message || "Could not generate PDF." });
    } finally {
      setPdfLoading(false);
    }
  };

  const persistInvoiceWhatsapp = (invId, phone) => {
    const patch = (row) => (row.id === invId ? touchUpdatedAt({ ...row, customerWhatsapp: phone, customerPhone: phone }) : row);
    setInvoices((prev) => sortInvoices(prev.map(patch)));
    setViewInv((prev) => (prev?.id === invId ? patch(prev) : prev));
  };

  const sendWhatsApp = (inv, phoneOverride) => {
    const phone = phoneOverride || resolveInvoiceWhatsApp(inv, customers);
    if (!phone?.trim()) {
      setShowWhatsappInput(true);
      setWhatsappDraft("");
      return;
    }
    setShowWhatsappInput(false);
    try {
      openWhatsAppChat(phone);
      persistInvoiceWhatsapp(inv.id, phone);
      addNotification({ type: "success", title: "WhatsApp Opened", message: `Chat opened for ${inv.customerName}. Send your message and invoice from there.` });
    } catch (err) {
      addNotification({ type: "error", title: "WhatsApp Failed", message: err?.message || "Could not open WhatsApp." });
    }
  };

  const submitWhatsappDraft = () => {
    if (!viewInv) return;
    if (!whatsappDraft.trim()) {
      addNotification({ type: "error", title: "WhatsApp Required", message: "Enter a WhatsApp number (e.g. +65 9123 4567)." });
      return;
    }
    sendWhatsApp(viewInv, whatsappDraft.trim());
  };

  const exportInvoicesCsv = () => {
    const visible = invoices.filter(isAppVisibleInvoice);
    const base = backupBaseName();
    downloadFile(invoicesToCsv(visible), `${base}-invoices.csv`, "text/csv");
    addNotification({
      type: "success",
      title: "Invoices exported",
      message: `${visible.length} visible invoice(s) saved as CSV (older hidden records excluded).`,
    });
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Invoices</h2>
          <p className="text-slate-400 text-sm">Record invoices — mark when entered in your accounting app</p>
          {unbookedInvoiceCount > 0 && (
            <p className="text-amber-400/90 text-xs mt-1">{unbookedInvoiceCount} not yet entered in accounts</p>
          )}
        </div>
        <Btn variant="secondary" size="sm" onClick={exportInvoicesCsv} className="shrink-0 justify-center">
          <Download size={14} /> Export CSV
        </Btn>
      </div>
      <Fab onClick={() => setShowNew(true)} label="New Invoice" hidden={showNew || !!viewInv} />

      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          {["all", "pending", "paid", "overdue"].map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 touch-manipulation ${filter === s ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{s}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setFilter("refunds")}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 touch-manipulation inline-flex items-center gap-1.5 ${filter === "refunds" ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            Refunds
            {refundInvoiceCount > 0 && (
              <span className={`min-w-[1.25rem] px-1 py-0.5 rounded-full text-[10px] font-black leading-none ${filter === "refunds" ? "bg-slate-900 text-amber-300" : "bg-amber-500/20 text-amber-300"}`}>
                {refundInvoiceCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("cancelled")}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 touch-manipulation ${filter === "cancelled" ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            Cancelled
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {[
          { id: "all", label: "All records" },
          { id: "unbooked", label: "Pending accounts" },
          { id: "booked", label: "In accounts" },
        ].map((s) => (
          <button key={s.id} onClick={() => setBookedFilter(s.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 touch-manipulation ${bookedFilter === s.id ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{s.label}</button>
        ))}
      </div>
      {hiddenInvoiceCount > 0 && (
        <button
          type="button"
          onClick={() => setShowOlderInvoices((v) => !v)}
          className="text-xs text-slate-500 hover:text-cyan-400 touch-manipulation"
        >
          {showOlderInvoices ? "Hide older invoices" : `Show ${hiddenInvoiceCount} older invoice${hiddenInvoiceCount === 1 ? "" : "s"} (2+ years)`}
        </button>
      )}

      <div className="lg:hidden space-y-3 pb-28 min-w-0">
        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🧾"
              title={
                invoices.length === 0
                  ? "No invoices yet"
                  : filter === "refunds"
                    ? "No refunds yet"
                    : "No invoices match your filters"
              }
              hint={
                invoices.length === 0
                  ? "Tap New Invoice to create one"
                  : filter === "refunds"
                    ? "Paid invoices voided via Koi refund appear here as credit notes."
                    : "Try a different status filter"
              }
            />
          </Card>
        ) : invoicePage.paginatedItems.map(inv => {
          const invAmounts = calcInvoiceAmounts(invoiceWithDraftFees(inv));
          const status = getInvoiceStatus(inv);
          const isMarking = markingPaidId === inv.id;
          return (
          <Card key={inv.id} data-invoice-id={inv.id} className={`p-4 overflow-hidden max-w-full min-w-0 ${highlightInvId === inv.id ? "ring-2 ring-cyan-400/80 border-cyan-500/40" : ""}`}>
            <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-cyan-400 font-bold text-xs">{inv.id}</p>
                <p className="text-white font-bold truncate">{inv.customerName}</p>
                <p className="text-slate-500 text-xs mt-0.5">{inv.date}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 max-w-[45%]">
                <Badge className={isRefundCreditNoteInvoice(inv) ? "bg-amber-500/20 text-amber-300" : statusColor[status]}>
                  {isRefundCreditNoteInvoice(inv) ? "refund" : status}
                </Badge>
                <BookedBadge booked={inv.booked} bookedBy={inv.bookedBy} />
              </div>
            </div>
            <div className="mb-3">
              <p className="text-2xl font-black text-white">{formatSGD(invAmounts.total)}</p>
              {invAmounts.discountAmount > 0 && (
                <p className="text-xs text-emerald-400">-{formatSGD(invAmounts.discountAmount)} discount</p>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 max-w-full">
              <Btn variant="secondary" size="sm" onClick={() => openViewInvoice(inv)} className="col-span-2 justify-center min-w-0">
                <Eye size={14} />View
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => { openViewInvoice(inv); sendWhatsApp(inv); }} disabled={pdfLoading} className="justify-center min-w-0" ariaLabel="Send WhatsApp">
                <MessageSquare size={14} />
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => downloadPdf(inv)} disabled={pdfLoading} className="justify-center min-w-0" ariaLabel="Download PDF">
                <Printer size={14} />
              </Btn>
              {canMarkAccounting(currentUser) && (
                <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); requestInvoiceBookedChange(inv.id); }} ariaLabel={inv.booked ? "Change accounts mark" : "Mark in accounts"} className="justify-center min-w-0">
                  <BookCheck size={14} className={inv.booked ? "text-emerald-400" : "text-slate-500"} />
                </Btn>
              )}
              {canCancelInvoice(inv) && canDeleteRecords(currentUser) && (
                <Btn variant="ghost" size="sm" onClick={() => cancelInvoice(inv.id)} title="Cancel invoice" className="justify-center min-w-0">
                  <XCircle size={14} className="text-red-400" />
                </Btn>
              )}
            </div>
            {canRecordPayment(inv) && (
              <Btn
                variant="success"
                size="sm"
                onClick={() => markPaid(inv.id)}
                disabled={!!markingPaidId && markingPaidId !== inv.id}
                className="w-full max-w-full mt-3 justify-center box-border"
              >
                {isMarking ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Check size={14} />Mark Paid</>}
              </Btn>
            )}
          </Card>
        );})}
      </div>
      <PaginationControls {...invoicePage} className="lg:hidden" reserveFabSpace />

      <Card className="overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="bg-slate-700/30 text-slate-400 text-xs">
            <th className="text-left p-3">Invoice</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Date</th>
            <th className="text-right p-3">Amount</th><th className="text-center p-3">Status</th><th className="text-center p-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-0">
                <EmptyState
                  emoji="🧾"
                  title={
                    invoices.length === 0
                      ? "No invoices yet"
                      : filter === "refunds"
                        ? "No refunds yet"
                        : "No invoices match your filters"
                  }
                  hint={
                    filter === "refunds"
                      ? "Paid invoices voided via Koi refund appear here as credit notes."
                      : undefined
                  }
                  className="py-10"
                />
              </td></tr>
            ) :
              invoicePage.paginatedItems.map(inv => {
                const invAmounts = calcInvoiceAmounts(invoiceWithDraftFees(inv));
                return (
                <tr key={inv.id} data-invoice-id={inv.id} className={`text-slate-300 hover:bg-slate-700/20 ${highlightInvId === inv.id ? "bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/40" : ""}`}>
                  <td className="p-3 font-mono text-cyan-400 font-bold text-xs">{inv.id}</td>
                  <td className="p-3 font-medium">{inv.customerName}</td>
                  <td className="p-3 text-slate-500 text-xs">{inv.date}</td>
                  <td className="p-3 text-right">
                    <p className="font-black text-white">{formatSGD(invAmounts.total)}</p>
                    {invAmounts.discountAmount > 0 && (
                      <p className="text-[10px] text-emerald-400">-{formatSGD(invAmounts.discountAmount)}</p>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge className={isRefundCreditNoteInvoice(inv) ? "bg-amber-500/20 text-amber-300" : statusColor[getInvoiceStatus(inv)]}>
                        {isRefundCreditNoteInvoice(inv) ? "refund" : getInvoiceStatus(inv)}
                      </Badge>
                      <BookedBadge booked={inv.booked} bookedBy={inv.bookedBy} />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center">
                      <Btn variant="ghost" size="sm" onClick={() => openViewInvoice(inv)} ariaLabel="View invoice"><Eye size={12} /></Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { openViewInvoice(inv); sendWhatsApp(inv); }} ariaLabel="Send WhatsApp" disabled={pdfLoading}><MessageSquare size={12} /></Btn>
                      <Btn variant="ghost" size="sm" onClick={() => downloadPdf(inv)} ariaLabel="Download PDF" disabled={pdfLoading}><Printer size={12} /></Btn>
                      {canMarkAccounting(currentUser) && (
                        <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); requestInvoiceBookedChange(inv.id); }} ariaLabel={inv.booked ? "Change accounts mark" : "Mark in accounts"}>
                          <BookCheck size={12} className={inv.booked ? "text-emerald-400" : "text-slate-500"} />
                        </Btn>
                      )}
                      {canCancelInvoice(inv) && canDeleteRecords(currentUser) && (
                        <Btn variant="ghost" size="sm" onClick={() => cancelInvoice(inv.id)} title="Cancel invoice"><XCircle size={12} className="text-red-400" /></Btn>
                      )}
                      {canRecordPayment(inv) && <Btn variant="success" size="sm" onClick={() => markPaid(inv.id)}><Check size={12} />Paid</Btn>}
                    </div>
                  </td>
                </tr>
              );})
            }
          </tbody>
        </table>
        </div>
        <PaginationControls {...invoicePage} className="px-3 pb-3" />
      </Card>

      {/* New Invoice Modal */}
      <Modal
        open={showNew}
        onClose={() => { if (!creatingInvoice) { setShowNew(false); setFormError(""); } }}
        title="Create Invoice"
        size="lg"
        footer={(
          <div className="modal-actions">
            <Btn variant="secondary" onClick={() => { setShowNew(false); setFormError(""); }} disabled={creatingInvoice}>Cancel</Btn>
            <Btn onClick={createInvoice} disabled={creatingInvoice}>
              {creatingInvoice ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><FileText size={14} />Create Invoice</>}
            </Btn>
          </div>
        )}
      >
        <div className="space-y-4 min-w-0 max-w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
            <div>
              <Select label="Customer" value={form.manualCustomer ? "manual" : form.customerId}
                onChange={e => {
                  if (e.target.value === "manual") {
                    setForm(f => ({ ...f, manualCustomer: true, customerId: "", customerName: "" }));
                  } else {
                    const c = customers.find((x) => String(x.id) === String(e.target.value));
                    setForm(f => ({ ...f, manualCustomer: false, customerId: e.target.value, customerName: c?.name || "" }));
                  }
                }}
                options={[
                  { value: "", label: "-- Select customer --" },
                  ...customers.map(c => ({ value: c.id, label: c.name })),
                  { value: "manual", label: "Walk-in / Other customer" },
                ]} />
            </div>
            <Input label="Due Date" type="date" value={form.due} min={today()} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
          </div>
          {form.manualCustomer && (
            <Input label="Customer Name" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Enter customer name" required />
          )}
          {!form.manualCustomer && form.customerId && findCustomerWhatsApp(customers, form.customerId) && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <MessageSquare size={12} />
              Invoice will be sent via WhatsApp to {findCustomerWhatsApp(customers, form.customerId)} after creation.
            </p>
          )}

          <div>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Invoice Items</label>
              <p className="text-xs text-slate-500">Pick from fish stock or inventory, or add a <span className="text-slate-400">Manual item</span> for other charges.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3 w-full min-w-0 max-w-full">
              {(() => {
                const hasFishStock = koiFishList.some(
                  (k) => [KOI_STATUS.AVAILABLE, KOI_STATUS.SICK].includes(k.status),
                );
                if (!hasFishStock) return null;
                const usedKoiIds = form.items.filter((it) => it.koiId).map((it) => String(it.koiId));
                const stockKoi = availableKoiForInvoice(koiFishList, usedKoiIds);
                return (
                  <select
                    className={`w-full max-w-full min-w-0 box-border sm:flex-1 bg-slate-900/50 border rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${stockKoi.length ? "border-emerald-600/40" : "border-slate-600 opacity-60 cursor-not-allowed"}`}
                    defaultValue=""
                    disabled={!stockKoi.length}
                    onChange={e => {
                      if (e.target.value) { addKoiItem(e.target.value); e.target.value = ""; }
                    }}
                  >
                    <option value="">
                      {stockKoi.length ? "+ Add from Fish Stock" : "+ Add from Fish Stock (all on invoice)"}
                    </option>
                    {stockKoi.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name || k.variety} — {formatSGD(k.price)} · {k.pondName} ({k.id})
                      </option>
                    ))}
                  </select>
                );
              })()}
              {products.length > 0 && (
                <ProductSearchPicker products={products} onSelect={addProductItem} />
              )}
              <Btn variant="ghost" size="sm" onClick={addManualItem} className="shrink-0 justify-center">
                <Plus size={12} />Manual Item
              </Btn>
            </div>
            {form.items.some((it) => it.koiId) && form.manualCustomer && (
              <p className="text-amber-300 text-xs mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                Fish stock items need a registered customer — switch from walk-in to a customer from your list.
              </p>
            )}

            <div className="space-y-3">
              {form.items.map((it, idx) => {
                const fromKoi = !!it.koiId;
                const linkedProduct = it.productId ? products.find((p) => String(p.id) === String(it.productId)) : null;
                const fromPriceList = linkedProduct && !isStockTracked(linkedProduct);
                const fromInventory = !it.manual && !!it.productId && !fromPriceList;
                const lineType = fromKoi ? "fish" : fromPriceList ? "pricelist" : fromInventory ? "inventory" : "manual";
                return (
                  <Card key={idx} className={`p-3 border-slate-700/50 ${lineType === "fish" ? "border-emerald-500/20" : lineType === "inventory" ? "border-cyan-500/20" : lineType === "pricelist" ? "border-violet-500/20" : "border-amber-500/20"}`}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-500 shrink-0">Line {idx + 1}</span>
                        <Badge className={
                          lineType === "fish" ? "bg-emerald-500/20 text-emerald-300"
                            : lineType === "inventory" ? "bg-cyan-500/20 text-cyan-300"
                              : lineType === "pricelist" ? "bg-violet-500/20 text-violet-300"
                                : "bg-amber-500/20 text-amber-300"
                        }>
                          {lineType === "fish" ? "Fish Stock" : lineType === "inventory" ? "Inventory" : lineType === "pricelist" ? "Price List" : "Manual"}
                        </Badge>
                        {it.koiAlreadySold && (
                          <Badge className="bg-blue-500/20 text-blue-300 text-[10px]">Sold</Badge>
                        )}
                      </div>
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1 touch-manipulation shrink-0"><X size={14} /></button>
                    </div>
                    <div className="space-y-2">
                      {it.manual ? (
                        <Input
                          label="Item Name"
                          value={it.name}
                          onChange={e => updateItem(idx, "name", e.target.value)}
                          placeholder="Type item name (not in inventory list)"
                          required
                        />
                      ) : (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 mb-1 uppercase">Item Name</p>
                          <p className="text-white font-medium text-sm bg-slate-900/40 border border-slate-700/50 rounded-lg px-3 py-2.5">{it.name}</p>
                          {!fromKoi && !fromInventory && (
                            <button
                              type="button"
                              onClick={() => convertToManualItem(idx)}
                              className="mt-1 text-xs text-amber-400 hover:text-amber-300 touch-manipulation"
                            >
                              Edit name manually
                            </button>
                          )}
                        </div>
                      )}
                      {fromKoi && !it.koiAlreadySold && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase">After sale</p>
                          <div className="flex gap-2">
                            {[
                              ["taken", "Taken away"],
                              ["keep", "Keep at farm"],
                            ].map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => updateKoiDisposition(idx, value)}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${(it.koiDisposition || "taken") === value ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="text-slate-500 text-[10px] mt-1.5">
                            {(it.koiDisposition || "taken") === "keep"
                              ? "Fish stays at farm — Customer Koi record will be created."
                              : "Customer takes the fish — no Customer Koi record."}
                          </p>
                          {(it.koiDisposition || "taken") === "keep" && (
                            <PondNameInput
                              label="Keep in pond"
                              value={it.keepPondName || ""}
                              onChange={(e) => updateItem(idx, "keepPondName", e.target.value)}
                              className="mt-2"
                              required
                            />
                          )}
                        </div>
                      )}
                      {fromKoi && it.koiAlreadySold && (
                        <p className="text-xs text-blue-300/80 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                          Already marked sold — this line documents the sale on the invoice.
                          {(it.koiDisposition || "taken") === "keep" && it.keepPondName ? ` Kept at ${it.keepPondName}.` : " Taken away."}
                        </p>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Input
                          label="Qty"
                          type="number"
                          value={fromKoi ? 1 : it.qty}
                          onChange={e => updateItem(idx, "qty", e.target.value)}
                          min="1"
                          readOnly={fromKoi}
                        />
                        <Input label="Price (S$)" type="number" value={it.price} onChange={e => updateItem(idx, "price", e.target.value)} step="0.01" className="sm:col-span-2" />
                      </div>
                      <p className="text-right text-sm text-emerald-400 font-bold">
                        {formatSGD((+it.qty || 0) * (+it.price || 0))}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="bg-slate-900/40 px-4 py-3 border-b border-slate-700/50">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Discount</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <Select
                  label=""
                  value={form.discountType}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    discountType: e.target.value,
                    discountValue: e.target.value === "none" ? "" : f.discountValue,
                  }))}
                  options={[
                    { value: "none", label: "No discount" },
                    { value: "fixed", label: "Fixed amount (S$)" },
                    { value: "percent", label: "Percentage (%)" },
                  ]}
                />
                {form.discountType !== "none" && (
                  <Input
                    label={form.discountType === "percent" ? "Discount %" : "Discount amount (S$)"}
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    min="0"
                    max={form.discountType === "percent" ? "100" : undefined}
                    step={form.discountType === "percent" ? "1" : "0.01"}
                    placeholder={form.discountType === "percent" ? "e.g. 10" : "e.g. 50.00"}
                  />
                )}
              </div>
              <div className="mt-3">
                <Input
                  label="Shipping Fee (S$)"
                  type="number"
                  value={form.shipping}
                  onChange={(e) => setForm((f) => ({ ...f, shipping: e.target.value }))}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <div className="mt-3">
                <Input
                  label="GST (S$)"
                  type="number"
                  value={form.tax}
                  onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="bg-slate-900/50 p-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({form.items.length} item{form.items.length !== 1 ? "s" : ""})</span>
                <span className="text-slate-200">{formatSGD(formAmounts.subtotal)}</span>
              </div>
              {formAmounts.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>{form.discountType === "percent" ? `Discount (${+form.discountValue || 0}%)` : "Discount"}</span>
                  <span>-{formatSGD(formAmounts.discountAmount)}</span>
                </div>
              )}
              {(+form.shipping || 0) > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Shipping</span>
                  <span className="text-slate-200">{formatSGD(+form.shipping || 0)}</span>
                </div>
              )}
              {(+form.tax || 0) > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>GST</span>
                  <span className="text-slate-200">{formatSGD(+form.tax || 0)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                <span className="text-slate-300 font-semibold">Total due</span>
                <span className="text-2xl font-black text-cyan-400">{formatSGD(formAmounts.total)}</span>
              </div>
            </div>
          </div>
          {formError && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle size={14} />{formError}
            </div>
          )}
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
      </Modal>

      {/* View Invoice Modal */}
      <Modal
        open={!!activeViewInv}
        onClose={closeViewInvoice}
        backdropClose={!cancelConfirm && !blockViewDismiss}
        title={activeViewInv ? `Invoice ${activeViewInv.id}` : "Invoice"}
        size="full"
        footer={(
          <Btn variant="secondary" onClick={closeViewInvoice} className="w-full justify-center">
            <X size={14} />Close
          </Btn>
        )}
      >
        {activeViewInv && (() => {
          const canEditDiscount = ["pending", "overdue"].includes(getInvoiceStatus(activeViewInv));
          const canEditFees = canEditDiscount && canEditRecords(currentUser);
          const draftInv = invoiceWithDraftFees(activeViewInv);
          const viewAmounts = calcInvoiceAmounts(canEditFees ? draftInv : activeViewInv);
          const docInv = invoiceForPdfExport(activeViewInv);
          const isMarkingView = String(markingPaidId) === String(activeViewInv.id);
          const isCancellingView = String(cancellingId) === String(activeViewInv.id);
          return (
          <div className="space-y-4">
            <div className="no-print relative z-20 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className={statusColor[getInvoiceStatus(activeViewInv)]}>{getInvoiceStatus(activeViewInv)}</Badge>
                <span className="text-slate-400">{activeViewInv.customerName}</span>
                <span className="text-cyan-400 font-bold">{formatSGD(viewAmounts.total)}</span>
                {viewAmounts.discountAmount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">-{formatSGD(viewAmounts.discountAmount)}</Badge>
                )}
                {resolveInvoiceWhatsApp(activeViewInv, customers) && (
                  <span className="text-emerald-400/80 text-xs hidden sm:inline">{resolveInvoiceWhatsApp(activeViewInv, customers)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Btn variant="success" onClick={() => sendWhatsApp(activeViewInv)} className="flex-1 sm:flex-none justify-center">
                  <MessageSquare size={14} />Open WhatsApp
                </Btn>
                <Btn onClick={() => downloadPdf(activeViewInv)} disabled={pdfLoading} className="flex-1 sm:flex-none justify-center">
                  <Printer size={14} />{pdfLoading ? "Generating..." : "Download PDF"}
                </Btn>
                {canRecordPayment(activeViewInv) && (
                  <Btn variant="success" onClick={() => markPaid(activeViewInv.id)} disabled={isMarkingView || isCancellingView || !!cancelConfirm} className="flex-1 sm:flex-none justify-center">
                    {isMarkingView ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><Check size={14} />Mark Paid</>}
                  </Btn>
                )}
                {canCancelInvoice(activeViewInv) && canDeleteRecords(currentUser) && (
                  <Btn variant="danger" onClick={() => cancelInvoice(activeViewInv.id)} disabled={isCancellingView || isMarkingView} className="flex-1 sm:flex-none justify-center">
                    {isCancellingView ? <><Loader2 size={14} className="animate-spin" />Cancelling...</> : <><XCircle size={14} />Cancel Invoice</>}
                  </Btn>
                )}
              </div>
            </div>
            {canEditFees && (
              <Card className="no-print p-4 border-slate-700/50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Discount &amp; fees</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select
                    label="Type"
                    value={activeViewInv.discountType || "none"}
                    onChange={(e) => {
                      const discountType = e.target.value;
                      if (discountType === "none") {
                        void applyInvoiceDiscount(activeViewInv, "none", 0);
                      } else {
                        patchInvoice(activeViewInv.id, { discountType, discountValue: activeViewInv.discountValue || "" });
                      }
                    }}
                    options={[
                      { value: "none", label: "No discount" },
                      { value: "fixed", label: "Fixed (S$)" },
                      { value: "percent", label: "Percentage (%)" },
                    ]}
                  />
                  {(activeViewInv.discountType && activeViewInv.discountType !== "none") && (
                    <Input
                      label={activeViewInv.discountType === "percent" ? "Discount %" : "Amount (S$)"}
                      type="number"
                      value={activeViewInv.discountValue || ""}
                      onChange={(e) => patchInvoice(activeViewInv.id, { discountValue: e.target.value })}
                      min="0"
                      max={activeViewInv.discountType === "percent" ? "100" : undefined}
                      step={activeViewInv.discountType === "percent" ? "1" : "0.01"}
                    />
                  )}
                  {(activeViewInv.discountType && activeViewInv.discountType !== "none") && (
                    <div className="flex items-end">
                      <Btn
                        className="w-full justify-center"
                        onClick={() => { void applyInvoiceDiscount(activeViewInv, activeViewInv.discountType, activeViewInv.discountValue); }}
                        disabled={String(savingInvoiceFeesId) === String(activeViewInv.id)}
                      >
                        {String(savingInvoiceFeesId) === String(activeViewInv.id)
                          ? <><Loader2 size={14} className="animate-spin" />Saving...</>
                          : <><Check size={14} />Apply discount</>}
                      </Btn>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Input
                    label="Shipping Fee (S$)"
                    type="number"
                    value={shippingDraft}
                    onChange={(e) => setShippingDraft(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                  <div className="flex items-end">
                    <Btn
                      className="w-full justify-center"
                      onClick={() => { void applyInvoiceShipping(activeViewInv, shippingDraft); }}
                      disabled={String(savingInvoiceFeesId) === String(activeViewInv.id)}
                    >
                      {String(savingInvoiceFeesId) === String(activeViewInv.id)
                        ? <><Loader2 size={14} className="animate-spin" />Saving...</>
                        : <><Check size={14} />Apply shipping</>}
                    </Btn>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Input
                    label="GST (S$)"
                    type="number"
                    value={taxDraft}
                    onChange={(e) => setTaxDraft(e.target.value)}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                  />
                  <div className="flex items-end">
                    <Btn
                      className="w-full justify-center"
                      onClick={() => { void applyInvoiceTax(activeViewInv, taxDraft); }}
                      disabled={String(savingInvoiceFeesId) === String(activeViewInv.id)}
                    >
                      {String(savingInvoiceFeesId) === String(activeViewInv.id)
                        ? <><Loader2 size={14} className="animate-spin" />Saving...</>
                        : <><Check size={14} />Apply GST</>}
                    </Btn>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
                  <span>Subtotal: <span className="text-slate-200">{formatSGD(viewAmounts.subtotal)}</span></span>
                  {viewAmounts.discountAmount > 0 && (
                    <span>Discount: <span className="text-emerald-400">-{formatSGD(viewAmounts.discountAmount)}</span></span>
                  )}
                  {viewAmounts.shipping > 0 && (
                    <span>Shipping: <span className="text-slate-200">{formatSGD(viewAmounts.shipping)}</span></span>
                  )}
                  {viewAmounts.tax > 0 && (
                    <span>GST: <span className="text-slate-200">{formatSGD(viewAmounts.tax)}</span></span>
                  )}
                  <span>Total due: <span className="text-cyan-400 font-bold">{formatSGD(viewAmounts.total)}</span></span>
                </div>
              </Card>
            )}
            {showWhatsappInput && (
              <Card className="no-print p-4 border-emerald-500/30 bg-emerald-500/5">
                <p className="text-sm text-emerald-200 mb-3">Enter customer WhatsApp number to send this invoice.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    label="WhatsApp number"
                    value={whatsappDraft}
                    onChange={(e) => setWhatsappDraft(e.target.value)}
                    placeholder="+65 9123 4567"
                    className="flex-1"
                  />
                  <div className="flex gap-2 sm:items-end shrink-0">
                    <Btn variant="success" onClick={submitWhatsappDraft} disabled={pdfLoading}><Send size={14} />Send</Btn>
                    <Btn variant="secondary" onClick={() => setShowWhatsappInput(false)}>Cancel</Btn>
                  </div>
                </div>
              </Card>
            )}
            <div className="no-print rounded-xl border border-slate-600 bg-[#d4d4d4] p-2 sm:p-6 min-w-0 max-w-full overflow-x-hidden overflow-y-auto max-h-[min(65vh,920px)] relative z-0 isolate">
              <InvoicePreviewFrame resetKey={`${activeViewInv?.id || ''}-${activeViewInv?.status || ''}-${activeViewInv?.updatedAt || ''}-${shippingDraft}-${taxDraft}`}>
                <InvoiceDocument invoice={docInv} preview className="shadow-2xl" />
              </InvoicePreviewFrame>
            </div>
            <p className="no-print text-xs text-slate-500 text-center">
              Open WhatsApp goes straight to the customer chat. Send your own message and attach the invoice with Download PDF.
            </p>
          </div>
        );})()}
      </Modal>

      <AccountsMarkConfirmModal
        open={!!bookedConfirm}
        recordLabel={bookedConfirm?.label || ""}
        currentlyBooked={!!bookedConfirm?.currentlyBooked}
        onCancel={() => setBookedConfirm(null)}
        onSubmit={applyInvoiceBookedConfirm}
      />

      <InvoiceCancelConfirmModal
        open={!!cancelConfirm}
        invoiceId={cancelConfirm?.id || ""}
        customerName={cancelConfirm?.customerName || ""}
        loading={!!cancellingId}
        onCancel={closeCancelConfirm}
        onConfirm={confirmCancelInvoice}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOMER CRM
// ─────────────────────────────────────────────
function CustomerModule({
  customers, setCustomers, invoices = [], setInvoices, deliveries = [], setDeliveries,
  customerKoiList = [], setCustomerKoiList, addNotification, currentUser, onCustomersSaved,
}) {
  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);
  const emptyForm = () => ({
    name: "", whatsapp: "", postalCode: "", address: "", fishTypes: [], notes: "",
  });

  const [showAdd, setShowAdd] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editCustomer, setEditCustomer] = useState(null);
  const [deleteCustomer, setDeleteCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [form, setForm] = useState(emptyForm());
  const [postalLookupAdd, setPostalLookupAdd] = useState(false);
  const [postalLookupEdit, setPostalLookupEdit] = useState(false);
  const addAddressManual = useRef(false);
  const editAddressManual = useRef(false);

  const view = viewId != null ? customers.find((c) => String(c.id) === String(viewId)) : null;

  const filtered = customers.filter((c) => {
    if (tierFilter !== "All" && c.tier !== tierFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.phone, c.whatsapp, c.area, c.address, c.postalCode].some(
      (x) => String(x || "").toLowerCase().includes(q),
    );
  });
  const customerPage = usePagination(filtered, LIST_PAGE_SIZE, `${search}-${tierFilter}`);

  const toggleFishType = (target, ft) => {
    target((f) => {
      const types = f.fishTypes || [];
      return {
        ...f,
        fishTypes: types.includes(ft) ? types.filter((x) => x !== ft) : [...types, ft],
      };
    });
  };

  const fillAddressFromPostal = async (postalCode, setState, manualRef, setLoading) => {
    if (postalCode.length !== 6) return;
    setLoading(true);
    const result = await lookupSingaporePostalAddress(postalCode);
    setLoading(false);
    if (result?.address && !manualRef.current) {
      setState((f) => ({ ...f, address: result.address }));
    }
  };

  const onAddPostalChange = (value) => {
    const postalCode = value.replace(/\D/g, "").slice(0, 6);
    addAddressManual.current = false;
    setForm((f) => ({ ...f, postalCode }));
    fillAddressFromPostal(postalCode, setForm, addAddressManual, setPostalLookupAdd);
  };

  const onEditPostalChange = (value) => {
    const postalCode = value.replace(/\D/g, "").slice(0, 6);
    editAddressManual.current = false;
    setEditCustomer((c) => ({ ...c, postalCode }));
    fillAddressFromPostal(postalCode, setEditCustomer, editAddressManual, setPostalLookupEdit);
  };

  const addCustomer = async () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const built = buildNewCustomerRecord(form, {
      existingCustomers: customers,
      cloudIds: isSupabaseConfigured,
    });
    if (!built.ok) {
      addNotification({ type: "error", title: "Invalid Customer", message: built.message });
      return;
    }
    if (isDuplicateCustomerName(customers, built.customer.name)) {
      addNotification({
        type: "warning",
        title: "Duplicate Name",
        message: `A customer named "${built.customer.name}" already exists.`,
      });
      return;
    }
    if (saving) return;
    const snapshot = customers;
    const nextCustomers = [...snapshot, built.customer];
    try {
      setSaving(true);
      await writeCloudFirst({
        snapshot,
        next: nextCustomers,
        setState: setCustomers,
        flush: (n) => onCustomersSaved?.(n),
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || "Could not save customer to cloud.",
      });
      return;
    } finally {
      setSaving(false);
    }
    addNotification({ type: "success", title: "Customer Added", message: `${built.customer.name} added to CRM` });
    setShowAdd(false);
    setForm(emptyForm());
    addAddressManual.current = false;
  };

  const saveEdit = async () => {
    if (!editCustomer) return;
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const prev = customers.find((c) => sameCustomerId(c.id, editCustomer.id));
    const built = buildUpdatedCustomerRecord(editCustomer, editCustomer);
    if (!built.ok) {
      addNotification({ type: "error", title: "Invalid Customer", message: built.message });
      return;
    }
    if (isDuplicateCustomerName(customers, built.customer.name, built.customer.id)) {
      addNotification({
        type: "warning",
        title: "Duplicate Name",
        message: `Another customer is already named "${built.customer.name}".`,
      });
      return;
    }
    if (saving) return;
    const snapshot = customers;
    const updated = built.customer;
    const nextCustomers = snapshot.map((c) => (sameCustomerId(c.id, updated.id) ? updated : c));
    const related = propagateCustomerProfileChange({
      customerId: updated.id,
      prevCustomer: prev,
      nextCustomer: updated,
      invoices,
      deliveries,
      customerKoiList,
    });
    try {
      setSaving(true);
      await writeCloudFirst({
        snapshot,
        next: nextCustomers,
        setState: setCustomers,
        flush: (n) => onCustomersSaved?.(n),
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || "Could not save customer to cloud.",
      });
      return;
    } finally {
      setSaving(false);
    }
    if (related.invoices && setInvoices) setInvoices(related.invoices);
    if (related.deliveries && setDeliveries) setDeliveries(related.deliveries);
    if (related.customerKoiList && setCustomerKoiList) setCustomerKoiList(related.customerKoiList);
    addNotification({ type: "success", title: "Customer Updated", message: `${updated.name} saved` });
    setEditCustomer(null);
    editAddressManual.current = false;
    setViewId(updated.id);
  };

  const confirmDeleteCustomer = async () => {
    if (!deleteCustomer || deletingCustomer) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const snapshot = customers;
    const id = deleteCustomer.id;
    const name = deleteCustomer.name;
    setDeletingCustomer(true);
    const nextCustomers = snapshot.filter((c) => String(c.id) !== String(id));
    try {
      await writeCloudFirst({
        snapshot,
        next: nextCustomers,
        setState: setCustomers,
        flush: (n) => onCustomersSaved?.(n),
        deleteMeta: { entity: "customers", id },
      });
      if (String(viewId) === String(id)) setViewId(null);
      addNotification({ type: "info", title: "Customer Deleted", message: `${name} removed from CRM` });
      setDeleteCustomer(null);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Delete Failed",
        message: err?.message || "Could not remove customer. Try again.",
      });
    } finally {
      setDeletingCustomer(false);
    }
  };

  const generateWhatsApp = (c) => {
    const phone = findCustomerWhatsApp(customers, c.id, c.name) || c.whatsapp || c.phone;
    if (!phone?.trim()) {
      addNotification({ type: "error", title: "No Number", message: "Add a WhatsApp number first." });
      return;
    }
    const text = `Hi ${c.name}! Marugen Koi & Arowana Farm here. We have new arrivals that may interest you. Would you like to take a look?`;
    try {
      openWhatsAppChat(phone, text);
    } catch (err) {
      addNotification({ type: "error", title: "WhatsApp Failed", message: err?.message || "Could not open WhatsApp." });
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white">Customers</h2>
        <p className="text-slate-400 text-sm">{customers.length} registered</p>
      </div>
      {canEdit && (
        <Fab onClick={() => { setForm(emptyForm()); addAddressManual.current = false; setShowAdd(true); }} label="Add Customer" hidden={showAdd || viewId != null || !!editCustomer || !!deleteCustomer} />
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-3 sm:py-2 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
        </div>
        <div className="flex gap-2">
          {["All", ...CUSTOMER_TIERS].map(t => (
            <button key={t} onClick={() => setTierFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tierFilter === t ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState
              emoji="👤"
              title={customers.length === 0 ? "No customers yet" : "No customers match your filters"}
              hint={customers.length === 0 ? "Tap Add Customer to get started" : "Try a different search or tier"}
              actionLabel={customers.length === 0 && canEdit ? "Add Customer" : undefined}
              onAction={customers.length === 0 && canEdit ? () => setShowAdd(true) : undefined}
            />
          </Card>
        ) : customerPage.paginatedItems.map((c) => (
          <Card key={c.id} className="p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white font-bold">{c.name}</p>
                <p className="text-slate-500 text-xs flex items-center gap-1"><MapPin size={10} />{c.postalCode || c.area || "—"}</p>
                {c.address && <p className="text-slate-600 text-xs mt-0.5 truncate">{c.address}</p>}
              </div>
              <span className={`font-black text-sm ${tierColor[c.tier] || tierColor.Bronze}`}>{c.tier || "Bronze"}</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {(c.fishTypes || []).map((f) => <Badge key={f} className="bg-slate-700/60 text-slate-300">{f}</Badge>)}
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs">{c.whatsapp || c.phone || "—"}</span>
              <span className="text-emerald-400 font-bold text-sm">{formatSGD(c.totalSpent || 0)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setViewId(c.id)}><Eye size={12} />View</Btn>
              {canEdit && <Btn variant="ghost" size="sm" onClick={() => { editAddressManual.current = false; setEditCustomer({ ...c, fishTypes: [...(c.fishTypes || [])] }); }}><Edit2 size={12} />Edit</Btn>}
              {canDelete && <Btn variant="danger" size="sm" onClick={() => setDeleteCustomer(c)}><Trash2 size={12} />Delete</Btn>}
              <Btn variant="success" size="sm" onClick={() => generateWhatsApp(c)}><MessageSquare size={12} />WhatsApp</Btn>
            </div>
          </Card>
        ))}
      </div>
      <PaginationControls {...customerPage} />

      {/* Add Customer */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="sm:col-span-2" />
          <Input label="WhatsApp" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+65 9XXX XXXX" required className="sm:col-span-2" />
          <Input label="Postal Code" value={form.postalCode} onChange={e => onAddPostalChange(e.target.value)} placeholder="e.g. 521123" inputMode="numeric" className="sm:col-span-2" />
          <Input label="Address Details" value={form.address} onChange={e => { addAddressManual.current = true; setForm(f => ({ ...f, address: e.target.value })); }} placeholder="Blk / Unit / Street — auto-fills from postal code" className="sm:col-span-2" />
          {postalLookupAdd && <p className="text-cyan-400/80 text-xs sm:col-span-2">Looking up address…</p>}
        </div>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Fish Interests</label>
          <div className="flex flex-wrap gap-2">
            {FISH_TYPES.map((ft) => (
              <button key={ft} type="button" onClick={() => toggleFishType(setForm, ft)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.fishTypes.includes(ft) ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{ft}</button>
            ))}
          </div>
        </div>
        <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-4" rows={2} />
        <div className="modal-actions">
          <Btn variant="secondary" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</Btn>
          <Btn onClick={addCustomer} disabled={!canEdit || saving}><Plus size={14} />{saving ? "Saving…" : "Add Customer"}</Btn>
        </div>
      </Modal>

      {/* View Customer */}
      <Modal open={!!view} onClose={() => setViewId(null)} title={view?.name || "Customer"} size="md">
        {view && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="sm:col-span-2"><p className="text-slate-500 text-xs">WhatsApp</p><p className="text-white flex items-center gap-1"><Phone size={12} />{view.whatsapp || view.phone || "—"}</p></div>
              <div className="sm:col-span-2"><p className="text-slate-500 text-xs">Postal Code</p><p className="text-white">{view.postalCode || "—"}</p></div>
              <div className="sm:col-span-2"><p className="text-slate-500 text-xs">Address</p><p className="text-white">{view.address || "—"}</p></div>
              <div><p className="text-slate-500 text-xs">Tier</p><p className={`font-black ${tierColor[view.tier] || tierColor.Bronze}`}><Star size={12} className="inline mr-1" />{view.tier || calcCustomerTier(view.totalSpent)}</p></div>
              <div><p className="text-slate-500 text-xs">Total Spent</p><p className="text-emerald-400 font-black text-lg">{formatSGD(view.totalSpent || 0)}</p></div>
            </div>
            <div><p className="text-slate-500 text-xs mb-2">Fish Types</p><div className="flex flex-wrap gap-2">{(view.fishTypes || []).length ? (view.fishTypes || []).map((f) => <Badge key={f} className="bg-slate-700 text-slate-300">{f}</Badge>) : <span className="text-slate-500 text-sm">—</span>}</div></div>
            {view.notes && <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Notes</p><p className="text-slate-300 text-sm">{view.notes}</p></div>}
            <div className="flex flex-wrap gap-2">
              {canEdit && <Btn variant="ghost" size="sm" onClick={() => { editAddressManual.current = false; setEditCustomer({ ...view, fishTypes: [...(view.fishTypes || [])] }); setViewId(null); }}><Edit2 size={12} />Edit</Btn>}
              {canDelete && <Btn variant="danger" size="sm" onClick={() => { setDeleteCustomer(view); setViewId(null); }}><Trash2 size={12} />Delete</Btn>}
              <Btn variant="success" size="sm" onClick={() => generateWhatsApp(view)}><Send size={12} />Send on WhatsApp</Btn>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-emerald-400 text-xs font-bold mb-2">Message preview</p>
              <p className="text-slate-300 text-sm">Hi {view.name}! Marugen Farm here. We have new {(view.fishTypes || [])[0] || "fish"} arrivals. Interested? DM us!</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Customer */}
      <Modal open={!!editCustomer} onClose={() => setEditCustomer(null)} title="Edit Customer" size="lg">
        {editCustomer && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Full Name" value={editCustomer.name} onChange={(e) => setEditCustomer((c) => ({ ...c, name: e.target.value }))} required className="sm:col-span-2" />
              <Input label="WhatsApp" value={editCustomer.whatsapp || editCustomer.phone || ""} onChange={(e) => setEditCustomer((c) => ({ ...c, whatsapp: e.target.value }))} placeholder="+65 9XXX XXXX" required className="sm:col-span-2" />
              <Input label="Postal Code" value={editCustomer.postalCode || ""} onChange={(e) => onEditPostalChange(e.target.value)} inputMode="numeric" placeholder="e.g. 521123" className="sm:col-span-2" />
              <Input label="Address Details" value={editCustomer.address || ""} onChange={(e) => { editAddressManual.current = true; setEditCustomer((c) => ({ ...c, address: e.target.value })); }} placeholder="Blk / Unit / Street — auto-fills from postal code" className="sm:col-span-2" />
              {postalLookupEdit && <p className="text-cyan-400/80 text-xs sm:col-span-2">Looking up address…</p>}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Tier: <span className={tierColor[calcCustomerTier(editCustomer.totalSpent)]}>{calcCustomerTier(editCustomer.totalSpent)}</span>
              {" "}(auto from {formatSGD(editCustomer.totalSpent || 0)} spent)
            </p>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Fish Interests</label>
              <div className="flex flex-wrap gap-2">
                {FISH_TYPES.map((ft) => (
                  <button key={ft} type="button" onClick={() => toggleFishType(setEditCustomer, ft)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${editCustomer.fishTypes?.includes(ft) ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{ft}</button>
                ))}
              </div>
            </div>
            <Textarea label="Notes" value={editCustomer.notes || ""} onChange={(e) => setEditCustomer((c) => ({ ...c, notes: e.target.value }))} className="mt-4" rows={2} />
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setEditCustomer(null)} disabled={saving}>Cancel</Btn>
              <Btn onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!deleteCustomer}
        onClose={() => setDeleteCustomer(null)}
        title="Delete Customer"
        size="sm"
        footer={deleteCustomer && (
          <ConfirmModalFooter onCancel={() => { if (!deletingCustomer) setDeleteCustomer(null); }} cancelDisabled={deletingCustomer}>
            <Btn variant="danger" onClick={confirmDeleteCustomer} disabled={deletingCustomer} className="w-full sm:w-auto justify-center">
              {deletingCustomer ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteCustomer && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Remove <strong className="text-white">{deleteCustomer.name}</strong> from your customer list? This cannot be undone.
            </p>
            {getCustomerDeleteWarnings(deleteCustomer, { invoices, deliveries }).map((warning) => (
              <p key={warning} className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                {warning} — past records may still reference this customer.
              </p>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPENSE RECEIPTS (image records for external accounting)
// ─────────────────────────────────────────────
function ExpenseModule({ expenses, setExpenses, addNotification, currentUser, onPersistExpenses }) {
  const canEdit = canEditRecords(currentUser);
  const savingExpenseRef = useRef(false);
  const lastExpenseSaveErrorRef = useRef("");
  const [showAdd, setShowAdd] = useState(false);
  const [viewExpenseId, setViewExpenseId] = useState(null);
  const [bookedFilter, setBookedFilter] = useState("all");
  const [showOlderExpenses, setShowOlderExpenses] = useState(false);
  const [bookedConfirm, setBookedConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [uploadDate, setUploadDate] = useState(today());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewEditDate, setViewEditDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const albumInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const commitExpenseList = async (buildNext) => {
    if (savingExpenseRef.current) {
      lastExpenseSaveErrorRef.current = "Another save is in progress. Wait a moment and try again.";
      return null;
    }
    let nextList = null;
    let snapshot = null;
    let unchanged = false;
    setExpenses((prev) => {
      snapshot = prev;
      const built = buildNext(prev);
      if (built === prev) {
        unchanged = true;
        return prev;
      }
      nextList = built;
      return nextList;
    });
    if (unchanged || !nextList) {
      lastExpenseSaveErrorRef.current = "Nothing to save.";
      return null;
    }
    if (!onPersistExpenses) return nextList;

    savingExpenseRef.current = true;
    lastExpenseSaveErrorRef.current = "";
    try {
      await onPersistExpenses(nextList);
      return nextList;
    } catch (err) {
      setExpenses(snapshot);
      lastExpenseSaveErrorRef.current = err?.message || "Could not save to cloud. Try again.";
      addNotification({
        type: "error",
        title: "Save failed",
        message: lastExpenseSaveErrorRef.current,
      });
      return null;
    } finally {
      savingExpenseRef.current = false;
    }
  };

  const viewExpense = viewExpenseId != null
    ? expenses.find((e) => sameExpenseId(e.id, viewExpenseId))
    : null;

  const refreshReceiptUrl = useCallback(async (expenseId) => {
    if (!isSupabaseConfigured) return;
    try {
      const { imageUrl } = await db.refreshExpenseReceiptUrl(expenseId);
      if (imageUrl) {
        setExpenses((prev) => prev.map((e) => (
          sameExpenseId(e.id, expenseId) ? { ...e, imageUrl } : e
        )));
      }
    } catch {
      /* signed URL refresh failed — imageData fallback may still work */
    }
  }, [setExpenses]);

  useEffect(() => {
    if (!viewExpense?.id || viewExpense.imageData || !isSupabaseConfigured) return;
    if (viewExpense.imageUrl?.startsWith("http")) {
      refreshReceiptUrl(viewExpense.id);
    }
  }, [viewExpenseId, viewExpense?.id, viewExpense?.imageUrl, viewExpense?.imageData, refreshReceiptUrl]);

  const hasExpenseAccess = hasPermission(currentUser, "expenses");
  const canDelete = canDeleteRecords(currentUser);

  const unbookedExpenseCount = expenses.filter((e) => !e.booked).length;
  const dateFilterActive = !!(dateFrom || dateTo);
  const dateRangeInvalid = !!(dateFrom && dateTo && dateFrom > dateTo);

  const matchesBookedAndAge = (e) => {
    if (!showOlderExpenses && !isAppVisibleExpense(e)) return false;
    if (bookedFilter === "booked" && !e.booked) return false;
    if (bookedFilter === "unbooked" && e.booked) return false;
    return true;
  };

  const matchesDateFilter = (e) => {
    if (!dateFilterActive || dateRangeInvalid) return true;
    const d = e.date || "";
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const hiddenNoDateCount = dateFilterActive && !dateRangeInvalid
    ? expenses.filter((e) => matchesBookedAndAge(e) && !e.date).length
    : 0;

  const visibleExpenses = [...expenses]
    .filter((e) => matchesBookedAndAge(e) && matchesDateFilter(e))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (Number(b.id) || 0) - (Number(a.id) || 0));
  const hiddenExpenseCount = expenses.filter((e) => !isAppVisibleExpense(e)).length;
  const expensePage = usePagination(visibleExpenses, LIST_PAGE_SIZE, `${bookedFilter}-${dateFrom}-${dateTo}-${showOlderExpenses}`);

  if (!hasExpenseAccess) return <AccessDenied moduleName="Expenses" />;

  const resetUpload = () => {
    setUploadPreview(null);
    setUploadName("");
    setUploadNote("");
    setUploadDate(today());
    if (albumInputRef.current) albumInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const openCamera = () => {
    if (!canEdit || uploading) return;
    cameraInputRef.current?.click();
  };

  const handleImagePick = async (file) => {
    if (!canEdit || !file) return;
    try {
      setUploading(true);
      const { dataUrl, name } = await compressReceiptImage(file);
      setUploadPreview(dataUrl);
      setUploadName(name);
      if (albumInputRef.current) albumInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (err) {
      addNotification({ type: "error", title: "Upload Failed", message: err?.message || "Could not process image." });
      resetUpload();
    } finally {
      setUploading(false);
    }
  };

  const requestExpenseBookedChange = (id) => {
    if (!canMarkAccounting(currentUser)) {
      addNotification({ type: "error", title: "Permission Denied", message: "Accounting marks permission is required." });
      return;
    }
    const expense = expenses.find((e) => sameExpenseId(e.id, id));
    if (!expense) return;
    const label = expense.imageName || expense.date || "Receipt";
    setBookedConfirm({ id, label, currentlyBooked: !!expense.booked });
  };

  const applyExpenseBookedConfirm = async () => {
    if (!bookedConfirm) return;
    const { id, currentlyBooked } = bookedConfirm;
    const patch = makeBookedPatch(!currentlyBooked, currentUser.name);
    setBookedConfirm(null);
    const saved = await commitExpenseList((prev) => prev.map((e) => (
      sameExpenseId(e.id, id) ? touchUpdatedAt({ ...e, ...patch }) : e
    )));
    if (saved) {
      addNotification({
        type: "success",
        title: currentlyBooked ? "Mark removed" : "Marked in accounts",
        message: currentlyBooked ? "Receipt unmarked from accounts." : "Receipt marked as entered in accounts.",
      });
    }
  };

  const requestDeleteExpense = (expense) => {
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    setViewExpenseId((prev) => (sameExpenseId(prev, expense.id) ? null : prev));
    setDeleteConfirm(expense);
  };

  const confirmDeleteExpense = async () => {
    if (!deleteConfirm || deletingExpense) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const expense = deleteConfirm;
    setDeletingExpense(true);
    markDeleted("expenses", expense.id);
    try {
      const saved = await commitExpenseList((prev) => prev.filter((e) => !sameExpenseId(e.id, expense.id)));
      if (!saved) {
        unmarkDeleted("expenses", expense.id);
        const detail = lastExpenseSaveErrorRef.current || "Could not remove receipt. Try again.";
        const saveFailedAlreadyShown = detail !== "Another save is in progress. Wait a moment and try again."
          && detail !== "Nothing to save.";
        if (!saveFailedAlreadyShown) {
          addNotification({
            type: "error",
            title: "Delete Failed",
            message: detail,
          });
        }
        return;
      }
      setViewExpenseId((prev) => (sameExpenseId(prev, expense.id) ? null : prev));
      addNotification({ type: "info", title: "Receipt Deleted", message: "Expense receipt removed." });
      setDeleteConfirm(null);
    } finally {
      setDeletingExpense(false);
    }
  };

  const updateExpenseDate = async (id, date) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const check = validateExpenseDateUpdate(date);
    if (!check.ok) {
      addNotification({ type: "error", title: "Date Required", message: check.message });
      return;
    }
    const saved = await commitExpenseList((prev) => prev.map((e) => (
      sameExpenseId(e.id, id) ? touchUpdatedAt({ ...e, date: date.trim() }) : e
    )));
    if (saved) {
      addNotification({ type: "success", title: "Date Updated", message: "Receipt date saved." });
    }
  };

  const saveReceipt = async () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (uploading) return;
    const built = buildExpenseReceiptRecord({
      imageData: uploadPreview,
      imageName: uploadName,
      date: uploadDate,
      note: uploadNote,
      addedBy: currentUser?.name || "Staff",
    });
    if (!built.ok) {
      addNotification({ type: "error", title: "Cannot Save Receipt", message: built.message });
      return;
    }
    try {
      setUploading(true);
      let e = built.expense;
      if (isSupabaseConfigured && e.imageData?.startsWith?.("data:image")) {
        const { imageUrl } = await db.uploadExpenseReceipt(e.id, e.imageData, e.imageName);
        e = { ...e, imageUrl: imageUrl || "", imageData: "" };
      }
      const saved = await commitExpenseList((prev) => [...prev, e]);
      if (!saved) return;
      addNotification({
        type: "success",
        title: "Receipt Saved",
        message: isSupabaseConfigured
          ? "Receipt saved — photo stored in cloud."
          : "Expense invoice photo recorded.",
      });
      setShowAdd(false);
      resetUpload();
    } catch (err) {
      addNotification({ type: "error", title: "Save Failed", message: err?.message || "Could not save receipt photo." });
    } finally {
      setUploading(false);
    }
  };

  const exportExpensesCsv = () => {
    const base = backupBaseName();
    downloadFile(expensesToCsv(expenses), `${base}-expenses.csv`, "text/csv");
    addNotification({
      type: "success",
      title: "Expenses exported",
      message: `${expenses.length} expense receipt(s) saved as CSV.`,
    });
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Expense Receipts</h2>
          <p className="text-slate-400 text-sm">Upload invoice photos — enter amounts in your accounting app separately</p>
          {unbookedExpenseCount > 0 && (
            <p className="text-amber-400/90 text-xs mt-1">{unbookedExpenseCount} not yet entered in accounts</p>
          )}
        </div>
        <Btn variant="secondary" size="sm" onClick={exportExpensesCsv} className="shrink-0 justify-center">
          <Download size={14} /> Export CSV
        </Btn>
      </div>
      {canEdit && (
        <Fab onClick={() => { resetUpload(); setShowAdd(true); }} label="Upload Receipt" icon={ImagePlus} hidden={showAdd || viewExpenseId != null || !!deleteConfirm} />
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {[
          { id: "all", label: "All records" },
          { id: "unbooked", label: "Pending accounts" },
          { id: "booked", label: "In accounts" },
        ].map((s) => (
          <button key={s.id} onClick={() => setBookedFilter(s.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 touch-manipulation ${bookedFilter === s.id ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{s.label}</button>
        ))}
      </div>
      <Card className="p-3 sm:p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Search by receipt date</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="From" type="date" value={dateFrom} onChange={(ev) => setDateFrom(ev.target.value)} />
          <Input label="To" type="date" value={dateTo} onChange={(ev) => setDateTo(ev.target.value)} />
        </div>
        {dateRangeInvalid && (
          <p className="text-amber-400/90 text-xs mt-3">From date must be on or before To date.</p>
        )}
        {hiddenNoDateCount > 0 && (
          <p className="text-slate-500 text-xs mt-3">
            {hiddenNoDateCount} receipt{hiddenNoDateCount === 1 ? "" : "s"} without a date {hiddenNoDateCount === 1 ? "is" : "are"} hidden while the date filter is active. Open a receipt and set its date to include it.
          </p>
        )}
        {dateFilterActive && !dateRangeInvalid && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <p className="text-xs text-slate-500">
              {visibleExpenses.length} receipt{visibleExpenses.length === 1 ? "" : "s"}
              {dateFrom && dateTo ? ` from ${formatInvoiceDate(dateFrom)} to ${formatInvoiceDate(dateTo)}` : dateFrom ? ` from ${formatInvoiceDate(dateFrom)}` : ` until ${formatInvoiceDate(dateTo)}`}
            </p>
            <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold touch-manipulation">
              Clear dates
            </button>
          </div>
        )}
        {dateFilterActive && dateRangeInvalid && (
          <div className="flex justify-end mt-3">
            <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold touch-manipulation">
              Clear dates
            </button>
          </div>
        )}
      </Card>
      {hiddenExpenseCount > 0 && (
        <button
          type="button"
          onClick={() => setShowOlderExpenses((v) => !v)}
          className="text-xs text-slate-500 hover:text-cyan-400 touch-manipulation"
        >
          {showOlderExpenses ? "Hide older receipts" : `Show ${hiddenExpenseCount} older receipt${hiddenExpenseCount === 1 ? "" : "s"} (2+ years)`}
        </button>
      )}

      {visibleExpenses.length === 0 ? (
        <Card>
          <EmptyState
            emoji="💰"
            title={expenses.length === 0
              ? "No expense receipts yet"
              : dateRangeInvalid
                ? "Invalid date range"
                : dateFilterActive
                  ? "No receipts for this date range"
                  : "No receipts match this filter"}
            hint={expenses.length === 0
              ? "Upload supplier invoice photos here"
              : dateRangeInvalid
                ? "From must be on or before To"
                : "Adjust filters above"}
            actionLabel={expenses.length === 0 && canEdit ? "Upload first receipt" : undefined}
            onAction={expenses.length === 0 && canEdit ? () => { resetUpload(); setShowAdd(true); } : undefined}
          />
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {expensePage.paginatedItems.map((e) => {
            const src = expenseImageSrc(e);
            return (
              <Card key={e.id} className="overflow-hidden hover:border-slate-600 transition-colors cursor-pointer" onClick={(ev) => {
                if (ev.target.closest("button, a, input, select, textarea, label")) return;
                setViewEditDate(e.date || "");
                setViewExpenseId(e.id);
              }}>
                <div className="aspect-[3/4] bg-slate-900 relative">
                  {src ? (
                    <StoredImage
                      src={src}
                      alt={e.imageName || "Expense receipt"}
                      className="w-full h-full object-cover"
                      entity="expense"
                      recordId={e.id}
                      field="image"
                      onRefresh={() => refreshReceiptUrl(e.id)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-slate-500 text-xs">
                      <FileText size={28} className="mb-2 opacity-50" />
                      <span>Legacy record{e.category ? `: ${e.category}` : ""}</span>
                      {e.amount > 0 && <span className="text-red-400 mt-1">{formatSGD(e.amount)}</span>}
                    </div>
                  )}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                    <BookedBadge booked={e.booked} bookedBy={e.bookedBy} />
                    {canDelete && (
                      <button
                        type="button"
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => { ev.stopPropagation(); requestDeleteExpense(e); }}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-slate-900/80 text-red-400 hover:text-red-300 hover:bg-slate-800 touch-manipulation"
                        title="Delete receipt"
                        aria-label="Delete receipt"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-cyan-300/90 text-[10px] font-semibold">{e.date ? formatInvoiceDate(e.date) : "—"}</p>
                  <p className="text-white text-xs font-medium truncate mt-0.5">{e.imageName || e.category || "Receipt"}</p>
                  <p className="text-slate-500 text-[10px]">{e.addedBy}{e.note ? ` · ${e.note}` : ""}</p>
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-700/50">
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={(ev) => { ev.stopPropagation(); setViewEditDate(e.date || ""); setViewExpenseId(e.id); }}
                      title="View receipt"
                      className="flex-1 justify-center min-h-8"
                    >
                      <Eye size={12} />View
                    </Btn>
                    {canMarkAccounting(currentUser) && (
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={(ev) => { ev.stopPropagation(); requestExpenseBookedChange(e.id); }}
                        title={e.booked ? "Change accounts mark" : "Mark entered in accounts"}
                        className="flex-1 justify-center min-h-8"
                      >
                        <BookCheck size={12} className={e.booked ? "text-emerald-400" : "text-slate-500"} />
                        <span className="truncate text-[10px]">{e.booked ? "Change mark" : "Mark accounts"}</span>
                      </Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <PaginationControls {...expensePage} />
        </>
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); resetUpload(); }} title="Upload Expense Receipt" size="md">
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">Take a photo or choose an invoice image — large files are auto-compressed before upload. Set the receipt date before saving.</p>
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(ev) => handleImagePick(ev.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(ev) => handleImagePick(ev.target.files?.[0])}
          />
          {uploading && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              <RefreshCw size={14} className="animate-spin shrink-0" />
              <span>Processing photo…</span>
            </div>
          )}
          <Input label="Receipt date" type="date" value={uploadDate} onChange={(ev) => setUploadDate(ev.target.value)} required />
          {uploadPreview ? (
            <div className="rounded-xl overflow-hidden border border-slate-600 bg-slate-900">
              <img src={uploadPreview} alt="Preview" className="w-full max-h-[50vh] object-contain" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => albumInputRef.current?.click()}
                disabled={uploading}
                className="rounded-xl border-2 border-dashed border-slate-600 hover:border-cyan-500/50 bg-slate-900/50 p-8 text-center transition-colors touch-manipulation"
              >
                <Images size={32} className="mx-auto text-cyan-400 mb-3" />
                <p className="text-white font-semibold text-sm">{uploading ? "Processing..." : "Choose from album"}</p>
                <p className="text-slate-500 text-xs mt-1">Photo library / gallery</p>
              </button>
              <button
                type="button"
                onClick={openCamera}
                disabled={uploading}
                className="rounded-xl border-2 border-dashed border-slate-600 hover:border-cyan-500/50 bg-slate-900/50 p-8 text-center transition-colors touch-manipulation"
              >
                <Camera size={32} className="mx-auto text-emerald-400 mb-3" />
                <p className="text-white font-semibold text-sm">{uploading ? "Processing..." : "Take photo"}</p>
                <p className="text-slate-500 text-xs mt-1">Camera</p>
              </button>
            </div>
          )}
          {uploadPreview && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Btn variant="secondary" onClick={() => albumInputRef.current?.click()} disabled={uploading} className="w-full justify-center">
                <Images size={14} />Choose from album
              </Btn>
              <Btn variant="secondary" onClick={openCamera} disabled={uploading} className="w-full justify-center">
                <Camera size={14} />Take again
              </Btn>
            </div>
          )}
          <Textarea
            label="Note (optional)"
            value={uploadNote}
            onChange={(ev) => setUploadNote(ev.target.value)}
            rows={2}
            placeholder="e.g. Feed supplier, March order"
          />
        </div>
        <div className="modal-actions">
          <Btn variant="secondary" onClick={() => { setShowAdd(false); resetUpload(); }}>Cancel</Btn>
          <Btn onClick={saveReceipt} disabled={!canEdit || !uploadPreview || uploading}><Plus size={14} />{uploading ? "Saving…" : "Save Receipt"}</Btn>
        </div>
      </Modal>

      <Modal
        open={!!viewExpense}
        onClose={() => {
          const close = async () => {
            if (canEdit && viewExpense && viewEditDate && viewEditDate !== (viewExpense.date || "")) {
              await updateExpenseDate(viewExpense.id, viewEditDate);
            }
            setViewExpenseId(null);
          };
          close();
        }}
        title="Expense Receipt"
        size="lg"
      >
        {viewExpense && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <BookedBadge booked={viewExpense.booked} bookedBy={viewExpense.bookedBy} />
              <span className="text-slate-500">{viewExpense.addedBy}</span>
              {viewExpense.imageName && <span className="text-slate-500">· {viewExpense.imageName}</span>}
            </div>
            <Input
              label="Receipt date"
              type="date"
              value={viewEditDate}
              onChange={(ev) => setViewEditDate(ev.target.value)}
              onBlur={() => {
                if (canEdit && viewEditDate !== (viewExpense.date || "")) {
                  void updateExpenseDate(viewExpense.id, viewEditDate);
                }
              }}
              readOnly={!canEdit}
              required
            />
            {(viewExpense.category || viewExpense.amount > 0) && (
              <p className="text-amber-400/90 text-xs">
                Legacy record{viewExpense.category ? ` · ${viewExpense.category}` : ""}
                {viewExpense.amount > 0 ? ` · ${formatSGD(viewExpense.amount)}` : ""}
              </p>
            )}
            {viewExpense.note && (
              <Card className="p-3 border-slate-700/50">
                <p className="text-slate-500 text-xs">Note</p>
                <p className="text-slate-300 text-sm">{viewExpense.note}</p>
              </Card>
            )}
            {expenseImageSrc(viewExpense) ? (
              <div className="rounded-xl overflow-hidden border border-slate-600 bg-[#d4d4d4] p-2">
                <StoredImage
                  src={expenseImageSrc(viewExpense)}
                  alt={viewExpense.imageName || "Receipt"}
                  className="w-full max-h-[70vh] object-contain mx-auto"
                  entity="expense"
                  recordId={viewExpense.id}
                  field="image"
                  onRefresh={() => refreshReceiptUrl(viewExpense.id)}
                />
              </div>
            ) : (
              <Card className="p-6 text-center text-slate-400 text-sm">No image on this legacy expense record.</Card>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              {canMarkAccounting(currentUser) && (
                <Btn
                  variant={viewExpense.booked ? "secondary" : "success"}
                  onClick={() => requestExpenseBookedChange(viewExpense.id)}
                  className="flex-1 justify-center"
                >
                  <BookCheck size={14} />{viewExpense.booked ? "Change accounts mark" : "Mark entered in accounts"}
                </Btn>
              )}
              {canDelete && (
                <Btn variant="danger" onClick={() => requestDeleteExpense(viewExpense)} className="flex-1 justify-center">
                  <Trash2 size={14} />Delete Receipt
                </Btn>
              )}
            </div>
          </div>
        )}
      </Modal>

      <AccountsMarkConfirmModal
        open={!!bookedConfirm}
        recordLabel={bookedConfirm?.label || ""}
        currentlyBooked={!!bookedConfirm?.currentlyBooked}
        onCancel={() => setBookedConfirm(null)}
        onSubmit={applyExpenseBookedConfirm}
      />

      <Modal
        open={!!deleteConfirm}
        onClose={deletingExpense ? undefined : () => setDeleteConfirm(null)}
        title="Delete Receipt"
        size="sm"
        priority
        backdropClose={!deletingExpense}
        footer={deleteConfirm && (
          <ConfirmModalFooter onCancel={() => { if (!deletingExpense) setDeleteConfirm(null); }} cancelDisabled={deletingExpense}>
            <Btn variant="danger" onClick={confirmDeleteExpense} disabled={deletingExpense} className="w-full sm:w-auto justify-center">
              {deletingExpense ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Delete <strong className="text-white">{deleteConfirm.imageName || deleteConfirm.date || "this receipt"}</strong>? This cannot be undone.
            </p>
            {deleteConfirm.booked && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                This receipt is marked as entered in accounts. Delete only if it was uploaded by mistake.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// DELIVERY MODULE
// ─────────────────────────────────────────────
function DeliveryModule({
  deliveries, setDeliveries, customers, invoices, whatsappGroups, setWhatsappGroups,
  addNotification, currentUser, cloudMode, users = [], onPersistDeliveries, onPersistWhatsappGroups,
}) {
  const emptyDeliveryForm = () => ({
    invoiceId: "", customerId: "", customerName: "", postalCode: "", address: "",
    schedule: "", items: "", driver: "", notes: "", status: "scheduled", assignedUserIds: [],
    photo: "", photoName: "", photoData: "", photoRemoved: false,
  });
  const deliveryToForm = (d) => ({
    invoiceId: d.invoiceId || "",
    customerId: d.customerId != null && d.customerId !== "" ? String(d.customerId) : "",
    customerName: d.customerName || "",
    postalCode: d.postalCode || "",
    address: d.address || "",
    schedule: d.schedule || "",
    items: d.items || "",
    driver: d.driver || "",
    notes: d.notes || "",
    status: d.status || "scheduled",
    assignedUserIds: normalizeAssignedUserIds(d.assignedUserIds),
    photo: d.photo || "",
    photoName: d.photoName || "",
    photoData: d.photoData || "",
    photoRemoved: false,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [editDeliveryId, setEditDeliveryId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const [form, setForm] = useState(emptyDeliveryForm());
  const isEditing = editDeliveryId != null;
  const formOpen = showAdd || isEditing;
  const [showLinkedInvoicePreview, setShowLinkedInvoicePreview] = useState(true);
  const [invoicePreviewId, setInvoicePreviewId] = useState(null);
  const [whatsappDeliveryId, setWhatsappDeliveryId] = useState(null);
  const [whatsappRecipientId, setWhatsappRecipientId] = useState("custom");
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", link: "" });
  const [postalLookupDelivery, setPostalLookupDelivery] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingDelivery, setDeletingDelivery] = useState(false);
  const [viewDeliveryId, setViewDeliveryId] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const deliveryAddressManual = useRef(false);
  const deliveryAlbumRef = useRef(null);
  const deliveryCameraRef = useRef(null);

  const hasDeliveryAccess = hasPermission(currentUser, "deliveries");
  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);

  const onDeliveryPostalChange = (value) => {
    const postalCode = value.replace(/\D/g, "").slice(0, 6);
    deliveryAddressManual.current = false;
    setForm((f) => ({ ...f, postalCode }));
    if (postalCode.length !== 6) return;
    setPostalLookupDelivery(true);
    lookupSingaporePostalAddress(postalCode).then((result) => {
      setPostalLookupDelivery(false);
      if (result?.address && !deliveryAddressManual.current) {
        setForm((f) => ({ ...f, address: result.address }));
      }
    });
  };

  const whatsappDelivery = whatsappDeliveryId != null
    ? deliveries.find((d) => sameDeliveryId(d.id, whatsappDeliveryId))
    : null;
  const viewDelivery = viewDeliveryId != null
    ? deliveries.find((d) => sameDeliveryId(d.id, viewDeliveryId))
    : null;

  const refreshDeliveryPhoto = useCallback(async (deliveryId) => {
    if (!isSupabaseConfigured) return;
    try {
      const result = await db.refreshDeliveryPhotoUrl(deliveryId);
      const nextPhoto = result?.photo || result?.url;
      if (nextPhoto) {
        setDeliveries((prev) => prev.map((d) => (
          sameDeliveryId(d.id, deliveryId) ? { ...d, photo: nextPhoto } : d
        )));
      }
    } catch {
      /* signed URL refresh failed — photoData fallback may still work */
    }
  }, [setDeliveries]);

  useEffect(() => {
    if (!viewDelivery?.id || viewDelivery.photoData || !isSupabaseConfigured) return;
    if (viewDelivery.photo?.startsWith("http")) {
      refreshDeliveryPhoto(viewDelivery.id);
    }
  }, [viewDeliveryId, viewDelivery?.id, viewDelivery?.photo, viewDelivery?.photoData, refreshDeliveryPhoto]);

  const todayStr = today();
  const filtered = deliveries
    .filter((d) => (filter === "all" || d.status === filter) && isAppVisibleDelivery(d))
    .sort((a, b) => (a.schedule || "").localeCompare(b.schedule || ""));
  const hiddenDeliveryCount = deliveries.filter((d) => !isAppVisibleDelivery(d)).length;
  const deliveryPage = usePagination(filtered, LIST_PAGE_SIZE, `${filter}-${viewMode}`);

  const todaysRoute = useMemo(() => {
    const pending = deliveries
      .filter((d) => isAppVisibleDelivery(d) && (d.schedule || "").startsWith(todayStr) && ["scheduled", "transit"].includes(d.status))
      .sort((a, b) => (a.schedule || "").localeCompare(b.schedule || ""));
    const grouped = {};
    pending.forEach((d) => {
      const area = resolveDeliveryArea(d, customers);
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(d);
    });
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  }, [deliveries, customers, todayStr]);

  if (!hasDeliveryAccess) return <AccessDenied moduleName="Deliveries" />;

  const linkedInvoice = form.invoiceId ? invoices.find((i) => i.id === form.invoiceId) : null;
  const linkedInvoiceDoc = linkedInvoice ? enrichInvoiceCustomer(linkedInvoice, customers) : null;
  const linkableInvoices = [...invoices]
    .filter((i) => getInvoiceStatus(i) !== "cancelled")
    .sort((a, b) => `${b.date || ""}${b.id}`.localeCompare(`${a.date || ""}${a.id}`));

  const resetDeliveryPhotoInputs = () => {
    if (deliveryAlbumRef.current) deliveryAlbumRef.current.value = "";
    if (deliveryCameraRef.current) deliveryCameraRef.current.value = "";
  };

  const closeDeliveryForm = () => {
    setShowAdd(false);
    setEditDeliveryId(null);
    setForm(emptyDeliveryForm());
    setShowLinkedInvoicePreview(true);
    deliveryAddressManual.current = false;
    setPostalLookupDelivery(false);
    setPhotoUploading(false);
    resetDeliveryPhotoInputs();
  };

  const handleDeliveryPhotoPick = async (file) => {
    if (!canEdit || !file) return;
    try {
      setPhotoUploading(true);
      const { dataUrl, name } = await compressDeliveryPhoto(file);
      setForm((f) => ({
        ...f,
        photoData: dataUrl,
        photoName: name,
        photo: "",
        photoRemoved: false,
      }));
    } catch (err) {
      addNotification({ type: "error", title: "Upload Failed", message: err?.message || "Could not process image." });
    } finally {
      setPhotoUploading(false);
      resetDeliveryPhotoInputs();
    }
  };

  const removeDeliveryPhoto = () => {
    setForm((f) => ({
      ...f,
      photo: "",
      photoName: "",
      photoData: "",
      photoRemoved: true,
    }));
    resetDeliveryPhotoInputs();
  };

  const applyDeliveryPhotoFields = (delivery) => {
    if (form.photoRemoved) {
      return { ...delivery, photo: "", photoName: "", photoData: "" };
    }
    if (form.photoData) {
      return {
        ...delivery,
        photoData: form.photoData,
        photoName: form.photoName || delivery.photoName || "",
        photo: "",
      };
    }
    return {
      ...delivery,
      photo: form.photo || delivery.photo || "",
      photoName: form.photoName || delivery.photoName || "",
      photoData: "",
    };
  };

  const openAddDelivery = () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setEditDeliveryId(null);
    setForm(emptyDeliveryForm());
    setShowLinkedInvoicePreview(true);
    deliveryAddressManual.current = false;
    setPostalLookupDelivery(false);
    setShowAdd(true);
  };

  const openEditDelivery = (d) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setShowAdd(false);
    setEditDeliveryId(d.id);
    setForm(deliveryToForm(d));
    setShowLinkedInvoicePreview(true);
    deliveryAddressManual.current = false;
    setPostalLookupDelivery(false);
  };

  const saveDelivery = async () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (photoUploading) return;
    let built;
    let existing = null;
    if (isEditing) {
      existing = deliveries.find((d) => sameDeliveryId(d.id, editDeliveryId));
      if (!existing) {
        addNotification({ type: "error", title: "Not Found", message: "Delivery record no longer exists." });
        closeDeliveryForm();
        return;
      }
      built = buildUpdatedDeliveryRecord(form, existing, { customers, invoices, deliveries, users });
    } else {
      built = buildNewDeliveryRecord(form, {
        customers, invoices, createdBy: currentUser?.name || "Staff", users,
      });
    }
    if (!built.ok) {
      addNotification({
        type: "error",
        title: isEditing ? "Cannot Save Delivery" : "Cannot Schedule Delivery",
        message: built.message,
      });
      return;
    }
    let d = applyDeliveryPhotoFields(built.delivery);
    const deliveriesSnapshot = deliveries;
    try {
      if (d.photoData?.startsWith?.("data:image")) {
        setPhotoUploading(true);
        if (isSupabaseConfigured) {
          const result = await db.uploadDeliveryPhoto(d.id, d.photoData, d.photoName);
          d = { ...d, photo: result?.photo || result?.photoPath || "", photoData: "" };
        }
      }
      const nextDeliveries = isEditing
        ? deliveriesSnapshot.map((row) => (sameDeliveryId(row.id, editDeliveryId) ? d : row))
        : [...deliveriesSnapshot, d];
      if (cloudMode && onPersistDeliveries) {
        await onPersistDeliveries(nextDeliveries);
      }
      setDeliveries(nextDeliveries);
      if (isEditing) {
        addNotification({ type: "success", title: "Delivery Updated", message: `${editDeliveryId} saved.` });
        if (newlyAssignedUserIds(existing.assignedUserIds, d.assignedUserIds).length) {
          notifyAssignmentChange({
            isNew: false,
            previousAssignedUserIds: existing.assignedUserIds,
            nextAssignedUserIds: d.assignedUserIds,
            title: "Delivery Assigned",
            message: `${d.id} → ${d.customerName}`,
            url: "/?tab=deliveries",
            actor: currentUser?.name,
            actorRole: currentUser?.role,
          });
        }
      } else {
        const scheduleMsg = d.invoiceId ? `${d.id} linked to ${d.invoiceId} → ${d.customerName}` : `${d.id} → ${d.customerName}`;
        if (hasAssignedTeam(d.assignedUserIds)) {
          addNotification({ type: "success", title: "Delivery Scheduled", message: scheduleMsg, team: false });
          notifyAssignmentChange({
            isNew: true,
            nextAssignedUserIds: d.assignedUserIds,
            title: "Delivery Assigned",
            message: scheduleMsg,
            url: "/?tab=deliveries",
            actor: currentUser?.name,
            actorRole: currentUser?.role,
          });
        } else {
          addNotification({
            type: "info",
            title: "Delivery Scheduled",
            message: scheduleMsg,
          });
        }
      }
      closeDeliveryForm();
    } catch (err) {
      setDeliveries(deliveriesSnapshot);
      addNotification({ type: "error", title: "Save Failed", message: err?.message || "Could not save delivery to cloud." });
    } finally {
      setPhotoUploading(false);
    }
  };

  const requestDeleteDelivery = (d) => {
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    setDeleteConfirm(d);
  };

  const confirmDeleteDelivery = async () => {
    if (!deleteConfirm || deletingDelivery) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const d = deleteConfirm;
    const snapshot = deliveries;
    setDeletingDelivery(true);
    const nextDeliveries = snapshot.filter((x) => !sameDeliveryId(x.id, d.id));
    try {
      await writeCloudFirst({
        snapshot,
        next: nextDeliveries,
        setState: (n) => {
          setDeliveries(n);
          if (sameDeliveryId(editDeliveryId, d.id)) closeDeliveryForm();
          if (sameDeliveryId(whatsappDeliveryId, d.id)) closeWhatsappPicker();
          if (sameDeliveryId(viewDeliveryId, d.id)) setViewDeliveryId(null);
        },
        flush: onPersistDeliveries ? (n) => onPersistDeliveries(n) : undefined,
        deleteMeta: onPersistDeliveries ? { entity: "deliveries", id: d.id } : undefined,
      });
      addNotification({ type: "info", title: "Delivery Deleted", message: `${d.id} removed.` });
      setDeleteConfirm(null);
    } catch (err) {
      addNotification({
        type: "error",
        title: "Delete Failed",
        message: err?.message || "Could not remove delivery. Try again.",
      });
    } finally {
      setDeletingDelivery(false);
    }
  };

  const selectDeliveryInvoice = (invoiceId) => {
    if (!invoiceId) {
      setForm((f) => ({ ...f, invoiceId: "" }));
      return;
    }
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const enriched = enrichInvoiceCustomer(inv, customers);
    deliveryAddressManual.current = false;
    setForm((f) => ({
      ...f,
      ...invoiceDeliveryFields(enriched, customers),
      schedule: f.schedule,
      driver: f.driver,
      notes: f.notes,
      status: f.status,
    }));
    setShowLinkedInvoicePreview(true);
  };

  const selectDeliveryCustomer = (customerId) => {
    if (!customerId) {
      deliveryAddressManual.current = false;
      setForm((f) => ({ ...f, invoiceId: "", customerId: "", customerName: "", postalCode: "", address: "" }));
      return;
    }
    const c = customers.find((x) => sameCustomerId(x.id, customerId));
    deliveryAddressManual.current = false;
    setForm((f) => ({ ...f, invoiceId: "", ...customerDeliveryFields(c), schedule: f.schedule, items: f.items, driver: f.driver, notes: f.notes, status: f.status }));
  };

  const updateStatus = async (id, status) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const current = deliveries.find((d) => sameDeliveryId(d.id, id));
    if (!current) return;
    const built = buildDeliveryStatusPatch(status, current);
    if (!built.ok) {
      addNotification({ type: "error", title: "Invalid Status", message: built.message });
      return;
    }
    const snapshot = deliveries;
    const nextDeliveries = snapshot.map((d) => (
      sameDeliveryId(d.id, id) ? touchUpdatedAt({ ...d, ...built.patch }) : d
    ));
    try {
      if (cloudMode && onPersistDeliveries) {
        await onPersistDeliveries(nextDeliveries);
      }
      setDeliveries(nextDeliveries);
    } catch (err) {
      setDeliveries(snapshot);
      addNotification({
        type: "error",
        title: "Update Failed",
        message: err?.message || "Could not save delivery status to cloud.",
      });
      return;
    }
    if (status === "delivered") {
      addNotification({ type: "success", title: "Delivery Completed", message: `${id} delivered successfully!` });
    } else if (status === "transit") {
      addNotification({ type: "info", title: "Out for Delivery", message: `${id} is now in transit.` });
    } else if (status === "cancelled") {
      addNotification({ type: "info", title: "Delivery Cancelled", message: `${id} has been cancelled.` });
    }
  };

  const statusFlow = { scheduled: ["transit", "cancelled"], transit: ["delivered", "cancelled"], delivered: [], cancelled: [] };

  const whatsappRecipients = whatsappDelivery
    ? buildDeliveryWhatsAppRecipients(whatsappDelivery, customers, whatsappGroups)
    : [];

  const persistWhatsappGroups = (groups) => {
    setWhatsappGroups(groups);
    if (!cloudMode) saveWhatsappGroups(groups);
  };

  const addWhatsappGroup = async () => {
    const name = groupForm.name.trim();
    const link = normalizeWhatsAppGroupLink(groupForm.link);
    if (!name) {
      addNotification({ type: "error", title: "Name Required", message: "Enter a group name." });
      return;
    }
    if (!link.includes("chat.whatsapp.com")) {
      addNotification({ type: "error", title: "Invalid Link", message: "Paste a WhatsApp group invite link (chat.whatsapp.com/...)." });
      return;
    }
    const snapshot = whatsappGroups;
    const nextGroups = [...snapshot, touchUpdatedAt({ id: genId("GRP"), name, link })];
    try {
      await writeCloudFirst({
        snapshot,
        next: nextGroups,
        setState: persistWhatsappGroups,
        flush: cloudMode && onPersistWhatsappGroups ? (n) => onPersistWhatsappGroups(n) : undefined,
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Save Failed",
        message: err?.message || "Could not save WhatsApp group to cloud.",
      });
      return;
    }
    setGroupForm({ name: "", link: "" });
    addNotification({ type: "success", title: "Group Saved", message: `${name} added to WhatsApp groups.` });
  };

  const deleteWhatsappGroup = async (id) => {
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const snapshot = whatsappGroups;
    const nextGroups = snapshot.filter((g) => g.id !== id);
    try {
      await writeCloudFirst({
        snapshot,
        next: nextGroups,
        setState: persistWhatsappGroups,
        flush: cloudMode && onPersistWhatsappGroups ? (n) => onPersistWhatsappGroups(n) : undefined,
        deleteMeta: cloudMode && onPersistWhatsappGroups ? { entity: "whatsapp_groups", id } : undefined,
      });
    } catch (err) {
      addNotification({
        type: "error",
        title: "Delete Failed",
        message: err?.message || "Could not remove WhatsApp group. Try again.",
      });
      return;
    }
  };

  const openWhatsappPicker = (d) => {
    const recipients = buildDeliveryWhatsAppRecipients(d, customers, whatsappGroups);
    setWhatsappDeliveryId(d.id);
    setWhatsappRecipientId(recipients.find((r) => r.id === "delivery-customer")?.id || recipients[0]?.id || "custom");
    setWhatsappDraft("");
  };

  const closeWhatsappPicker = () => {
    setWhatsappDeliveryId(null);
    setWhatsappRecipientId("custom");
    setWhatsappDraft("");
  };

  const confirmSendDeliveryWhatsapp = async () => {
    if (!whatsappDelivery) return;
    let recipient;
    if (whatsappRecipientId === "custom") {
      const phone = whatsappDraft.trim();
      if (!phone) {
        addNotification({ type: "error", title: "WhatsApp Required", message: "Enter a WhatsApp number (e.g. +65 9123 4567)." });
        return;
      }
      recipient = { type: "phone", phone, label: phone };
    } else {
      recipient = whatsappRecipients.find((r) => r.id === whatsappRecipientId);
      if (!recipient) {
        addNotification({ type: "error", title: "No Recipient", message: "Select who to send to." });
        return;
      }
    }
    try {
      const result = await sendDeliveryToRecipient(whatsappDelivery, recipient);
      closeWhatsappPicker();
      if (result.mode === "group") {
        addNotification({ type: "success", title: "Group Opened", message: `Message copied — paste in ${result.label}.` });
      } else if (result.mode === "share") {
        addNotification({ type: "success", title: "WhatsApp Opened", message: "Choose a chat or group, then send." });
      } else {
        addNotification({ type: "success", title: "WhatsApp Opened", message: `Delivery schedule ready for ${result.label}. Review and send.` });
      }
    } catch (err) {
      addNotification({ type: "error", title: "WhatsApp Failed", message: err?.message || "Could not open WhatsApp." });
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Deliveries</h2>
          <p className="text-slate-400 text-sm">Singapore delivery management</p>
        </div>
        <Btn variant="secondary" onClick={() => setShowManageGroups(true)} className="w-full sm:w-auto justify-center shrink-0">
          <Users size={16} />WhatsApp Groups
        </Btn>
      </div>
      {canEdit && (
        <Fab onClick={openAddDelivery} label="Schedule Delivery" hidden={formOpen || !!invoicePreviewId || showManageGroups || !!whatsappDelivery || !!deleteConfirm || viewDeliveryId != null} />
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {[
          { id: "list", label: "All deliveries" },
          { id: "route", label: "Today's route" },
        ].map((v) => (
          <button key={v.id} type="button" onClick={() => setViewMode(v.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 touch-manipulation ${viewMode === v.id ? "bg-emerald-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
            {v.label}
          </button>
        ))}
        {viewMode === "list" && ["all", "scheduled", "transit", "delivered", "cancelled"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 touch-manipulation ${filter === s ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{s}</button>
        ))}
      </div>

      {viewMode === "route" && (
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Navigation size={14} className="text-emerald-400" />
            Today&apos;s route — {todayStr}
          </h3>
          <p className="text-slate-500 text-xs mb-4">Pending deliveries grouped by area</p>
          {todaysRoute.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No scheduled or in-transit deliveries for today.</p>
          ) : todaysRoute.map(([area, stops]) => (
            <div key={area} className="mb-4 last:mb-0">
              <p className="text-cyan-400 text-xs font-bold uppercase tracking-wide mb-2">{area} ({stops.length})</p>
              <div className="space-y-2">
                {stops.map((d) => (
                  <div key={d.id} className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 text-sm">
                    <div className="flex justify-between gap-2">
                      <p className="text-white font-medium">{d.customerName}</p>
                      <Badge className={statusColor[d.status]}>{d.status}</Badge>
                    </div>
                    <p className="text-slate-400 text-xs mt-1 flex items-start gap-1">
                      <MapPin size={10} className="mt-0.5 shrink-0" />
                      {formatDeliveryLocation(d) || "No address"}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      <span><Clock size={10} className="inline mr-1" />{formatDeliverySchedule(d.schedule)}</span>
                      {d.items && <span>{d.items}</span>}
                      {d.driver && <span>Driver: {d.driver}</span>}
                    </div>
                    {canEdit && ["scheduled", "transit"].includes(d.status) && (
                      <div className="flex gap-2 mt-2">
                        {d.status === "scheduled" && (
                          <Btn variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => updateStatus(d.id, "transit")}>
                            <Truck size={12} /> Out for delivery
                          </Btn>
                        )}
                        <Btn variant="success" size="sm" className="flex-1 justify-center" onClick={() => updateStatus(d.id, "delivered")}>
                          <CheckCircle size={12} /> Mark as Delivered
                        </Btn>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}
      {viewMode === "list" && hiddenDeliveryCount > 0 && filter === "all" && (
        <p className="text-xs text-slate-500">{hiddenDeliveryCount} completed delivery{hiddenDeliveryCount === 1 ? "" : "ies"} older than 6 months hidden</p>
      )}

      {viewMode === "list" && <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🚚"
              title={deliveries.length === 0 ? "No deliveries yet" : "No deliveries match this filter"}
              hint={deliveries.length === 0 ? "Schedule fish deliveries to customers" : "Try a different status tab"}
              actionLabel={deliveries.length === 0 && canEdit ? "Schedule first delivery" : undefined}
              onAction={deliveries.length === 0 && canEdit ? openAddDelivery : undefined}
            />
          </Card>
        ) :
          deliveryPage.paginatedItems.map(d => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                {deliveryPhotoSrc(d) ? (
                  <button
                    type="button"
                    onClick={() => setViewDeliveryId(d.id)}
                    className="shrink-0 rounded-lg overflow-hidden border border-slate-700 hover:border-cyan-500/40 transition-colors"
                    title="View delivery photo"
                  >
                    <StoredImage
                      src={deliveryPhotoSrc(d)}
                      alt={d.photoName || "Delivery photo"}
                      className="w-16 h-16 object-cover"
                      entity="delivery"
                      recordId={d.id}
                      field="photo"
                      onRefresh={() => refreshDeliveryPhoto(d.id)}
                    />
                  </button>
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-mono text-cyan-400 text-xs font-bold">{d.id}</span>
                    {d.invoiceId && <span className="font-mono text-purple-400/90 text-xs">{d.invoiceId}</span>}
                    <Badge className={statusColor[d.status]}>{d.status}</Badge>
                  </div>
                  <p className="text-white font-bold">{d.customerName}</p>
                  {formatDeliveryLocation(d) ? (
                    <>
                      <p className="text-slate-400 text-sm flex items-start gap-1 mt-0.5">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span>{formatDeliveryLocation(d)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => openDeliveryMap(d, "google")}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-600 hover:bg-slate-700 hover:border-cyan-500/40 transition-colors touch-manipulation"
                        >
                          <Navigation size={12} className="text-cyan-400" />
                          Google Maps
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeliveryMap(d, "apple")}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-600 hover:bg-slate-700 hover:border-cyan-500/40 transition-colors touch-manipulation"
                        >
                          <Navigation size={12} className="text-cyan-400" />
                          Apple Maps
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-500 text-sm flex items-center gap-1"><MapPin size={12} />No address</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                    <span><Clock size={10} className="inline mr-1" />{formatDeliverySchedule(d.schedule)}</span>
                    {d.items && <span>Items: {d.items}</span>}
                    {d.driver && <span>Driver: {d.driver}</span>}
                  </div>
                  {d.notes && <p className="text-slate-500 text-xs mt-1 italic">{d.notes}</p>}
                  <AssigneeBadges users={users} assignedUserIds={d.assignedUserIds} className="mt-1" />
                  {d.createdBy && <p className="text-slate-600 text-[10px] mt-1">Scheduled by {d.createdBy}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  {deliveryPhotoSrc(d) && (
                    <Btn variant="ghost" size="sm" onClick={() => setViewDeliveryId(d.id)} title="View delivery">
                      <Eye size={14} className="text-cyan-400" />
                    </Btn>
                  )}
                  {canEdit && (
                    <Btn variant="ghost" size="sm" onClick={() => openEditDelivery(d)} title="Edit delivery">
                      <Edit2 size={14} className="text-cyan-400" />
                    </Btn>
                  )}
                  {canDelete && (
                    <Btn variant="ghost" size="sm" onClick={() => requestDeleteDelivery(d)} title="Delete delivery">
                      <Trash2 size={14} className="text-red-400" />
                    </Btn>
                  )}
                  {d.status !== "cancelled" && (
                    <Btn variant="ghost" size="sm" onClick={() => openWhatsappPicker(d)} title="Send schedule on WhatsApp">
                      <MessageSquare size={14} className="text-emerald-400" />
                    </Btn>
                  )}
                  {d.invoiceId && (
                    <Btn variant="ghost" size="sm" onClick={() => setInvoicePreviewId(d.invoiceId)} title="View linked invoice">
                      <Eye size={14} />
                    </Btn>
                  )}
                  {canEdit && (statusFlow[d.status] ?? []).map(next => (
                    <Btn key={next} variant={next === "delivered" ? "success" : next === "cancelled" ? "danger" : "secondary"} size="sm"
                      onClick={() => updateStatus(d.id, next)}>
                      {next === "delivered" ? <Check size={12} /> : next === "transit" ? <Truck size={12} /> : <X size={12} />}
                      {next}
                    </Btn>
                  ))}
                </div>
              </div>
            </Card>
          ))
        }
        <PaginationControls {...deliveryPage} reserveFabSpace />
      </div>}

      <Modal
        open={formOpen}
        onClose={closeDeliveryForm}
        title={isEditing ? `Edit Delivery ${editDeliveryId}` : "Schedule Delivery"}
        size={form.invoiceId && showLinkedInvoicePreview ? "xl" : "lg"}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <Select
            label="Link to Invoice"
            value={form.invoiceId}
            onChange={(e) => selectDeliveryInvoice(e.target.value)}
            className="sm:col-span-2"
            options={[
              { value: "", label: "-- No invoice --" },
              ...linkableInvoices.map((inv) => ({
                value: inv.id,
                label: `${inv.id} — ${inv.customerName} (${formatSGD(calcInvoiceAmounts(inv).total)})`,
              })),
            ]}
          />
          {form.invoiceId && (
            <div className="sm:col-span-2 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-purple-300/90">
                  Address and items filled from {form.invoiceId}. Compare with invoice below.
                </p>
                <Btn variant="ghost" size="sm" onClick={() => setShowLinkedInvoicePreview((v) => !v)} className="shrink-0">
                  <Eye size={14} />{showLinkedInvoicePreview ? "Hide Invoice" : "View Invoice"}
                </Btn>
              </div>
              {showLinkedInvoicePreview && linkedInvoiceDoc && (
                <div className="rounded-xl border border-slate-600 bg-[#d4d4d4] p-3 sm:p-4 overflow-y-auto max-h-[min(50vh,480px)]">
                  <InvoiceDocument invoice={linkedInvoiceDoc} className="shadow-lg" />
                </div>
              )}
            </div>
          )}
          <Select label="Customer" value={form.customerId}
            onChange={e => selectDeliveryCustomer(e.target.value)}
            options={[{ value: "", label: "-- Select --" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
          <Input label="Postal Code" value={form.postalCode} onChange={e => onDeliveryPostalChange(e.target.value)} placeholder="e.g. 521123" inputMode="numeric" />
          <Input
            label="Address Details"
            value={form.address}
            onChange={e => { deliveryAddressManual.current = true; setForm(f => ({ ...f, address: e.target.value })); }}
            placeholder="Blk / Unit / Street — auto-fills from postal code"
            required
            className="sm:col-span-2"
          />
          {postalLookupDelivery && <p className="sm:col-span-2 text-xs text-cyan-400/80">Looking up address…</p>}
          {form.customerId && form.address && !form.invoiceId && (
            <p className="sm:col-span-2 text-xs text-cyan-400/80">Filled from customer profile — edit postal or address if this delivery goes elsewhere.</p>
          )}
          <Input label="Schedule" type="datetime-local" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} required className="w-full max-w-full" />
          {isEditing && (
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              options={[
                { value: "scheduled", label: "Scheduled" },
                { value: "transit", label: "In transit" },
                { value: "delivered", label: "Delivered" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          )}
          <StaffAssignPicker
            className="sm:col-span-2"
            users={users}
            value={form.assignedUserIds}
            onChange={(assignedUserIds) => setForm((f) => ({ ...f, assignedUserIds }))}
            excludeUserId={currentUser?.id}
          />
          <Textarea label="Items" value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} placeholder="e.g. 1x Super Red Arowana, 2x Koi Pellets" className="sm:col-span-2" rows={2} />
          <div className="sm:col-span-2 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Delivery Photo (optional)</p>
            <input
              ref={deliveryAlbumRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(ev) => handleDeliveryPhotoPick(ev.target.files?.[0])}
            />
            <input
              ref={deliveryCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(ev) => handleDeliveryPhotoPick(ev.target.files?.[0])}
            />
            {photoUploading && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                <RefreshCw size={14} className="animate-spin shrink-0" />
                <span>Processing photo…</span>
              </div>
            )}
            {deliveryPhotoSrc({ photo: form.photoRemoved ? "" : form.photo, photoData: form.photoData }) ? (
              <div className="rounded-xl overflow-hidden border border-slate-600 bg-slate-900 relative">
                <img
                  src={deliveryPhotoSrc({ photo: form.photoRemoved ? "" : form.photo, photoData: form.photoData })}
                  alt="Delivery preview"
                  className="w-full max-h-[40vh] object-contain"
                />
                {canEdit && (
                  <Btn variant="danger" size="sm" onClick={removeDeliveryPhoto} className="absolute top-2 right-2">
                    <Trash2 size={12} />Remove
                  </Btn>
                )}
              </div>
            ) : canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Btn variant="secondary" size="sm" onClick={() => deliveryCameraRef.current?.click()} disabled={photoUploading}>
                  <Camera size={14} />Take Photo
                </Btn>
                <Btn variant="secondary" size="sm" onClick={() => deliveryAlbumRef.current?.click()} disabled={photoUploading}>
                  <Images size={14} />Choose Photo
                </Btn>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No photo attached.</p>
            )}
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="sm:col-span-2" rows={2} />
        </div>
        <div className="modal-actions">
          {isEditing && canDelete && (
            <Btn variant="danger" onClick={() => {
              const d = deliveries.find((x) => sameDeliveryId(x.id, editDeliveryId));
              if (d) requestDeleteDelivery(d);
            }} className="mr-auto"><Trash2 size={14} />Delete</Btn>
          )}
          <Btn variant="secondary" onClick={closeDeliveryForm}>Cancel</Btn>
          <Btn onClick={saveDelivery} disabled={!canEdit || photoUploading}>
            <Truck size={14} />{photoUploading ? "Saving…" : (isEditing ? "Save Changes" : "Schedule")}
          </Btn>
        </div>
      </Modal>

      <Modal
        open={!!viewDelivery}
        onClose={() => setViewDeliveryId(null)}
        title={viewDelivery ? `Delivery ${viewDelivery.id}` : "Delivery"}
        size="lg"
      >
        {viewDelivery && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusColor[viewDelivery.status]}>{viewDelivery.status}</Badge>
              {viewDelivery.invoiceId && <span className="font-mono text-purple-400/90 text-xs">{viewDelivery.invoiceId}</span>}
            </div>
            <div>
              <p className="text-white font-bold text-lg">{viewDelivery.customerName}</p>
              {formatDeliveryLocation(viewDelivery) ? (
                <p className="text-slate-400 text-sm flex items-start gap-1 mt-1">
                  <MapPin size={12} className="mt-0.5 shrink-0" />
                  <span>{formatDeliveryLocation(viewDelivery)}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                <span><Clock size={10} className="inline mr-1" />{formatDeliverySchedule(viewDelivery.schedule)}</span>
                {viewDelivery.items && <span>Items: {viewDelivery.items}</span>}
                {viewDelivery.driver && <span>Driver: {viewDelivery.driver}</span>}
              </div>
              {viewDelivery.notes && <p className="text-slate-400 text-sm mt-2 italic">{viewDelivery.notes}</p>}
              <AssigneeBadges users={users} assignedUserIds={viewDelivery.assignedUserIds} className="mt-2" />
            </div>
            {deliveryPhotoSrc(viewDelivery) ? (
              <div className="rounded-xl overflow-hidden border border-slate-600 bg-[#d4d4d4] p-2">
                <StoredImage
                  src={deliveryPhotoSrc(viewDelivery)}
                  alt={viewDelivery.photoName || "Delivery photo"}
                  className="w-full max-h-[70vh] object-contain mx-auto"
                  entity="delivery"
                  recordId={viewDelivery.id}
                  field="photo"
                  onRefresh={() => refreshDeliveryPhoto(viewDelivery.id)}
                />
              </div>
            ) : (
              <Card className="p-6 text-center text-slate-400 text-sm">No photo on this delivery.</Card>
            )}
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Btn variant="secondary" size="sm" onClick={() => { setViewDeliveryId(null); openEditDelivery(viewDelivery); }}>
                  <Edit2 size={14} />Edit Delivery
                </Btn>
              )}
              {viewDelivery.status !== "cancelled" && (
                <Btn variant="success" size="sm" onClick={() => { setViewDeliveryId(null); openWhatsappPicker(viewDelivery); }}>
                  <MessageSquare size={14} />WhatsApp
                </Btn>
              )}
              {viewDelivery.invoiceId && (
                <Btn variant="ghost" size="sm" onClick={() => { setViewDeliveryId(null); setInvoicePreviewId(viewDelivery.invoiceId); }}>
                  <Eye size={14} />View Invoice
                </Btn>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!invoicePreviewId} onClose={() => setInvoicePreviewId(null)} title={`Invoice ${invoicePreviewId || ""}`} size="full">
        {invoicePreviewId && (() => {
          const inv = invoices.find((i) => String(i.id) === String(invoicePreviewId));
          if (!inv) return <p className="text-slate-400 text-sm">Invoice not found.</p>;
          return (
            <div className="rounded-xl border border-slate-600 bg-[#d4d4d4] p-2 sm:p-6 min-w-0 max-w-full overflow-x-hidden overflow-y-auto max-h-[min(65vh,920px)]">
              <InvoicePreviewFrame resetKey={invoicePreviewId || ''}>
                <InvoiceDocument invoice={enrichInvoiceCustomer(inv, customers)} preview className="shadow-2xl" />
              </InvoicePreviewFrame>
            </div>
          );
        })()}
      </Modal>

      <Modal open={showManageGroups} onClose={() => { setShowManageGroups(false); setGroupForm({ name: "", link: "" }); }} title="WhatsApp Groups" size="md">
        <div className="space-y-4">
          <p className="text-slate-400 text-sm">
            Save your team WhatsApp group invite links. Paste the link from WhatsApp → Group info → Invite via link.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Group name" value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Delivery Team" />
            <Input label="Invite link" value={groupForm.link} onChange={(e) => setGroupForm((f) => ({ ...f, link: e.target.value }))} placeholder="https://chat.whatsapp.com/..." className="sm:col-span-2" />
          </div>
          <Btn onClick={addWhatsappGroup} className="w-full sm:w-auto justify-center"><Plus size={14} />Add Group</Btn>
          {whatsappGroups.length === 0 ? (
            <Card className="p-6 text-center text-slate-500 text-sm">No groups saved yet</Card>
          ) : (
            <div className="space-y-2">
              {whatsappGroups.map((g) => (
                <Card key={g.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{g.name}</p>
                    <p className="text-slate-500 text-xs truncate">{g.link}</p>
                  </div>
                  {canDelete && <Btn variant="danger" size="sm" onClick={() => deleteWhatsappGroup(g.id)}><Trash2 size={12} /></Btn>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={!!whatsappDelivery} onClose={closeWhatsappPicker} title="Send Delivery on WhatsApp" size="md">
        {whatsappDelivery && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Send <span className="font-mono text-cyan-400">{whatsappDelivery.id}</span> schedule to:
            </p>
            <Select
              label="Send to"
              value={whatsappRecipientId}
              onChange={(e) => setWhatsappRecipientId(e.target.value)}
              options={[
                ...whatsappRecipients.map((r) => ({
                  value: r.id,
                  label: formatDeliveryRecipientLabel(r),
                })),
                { value: "custom", label: "Other number..." },
              ]}
            />
            {whatsappRecipientId === "custom" && (
              <Input
                label="WhatsApp number"
                value={whatsappDraft}
                onChange={(e) => setWhatsappDraft(e.target.value)}
                placeholder="+65 9123 4567"
              />
            )}
            {whatsappGroups.length === 0 && (
              <p className="text-xs text-slate-500">
                Add saved groups via <button type="button" className="text-cyan-400 hover:underline" onClick={() => { closeWhatsappPicker(); setShowManageGroups(true); }}>WhatsApp Groups</button>.
              </p>
            )}
            <div className="modal-actions !mt-0">
              <Btn variant="secondary" onClick={closeWhatsappPicker}>Cancel</Btn>
              <Btn variant="success" onClick={confirmSendDeliveryWhatsapp}><Send size={14} />Open WhatsApp</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Delivery"
        size="sm"
        footer={deleteConfirm && (
          <ConfirmModalFooter onCancel={() => { if (!deletingDelivery) setDeleteConfirm(null); }} cancelDisabled={deletingDelivery}>
            <Btn variant="danger" onClick={confirmDeleteDelivery} disabled={deletingDelivery} className="w-full sm:w-auto justify-center">
              {deletingDelivery ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Delete <strong className="text-white font-mono">{deleteConfirm.id}</strong> for {deleteConfirm.customerName}? This cannot be undone.
            </p>
            {deleteConfirm.invoiceId && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                Linked to invoice {deleteConfirm.invoiceId}. The invoice will remain — only this delivery record is removed.
              </p>
            )}
            {["scheduled", "transit"].includes(deleteConfirm.status) && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                This delivery is still {deleteConfirm.status === "transit" ? "in transit" : "scheduled"}.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// CALENDAR MODULE
// ─────────────────────────────────────────────
function CalendarEventCard({ e, users, canEdit, canDelete, onEdit, onDelete, onNavigateToPonds }) {
  const isPondLinked = Boolean(e.pondReminderId);
  return (
    <div className={`p-3 rounded-xl border ${eventTypeColor[e.type] || eventTypeColor.other} flex items-start justify-between gap-3`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {isPondLinked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-2 py-0.5">
              <Droplets size={10} />Pond reminder
            </span>
          )}
        </div>
        <p className="font-bold text-sm">{e.time && `${e.time} · `}{e.title}</p>
        <p className="text-xs opacity-70">{e.date}{e.type ? ` · ${e.type}` : ""}</p>
        {e.note && <p className="text-xs mt-1 opacity-60">{e.note}</p>}
        <AssigneeBadges users={users} assignedUserIds={e.assignedUserIds} className="mt-1" />
        {e.createdBy && <p className="text-[10px] mt-1 opacity-50">Added by {e.createdBy}</p>}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        {isPondLinked ? (
          onNavigateToPonds && (
            <button type="button" onClick={onNavigateToPonds} className="opacity-60 hover:opacity-100 touch-manipulation text-[10px] text-cyan-400 font-semibold" title="Open Pond Management">
              Pond →
            </button>
          )
        ) : (
          <>
            {canEdit && (
              <button type="button" onClick={() => onEdit(e)} className="opacity-60 hover:opacity-100 touch-manipulation" title="Edit event">
                <Edit2 size={12} className="text-cyan-400" />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={() => onDelete(e)} className="opacity-60 hover:opacity-100 touch-manipulation" title="Delete event">
                <Trash2 size={12} className="text-red-400" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CalendarModule({ events, setEvents, onNavigateToPonds, addNotification, currentUser, users = [], onPersistEvents }) {
  const savingEventRef = useRef(false);
  const lastEventSaveErrorRef = useRef("");
  const emptyEventForm = () => ({ title: "", date: today(), time: "09:00", type: "other", note: "", assignedUserIds: [] });
  const eventToForm = (e) => ({
    title: e.title || "",
    date: e.date || today(),
    time: e.time || "09:00",
    type: e.type || "other",
    note: e.note || "",
    assignedUserIds: normalizeAssignedUserIds(e.assignedUserIds),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editEventId, setEditEventId] = useState(null);
  const [form, setForm] = useState(emptyEventForm());
  const [showAllPast, setShowAllPast] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(false);

  const commitEventList = async (buildNext) => {
    if (savingEventRef.current) {
      lastEventSaveErrorRef.current = "Another save is in progress. Wait a moment and try again.";
      return null;
    }
    let nextList = null;
    let snapshot = null;
    let unchanged = false;
    setEvents((prev) => {
      snapshot = prev;
      const built = buildNext(prev);
      if (built === prev) {
        unchanged = true;
        return prev;
      }
      nextList = built;
      return nextList;
    });
    if (unchanged || !nextList) {
      lastEventSaveErrorRef.current = "Nothing to save.";
      return null;
    }

    if (!onPersistEvents) {
      if (isSupabaseConfigured) {
        lastEventSaveErrorRef.current = "Cloud save is unavailable. Try again after refresh.";
        addNotification({
          type: "error",
          title: "Save failed",
          message: lastEventSaveErrorRef.current,
        });
        setEvents(snapshot);
        return null;
      }
      return nextList;
    }

    savingEventRef.current = true;
    lastEventSaveErrorRef.current = "";
    try {
      await onPersistEvents(nextList);
      return nextList;
    } catch (err) {
      setEvents(snapshot);
      lastEventSaveErrorRef.current = err?.message || "Could not save to cloud. Try again.";
      addNotification({
        type: "error",
        title: "Save failed",
        message: lastEventSaveErrorRef.current,
      });
      return null;
    } finally {
      savingEventRef.current = false;
    }
  };

  if (!hasPermission(currentUser, "calendar")) return <AccessDenied moduleName="Calendar" />;

  const canEdit = canEditRecords(currentUser);
  const canDelete = canDeleteRecords(currentUser);

  const isEditing = editEventId != null;
  const formOpen = showAdd || isEditing;

  const closeEventForm = () => {
    setShowAdd(false);
    setEditEventId(null);
    setForm(emptyEventForm());
  };

  const openAddEvent = () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setEditEventId(null);
    setForm(emptyEventForm());
    setShowAdd(true);
  };

  const openEditEvent = (e) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    setShowAdd(false);
    setEditEventId(e.id);
    setForm(eventToForm(e));
  };

  const saveEvent = async () => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    if (isEditing) {
      const existing = events.find((e) => sameEventId(e.id, editEventId));
      if (!existing) {
        addNotification({ type: "error", title: "Not Found", message: "Event no longer exists." });
        closeEventForm();
        return;
      }
      const built = buildUpdatedEventRecord(form, existing);
      if (!built.ok) {
        addNotification({ type: "error", title: "Cannot Save Event", message: built.message });
        return;
      }
      const saved = await commitEventList((prev) => prev.map((e) => (
        sameEventId(e.id, editEventId) ? built.event : e
      )));
      if (!saved) return;
      addNotification({ type: "success", title: "Event Updated", message: `"${built.event.title}" saved.` });
      if (newlyAssignedUserIds(existing.assignedUserIds, built.event.assignedUserIds).length) {
        notifyAssignmentChange({
          isNew: false,
          previousAssignedUserIds: existing.assignedUserIds,
          nextAssignedUserIds: built.event.assignedUserIds,
          title: "Event Assigned",
          message: `${built.event.title} · ${built.event.date} ${built.event.time || ""}`.trim(),
          url: "/?tab=calendar",
          actor: currentUser?.name,
          actorRole: currentUser?.role,
        });
      }
    } else {
      const built = buildNewEventRecord(form, {
        createdBy: currentUser?.name || "Staff",
        existingEvents: events,
      });
      if (!built.ok) {
        addNotification({ type: "error", title: "Cannot Add Event", message: built.message });
        return;
      }
      const saved = await commitEventList((prev) => [...prev, built.event]);
      if (!saved) return;
      const eventMsg = `${built.event.title} on ${built.event.date}`;
      if (hasAssignedTeam(built.event.assignedUserIds)) {
        addNotification({ type: "success", title: "Event Added", message: eventMsg });
        notifyAssignmentChange({
          isNew: true,
          nextAssignedUserIds: built.event.assignedUserIds,
          title: "Event Assigned",
          message: `${built.event.title} · ${built.event.date} ${built.event.time || ""}`.trim(),
          url: "/?tab=calendar",
          actor: currentUser?.name,
          actorRole: currentUser?.role,
        });
      } else {
        addNotification({ type: "info", title: "Event Added", message: eventMsg });
      }
    }
    closeEventForm();
  };

  const requestDeleteEvent = (e) => {
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    setDeleteConfirm(e);
  };

  const confirmDeleteEvent = async () => {
    if (!deleteConfirm || deletingEvent) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const e = deleteConfirm;
    const label = e.title || "this event";
    setDeletingEvent(true);
    markDeleted("events", e.id);
    try {
      const saved = await commitEventList((prev) => prev.filter((x) => !sameEventId(x.id, e.id)));
      if (!saved) {
        unmarkDeleted("events", e.id);
        const detail = lastEventSaveErrorRef.current || "Could not remove event. Try again.";
        const saveFailedAlreadyShown = detail !== "Another save is in progress. Wait a moment and try again."
          && detail !== "Nothing to save.";
        if (!saveFailedAlreadyShown) {
          addNotification({
            type: "error",
            title: "Delete Failed",
            message: detail,
          });
        }
        return;
      }
      if (sameEventId(editEventId, e.id)) closeEventForm();
      addNotification({ type: "info", title: "Event Deleted", message: `"${label}" removed.` });
      setDeleteConfirm(null);
    } finally {
      setDeletingEvent(false);
    }
  };

  const sorted = sortEventsBySchedule(events);
  const todayStr = today();
  const todayEvents = sorted.filter((e) => e.date === todayStr);
  const upcoming = sorted.filter((e) => e.date > todayStr);
  const past = sorted.filter((e) => e.date < todayStr && isAppVisibleEvent(e));
  const visiblePast = showAllPast ? past : past.slice(-5).reverse();

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white">Calendar</h2>
        <p className="text-slate-400 text-sm">Events & reminders</p>
      </div>
      {canEdit && (
        <Fab onClick={openAddEvent} label="Add Event" hidden={formOpen || !!deleteConfirm} />
      )}

      {events.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📅"
            title="No events yet"
            hint="Add pond maintenance, feeding, or customer visits"
            actionLabel={canEdit ? "Add first event" : undefined}
            onAction={canEdit ? openAddEvent : undefined}
          />
        </Card>
      ) : (
        <>
          {todayEvents.length > 0 && (
            <Card className="p-4 border-cyan-500/30 bg-cyan-500/5">
              <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2"><Zap size={14} />Today</h3>
              <div className="space-y-2">{todayEvents.map((e) => (
                <CalendarEventCard key={e.id} e={e} users={users} canEdit={canEdit} canDelete={canDelete} onEdit={openEditEvent} onDelete={requestDeleteEvent} onNavigateToPonds={onNavigateToPonds} />
              ))}</div>
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-bold text-white mb-3">Upcoming</h3>
              <div className="space-y-2">{upcoming.map((e) => (
                <CalendarEventCard key={e.id} e={e} users={users} canEdit={canEdit} canDelete={canDelete} onEdit={openEditEvent} onDelete={requestDeleteEvent} onNavigateToPonds={onNavigateToPonds} />
              ))}</div>
            </Card>
          )}

          {todayEvents.length === 0 && upcoming.length === 0 && past.length === 0 && (
            <Card className="p-8 text-center text-slate-500 text-sm">No upcoming events.</Card>
          )}

          {past.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-500">Past Events</h3>
                {past.length > 5 && (
                  <button type="button" onClick={() => setShowAllPast((v) => !v)} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold touch-manipulation">
                    {showAllPast ? "Show less" : `Show all (${past.length})`}
                  </button>
                )}
              </div>
              <div className="space-y-2 opacity-50">{visiblePast.map((e) => (
                <CalendarEventCard key={e.id} e={e} users={users} canEdit={canEdit} canDelete={canDelete} onEdit={openEditEvent} onDelete={requestDeleteEvent} onNavigateToPonds={onNavigateToPonds} />
              ))}</div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={closeEventForm}
        title={isEditing ? "Edit Event" : "Add Event"}
        size="sm"
      >
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            <Input label="Time" type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
          </div>
          <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} options={EVENT_TYPE_OPTIONS} />
          <Textarea label="Note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
          <StaffAssignPicker
            users={users}
            value={form.assignedUserIds}
            onChange={(assignedUserIds) => setForm((f) => ({ ...f, assignedUserIds }))}
            excludeUserId={currentUser?.id}
          />
        </div>
        <div className="modal-actions">
          {isEditing && canDelete && (
            <Btn
              variant="danger"
              onClick={() => {
                const e = events.find((x) => sameEventId(x.id, editEventId));
                if (e) requestDeleteEvent(e);
              }}
              className="mr-auto"
            >
              <Trash2 size={14} />Delete
            </Btn>
          )}
          <Btn variant="secondary" onClick={closeEventForm}>Cancel</Btn>
          <Btn onClick={saveEvent} disabled={!canEdit}><Plus size={14} />{isEditing ? "Save Changes" : "Add Event"}</Btn>
        </div>
      </Modal>

      <Modal
        open={!!deleteConfirm}
        onClose={deletingEvent ? undefined : () => setDeleteConfirm(null)}
        title="Delete Event"
        size="sm"
        backdropClose={!deletingEvent}
        footer={deleteConfirm && (
          <ConfirmModalFooter onCancel={() => { if (!deletingEvent) setDeleteConfirm(null); }} cancelDisabled={deletingEvent}>
            <Btn variant="danger" onClick={confirmDeleteEvent} disabled={deletingEvent} className="w-full sm:w-auto justify-center">
              {deletingEvent ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete</>}
            </Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Delete <strong className="text-white">&quot;{deleteConfirm.title}&quot;</strong> on {deleteConfirm.date}? This cannot be undone.
            </p>
            {deleteConfirm.date >= todayStr && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                This event is scheduled for today or in the future.
              </p>
            )}
          </div>
        )}
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
// TEAM & PERMISSIONS (Owner)
// ─────────────────────────────────────────────
function AiUsageStatsPanel({ isOwner, cloudMode }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!isOwner || !cloudMode) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAiUsageStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isOwner || !cloudMode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAiUsageStats();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isOwner, cloudMode]);

  if (!isOwner) return null;

  const topToday = stats?.today?.[0];
  const maxToday = Math.max(...(stats?.today?.map((r) => r.tokens) || [1]), 1);

  return (
    <Card className="p-4 border-violet-500/20 bg-violet-500/5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={16} className="text-violet-400" />AI API Usage
          </h3>
          <p className="text-xs text-slate-500">Token usage by user — today & last 7 days (from Gemini API)</p>
        </div>
        <Btn variant="ghost" size="sm" onClick={load} disabled={loading || !cloudMode}>
          {loading ? "Loading..." : "Refresh"}
        </Btn>
      </div>
      {!cloudMode ? (
        <p className="text-slate-500 text-sm">Connect Supabase to track AI usage.</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : !stats ? (
        <p className="text-slate-500 text-sm">Loading usage...</p>
      ) : (
        <>
          {topToday && topToday.tokens > 0 && (
            <p className="text-xs text-violet-300 mb-3">
              Top today: <span className="font-bold text-white">{topToday.name}</span> ({formatTokens(topToday.tokens)} tokens)
            </p>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(stats.today || []).map((row) => (
              <div key={row.userId}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-300 truncate">
                    {row.name}
                    <Badge className={`ml-1.5 ${row.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}`}>{row.role}</Badge>
                  </span>
                  <span className="text-white font-bold shrink-0 ml-2">{formatTokens(row.tokens)}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(row.tokens / maxToday) * 100}%` }} />
                </div>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {row.requests} calls · in {formatTokens(row.inputTokens)} / out {formatTokens(row.outputTokens)} · 7d: {formatTokens(stats.week.find((w) => w.userId === row.userId)?.tokens ?? 0)}
                </p>
              </div>
            ))}
            {(stats.today || []).every((r) => r.tokens === 0) && (
              <p className="text-slate-500 text-sm">No AI usage recorded today yet.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function TeamModule({ users, setUsers, currentUser, addNotification, onCurrentUserUpdate, cloudMode, apiEnabled, onOpenChangePin, getBackupData }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);
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
    if (!deleteConfirm) return;
    if (!canDelete) {
      notifyPermissionDenied(addNotification, "delete");
      return;
    }
    const user = deleteConfirm;
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
    }
  };

  const toggleActive = async (user) => {
    if (!canEdit) {
      notifyPermissionDenied(addNotification, "edit");
      return;
    }
    const nextActive = user.active === false;
    if (!nextActive) {
      const blockReason = getUserDeactivateBlockReason(user, { users, currentUserId: currentUser.id });
      if (blockReason) {
        addNotification({ type: "error", title: "Cannot Deactivate", message: blockReason });
        return;
      }
    }
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
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><UserCog size={22} className="text-cyan-400 shrink-0" />Team & Permissions</h2>
        <p className="text-slate-400 text-sm">Manage staff & owner accounts with module access</p>
      </div>
      <Fab onClick={openAdd} label="Add User" icon={UserPlus} hidden={showAdd || !!deleteConfirm || !canEdit} />

      <AiUsageStatsPanel isOwner={currentUser.role === "owner"} cloudMode={cloudMode} />

      <BackupExportPanel
        currentUser={currentUser}
        cloudMode={cloudMode}
        getBackupData={getBackupData}
        addNotification={addNotification}
      />

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
                  <Btn variant={user.active === false ? "success" : "secondary"} size="sm" onClick={() => toggleActive(user)}>
                    {user.active === false ? "Activate" : "Deactivate"}
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
        onClose={() => setDeleteConfirm(null)}
        title="Remove User"
        size="sm"
        footer={deleteConfirm && (
          <ConfirmModalFooter onCancel={() => setDeleteConfirm(null)}>
            <Btn variant="danger" onClick={confirmDeleteUser} className="w-full sm:w-auto justify-center"><Trash2 size={14} />Remove</Btn>
          </ConfirmModalFooter>
        )}
      >
        {deleteConfirm && (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              Remove <strong className="text-white">{deleteConfirm.name}</strong> permanently? Their login sessions will be revoked.
            </p>
            {deleteConfirm.role === "owner" && (
              <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                This user is an owner. Ensure another active owner remains before removing them.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

const CHAT_STORAGE_KEY = "marugen_chat_history";

const INITIAL_CHAT_MESSAGES = [
  {
    role: "assistant",
    content: "Hello! I'm your Marugen Farm AI Assistant.\n\nTalk naturally — I understand everyday requests and will do the work in the app for you. You can also attach photos (koi, receipts, pond tests) and I'll look at them.\n\nExamples:\n• \"Sarah paid already\"\n• \"We're low on pellets — 20kg just came in\"\n• \"Bill Ahmad for 3 koi and some food\"\n• \"Who hasn't paid yet?\"\n• Attach a koi photo: \"What variety is this?\"\n• Attach a receipt: \"Record this expense\"",
  },
];

function loadChatHistory() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return sanitizeStoredChatMessages(parsed) || INITIAL_CHAT_MESSAGES;
  } catch {
    return INITIAL_CHAT_MESSAGES;
  }
}

// ─────────────────────────────────────────────
// AI CHAT AGENT
// ─────────────────────────────────────────────
function AiUsageBar({ usage, compact = false }) {
  if (!usage) return null;
  const tokens = usage.tokens ?? 0;
  const pct = Math.min(100, (tokens / usage.limit) * 100);
  const warn = tokens >= AI_WARN_AT_TOKENS;
  const over = tokens > usage.limit;
  const statClass = over ? "text-amber-400" : warn ? "text-yellow-400" : "text-slate-400";
  const barClass = over ? "bg-amber-500" : warn ? "bg-yellow-500" : "bg-cyan-500";
  if (compact) {
    return (
      <div className="min-w-0">
        <div className="flex justify-between gap-2 text-[10px] mb-0.5">
          <span className="text-slate-500 truncate">AI tokens today</span>
          <span className={`font-bold shrink-0 ${statClass}`}>
            {formatTokens(tokens)}/{formatTokens(usage.limit)}
          </span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">Daily free AI tokens</span>
        <span className={`font-bold ${statClass}`}>
          {formatTokens(tokens)}/{formatTokens(usage.limit)}{usage.remaining > 0 ? ` · ${formatTokens(usage.remaining)} left` : over ? " · over limit" : ""}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const CHAT_QUICK_PROMPTS = [
  { label: "Unpaid invoices", text: "Who hasn't paid yet?" },
  { label: "Koi in stock", text: "Show koi in stock" },
  { label: "Identify koi", text: "What variety is this koi?" },
  { label: "Read receipt", text: "Read this receipt" },
];

function ChatModule({ aiContext, messages, setMessages, isMobile = false }) {
  const aiContextRef = useRef(aiContext);
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const chatAlbumRef = useRef(null);
  const chatCameraRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");
  const [pendingThread, setPendingThread] = useState(null);
  const [actionConfirmOpen, setActionConfirmOpen] = useState(false);
  const [actionConfirmMsg, setActionConfirmMsg] = useState("");
  const [pendingActionResume, setPendingActionResume] = useState(null);
  const [pendingActionExecuted, setPendingActionExecuted] = useState([]);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [retryThread, setRetryThread] = useState(null);
  const endRef = useRef(null);
  const warnNotified = useRef(false);
  const limitNotified = useRef(false);
  const chatSimulateRetryUsed = useRef(false);

  useEffect(() => { aiContextRef.current = aiContext; });
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { fetchAiUsage().then(setUsage).catch(() => {}); }, []);

  if (!hasPermission(aiContext.currentUser, "chat")) return <AccessDenied moduleName="AI Chat" />;

  const applyUsageResult = (result) => {
    if (result.usage) setUsage(result.usage);
    const tokens = result.usage?.tokens ?? 0;
    if (tokens >= AI_WARN_AT_TOKENS && tokens < AI_DAILY_FREE_TOKENS && !warnNotified.current) {
      warnNotified.current = true;
      aiContextRef.current.addNotification?.({
        type: "warning",
        title: "AI Token Warning",
        message: `You've used ${formatTokens(tokens)} of ${formatTokens(AI_DAILY_FREE_TOKENS)} free tokens today. ${formatTokens(result.usage?.remaining ?? 0)} remaining.`,
      });
    }
    if (result.atFreeLimit && !limitNotified.current) {
      limitNotified.current = true;
      aiContextRef.current.addNotification?.({
        type: "warning",
        title: "Daily Free Token Limit Reached",
        message: "You've hit today's free token limit. You'll be asked to confirm before extra usage.",
      });
    }
  };

  const appendAssistantError = (err, thread) => {
    const msg = err?.message || "Connection error. Please log in and try again.";
    setRetryThread(err?.retryable === true ? thread : null);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: msg,
      retryable: err?.retryable === true,
    }]);
  };

  const runChat = async (thread, confirmOverage = false) => {
    if (getChatSimulateMode() === "retry" && !chatSimulateRetryUsed.current) {
      chatSimulateRetryUsed.current = true;
      throw chatError(CHAT_BUSY_MESSAGE, { retryable: true });
    }
    const systemPrompt = buildBusinessContext(aiContextRef.current);
    const result = await sendChatMessage({
      systemPrompt,
      messages: thread,
      tools: AI_TOOL_DEFINITIONS,
      executeFunctions: async (calls) => executeAiActions(calls, aiContextRef.current),
      confirmOverage,
    });

    if (result.requiresConfirm) {
      setPendingThread(thread);
      setConfirmMsg(result.message);
      setConfirmOpen(true);
      if (result.usage) setUsage(result.usage);
      return;
    }

    if (result.requiresActionConfirm) {
      setPendingActionResume(result.resumeState);
      setPendingActionExecuted(result.executed || []);
      setActionConfirmMsg(
        result.confirmSummaries?.length > 1
          ? result.confirmSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n\n")
          : (result.confirmSummaries?.[0] || "Proceed with this action?"),
      );
      setActionConfirmOpen(true);
      applyUsageResult(result);
      setRetryThread(null);
      return;
    }

    applyUsageResult(result);
    setRetryThread(null);
    setMessages((prev) => [...prev.slice(-CHAT_HISTORY_MAX), {
      role: "assistant",
      content: buildAssistantReplyText(result),
      executed: result.executed?.length ? result.executed : undefined,
    }]);
  };

  const retryLastChat = async () => {
    if (!retryThread || loading) return;
    setLoading(true);
    try {
      await runChat(retryThread, true);
    } catch (err) {
      appendAssistantError(err, retryThread);
    }
    setLoading(false);
  };

  const clearChat = () => {
    setMessages(INITIAL_CHAT_MESSAGES);
    setPendingImages([]);
    setPendingThread(null);
    setConfirmOpen(false);
    setPendingActionResume(null);
    setPendingActionExecuted([]);
    setActionConfirmOpen(false);
    setClearConfirmOpen(false);
    setRetryThread(null);
    chatSimulateRetryUsed.current = false;
    warnNotified.current = false;
    limitNotified.current = false;
  };

  const handleChatImagePick = async (file) => {
    if (!file || imageUploading) return;
    if (pendingImages.length >= MAX_CHAT_IMAGES) {
      aiContextRef.current.addNotification?.({
        type: "warning",
        title: "Photo Limit",
        message: `You can attach up to ${MAX_CHAT_IMAGES} photos per message.`,
      });
      return;
    }
    try {
      setImageUploading(true);
      const dataUrl = await readChatImageFile(file);
      setPendingImages((prev) => [...prev, dataUrl]);
    } catch (err) {
      aiContextRef.current.addNotification?.({
        type: "error",
        title: "Photo Failed",
        message: err?.message || "Could not process image.",
      });
    } finally {
      setImageUploading(false);
      if (chatAlbumRef.current) chatAlbumRef.current.value = "";
      if (chatCameraRef.current) chatCameraRef.current.value = "";
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    const images = [...pendingImages];
    if (loading || imageUploading) return;
    const validated = validateChatOutgoingMessage({ text, images });
    if (!validated.ok) {
      aiContextRef.current.addNotification?.({
        type: "error",
        title: "Cannot Send",
        message: validated.message,
      });
      return;
    }
    if (isChatUnavailable()) {
      aiContextRef.current.addNotification?.({
        type: "error",
        title: "AI Chat Unavailable",
        message: CHAT_UNAVAILABLE_MESSAGE,
      });
      return;
    }
    const userMsg = {
      role: "user",
      content: validated.content,
      ...(images.length ? { images } : {}),
    };
    const thread = buildChatApiThread(messages, userMsg);
    setMessages((prev) => [...prev.slice(-CHAT_HISTORY_MAX), userMsg]);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    try {
      await runChat(thread);
    } catch (err) {
      appendAssistantError(err, thread);
    }
    setLoading(false);
  };

  const handleConfirmContinue = async () => {
    if (!pendingThread) return;
    setConfirmOpen(false);
    setLoading(true);
    try {
      await runChat(pendingThread, true);
    } catch (err) {
      appendAssistantError(err, pendingThread);
    }
    setPendingThread(null);
    setLoading(false);
  };

  const handleConfirmDecline = () => {
    setConfirmOpen(false);
    setPendingThread(null);
    setMessages((prev) => [...prev, {
      role: "assistant",
      content: "OK — I did not continue past today's free token limit. Try again tomorrow, or tap Continue when you are ready to proceed.",
    }]);
  };

  const handleActionConfirm = async () => {
    if (!pendingActionResume) return;
    setActionConfirmOpen(false);
    setLoading(true);
    const { thread, functionCalls, partialResults } = pendingActionResume;
    setPendingActionResume(null);
    setPendingActionExecuted([]);
    try {
      const finalResults = await resolvePendingAiActions(partialResults, aiContextRef.current);
      const newThread = [
        ...thread,
        { role: "assistant", functionCalls },
        { role: "user", functionResponses: finalResults },
      ];
      await runChat(newThread, true);
    } catch (err) {
      appendAssistantError(err, [
        ...thread,
        { role: "assistant", functionCalls },
        { role: "user", functionResponses: partialResults },
      ]);
    }
    setLoading(false);
  };

  const handleActionCancel = () => {
    setActionConfirmOpen(false);
    setPendingActionResume(null);
    setPendingActionExecuted([]);
    setMessages((prev) => [...prev, { role: "assistant", content: "Cancelled — no changes were made." }]);
  };

  return (
    <div className={`flex flex-col min-h-0 ${isMobile ? "flex-1 h-full" : "h-[calc(100dvh-12rem)] sm:h-[calc(100vh-180px)] min-h-[320px]"}`}>
      <div className={isMobile ? "px-3 pt-2 pb-1 shrink-0" : "mb-3 sm:mb-4"}>
        {isMobile ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <AiUsageBar usage={usage} compact />
            </div>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="shrink-0 p-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 touch-manipulation"
              aria-label="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white">AI Assistant</h2>
              <p className="text-slate-400 text-sm">Powered by Gemini · photos supported · {formatTokens(AI_DAILY_FREE_TOKENS)} free tokens/day</p>
            </div>
            <Btn variant="secondary" size="sm" onClick={() => setClearConfirmOpen(true)} className="w-full sm:w-auto justify-center shrink-0">
              <Trash2 size={14} />Clear chat
            </Btn>
          </div>
        )}
        {isChatUnavailable() && (
          <Card className={`${isMobile ? "mx-3 mt-2" : "mt-3"} p-3 border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs`}>
            {CHAT_UNAVAILABLE_MESSAGE}
          </Card>
        )}
        {!isMobile && <AiUsageBar usage={usage} />}
      </div>

      <Modal
        open={confirmOpen}
        onClose={handleConfirmDecline}
        title="Continue AI Usage?"
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={handleConfirmDecline} cancelLabel="Not now">
            <Btn onClick={handleConfirmContinue} className="w-full sm:w-auto justify-center"><Check size={14} />Yes, continue</Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-300 text-sm mb-3">{confirmMsg}</p>
        <p className="text-slate-500 text-xs">
          Used today: <span className="text-amber-400 font-bold">{formatTokens(usage?.tokens ?? AI_DAILY_FREE_TOKENS)}/{formatTokens(AI_DAILY_FREE_TOKENS)}</span> tokens.
          Extra usage may incur API costs.
        </p>
      </Modal>

      <Modal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Clear Chat"
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={() => setClearConfirmOpen(false)}>
            <Btn variant="danger" onClick={clearChat} className="w-full sm:w-auto justify-center"><Trash2 size={14} />Clear</Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-300 text-sm">Clear this chat history? This cannot be undone.</p>
      </Modal>

      <Modal
        open={actionConfirmOpen}
        onClose={handleActionCancel}
        title="Confirm Action"
        size="sm"
        footer={(
          <ConfirmModalFooter onCancel={handleActionCancel}>
            <Btn variant="danger" onClick={handleActionConfirm} className="w-full sm:w-auto justify-center"><Check size={14} />Yes, proceed</Btn>
          </ConfirmModalFooter>
        )}
      >
        <p className="text-slate-300 text-sm mb-4 whitespace-pre-wrap">{actionConfirmMsg}</p>
        {pendingActionExecuted.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-slate-800/80 border border-slate-600 text-xs space-y-1">
            <p className="text-slate-400 font-semibold mb-1">Already completed:</p>
            {pendingActionExecuted.map((a, idx) => (
              <p key={idx} className={a.success ? "text-emerald-400" : "text-red-400"}>
                {a.success ? "✓" : "✗"} {a.message || a.error || a.name}
              </p>
            ))}
          </div>
        )}
        <p className="text-amber-400/90 text-xs">This may change or delete data. Only proceed if you intend to do this.</p>
      </Modal>

      <Card className={`flex-1 overflow-hidden flex flex-col min-h-0 ${isMobile ? "rounded-none border-x-0 border-b-0" : ""}`}>
        <div className={`flex-1 overflow-y-auto overscroll-contain space-y-4 ${isMobile ? "p-3" : "p-4"}`}>
          {messages.map((m, i) => (
            <div key={`${m.role}-${i}-${(m.content || "").slice(0, 24)}-${m.hadImages ? "img" : ""}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <AppLogo size="sm" className={`mt-1 ring-1 ring-slate-600 shrink-0 ${isMobile ? "mr-1.5 w-7 h-7" : "mr-2"}`} />
              )}
              <div className={`${isMobile ? "max-w-[92%]" : "max-w-[85%]"} px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-cyan-500 text-slate-900 font-medium rounded-br-sm" : "bg-slate-700 text-slate-100 rounded-bl-sm"}`}>
                {m.images?.length > 0 && (
                  <div className={`flex flex-wrap gap-2 ${m.content ? "mb-2" : ""}`}>
                    {m.images.map((src, j) => (
                      <img key={j} src={src} alt="" className="rounded-lg max-h-40 max-w-full border border-black/20 object-cover" />
                    ))}
                  </div>
                )}
                {m.hadImages && !m.images?.length && (
                  <p className="text-xs opacity-70 mb-1">📷 Photo (not stored after refresh)</p>
                )}
                {m.content}
                {m.executed?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-600/50 space-y-1">
                    {m.executed.map((a, j) => (
                      <p key={j} className={`text-xs font-semibold ${a.success ? "text-emerald-400" : "text-red-400"}`}>
                        {a.success ? "✓" : "✗"} {a.message || a.error || a.name}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2">
              <AppLogo size="sm" className="ring-1 ring-slate-600" />
              <div className="bg-slate-700 px-4 py-3 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className={`border-t border-slate-700 shrink-0 ${isMobile ? "p-3" : "p-4"}`}>
          <div className="-mx-1 px-1 flex gap-2 overflow-x-auto scrollbar-hide flex-nowrap pb-2 mb-1">
            {CHAT_QUICK_PROMPTS.map(({ label, text }) => (
              <button
                key={text}
                type="button"
                disabled={loading}
                onClick={() => setInput(text)}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full transition-colors disabled:opacity-40 shrink-0 touch-manipulation"
              >
                {label}
              </button>
            ))}
          </div>
          {retryThread && !loading && (
            <div className="mb-2 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={16} className="text-amber-400 shrink-0" />
              <span className="text-xs text-amber-100 flex-1">Request failed — your last message is saved. Wait a moment, then tap Retry.</span>
              <Btn size="sm" variant="secondary" onClick={retryLastChat} className="shrink-0 border-amber-500/40 text-amber-100">
                <RefreshCw size={12} />Retry
              </Btn>
            </div>
          )}
          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingImages.map((src, idx) => (
                <div key={idx} className="relative">
                  <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-600" />
                  <button
                    type="button"
                    onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                    aria-label="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={chatAlbumRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleChatImagePick(e.target.files?.[0])}
          />
          <input
            ref={chatCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleChatImagePick(e.target.files?.[0])}
          />
          <div className="flex gap-2 items-end">
            <Btn
              variant="secondary"
              onClick={() => chatAlbumRef.current?.click()}
              disabled={loading || imageUploading || pendingImages.length >= MAX_CHAT_IMAGES}
              className={`shrink-0 touch-manipulation ${isMobile ? "px-3 py-2.5 min-h-[44px]" : "px-3 py-3"}`}
              title="Attach photo"
            >
              <ImagePlus size={16} />
            </Btn>
            {!isMobile && (
              <Btn
                variant="secondary"
                onClick={() => chatCameraRef.current?.click()}
                disabled={loading || imageUploading || pendingImages.length >= MAX_CHAT_IMAGES}
                className="px-3 py-3 shrink-0"
                title="Take photo"
              >
                <ScanLine size={16} />
              </Btn>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={pendingImages.length ? "Ask about the photo…" : isMobile ? "Ask or attach photo…" : "Ask a question or attach a photo…"}
              disabled={loading || imageUploading}
              className={`flex-1 min-w-0 bg-slate-900/50 border border-slate-600 rounded-xl px-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-60 ${isMobile ? "py-2.5 min-h-[44px] text-base" : "px-4 py-3 text-sm"}`}
            />
            <Btn
              onClick={sendMessage}
              disabled={loading || imageUploading || (!input.trim() && !pendingImages.length)}
              className={`justify-center shrink-0 touch-manipulation ${isMobile ? "px-3.5 py-2.5 min-h-[44px] min-w-[44px]" : "px-4 py-3 min-w-[48px]"}`}
            >
              <Send size={16} />
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
const ALL_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "koifish", label: "Koi Fish", icon: Fish },
  { id: "customerkoi", label: "Customer Koi", icon: FishSymbol },
  { id: "ponds", label: "Pond Mgmt", icon: Droplets },
  { id: "customers", label: "Customers", icon: Contact },
  { id: "expenses", label: "Expenses", icon: TrendingUp },
  { id: "deliveries", label: "Deliveries", icon: Truck },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "chat", label: "AI Chat", icon: MessageSquare },
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
  const pondSyncChainRef = useRef(Promise.resolve());
  const invoiceBookedChainRef = useRef(Promise.resolve());
  const syncStateRef = useRef({});
  const inventorySyncPendingRef = useRef(false);
  const handleKoiSoldRef = useRef(() => {});
  const invoicesNormalizedRef = useRef(false);
  const invoicePendingRecoveryRef = useRef(false);
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
  const [pondData, setPondData] = useState(() => (isSupabaseConfigured ? emptyPondData() : loadPondData()));
  const setPondDataWithRef = useCallback((updater) => {
    setPondData((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncStateRef.current = { ...syncStateRef.current, pondData: next };
      return next;
    });
  }, []);
  const setExpensesWithRef = useCallback((updater) => {
    setExpenses((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncStateRef.current = { ...syncStateRef.current, expenses: next };
      return next;
    });
  }, []);
  const [whatsappGroups, setWhatsappGroups] = useState(() => (isSupabaseConfigured ? [] : loadWhatsappGroups()));
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toastTimers = useRef(new Map());
  const [invoiceOpenDraft, setInvoiceOpenDraft] = useState(null);
  const [invoiceViewRequest, setInvoiceViewRequest] = useState(null);
  const [invoiceDraftSignal, setInvoiceDraftSignal] = useState(0);

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
  useEffect(() => { if (!isSupabaseConfigured) savePondData(pondData) }, [pondData]);
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
      const mergedPond = mergePondData(syncStateRef.current.pondData || emptyPondData(), cleaned.pondData);
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

  const getBackupData = useCallback(() => ({
    users,
    ...syncState,
  }), [users, syncState]);

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

  const flushDeliveriesSync = useCallback(async (deliveriesOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "deliveries")) {
      throw new Error("Permission denied (deliveries).");
    }
    const syncKey = "deliveries:Deliveries";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = deliveriesOverride ?? syncStateRef.current.deliveries ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncDeliveries(payload);
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushCustomersSync = useCallback(async (customersOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "customers")) {
      throw new Error("Permission denied (customers).");
    }
    const syncKey = "customers:Customers";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = customersOverride ?? syncStateRef.current.customers ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncCustomers(payload);
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushWhatsappGroupsSync = useCallback(async (groupsOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "deliveries")) {
      throw new Error("Permission denied (deliveries).");
    }
    const syncKey = "deliveries:WhatsApp groups";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = groupsOverride ?? syncStateRef.current.whatsappGroups ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncWhatsappGroups(payload);
      resetSyncHealth();
      touchLastSync();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushCustomerKoiSync = useCallback(async (recordsOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "customerkoi")) {
      throw new Error("Permission denied (customerkoi).");
    }
    const syncKey = "customerkoi:Customer koi";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = recordsOverride ?? syncStateRef.current.customerKoiList ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncCustomerKoi(payload);
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.customerkoi = Date.now();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushEventSync = useCallback(async (eventsOverride) => {
    if (!isSupabaseConfigured) {
      throw new Error("Cloud sync is not configured.");
    }
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "calendar")) {
      throw new Error("Permission denied (calendar).");
    }
    const syncKey = "calendar:Calendar";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const raw = eventsOverride ?? syncStateRef.current.events ?? [];
    const payload = raw.map((e) => touchUpdatedAt(e));
    syncStateRef.current = { ...syncStateRef.current, events: payload };
    syncInFlightRef.current += 1;
    try {
      await db.syncEvents(payload, { force: true });
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.calendar = Date.now();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const markInvoiceBookedCloud = useCallback(async (inv, { booked, bookedBy } = {}) => {
    const invId = String(inv.id);
    const patch = makeBookedPatch(booked, bookedBy || currentUser?.name || "Staff");

    const execute = async () => {
      const timerKey = "invoices:Invoices";
      if (syncTimersRef.current[timerKey]) {
        clearTimeout(syncTimersRef.current[timerKey]);
        delete syncTimersRef.current[timerKey];
      }

      let waited = 0;
      while (syncInFlightRef.current > 0 && waited < 5000) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }

      const revertOptimistic = () => {
        const revertedInvoices = sortInvoices(
          syncStateRef.current.invoices.map((i) => (
            String(i.id) === invId ? touchUpdatedAt(db.sanitizeInvoiceForSync(inv)) : i
          )),
        );
        syncStateRef.current = { ...syncStateRef.current, invoices: revertedInvoices };
        setInvoices(applyInvoicePins(revertedInvoices));
      };

      const latestInv = syncStateRef.current.invoices.find((i) => String(i.id) === invId) || inv;
      const optimisticFromLatest = touchUpdatedAt(db.sanitizeInvoiceForSync({ ...latestInv, ...patch }));
      const nextInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? optimisticFromLatest : i)),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: nextInvoices };
      setInvoices(applyInvoicePins(nextInvoices));

      if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) {
        revertOptimistic();
        throw new Error("Cloud sync is not ready.");
      }
      if (!canMarkAccounting(currentUser)) {
        revertOptimistic();
        throw new Error("Permission denied (accounting).");
      }
      if (!(await ensureCloudSyncReady())) {
        revertOptimistic();
        throw new Error("Session needs refresh. Log out and log in again.");
      }

      syncInFlightRef.current += 1;
      try {
        const confirmed = await db.markInvoiceBookedCloud(invId, {
          booked,
          bookedBy: patch.bookedBy,
        });
        const confirmedRow = touchUpdatedAt(db.sanitizeInvoiceForSync(confirmed));
        const localRow = syncStateRef.current.invoices.find((i) => String(i.id) === invId);
        const mergedRow = localRow ? resolveInvoiceConflict(localRow, confirmedRow) : confirmedRow;
        const finalInvoices = sortInvoices(
          syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? mergedRow : i)),
        );
        syncStateRef.current = { ...syncStateRef.current, invoices: finalInvoices };
        setInvoices(applyInvoicePins(finalInvoices));
        explicitFlushAtRef.current.invoices = Date.now();
        resetSyncHealth();
        touchLastSync();
      } catch (err) {
        revertOptimistic();
        handleSyncFailure(err);
        throw err;
      } finally {
        syncInFlightRef.current -= 1;
      }
    };

    const chained = invoiceBookedChainRef.current.then(execute);
    invoiceBookedChainRef.current = chained.catch(() => {});
    return chained;
  }, [
    currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth,
    setInvoices,
  ]);

  const flushExpenseSync = useCallback(async (expensesOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "expenses")) {
      throw new Error("Permission denied (expenses).");
    }
    const syncKey = "expenses:Expenses";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const raw = expensesOverride ?? syncStateRef.current.expenses ?? [];
    const payload = raw.map((e) => touchUpdatedAt(e));
    syncStateRef.current = { ...syncStateRef.current, expenses: payload };
    syncInFlightRef.current += 1;
    try {
      await db.syncExpenses(payload, { force: true });
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.expenses = Date.now();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const flushKoiFishSync = useCallback(async (koiOverride, options = {}) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "koifish")) {
      throw new Error("Permission denied (koifish).");
    }
    const syncKey = "koifish:Koi fish";
    if (syncTimersRef.current[syncKey]) {
      clearTimeout(syncTimersRef.current[syncKey]);
      delete syncTimersRef.current[syncKey];
    }
    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }
    const payload = koiOverride ?? syncStateRef.current.koiFishList ?? [];
    syncInFlightRef.current += 1;
    try {
      await db.syncKoiFish(payload, options);
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.koifish = Date.now();
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const syncPondDataNow = useCallback(async (pondOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "ponds")) {
      throw new Error("Permission denied (ponds).");
    }

    if (pondOverride) {
      const touched = touchPondData(pondOverride);
      syncStateRef.current = { ...syncStateRef.current, pondData: touched };
    }

    const timerKey = "ponds:Pond data";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    const runPondSync = async () => {
      let waited = 0;
      while (syncInFlightRef.current > 0 && waited < 3000) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }

      let payload = touchPondData(syncStateRef.current.pondData);
      syncStateRef.current = { ...syncStateRef.current, pondData: payload };

      syncInFlightRef.current += 1;
      try {
        if (!(await ensureCloudSyncReady())) {
          throw new Error("Session needs refresh. Log out and log in again.");
        }

        let result = await db.syncPondData(payload);
        if (result?.skipped) {
          const remote = await db.fetchAllData();
          if (remote?.pondData) {
            const latest = syncStateRef.current.pondData;
            payload = touchPondData(mergePondData(latest, remote.pondData));
            syncStateRef.current = { ...syncStateRef.current, pondData: payload };
            setPondDataWithRef(payload);
            result = await db.syncPondData(payload);
          }
          if (result?.skipped) {
            result = await db.syncPondData(payload, { force: true });
          }
        }
        if (result?.skipped) {
          throw new Error("Could not save pond reminder — cloud data was newer. Refresh and try again.");
        }

        setPondDataWithRef(payload);
        resetSyncHealth();
        touchLastSync();
      } catch (err) {
        handleSyncFailure(err);
        throw err;
      } finally {
        syncInFlightRef.current -= 1;
      }
    };

    pondSyncChainRef.current = pondSyncChainRef.current.then(runPondSync, runPondSync);
    return pondSyncChainRef.current;
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth, setPondDataWithRef]);

  const syncEventsNow = useCallback(async (eventsOverride) => {
    if (!isSupabaseConfigured) return;
    if (!cloudHydrated || !auth.hasCloudSession() || !currentUser) {
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "calendar")) return;

    const timerKey = "calendar:Calendar";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 3000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    const raw = eventsOverride ?? syncStateRef.current.events ?? [];
    const payload = raw.map((e) => touchUpdatedAt(e));
    const previousEvents = syncStateRef.current.events ?? [];

    syncInFlightRef.current += 1;
    try {
      if (!(await ensureCloudSyncReady())) {
        throw new Error("Session needs refresh. Log out and log in again.");
      }
      await db.syncEvents(payload, { force: true });
      syncStateRef.current = { ...syncStateRef.current, events: payload };
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.calendar = Date.now();
    } catch (err) {
      syncStateRef.current = { ...syncStateRef.current, events: previousEvents };
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [cloudHydrated, currentUser, ensureCloudSyncReady, handleSyncFailure, touchLastSync, resetSyncHealth]);

  const syncReminderCalendar = useCallback(async (action, reminder) => {
    if (!hasPermission(currentUser, "calendar")) return;
    const reminderId = reminder?.id;
    if (!reminderId) return;
    const prev = syncStateRef.current.events ?? [];
    let nextEvents;
    if (action === "upsert") {
      nextEvents = upsertCalendarEventForReminder(prev, reminder, currentUser?.name || "Staff");
    } else if (action === "remove") {
      nextEvents = removeCalendarEventForReminder(prev, reminderId);
    } else {
      return;
    }
    if (nextEvents === prev) return;
    await syncEventsNow(nextEvents);
    setEventsWithRef(nextEvents);
  }, [currentUser, setEventsWithRef, syncEventsNow]);

  const markInvoicePaidCloud = useCallback(async (inv, paidTotal) => {
    const invId = String(inv.id);
    const optimistic = touchUpdatedAt(db.sanitizeInvoiceForSync({ ...inv, status: "paid" }));

    const timerKey = "invoices:Invoices";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    pinInvoice(optimistic);
    const nextInvoices = sortInvoices(
      syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? optimistic : i)),
    );
    syncStateRef.current = { ...syncStateRef.current, invoices: nextInvoices };
    setInvoices(applyInvoicePins(nextInvoices));

    const revertPaidOptimistic = () => {
      unpinInvoice(invId);
      const revertedInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (
          String(i.id) === invId ? touchUpdatedAt(db.sanitizeInvoiceForSync(inv)) : i
        )),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: revertedInvoices };
      setInvoices(applyInvoicePins(revertedInvoices));
    };

    if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) {
      revertPaidOptimistic();
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "invoices")) {
      revertPaidOptimistic();
      throw new Error("Permission denied (invoices).");
    }
    if (!canEditRecords(currentUser)) {
      revertPaidOptimistic();
      throw new Error("Permission denied (edit).");
    }
    if (!(await ensureCloudSyncReady())) {
      revertPaidOptimistic();
      throw new Error("Session needs refresh. Log out and log in again.");
    }

    syncInFlightRef.current += 1;
    try {
      await db.upsertInvoiceCloud(touchUpdatedAt(db.sanitizeInvoiceForSync({
        ...inv,
        total: paidTotal,
      })));
      const { invoice: confirmed, customer: confirmedCustomer } = await db.markInvoicePaidCloud(invId);
      const confirmedRow = touchUpdatedAt(db.sanitizeInvoiceForSync(confirmed));
      const localRow = syncStateRef.current.invoices.find((i) => String(i.id) === invId);
      const mergedRow = localRow ? resolveInvoiceConflict(localRow, confirmedRow) : confirmedRow;
      const finalInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? mergedRow : i)),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: finalInvoices };
      releaseInvoicePinAfterConfirm(invId, confirmedRow);
      setInvoices(applyInvoicePins(finalInvoices));
      if (confirmedCustomer) {
        setCustomers((prev) => prev.map((c) => (
          String(c.id) === String(confirmedCustomer.id) ? confirmedCustomer : c
        )));
      } else if (inv.customerId != null && inv.customerId !== "") {
        setCustomers((prev) => applyCustomerPaidDelta(prev, inv.customerId, paidTotal));
      }
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.invoices = Date.now();
    } catch (err) {
      revertPaidOptimistic();
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [currentUser, handleSyncFailure, touchLastSync, ensureCloudSyncReady, resetSyncHealth]);

  const cancelInvoiceCloud = useCallback(async (inv, options = {}) => {
    const { skipKoiRestore = false, fromRefund = false, refundReason = "" } = options;
    const invId = String(inv.id);
    const wasPaid = getInvoiceStatus(inv) === "paid";
    const creditNote = fromRefund
      ? `\nCredit note / koi refund (${today()}): ${refundReason?.trim() || "Koi sale refunded"}`
      : "";
    const optimistic = touchUpdatedAt(db.sanitizeInvoiceForSync({
      ...inv,
      status: "cancelled",
      notes: `${inv.notes || ""}${creditNote}`.trim(),
      booked: false,
      bookedAt: null,
      bookedBy: "",
    }));

    const timerKey = "invoices:Invoices";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    pinInvoice(optimistic);
    const nextInvoices = sortInvoices(
      syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? optimistic : i)),
    );
    syncStateRef.current = { ...syncStateRef.current, invoices: nextInvoices };
    setInvoices(applyInvoicePins(nextInvoices));

    let removedCustomerKoiIds = [];
    const koiRestorePreview = previewRestoreInvoiceKoiSales(
      inv.items || [],
      koiFishList,
      customerKoiList,
    );
    const hasKoiCancelLines = !skipKoiRestore && (inv.items || []).some((it) => it.koiId && !it.koiAlreadySold);
    const stockSideEffectMeta = { invoiceId: invId, by: currentUser?.name || "Staff" };
    const stockRestorePreview = previewRestoreStockForInvoice(
      products,
      stockLog,
      inv.items || [],
      stockSideEffectMeta,
    );
    const hasStockLines = stockRestorePreview.hasStockLines;

    const applyCancelSideEffects = () => {
      applyStockPreview(setProducts, setStockLog, stockRestorePreview);
      if (!skipKoiRestore) {
        removedCustomerKoiIds = restoreInvoiceKoiSales(
          inv.items || [],
          setKoiFishList,
          setCustomerKoiList,
          { koiList: koiFishList, customerKoiList },
        );
      }
      setDeliveries((prev) => prev.map((d) => {
        if (String(d.invoiceId || "") !== invId) return d;
        if (!["scheduled", "transit"].includes(d.status)) return d;
        return touchUpdatedAt({ ...d, status: "cancelled" });
      }));
      inventorySyncPendingRef.current = true;
    };

    const revertCancelSideEffects = async () => {
      removedCustomerKoiIds.forEach((id) => unmarkDeleted("customer_koi", id));
      removedCustomerKoiIds = [];
      deductStockForInvoice(setProducts, setStockLog, products, inv.items || [], stockSideEffectMeta);
      await applyInvoiceKoiSales({
        items: inv.items || [],
        koiList: koiFishList,
        setKoiList: setKoiFishList,
        customerId: inv.customerId,
        customers,
        soldDate: inv.date || today(),
        onKoiSold: (...args) => handleKoiSoldRef.current?.(...args),
        addNotification,
      });
      setDeliveries((prev) => prev.map((d) => {
        if (String(d.invoiceId || "") !== invId || d.status !== "cancelled") return d;
        return touchUpdatedAt({ ...d, status: "scheduled" });
      }));
      inventorySyncPendingRef.current = true;
    };

    const flushCancelFailureRevert = async () => {
      try {
        if (hasStockLines && hasPermission(currentUser, "inventory")) {
          const stockDeduct = previewDeductStockForInvoice(
            stockRestorePreview.nextProducts,
            stockRestorePreview.nextStockLog,
            inv.items || [],
            stockSideEffectMeta,
          );
          await flushInventorySync(stockDeduct.nextProducts, stockDeduct.nextStockLog);
        }
        if (hasKoiCancelLines && hasPermission(currentUser, "koifish")) {
          const koiReapply = previewApplyInvoiceKoiSales({
            items: inv.items || [],
            koiList: koiRestorePreview.nextKoiList,
            customerId: inv.customerId,
            customers,
            soldDate: inv.date || today(),
          });
          if (koiReapply.hasKoiLines) {
            await flushKoiFishSync(koiReapply.nextKoiList);
          }
        }
        /* keep-at-farm customer koi re-sync runs inside handleKoiSold during revert */
      } catch (syncErr) {
        handleSyncFailure(syncErr);
      }
    };

    const revertCancelOptimistic = () => {
      unpinInvoice(invId);
      const revertedInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (
          String(i.id) === invId ? touchUpdatedAt(db.sanitizeInvoiceForSync(inv)) : i
        )),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: revertedInvoices };
      setInvoices(applyInvoicePins(revertedInvoices));
    };

    applyCancelSideEffects();

    if (!isSupabaseConfigured) {
      if (fromRefund && wasPaid && inv.customerId != null && inv.customerId !== "") {
        setCustomers((prev) => applyCustomerPaidDelta(prev, inv.customerId, -(Number(inv.total) || 0)));
      }
      return;
    }
    if (!auth.hasCloudSession() || !currentUser) {
      await revertCancelSideEffects();
      revertCancelOptimistic();
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "invoices")) {
      await revertCancelSideEffects();
      revertCancelOptimistic();
      throw new Error("Permission denied (invoices).");
    }
    if (fromRefund) {
      if (!canRefundSales(currentUser)) {
        await revertCancelSideEffects();
        revertCancelOptimistic();
        throw new Error("Permission denied (refund).");
      }
    } else if (!hasPermission(currentUser, "delete")) {
      await revertCancelSideEffects();
      revertCancelOptimistic();
      throw new Error("Permission denied (delete).");
    }
    if (!(await ensureCloudSyncReady())) {
      await revertCancelSideEffects();
      revertCancelOptimistic();
      throw new Error("Session needs refresh. Log out and log in again.");
    }

    syncInFlightRef.current += 1;
    try {
      if (hasStockLines || hasKoiCancelLines) {
        syncStateRef.current = {
          ...syncStateRef.current,
          ...(hasStockLines
            ? { products: stockRestorePreview.nextProducts, stockLog: stockRestorePreview.nextStockLog }
            : {}),
          ...(hasKoiCancelLines
            ? {
              koiFishList: koiRestorePreview.nextKoiList,
              customerKoiList: koiRestorePreview.nextCustomerKoiList,
            }
            : {}),
        };
        if (hasStockLines && hasPermission(currentUser, "inventory")) {
          await flushInventorySync(stockRestorePreview.nextProducts, stockRestorePreview.nextStockLog);
        }
        if (hasKoiCancelLines && hasPermission(currentUser, "koifish")) {
          await flushKoiFishSync(koiRestorePreview.nextKoiList);
        }
        if (hasKoiCancelLines && hasPermission(currentUser, "customerkoi")) {
          await flushCustomerKoiSync(koiRestorePreview.nextCustomerKoiList);
        }
      }
      const { invoice: confirmed, customer: confirmedCustomer } = await db.cancelInvoiceCloud(invId, {
        refund: fromRefund,
        skipKoiRestore,
        refundReason,
      });
      const confirmedRow = touchUpdatedAt(db.sanitizeInvoiceForSync(confirmed));
      const localRow = syncStateRef.current.invoices.find((i) => String(i.id) === invId);
      const mergedRow = localRow ? resolveInvoiceConflict(localRow, confirmedRow) : confirmedRow;
      const finalInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? mergedRow : i)),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: finalInvoices };
      releaseInvoicePinAfterConfirm(invId, confirmedRow);
      setInvoices(applyInvoicePins(finalInvoices));
      if (confirmedCustomer) {
        setCustomers((prev) => prev.map((c) => (
          String(c.id) === String(confirmedCustomer.id) ? confirmedCustomer : c
        )));
      } else if (fromRefund && wasPaid && inv.customerId != null && inv.customerId !== "") {
        setCustomers((prev) => applyCustomerPaidDelta(prev, inv.customerId, -(Number(inv.total) || 0)));
      }
      const nextDeliveries = (syncStateRef.current.deliveries ?? []).map((d) => {
        if (String(d.invoiceId || "") !== invId) return d;
        if (!["scheduled", "transit"].includes(d.status)) return d;
        return touchUpdatedAt({ ...d, status: "cancelled" });
      });
      if (nextDeliveries.some((d, i) => d !== (syncStateRef.current.deliveries ?? [])[i])) {
        syncStateRef.current = { ...syncStateRef.current, deliveries: nextDeliveries };
        if (hasPermission(currentUser, "deliveries")) {
          try {
            await flushDeliveriesSync(nextDeliveries);
          } catch (delErr) {
            handleSyncFailure(delErr);
          }
        }
      }
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.invoices = Date.now();
      if (hasKoiCancelLines) explicitFlushAtRef.current.koifish = Date.now();
    } catch (err) {
      revertCancelOptimistic();
      await revertCancelSideEffects();
      await flushCancelFailureRevert();
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [
    currentUser, products, stockLog, customers, koiFishList, customerKoiList, handleSyncFailure, touchLastSync, ensureCloudSyncReady,
    flushKoiFishSync, flushCustomerKoiSync, flushInventorySync, flushDeliveriesSync,
    setProducts, setStockLog, setKoiFishList, setCustomerKoiList, setDeliveries, addNotification, resetSyncHealth,
  ]);

  const createInvoiceCloud = useCallback(async (inv, options = {}) => {
    const invId = String(inv.id);
    const optimistic = touchUpdatedAt(db.sanitizeInvoiceForSync(inv));
    const koiPayload = options.koiFishList;
    const { revertKoi } = options;

    const timerKey = "invoices:Invoices";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    pinInvoice(optimistic);
    unmarkDeleted("invoices", invId);
    const nextInvoices = sortInvoices([optimistic, ...syncStateRef.current.invoices.filter((i) => String(i.id) !== invId)]);
    syncStateRef.current = { ...syncStateRef.current, invoices: nextInvoices };
    setInvoices(applyInvoicePins(nextInvoices));

    const revertCreateOptimistic = () => {
      unpinInvoice(invId);
      const revertedInvoices = sortInvoices(
        syncStateRef.current.invoices.filter((i) => String(i.id) !== invId),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: revertedInvoices };
      setInvoices(applyInvoicePins(revertedInvoices));
    };

    if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) {
      revertCreateOptimistic();
      throw new Error("Cloud sync is not ready.");
    }
    if (!hasPermission(currentUser, "invoices")) {
      revertCreateOptimistic();
      throw new Error("Permission denied (invoices).");
    }
    if (!(await ensureCloudSyncReady())) {
      revertCreateOptimistic();
      throw new Error("Session needs refresh. Log out and log in again.");
    }

    syncInFlightRef.current += 1;
    let koiFlushed = false;
    try {
      if (koiPayload) {
        syncStateRef.current = { ...syncStateRef.current, koiFishList: koiPayload };
        if (hasPermission(currentUser, "koifish")) {
          await flushKoiFishSync(koiPayload);
          koiFlushed = true;
        }
      }
      const confirmed = await db.upsertInvoiceCloud(optimistic, { createOnly: true });
      const confirmedRow = touchUpdatedAt(db.sanitizeInvoiceForSync(confirmed));
      const localRow = syncStateRef.current.invoices.find((i) => String(i.id) === invId);
      const mergedRow = localRow ? resolveInvoiceConflict(localRow, confirmedRow) : confirmedRow;
      const finalInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? mergedRow : i)),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: finalInvoices };
      releaseInvoicePinAfterConfirm(invId, confirmedRow);
      setInvoices(applyInvoicePins(finalInvoices));
      if (koiPayload) {
        const reconciledKoi = reconcileKoiSoldFromInvoices(koiPayload, finalInvoices);
        setKoiFishList(reconciledKoi);
        syncStateRef.current = { ...syncStateRef.current, koiFishList: reconciledKoi };
      }
      const invItems = mergedRow?.items || optimistic.items || [];
      if (invItems.length && hasPermission(currentUser, "inventory")) {
        const stockApply = previewDeductStockForInvoice(
          syncStateRef.current.products,
          syncStateRef.current.stockLog ?? [],
          invItems,
          { invoiceId: invId, by: currentUser?.name || "Staff" },
        );
        if (stockApply.hasStockLines) {
          syncStateRef.current = {
            ...syncStateRef.current,
            products: stockApply.nextProducts,
            stockLog: stockApply.nextStockLog,
          };
          setProducts(stockApply.nextProducts);
          setStockLog(stockApply.nextStockLog);
        }
      }
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.invoices = Date.now();
      if (koiPayload) explicitFlushAtRef.current.koifish = Date.now();
    } catch (err) {
      revertCreateOptimistic();
      if (/already in use/i.test(String(err?.message || ""))) {
        reserveInvoiceId(invId);
      }
      try {
        if (koiFlushed && revertKoi?.nextKoiList && hasPermission(currentUser, "koifish")) {
          await flushKoiFishSync(revertKoi.nextKoiList);
        }
        if (koiFlushed && revertKoi?.nextCustomerKoiList && hasPermission(currentUser, "customerkoi")) {
          await flushCustomerKoiSync(revertKoi.nextCustomerKoiList);
        }
      } catch (revertErr) {
        handleSyncFailure(revertErr);
      }
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [
    currentUser, handleSyncFailure, touchLastSync, ensureCloudSyncReady, resetSyncHealth,
    flushKoiFishSync, flushCustomerKoiSync, setKoiFishList, setProducts, setStockLog,
  ]);

  const patchInvoiceCloud = useCallback(async (inv) => {
    const invId = String(inv.id);
    const payload = touchUpdatedAt(db.sanitizeInvoiceForSync(inv));

    const timerKey = "invoices:Invoices";
    if (syncTimersRef.current[timerKey]) {
      clearTimeout(syncTimersRef.current[timerKey]);
      delete syncTimersRef.current[timerKey];
    }

    const applyLocal = (row) => {
      const finalInvoices = sortInvoices(
        syncStateRef.current.invoices.map((i) => (String(i.id) === invId ? row : i)),
      );
      syncStateRef.current = { ...syncStateRef.current, invoices: finalInvoices };
      setInvoices(applyInvoicePins(finalInvoices));
      return row;
    };

    if (!isSupabaseConfigured || !auth.hasCloudSession() || !currentUser) {
      return applyLocal(payload);
    }
    if (!hasPermission(currentUser, "invoices")) {
      throw new Error("Permission denied (invoices).");
    }
    if (!canEditRecords(currentUser)) {
      throw new Error("Permission denied (edit).");
    }
    if (!(await ensureCloudSyncReady())) {
      throw new Error("Session needs refresh. Log out and log in again.");
    }

    let waited = 0;
    while (syncInFlightRef.current > 0 && waited < 5000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }

    syncInFlightRef.current += 1;
    try {
      const confirmed = await db.upsertInvoiceCloud(payload);
      const confirmedRow = touchUpdatedAt(db.sanitizeInvoiceForSync(confirmed));
      const localRow = syncStateRef.current.invoices.find((i) => String(i.id) === invId);
      const mergedRow = localRow ? resolveInvoiceConflict(localRow, confirmedRow) : confirmedRow;
      applyLocal(mergedRow);
      resetSyncHealth();
      touchLastSync();
      explicitFlushAtRef.current.invoices = Date.now();
      return mergedRow;
    } catch (err) {
      handleSyncFailure(err);
      throw err;
    } finally {
      syncInFlightRef.current -= 1;
    }
  }, [currentUser, handleSyncFailure, touchLastSync, ensureCloudSyncReady, resetSyncHealth]);

  const requestInventorySideEffect = useCallback(() => {
    inventorySyncPendingRef.current = true;
  }, []);

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

  useEffect(() => {
    if (!cloudHydrated || invoicesNormalizedRef.current) return;
    invoicesNormalizedRef.current = true;
    setInvoices((prev) => sortInvoices(prev.map((inv) => db.sanitizeInvoiceForSync(inv))));
  }, [cloudHydrated]);

  useEffect(() => {
    if (!dataReady || !cloudHydrated || invoicePendingRecoveryRef.current) return;
    const pending = readInvoicePendingCreate();
    if (!pending) return;
    invoicePendingRecoveryRef.current = true;

    (async () => {
      const invId = String(pending.invoiceId);
      const items = pending.items || [];

      const existsLocal = (syncStateRef.current.invoices || []).some((i) => String(i.id) === invId);
      if (existsLocal) {
        clearInvoicePendingCreate();
        return;
      }

      if (isSupabaseConfigured && auth.hasCloudSession()) {
        try {
          await refreshFromCloud({ quiet: true, force: true, source: "pending_recovery" });
          const existsAfterPull = (syncStateRef.current.invoices || []).some((i) => String(i.id) === invId);
          if (existsAfterPull) {
            clearInvoicePendingCreate();
            addNotification({
              type: "info",
              title: "Invoice Recovered",
              message: `${invId} was saved earlier and is now in your invoice list.`,
            });
            return;
          }
        } catch (_) { /* fall through */ }
      }

      const productsSnap = syncStateRef.current.products || [];
      const stockLogSnap = syncStateRef.current.stockLog || [];
      const hasLocalSell = stockLogSnap.some(
        (e) => e.type === "sell" && String(e.note || "").includes(invId),
      );
      if (hasLocalSell) {
        const by = currentUser?.name || "Staff";
        restoreStockForInvoice(setProducts, setStockLog, productsSnap, items, { invoiceId: invId, by });
        inventorySyncPendingRef.current = true;
      }
      restoreInvoiceKoiSales(items, setKoiFishList, setCustomerKoiList);
      clearInvoicePendingCreate();
      addNotification({
        type: "warning",
        title: "Interrupted Invoice Recovered",
        message: hasLocalSell
          ? `Stock and fish were restored after an unfinished create for ${invId}. Create the invoice again if still needed.`
          : `An unfinished create for ${invId} was cleared. Create the invoice again if still needed.`,
      });
    })();
  }, [dataReady, cloudHydrated, currentUser, addNotification, refreshFromCloud]);

  useEffect(() => {
    if (!isSupabaseConfigured || !dataReady || !cloudHydrated) return;
    setStockLog((prev) => {
      const { nextRows, removedIds } = pruneOrphanInvoiceStockLogs(prev, syncStateRef.current.invoices || invoices);
      if (!removedIds.length) return prev;
      removedIds.forEach((id) => markDeleted("stock_activity", id));
      syncStateRef.current = { ...syncStateRef.current, stockLog: nextRows };
      return nextRows;
    });
  }, [isSupabaseConfigured, dataReady, cloudHydrated, invoices, setStockLog]);

  const pendingRemindersKey = useMemo(
    () => pendingRemindersSyncKey(pondData.reminders),
    [pondData.reminders],
  );

  useLayoutEffect(() => {
    if (!dataReady || !cloudHydrated) return;
    const user = currentUserRef.current;
    if (!user || !hasPermission(user, "calendar") || !hasPermission(user, "ponds")) return;
    let patchedReminders = null;
    setEventsWithRef((prevEvents) => {
      const synced = syncPondCalendarAssignees(prevEvents, pondData.reminders, {
        createdBy: user.name || "Staff",
        pondsReady: true,
      });
      if (synced.remindersChanged) patchedReminders = synced.reminders;
      return synced.eventsChanged ? synced.events : prevEvents;
    });
    if (patchedReminders) {
      setPondDataWithRef((prev) => touchPondData({ ...prev, reminders: patchedReminders }));
    }
  }, [dataReady, cloudHydrated, pendingRemindersKey, pondData.reminders, setEventsWithRef, setPondDataWithRef]);

  useEffect(() => syncDebounced("customers", "Customers", db.syncCustomers, customers), [customers, syncDebounced]);
  useEffect(() => syncDebounced("inventory", "Inventory", db.syncProducts, products), [products, syncDebounced]);
  useEffect(() => syncDebounced("invoices", "Invoices", db.syncInvoices, invoices), [invoices, syncDebounced]);
  useEffect(() => syncDebounced("expenses", "Expenses", db.syncExpenses, expenses), [expenses, syncDebounced]);
  useEffect(() => syncDebounced("deliveries", "Deliveries", db.syncDeliveries, deliveries), [deliveries, syncDebounced]);
  useEffect(() => syncDebounced("calendar", "Calendar", db.syncEvents, events), [events, syncDebounced]);
  useEffect(() => syncDebounced("inventory", "Stock activity", db.syncStockActivity, stockLog), [stockLog, syncDebounced]);
  useEffect(() => syncDebounced("koifish", "Koi fish", db.syncKoiFish, koiFishList), [koiFishList, syncDebounced]);
  useEffect(() => syncDebounced("customerkoi", "Customer koi", db.syncCustomerKoi, customerKoiList), [customerKoiList, syncDebounced]);
  useEffect(() => syncDebounced("ponds", "Pond data", db.syncPondData, pondData), [pondData, syncDebounced]);
  useEffect(() => syncDebounced("deliveries", "WhatsApp groups", db.syncWhatsappGroups, whatsappGroups), [whatsappGroups, syncDebounced]);

  const [chatMessages, setChatMessages] = useState(loadChatHistory);

  useEffect(() => {
    sessionStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify(chatMessages.slice(-CHAT_HISTORY_MAX).map(slimChatMessageForStorage)),
    );
  }, [chatMessages]);

  const handleKoiSold = useCallback(async (koi, customer, soldPrice, soldDate, options = {}) => {
    if (!customer || options.disposition !== "keep") return;
    const keepPondName = options.keepPondName?.trim() || "";
    const existing = customerKoiList.find(
      (r) => sameKoiId(r.koiId, koi.id) && r.status !== CUSTOMER_KOI_STATUS.DECEASED,
    );
    if (existing) {
      addNotification({
        type: "warning",
        title: "Already in Customer Koi",
        message: `${koi.id} is already linked to ${existing.customerName}. Update status in Customer Koi.`,
      });
      throw new Error("Customer Koi record already exists for this fish.");
    }
    const ckoiId = genId("CKOI");
    let photo = resolvePhotoRefFromKoi(koi.photo, koi.id);
    const snapshotCustomerKoi = customerKoiList;
    try {
      if (photo && isSupabaseConfigured) {
        photo = await uploadInlinePhotoIfNeeded(
          photo,
          (data) => db.uploadCustomerKoiPhoto(ckoiId, data, "photo"),
        );
      }
      const record = touchUpdatedAt({
        id: ckoiId,
        customerId: customer.id,
        customerName: customer.name,
        koiId: koi.id,
        photo,
        fishName: koi.name?.trim() || "",
        variety: koi.variety,
        size: koi.size ?? null,
        pondName: keepPondName,
        purchaseDate: soldDate || today(),
        purchasePrice: soldPrice,
        status: CUSTOMER_KOI_STATUS.IN_POND,
        collectedDate: null,
        notes: `Purchased from Marugen Farm. Kept at ${keepPondName}. Original KOI ID: ${koi.id}`,
        deathDate: null,
        deathCause: null,
        deathPhoto: null,
        deathNotes: "",
      });
      const nextList = [...customerKoiList, record];
      if (isSupabaseConfigured) {
        await persistCustomerKoiList(nextList);
      }
      await flushCustomerKoiSync(nextList);
      setCustomerKoiList(nextList);
      addNotification({
        type: "info",
        title: "Customer Record Created",
        message: `Koi kept at ${keepPondName} for ${customer.name}. Track in Customer Koi.`,
      });
    } catch (err) {
      if (isSupabaseConfigured) {
        try {
          await persistCustomerKoiList(snapshotCustomerKoi);
        } catch {
          /* best-effort local rollback */
        }
      }
      setCustomerKoiList(snapshotCustomerKoi);
      addNotification({
        type: "error",
        title: "Customer Koi Save Failed",
        message: err?.message || "Could not save customer koi record to cloud.",
      });
      throw err;
    }
  }, [addNotification, customerKoiList, flushCustomerKoiSync]);

  useEffect(() => {
    handleKoiSoldRef.current = handleKoiSold;
  }, [handleKoiSold]);

  const handleKoiRefund = useCallback(async (koi, { reason = "" } = {}) => {
    if (!canRefundSales(currentUser)) {
      notifyPermissionDenied(addNotification, "refund");
      throw new Error("Permission denied.");
    }
    const linkedCustomerKoi = customerKoiList.filter(
      (r) => sameKoiId(r.koiId, koi.id) && r.status !== CUSTOMER_KOI_STATUS.DECEASED,
    );
    const isSold = koi?.status === KOI_STATUS.SOLD || Boolean(koi?.soldTo);
    if (!koi || !isSold) return;

    const removedIds = new Set(linkedCustomerKoi.map((r) => String(r.id)));
    const snapshotCustomerKoi = customerKoiList;
    const snapshotKoiList = koiFishList;
    linkedCustomerKoi.forEach((r) => markDeleted("customer_koi", r.id));
    const nextCustomerKoi = customerKoiList.filter((r) => !removedIds.has(String(r.id)));

    const nextKoiList = koiFishList.map((k) => (
      sameKoiId(k.id, koi.id) ? buildKoiRefundUpdate(k, reason) : k
    ));

    const invoiceList = syncStateRef.current.invoices ?? invoices;
    const linkedInvoices = findInvoicesForKoiRefund(invoiceList, koi);

    let koiSynced = false;
    let customerKoiSynced = false;
    const cancelledInvoiceIds = [];
    const linkedInvoiceSnapshots = linkedInvoices.map((inv) => ({ ...inv }));
    try {
      syncStateRef.current = {
        ...syncStateRef.current,
        koiFishList: nextKoiList,
        customerKoiList: nextCustomerKoi,
      };
      setKoiFishList(nextKoiList);
      setCustomerKoiList(nextCustomerKoi);
      explicitFlushAtRef.current.koifish = Date.now();
      explicitFlushAtRef.current.customerkoi = Date.now();

      for (const inv of linkedInvoices) {
        await cancelInvoiceCloud(inv, {
          skipKoiRestore: true,
          fromRefund: true,
          refundReason: reason,
        });
        cancelledInvoiceIds.push(inv.id);
      }

      try {
        await flushKoiFishSync(nextKoiList, { force: true });
        koiSynced = true;
        await flushCustomerKoiSync(nextCustomerKoi);
        customerKoiSynced = true;
      } catch (syncErr) {
        if (cancelledInvoiceIds.length) {
          explicitFlushAtRef.current.koifish = Date.now();
          addNotification({
            type: "warning",
            title: "Refund Partially Synced",
            message: `${koi.id} was returned to stock on the server. Cloud sync will retry — refresh if the Sold tab still shows this fish.`,
          });
        } else {
          throw syncErr;
        }
      }

      if (!linkedInvoices.length) {
        addNotification({
          type: "warning",
          title: "No Linked Invoice",
          message: `${koi.id} was returned to stock, but no matching invoice was found to void.`,
        });
      }
    } catch (err) {
      linkedCustomerKoi.forEach((r) => unmarkDeleted("customer_koi", r.id));
      if (!koiSynced && !cancelledInvoiceIds.length) {
        setKoiFishList(snapshotKoiList);
      } else if (cancelledInvoiceIds.length) {
        setKoiFishList(nextKoiList);
        syncStateRef.current = { ...syncStateRef.current, koiFishList: nextKoiList };
      }
      if (!customerKoiSynced) {
        setCustomerKoiList(snapshotCustomerKoi);
      }

      for (const invId of cancelledInvoiceIds) {
        const original = linkedInvoiceSnapshots.find((i) => String(i.id) === String(invId));
        if (!original) continue;
        unpinInvoice(String(invId));
        const revertedInvoices = sortInvoices(
          syncStateRef.current.invoices.map((i) => (
            String(i.id) === String(invId)
              ? touchUpdatedAt(db.sanitizeInvoiceForSync(original))
              : i
          )),
        );
        syncStateRef.current = { ...syncStateRef.current, invoices: revertedInvoices };
        setInvoices(applyInvoicePins(revertedInvoices));
      }

      try {
        if (customerKoiSynced) {
          await flushCustomerKoiSync(snapshotCustomerKoi);
        }
        if (koiSynced) {
          await flushKoiFishSync(snapshotKoiList);
        }
      } catch {
        /* best-effort server rollback */
      }

      const rollbackNote = cancelledInvoiceIds.length
        ? ` Invoices ${cancelledInvoiceIds.join(", ")} may still be voided in cloud — refresh and verify.`
        : "";
      addNotification({
        type: "error",
        title: "Refund Save Failed",
        message: `${err?.message || "Could not sync refund to cloud. Try again."}${rollbackNote}`,
      });
      throw err;
    }

    addNotification({
      type: "success",
      title: "Refund Complete",
      message: `${koi.name || koi.variety} (${koi.id}) returned to available stock.`,
    });
    if (cancelledInvoiceIds.length) {
      addNotification({
        type: "info",
        title: "Linked Invoices Cancelled",
        message: `Credit note applied — cancelled: ${cancelledInvoiceIds.join(", ")}`,
      });
      explicitFlushAtRef.current.invoices = Date.now();
    }
    explicitFlushAtRef.current.koifish = Date.now();
  }, [
    invoices, addNotification, currentUser, customerKoiList, koiFishList, customers,
    flushCustomerKoiSync, flushKoiFishSync, cancelInvoiceCloud,
  ]);

  const clearInvoiceOpenDraft = useCallback(() => setInvoiceOpenDraft(null), []);

  const handleCreateInvoiceFromKoiSale = useCallback(async (draft) => {
    if (!currentUser || !hasPermission(currentUser, "invoices")) {
      addNotification({
        type: "warning",
        title: "Invoice Access Required",
        message: "You need Invoices permission to create an invoice for this sale.",
      });
      throw new Error("Permission denied (invoices).");
    }

    const invoiceList = syncStateRef.current.invoices ?? invoices;
    const koiIds = (draft?.items || []).map((it) => it.koiId).filter(Boolean);
    let existing = null;
    for (const koiId of koiIds) {
      if (!hasActiveInvoiceForKoi(invoiceList, koiId)) continue;
      existing = findLinkedKoiInvoices(invoiceList, koiId).find(
        (inv) => getInvoiceStatus(inv) !== "cancelled",
      );
      if (existing) break;
    }
    if (existing) {
      setActiveTab("invoices");
      setInvoiceViewRequest({ id: String(existing.id) });
      addNotification({
        type: "info",
        title: "Invoice Already Exists",
        message: `${existing.id} is already linked to this koi sale.`,
      });
      return null;
    }

    const inv = touchUpdatedAt(db.sanitizeInvoiceForSync(
      buildInvoiceFromKoiSaleDraft(draft, {
        invoices: invoiceList,
        customers,
        createdBy: currentUser.name,
      }),
    ));

    try {
      await createInvoiceCloud(inv);
      setActiveTab("invoices");
      setInvoiceViewRequest({ id: String(inv.id) });
      addNotification({
        type: "success",
        title: "Invoice Created",
        message: `${inv.id} created for koi sale — ${formatSGD(inv.total)}.`,
      });
      return String(inv.id);
    } catch (err) {
      setInvoiceOpenDraft(draft);
      setActiveTab("invoices");
      setInvoiceDraftSignal((n) => n + 1);
      addNotification({
        type: "error",
        title: "Invoice Not Saved",
        message: err?.message || "Could not save invoice. Sale was not completed.",
      });
      throw err;
    }
  }, [
    currentUser, addNotification, invoices, customers, createInvoiceCloud,
  ]);

  const handleAbortKoiSaleInvoice = useCallback(async (invoiceId) => {
    const invoiceList = syncStateRef.current.invoices ?? [];
    const inv = invoiceList.find((i) => String(i.id) === String(invoiceId));
    if (!inv || getInvoiceStatus(inv) === "cancelled") return;
    await cancelInvoiceCloud(inv, { skipKoiRestore: true, fromRefund: false });
  }, [cancelInvoiceCloud]);

  const visibleNotifications = useMemo(
    () => filterNotificationsForUser(notifications, {
      currentUserId: currentUser?.id,
      isOwner: currentUser?.role === "owner",
    }),
    [notifications, currentUser],
  );
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  const handleOpenInvoiceFromDashboard = useCallback((invoiceId) => {
    if (!invoiceId) return;
    setInvoiceViewRequest({ id: String(invoiceId) });
    setActiveTab("invoices");
  }, []);

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

  const registeredPondNames = useMemo(
    () => (pondData.ponds || []).map((p) => p.name).filter(Boolean),
    [pondData.ponds],
  );

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
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
    setChatMessages(INITIAL_CHAT_MESSAGES);
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

  if (!dataReady) {
    return <LoadingScreen message={isSupabaseConfigured ? "Loading from Supabase..." : "Loading..."} />;
  }

  if (needsSetup) return <SetupScreen onComplete={handleSetupComplete} />;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} cloudMode={isSupabaseConfigured} />;

  const guard = (permission, label, content) => {
    if (!hasPermission(currentUser, permission)) return <AccessDenied moduleName={label} />;
    return <ErrorBoundary>{content}</ErrorBoundary>;
  };

  const aiContext = {
    customers, invoices, expenses, products, deliveries, events, stockLog, currentUser, addNotification,
    isSupabaseConfigured,
    koiFishList, customerKoiList, pondData,
    setCustomers, setInvoices, setExpenses: setExpensesWithRef, setProducts, setDeliveries, setEvents, setStockLog,
    setKoiFishList, setCustomerKoiList, setPondData: setPondDataWithRef,
    onNavigate: goToTab,
    onKoiSold: handleKoiSold,
    onKoiRefund: handleKoiRefund,
    onCreateInvoiceFromSale: handleCreateInvoiceFromKoiSale,
    onAbortKoiSaleInvoice: handleAbortKoiSaleInvoice,
    onPersistEvents: flushEventSync,
    onPersistDeliveries: flushDeliveriesSync,
    onPersistExpenses: flushExpenseSync,
    onProductsSaved: flushProductSync,
    onPersistCustomers: flushCustomersSync,
    onSyncKoiFish: flushKoiFishSync,
    onSyncInventoryToCloud: flushInventorySync,
    onSyncCustomerKoiToCloud: flushCustomerKoiSync,
    onCreateInvoiceCloud: createInvoiceCloud,
    onCancelInvoiceCloud: cancelInvoiceCloud,
    onMarkInvoicePaid: markInvoicePaidCloud,
  };

  const renderModule = () => {
    const props = { customers, invoices, expenses, products, deliveries, events, koiFishList, customerKoiList, currentUser, addNotification, onNavigate: goToTab, onRetrySync: refreshFromCloud };
    const dashboardCloudStale = isSupabaseConfigured && Boolean(cloudError);
    switch (effectiveTab) {
      case "dashboard": return guard("dashboard", "Dashboard", (
        <Dashboard
          {...props}
          onOpenInvoice={handleOpenInvoiceFromDashboard}
          cloudStale={dashboardCloudStale}
        />
      ));
      case "inventory": return guard("inventory", "Inventory", <InventoryModule products={products} setProducts={setProducts} stockLog={stockLog} setStockLog={setStockLog} invoices={invoices} addNotification={addNotification} currentUser={currentUser} onProductsSaved={flushProductSync} onInventorySaved={flushInventorySync} onAdjustStockCloud={isSupabaseConfigured ? adjustInventoryStockCloud : undefined} />);
      case "koifish": return guard("koifish", "Koi Fish", <KoiFish koiList={koiFishList} setKoiList={setKoiFishList} customers={customers} invoices={invoices} customerKoiList={customerKoiList} onKoiSold={handleKoiSold} onKoiRefund={handleKoiRefund} onCreateInvoiceFromSale={handleCreateInvoiceFromKoiSale} onAbortKoiSaleInvoice={handleAbortKoiSaleInvoice} onSyncKoiFish={flushKoiFishSync} registeredPondNames={registeredPondNames} addNotification={addNotification} canEdit={canEditRecords(currentUser)} canRefund={canRefundSales(currentUser)} />);
      case "customerkoi": return guard("customerkoi", "Customer Koi", <CustomerKoi records={customerKoiList} setRecords={setCustomerKoiList} customers={customers} farmKoiList={koiFishList} registeredPondNames={registeredPondNames} addNotification={addNotification} canEdit={canEditRecords(currentUser)} onRecordsSaved={flushCustomerKoiSync} />);
      case "ponds": return guard("ponds", "Pond Management", <PondManagement pondData={pondData} setPondData={setPondDataWithRef} addNotification={addNotification} currentUser={currentUser} users={users} canEdit={canEditRecords(currentUser)} canDelete={canDeleteRecords(currentUser)} onPersistPondData={syncPondDataNow} onSyncReminderCalendar={syncReminderCalendar} />);
      case "invoices": return guard("invoices", "Invoices", <InvoiceModule key={invoiceDraftSignal ? `draft-${invoiceDraftSignal}` : "default"} invoices={invoices} setInvoices={setInvoices} setProducts={setProducts} setStockLog={setStockLog} stockLog={stockLog} customers={customers} products={products} koiFishList={koiFishList} setKoiFishList={setKoiFishList} onKoiSold={handleKoiSold} customerKoiList={customerKoiList} setCustomerKoiList={setCustomerKoiList} addNotification={addNotification} currentUser={currentUser} openDraft={invoiceOpenDraft} draftSignal={invoiceDraftSignal} onDraftApplied={clearInvoiceOpenDraft} openViewId={invoiceViewRequest?.id} onViewOpened={() => setInvoiceViewRequest(null)} onMarkInvoicePaid={markInvoicePaidCloud} onCancelInvoiceCloud={cancelInvoiceCloud} onCreateInvoiceCloud={createInvoiceCloud} onPatchInvoiceCloud={patchInvoiceCloud} onInventorySideEffect={requestInventorySideEffect} onSyncKoiFishToCloud={flushKoiFishSync} onSyncInventoryToCloud={flushInventorySync} onSyncCustomerKoiToCloud={flushCustomerKoiSync} onRefreshFromCloud={refreshFromCloud} onBookedChange={markInvoiceBookedCloud} />);
      case "customers": return guard("customers", "Customers", <CustomerModule customers={customers} setCustomers={setCustomers} invoices={invoices} setInvoices={setInvoices} deliveries={deliveries} setDeliveries={setDeliveries} customerKoiList={customerKoiList} setCustomerKoiList={setCustomerKoiList} addNotification={addNotification} currentUser={currentUser} onCustomersSaved={flushCustomersSync} />);
      case "expenses": return guard("expenses", "Expenses", <ExpenseModule expenses={expenses} setExpenses={setExpensesWithRef} addNotification={addNotification} currentUser={currentUser} onPersistExpenses={flushExpenseSync} />);
      case "deliveries": return guard("deliveries", "Deliveries", <DeliveryModule deliveries={deliveries} setDeliveries={setDeliveries} customers={customers} invoices={invoices} whatsappGroups={whatsappGroups} setWhatsappGroups={setWhatsappGroups} addNotification={addNotification} currentUser={currentUser} cloudMode={isSupabaseConfigured && cloudSync} users={users} onPersistDeliveries={flushDeliveriesSync} onPersistWhatsappGroups={flushWhatsappGroupsSync} />);
      case "calendar": return guard("calendar", "Calendar", <CalendarModule events={events} setEvents={setEventsWithRef} onNavigateToPonds={() => goToTab("ponds")} addNotification={addNotification} currentUser={currentUser} users={users} onPersistEvents={flushEventSync} />);
      case "chat": return guard("chat", "AI Chat", <ChatModule aiContext={aiContext} messages={chatMessages} setMessages={setChatMessages} isMobile={isMobile} />);
      case "users": return <ErrorBoundary><TeamModule users={users} setUsers={setUsers} currentUser={currentUser} addNotification={addNotification} onCurrentUserUpdate={handleUserUpdate} cloudMode={isSupabaseConfigured && cloudSync} apiEnabled={isSupabaseConfigured} onOpenChangePin={() => setShowChangePin(true)} getBackupData={getBackupData} /></ErrorBoundary>;
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
