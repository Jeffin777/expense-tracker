/**
 * Expense Tracker Application
 * Architecture: One-way data flow (User action -> update state -> save localStorage -> render())
 */

// ==========================================================================
// Constants & Application State
// ==========================================================================
const STORAGE_KEY = "expenseTracker.transactions";
const STORAGE_BUDGET_KEY = "expenseTracker.budget";

const CATEGORIES = {
  income: ["Salary", "Freelance", "Investments", "Other Income"],
  expense: [
    "Food & Dining",
    "Shopping",
    "Housing & Utilities",
    "Transportation",
    "Entertainment",
    "Healthcare",
    "Education",
    "Other Expense"
  ]
};

const CATEGORY_COLORS = [
  "#f43f5e", // Rose
  "#fb923c", // Orange
  "#facc15", // Yellow
  "#3b82f6", // Blue
  "#a855f7", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#64748b"  // Slate
];

const state = {
  transactions: [],
  filters: {
    type: "all",
    category: "all",
    month: "all"
  },
  editingId: null,
  budget: null
};

// ==========================================================================
// Pure Business Logic Functions (No DOM Access)
// ==========================================================================

/**
 * Generate a unique ID using crypto.randomUUID with fallback
 * @returns {string} Unique identifier
 */
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Calculate totals (income, expense, net balance) for a given list of transactions
 * Computes in integer paise to avoid floating point issues
 * @param {Array} list - Array of transaction objects
 * @returns {Object} { income, expense, balance }
 */
function calcTotals(list) {
  if (!Array.isArray(list)) return { income: 0, expense: 0, balance: 0 };
  
  let incomePaise = 0;
  let expensePaise = 0;

  list.forEach((item) => {
    const amt = Number(item.amount) || 0;
    const paise = Math.round(amt * 100);
    if (item.type === "income") {
      incomePaise += paise;
    } else if (item.type === "expense") {
      expensePaise += paise;
    }
  });

  const income = incomePaise / 100;
  const expense = expensePaise / 100;
  const balance = (incomePaise - expensePaise) / 100;

  return { income, expense, balance };
}

/**
 * Pure function: Get all expense transactions for a specific month (YYYY-MM)
 * @param {Array} transactions 
 * @param {string} monthKey 
 * @returns {Array} List of expense transaction objects
 */
function getMonthExpenses(transactions, monthKey) {
  if (!Array.isArray(transactions) || !monthKey) return [];
  return transactions.filter(
    (t) => t.type === "expense" && t.date && t.date.startsWith(monthKey)
  );
}

/**
 * Pure function: Get total income and expense for a month in rupees (computed in integer paise)
 * @param {Array} transactions 
 * @param {string} monthKey 
 * @returns {Object} { income, expense }
 */
function getMonthIncomeAndExpense(transactions, monthKey) {
  if (!Array.isArray(transactions) || !monthKey) return { income: 0, expense: 0 };

  let incomePaise = 0;
  let expensePaise = 0;

  transactions.forEach((t) => {
    if (t.date && t.date.startsWith(monthKey)) {
      const paise = Math.round((Number(t.amount) || 0) * 100);
      if (t.type === "income") {
        incomePaise += paise;
      } else if (t.type === "expense") {
        expensePaise += paise;
      }
    }
  });

  return { income: incomePaise / 100, expense: expensePaise / 100 };
}

/**
 * Pure function: Get top category by expense amount
 * Computes in integer paise
 * @param {Array} expenses 
 * @returns {Object|null} { category, amount, percent }
 */
