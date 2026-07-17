# Capstone Project Evaluation: Vanessa's Concierge

This document maps the technical implementation of **Vanessa's Concierge** to the evaluation requirements of the [AI Agents Intensive Vibe Coding Capstone Project](https://www.kaggle.com/competitions/vibecoding-agents-capstone-project).

---

## Part 1: Key Course Concepts Demonstrated (Met 6/6)

The competition requires demonstrating at least **three (3) key concepts** from the course. Vanessa's Concierge successfully integrates **six (6)**:

### 1. Agent & Function Calling (ADK)
The core of the application is a natural language Care Assistant that coordinates Vanessa's day. It parses user intent (both text and voice) and triggers discrete operations via Gemini function calling.
* **Agent Manager:** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (lines 7–380) defines the system prompt, model settings (`gemini-3.5-flash`), and parses API responses.
* **Function Declarations (Tools):** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (lines 23–206) declares tools for adding tasks, creating calendar events, logging journal entries, recording expenses, listing items, and compiling reports.
* **Registered UI Callbacks:** [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) (lines 1602–1981) binds these tools to actual UI modifications, page navigation, and database calls.
* **Offline Mock Parser:** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (lines 380–691) provides a regex-based offline parser that mimics the agent's behavior when no API Key is configured.

### 2. MCP Server Usage
During development, the project utilized the `firebase-mcp-server` to interact with and configure Firebase resources directly from the agentic environment.
* **Environment Alignment:** Used the `firebase_update_environment` tool to configure the working directory and target the `vanessa-s-concierge` project.
* **Workspace Initialization:** Executed the `firebase_init` tool to set up Firebase Hosting rules and single-page app rewrites.
* **Hosting Deployment:** Deployed the project using `firebase_deploy` to make it accessible to judges.

### 3. Antigravity Agentic IDE Environment
The application was built collaboratively using the Antigravity Agentic IDE framework. 
* **Autonomous Execution & Code Modification:** We leveraged Antigravity's autonomous terminal execution (`run_command`) and precision text replace tools (`replace_file_content` and `multi_replace_file_content`) to edit app files and orchestrate local servers without manual file churn.
* **Browser Verification Subagents:** We used the Antigravity `browser_subagent` to spin up headless Chrome sessions, navigate to localhost and live domains, take screenshots, check DOM trees, inspect console logs, and verify that visual components like the microphone button and modal transitions rendered correctly.

### 4. Security Features
To ensure the privacy of Vanessa's cloud data and prevent security vulnerabilities:
* **No Hardcoded Keys:** Gemini API keys are never hardcoded. They are input via the UI Settings panel ([index.html](file:///c:/_working/Vanessas_Apps/Concierge/index.html) lines 354–370) and stored in the browser's secure `localStorage` ([app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) lines 1280–1299 and [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) lines 228–235).
* **Secure Google Authentication:** Uses OAuth 2.0 Web Client authentication to access Google Calendar and Tasks ([google-api.js](file:///c:/_working/Vanessas_Apps/Concierge/google-api.js) lines 14–61) without storing refresh tokens on the server.
* **Secure Cloud Synced database:** Syncs with Firebase Auth and Firestore ([file-system.js](file:///c:/_working/Vanessas_Apps/Concierge/file-system.js) and [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) lines 1506–1540) to protect journals and financial records.

### 5. Deployability
* **Live Link:** [https://vanessa-s-concierge.web.app](https://vanessa-s-concierge.web.app)
* **Configuration:** [firebase.json](file:///c:/_working/Vanessas_Apps/Concierge/firebase.json) and [.firebaserc](file:///c:/_working/Vanessas_Apps/Concierge/.firebaserc) in the project root configure single-page app redirects and ignore build scripts.

### 6. Agent Skills (Local CLI Server)
* **File File System APIs:** [server.py](file:///c:/_working/Vanessas_Apps/Concierge/server.py) implements local API endpoints (`/api/list-files`, `/api/write-file`, `/api/delete-file` on lines 9–108) to support local storage read/writes during offline development.

---

## Part 2: Detailed Code Mapping for Features

Here is the exact code mapping showing how specific features meet the Capstone requirements:

### Feature A: Voice Dictation & Web Speech API
Allows Vanessa to dictate tasks, journals, or expenses hands-free.
* **HTML Element:** [index.html](file:///c:/_working/Vanessas_Apps/Concierge/index.html) (lines 476–479) inserts the microphone button `#ai-chat-mic-btn`.
* **Styling & Pulse Animation:** [styles.css](file:///c:/_working/Vanessas_Apps/Concierge/styles.css) (lines 1443–1476) styles the `.ai-mic-btn` and implements the `@keyframes micPulse` animation.
* **Web Speech Logic:** [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) (lines 2028–2112) implements `initSpeechRecognition()`:
  * `continuous = true` (line 2043) keeps the recording active for multiple sentences.
  * `interimResults = true` (line 2044) displays real-time transcription inside the text box.
  * `resetSilenceTimer()` (lines 2048–2053) triggers a 3.5-second silence auto-submit.
  * `onend` (lines 2090–2112) automatically sends the final text using `submitAIChat()`.

### Feature B: Voice-Activated Billing Reports
Enables Vanessa to ask the assistant to compile and view reports for specific ranges (e.g. `"compile report for last week"`).
* **Gemini Tool Declaration:** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (lines 200–213) defines `compileBillingReport` tool with `startDate` and `endDate` parameters.
* **Gemini Instructions:** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (line 17) instructs the system to use the tool.
* **Offline Fallback Parser:** [gemini-agent.js](file:///c:/_working/Vanessas_Apps/Concierge/gemini-agent.js) (lines 674–721) parses words like `"last week"` or `"this week"`, calculates relative dates, and invokes the callback.
* **Callback Execution:** [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) (lines 1960–1981) maps the tool to:
  * Setting controller range states `this.selectedStartDate` and `this.selectedEndDate`.
  * Navigating to the billing tab `this.switchPage('billing')`.
  * Running `this.compileBillingReport({ save: true, openModal: true })`.
* **Report compiler:** [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) (lines 1020–1086) aggregates hours, DODD units, mileage, and opens the wide report modal.
* **Reports History Sidebar:** [app.js](file:///c:/_working/Vanessas_Apps/Concierge/app.js) (lines 1093–1149) renders past reports on the left sidebar to mirror the journal history view.
