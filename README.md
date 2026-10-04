# Personal Expense Tracker

A lightweight, zero-dependency, modern web application for tracking personal income, expenses, net balance, and visual analytics built with **Vanilla HTML5, CSS3, and JavaScript (ES6+)**.

## Features

- **Financial Summary Dashboard**: Displays Total Income, Total Expenses, and Net Balance formatted in INR currency (`₹`).
- **One-Way Data Flow Architecture**: UI strictly renders from state (`User Action -> State Update -> LocalStorage -> render()`).
- **XSS & Security Hardened**: User-entered descriptions and categories are rendered strictly using `document.createElement` and `textContent`.
- **Form Validation & Accessibility**: Field validation with visual highlights (`.invalid`), dedicated ARIA live error containers (`aria-live="polite"`), connected `<label for>`, and high-contrast visible focus indicators (`:focus-visible`).
- **Edit & Delete Operations**: Single event delegation model on `#transaction-list`. Editing highlights the active transaction card and populates the form; deleting prompts for user confirmation.
- **Dynamic Filtering**: Filter history by transaction type (Income/Expense), category, and dynamic YYYY-MM month dropdowns. Includes a "Clear Filters" button and contextual empty-state messages.
- **Monthly Summary Breakdown**: Grouped table breakdown of monthly financial performance with current calendar month highlighting. Clicking any month row filters the main transaction list.
- **Pure SVG Category Donut Chart**: Offline vector donut chart built using pure SVG `stroke-dasharray` math, center total summary, and color-coded swatches.
- **Robust Edge-Case Defenses**:
  - **Local Timezone Preservation**: Custom `getTodayString()` and `formatDate()` avoid UTC midnight date shifts.
  - **Cent-Integer Precision**: Math calculations operate in integer cents to prevent standard JavaScript floating-point rounding errors.
  - **Corrupted Storage Fallback**: Schema validation on `loadTransactions()` filters out malformed or corrupted localStorage objects.
  - **Active Editing Cleanup**: Deleting an item currently being edited automatically clears the form and exits edit mode.

## File Structure

- `index.html` - Semantic HTML5 layout and accessibility markup.
- `style.css` - Mobile-first CSS design system with CSS variables, slate dark theme, grid layout, focus indicators, and SVG chart styling.
- `app.js` - Pure JavaScript application state, data pipeline, DOM renderer, and event handlers.
- `README.md` - Documentation and setup guide.

## How to Run

1. Open `index.html` directly in any standard modern web browser (Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge).
2. No build tools, framework setup, web server, or `npm install` required!