function getTopCategory(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return null;

  const map = new Map();
  let totalPaise = 0;

  expenses.forEach((t) => {
    const paise = Math.round((Number(t.amount) || 0) * 100);
    totalPaise += paise;
    map.set(t.category, (map.get(t.category) || 0) + paise);
  });

  if (totalPaise === 0) return null;

  // Sort by amount descending; on tie, sort alphabetically for stability
  const sorted = Array.from(map.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const [topCategory, topAmountPaise] = sorted[0];
  const percent = (topAmountPaise / totalPaise) * 100;

  return {
    category: topCategory,
    amount: topAmountPaise / 100,
    percent
  };
}

/**
 * Pure function: Calculate Month-Over-Month percentage change
 * @param {number} currentTotal 
 * @param {number} previousTotal 
 * @returns {number|null} Percent change or null if previousTotal is 0
 */
function getMonthOverMonthChange(currentTotal, previousTotal) {
  const c = Number(currentTotal) || 0;
  const p = Number(previousTotal) || 0;
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

/**
 * Pure function: Calculate average daily spend
 * Divides by days elapsed so far if current local month, else total days in month
 * @param {number} total 
 * @param {string} monthKey 
 * @returns {number} Average daily spend
 */
function getAverageDailySpend(total, monthKey) {
  const safeTotal = Number(total) || 0;
  if (!monthKey || monthKey.length < 7) return safeTotal;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  let days = 1;
  if (monthKey === currentMonthKey) {
    days = Math.max(1, now.getDate());
  } else {
    days = new Date(year, month, 0).getDate();
  }

  if (days <= 0) days = 1;
  return safeTotal / days;
}

/**
 * Pure function: Find highest single expense transaction
 * @param {Array} expenses 
 * @returns {Object|null} Highest expense object
 */
function getHighestExpense(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) return null;

  return expenses.reduce((max, t) => {
    const amt = Number(t.amount) || 0;
    const maxAmt = max ? Number(max.amount) || 0 : -1;
    return amt > maxAmt ? t : max;
  }, null);
}

/**
 * Pure function: Calculate savings rate percentage
 * @param {number} income 
 * @param {number} expense 
 * @returns {number|null} Savings rate percentage or null if income is 0
 */
function getSavingsRate(income, expense) {
  const inc = Number(income) || 0;
  const exp = Number(expense) || 0;
  if (inc === 0) return null;
  return ((inc - exp) / inc) * 100;
}

/**
 * Pure function: Get previous month key (YYYY-MM)
 * @param {string} monthKey 
 * @returns {string} Previous YYYY-MM
 */
function getPreviousMonthKey(monthKey) {
  if (!monthKey || monthKey.length < 7) return "";
  const [yearStr, monthStr] = monthKey.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Pure function: Build list of smart insight objects
 * @param {Array} transactions 
 * @param {string} monthKey 
 * @returns {Array} List of insight objects: { text, icon, type }
 */
function buildInsights(transactions, monthKey) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [
      {
        text: "Add a few transactions to see insights.",
        icon: "💡",
        type: "normal"
      }
    ];
  }

  const monthExpenses = getMonthExpenses(transactions, monthKey);
  const { income: monthIncome, expense: monthExpense } = getMonthIncomeAndExpense(transactions, monthKey);
  const monthLabel = getTrackedMonthLabel(monthKey);

  if (monthExpenses.length === 0) {
    return [
      {
        text: `No expenses recorded for ${monthLabel}.`,
        icon: "ℹ️",
        type: "normal"
      }
    ];
  }

  const insights = [];

  // 1. Top Category
  const topCat = getTopCategory(monthExpenses);
  if (topCat) {
    insights.push({
      text: `You spent most on ${topCat.category} (${Math.round(topCat.percent)}%)`,
      icon: "📊",
      type: "normal"
    });
  }

  // 2. Month-over-Month Spending Change
  const prevMonthKey = getPreviousMonthKey(monthKey);
  const prevExpenses = getMonthExpenses(transactions, prevMonthKey);
  const prevExpenseTotal = prevExpenses.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  
  if (prevExpenseTotal > 0) {
    const momChange = getMonthOverMonthChange(monthExpense, prevExpenseTotal);
    if (momChange !== null) {
      if (momChange >= -1 && momChange <= 1) {
        insights.push({
          text: "Spending is about the same as last month",
          icon: "➡️",
          type: "normal"
        });
      } else if (momChange > 1) {
        insights.push({
          text: `Spending is up ${Math.round(momChange)}% vs last month`,
          icon: "📈",
          type: "expense-up"
        });
      } else if (momChange < -1) {
        insights.push({
          text: `Spending is down ${Math.round(Math.abs(momChange))}% vs last month`,
          icon: "📉",
          type: "expense-down"
        });
      }
    }
  }

  // 3. Average Daily Spend
  const dailyAvg = getAverageDailySpend(monthExpense, monthKey);
  insights.push({
    text: `Average daily spend: ${formatCurrency(dailyAvg)}`,
    icon: "📅",
    type: "normal"
  });

  // 4. Highest Expense
  const highest = getHighestExpense(monthExpenses);
  if (highest) {
    const dateFormatted = formatDateShort(highest.date);
    insights.push({
      text: `Highest expense: ${formatCurrency(highest.amount)} on ${dateFormatted} (${highest.description})`,
      icon: "💸",
      type: "normal"
    });
  }

  // 5. Savings Rate
  const savingsRate = getSavingsRate(monthIncome, monthExpense);
  if (savingsRate !== null) {
    if (savingsRate >= 0) {
      insights.push({
        text: `You saved ${Math.round(savingsRate)}% of your income this month`,
        icon: "💰",
        type: "income-good"
      });
    } else {
      insights.push({
        text: "You spent more than you earned this month",
        icon: "⚠️",
        type: "expense-up"
      });
    }
  }

  return insights.slice(0, 5);
}

/**
 * Pure function: Calculate total expense for a specific month (YYYY-MM) in integer paise
 * @param {Array} transactions 
 * @param {string} monthKey 
 * @returns {number} Total expense in rupees
 */
function getMonthExpenseTotal(transactions, monthKey) {
  if (!Array.isArray(transactions) || !monthKey) return 0;

  const totalPaise = transactions.reduce((acc, t) => {
    if (t.type === "expense" && t.date && t.date.startsWith(monthKey)) {
      const paise = Math.round((Number(t.amount) || 0) * 100);
      return acc + paise;
    }
    return acc;
  }, 0);

  return totalPaise / 100;
}

/**
 * Pure function: Calculate budget status metrics
 * @param {number} spent - Total amount spent
 * @param {number} budget - Monthly budget limit
 * @returns {Object} { percent, level, remaining }
 */
function getBudgetStatus(spent, budget) {
  const safeSpent = Number(spent) || 0;
  const safeBudget = Number(budget) || 0;

  if (safeBudget <= 0) {
    return { percent: 0, level: "safe", remaining: 0 };
  }

  const percent = (safeSpent / safeBudget) * 100;

  let level = "safe";
  if (percent >= 100) {
    level = "danger";
  } else if (percent >= 80) {
    level = "warning";
  }

  // Calculate remaining with paise precision
  const spentPaise = Math.round(safeSpent * 100);
  const budgetPaise = Math.round(safeBudget * 100);
  const remainingPaise = budgetPaise - spentPaise;
  const remaining = remainingPaise / 100;

  return { percent, level, remaining };
}

/**
 * Group transactions by YYYY-MM and return income, expense, and balance per month sorted newest first
 * @param {Array} list - Array of transactions
 * @returns {Array} List of monthly summary objects
 */
