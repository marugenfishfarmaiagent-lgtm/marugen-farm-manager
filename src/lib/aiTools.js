export const AI_TOOL_DEFINITIONS = [
  {
    name: 'navigate_to',
    description: 'Open an app section when the user wants to see, check, or go somewhere. Examples: "show me stock", "open invoices", "take me to customers", "where are deliveries".',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['dashboard', 'inventory', 'invoices', 'customers', 'expenses', 'deliveries', 'calendar'],
          description: 'dashboard=home/overview, inventory=stock/products, invoices=billing, customers=CRM, expenses=costs, deliveries=shipping, calendar=events',
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'get_business_data',
    description: 'Look up live data before answering questions. Examples: "what\'s running low", "who hasn\'t paid", "any deliveries today", "how are we doing".',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: ['summary', 'low_stock', 'pending_invoices', 'overdue_invoices', 'today_deliveries', 'customers', 'products'],
          description: 'low_stock=items below minimum; pending_invoices=unpaid bills; overdue_invoices=late payments',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Bill a customer. Use when user mentions charging, billing, invoicing, selling, or recording a sale. Infer items and prices from inventory when possible. Examples: "bill Sarah for a golden arowana", "Ahmad bought 3 koi and 2 bags of pellets", "walk-in customer John — koi food $28".',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Full or partial customer name; walk-in name ok' },
        items: {
          type: 'array',
          description: 'Line items. Price optional if product exists in inventory — will use catalog price.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Product or fish name' },
              qty: { type: 'number', description: 'Defaults to 1 if omitted' },
              price: { type: 'number', description: 'Unit price in SGD; omit to use inventory price' },
            },
            required: ['name'],
          },
        },
        notes: { type: 'string' },
        due: { type: 'string', description: 'Due date YYYY-MM-DD; default today+7 if user says "next week"' },
        discountType: { type: 'string', enum: ['none', 'fixed', 'percent'], description: 'Discount type; use when user mentions discount, rebate, or % off' },
        discountValue: { type: 'number', description: 'Discount amount in SGD (fixed) or percentage 1-100 (percent)' },
      },
      required: ['customerName', 'items'],
    },
  },
  {
    name: 'mark_invoice_paid',
    description: 'Record payment received. Examples: "Sarah paid", "got money from Ahmad", "mark that invoice paid", "payment came in for INV-002", "they settled the bill".',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice ID if known' },
        customerName: { type: 'string', description: 'Customer first or full name — marks their latest unpaid invoice' },
      },
    },
  },
  {
    name: 'create_customer',
    description: 'Register a new customer. Examples: "add new client Mike", "someone called David from Bedok wants koi", "register customer".',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        area: { type: 'string', description: 'Singapore area if mentioned' },
        fishTypes: { type: 'array', items: { type: 'string' }, description: 'Koi, Arowana, etc.' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'restock_product',
    description: 'Add inventory stock. Examples: "pellets came in — 20kg", "we got more conditioner", "add 10 to koi food", "restock the air pumps, 3 units".',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Partial product name ok: "pellets" → Koi Pellets' },
        quantity: { type: 'number', description: 'Amount to add' },
      },
      required: ['productName', 'quantity'],
    },
  },
  {
    name: 'add_expense',
    description: 'Log a business cost. Examples: "spent $50 on diesel", "paid electricity 320", "feed cost 680 today", "bought medicine".',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Feed, Transport, Utilities, Rent, Equipment, Labor, Medicine, Packaging, Marketing, Other — infer from context' },
        amount: { type: 'number' },
        note: { type: 'string', description: 'What the expense was for' },
        date: { type: 'string', description: 'YYYY-MM-DD; default today' },
      },
      required: ['category', 'amount'],
    },
  },
  {
    name: 'schedule_delivery',
    description: 'Arrange fish/product delivery. Examples: "deliver to Tan tomorrow morning", "schedule Sarah pickup Saturday 3pm", "send koi to Jurong next week". Use customer CRM data for area if address not given.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        address: { type: 'string', description: 'Full address; if unknown use "TBC — contact customer"' },
        schedule: { type: 'string', description: 'YYYY-MM-DD HH:MM — convert "tomorrow 10am" etc.' },
        items: { type: 'string', description: 'What is being delivered' },
        area: { type: 'string' },
        driver: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['customerName', 'schedule'],
    },
  },
  {
    name: 'update_delivery_status',
    description: 'Change delivery progress. Examples: "Ali delivered Tan\'s order", "delivery is on the way", "cancel Ahmad\'s delivery", "mark DEL-001 done".',
    parameters: {
      type: 'object',
      properties: {
        deliveryId: { type: 'string' },
        customerName: { type: 'string', description: 'Use if ID unknown — updates their active delivery' },
        status: { type: 'string', enum: ['scheduled', 'transit', 'delivered', 'cancelled'], description: 'delivered=done/completed; transit=on the way/out for delivery' },
      },
      required: ['status'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Add a reminder or task. Examples: "remind me to check water tomorrow", "feeding at 9am", "Sarah visiting Friday", "order more pellets next Monday".',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM, default 09:00' },
        type: { type: 'string', enum: ['maintenance', 'feeding', 'purchase', 'customer', 'other'] },
        note: { type: 'string' },
      },
      required: ['title', 'date'],
    },
  },
]
