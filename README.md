# Expense Tracker

A modern, responsive personal finance web dashboard for tracking income, expenses, monthly budgets, and visual analytics.

Tech Stack: HTML5 | CSS3 | JavaScript (ES6+) | Local Storage

---

## Features

### Core
- **Add Transactions**: Record income and expense entries with amount, category, date, and description.
- **Edit & Delete**: Modify or remove existing transactions with single-click actions and form auto-fill.
- **Financial Summaries**: Real-time display of total income, total expenses, and net balance.
- **Multi-Criteria Filtering**: Filter transaction history by transaction type, category, and month.
- **Local Storage Persistence**: Automatically save transactions and budget limits to the browser.
- **Responsive Design**: Custom CSS grid and flexbox layout adapted for mobile (360px), tablet (768px), and desktop (1100px+).

### Extras
- **Monthly Budget Tracking**: Set monthly spending limits with a progress bar and visual alerts (`safe`, `warning`, `danger`).
- **Category Donut Chart**: Pure SVG donut chart (`stroke-dasharray`) with interactive category breakdown legend and percentages.
- **Monthly Breakdown Table**: Tabular summary of income, expense, and balance grouped by month with row-click filter integration.
- **Smart Insights**: Automated financial analytics highlighting top category, month-over-month trends, daily average spend, and savings rates.
- **Form Validation**: Immediate field-level error messages, general alert container, input highlight (`.invalid`), and auto-focusing.
- **Dark Mode**: Theme switcher supporting light and dark color schemes with system preference auto-detection.

---

## Requirement Checklist

| Requirement | Status | Where in the App |
| :--- | :--- | :--- |
| Add income/expense entries | Complete | `#transaction-form` (`app.js`: `handleFormSubmit`) |
| Edit & delete entries | Complete | `#transaction-list` (`app.js`: `handleListClick`, `enterEditMode`) |
| Total income, expense, balance | Complete | `.summary-section` (`app.js`: `calcTotals`, `renderSummary`) |
| Filter by type, category, month | Complete | `.filter-section` (`app.js`: `getFiltered`) |
| Local Storage persistence | Complete | `localStorage` (`app.js`: `saveTransactions`, `loadTransactions`) |
| Mobile & desktop responsive | Complete | `style.css` (`@media` breakpoints at 768px & 1100px) |
| Bonus: Monthly expense summary | Complete | `#monthly-summary` (`app.js`: `monthlySummary`, `renderMonthlySummary`) |
| Bonus: Category breakdown chart | Complete | `#category-chart` (`app.js`: `groupByCategory`, `renderCategoryChart`) |
| Bonus: Validation with clear errors | Complete | `#transaction-form` (`app.js`: `validateTransactionForm`, `#form-error`) |

---

## Tech Stack

- **HTML5**: Semantic document structure with accessible ARIA attributes (`aria-live`, `role="progressbar"`, `role="img"`).
- **Vanilla CSS3**: Modern styling utilizing CSS custom properties (variables), Bento CSS Grid, Flexbox, backdrop filters, and CSS media queries. No external framework or utility library.
- **JavaScript (ES6+)**: Modular client-side script managing state, data manipulation, SVG generation, and DOM rendering.
- **Browser LocalStorage API**: Offline client-side persistence with zero dependencies or external databases.

No build tools, package managers, or third-party libraries are required.

---

## How to Run

### Option 1: Open Direct in Browser
1. Clone the repository:
   ```bash
   git clone https://github.com/Jeffin777/expense-tracker-jeffinjose.git
   ```
2. Navigate to the project folder:
   ```bash
   cd expense-tracker
   ```
3. Open `index.html` in any web browser (double-click `index.html` or open via file menu).

### Option 2: VS Code Live Server
1. Open the project folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and select **Open with Live Server**.

> **Note**: No installation, `npm install`, or build process is required.

---

## How to Use