function monthlySummary(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const map = new Map();

  list.forEach((item) => {
    if (!item.date || item.date.length < 7) return;
    const monthKey = item.date.substring(0, 7); // "YYYY-MM"

    if (!map.has(monthKey)) {
      const parts = monthKey.split("-");
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const dateObj = new Date(year, monthIndex, 1);
      const monthLabel = dateObj.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      
      map.set(monthKey, {
        monthKey,
        monthLabel,
        incomePaise: 0,
        expensePaise: 0
      });
    }

    const record = map.get(monthKey);
    const paise = Math.round((Number(item.amount) || 0) * 100);
    if (item.type === "income") {
      record.incomePaise += paise;
    } else if (item.type === "expense") {
      record.expensePaise += paise;
    }
  });

  return Array.from(map.values())
    .map((rec) => {
      const income = rec.incomePaise / 100;
      const expense = rec.expensePaise / 100;
      const balance = (rec.incomePaise - rec.expensePaise) / 100;
      return {
        monthKey: rec.monthKey,
        monthLabel: rec.monthLabel,
        income,
        expense,
        balance
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

/**
 * Pure function to sum expenses per category and calculate percentages
 * @param {Array} list - Array of transactions
 * @returns {Object} { items: Array, totalExpense: number }
 */
function groupByCategory(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return { items: [], totalExpense: 0 };
  }

  const expenseItems = list.filter((t) => t.type === "expense");
  if (expenseItems.length === 0) {
    return { items: [], totalExpense: 0 };
  }

  const map = new Map();
  let totalExpensePaise = 0;

  expenseItems.forEach((t) => {
    const paise = Math.round((Number(t.amount) || 0) * 100);
    totalExpensePaise += paise;
    map.set(t.category, (map.get(t.category) || 0) + paise);
  });

  const totalExpense = totalExpensePaise / 100;
  const sortedCategories = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

  const items = sortedCategories.map(([category, amountPaise], index) => {
    const amount = amountPaise / 100;
    const percentage = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
    const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    return {
      category,
      amount,
      percentage,
      color
    };
  });

  return { items, totalExpense };
}

/**
 * Pure function to filter transactions based on state.filters
 * @param {Object} appState - { transactions, filters }
 * @returns {Array} Filtered transactions array
 */
function getFiltered(appState) {
  const { transactions, filters } = appState;
  if (!Array.isArray(transactions)) return [];

  return transactions.filter((item) => {
    // Type Filter
    if (filters.type !== "all" && item.type !== filters.type) {
      return false;
    }
    // Category Filter
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    // Month Filter (YYYY-MM)
    if (filters.month !== "all") {
      if (!item.date || !item.date.startsWith(filters.month)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sort transactions newest first by date
 * @param {Array} list 
 * @returns {Array} Sorted copy of list
 */
function sortNewestFirst(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ==========================================================================
// Formatting & Local Storage Helpers
// ==========================================================================

/**
 * Format a number as INR currency string
 * @param {number} amount
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  const numericAmount = typeof amount === "number" ? amount : parseFloat(amount) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(numericAmount);
}

/**
 * Format date string (YYYY-MM-DD) to readable format
 * @param {string} dateString 
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  const [year, month, day] = parts;
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Format date string to short format (e.g. "12 Oct")
 * @param {string} dateString 
 * @returns {string} Short formatted date
 */
function formatDateShort(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  const [year, month, day] = parts;
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

/**
 * Load transactions safely from localStorage
 * Filters out corrupt or invalid schemas
 * @returns {Array} List of stored transactions or empty array fallback
 */
function loadTransactions() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return [];
    const parsed = JSON.parse(rawData);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        (t.type === "income" || t.type === "expense") &&
        typeof t.amount === "number" &&
        Number.isFinite(t.amount) &&
        t.amount > 0 &&
        typeof t.category === "string" &&
        typeof t.date === "string" &&
        typeof t.description === "string"
    );
  } catch (error) {
    console.error("Failed to parse transactions from localStorage:", error);
    return [];
  }
}

/**
 * Save state.transactions safely to localStorage
 */
function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
  } catch (error) {
    console.error("Failed to save transactions to localStorage:", error);
  }
}

/**
 * Load budget safely from localStorage
 * Fallback to null on invalid/corrupted data
 * @returns {number|null} Valid budget limit or null
 */
function loadBudget() {
  try {
    const raw = localStorage.getItem(STORAGE_BUDGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const num = Number(parsed);
    if (Number.isFinite(num) && num > 0 && num <= 1000000000) {
      return num;
    }
    return null;
  } catch (error) {
    console.error("Failed to parse budget from localStorage:", error);
    return null;
  }
}

/**
 * Save state.budget safely to localStorage
 */
function saveBudget() {
  try {
    if (state.budget === null) {
      localStorage.removeItem(STORAGE_BUDGET_KEY);
    } else {
      localStorage.setItem(STORAGE_BUDGET_KEY, JSON.stringify(state.budget));
    }
  } catch (error) {
    console.error("Failed to save budget to localStorage:", error);
  }
}

// ==========================================================================
// DOM UI Helpers & Setup
// ==========================================================================

/**
 * Determine currently tracked month key (YYYY-MM)
 * Returns filter month if selected, else current local calendar month
 */
function getTrackedMonthKey() {
  if (state.filters && state.filters.month && state.filters.month !== "all") {
    return state.filters.month;
  }
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Get readable month label (e.g. "October 2026")
 * @param {string} monthKey 
 * @returns {string} Formatted month name
 */
function getTrackedMonthLabel(monthKey) {
  if (!monthKey || monthKey.length < 7) return "";
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const dateObj = new Date(year, monthIndex, 1);
  return dateObj.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * Set form date input default value to today in local timezone (YYYY-MM-DD)
 */
function setDefaultDate() {
  const dateInput = document.getElementById("date");
  if (dateInput) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * Populate category dropdowns for form and filter bar
 */
function populateCategoryDropdowns() {
  const formCategorySelect = document.getElementById("category");
  const filterCategorySelect = document.getElementById("filter-category");
  const typeSelect = document.getElementById("type");

  const selectedType = typeSelect ? typeSelect.value : "";
  
  // Populate Form Category Dropdown based on selected type
  if (formCategorySelect) {
    const prevCategory = formCategorySelect.value;
    formCategorySelect.innerHTML = "";
    
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select Category";
    defaultOption.disabled = true;
    defaultOption.selected = !prevCategory;
    formCategorySelect.appendChild(defaultOption);

    let categoriesToUse = [];
    if (selectedType === "income") {
      categoriesToUse = CATEGORIES.income;
    } else if (selectedType === "expense") {
      categoriesToUse = CATEGORIES.expense;
    } else {
      categoriesToUse = [...CATEGORIES.income, ...CATEGORIES.expense];
    }

    categoriesToUse.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      if (cat === prevCategory) {
        option.selected = true;
      }
      formCategorySelect.appendChild(option);
    });
  }

  // Populate Filter Category Dropdown with all unique categories
  if (filterCategorySelect) {
    const currentFilterVal = state.filters.category || "all";
    filterCategorySelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All Categories";
    filterCategorySelect.appendChild(allOption);

    const allCategories = [...new Set([...CATEGORIES.income, ...CATEGORIES.expense])];
    allCategories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      filterCategorySelect.appendChild(option);
    });

    filterCategorySelect.value = currentFilterVal;
  }
}

/**
 * Populate Month filter dropdown with dynamic available months from transactions
 */
function populateMonthDropdown() {
  const monthSelect = document.getElementById("filter-month");
  if (!monthSelect) return;

  const currentVal = state.filters.month || "all";
  monthSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Months";
  monthSelect.appendChild(allOption);

  // Collect unique YYYY-MM
  const monthMap = new Map();
  state.transactions.forEach((item) => {
    if (item.date && item.date.length >= 7) {
      const yearMonth = item.date.substring(0, 7);
      if (!monthMap.has(yearMonth)) {
        const parts = yearMonth.split("-");
        const year = parseInt(parts[0], 10);
        const monthIndex = parseInt(parts[1], 10) - 1;
        const dateObj = new Date(year, monthIndex, 1);
        const label = dateObj.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        monthMap.set(yearMonth, label);
      }
    }
  });

  const sortedMonths = Array.from(monthMap.keys()).sort().reverse();
  sortedMonths.forEach((ym) => {
    const option = document.createElement("option");
    option.value = ym;
    option.textContent = monthMap.get(ym);
    monthSelect.appendChild(option);
  });

  monthSelect.value = currentVal;
}

// ==========================================================================
// Edit Mode Management
// ==========================================================================

/**
 * Enter edit mode for a specific transaction ID
 * @param {string} id 
 */
function enterEditMode(id) {
  const transaction = state.transactions.find((t) => t.id === id);
  if (!transaction) return;

  clearTransactionFormErrors();
  state.editingId = id;

  const typeEl = document.getElementById("type");
  const amountEl = document.getElementById("amount");
  const categoryEl = document.getElementById("category");
  const dateEl = document.getElementById("date");
  const descriptionEl = document.getElementById("description");
  const submitBtn = document.getElementById("submit-btn");
  const cancelBtn = document.getElementById("cancel-btn");

  if (typeEl) typeEl.value = transaction.type;
  populateCategoryDropdowns();
  if (categoryEl) categoryEl.value = transaction.category;

  if (amountEl) amountEl.value = transaction.amount;
  if (dateEl) dateEl.value = transaction.date;
  if (descriptionEl) descriptionEl.value = transaction.description;

  if (submitBtn) submitBtn.textContent = "Update Transaction";
  if (cancelBtn) cancelBtn.hidden = false;

  const formSection = document.querySelector(".form-section");
  if (formSection) {
    formSection.scrollIntoView({ behavior: "smooth" });
  }

  render();
}

/**
 * Exit edit mode and reset form state
 */
function exitEditMode() {
  state.editingId = null;

  const form = document.getElementById("transaction-form");
  const submitBtn = document.getElementById("submit-btn");
  const cancelBtn = document.getElementById("cancel-btn");

  if (form) form.reset();
  setDefaultDate();
  populateCategoryDropdowns();
  clearTransactionFormErrors();

  if (submitBtn) submitBtn.textContent = "Add Transaction";
  if (cancelBtn) cancelBtn.hidden = true;
}

// ==========================================================================
// Rendering Pipeline
// ==========================================================================

/**
 * Render Financial Summary Cards (shows true balance for ALL transactions)
 * @param {Object} totals - { income, expense, balance }
 */
function renderSummary(totals) {
  const incomeEl = document.getElementById("total-income");
  const expenseEl = document.getElementById("total-expense");
  const balanceEl = document.getElementById("balance");

  if (incomeEl) incomeEl.textContent = formatCurrency(totals.income);
  if (expenseEl) expenseEl.textContent = formatCurrency(totals.expense);
  if (balanceEl) {
    balanceEl.textContent = formatCurrency(totals.balance);
    if (totals.balance < 0) {
      balanceEl.style.color = "var(--color-expense)";
    } else if (totals.balance > 0) {
      balanceEl.style.color = "var(--color-income)";
    } else {
      balanceEl.style.color = "var(--text-primary)";
    }
  }
}

/**
 * Render Smart Insights list into #insights-list
 * Uses createElement and textContent exclusively to prevent XSS
 */
function renderInsights() {
  const listEl = document.getElementById("insights-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  const trackedMonthKey = getTrackedMonthKey();
  const insights = buildInsights(state.transactions, trackedMonthKey);

  insights.forEach((item) => {
    const li = document.createElement("li");
    li.className = "insight-item";

    if (item.type === "expense-up") {
      li.classList.add("insight-expense-up");
    } else if (item.type === "expense-down") {
      li.classList.add("insight-expense-down");
    } else if (item.type === "income-good") {
      li.classList.add("insight-income-good");
    }

    const iconSpan = document.createElement("span");
    iconSpan.className = "insight-icon";
    iconSpan.setAttribute("aria-hidden", "true");
    iconSpan.textContent = item.icon;

    const textSpan = document.createElement("span");
    textSpan.className = "insight-text";
    textSpan.textContent = item.text;

    li.appendChild(iconSpan);
    li.appendChild(textSpan);

    listEl.appendChild(li);
  });
}

/**
 * Render Monthly Budget card with progress bar, level colors, and status
 * Built entirely with textContent and DOM properties
 */
function renderBudget() {
  const trackedMonthKey = getTrackedMonthKey();
  const trackedMonthLabel = getTrackedMonthLabel(trackedMonthKey);

  const headingEl = document.getElementById("budget-heading");
  if (headingEl) {
    headingEl.textContent = `Budget for ${trackedMonthLabel}`;
  }

  const emptyStateEl = document.getElementById("budget-empty-state");
  const progressContainerEl = document.getElementById("budget-progress-container");
  const clearBtn = document.getElementById("budget-clear-btn");
  const inputEl = document.getElementById("budget-input");

  if (state.budget === null || state.budget <= 0) {
    if (emptyStateEl) emptyStateEl.hidden = false;
    if (progressContainerEl) progressContainerEl.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = "";
    }
    return;
  }

  if (emptyStateEl) emptyStateEl.hidden = true;
  if (progressContainerEl) progressContainerEl.hidden = false;
  if (clearBtn) clearBtn.hidden = false;
  if (inputEl && document.activeElement !== inputEl) {
    inputEl.value = state.budget;
  }

  const spent = getMonthExpenseTotal(state.transactions, trackedMonthKey);
  const { percent, level, remaining } = getBudgetStatus(spent, state.budget);

  const barEl = document.getElementById("budget-bar");
  const barFillEl = document.getElementById("budget-bar-fill");
  const textEl = document.getElementById("budget-text");
  const statusEl = document.getElementById("budget-status");

  const cappedPercent = Math.min(percent, 100);
  const roundedPercent = Math.min(Math.round(percent), 100);

  if (barEl) {
    barEl.setAttribute("aria-valuenow", roundedPercent);
  }

  if (barFillEl) {
    barFillEl.style.width = `${cappedPercent}%`;
    barFillEl.className = `budget-bar-fill level-${level}`;
  }

  if (textEl) {
    textEl.textContent = `${formatCurrency(spent)} spent of ${formatCurrency(state.budget)} (${percent.toFixed(1)}%)`;
  }

  if (statusEl) {
    statusEl.className = `budget-status level-${level}`;
    if (level === "safe") {
      statusEl.textContent = `On track - ${formatCurrency(remaining)} left`;
    } else if (level === "warning") {
      statusEl.textContent = `Careful - you have used 80%+ of your budget (${formatCurrency(remaining)} left)`;
    } else {
      const overAmount = Math.abs(remaining);
      statusEl.textContent = `Over budget by ${formatCurrency(overAmount)}`;
    }
  }
}

/**
 * Render Transaction List
 * Uses document.createElement and textContent exclusively to prevent XSS
 * @param {Array} filteredList - Array of filtered transactions
 * @param {number} totalCount - Total transactions in system
 */
function renderList(filteredList, totalCount) {
  const listEl = document.getElementById("transaction-list");
  const emptyStateEl = document.getElementById("empty-state");
  const emptyStateTextEl = document.getElementById("empty-state-text");
  const filterCountEl = document.getElementById("filter-count");

  if (!listEl || !emptyStateEl) return;

  // Update filter count note
  if (filterCountEl) {
    filterCountEl.textContent = `Showing ${filteredList.length} of ${totalCount} transactions`;
  }

  listEl.innerHTML = "";

  if (filteredList.length === 0) {
    emptyStateEl.style.display = "block";
    if (emptyStateTextEl) {
      if (totalCount === 0) {
        emptyStateTextEl.textContent = "No transactions found. Add a transaction above to get started!";
      } else {
        emptyStateTextEl.textContent = "No transactions match the selected filters.";
      }
    }
    return;
  }

  emptyStateEl.style.display = "none";

  filteredList.forEach((item) => {
    const li = document.createElement("li");
    li.className = "transaction-item";
    if (item.id === state.editingId) {
      li.classList.add("editing");
    }
    li.setAttribute("data-id", item.id);

    // Transaction Details
    const infoDiv = document.createElement("div");
    infoDiv.className = "transaction-info";

    const descEl = document.createElement("div");
    descEl.className = "transaction-desc";
    descEl.textContent = item.description;

    const metaDiv = document.createElement("div");
    metaDiv.className = "transaction-meta";

    const categoryBadge = document.createElement("span");
    categoryBadge.className = "badge";
    categoryBadge.textContent = item.category;

    const dateSpan = document.createElement("span");
    dateSpan.className = "transaction-date";
    dateSpan.textContent = formatDate(item.date);

    metaDiv.appendChild(categoryBadge);
    metaDiv.appendChild(dateSpan);

    infoDiv.appendChild(descEl);
    infoDiv.appendChild(metaDiv);

    // Amount & Action Buttons
    const amountActionsDiv = document.createElement("div");
    amountActionsDiv.className = "transaction-amount-actions";

    const amountEl = document.createElement("div");
    const isIncome = item.type === "income";
    amountEl.className = `transaction-amount ${isIncome ? "income" : "expense"}`;
    const sign = isIncome ? "+" : "-";
    amountEl.textContent = `${sign}${formatCurrency(item.amount)}`;

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "transaction-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-edit";
    editBtn.setAttribute("data-id", item.id);
    editBtn.setAttribute("aria-label", `Edit transaction: ${item.description}`);
    editBtn.textContent = "Edit";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.setAttribute("data-id", item.id);
    deleteBtn.setAttribute("aria-label", `Delete transaction: ${item.description}`);
    deleteBtn.textContent = "Delete";

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    amountActionsDiv.appendChild(amountEl);
    amountActionsDiv.appendChild(actionsDiv);

    li.appendChild(infoDiv);
    li.appendChild(amountActionsDiv);

    listEl.appendChild(li);
  });
}

/**
 * Render Monthly Breakdown Summary into #monthly-summary
 * @param {Array} transactions 
 */
function renderMonthlySummary(transactions) {
  const container = document.getElementById("monthly-summary");
  if (!container) return;

  let contentDiv = container.querySelector(".monthly-summary-content");
  if (!contentDiv) {
    contentDiv = document.createElement("div");
    contentDiv.className = "monthly-summary-content";
    container.appendChild(contentDiv);
  }
  contentDiv.innerHTML = "";

  const summaryData = monthlySummary(transactions);

  if (summaryData.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "analytics-empty";
    emptyMsg.textContent = "No monthly data available yet.";
    contentDiv.appendChild(emptyMsg);
    return;
  }

  const table = document.createElement("table");
  table.className = "monthly-table";

  // Table Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Month", "Income", "Expense", "Balance"].forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table Body
  const tbody = document.createElement("tbody");
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  summaryData.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = "monthly-row";
    tr.setAttribute("data-month", item.monthKey);

    if (item.monthKey === currentMonthKey) {
      tr.classList.add("current-month");
    }
    if (state.filters.month === item.monthKey) {
      tr.classList.add("selected-month");
    }

    // Month Label
    const tdMonth = document.createElement("td");
    tdMonth.className = "monthly-name";
    tdMonth.textContent = item.monthLabel;
    if (item.monthKey === currentMonthKey) {
      const tag = document.createElement("span");
      tag.className = "month-tag";
      tag.textContent = "Current";
      tdMonth.appendChild(tag);
    }

    // Income
    const tdIncome = document.createElement("td");
    tdIncome.className = "income";
    tdIncome.textContent = formatCurrency(item.income);

    // Expense
    const tdExpense = document.createElement("td");
    tdExpense.className = "expense";
    tdExpense.textContent = formatCurrency(item.expense);

    // Balance
    const tdBalance = document.createElement("td");
    tdBalance.className = "balance";
    tdBalance.textContent = formatCurrency(item.balance);
    if (item.balance < 0) {
      tdBalance.style.color = "var(--color-expense)";
    } else if (item.balance > 0) {
      tdBalance.style.color = "var(--color-income)";
    }

    tr.appendChild(tdMonth);
    tr.appendChild(tdIncome);
    tr.appendChild(tdExpense);
    tr.appendChild(tdBalance);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  contentDiv.appendChild(table);
}

/**
 * Render Category-wise SVG Donut Chart into #category-chart
 * Respects active month filter and uses pure SVG stroke-dasharray method
 * @param {Array} transactions 
 */
function renderCategoryChart(transactions) {
  const container = document.getElementById("category-chart");
  if (!container) return;

  let contentDiv = container.querySelector(".category-chart-content");
  if (!contentDiv) {
    contentDiv = document.createElement("div");
    contentDiv.className = "category-chart-content";
    container.appendChild(contentDiv);
  }
  contentDiv.innerHTML = "";

  const { items, totalExpense } = groupByCategory(transactions);

  if (items.length === 0 || totalExpense === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "analytics-empty";
    emptyMsg.textContent = "No expenses recorded for this period.";
    contentDiv.appendChild(emptyMsg);
    return;
  }

  const chartWrapper = document.createElement("div");
  chartWrapper.className = "donut-chart-wrapper";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "donut-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Category expense breakdown donut chart, total expense ${formatCurrency(totalExpense)}`);

  const cx = 100;
  const cy = 100;
  const r = 65;
  const circumference = 2 * Math.PI * r;

  // Rotated group to start segments at 12 o'clock (-90 deg)
  const g = document.createElementNS(svgNS, "g");
  g.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);

  let offset = 0;

  items.forEach((item) => {
    const strokeDash = (item.percentage / 100) * circumference;
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", "transparent");
    circle.setAttribute("stroke", item.color);
    circle.setAttribute("stroke-width", "24");
    circle.setAttribute("stroke-dasharray", `${strokeDash} ${circumference - strokeDash}`);
    circle.setAttribute("stroke-dashoffset", -offset);
    
    g.appendChild(circle);
    offset += strokeDash;
  });

  svg.appendChild(g);

  // Center Text Group
  const centerTextGroup = document.createElementNS(svgNS, "g");
  centerTextGroup.setAttribute("class", "donut-center-text");

  const titleText = document.createElementNS(svgNS, "text");
  titleText.setAttribute("x", cx);
  titleText.setAttribute("y", cy - 6);
  titleText.setAttribute("text-anchor", "middle");
  titleText.setAttribute("class", "center-label");
  titleText.textContent = "Total Expense";

  const valueText = document.createElementNS(svgNS, "text");
  valueText.setAttribute("x", cx);
  valueText.setAttribute("y", cy + 14);
  valueText.setAttribute("text-anchor", "middle");
  valueText.setAttribute("class", "center-amount");
  valueText.textContent = formatCurrency(totalExpense);

  centerTextGroup.appendChild(titleText);
  centerTextGroup.appendChild(valueText);
  svg.appendChild(centerTextGroup);

  chartWrapper.appendChild(svg);

  // Donut Legend List
  const legend = document.createElement("ul");
  legend.className = "donut-legend";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = item.color;

    const labelGroup = document.createElement("div");
    labelGroup.className = "legend-label-group";

    const categorySpan = document.createElement("span");
    categorySpan.className = "legend-category";
    categorySpan.textContent = item.category;

    const detailSpan = document.createElement("span");
    detailSpan.className = "legend-details";
    detailSpan.textContent = `${formatCurrency(item.amount)} (${item.percentage.toFixed(1)}%)`;

    labelGroup.appendChild(categorySpan);
    labelGroup.appendChild(detailSpan);

    li.appendChild(swatch);
    li.appendChild(labelGroup);
    legend.appendChild(li);
  });

  chartWrapper.appendChild(legend);
  contentDiv.appendChild(chartWrapper);
}

/**
 * Central render function - updates UI according to state
 */
function render() {
  populateMonthDropdown();

  // Financial summary totals
  const totalSummary = calcTotals(state.transactions);
  renderSummary(totalSummary);

  // Smart insights strip
  renderInsights();

  // Monthly budget status & progress
  renderBudget();

  // Monthly summary breakdown
  renderMonthlySummary(state.transactions);

  // Active month transactions for category chart
  let activeMonthTransactions = state.transactions;
  if (state.filters.month !== "all") {
    activeMonthTransactions = activeMonthTransactions.filter(
      (t) => t.date && t.date.startsWith(state.filters.month)
    );
  }
  renderCategoryChart(activeMonthTransactions);

  // List displays filtered & sorted transactions
  const filtered = getFiltered(state);
  const sortedFiltered = sortNewestFirst(filtered);
  
  renderList(sortedFiltered, state.transactions.length);
}

// ==========================================================================
// Event Handlers & Form Validation
// ==========================================================================

/**
 * Validate budget input amount
 * @param {string} valStr 
 * @returns {string|null} Error string or null if valid
 */
function validateBudgetAmount(valStr) {
  if (!valStr || valStr.trim() === "") {
    return "Please enter a budget limit.";
  }
  const num = Number(valStr);
  if (!Number.isFinite(num) || num <= 0) {
    return "Budget limit must be a positive number greater than 0.";
  }
  if (num > 1000000000) {
    return "Budget limit cannot exceed ₹1,000,000,000.";
  }
  const decimalMatch = valStr.match(/\.(\d+)/);
  if (decimalMatch && decimalMatch[1].length > 2) {
    return "Budget amount cannot have more than 2 decimal places.";
  }
  return null;
}

/**
 * Handle Budget Form Submission
 * @param {Event} event 
 */
function handleBudgetFormSubmit(event) {
  event.preventDefault();

  const inputEl = document.getElementById("budget-input");
  const errorEl = document.getElementById("budget-error");
  if (!inputEl) return;

  const valStr = inputEl.value.trim();
  const errorMsg = validateBudgetAmount(valStr);

  if (errorMsg) {
    inputEl.classList.add("invalid");
    if (errorEl) errorEl.textContent = errorMsg;
    inputEl.focus();
    return;
  }

  inputEl.classList.remove("invalid");
  if (errorEl) errorEl.textContent = "";

  state.budget = Number(valStr);
  saveBudget();
  render();
}

/**
 * Handle Budget Clear / Remove
 */
function handleBudgetClear() {
  state.budget = null;
  saveBudget();

  const inputEl = document.getElementById("budget-input");
  const errorEl = document.getElementById("budget-error");

  if (inputEl) {
    inputEl.value = "";
    inputEl.classList.remove("invalid");
  }
  if (errorEl) {
    errorEl.textContent = "";
  }

  render();
}

/**
 * Clear all transaction form validation errors
 */
function clearTransactionFormErrors() {
  const fields = [
    { id: "type", errorId: "type-error" },
    { id: "amount", errorId: "amount-error" },
    { id: "category", errorId: "category-error" },
    { id: "date", errorId: "date-error" },
    { id: "description", errorId: "description-error" }
  ];

  fields.forEach(({ id, errorId }) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(errorId);
    if (el) el.classList.remove("invalid");
    if (errEl) errEl.textContent = "";
  });

  const generalErrorEl = document.getElementById("form-error");
  if (generalErrorEl) {
    generalErrorEl.textContent = "";
    generalErrorEl.hidden = true;
  }
}

/**
 * Validate transaction form inputs on submit
 * Sets field-specific errors, general message in #form-error, .invalid class, and focuses first invalid field.
 * @returns {boolean} True if valid, false if invalid
 */
function validateTransactionForm() {
  clearTransactionFormErrors();

  const typeEl = document.getElementById("type");
  const amountEl = document.getElementById("amount");
  const categoryEl = document.getElementById("category");
  const dateEl = document.getElementById("date");
  const descriptionEl = document.getElementById("description");
  const generalErrorEl = document.getElementById("form-error");

  const errors = {};
  let firstInvalidEl = null;

  // 1. Type validation
  const typeVal = typeEl ? typeEl.value : "";
  if (!typeVal) {
    errors.type = "Please select a transaction type.";
    if (typeEl) {
      typeEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = typeEl;
    }
  }

  // 2. Amount validation
  const amountVal = amountEl ? amountEl.value.trim() : "";
  if (!amountVal) {
    errors.amount = "Amount is required.";
    if (amountEl) {
      amountEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = amountEl;
    }
  } else {
    const amt = Number(amountVal);
    if (isNaN(amt) || amt <= 0) {
      errors.amount = "Amount must be a positive number greater than 0.";
      if (amountEl) {
        amountEl.classList.add("invalid");
        if (!firstInvalidEl) firstInvalidEl = amountEl;
      }
    } else {
      const decMatch = amountVal.match(/\.(\d+)/);
      if (decMatch && decMatch[1].length > 2) {
        errors.amount = "Amount cannot have more than 2 decimal places.";
        if (amountEl) {
          amountEl.classList.add("invalid");
          if (!firstInvalidEl) firstInvalidEl = amountEl;
        }
      }
    }
  }

  // 3. Category validation
  const categoryVal = categoryEl ? categoryEl.value : "";
  if (!categoryVal) {
    errors.category = "Please select a category.";
    if (categoryEl) {
      categoryEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = categoryEl;
    }
  }

  // 4. Date validation
  const dateVal = dateEl ? dateEl.value : "";
  if (!dateVal) {
    errors.date = "Date is required.";
    if (dateEl) {
      dateEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = dateEl;
    }
  } else {
    const dObj = new Date(dateVal);
    if (isNaN(dObj.getTime())) {
      errors.date = "Please enter a valid date.";
      if (dateEl) {
        dateEl.classList.add("invalid");
        if (!firstInvalidEl) firstInvalidEl = dateEl;
      }
    }
  }

  // 5. Description validation
  const descVal = descriptionEl ? descriptionEl.value.trim() : "";
  if (!descVal) {
    errors.description = "Description is required.";
    if (descriptionEl) {
      descriptionEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = descriptionEl;
    }
  } else if (descVal.length > 100) {
    errors.description = "Description cannot exceed 100 characters.";
    if (descriptionEl) {
      descriptionEl.classList.add("invalid");
      if (!firstInvalidEl) firstInvalidEl = descriptionEl;
    }
  }

  // Display field error messages
  if (errors.type) {
    const errSpan = document.getElementById("type-error");
    if (errSpan) errSpan.textContent = errors.type;
  }
  if (errors.amount) {
    const errSpan = document.getElementById("amount-error");
    if (errSpan) errSpan.textContent = errors.amount;
  }
  if (errors.category) {
    const errSpan = document.getElementById("category-error");
    if (errSpan) errSpan.textContent = errors.category;
  }
  if (errors.date) {
    const errSpan = document.getElementById("date-error");
    if (errSpan) errSpan.textContent = errors.date;
  }
  if (errors.description) {
    const errSpan = document.getElementById("description-error");
    if (errSpan) errSpan.textContent = errors.description;
  }

  const hasErrors = Object.keys(errors).length > 0;

  if (hasErrors) {
    if (generalErrorEl) {
      generalErrorEl.textContent = "Please fill in all the fields";
      generalErrorEl.hidden = false;
    }
    if (firstInvalidEl) {
      firstInvalidEl.focus();
    }
    return false;
  }

  if (generalErrorEl) {
    generalErrorEl.textContent = "";
    generalErrorEl.hidden = true;
  }

  return true;
}

/**
 * Bind real-time input listeners to clear validation errors when user types or selects values
 */
function wireRealTimeFormValidation() {
  const fields = [
    { id: "type", errorId: "type-error", events: ["change"] },
    { id: "amount", errorId: "amount-error", events: ["input", "change"] },
    { id: "category", errorId: "category-error", events: ["change"] },
    { id: "date", errorId: "date-error", events: ["change", "input"] },
    { id: "description", errorId: "description-error", events: ["input", "change"] }
  ];

  fields.forEach(({ id, errorId, events }) => {
    const el = document.getElementById(id);
    if (!el) return;

    events.forEach((evtName) => {
      el.addEventListener(evtName, () => {
        const val = el.value.trim();
        if (val) {
          el.classList.remove("invalid");
          const errSpan = document.getElementById(errorId);
          if (errSpan) errSpan.textContent = "";

          const typeVal = document.getElementById("type")?.value;
          const amtVal = document.getElementById("amount")?.value.trim();
          const catVal = document.getElementById("category")?.value;
          const dateVal = document.getElementById("date")?.value;
          const descVal = document.getElementById("description")?.value.trim();

          if (typeVal && amtVal && catVal && dateVal && descVal) {
            const generalErr = document.getElementById("form-error");
            if (generalErr) {
              generalErr.textContent = "";
              generalErr.hidden = true;
            }
          }
        }
      });
    });
  });
}

/**
 * Form Submit Handler for creating or updating transactions
 * @param {Event} event 
 */
function handleFormSubmit(event) {
  event.preventDefault();

  if (!validateTransactionForm()) {
    return;
  }

  const typeEl = document.getElementById("type");
  const amountEl = document.getElementById("amount");
  const categoryEl = document.getElementById("category");
  const dateEl = document.getElementById("date");
  const descriptionEl = document.getElementById("description");

  const type = typeEl.value;
  const amount = Number(amountEl.value);
  const category = categoryEl.value;
  const date = dateEl.value;
  const description = descriptionEl.value.trim();

  if (state.editingId) {
    // Update existing transaction
    const index = state.transactions.findIndex((t) => t.id === state.editingId);
    if (index !== -1) {
      state.transactions[index] = {
        ...state.transactions[index],
        type,
        amount,
        category,
        date,
        description
      };
    }
    exitEditMode();
  } else {
    // Add new transaction
    const newTransaction = {
      id: generateId(),
      type,
      amount,
      category,
      date,
      description
    };
    state.transactions.push(newTransaction);
    const form = document.getElementById("transaction-form");
    if (form) form.reset();
    setDefaultDate();
    populateCategoryDropdowns();
    clearTransactionFormErrors();
  }

  saveTransactions();
  render();
}

/**
 * Single Event Delegation Click Handler for transaction list buttons
 * @param {Event} event 
 */
function handleListClick(event) {
  const target = event.target;
  const button = target.closest("button");
  if (!button) return;

  const id = button.getAttribute("data-id");
  if (!id) return;

  if (button.classList.contains("btn-danger")) {
    if (confirm("Are you sure you want to delete this transaction?")) {
      state.transactions = state.transactions.filter((t) => t.id !== id);
      if (state.editingId === id) {
        exitEditMode();
      }
      saveTransactions();
      render();
    }
  } else if (button.classList.contains("btn-edit")) {
    enterEditMode(id);
  }
}

/**
 * Handle monthly breakdown table row click to filter by month
 * @param {Event} event 
 */
function handleMonthlySummaryClick(event) {
  const tr = event.target.closest("tr[data-month]");
  if (!tr) return;

  const monthKey = tr.getAttribute("data-month");
  if (!monthKey) return;

  state.filters.month = monthKey;
  const monthSelect = document.getElementById("filter-month");
  if (monthSelect) {
    monthSelect.value = monthKey;
  }
  render();
}

/**
 * Cancel button click handler
 */
function handleCancelClick() {
  exitEditMode();
  render();
}

/**
 * Clear all filter selections
 */
function clearFilters() {
  state.filters = {
    type: "all",
    category: "all",
    month: "all"
  };

  const typeFilter = document.getElementById("filter-type");
  const categoryFilter = document.getElementById("filter-category");
  const monthFilter = document.getElementById("filter-month");

  if (typeFilter) typeFilter.value = "all";
  if (categoryFilter) categoryFilter.value = "all";
  if (monthFilter) monthFilter.value = "all";

  render();
}

// ==========================================================================
// Initialization & Event Binding
// ==========================================================================

function init() {
  state.transactions = loadTransactions();
  state.budget = loadBudget();
  
  populateCategoryDropdowns();
  setDefaultDate();

  // Budget Form & Actions
  const budgetForm = document.getElementById("budget-form");
  if (budgetForm) budgetForm.addEventListener("submit", handleBudgetFormSubmit);

  const budgetClearBtn = document.getElementById("budget-clear-btn");
  if (budgetClearBtn) budgetClearBtn.addEventListener("click", handleBudgetClear);

  // Form & Actions
  const form = document.getElementById("transaction-form");
  if (form) form.addEventListener("submit", handleFormSubmit);

  wireRealTimeFormValidation();

  const cancelBtn = document.getElementById("cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancelClick);

  const listEl = document.getElementById("transaction-list");
  if (listEl) listEl.addEventListener("click", handleListClick);

  const monthlySummaryCard = document.getElementById("monthly-summary");
  if (monthlySummaryCard) {
    monthlySummaryCard.addEventListener("click", handleMonthlySummaryClick);
  }

  const typeSelect = document.getElementById("type");
  if (typeSelect) typeSelect.addEventListener("change", populateCategoryDropdowns);

  // Filter Wire Events
  const filterType = document.getElementById("filter-type");
  if (filterType) {
    filterType.addEventListener("change", (e) => {
      state.filters.type = e.target.value;
      render();
    });
  }

  const filterCategory = document.getElementById("filter-category");
  if (filterCategory) {
    filterCategory.addEventListener("change", (e) => {
      state.filters.category = e.target.value;
      render();
    });
  }

  const filterMonth = document.getElementById("filter-month");
  if (filterMonth) {
    filterMonth.addEventListener("change", (e) => {
      state.filters.month = e.target.value;
      render();
    });
  }

  const clearFiltersBtn = document.getElementById("clear-filters-btn");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", clearFilters);
  }

  render();
}

document.addEventListener("DOMContentLoaded", init);
