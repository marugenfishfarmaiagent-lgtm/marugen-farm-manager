import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Users, FileText, TrendingUp, Truck, Calendar, MessageSquare, Bell, LogOut, Plus, Search, X, Check, AlertTriangle, Home, BarChart2, Menu, DollarSign, Boxes, Eye, Send, Phone, MapPin, Star, Activity, ArrowUp, ArrowDown, Zap, Clock, CheckCircle, XCircle, Info, Archive, ShoppingBag, Shield, UserCog, UserPlus, Edit2, Trash2, Lock } from "lucide-react";
import { sendChatMessage } from "./lib/gemini";
import * as db from "./lib/database";
import { isSupabaseConfigured } from "./lib/supabase";
import * as auth from "./lib/auth";
import {
  FISH_TYPES, AROWANA_TYPES, KOI_TYPES, SG_AREAS, PRODUCT_CATEGORIES, EXPENSE_CATEGORIES,
  CUSTOMER_TIERS, PAYNOW_UEN, PAYNOW_QR_PATTERN, ALL_PERMISSIONS, DEFAULT_PERMISSIONS,
  formatSGD, today, genId, getInvoiceStatus, calcCustomerTier,
  INITIAL_PRODUCTS, INITIAL_CUSTOMERS, INITIAL_INVOICES, INITIAL_EXPENSES,
  INITIAL_DELIVERIES, INITIAL_EVENTS, LOCAL_DEMO_USERS, DEMO_SEED,
} from "./data/constants";
import logo from "./assets/logo.png";

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
  if (!user?.permissions) return false;
  return user.permissions.includes(permission);
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