1. **Add a Transaction**: Select Type (Income/Expense), enter Amount, select Category, pick Date, type Description, and click **Add Transaction**.
2. **Edit a Transaction**: Click **Edit** next to any transaction row. The form pre-fills with data. Update values and click **Update Transaction**.
3. **Delete a Transaction**: Click **Delete** on a transaction row and confirm the prompt.
4. **Filter History**: Use the filter dropdowns in **Transactions History** to filter by Type, Category, or Month. Click **Clear Filters** to reset.
5. **Set Monthly Budget**: Enter a budget limit in **Monthly Budget** and click **Save Budget**. The bar tracks expense totals for the active month.
6. **Toggle Dark Theme**: Click the sun/moon toggle button in the top header to switch themes.

---

## Project Structure

```text
expense-tracker/
├── index.html        # HTML5 markup, semantic sections, and inline theme script
├── style.css         # CSS design tokens, reset, layout, components, and media queries
├── app.js            # Business logic, state management, validation, and DOM rendering
└── README.md         # Project documentation and setup guide
```

---

## How It Works

### Architecture
The application uses a strict **one-way data flow**:
`User Action` → `Update State` → `Save to Local Storage` → `render()`

### Data Model
Each transaction is stored as an object:
```json
{
  "id": "u9z2k1a",
  "type": "expense",
  "amount": 450.50,
  "category": "Food & Dining",
  "date": "2026-10-05",
  "description": "Grocery shopping"
}
```

### Persistence & Storage Keys
All state is persisted in the user's browser using `localStorage`:
- `expenseTracker.transactions`: JSON array of transaction objects.
- `expenseTracker.budget`: Numeric budget limit.
- `theme`: Active theme string (`"light"` or `"dark"`).

Data remains entirely client-side; no data is sent to external servers.

---

## Design Decisions

- **Integer Paise Arithmetic**: All monetary totals are calculated by converting amounts to integer paise (`Math.round(amount * 100)`) before division, eliminating floating-point rounding errors (`0.1 + 0.2`).
- **XSS Prevention**: User-supplied input (descriptions, categories) is inserted into the DOM exclusively via `textContent` and `createElement`, preventing script injection.
- **All-Time Summary vs. Filtered List**: Summary cards display overall financial status, while the transaction list updates dynamically according to active filter selections.
- **Form Validation Rules**: Required check on all fields; positive non-zero amount check; maximum 2 decimal places; description character cap (100 characters).
- **Mobile-First Layout**: Base styles target single-column mobile viewports (360px+), expanding to 2-column grid at 768px and refined 3-area Bento layout at 1100px.

---

## Browser Support and Known Limitations

- **Browser Compatibility**: Fully supported in Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge.
- **Client-Side Scope**: Data is stored locally per browser and device. Clearing browser cache/storage erases data unless backed up.
- **Single Currency**: Currently configured for INR (`₹`) formatting (`en-IN` locale).

---

## Testing

The application has been verified using the following manual test checklist:

- [x] **Empty Form Submission**: All field-level error spans show error messages, `#form-error` displays `"Please fill in all the fields"`, and focus moves to `#type`.
- [x] **Partial Input**: Submitting with 1 missing field triggers field-specific error and focuses the missing input.
- [x] **Real-Time Error Clearing**: Input error highlights and text clear as user types/selects values.
- [x] **Monthly Breakdown**: Verified with 2+ months of data; correctly computes income, expense, and balance per month.
- [x] **Category Donut Chart**: Verified with 3+ expense categories; SVG arcs and legend percentages calculate accurately.
- [x] **Empty State**: Verified clean display when no transactions exist (`₹0.00` totals, friendly placeholder text, no `NaN` values).
- [x] **Edit & Delete Operations**: Editing or deleting a transaction updates summary cards, budget progress, monthly table, and donut chart.
- [x] **Persistence Check**: Page refresh maintains state, budget limit, theme choice, and transaction history.
- [x] **Responsive Layouts**: Tested at 360px (no horizontal scrolling), 768px, and 1280px widths.

---

## Future Improvements

1. **CSV / JSON Export & Import**: Allow users to backup and restore transaction data to a local file.
2. **Print / PDF Summary Report**: CSS print stylesheet for formatted financial summary exporting.
3. **Recurring Transactions**: Support automated monthly subscription and salary entries.
4. **Custom Categories**: Enable users to create and manage custom category names and colors.
5. **PWA Offline Installation**: Add service worker and manifest for offline mobile app installation.

---

## Author

**[Jeffin Jose]**
- GitHub: https://github.com/Jeffin777/
