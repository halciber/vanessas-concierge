# Vanessa's Concierge Data Folder

This folder serves as the local database when you link it using the **Select Data Folder** button in the application's Configuration screen.

## Database Directory Structure
The application automatically creates and manages files in the following structure:
- `/journal/` - Daily log Markdown files containing structured time and mileage metadata plus Vanessa's clinical logs.
- `/expenses/` - Central JSON transaction registry plus a markdown table overview (`expenses.md`).

## Mock Test Files Included
To help the Kaggle capstone project judges evaluate the program immediately, we have preloaded sample logs inside the directory:
1. `journal/2026-06-27.md` - Client care summary note for John Doe.
2. `expenses/expenses.json` - Sample category entries showing weekly and monthly budgets.

Please select this directory (`Concierge/data/` or the root `Concierge/` folder) when prompted by the **File Storage** configuration picker to read and write directly to these files.
