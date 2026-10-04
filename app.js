/**
 * Expense Tracker Application
 * Architecture: One-way data flow (User action -> update state -> save localStorage -> render())
 */

// ==========================================================================
// Constants & Application State
// ==========================================================================
const STORAGE_KEY = "expenseTracker.transactions";

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
  editingId: null
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
 * Uses cent-integer arithmetic to prevent floating-point precision errors (e.g. 0.1 + 0.2)
 * @param {Array} list - Array of transaction objects
 * @returns {Object} { income, expense, balance }
 */
function calcTotals(list) {
  if (!Array.isArray(list)) return { income: 0, expense: 0, balance: 0 };
  
  let incomeCents = 0;
  let expenseCents = 0;

  list.forEach((item) => {
    const amtCents = Math.round((Number(item.amount) || 0) * 100);
    if (item.type === "income") {
      incomeCents += amtCents;
    } else if (item.type === "expense") {
      expenseCents += amtCents;
    }
  });

  const income = incomeCents / 100;
  const expense = expenseCents / 100;
  const balance = (incomeCents - expenseCents) / 100;

  return { income, expense, balance };
}

/**
 * Group transactions by YYYY-MM and return income, expense, and balance per month sorted newest first
 * Uses integer math for precision safety
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
        incomeCents: 0,
        expenseCents: 0
      });
    }

    const record = map.get(monthKey);
    const amtCents = Math.round((Number(item.amount) || 0) * 100);
    if (item.type === "income") {
      record.incomeCents += amtCents;
    } else if (item.type === "expense") {
      record.expenseCents += amtCents;
    }
  });

  return Array.from(map.values())
    .map((rec) => {
      const income = rec.incomeCents / 100;
      const expense = rec.expenseCents / 100;
      const balance = (rec.incomeCents - rec.expenseCents) / 100;
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
 * Uses cent-integer math for rounding accuracy
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
  let totalExpenseCents = 0;

  expenseItems.forEach((t) => {
    const amtCents = Math.round((Number(t.amount) || 0) * 100);
    totalExpenseCents += amtCents;
    map.set(t.category, (map.get(t.category) || 0) + amtCents);
  });

  const totalExpense = totalExpenseCents / 100;
  const sortedCategories = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

  const items = sortedCategories.map(([category, amtCents], index) => {
    const amount = amtCents / 100;
    const percentage = totalExpenseCents > 0 ? (amtCents / totalExpenseCents) * 100 : 0;
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
    if (filters.type !== "all" && item.type !== filters.type) {
      return false;
    }
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
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
 * Get current local date string formatted as YYYY-MM-DD
 * Prevents UTC timezone shifting bugs
 * @returns {string} Local YYYY-MM-DD date
 */
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
 * Format date string (YYYY-MM-DD) to local readable date
 * Avoids timezone shift when constructing Date object
 * @param {string} dateString 
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  const year = parseInt(parts[0], 10);
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, monthIndex, day);
  return dateObj.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Load and validate transactions safely from localStorage
 * Filters out corrupted objects or malformed data structures
 * @returns {Array} Sanitized transactions array
 */