function Badge({ children, className = "" }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>{children}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl ${className}`}>{children}</div>;
}

function Modal({ open, onClose, title, children, size = "md" }) {
  if (!open) return null;
  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full ${sizes[size]} max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-white pr-2">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-2 -mr-1 rounded-lg hover:bg-slate-700 transition-colors touch-manipulation"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, className = "", required, min, step }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} step={step}
        className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all" />
    </div>
  );
}

function Select({ label, value, onChange, options, className = "", required }) {
  return (
    <div className={className}>
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
    <div className={className}>
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
  const sizes = { sm: "px-3 py-2 text-xs min-h-[40px]", md: "px-4 py-2.5 text-sm min-h-[44px]", lg: "px-6 py-3 text-base min-h-[48px]" };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
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

function NotificationPanel({ notifications, onDismiss, onClear, onMarkRead }) {
  const unread = notifications.filter(n => !n.read).length;
  return (
    <div className="space-y-2 w-full max-w-[min(100vw-2rem,320px)] sm:min-w-[320px]">
      {notifications.length === 0 ? (
        <div className="text-center py-8 text-slate-500"><Bell size={32} className="mx-auto mb-2 opacity-40" /><p>No notifications</p></div>
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

function SetupScreen({ onComplete }) {
  const [name, setName] = useState("Marugen Owner");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    if (!name.trim() || pin.length < 4) {
      setError("Name and a 4-digit PIN are required.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await auth.setupOwner({ name: name.trim(), pin });
      onComplete(auth.toAppUser(result.user));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 flex items-center justify-center p-4 safe-bottom" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 60%), #0f172a" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <AppLogo size="lg" className="mx-auto mb-4 shadow-2xl shadow-black/50 ring-2 ring-slate-700" />
          <h1 className="text-xl sm:text-2xl font-black text-white">Welcome to Marugen Farm</h1>
          <p className="text-slate-400 text-sm mt-1">Create your owner account to get started</p>
        </div>
        <Card className="p-5 sm:p-6 space-y-4">
          <Input label="Owner Name" value={name} onChange={e => setName(e.target.value)} required />
          <Input label="Choose PIN (4+ digits)" type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} required />
          <Input label="Confirm PIN" type="password" inputMode="numeric" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} required />
          {error && <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={14} />{error}</div>}
          <Btn onClick={handleSetup} disabled={loading} className="w-full justify-center" size="lg">{loading ? "Setting up..." : "Create Account →"}</Btn>
        </Card>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, users, cloudMode }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      if (cloudMode) {
        const result = await auth.loginWithPin(pin);
        onLogin(auth.toAppUser(result.user));
      } else {
        const user = users.find((u) => u.pin === pin && u.active !== false);
        if (user) {
          auth.setSession({ token: "local", user: { id: user.id, name: user.name, role: user.role, permissions: user.permissions } });
          onLogin(auth.toAppUser(user));
        } else {
          setError("Incorrect PIN or account inactive.");
        }
      }
    } catch (err) {
      setError(err.message || "Login failed.");
    }
    setLoading(false);
  };

  const activeUsers = users.filter((u) => u.active !== false);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-900 flex items-center justify-center p-4 safe-bottom" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 60%), #0f172a" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 sm:mb-8">
          <AppLogo size="lg" className="mx-auto mb-4 shadow-2xl shadow-black/50 ring-2 ring-slate-700" />
          <h1 className="text-xl sm:text-2xl font-black text-white">Marugen Koi Farm</h1>
          <p className="text-cyan-400 text-sm font-medium mt-1">Koi & Arowana Singapore</p>
        </div>
        <Card className="p-5 sm:p-6">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1"><Lock size={12} /> PIN Login</label>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="••••"
              onKeyDown={e => e.key === "Enter" && !loading && handleLogin()}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-xl px-3 py-4 text-white text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 touch-manipulation" />
            <p className="text-xs text-slate-500 mt-2 text-center">Enter your assigned PIN to login</p>
          </div>
          {activeUsers.length > 0 && (
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
          )}
          {error && <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-sm flex items-center gap-2"><AlertTriangle size={14} />{error}</div>}
          <Btn onClick={handleLogin} disabled={loading} className="w-full justify-center" size="lg">{loading ? "Logging in..." : "Login →"}</Btn>
        </Card>
      </div>
    </div>
  );
}

function Dashboard({ invoices, expenses, customers, products, events, deliveries, currentUser }) {
  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const pendingRevenue = invoices.filter(i => i.status === "pending").reduce((s, i) => s + i.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const lowStock = products.filter(p => p.stock <= p.minStock);
  const todayStr = today();
  const todayEvents = events.filter(e => e.date === todayStr);
  const scheduledDeliveries = deliveries.filter(d => d.status === "scheduled").length;

  const stats = [
    { label: "Revenue (Paid)", value: formatSGD(totalRevenue), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "Pending Amount", value: formatSGD(pendingRevenue), icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { label: "Total Expenses", value: formatSGD(totalExpenses), icon: TrendingUp, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    { label: "Net Profit", value: formatSGD(totalRevenue - totalExpenses), icon: Activity, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  ];

  const expBreakdown = EXPENSE_CATEGORIES.map(c => ({ cat: c, total: expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Dashboard</h2>
          <p className="text-slate-400 text-sm mt-0.5">Welcome back, {currentUser.displayName}</p>
        </div>
        <p className="text-xs text-slate-500 shrink-0">{new Date().toLocaleDateString("en-SG", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className={`p-4 border ${s.bg}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.bg}`}><s.icon size={18} className={s.color} /></div>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-xs mt-1">{s.label}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart2 size={16} className="text-cyan-400" />Expense Breakdown</h3>
          <div className="space-y-2">
            {expBreakdown.length === 0 ? <p className="text-slate-500 text-sm">No expenses recorded</p> : expBreakdown.map(e => (
              <div key={e.cat}>
                <div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{e.cat}</span><span className="text-slate-400">{formatSGD(e.total)}</span></div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" style={{ width: `${(e.total / Math.max(...expBreakdown.map(x => x.total))) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          {lowStock.length > 0 && (
            <Card className="p-4 border-amber-500/20 bg-amber-500/5">
              <h3 className="text-sm font-bold text-amber-300 mb-3 flex items-center gap-2"><AlertTriangle size={14} />Low Stock Alert ({lowStock.length})</h3>
              {lowStock.slice(0, 4).map(p => (
                <div key={p.id} className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 truncate">{p.name}</span>
                  <span className="text-amber-400 font-bold ml-2">{p.stock} {p.unit}</span>
                </div>
              ))}
            </Card>
          )}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Calendar size={14} className="text-cyan-400" />Today&apos;s Schedule</h3>
            {todayEvents.length === 0 ? <p className="text-slate-500 text-xs">No events today</p> : todayEvents.map(e => (
              <div key={e.id} className={`text-xs p-2 rounded-lg border mb-2 ${eventTypeColor[e.type]}`}>
                <p className="font-semibold">{e.time} - {e.title}</p>
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Truck size={14} className="text-cyan-400" />Deliveries</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <span className="text-blue-300 text-xl font-black">{scheduledDeliveries}</span>
              </div>
              <div><p className="text-white font-bold">Scheduled</p><p className="text-slate-400 text-xs">Upcoming deliveries</p></div>
            </div>
          </Card>
        </div>
      </div>
      <Card className="p-4">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Users size={14} className="text-cyan-400" />Recent Customers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-xs border-b border-slate-700">
              <th className="text-left pb-2">Name</th><th className="text-left pb-2">Area</th><th className="text-left pb-2">Fish</th><th className="text-left pb-2">Tier</th><th className="text-right pb-2">Total Spent</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {customers.slice(0, 5).map(c => (
                <tr key={c.id} className="text-slate-300">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 text-slate-400">{c.area}</td>
                  <td className="py-2"><div className="flex flex-wrap gap-1">{c.fishTypes.slice(0, 2).map(f => <Badge key={f} className="bg-slate-700 text-slate-300">{f}</Badge>)}</div></td>
                  <td className="py-2"><span className={`font-bold ${tierColor[c.tier]}`}>{c.tier}</span></td>
                  <td className="py-2 text-right font-bold text-emerald-400">{formatSGD(c.totalSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// INVENTORY / PRODUCTS MODULE
// ─────────────────────────────────────────────
function InventoryModule({ products, setProducts, stockLog, setStockLog, addNotification, currentUser }) {
  const [tab, setTab] = useState("stock");
  const [showAdd, setShowAdd] = useState(false);
  const [showUse, setShowUse] = useState(null);
  const [showSell, setShowSell] = useState(null);
  const [showRestock, setShowRestock] = useState(null);
  const [restockQty, setRestockQty] = useState(1);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [useQty, setUseQty] = useState(1);
  const [useNote, setUseNote] = useState("");
  const [sellQty, setSellQty] = useState(1);
  const [sellPrice, setSellPrice] = useState("");
  const [form, setForm] = useState({ name: "", category: "Fish Food", sku: "", price: "", cost: "", unit: "kg", stock: "", minStock: "", description: "" });

  const filtered = products.filter(p =>
    (catFilter === "All" || p.category === catFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const addProduct = () => {
    if (!form.name || !form.price || !form.stock) return;
    const p = { ...form, id: Date.now(), price: +form.price, cost: +form.cost || 0, stock: +form.stock, minStock: +form.minStock || 0 };
    setProducts(prev => [...prev, p]);
    addNotification({ type: "success", title: "Product Added", message: `${p.name} added to inventory` });
    setShowAdd(false);
    setForm({ name: "", category: "Fish Food", sku: "", price: "", cost: "", unit: "kg", stock: "", minStock: "", description: "" });
  };

  const confirmUseStock = (product) => {
    if (useQty <= 0 || useQty > product.stock) return;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: p.stock - useQty } : p));
    setStockLog(prev => [{ id: Date.now(), productId: product.id, productName: product.name, type: "use", qty: useQty, note: useNote, date: today(), by: currentUser.name }, ...prev]);
    if (product.stock - useQty <= product.minStock) addNotification({ type: "warning", title: "Low Stock", message: `${product.name} stock is low (${product.stock - useQty} ${product.unit} remaining)` });
    setShowUse(null); setUseQty(1); setUseNote("");
  };

  const sellStock = (product) => {
    if (sellQty <= 0 || sellQty > product.stock) return;
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: p.stock - sellQty } : p));
    const price = +sellPrice || product.price;
    setStockLog(prev => [{ id: Date.now(), productId: product.id, productName: product.name, type: "sell", qty: sellQty, price, total: sellQty * price, note: "", date: today(), by: currentUser.name }, ...prev]);
    addNotification({ type: "success", title: "Sale Recorded", message: `Sold ${sellQty}x ${product.name} for ${formatSGD(sellQty * price)}` });
    setShowSell(null); setSellQty(1); setSellPrice("");
  };

  const restock = (product, qty) => {
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: p.stock + qty } : p));
    setStockLog(prev => [{ id: Date.now(), productId: product.id, productName: product.name, type: "restock", qty, note: "Manual restock", date: today(), by: currentUser.name }, ...prev]);
    addNotification({ type: "info", title: "Restocked", message: `${product.name} restocked by ${qty} ${product.unit}` });
  };

  const totalStockValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const totalRetailValue = products.reduce((s, p) => s + p.stock * p.price, 0);
  const lowStockItems = products.filter(p => p.stock <= p.minStock);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Inventory</h2>
          <p className="text-slate-400 text-sm">Products, Feed & Supplies</p>
        </div>
        <Btn onClick={() => setShowAdd(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />Add Product</Btn>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Products", value: products.length, icon: Boxes, color: "text-cyan-400" },
          { label: "Low Stock Items", value: lowStockItems.length, icon: AlertTriangle, color: lowStockItems.length > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Stock Cost Value", value: formatSGD(totalStockValue), icon: DollarSign, color: "text-blue-400" },
          { label: "Retail Value", value: formatSGD(totalRetailValue), icon: TrendingUp, color: "text-emerald-400" },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <s.icon size={20} className={`${s.color} mb-2`} />
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
            <p className="text-slate-400 text-xs">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-700 pb-0">
        {["stock", "log"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-bold capitalize border-b-2 transition-all ${tab === t ? "border-cyan-400 text-cyan-400" : "border-transparent text-slate-400 hover:text-white"}`}>
            {t === "stock" ? "📦 Stock" : "📋 Activity Log"}
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
            <div className="flex gap-2 flex-wrap">
              {["All", ...PRODUCT_CATEGORIES].map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${catFilter === c ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{c}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(p => {
              const isLow = p.stock <= p.minStock;
              return (
                <Card key={p.id} className={`p-4 ${isLow ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-white font-bold text-sm">{p.name}</p>
                      <p className="text-slate-500 text-xs">{p.sku} · {p.category}</p>
                    </div>
                    {isLow && <Badge className="bg-amber-500/20 text-amber-300">Low Stock</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className={`text-lg font-black ${isLow ? "text-amber-400" : "text-white"}`}>{p.stock}</p>
                      <p className="text-slate-500 text-xs">{p.unit}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className="text-lg font-black text-cyan-400">{formatSGD(p.price)}</p>
                      <p className="text-slate-500 text-xs">Sell</p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2">
                      <p className="text-lg font-black text-slate-400">{formatSGD(p.cost)}</p>
                      <p className="text-slate-500 text-xs">Cost</p>
                    </div>
                  </div>
                  {p.minStock > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Stock Level</span><span>Min: {p.minStock}</span></div>
                      <div className="h-1.5 bg-slate-700 rounded-full"><div className={`h-full rounded-full ${isLow ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min((p.stock / (p.minStock * 3)) * 100, 100)}%` }} /></div>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Btn variant="success" size="sm" onClick={() => { setShowSell(p); setSellPrice(p.price.toString()); }}><ShoppingBag size={12} />Sell</Btn>
                    <Btn variant="secondary" size="sm" onClick={() => setShowUse(p)}><Archive size={12} />Use</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => { setShowRestock(p); setRestockQty(1); }}><Plus size={12} />Restock</Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {tab === "log" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="bg-slate-700/30 text-slate-400 text-xs">
              <th className="text-left p-3">Date</th><th className="text-left p-3">Product</th><th className="text-left p-3">Type</th>
              <th className="text-right p-3">Qty</th><th className="text-right p-3">Value</th><th className="text-left p-3">By</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {stockLog.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">No activity yet</td></tr>
              ) : stockLog.map(l => (
                <tr key={l.id} className="text-slate-300 hover:bg-slate-700/20">
                  <td className="p-3 text-slate-500 text-xs">{l.date}</td>
                  <td className="p-3 font-medium">{l.productName}</td>
                  <td className="p-3"><Badge className={l.type === "sell" ? "bg-emerald-500/20 text-emerald-300" : l.type === "use" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}>{l.type}</Badge></td>
                  <td className="p-3 text-right font-bold">{l.qty}</td>
                  <td className="p-3 text-right text-emerald-400">{l.total ? formatSGD(l.total) : "-"}</td>
                  <td className="p-3 text-slate-400 text-xs">{l.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {/* Add Product Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Product" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Product Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="sm:col-span-2" />
          <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={PRODUCT_CATEGORIES} />
          <Input label="SKU" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="FF001" />
          <Input label="Sell Price (S$)" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} step="0.01" required />
          <Input label="Cost Price (S$)" type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} step="0.01" />
          <Input label="Current Stock" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} required />
          <Input label="Min Stock Alert" type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} />
          <Input label="Unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg / bottle / unit" />
          <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="col-span-2" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addProduct}><Plus size={14} />Add Product</Btn>
        </div>
      </Modal>

      {/* Use Stock Modal */}
      <Modal open={!!showUse} onClose={() => setShowUse(null)} title={`Use: ${showUse?.name}`} size="sm">
        <p className="text-slate-400 text-sm mb-4">Available: <span className="text-white font-bold">{showUse?.stock} {showUse?.unit}</span></p>
        <Input label="Quantity to Use" type="number" value={useQty} onChange={e => setUseQty(+e.target.value)} min="1" className="mb-3" />
        <Textarea label="Note (optional)" value={useNote} onChange={e => setUseNote(e.target.value)} rows={2} className="mb-4" />
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setShowUse(null)}>Cancel</Btn>
          <Btn onClick={() => confirmUseStock(showUse)} disabled={useQty <= 0 || useQty > (showUse?.stock || 0)}><Archive size={14} />Confirm Use</Btn>
        </div>
      </Modal>

      {/* Restock Modal */}
      <Modal open={!!showRestock} onClose={() => setShowRestock(null)} title={`Restock: ${showRestock?.name}`} size="sm">
        <p className="text-slate-400 text-sm mb-4">Current stock: <span className="text-white font-bold">{showRestock?.stock} {showRestock?.unit}</span></p>
        <Input label="Quantity to Add" type="number" value={restockQty} onChange={e => setRestockQty(+e.target.value)} min="1" className="mb-4" />
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setShowRestock(null)}>Cancel</Btn>
          <Btn onClick={() => { if (restockQty > 0) { restock(showRestock, restockQty); setShowRestock(null); } }} disabled={restockQty <= 0}><Plus size={14} />Confirm Restock</Btn>
        </div>
      </Modal>

      {/* Sell Stock Modal */}
      <Modal open={!!showSell} onClose={() => setShowSell(null)} title={`Sell: ${showSell?.name}`} size="sm">
        <p className="text-slate-400 text-sm mb-4">Available: <span className="text-white font-bold">{showSell?.stock} {showSell?.unit}</span></p>
        <Input label="Quantity to Sell" type="number" value={sellQty} onChange={e => setSellQty(+e.target.value)} min="1" className="mb-3" />
        <Input label="Sell Price (S$)" type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} step="0.01" className="mb-1" />
        <p className="text-xs text-slate-500 mb-4">Default: {showSell ? formatSGD(showSell.price) : ""} per {showSell?.unit}</p>
        <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
          <p className="text-sm text-slate-400">Total: <span className="text-emerald-400 font-black text-lg">{formatSGD(sellQty * (+sellPrice || showSell?.price || 0))}</span></p>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setShowSell(null)}>Cancel</Btn>
          <Btn variant="success" onClick={() => sellStock(showSell)} disabled={sellQty <= 0 || sellQty > (showSell?.stock || 0)}><ShoppingBag size={14} />Confirm Sale</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// INVOICE MODULE
// ─────────────────────────────────────────────
function InvoiceModule({ invoices, setInvoices, setCustomers, customers, addNotification, currentUser }) {
  const [showNew, setShowNew] = useState(false);
  const [viewInv, setViewInv] = useState(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ customerId: "", customerName: "", items: [{ name: "", qty: 1, price: "" }], notes: "", due: "" });

  const filtered = invoices.filter(i => filter === "all" || getInvoiceStatus(i) === filter);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: "", qty: 1, price: "" }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, field, val) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));

  const formTotal = form.items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);

  const createInvoice = () => {
    if (!form.customerName || form.items.some(it => !it.name || !it.price)) return;
    const inv = {
      id: genId("INV"), customerId: form.customerId, customerName: form.customerName,
      items: form.items.map(it => ({ name: it.name, qty: +it.qty, price: +it.price })),
      total: formTotal, status: "pending", date: today(), due: form.due || today(), notes: form.notes, createdBy: currentUser.name
    };
    setInvoices(prev => [inv, ...prev]);
    addNotification({ type: "success", title: "Invoice Created", message: `${inv.id} for ${inv.customerName} - ${formatSGD(inv.total)}` });
    setShowNew(false);
    setForm({ customerId: "", customerName: "", items: [{ name: "", qty: 1, price: "" }], notes: "", due: "" });
  };

  const markPaid = (id) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: "paid" } : i));
    if (inv.customerId) {
      setCustomers(prev => prev.map(c => {
        if (c.id !== inv.customerId) return c;
        const totalSpent = c.totalSpent + inv.total;
        return { ...c, totalSpent, tier: calcCustomerTier(totalSpent) };
      }));
    }
    addNotification({ type: "success", title: "Payment Received", message: `${id} marked as paid - ${formatSGD(inv.total)}` });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl sm:text-2xl font-black text-white">Invoices</h2><p className="text-slate-400 text-sm">Manage billing & payments</p></div>
        <Btn onClick={() => setShowNew(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />New Invoice</Btn>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {["all", "pending", "paid", "overdue"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 touch-manipulation ${filter === s ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{s}</button>
        ))}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-slate-500">No invoices</Card>
        ) : filtered.map(inv => (
          <Card key={inv.id} className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="font-mono text-cyan-400 font-bold text-xs">{inv.id}</p>
                <p className="text-white font-bold truncate">{inv.customerName}</p>
                <p className="text-slate-500 text-xs">{inv.date}</p>
              </div>
              <Badge className={statusColor[getInvoiceStatus(inv)]}>{getInvoiceStatus(inv)}</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-black text-white">{formatSGD(inv.total)}</p>
              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={() => setViewInv(inv)}><Eye size={14} /></Btn>
                {["pending", "overdue"].includes(getInvoiceStatus(inv)) && <Btn variant="success" size="sm" onClick={() => markPaid(inv.id)}><Check size={12} />Paid</Btn>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="bg-slate-700/30 text-slate-400 text-xs">
            <th className="text-left p-3">Invoice</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Date</th>
            <th className="text-right p-3">Amount</th><th className="text-center p-3">Status</th><th className="text-center p-3">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-700/30">
            {filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-8 text-slate-500">No invoices</td></tr> :
              filtered.map(inv => (
                <tr key={inv.id} className="text-slate-300 hover:bg-slate-700/20">
                  <td className="p-3 font-mono text-cyan-400 font-bold text-xs">{inv.id}</td>
                  <td className="p-3 font-medium">{inv.customerName}</td>
                  <td className="p-3 text-slate-500 text-xs">{inv.date}</td>
                  <td className="p-3 text-right font-black text-white">{formatSGD(inv.total)}</td>
                  <td className="p-3 text-center"><Badge className={statusColor[getInvoiceStatus(inv)]}>{getInvoiceStatus(inv)}</Badge></td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center">
                      <Btn variant="ghost" size="sm" onClick={() => setViewInv(inv)}><Eye size={12} /></Btn>
                      {["pending", "overdue"].includes(getInvoiceStatus(inv)) && <Btn variant="success" size="sm" onClick={() => markPaid(inv.id)}><Check size={12} />Paid</Btn>}
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        </div>
      </Card>

      {/* New Invoice Modal */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Create Invoice" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Select label="Select Customer" value={form.customerId}
                onChange={e => { const c = customers.find(c => c.id === +e.target.value); setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name || "" })); }}
                options={[{ value: "", label: "-- Select --" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            </div>
            <Input label="Due Date" type="date" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
          </div>
          {form.customerName && !customers.find(c => c.id === +form.customerId) && (
            <Input label="Customer Name (Manual)" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Items</label>
            {form.items.map((it, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input value={it.name} onChange={e => updateItem(idx, "name", e.target.value)} placeholder="Item name"
                  className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
                <input type="number" value={it.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="Qty" min="1"
                  className="w-16 bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-center" />
                <input type="number" value={it.price} onChange={e => updateItem(idx, "price", e.target.value)} placeholder="Price" step="0.01"
                  className="w-24 bg-slate-900/50 border border-slate-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 px-2"><X size={14} /></button>
              </div>
            ))}
            <Btn variant="ghost" size="sm" onClick={addItem}><Plus size={12} />Add Item</Btn>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4 flex justify-between items-center">
            <span className="text-slate-400">Total</span>
            <span className="text-2xl font-black text-cyan-400">{formatSGD(formTotal)}</span>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowNew(false)}>Cancel</Btn>
          <Btn onClick={createInvoice}><FileText size={14} />Create Invoice</Btn>
        </div>
      </Modal>

      {/* View Invoice Modal */}
      <Modal open={!!viewInv} onClose={() => setViewInv(null)} title={`Invoice ${viewInv?.id}`} size="md">
        {viewInv && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-slate-500 text-xs">Customer</p><p className="text-white font-bold">{viewInv.customerName}</p></div>
              <div><p className="text-slate-500 text-xs">Status</p><Badge className={statusColor[getInvoiceStatus(viewInv)]}>{getInvoiceStatus(viewInv)}</Badge></div>
              <div><p className="text-slate-500 text-xs">Date</p><p className="text-white">{viewInv.date}</p></div>
              <div><p className="text-slate-500 text-xs">Due</p><p className="text-white">{viewInv.due}</p></div>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-2">ITEMS</p>
              {viewInv.items.map((it, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-slate-700/50 text-sm">
                  <span className="text-slate-300">{it.name} <span className="text-slate-500">×{it.qty}</span></span>
                  <span className="text-white font-bold">{formatSGD(it.qty * it.price)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-black text-lg">
                <span className="text-slate-400">Total</span>
                <span className="text-cyan-400">{formatSGD(viewInv.total)}</span>
              </div>
            </div>
            {viewInv.notes && <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Notes</p><p className="text-slate-300 text-sm">{viewInv.notes}</p></div>}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3"><Zap size={16} className="text-cyan-400" /><span className="text-white font-bold text-sm">PayNow Details</span></div>
              <div className="bg-white rounded-lg p-3 flex items-center justify-center mb-3">
                <div className="grid grid-cols-7 gap-0.5 w-28 h-28">
                  {PAYNOW_QR_PATTERN.map((dark, i) => (
                    <div key={i} className={`rounded-sm ${dark ? "bg-slate-900" : "bg-white"}`} />
                  ))}
                </div>
              </div>
              <p className="text-slate-400 text-xs text-center">Enter in your banking app:</p>
              <p className="text-white font-bold text-center text-sm mt-1">UEN: {PAYNOW_UEN}</p>
              <p className="text-cyan-400 font-bold text-center text-lg">{formatSGD(viewInv.total)}</p>
              <p className="text-slate-500 text-xs text-center mt-1">Reference: {viewInv.id}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOMER CRM
// ─────────────────────────────────────────────
function CustomerModule({ customers, setCustomers, addNotification }) {
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("All");
  const [form, setForm] = useState({ name: "", phone: "", whatsapp: "", area: "Tampines", fishTypes: [], tier: "Bronze", notes: "" });

  const filtered = customers.filter(c =>
    (tierFilter === "All" || c.tier === tierFilter) &&
    (c.name.toLowerCase().includes(search.toLowerCase()) || c.area.toLowerCase().includes(search.toLowerCase()))
  );

  const addCustomer = () => {
    if (!form.name || !form.phone) return;
    const c = { ...form, id: Date.now(), totalSpent: 0 };
    setCustomers(prev => [...prev, c]);
    addNotification({ type: "success", title: "Customer Added", message: `${c.name} added to CRM` });
    setShowAdd(false);
    setForm({ name: "", phone: "", whatsapp: "", area: "Tampines", fishTypes: [], tier: "Bronze", notes: "" });
  };

  const toggleFishType = (ft) => {
    setForm(f => ({ ...f, fishTypes: f.fishTypes.includes(ft) ? f.fishTypes.filter(x => x !== ft) : [...f.fishTypes, ft] }));
  };

  const generateWhatsApp = (c) => {
    const msg = encodeURIComponent(`Hi ${c.name}! 🐟 Marugen Koi & Arowana Farm here. We have new arrivals that may interest you. Would you like to take a look?`);
    window.open(`https://wa.me/${c.whatsapp?.replace(/\D/g, "")}?text=${msg}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl sm:text-2xl font-black text-white">Customers</h2><p className="text-slate-400 text-sm">{customers.length} registered</p></div>
        <Btn onClick={() => setShowAdd(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />Add Customer</Btn>
      </div>

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
        {filtered.map(c => (
          <Card key={c.id} className="p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-white font-bold">{c.name}</p>
                <p className="text-slate-500 text-xs flex items-center gap-1"><MapPin size={10} />{c.area}</p>
              </div>
              <span className={`font-black text-sm ${tierColor[c.tier]}`}>{c.tier}</span>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {c.fishTypes.map(f => <Badge key={f} className="bg-slate-700/60 text-slate-300">{f}</Badge>)}
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-xs">{c.phone}</span>
              <span className="text-emerald-400 font-bold text-sm">{formatSGD(c.totalSpent)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setView(c)}><Eye size={12} />View</Btn>
              <Btn variant="success" size="sm" onClick={() => generateWhatsApp(c)}><MessageSquare size={12} />WhatsApp</Btn>
            </div>
          </Card>
        ))}
      </div>

      {/* Add Customer */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="col-span-2" />
          <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+65 9XXX XXXX" required />
          <Input label="WhatsApp" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+65 9XXX XXXX" />
          <Select label="Area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} options={SG_AREAS} />
          <Select label="Tier" value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} options={CUSTOMER_TIERS} />
        </div>
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Fish Interests</label>
          <div className="flex flex-wrap gap-2">
            {FISH_TYPES.map(ft => (
              <button key={ft} onClick={() => toggleFishType(ft)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.fishTypes.includes(ft) ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{ft}</button>
            ))}
          </div>
        </div>
        <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-4" rows={2} />
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addCustomer}><Plus size={14} />Add Customer</Btn>
        </div>
      </Modal>

      {/* View Customer */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name} size="md">
        {view && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-slate-500 text-xs">Phone</p><p className="text-white flex items-center gap-1"><Phone size={12} />{view.phone}</p></div>
              <div><p className="text-slate-500 text-xs">WhatsApp</p><p className="text-white">{view.whatsapp}</p></div>
              <div><p className="text-slate-500 text-xs">Area</p><p className="text-white">{view.area}</p></div>
              <div><p className="text-slate-500 text-xs">Tier</p><p className={`font-black ${tierColor[view.tier]}`}><Star size={12} className="inline mr-1" />{view.tier}</p></div>
              <div><p className="text-slate-500 text-xs">Total Spent</p><p className="text-emerald-400 font-black text-lg">{formatSGD(view.totalSpent)}</p></div>
            </div>
            <div><p className="text-slate-500 text-xs mb-2">Fish Types</p><div className="flex flex-wrap gap-2">{view.fishTypes.map(f => <Badge key={f} className="bg-slate-700 text-slate-300">{f}</Badge>)}</div></div>
            {view.notes && <div className="bg-slate-900/50 rounded-lg p-3"><p className="text-slate-500 text-xs">Notes</p><p className="text-slate-300 text-sm">{view.notes}</p></div>}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <p className="text-emerald-400 text-xs font-bold mb-2">WhatsApp Template</p>
              <p className="text-slate-300 text-sm">Hi {view.name}! 🐟 Marugen Farm here. We have new {view.fishTypes[0] || "fish"} arrivals. Interested? DM us!</p>
              <Btn variant="success" size="sm" className="mt-2" onClick={() => generateWhatsApp(view)}><Send size={12} />Send on WhatsApp</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPENSE TRACKER
// ─────────────────────────────────────────────
function ExpenseModule({ expenses, setExpenses, invoices, addNotification, currentUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: "Feed", amount: "", date: today(), note: "" });

  if (!hasPermission(currentUser, "expenses")) return <AccessDenied moduleName="Expenses" />;

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const addExpense = () => {
    if (!form.amount) return;
    const e = { ...form, id: Date.now(), amount: +form.amount, addedBy: currentUser.name };
    setExpenses(prev => [...prev, e]);
    addNotification({ type: "info", title: "Expense Added", message: `${e.category}: ${formatSGD(e.amount)}` });
    setShowAdd(false);
    setForm({ category: "Feed", amount: "", date: today(), note: "" });
  };

  const catBreakdown = EXPENSE_CATEGORIES.map(c => ({ cat: c, total: expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const maxCat = Math.max(...catBreakdown.map(c => c.total), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl sm:text-2xl font-black text-white">Expenses</h2><p className="text-slate-400 text-sm">Track costs & profitability</p></div>
        <Btn onClick={() => setShowAdd(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />Add Expense</Btn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <p className="text-slate-400 text-xs mb-1">Total Revenue</p>
          <p className="text-2xl font-black text-emerald-400">{formatSGD(totalRevenue)}</p>
        </Card>
        <Card className="p-4 border-red-500/20 bg-red-500/5">
          <p className="text-slate-400 text-xs mb-1">Total Expenses</p>
          <p className="text-2xl font-black text-red-400">{formatSGD(totalExpenses)}</p>
        </Card>
        <Card className={`p-4 ${netProfit >= 0 ? "border-cyan-500/20 bg-cyan-500/5" : "border-red-500/20 bg-red-500/5"}`}>
          <p className="text-slate-400 text-xs mb-1">Net Profit</p>
          <p className={`text-2xl font-black flex items-center gap-1 ${netProfit >= 0 ? "text-cyan-400" : "text-red-400"}`}>
            {netProfit >= 0 ? <ArrowUp size={20} /> : <ArrowDown size={20} />}{formatSGD(Math.abs(netProfit))}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="text-sm font-bold text-white mb-4">Category Breakdown</h3>
          <div className="space-y-3">
            {catBreakdown.map(c => (
              <div key={c.cat}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300 font-medium">{c.cat}</span>
                  <span className="text-white font-bold">{formatSGD(c.total)}</span>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
                <p className="text-slate-500 text-xs mt-0.5">{((c.total / totalExpenses) * 100).toFixed(1)}% of total</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-bold text-white">Expense Log</h3>
          </div>
          <div className="divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
            {expenses.length === 0 ? <p className="text-slate-500 text-sm p-4">No expenses</p> :
              [...expenses].reverse().map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 hover:bg-slate-700/20">
                  <div>
                    <p className="text-white text-sm font-medium">{e.category}</p>
                    <p className="text-slate-500 text-xs">{e.date} · {e.note || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold">{formatSGD(e.amount)}</p>
                    <p className="text-slate-500 text-xs">{e.addedBy}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </Card>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense" size="sm">
        <div className="space-y-4">
          <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={EXPENSE_CATEGORIES} required />
          <Input label="Amount (S$)" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} step="0.01" required />
          <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          <Textarea label="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addExpense}><Plus size={14} />Add</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// DELIVERY MODULE
// ─────────────────────────────────────────────
function DeliveryModule({ deliveries, setDeliveries, customers, addNotification, currentUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ customerId: "", customerName: "", area: "Tampines", address: "", schedule: "", items: "", driver: "", notes: "" });

  const filtered = deliveries.filter(d => filter === "all" || d.status === filter);

  const addDelivery = () => {
    if (!form.customerName || !form.address || !form.schedule) return;
    const d = { ...form, id: genId("DEL"), status: "scheduled", createdBy: currentUser.name };
    setDeliveries(prev => [...prev, d]);
    addNotification({ type: "info", title: "Delivery Scheduled", message: `${d.id} → ${d.customerName} at ${d.area}` });
    setShowAdd(false);
    setForm({ customerId: "", customerName: "", area: "Tampines", address: "", schedule: "", items: "", driver: "", notes: "" });
  };

  const updateStatus = (id, status) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (status === "delivered") addNotification({ type: "success", title: "Delivery Completed", message: `${id} delivered successfully!` });
  };

  const statusFlow = { scheduled: ["transit", "cancelled"], transit: ["delivered", "cancelled"], delivered: [], cancelled: [] };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl sm:text-2xl font-black text-white">Deliveries</h2><p className="text-slate-400 text-sm">Singapore delivery management</p></div>
        <Btn onClick={() => setShowAdd(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />Schedule Delivery</Btn>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {["all", "scheduled", "transit", "delivered", "cancelled"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 touch-manipulation ${filter === s ? "bg-cyan-500 text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>{s}</button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? <Card className="p-8 text-center text-slate-500">No deliveries</Card> :
          filtered.map(d => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-mono text-cyan-400 text-xs font-bold">{d.id}</span>
                    <Badge className={statusColor[d.status]}>{d.status}</Badge>
                  </div>
                  <p className="text-white font-bold">{d.customerName}</p>
                  <p className="text-slate-400 text-sm flex items-center gap-1"><MapPin size={12} />{d.address}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
                    <span><Clock size={10} className="inline mr-1" />{d.schedule}</span>
                    <span>Items: {d.items}</span>
                    {d.driver && <span>Driver: {d.driver}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {statusFlow[d.status]?.map(next => (
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
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Schedule Delivery" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Customer" value={form.customerId}
            onChange={e => { const c = customers.find(x => x.id === +e.target.value); setForm(f => ({ ...f, customerId: e.target.value, customerName: c?.name || "", area: c?.area || "Tampines" })); }}
            options={[{ value: "", label: "-- Select --" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
          <Select label="Area" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} options={SG_AREAS} />
          <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Block / Unit / Street" required className="col-span-2" />
          <Input label="Schedule" type="datetime-local" value={form.schedule} onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))} required />
          <Input label="Driver Name" value={form.driver} onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} />
          <Textarea label="Items" value={form.items} onChange={e => setForm(f => ({ ...f, items: e.target.value }))} placeholder="e.g. 1x Super Red Arowana, 2x Koi Pellets" className="col-span-2" rows={2} />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="col-span-2" rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addDelivery}><Truck size={14} />Schedule</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// CALENDAR MODULE
// ─────────────────────────────────────────────
function CalendarModule({ events, setEvents, addNotification, currentUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", date: today(), time: "09:00", type: "other", note: "" });

  const addEvent = () => {
    if (!form.title || !form.date) return;
    const e = { ...form, id: Date.now(), createdBy: currentUser.name };
    setEvents(prev => [...prev, e]);
    addNotification({ type: "info", title: "Event Added", message: `${e.title} on ${e.date}` });
    setShowAdd(false);
    setForm({ title: "", date: today(), time: "09:00", type: "other", note: "" });
  };

  const deleteEvent = (id) => setEvents(prev => prev.filter(e => e.id !== id));
  const sorted = [...events].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const todayEvents = sorted.filter(e => e.date === today());
  const upcoming = sorted.filter(e => e.date > today());
  const past = sorted.filter(e => e.date < today());

  const EventCard = ({ e }) => (
    <div className={`p-3 rounded-xl border ${eventTypeColor[e.type]} flex items-start justify-between gap-3`}>
      <div>
        <p className="font-bold text-sm">{e.time && `${e.time} · `}{e.title}</p>
        <p className="text-xs opacity-70">{e.date}</p>
        {e.note && <p className="text-xs mt-1 opacity-60">{e.note}</p>}
      </div>
      <button onClick={() => deleteEvent(e.id)} className="opacity-50 hover:opacity-100 flex-shrink-0"><X size={12} /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl sm:text-2xl font-black text-white">Calendar</h2><p className="text-slate-400 text-sm">Events & reminders</p></div>
        <Btn onClick={() => setShowAdd(true)} className="w-full sm:w-auto justify-center"><Plus size={16} />Add Event</Btn>
      </div>

      {todayEvents.length > 0 && (
        <Card className="p-4 border-cyan-500/30 bg-cyan-500/5">
          <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2"><Zap size={14} />Today</h3>
          <div className="space-y-2">{todayEvents.map(e => <EventCard key={e.id} e={e} />)}</div>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-white mb-3">Upcoming</h3>
          <div className="space-y-2">{upcoming.map(e => <EventCard key={e.id} e={e} />)}</div>
        </Card>
      )}

      {past.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-slate-500 mb-3">Past Events</h3>
          <div className="space-y-2 opacity-50">{past.slice(0, 5).map(e => <EventCard key={e.id} e={e} />)}</div>
        </Card>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Event" size="sm">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Time" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
          </div>
          <Select label="Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={["maintenance", "feeding", "purchase", "customer", "other"]} />
          <Textarea label="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addEvent}><Plus size={14} />Add Event</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// TEAM & PERMISSIONS (Owner)
// ─────────────────────────────────────────────
function TeamModule({ users, setUsers, currentUser, addNotification, onCurrentUserUpdate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: "", role: "staff", pin: "", permissions: [...DEFAULT_PERMISSIONS.staff], active: true });

  if (!hasPermission(currentUser, "users")) return <AccessDenied moduleName="Team & Permissions" />;

  const openAdd = () => {
    setForm({ name: "", role: "staff", pin: "", permissions: [...DEFAULT_PERMISSIONS.staff], active: true });
    setEditUser(null);
    setShowAdd(true);
  };

  const openEdit = (user) => {
    setForm({ name: user.name, role: user.role, pin: user.pin, permissions: [...user.permissions], active: user.active !== false });
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

  const applyRoleDefaults = (role) => {
    setForm((f) => ({ ...f, role, permissions: [...DEFAULT_PERMISSIONS[role]] }));
  };

  const saveUser = () => {
    if (!form.name.trim() || !form.pin || form.pin.length < 4) {
      addNotification({ type: "error", title: "Validation Error", message: "Name and 4-digit PIN are required." });
      return;
    }
    const pinTaken = users.some((u) => u.pin === form.pin && u.id !== editUser?.id);
    if (pinTaken) {
      addNotification({ type: "error", title: "PIN In Use", message: "This PIN is already assigned to another user." });
      return;
    }
    if (form.permissions.length === 0) {
      addNotification({ type: "error", title: "No Permissions", message: "Select at least one permission." });
      return;
    }

    if (editUser) {
      const isLastOwner = editUser.role === "owner" && users.filter((u) => u.role === "owner" && u.active !== false).length === 1;
      if (isLastOwner && editUser.id === currentUser.id && form.role !== "owner") {
        addNotification({ type: "error", title: "Cannot Change", message: "You are the only active owner." });
        return;
      }
      if (isLastOwner && !form.permissions.includes("users")) {
        addNotification({ type: "error", title: "Cannot Remove", message: "Last owner must keep Team permission." });
        return;
      }
      const updated = { ...form, name: form.name.trim() };
      setUsers((prev) => prev.map((u) => u.id === editUser.id ? { ...u, ...updated } : u));
      if (editUser.id === currentUser.id && onCurrentUserUpdate) {
        onCurrentUserUpdate({ ...updated, permissions: form.permissions });
      }
      addNotification({ type: "success", title: "User Updated", message: `${form.name} permissions saved.` });
    } else {
      const newUser = { id: Date.now(), ...form, name: form.name.trim() };
      setUsers((prev) => [...prev, newUser]);
      addNotification({ type: "success", title: "User Added", message: `${form.name} (${form.role}) account created. Share their PIN securely.` });
    }
    setShowAdd(false);
    setEditUser(null);
  };

  const deleteUser = (user) => {
    if (user.id === currentUser.id) {
      addNotification({ type: "error", title: "Cannot Delete", message: "You cannot delete your own account." });
      return;
    }
    if (user.role === "owner" && users.filter((u) => u.role === "owner" && u.active !== false).length <= 1) {
      addNotification({ type: "error", title: "Cannot Delete", message: "At least one active owner is required." });
      return;
    }
    if (!confirm(`Remove ${user.name}?`)) return;
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    addNotification({ type: "info", title: "User Removed", message: `${user.name} has been removed.` });
  };

  const toggleActive = (user) => {
    if (user.id === currentUser.id) {
      addNotification({ type: "error", title: "Cannot Deactivate", message: "You cannot deactivate your own account." });
      return;
    }
    if (user.role === "owner" && user.active !== false && users.filter((u) => u.role === "owner" && u.active !== false).length <= 1) {
      addNotification({ type: "error", title: "Cannot Deactivate", message: "At least one active owner is required." });
      return;
    }
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, active: u.active === false } : u));
    addNotification({ type: "info", title: user.active === false ? "User Activated" : "User Deactivated", message: user.name });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><UserCog size={22} className="text-cyan-400 shrink-0" />Team & Permissions</h2>
          <p className="text-slate-400 text-sm">Manage staff & owner accounts with module access</p>
        </div>
        <Btn onClick={openAdd} className="w-full sm:w-auto justify-center"><UserPlus size={16} />Add User</Btn>
      </div>

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
        {users.map((user) => (
          <Card key={user.id} className={`p-4 ${user.active === false ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${user.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}`}>
                  {user.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-bold flex items-center gap-2">
                    {user.name}
                    {user.id === currentUser.id && <Badge className="bg-cyan-500/20 text-cyan-300">You</Badge>}
                    {user.active === false && <Badge className="bg-red-500/20 text-red-300">Inactive</Badge>}
                  </p>
                  <p className="text-slate-500 text-xs flex items-center gap-2 mt-0.5">
                    <Badge className={user.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}>{user.role}</Badge>
                    <span className="flex items-center gap-1"><Lock size={10} />PIN: ••••</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={() => openEdit(user)}><Edit2 size={12} />Edit</Btn>
                <Btn variant={user.active === false ? "success" : "secondary"} size="sm" onClick={() => toggleActive(user)}>
                  {user.active === false ? "Activate" : "Deactivate"}
                </Btn>
                {!user.isSystem && <Btn variant="danger" size="sm" onClick={() => deleteUser(user)}><Trash2 size={12} /></Btn>}
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
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="col-span-2" />
            <Select label="Role" value={form.role} onChange={e => applyRoleDefaults(e.target.value)} options={[{ value: "owner", label: "Owner" }, { value: "staff", label: "Staff" }]} />
            <Input label="PIN (4 digits)" type="password" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="e.g. 1234" required />
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
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="secondary" onClick={() => { setShowAdd(false); setEditUser(null); }}>Cancel</Btn>
          <Btn onClick={saveUser}><Check size={14} />{editUser ? "Save Changes" : "Add User"}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// AI CHAT AGENT
// ─────────────────────────────────────────────
function ChatModule({ customers, invoices, expenses, products, deliveries, currentUser }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! Welcome to the Marugen Koi & Arowana Farm AI Assistant.\n\nI can help you with:\n• Customer inquiries & CRM\n• Invoice & payment queries\n• Stock & inventory questions\n• Delivery scheduling\n• Farm management advice\n\nHow can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const systemPrompt = `You are the AI assistant for Marugen Koi & Arowana Farm in Singapore. Always respond in English only.

Current business data:
- Customers: ${customers.length} total
- Invoices: ${invoices.length} total, ${invoices.filter(i => getInvoiceStatus(i) === "paid").length} paid, ${invoices.filter(i => getInvoiceStatus(i) === "pending").length} pending, ${invoices.filter(i => getInvoiceStatus(i) === "overdue").length} overdue
- Total Revenue: S$${invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0).toFixed(2)}
- Expenses: S$${expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)}
- Products in stock: ${products.length} items, ${products.filter(p => p.stock <= p.minStock).length} low stock items
- Scheduled deliveries: ${deliveries.filter(d => d.status === "scheduled").length}
- Current user: ${currentUser.displayName} (${currentUser.role})

You specialize in:
1. Koi fish types: ${KOI_TYPES.join(", ")}
2. Arowana types: ${AROWANA_TYPES.join(", ")}
3. Singapore delivery areas
4. Fish care, water quality, feeding advice
5. Business management for fish farms

Always reply in clear, professional English. Be concise and helpful.`;

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const reply = await sendChatMessage({ systemPrompt, messages: [...messages, userMsg] });
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please log in and try again." }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] sm:h-[calc(100vh-180px)] min-h-[320px]">
      <div className="mb-3 sm:mb-4">
        <h2 className="text-xl sm:text-2xl font-black text-white">AI Assistant</h2>
        <p className="text-slate-400 text-sm">Powered by Gemini</p>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <AppLogo size="sm" className="mr-2 mt-1 ring-1 ring-slate-600" />
              )}
              <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-cyan-500 text-slate-900 font-medium rounded-br-sm" : "bg-slate-700 text-slate-100 rounded-bl-sm"}`}>
                {m.content}
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

        <div className="border-t border-slate-700 p-4">
          <div className="flex gap-3 flex-wrap mb-2">
            {["Low stock items?", "Pending invoices?", "Today's deliveries?", "Feeding schedule?"].map(q => (
              <button key={q} onClick={() => setInput(q)}
                className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full transition-colors">{q}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Ask a question..."
              className="flex-1 min-w-0 bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-3 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            <Btn onClick={sendMessage} disabled={loading || !input.trim()} className="px-4 py-3 min-w-[48px] justify-center shrink-0"><Send size={16} /></Btn>
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
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  { id: "expenses", label: "Expenses", icon: TrendingUp },
  { id: "deliveries", label: "Deliveries", icon: Truck },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "chat", label: "AI Chat", icon: MessageSquare },
  { id: "users", label: "Team", icon: UserCog },
];

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <AppLogo size="lg" className="ring-2 ring-slate-700 animate-pulse" />
      <p className="text-slate-400 text-sm">{message}</p>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState(() => {
    const session = auth.getSession();
    return session?.user ? auth.toAppUser(session.user) : null;
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [notifOpen, setNotifOpen] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dataReady, setDataReady] = useState(!isSupabaseConfigured);
  const [cloudSync, setCloudSync] = useState(isSupabaseConfigured);
  const [cloudError, setCloudError] = useState(null);
  const lowStockNotified = useRef(false);

  const [users, setUsers] = useState(isSupabaseConfigured ? [] : LOCAL_DEMO_USERS);
  const [customers, setCustomers] = useState(INITIAL_CUSTOMERS);
  const [invoices, setInvoices] = useState(INITIAL_INVOICES);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [deliveries, setDeliveries] = useState(INITIAL_DELIVERIES);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [stockLog, setStockLog] = useState([]);

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
        if (!auth.getSession()) {
          setDataReady(true);
          return;
        }
        let data = await db.fetchAllData();
        if (data && !data.customers.length && !data.products.length) {
          await db.seedDatabase(DEMO_SEED);
          data = await db.fetchAllData();
        }
        if (data) {
          setUsers(data.users);
          setCustomers(data.customers.length ? data.customers : INITIAL_CUSTOMERS);
          setProducts(data.products.length ? data.products : INITIAL_PRODUCTS);
          setInvoices(data.invoices.length ? data.invoices : INITIAL_INVOICES);
          setExpenses(data.expenses.length ? data.expenses : INITIAL_EXPENSES);
          setDeliveries(data.deliveries.length ? data.deliveries : INITIAL_DELIVERIES);
          setEvents(data.events.length ? data.events : INITIAL_EVENTS);
          setStockLog(data.stockActivity || []);
        }
        setCloudSync(true);
        setCloudError(null);
      } catch (err) {
        setCloudSync(false);
        setCloudError(err.message);
      } finally {
        setDataReady(true);
      }
    }

    loadFromCloud();
  }, []);

  const syncDebounced = useCallback((fn, data) => {
    if (!dataReady || !cloudSync || !auth.getSessionToken()) return;
    const timer = setTimeout(() => fn(data).catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [dataReady, cloudSync]);

  useEffect(() => syncDebounced(db.syncUsers, users), [users, syncDebounced]);
  useEffect(() => syncDebounced(db.syncCustomers, customers), [customers, syncDebounced]);
  useEffect(() => syncDebounced(db.syncProducts, products), [products, syncDebounced]);
  useEffect(() => syncDebounced(db.syncInvoices, invoices), [invoices, syncDebounced]);
  useEffect(() => syncDebounced(db.syncExpenses, expenses), [expenses, syncDebounced]);
  useEffect(() => syncDebounced(db.syncDeliveries, deliveries), [deliveries, syncDebounced]);
  useEffect(() => syncDebounced(db.syncEvents, events), [events, syncDebounced]);
  useEffect(() => syncDebounced(db.syncStockActivity, stockLog), [stockLog, syncDebounced]);

  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((n) => {
    const notif = { ...n, id: Date.now(), time: "Just now", read: false };
    setNotifications(prev => [notif, ...prev].slice(0, 20));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const lowStock = products.filter(p => p.stock <= p.minStock);
    if (lowStock.length > 0 && currentUser && !lowStockNotified.current) {
      lowStockNotified.current = true;
      addNotification({ type: "warning", title: "Low Stock Alert", message: `${lowStock.length} product(s) need restocking: ${lowStock.map(p => p.name).join(", ")}` });
    }
    if (lowStock.length === 0) lowStockNotified.current = false;
  }, [products, currentUser, addNotification]);

  const navItems = currentUser
    ? ALL_NAV_ITEMS.filter((item) => hasPermission(currentUser, item.id))
    : ALL_NAV_ITEMS;

  const effectiveTab = useMemo(() => {
    if (!currentUser || hasPermission(currentUser, activeTab)) return activeTab;
    return ALL_NAV_ITEMS.find((item) => hasPermission(currentUser, item.id))?.id || "dashboard";
  }, [currentUser, activeTab]);

  const handleLogin = async (user) => {
    setCurrentUser(user);
    setNeedsSetup(false);
    if (isSupabaseConfigured && cloudSync) {
      try {
        const data = await db.fetchAllData();
        if (data) {
          setUsers(data.users);
          setCustomers(data.customers.length ? data.customers : INITIAL_CUSTOMERS);
          setProducts(data.products.length ? data.products : INITIAL_PRODUCTS);
          setInvoices(data.invoices.length ? data.invoices : INITIAL_INVOICES);
          setExpenses(data.expenses.length ? data.expenses : INITIAL_EXPENSES);
          setDeliveries(data.deliveries.length ? data.deliveries : INITIAL_DELIVERIES);
          setEvents(data.events.length ? data.events : INITIAL_EVENTS);
          setStockLog(data.stockActivity || []);
        }
      } catch { /* use local state */ }
    }
    const allowed = ALL_NAV_ITEMS.filter((item) => hasPermission(user, item.id));
    setActiveTab(allowed[0]?.id || "dashboard");
  };

  const handleLogout = async () => {
    await auth.logout();
    setCurrentUser(null);
    setNotifOpen(false);
  };

  const handleSetupComplete = async (user) => {
    setNeedsSetup(false);
    setCurrentUser(user);
    try {
      await db.seedDatabase(DEMO_SEED);
      const data = await db.fetchAllData();
      if (data) {
        setUsers(data.users);
        setCustomers(data.customers);
        setProducts(data.products);
        setInvoices(data.invoices);
        setExpenses(data.expenses);
        setDeliveries(data.deliveries);
        setEvents(data.events);
      }
      setCloudSync(true);
    } catch (err) {
      setCloudError(err.message);
    }
    setActiveTab("dashboard");
  };

  const goToTab = (tabId) => {
    setActiveTab(tabId);
    if (isMobile) {
      setSidebarOpen(false);
      setNotifOpen(false);
    }
  };

  const handleUserUpdate = (updatedFields) => {
    setCurrentUser((prev) => prev ? { ...prev, ...updatedFields, displayName: updatedFields.role === "owner" ? `🐟 ${updatedFields.name}` : `👤 ${updatedFields.name}` } : prev);
  };

  if (!dataReady) {
    return <LoadingScreen message={isSupabaseConfigured ? "Loading from Supabase..." : "Loading..."} />;
  }

  if (needsSetup) return <SetupScreen onComplete={handleSetupComplete} />;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} cloudMode={isSupabaseConfigured} />;

  const guard = (permission, label, content) => {
    if (!hasPermission(currentUser, permission)) return <AccessDenied moduleName={label} />;
    return content;
  };

  const renderModule = () => {
    const props = { customers, invoices, expenses, products, deliveries, events, currentUser, addNotification };
    switch (effectiveTab) {
      case "dashboard": return guard("dashboard", "Dashboard", <Dashboard {...props} />);
      case "inventory": return guard("inventory", "Inventory", <InventoryModule products={products} setProducts={setProducts} stockLog={stockLog} setStockLog={setStockLog} addNotification={addNotification} currentUser={currentUser} />);
      case "invoices": return guard("invoices", "Invoices", <InvoiceModule invoices={invoices} setInvoices={setInvoices} setCustomers={setCustomers} customers={customers} addNotification={addNotification} currentUser={currentUser} />);
      case "customers": return guard("customers", "Customers", <CustomerModule customers={customers} setCustomers={setCustomers} addNotification={addNotification} />);
      case "expenses": return guard("expenses", "Expenses", <ExpenseModule expenses={expenses} setExpenses={setExpenses} invoices={invoices} addNotification={addNotification} currentUser={currentUser} />);
      case "deliveries": return guard("deliveries", "Deliveries", <DeliveryModule deliveries={deliveries} setDeliveries={setDeliveries} customers={customers} addNotification={addNotification} currentUser={currentUser} />);
      case "calendar": return guard("calendar", "Calendar", <CalendarModule events={events} setEvents={setEvents} addNotification={addNotification} currentUser={currentUser} />);
      case "chat": return guard("chat", "AI Chat", <ChatModule {...props} />);
      case "users": return <TeamModule users={users} setUsers={setUsers} currentUser={currentUser} addNotification={addNotification} onCurrentUserUpdate={handleUserUpdate} />;
      default: return null;
    }
  };

  const activeNav = navItems.find((item) => item.id === effectiveTab);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-950 text-white flex" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
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
        className={`bg-slate-900 border-r border-slate-800 flex flex-col z-50
          ${isMobile
            ? `fixed inset-y-0 left-0 w-[min(18rem,85vw)] transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarOpen ? "w-56" : "w-16"} flex-shrink-0 relative transition-all duration-300`
          }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
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

        <div className="p-3 border-t border-slate-800 safe-bottom">
          {(sidebarOpen || isMobile) ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black">
                {currentUser.name[0].toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <p className="text-white text-xs font-bold truncate">{currentUser.name}</p>
                <p className="text-slate-500 text-xs capitalize">{currentUser.role}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-2 touch-manipulation"><LogOut size={14} /></button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center text-slate-500 hover:text-red-400 p-2 touch-manipulation"><LogOut size={16} /></button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 w-full">
        <header className="h-14 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 flex-shrink-0 sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="text-slate-400 hover:text-white transition-colors p-2 -ml-1 rounded-xl hover:bg-slate-800 touch-manipulation"
            aria-label={isMobile ? "Open menu" : "Toggle sidebar"}
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1 lg:flex-none">
            <p className="text-white text-sm font-bold truncate lg:hidden">{activeNav?.label || "Marugen"}</p>
            {cloudSync && (
              <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px] sm:text-xs hidden lg:inline">☁️ Supabase</Badge>
            )}
            {cloudError && (
              <Badge className="bg-amber-500/20 text-amber-300 text-[10px] sm:text-xs hidden lg:inline" title={cloudError}>⚠️ Local mode</Badge>
            )}
          </div>

          <div className="flex-1 hidden lg:block" />

          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)}
              className={`relative p-2.5 rounded-xl transition-all touch-manipulation ${notifOpen ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              aria-label="Notifications">
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
                    <h4 className="font-bold text-white flex items-center gap-2"><Bell size={14} className="text-cyan-400" />Notifications</h4>
                    <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-white p-2 touch-manipulation"><X size={14} /></button>
                  </div>
                  <NotificationPanel
                    notifications={notifications}
                    onDismiss={id => setNotifications(prev => prev.filter(n => n.id !== id))}
                    onClear={() => setNotifications([])}
                    onMarkRead={id => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
                  />
                </div>
              </>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-slate-800 rounded-xl px-3 py-1.5 max-w-[10rem] md:max-w-none">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-xs font-black shrink-0">
              {currentUser.name[0].toUpperCase()}
            </div>
            <span className="text-white text-sm font-bold truncate hidden md:inline">{currentUser.name}</span>
            <Badge className={`text-xs shrink-0 hidden md:inline ${currentUser.role === "owner" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"}`}>{currentUser.role}</Badge>
          </div>
        </header>

        <main className={`flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 ${isMobile ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))]" : ""}`}>
          {renderModule()}
        </main>
      </div>

      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur border-t border-slate-800 safe-bottom lg:hidden">
          <div className="flex overflow-x-auto scrollbar-hide gap-0.5 px-1 py-1.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => goToTab(item.id)}
                className={`flex flex-col items-center justify-center min-w-[4.25rem] px-2 py-2 rounded-xl transition-all touch-manipulation shrink-0 ${effectiveTab === item.id ? "text-cyan-400 bg-cyan-500/10" : "text-slate-500"}`}
              >
                <item.icon size={20} strokeWidth={effectiveTab === item.id ? 2.5 : 2} />
                <span className="text-[10px] font-bold mt-1 truncate max-w-[4rem]">{item.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
