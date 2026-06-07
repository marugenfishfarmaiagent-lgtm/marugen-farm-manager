export const AI_TOOL_DEFINITIONS = [
  {
    name: 'navigate_to',
    description: 'Open an app section. Examples: "show me stock", "open invoices", "koi fish", "pond management", "customer koi".',
    parameters: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['dashboard', 'inventory', 'koifish', 'customerkoi', 'ponds', 'invoices', 'customers', 'expenses', 'deliveries', 'calendar', 'chat'],
          description: 'koifish=farm stock; customerkoi=fish kept for customers; ponds=pond mgmt',
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'get_business_data',
    description: 'Look up live data. Use query=products to compare short vs long product names before invoicing. Use before stock/sales/pond questions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: [
            'summary', 'low_stock', 'pending_invoices', 'overdue_invoices', 'today_deliveries', 'today_events',
            'customers', 'products', 'koi_stock', 'sold_koi', 'customer_koi', 'ponds',
          ],
          description: 'koi_stock=available/sick fish; sold_koi=recent sales; customer_koi=fish at farm for customers; ponds=pond list & water params',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Bill a customer. Match items to inventory by short OR long product names/descriptions (brand, sinking/floating, size L/M, weight kg). Infer prices from catalog.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Product line — short catalog name or full spoken description' },
              qty: { type: 'number' },
              price: { type: 'number' },
            },
            required: ['name'],
          },
        },
        notes: { type: 'string' },
        due: { type: 'string', description: 'YYYY-MM-DD' },
        discountType: { type: 'string', enum: ['none', 'fixed', 'percent'] },
        discountValue: { type: 'number' },
      },
      required: ['customerName', 'items'],
    },
  },
  {
    name: 'cancel_invoice',
    description: 'Cancel a pending/overdue invoice. DESTRUCTIVE — user must confirm. Examples: "cancel INV-001", "void Sarah\'s invoice".',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
        customerName: { type: 'string', description: 'If ID unknown — cancels latest cancellable invoice for customer' },
      },
    },
  },
  {
    name: 'mark_invoice_paid',
    description: 'Record payment received. Examples: "Sarah paid", "mark INV-002 paid".',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
        customerName: { type: 'string' },
      },
    },
  },
  {
    name: 'create_customer',
    description: 'Register a new customer. WhatsApp number preferred.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        whatsapp: { type: 'string' },
        phone: { type: 'string' },
        postalCode: { type: 'string' },
        address: { type: 'string' },
        fishTypes: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_customer',
    description: 'Edit an existing customer. Requires edit permission. Examples: "update Sarah\'s address", "change Mike WhatsApp".',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Current or partial name to find customer' },
        whatsapp: { type: 'string' },
        postalCode: { type: 'string' },
        address: { type: 'string' },
        fishTypes: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_customer',
    description: 'Remove a customer from CRM. DESTRUCTIVE — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        customerName: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'restock_product',
    description: 'Add inventory stock. productName can be short inventory name or long description (e.g. "15kg JPD Shori Floating L").',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string', description: 'Catalog name or spoken description — fuzzy matched' },
        quantity: { type: 'number' },
      },
      required: ['productName', 'quantity'],
    },
  },
  {
    name: 'delete_product',
    description: 'Remove a product from inventory. DESTRUCTIVE — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        productName: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'sell_koi',
    description: 'Mark a koi from farm stock as sold. Requires customer. disposition=taken (customer takes fish) or keep (stays at farm → Customer Koi).',
    parameters: {
      type: 'object',
      properties: {
        koiId: { type: 'string', description: 'KOI id e.g. KOI-123' },
        name: { type: 'string', description: 'Fish name or variety if ID unknown' },
        customerName: { type: 'string' },
        soldPrice: { type: 'number' },
        disposition: { type: 'string', enum: ['taken', 'keep'], description: 'keep=fish stays at farm' },
        keepPondName: { type: 'string', description: 'Required if disposition=keep' },
        createInvoice: { type: 'boolean', description: 'Open invoice draft after sale' },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'refund_koi_sale',
    description: 'Reverse a koi sale — fish returns to stock. DESTRUCTIVE — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        koiId: { type: 'string' },
        name: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'add_expense',
    description: 'Log expense — directs user to upload receipt photo in Expenses module.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        amount: { type: 'number' },
        note: { type: 'string' },
        date: { type: 'string' },
      },
      required: ['category', 'amount'],
    },
  },
  {
    name: 'schedule_delivery',
    description: 'Arrange delivery. Uses customer postal/address from CRM when possible.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        address: { type: 'string' },
        postalCode: { type: 'string' },
        schedule: { type: 'string', description: 'YYYY-MM-DDTHH:MM or YYYY-MM-DD HH:MM' },
        items: { type: 'string' },
        driver: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['customerName', 'schedule'],
    },
  },
  {
    name: 'update_delivery',
    description: 'Edit delivery address, schedule, items, or driver. Requires edit permission.',
    parameters: {
      type: 'object',
      properties: {
        deliveryId: { type: 'string' },
        customerName: { type: 'string' },
        address: { type: 'string' },
        postalCode: { type: 'string' },
        schedule: { type: 'string' },
        items: { type: 'string' },
        driver: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'delete_delivery',
    description: 'Delete a scheduled delivery. DESTRUCTIVE — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        deliveryId: { type: 'string' },
        customerName: { type: 'string' },
      },
    },
  },
  {
    name: 'update_delivery_status',
    description: 'Change delivery progress: scheduled, transit, delivered, cancelled.',
    parameters: {
      type: 'object',
      properties: {
        deliveryId: { type: 'string' },
        customerName: { type: 'string' },
        status: { type: 'string', enum: ['scheduled', 'transit', 'delivered', 'cancelled'] },
      },
      required: ['status'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Add calendar reminder or task.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string' },
        time: { type: 'string' },
        type: { type: 'string', enum: ['maintenance', 'feeding', 'purchase', 'customer', 'other'] },
        note: { type: 'string' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Edit an existing calendar event. Requires edit permission.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Current title to find event' },
        date: { type: 'string', description: 'Current date to find event' },
        newTitle: { type: 'string' },
        newDate: { type: 'string' },
        newTime: { type: 'string' },
        newType: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete a calendar event. DESTRUCTIVE — requires confirmation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string' },
        eventId: { type: 'number' },
      },
    },
  },
]