function loadTransactions() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return [];
    const parsed = JSON.parse(rawData);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        (item.type === "income" || item.type === "expense") &&
        typeof item.amount === "number" &&
        !isNaN(item.amount) &&
        item.amount > 0 &&
        typeof item.category === "string" &&
        typeof item.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        typeof item.description === "string"
      );
    });
  } catch (error) {
    console.error("Failed to parse transactions from localStorage, resetting to empty array:", error);
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

// ==========================================================================
// DOM Form Validation & UI Setup
// ==========================================================================

/**
 * Clear all field error messages and invalid styles
 */
function clearFormErrors() {
  const fields = ["type", "amount", "category", "date", "description"];
  fields.forEach((fieldId) => {
    const inputEl = document.getElementById(fieldId);
    const errorSpan = document.getElementById(`${fieldId}-error`);
    if (inputEl) inputEl.classList.remove("invalid");
    if (errorSpan) errorSpan.textContent = "";
  });
}

/**
 * Validate transaction form inputs and set error messages
 * @returns {Object|null} Validated data or null if invalid
 */
function validateForm() {
  clearFormErrors();
  let isValid = true;
  let firstInvalidEl = null;

  const typeEl = document.getElementById("type");
  const amountEl = document.getElementById("amount");
  const categoryEl = document.getElementById("category");
  const dateEl = document.getElementById("date");
  const descriptionEl = document.getElementById("description");

  const type = typeEl ? typeEl.value : "";
  const amountVal = amountEl ? amountEl.value : "";
  const category = categoryEl ? categoryEl.value : "";
  const date = dateEl ? dateEl.value : "";
  const description = descriptionEl ? descriptionEl.value.trim() : "";

  // Validate Type
  if (!type || (type !== "income" && type !== "expense")) {
    isValid = false;
    if (typeEl) typeEl.classList.add("invalid");
    const err = document.getElementById("type-error");
    if (err) err.textContent = "Please select a transaction type.";
    if (!firstInvalidEl) firstInvalidEl = typeEl;
  }

  // Validate Amount
  const amountNum = Number(amountVal);
  if (!amountVal || isNaN(amountNum) || amountNum <= 0) {
    isValid = false;
    if (amountEl) amountEl.classList.add("invalid");
    const err = document.getElementById("amount-error");
    if (err) err.textContent = "Please enter a valid amount greater than ₹0.00.";
    if (!firstInvalidEl) firstInvalidEl = amountEl;
  }

  // Validate Category
  if (!category) {
    isValid = false;
    if (categoryEl) categoryEl.classList.add("invalid");
    const err = document.getElementById("category-error");
    if (err) err.textContent = "Please select a category.";
    if (!firstInvalidEl) firstInvalidEl = categoryEl;
  }

  // Validate Date
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    isValid = false;
    if (dateEl) dateEl.classList.add("invalid");
    const err = document.getElementById("date-error");
    if (err) err.textContent = "Please select a valid date.";
    if (!firstInvalidEl) firstInvalidEl = dateEl;
  }

  // Validate Description
  if (!description || description.length > 100) {
    isValid = false;
    if (descriptionEl) descriptionEl.classList.add("invalid");
    const err = document.getElementById("description-error");
    if (err) err.textContent = "Please enter a description (max 100 characters).";
    if (!firstInvalidEl) firstInvalidEl = descriptionEl;
  }

  if (!isValid) {
    if (firstInvalidEl && typeof firstInvalidEl.focus === "function") {
      firstInvalidEl.focus();
    }
    return null;
  }

  // Round amount to 2 decimal places to avoid standard float drift
  const roundedAmount = Math.round(amountNum * 100) / 100;

  return {
    type,
    amount: roundedAmount,
    category,
    date,
    description
  };
}

/**
 * Set form date input default value to today's local date
 */
function setDefaultDate() {
  const dateInput = document.getElementById("date");
  if (dateInput) {
    dateInput.value = getTodayString();
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

  clearFormErrors();
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

  clearFormErrors();
  const form = document.getElementById("transaction-form");
  const submitBtn = document.getElementById("submit-btn");
  const cancelBtn = document.getElementById("cancel-btn");

  if (form) form.reset();
  setDefaultDate();
  populateCategoryDropdowns();

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
    th.setAttribute("scope", "col");
    th.textContent = heading;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Table Body
  const tbody = document.createElement("tbody");
  const todayStr = getTodayString();
  const currentMonthKey = todayStr.substring(0, 7);

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

  // Summary cards show true balance for ALL transactions
  const totalSummary = calcTotals(state.transactions);
  renderSummary(totalSummary);

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
// Event Handlers & Interaction
// ==========================================================================

/**
 * Form Submit Handler for creating or updating transactions
 * @param {Event} event 
 */
function handleFormSubmit(event) {
  event.preventDefault();

  const validatedData = validateForm();
  if (!validatedData) return;

  if (state.editingId) {
    // Update existing transaction
    const index = state.transactions.findIndex((t) => t.id === state.editingId);
    if (index !== -1) {
      state.transactions[index] = {
        ...state.transactions[index],
        ...validatedData
      };
    }
    exitEditMode();
  } else {
    // Add new transaction
    const newTransaction = {
      id: generateId(),
      ...validatedData
    };
    state.transactions.push(newTransaction);
    const form = document.getElementById("transaction-form");
    if (form) form.reset();
    clearFormErrors();
    setDefaultDate();
    populateCategoryDropdowns();
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
  
  populateCategoryDropdowns();
  setDefaultDate();

  // Form & Actions
  const form = document.getElementById("transaction-form");
  if (form) form.addEventListener("submit", handleFormSubmit);

  const cancelBtn = document.getElementById("cancel-btn");
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancelClick);

  const listEl = document.getElementById("transaction-list");
  if (listEl) listEl.addEventListener("click", handleListClick);

  const monthlySummaryCard = document.getElementById("monthly-summary");
  if (monthlySummaryCard) {
    monthlySummaryCard.addEventListener("click", handleMonthlySummaryClick);
  }

  const typeSelect = document.getElementById("type");
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      populateCategoryDropdowns();
      const err = document.getElementById("type-error");
      if (err) err.textContent = "";
      typeSelect.classList.remove("invalid");
    });
  }

  // Clear field errors on user input
  ["amount", "category", "date", "description"].forEach((fieldId) => {
    const inputEl = document.getElementById(fieldId);
    if (inputEl) {
      inputEl.addEventListener("input", () => {
        inputEl.classList.remove("invalid");
        const err = document.getElementById(`${fieldId}-error`);
        if (err) err.textContent = "";
      });
    }
  });

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
