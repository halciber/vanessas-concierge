# Vanessa's Concierge

Vanessa's Concierge is a serene, low-stress, and beautifully organized Single Page Application (SPA) designed to help Vanessa manage her busy schedule as a caregiver. The application features a peaceful pastel-themed user interface (the *Serene Aura* theme) and integrates a voice-activated client-side AI Care Assistant powered by the Gemini API, alongside direct Google APIs and Firebase integrations.

---

## 🌟 Key Features

1. **AI Care Assistant ("Care Assistant")**
   - A floating, bottom-docked conversational AI assistant powered by `gemini-2.5-flash`.
   - Supports text input and hands-free voice dictation via the **HTML5 Web Speech API** (`SpeechRecognition`), featuring a 3.5-second silence auto-submit.
   - Handles natural language requests to manage checklists, schedule calendar events, log journal entries, record expenses, and compile reports.
   - Fallback offline mock AI parser enables full demonstration of features when no API key is active.

2. **Schedule & Task Management**
   - Merges local Markdown-stored events and checklists with live **Google Calendar** and **Google Tasks** accounts.
   - Synchronizes completion states bidirectionally.

3. **Daily Routine Checklists**
   - Custom, weekday-specific routines (e.g., hygiene care, feeding pets, giving medications) that reset automatically.

4. **Care Journal & Notes**
   - Daily logs recording client names, start/end times, mileage, and custom rich-text notes.
   - Automatically computes Medicaid/DODD billing units (1 unit per 15 minutes worked).

5. **Expense Tracker**
   - Logs business expenses, auto-categorizes standard vendors (ALDI, Walmart, McDonald's, CVS, etc.), and tracks payment methods.
   - Displays real-time calculations for weekly and monthly expenditures.

6. **Billing Report Generator**
   - Generates and compiles detailed billing summaries for selected date ranges.
   - Exports reports as **CSV downloads** or prints them as print-ready **PDF documents** with provider/guardian signature lines.
   - Stores report summaries in a historical archive.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Vanilla JavaScript (ES6+), Vanilla CSS (Custom properties, grid, flexbox, keyframe animations).
- **Icons**: Lucide Icons.
- **Data Access & Storage**: Unified storage wrapper (`file-system.js`) targeting:
  - **Firebase Firestore**: Real-time cloud sync when a user is authenticated.
  - **Local Storage**: Fallback guest mode database.
  - **Python Static Server API**: Local file-system persistence (saves data as JSON/Markdown files in the `/data` directory).
- **APIs**:
  - **Gemini API** (`generativelanguage.googleapis.com`) for function-calling.
  - **Google Identity Services & Google REST API** (Calendar & Tasks).
  - **Firebase Authentication & Firestore SDK**.

---

## 🚀 Running Locally

No modern Javascript build tools or bundlers are required. The SPA runs entirely in the browser.

### Prerequisites
- Python 3.x installed on your computer.

### Steps to Run
1. Clone this repository to your local machine.
2. Navigate into the project folder.
3. Launch the Python local development server:
   - **On Windows**: Double-click [LaunchPythonWebServer.bat](file:///c:/_working/Vanessas_Apps/Concierge/LaunchPythonWebServer.bat) or run `python server.py` in your terminal.
   - **On macOS/Linux**: Run `python3 server.py` in your terminal.
4. Open your web browser and go to:
   ```text
   http://localhost:8000
   ```

*Note: The local Python server runs on port 8000. It hosts the static assets and provides file-system APIs to save/delete files inside the `/data` directory during local development.*

---

## ⚙️ Configuration Setup

To enable cloud features, go to the **Settings** tab (gear icon in the sidebar nav):

### 1. Gemini AI Assistant (Required for Live AI Chat)
1. Enter your Gemini API Key in the **Gemini AI Developer Key** field.
2. Click **Save Gemini Key**.
3. If no key is configured, the Care Assistant runs in **Mock/Offline Demo Mode**, responding with preset patterns.

### 2. Google Calendar & Google Tasks Integration
1. Follow the [Google OAuth 2.0 Configuration Guide](file:///c:/_working/Vanessas_Apps/Concierge/oauth_setup_guide.md) to set up a Google Cloud Console project.
2. Configure your **OAuth Client ID** in the settings field and click **Save Google Client ID**.
3. Click the **Connect to Google** button to authorize your account.

### 3. Firebase Auth & Firestore Sync
1. Set up a project in the Firebase Console.
2. Enable Email/Password authentication and Cloud Firestore.
3. Copy your Web App config JSON into the **Firebase Configuration JSON** field and click **Save Config**.
4. Log in using your email and password in the settings form to enable cloud sync.

---

## 📦 Deployment

The project is pre-configured for deployment with **Firebase Hosting**.

1. Make sure you have the Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in and initialize hosting:
   ```bash
   firebase login
   firebase init hosting
   ```
3. Deploy the application:
   ```bash
   firebase deploy
   ```

Refer to [firebase.json](file:///c:/_working/Vanessas_Apps/Concierge/firebase.json) for virtual route rewrite configurations.
