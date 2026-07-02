/**
 * app.js
 * Main UI Controller for Vanessa's Concierge.
 * Manages SPA navigation, binds events, updates components, and coordinates between JS modules.
 */

class AppController {
  constructor() {
    this.activePage = 'home';
    this.selectedStartDate = null;
    this.selectedEndDate = null;
    this.currentJournalDate = null;
    this.currentJournalId = null;
    
    // Calendar month states for billing selector
    const now = new Date();
    this.billingCalMonth1 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.billingCalMonth2 = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async init() {
    // 1. Initialize File System and Google API managers
    await fileSystem.init();
    
    const savedGoogleId = localStorage.getItem('google_client_id') || '';
    googleAPI.init(savedGoogleId);

    const savedGeminiKey = localStorage.getItem('gemini_api_key') || '';
    geminiAgent.init(savedGeminiKey);

    // 2. Setup Lucide Icons
    lucide.createIcons();

    // 3. Register AI Agent callback tools
    this.registerAgentCallbacks();

    // 4. Bind UI Event listeners
    this.bindEvents();

    // 5. Load Settings UI values
    this.loadSettingsUI();

    // 6. Navigate to home (default; switchPage triggers the dashboard load) and pre-load expenses
    this.switchPage('home');
    await this.loadExpensesData();
  }

  // ----------------------------------------------------
  // Navigation & Routing
  // ----------------------------------------------------
  switchPage(pageId) {
    this.activePage = pageId;
    
    // Update sidebar nav highlighting
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      if (item.getAttribute('data-page') === pageId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update active page container
    document.querySelectorAll('.main-content .page').forEach(page => {
      if (page.id === `page-${pageId}`) {
        page.classList.add('active');
      } else {
        page.classList.remove('active');
      }
    });

    // Update main container theme class
    const mainArea = document.getElementById('main-content-area');
    mainArea.className = `main-content theme-${pageId}`;

    // Update placeholder in AI input box based on context
    const chatInput = document.getElementById('ai-chat-input');
    if (pageId === 'expenses') {
      chatInput.placeholder = 'Ask me about your expenses... (e.g. "spent $45 on pharmacy")';
    } else if (pageId === 'journal') {
      chatInput.placeholder = 'Type to log thoughts, or ask: "log 10 miles and hours 9 to 11:30"';
    } else if (pageId === 'billing') {
      chatInput.placeholder = 'Ask: "compile a billing report for last week"';
    } else {
      chatInput.placeholder = 'How can I assist with care today? Ask about schedules, meal plans, or...';
    }

    // Refresh lucide icons in the page
    lucide.createIcons();

    // Refresh page data
    this.refreshPageData(pageId);
  }

  // Refresh data only for the active page
  async refreshPageData(pageId) {
    if (pageId === 'home') {
      await this.loadDashboardData();
    } else if (pageId === 'journal') {
      this.loadJournalEditorToday();
    } else if (pageId === 'expenses') {
      await this.loadExpensesData();
    } else if (pageId === 'billing') {
      this.renderBillingCalendars();
    }
  }

  async refreshAllData() {
    await this.loadDashboardData();
    await this.loadExpensesData();
  }

  // ----------------------------------------------------
  // Dashboard / Home View Loading
  // ----------------------------------------------------
  async loadDashboardData() {
    const today = new Date();
    
    // Set formatted date string
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    document.getElementById('today-date-str').textContent = today.toLocaleDateString('en-US', options);

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 1. Load Calendar Schedule (Merge Local Markdown + Google Calendar)
    const localEvents = await fileSystem.getEvents();
    let googleEvents = [];
    if (googleAPI.isAuthorized()) {
      try {
        googleEvents = await googleAPI.listCalendarEvents();
      } catch (e) {
        console.warn("Could not load Google Calendar events, using local fallback.", e);
      }
    }

    // Normalize Google events to match our schema
    const normalizedGoogle = googleEvents.map(evt => ({
      id: evt.id,
      summary: evt.summary || 'Untitled Event',
      description: evt.description || '',
      startDateTime: evt.start.dateTime || evt.start.date,
      endDateTime: evt.end.dateTime || evt.end.date,
      completed: false, // Will sync state below
      source: 'google'
    }));

    const normalizedLocal = localEvents.map(evt => ({
      ...evt,
      source: 'local'
    }));

    // Merge: Combine local events and any google events not already matching locally by title+start
    const combinedEvents = [...normalizedLocal];
    normalizedGoogle.forEach(gEvt => {
      const gStart = (gEvt.startDateTime || '').substring(0, 16);
      const duplicate = combinedEvents.find(lEvt => 
        (lEvt.summary || '').toLowerCase() === (gEvt.summary || '').toLowerCase() && 
        (lEvt.startDateTime || '').substring(0, 16) === gStart
      );
      if (!duplicate) {
        combinedEvents.push(gEvt);
      } else {
        duplicate.googleId = gEvt.id; // Map Google reference
      }
    });

    // Populate completed state from localStorage map for google events
    for (const evt of combinedEvents) {
      evt.completed = await googleAPI.getEventCompletionState(evt.googleId || evt.id);
    }

    // Sort by startDateTime
    combinedEvents.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));

    const scheduleContainer = document.getElementById('dashboard-schedule');
    scheduleContainer.innerHTML = '';

    const todayEvents = combinedEvents.filter(evt => {
      const evtDate = evt.startDateTime.split('T')[0];
      return evtDate === todayStr;
    });

    if (todayEvents.length === 0) {
      scheduleContainer.innerHTML = `<div class="schedule-item-title" style="color: var(--text-muted); font-weight: 500; font-style: italic;">No events scheduled for today.</div>`;
    } else {
      todayEvents.forEach(evt => {
        const start = new Date(evt.startDateTime);
        const timeStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const periodStr = start.toLocaleTimeString('en-US', { hour12: true }).slice(-2);
        
        const sourceIcon = evt.source === 'google' ? 'cloud' : 'file-text';
        const sourceTitle = evt.source === 'google' ? 'Synced with Google Calendar' : 'Stored locally in Markdown file';

        const itemHtml = `
          <div class="schedule-item">
            <div class="schedule-time">
              ${timeStr}
              <span>${periodStr}</span>
            </div>
            <div class="schedule-details">
              <div class="schedule-item-title" style="display: flex; align-items: center; gap: 8px;">
                ${evt.summary}
                <i data-lucide="${sourceIcon}" style="width: 12px; height: 12px; color: var(--text-muted);" title="${sourceTitle}"></i>
              </div>
              <div class="schedule-item-desc">${evt.description || 'No description.'}</div>
            </div>
            <div class="schedule-check ${evt.completed ? 'completed' : ''}" data-id="${evt.id}" data-google-id="${evt.googleId || ''}">
              <i data-lucide="${evt.completed ? 'check-circle' : 'circle'}"></i>
            </div>
          </div>
        `;
        scheduleContainer.insertAdjacentHTML('beforeend', itemHtml);
      });
    }

    // Bind checkmark toggle click
    scheduleContainer.querySelectorAll('.schedule-check').forEach(checkBtn => {
      checkBtn.addEventListener('click', async (e) => {
        const id = checkBtn.getAttribute('data-id');
        const googleId = checkBtn.getAttribute('data-google-id');
        const wasCompleted = checkBtn.classList.contains('completed');
        
        // Toggle completed in Google completion map
        await googleAPI.toggleCalendarEventCompleted(googleId || id, !wasCompleted);
        
        // Also toggle in local event markdown if it's local
        const localEvt = localEvents.find(e => e.id === id);
        if (localEvt) {
          localEvt.completed = !wasCompleted;
          await fileSystem.saveEvent(localEvt);
        }

        this.showToast(!wasCompleted ? "Event marked complete!" : "Event marked active");
        await this.loadDashboardData();
      });
    });

    // 2. Load Tasks (Merge Local Markdown + Google Tasks)
    const localTasks = await fileSystem.getTasks();
    let googleTasks = [];
    if (googleAPI.isAuthorized()) {
      try {
        googleTasks = await googleAPI.listTasks();
      } catch (e) {
        console.warn("Could not load Google Tasks, using local fallback.", e);
      }
    }

    const normalizedGoogleTasks = googleTasks
      // Reminders synced to Google Tasks already show as pinned reminder cards; don't list them twice
      .filter(t => !(t.title || '').startsWith('Reminder:'))
      .map(t => ({
        id: t.id,
        title: t.title || 'Untitled Task',
        status: t.status,
        source: 'google'
      }));

    const normalizedLocalTasks = localTasks.map(t => ({
      ...t,
      source: 'local'
    }));

    // Merge tasks by title
    const combinedTasks = [...normalizedLocalTasks];
    normalizedGoogleTasks.forEach(gTsk => {
      const duplicate = combinedTasks.find(lTsk => (lTsk.title || '').toLowerCase() === (gTsk.title || '').toLowerCase());
      if (!duplicate) {
        combinedTasks.push(gTsk);
      } else {
        duplicate.googleId = gTsk.id;
      }
    });

    const tasksContainer = document.getElementById('dashboard-tasks');
    tasksContainer.innerHTML = '';

    const incompleteTasks = combinedTasks.filter(t => t.status !== 'completed' && t.status !== 'hidden');

    if (incompleteTasks.length === 0) {
      tasksContainer.innerHTML = `<div class="task-text" style="color: var(--text-muted); font-style: italic;">All tasks completed!</div>`;
    } else {
      incompleteTasks.forEach(task => {
        const sourceIcon = task.source === 'google' ? 'cloud' : 'file-text';
        const sourceTitle = task.source === 'google' ? 'Synced with Google Tasks' : 'Stored locally in Markdown file';

        const itemHtml = `
          <div class="task-item" data-id="${task.id}" data-google-id="${task.googleId || ''}">
            <div class="task-checkbox">
              <i data-lucide="check"></i>
            </div>
            <span class="task-text" style="display: flex; align-items: center; gap: 8px;">
              ${task.title}
              <i data-lucide="${sourceIcon}" style="width: 10px; height: 10px; color: var(--text-muted);" title="${sourceTitle}"></i>
            </span>
          </div>
        `;
        tasksContainer.insertAdjacentHTML('beforeend', itemHtml);
      });
    }

    // Bind task toggle click
    tasksContainer.querySelectorAll('.task-item').forEach(taskItem => {
      taskItem.addEventListener('click', async () => {
        const id = taskItem.getAttribute('data-id');
        const googleId = taskItem.getAttribute('data-google-id');
        
        taskItem.classList.add('completed');

        // Mark completed locally if it's local
        const localTsk = localTasks.find(t => t.id === id);
        if (localTsk) {
          localTsk.status = 'completed';
          localTsk.completed_at = new Date().toISOString().split('T')[0];
          await fileSystem.saveTask(localTsk);
        }

        // Mark completed in Google Tasks
        if (googleAPI.isAuthorized() && (googleId || !id.startsWith('task-'))) {
          await googleAPI.updateTaskStatus(googleId || id, true);
        }

        this.showToast("Task completed!");
        setTimeout(() => this.loadDashboardData(), 300);
      });
    });

    // 3. Load Reminders (Merge Local Markdown + Defaults)
    const localReminders = await fileSystem.getReminders();
    const remindersContainer = document.getElementById('dashboard-reminders');
    remindersContainer.innerHTML = '';

    const displayReminders = [...localReminders];
    if (displayReminders.length === 0) {
      // Add defaults if none exist
      displayReminders.push({ id: 'rem-def-1', title: 'Critical Update', text: 'Call pharmacy for renewal.', type: 'critical' });
      displayReminders.push({ id: 'rem-def-2', title: 'Note', text: 'Mild knee pain reported by John.', type: 'note' });
    }

    displayReminders.forEach(rem => {
      const remHtml = `
        <div class="reminder-card ${rem.type}">
          <div class="reminder-title">${rem.title}</div>
          <div class="reminder-text">${rem.text}</div>
        </div>
      `;
      remindersContainer.insertAdjacentHTML('beforeend', remHtml);
    });

    // 4. Load Daily Routines dynamically from Markdown files
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDayName = daysOfWeek[today.getDay()];
    const routines = await fileSystem.getRoutine(todayDayName);
    const routineContainer = document.querySelector('.routine-grid');

    if (routineContainer) {
      routineContainer.innerHTML = '';
      
      if (routines.length === 0) {
        routineContainer.innerHTML = `<div style="grid-column: span 2; color: var(--text-muted); font-style: italic; font-size: 0.9rem;">No routine items for today.</div>`;
      } else {
        routines.forEach((item, index) => {
          let iconName = 'sparkles';
          let bgStyle = '';
          
          const activityLower = item.activity.toLowerCase();
          if (activityLower.includes('hygiene') || activityLower.includes('bath') || activityLower.includes('shower')) {
            iconName = 'bath';
          } else if (activityLower.includes('pet') || activityLower.includes('litter') || activityLower.includes('dog') || activityLower.includes('cat') || activityLower.includes('feed')) {
            iconName = 'paw-print';
            bgStyle = 'background-color: rgba(102, 89, 120, 0.08); color: var(--secondary);';
          } else if (activityLower.includes('medicine') || activityLower.includes('pill') || activityLower.includes('pharmacy') || activityLower.includes('refill')) {
            iconName = 'pill';
            bgStyle = 'background-color: rgba(186, 26, 26, 0.08); color: var(--error);';
          } else if (activityLower.includes('timesheet') || activityLower.includes('log') || activityLower.includes('report') || activityLower.includes('bill')) {
            iconName = 'file-text';
            bgStyle = 'background-color: rgba(102, 92, 94, 0.08); color: var(--primary);';
          }

          const percentage = item.completed ? 100 : 0;
          const statusText = item.completed ? 'Completed' : 'In progress';

          const itemHtml = `
            <div class="routine-item" style="cursor: pointer;" data-index="${index}">
              <div class="routine-icon" style="${bgStyle}"><i data-lucide="${iconName}"></i></div>
              <div class="routine-details">
                <div class="routine-title" style="${item.completed ? 'text-decoration: line-through; color: var(--text-muted); font-weight: 500;' : 'font-weight: 600;'}">${item.activity}</div>
                <div class="routine-status" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">${statusText}</div>
                <div class="progress-bar-container">
                  <div class="progress-bar" style="width: ${percentage}%; ${item.completed ? 'background-color: var(--secondary);' : 'background-color: var(--tertiary);'}"></div>
                </div>
              </div>
            </div>
          `;
          routineContainer.insertAdjacentHTML('beforeend', itemHtml);
        });

        // Bind click handler to toggle completed
        routineContainer.querySelectorAll('.routine-item').forEach(el => {
          el.addEventListener('click', async () => {
            const idx = parseInt(el.getAttribute('data-index'));
            routines[idx].completed = !routines[idx].completed;
            await fileSystem.saveRoutine(todayDayName, routines);
            this.showToast(`Routine: "${routines[idx].activity}" updated!`);
            await this.loadDashboardData();
          });
        });
      }
    }

    // 5. Render Upcoming Grid (Load future events from combined list)
    const upcomingContainer = document.getElementById('dashboard-upcoming');
    upcomingContainer.innerHTML = '';

    const futureEvents = combinedEvents.filter(evt => {
      const evtDate = evt.startDateTime.split('T')[0];
      return evtDate > todayStr;
    }).slice(0, 3);

    if (futureEvents.length === 0) {
      upcomingContainer.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-muted); font-style: italic; padding: 24px;">No upcoming events.</div>`;
    } else {
      futureEvents.forEach(evt => {
        const start = new Date(evt.startDateTime);
        const optionsDate = { month: 'short', day: 'numeric' };
        const dateStr = start.toLocaleDateString('en-US', optionsDate).toUpperCase();
        
        let headerLabel = dateStr;
        const tom = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const tomorrowStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;
        if (evt.startDateTime.split('T')[0] === tomorrowStr) {
          headerLabel = "TOMORROW";
        }

        const formattedTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const cardHtml = `
          <div class="card upcoming-card">
            <div>
              <div class="upcoming-date">${headerLabel}</div>
              <div class="upcoming-title">${evt.summary}</div>
              <div class="upcoming-subtext">${formattedTime} • ${evt.description || 'No notes.'}</div>
            </div>
            <div class="upcoming-footer">
              <div class="upcoming-icon-wrap" style="${evt.source === 'google' ? 'background-color: #ead9fe; color: var(--secondary);' : ''}">
                <i data-lucide="${evt.source === 'google' ? 'cloud' : 'file-text'}" style="width: 14px; height: 14px;"></i>
              </div>
            </div>
          </div>
        `;
        upcomingContainer.insertAdjacentHTML('beforeend', cardHtml);
      });
    }

    lucide.createIcons();
  }


  // ----------------------------------------------------
  // Daily Journal View Loading & Saving
  // ----------------------------------------------------
  clearJournalEditor() {
    this.currentJournalId = null;
    
    // Hide warning banner
    const banner = document.getElementById('journal-date-warning-banner');
    if (banner) banner.style.display = 'none';
    
    // Set formatted header date to today
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    this.currentJournalDate = dateStr;
    
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    document.getElementById('journal-current-date').textContent = today.toLocaleDateString('en-US', options);

    // Reset editor inputs
    document.getElementById('journal-text-editor').innerHTML = '';
    document.getElementById('work-start-time').value = '';
    document.getElementById('work-end-time').value = '';
    document.getElementById('work-mileage').value = '0';
    document.getElementById('work-client').value = 'John Doe';
    document.getElementById('work-units-badge').textContent = '0';
    
    // Remove active highlights
    document.querySelectorAll('.journal-sidebar-item').forEach(item => {
      item.classList.remove('active');
    });
  }

  async loadJournalEditorToday() {
    this.clearJournalEditor();
    await this.loadPastJournalsSidebar();
  }

  async loadPastJournalsSidebar() {
    const sidebarList = document.getElementById('journal-sidebar-list');
    if (!sidebarList) return;
    
    sidebarList.innerHTML = '<div style="color: var(--text-muted); font-style: italic; font-size: 0.9rem; padding: 8px;">Loading...</div>';
    
    // Fetch last year's entries
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const startDateStr = oneYearAgo.toISOString().split('T')[0];
    const endDateStr = now.toISOString().split('T')[0];
    
    const entries = await fileSystem.getJournalEntriesInRange(startDateStr, endDateStr);
    
    // Sort descending by date, and then sub-sort by id descending to keep newer multiple entries higher
    entries.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.id.localeCompare(a.id);
    });
    
    sidebarList.innerHTML = '';
    if (entries.length === 0) {
      sidebarList.innerHTML = '<div style="color: var(--text-muted); font-style: italic; font-size: 0.9rem; padding: 8px;">No past entries.</div>';
      return;
    }
    
    entries.forEach(entry => {
      // Format date nicely
      const dateObj = new Date(entry.date + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      
      const isActive = entry.id === this.currentJournalId ? 'active' : '';
      
      const itemHtml = `
        <div class="journal-sidebar-item ${isActive}" data-id="${entry.id}">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">${formattedDate}</span>
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">${weekday}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${entry.client || 'No Client'} • ${entry.units || 0} Units • ${entry.mileage || 0} mi
          </div>
        </div>
      `;
      sidebarList.insertAdjacentHTML('beforeend', itemHtml);
    });
    
    // Bind click events
    sidebarList.querySelectorAll('.journal-sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        this.loadJournalEntryById(id, entries);
      });
    });
  }

  async loadJournalEntryById(id, preloadedEntries = null) {
    this.currentJournalId = id;
    const date = id.substring(0, 10);
    this.currentJournalDate = date;
    
    let entry = null;
    if (preloadedEntries) {
      entry = preloadedEntries.find(e => e.id === id);
    } else {
      entry = await fileSystem.getJournalEntryById(id);
    }
    
    const editor = document.getElementById('journal-text-editor');
    const startInput = document.getElementById('work-start-time');
    const endInput = document.getElementById('work-end-time');
    const mileageInput = document.getElementById('work-mileage');
    const clientInput = document.getElementById('work-client');
    
    // Highlight sidebar item
    document.querySelectorAll('.journal-sidebar-item').forEach(item => {
      if (item.getAttribute('data-id') === id) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const dateObj = new Date(date + 'T00:00:00');
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    document.getElementById('journal-current-date').textContent = dateObj.toLocaleDateString('en-US', options);

    // Toggle date warning banner
    const todayStr = new Date().toISOString().split('T')[0];
    const banner = document.getElementById('journal-date-warning-banner');
    if (banner) {
      if (date !== todayStr) {
        banner.style.display = 'flex';
        document.getElementById('journal-warning-date-text').textContent = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } else {
        banner.style.display = 'none';
      }
    }

    if (entry) {
      editor.innerHTML = entry.journalContent || entry.content || '';
      const metadata = entry.metadata || entry;
      startInput.value = metadata.start_time || '';
      endInput.value = metadata.end_time || '';
      mileageInput.value = Math.round(parseFloat(metadata.mileage)) || '0';
      clientInput.value = metadata.client || 'John Doe';
    } else {
      editor.innerHTML = '';
      startInput.value = '';
      endInput.value = '';
      mileageInput.value = '0';
      clientInput.value = 'John Doe';
    }
    
    this.recalculateJournalUnits();
  }


  recalculateJournalUnits() {
    const startVal = document.getElementById('work-start-time').value;
    const endVal = document.getElementById('work-end-time').value;
    const unitsBadge = document.getElementById('work-units-badge');

    if (!startVal || !endVal) {
      unitsBadge.textContent = '0';
      return 0;
    }

    // Calculate time difference
    const startParts = startVal.split(':').map(Number);
    const endParts = endVal.split(':').map(Number);

    const startDate = new Date(2000, 0, 1, startParts[0], startParts[1]);
    const endDate = new Date(2000, 0, 1, endParts[0], endParts[1]);

    let diffMs = endDate - startDate;
    if (diffMs < 0) {
      // Overnight shift adjustment
      diffMs += 24 * 60 * 60 * 1000;
    }

    const diffMinutes = Math.floor(diffMs / 1000 / 60);
    // 1 Unit = 15 minutes
    const units = Math.round(diffMinutes / 15);
    unitsBadge.textContent = units.toString();
    return units;
  }

  async saveJournalToday() {
    const dateStr = this.currentJournalDate || new Date().toISOString().split('T')[0];
    const entryId = this.currentJournalId || `${dateStr}-${Date.now()}`;
    
    const editor = document.getElementById('journal-text-editor');
    const startInput = document.getElementById('work-start-time');
    const endInput = document.getElementById('work-end-time');
    const mileageInput = document.getElementById('work-mileage');
    const clientInput = document.getElementById('work-client');
    
    const startVal = startInput.value;
    const endVal = endInput.value;
    const mileageVal = Math.round(parseFloat(mileageInput.value)) || 0;
    const clientVal = clientInput.value || 'John Doe';
    
    const units = this.recalculateJournalUnits();
    const content = editor.innerHTML.trim();

    if (!content) {
      this.showToast("Please write a journal note first.");
      return;
    }

    const metadata = {
      client: clientVal,
      start_time: startVal,
      end_time: endVal,
      mileage: mileageVal,
      units: units
    };

    await fileSystem.saveJournalEntry(entryId, dateStr, metadata, content);
    this.showToast(`Journal entry saved successfully!`);
    
    // Clear boxes
    this.clearJournalEditor();
    
    // Refresh sidebar to reflect any metadata changes
    await this.loadPastJournalsSidebar();
  }

  async loadJournalHistory() {
    const historyTableBody = document.getElementById('journal-history-table-body');
    historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading past journals...</td></tr>';

    // Read range of 1 year back to today
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    
    const startDateStr = oneYearAgo.toISOString().split('T')[0];
    const endDateStr = now.toISOString().split('T')[0];

    const entries = await fileSystem.getJournalEntriesInRange(startDateStr, endDateStr);

    historyTableBody.innerHTML = '';
    if (entries.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic;">No past journals found.</td></tr>';
      return;
    }

    // Sort descending by date
    entries.sort((a,b) => b.date.localeCompare(a.date));

    entries.forEach(entry => {
      const hours = this.calculateHours(entry.start_time, entry.end_time);
      const row = `
        <tr>
          <td>${entry.date}</td>
          <td>${entry.client}</td>
          <td>${hours} hrs (${entry.start_time || '--'} - ${entry.end_time || '--'})</td>
          <td>${entry.units}</td>
          <td>${entry.mileage} mi</td>
          <td style="text-align: right;">
            <button class="action-icon-btn edit-journal-btn" data-id="${entry.id}" title="Load into Editor"><i data-lucide="edit"></i></button>
          </td>
        </tr>
      `;
      historyTableBody.insertAdjacentHTML('beforeend', row);
    });

    historyTableBody.querySelectorAll('.edit-journal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        
        // Find entry details
        const entry = entries.find(e => e.id === id);
        if (entry) {
          // Switch tab to Notes editor
          document.getElementById('journal-tab-notes').click();
          
          // Populate values
          this.loadJournalEntryById(id, entries);
          this.showToast(`Loaded journal for ${entry.date}`);
        }
      });
    });

    lucide.createIcons();
  }

  calculateHours(start, end) {
    if (!start || !end) return '0.0';
    const startParts = start.split(':').map(Number);
    const endParts = end.split(':').map(Number);
    
    const sDate = new Date(2000, 0, 1, startParts[0], startParts[1]);
    const eDate = new Date(2000, 0, 1, endParts[0], endParts[1]);
    
    let diff = eDate - sDate;
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    
    return (diff / 1000 / 60 / 60).toFixed(1);
  }

  // ----------------------------------------------------
  // Expenses View Loading & Saving
  // ----------------------------------------------------
  async loadExpensesData() {
    const expenses = await fileSystem.getExpenses();
    const tableBody = document.getElementById('expenses-table-body');
    tableBody.innerHTML = '';

    const filterActive = document.querySelector('.filter-btn.active').getAttribute('data-filter');
    const filteredExpenses = expenses.filter(exp => {
      if (filterActive === 'all') return true;
      return exp.status.toLowerCase() === filterActive.toLowerCase();
    });

    // Renders list
    if (filteredExpenses.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); font-style: italic;">No expenses found matching the filter.</td></tr>';
    } else {
      filteredExpenses.forEach(exp => {
        const catClass = `tag-${exp.category.toLowerCase()}`;
        const statusClass = `status-${exp.status.toLowerCase()}`;

        const row = `
          <tr>
            <td>${exp.date}</td>
            <td>${exp.description}</td>
            <td><span class="tag ${catClass}">${exp.category}</span></td>
            <td>$${Number(exp.amount).toFixed(2)}</td>
            <td><span class="pill-status ${statusClass}">${exp.status}</span></td>
          </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
      });
    }

    document.getElementById('expenses-counter-text').textContent = `Showing ${filteredExpenses.length} of ${expenses.length} transactions`;

    // Calculate Week/Month totals
    let weeklyTotal = 0.0;
    let monthlyTotal = 0.0;

    const now = new Date();
    const oneWeekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    expenses.forEach(exp => {
      const expDate = new Date(exp.date);
      const amt = Number(exp.amount) || 0.0;

      // Weekly check
      if (expDate >= oneWeekAgo && expDate <= now) {
        weeklyTotal += amt;
      }
      // Monthly check
      if (expDate.getMonth() === thisMonth && expDate.getFullYear() === thisYear) {
        monthlyTotal += amt;
      }
    });

    document.getElementById('expense-total-week').textContent = `$${weeklyTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('expense-total-month').textContent = `$${monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // Progress bar for budget
    const targetBudget = 5000; // Mock target budget
    const percentage = Math.min(Math.round((monthlyTotal / targetBudget) * 100), 100);
    document.getElementById('expense-budget-percentage').textContent = `${percentage}% of monthly budget ($${targetBudget.toLocaleString()})`;
    document.getElementById('expense-budget-bar').style.width = `${percentage}%`;

    lucide.createIcons();
  }

  async recordNewExpense() {
    const desc = document.getElementById('exp-desc').value.trim();
    const category = document.getElementById('exp-category').value;
    const amount = parseFloat(document.getElementById('exp-amount').value) || 0.0;
    const date = document.getElementById('exp-date').value;

    if (!desc || amount <= 0 || !date) {
      this.showToast("Please fill in all details with valid inputs.");
      return;
    }

    await fileSystem.addExpense({
      date,
      description: desc,
      category,
      amount,
      status: 'Paid'
    });

    // Close Modal and Refresh
    document.getElementById('add-expense-modal').classList.remove('active');
    this.showToast("Expense recorded!");
    await this.loadExpensesData();
  }

  // ----------------------------------------------------
  // Billing Generator: Calendar rendering & Range select
  // ----------------------------------------------------
  renderBillingCalendars() {
    this.renderMonthCalendar(this.billingCalMonth1, 'billing-month-name-1', 'billing-calendar-grid-1');
    this.renderMonthCalendar(this.billingCalMonth2, 'billing-month-name-2', 'billing-calendar-grid-2');
    this.updateRangeSelectionText();
  }

  renderMonthCalendar(monthDate, nameElId, gridElId) {
    const nameEl = document.getElementById(nameElId);
    const gridEl = document.getElementById(gridElId);
    gridEl.innerHTML = '';

    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    
    // Set Header Month/Year
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    nameEl.textContent = monthName;

    // Get first day of month (0 = Sunday, etc.) and number of days
    const firstDayIndex = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();

    // Fill empty offset cells
    for (let i = 0; i < firstDayIndex; i++) {
      gridEl.insertAdjacentHTML('beforeend', '<span class="calendar-cell empty"></span>');
    }

    // Populate calendar cells
    for (let day = 1; day <= numDays; day++) {
      const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDate = new Date(cellDateStr + 'T00:00:00'); // Force local midnight parsing

      let classes = 'calendar-cell';
      if (this.selectedStartDate && cellDateStr === this.selectedStartDate) {
        classes += ' selected';
      } else if (this.selectedEndDate && cellDateStr === this.selectedEndDate) {
        classes += ' selected';
      } else if (this.selectedStartDate && this.selectedEndDate) {
        const start = new Date(this.selectedStartDate + 'T00:00:00');
        const end = new Date(this.selectedEndDate + 'T00:00:00');
        if (cellDate > start && cellDate < end) {
          classes += ' in-range';
        }
      }

      const cellHtml = `<span class="${classes}" data-date="${cellDateStr}">${day}</span>`;
      gridEl.insertAdjacentHTML('beforeend', cellHtml);
    }

    // Bind click handlers to calendar cells
    gridEl.querySelectorAll('.calendar-cell:not(.empty)').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.getAttribute('data-date');
        this.selectBillingDate(dateStr);
      });
    });
  }

  selectBillingDate(dateStr) {
    if (!this.selectedStartDate || (this.selectedStartDate && this.selectedEndDate)) {
      // First click or reset
      this.selectedStartDate = dateStr;
      this.selectedEndDate = null;
    } else {
      // Second click: check range order
      if (dateStr >= this.selectedStartDate) {
        this.selectedEndDate = dateStr;
      } else {
        this.selectedEndDate = this.selectedStartDate;
        this.selectedStartDate = dateStr;
      }
    }
    this.renderBillingCalendars();
  }

  updateRangeSelectionText() {
    const textEl = document.getElementById('billing-range-selection-text');
    if (!this.selectedStartDate) {
      textEl.textContent = 'Select start date';
    } else if (!this.selectedEndDate) {
      textEl.textContent = `Billing starts: ${this.selectedStartDate} (select end)`;
    } else {
      textEl.textContent = `Selected: ${this.selectedStartDate} to ${this.selectedEndDate}`;
    }
  }

  async compileBillingReport() {
    if (!this.selectedStartDate || !this.selectedEndDate) {
      this.showToast("Please select a date range first.");
      return;
    }

    const entries = await fileSystem.getJournalEntriesInRange(this.selectedStartDate, this.selectedEndDate);
    const tableBody = document.getElementById('compiled-report-table-body');
    tableBody.innerHTML = '';

    let totalHrsVal = 0.0;
    let totalUnitsVal = 0;
    let totalMileageVal = 0.0;

    if (entries.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); font-style: italic;">No journal data found in the selected range. Make sure to log and save journal records.</td></tr>';
      document.getElementById('compiled-report-card').style.display = 'block';
      this.updateReportTotals(0, 0, 0);
      return;
    }

    entries.forEach(entry => {
      const hours = parseFloat(this.calculateHours(entry.start_time, entry.end_time)) || 0.0;
      const units = entry.units || 0;
      const mileage = entry.mileage || 0.0;

      totalHrsVal += hours;
      totalUnitsVal += units;
      totalMileageVal += mileage;

      const row = `
        <tr>
          <td>${entry.date}</td>
          <td>${entry.client}</td>
          <td>${entry.start_time || '--:--'} - ${entry.end_time || '--:--'}</td>
          <td>${hours.toFixed(1)} hrs</td>
          <td>${units}</td>
          <td>${mileage.toFixed(1)} mi</td>
        </tr>
      `;
      tableBody.insertAdjacentHTML('beforeend', row);
    });

    this.updateReportTotals(totalHrsVal, totalUnitsVal, totalMileageVal);
    document.getElementById('compiled-report-card').style.display = 'block';
    
    // Smooth scroll down to compiled report card
    document.getElementById('compiled-report-card').scrollIntoView({ behavior: 'smooth' });
    this.showToast("Billing Report Compiled!");
  }

  updateReportTotals(hours, units, mileage) {
    document.getElementById('compiled-total-hours').textContent = `${hours.toFixed(1)} hrs`;
    document.getElementById('compiled-total-units').textContent = `${units} units`;
    document.getElementById('compiled-total-mileage').textContent = `${mileage.toFixed(1)} mi`;
  }

  // PURE JS DOWNLOADS / EXPORTS
  downloadCSVReport() {
    const table = document.getElementById('compiled-report-card');
    if (!table || table.style.display === 'none') return;

    let csv = [];
    csv.push("Date,Client,Timeslot,Hours,DODD Units,Mileage");

    const rows = document.querySelectorAll('#compiled-report-table-body tr');
    rows.forEach(tr => {
      const cols = tr.querySelectorAll('td');
      if (cols.length >= 6) {
        const rowData = Array.from(cols).map(c => `"${c.textContent.trim()}"`);
        csv.push(rowData.join(","));
      }
    });

    // Add totals row
    const hrsTot = document.getElementById('compiled-total-hours').textContent;
    const uniTot = document.getElementById('compiled-total-units').textContent;
    const milTot = document.getElementById('compiled-total-mileage').textContent;
    csv.push(`"TOTALS","","","${hrsTot}","${uniTot}","${milTot}"`);

    const csvContent = "data:text/csv;charset=utf-8," + csv.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `billing-report-${this.selectedStartDate}-to-${this.selectedEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("CSV Download started!");
  }

  printPDFReport() {
    const startStr = this.selectedStartDate;
    const endStr = this.selectedEndDate;
    const totalHours = document.getElementById('compiled-total-hours').textContent;
    const totalUnits = document.getElementById('compiled-total-units').textContent;
    const totalMileage = document.getElementById('compiled-total-mileage').textContent;

    // Gather table content
    let tableRowsHtml = '';
    const rows = document.querySelectorAll('#compiled-report-table-body tr');
    rows.forEach(tr => {
      tableRowsHtml += `<tr>${tr.innerHTML}</tr>`;
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Care Billing Summary - ${startStr} to ${endStr}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; padding: 40px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #534863; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #534863; }
          .date { font-size: 14px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background-color: #f7f1fe; text-align: left; padding: 12px; font-size: 13px; text-transform: uppercase; border-bottom: 1px solid #ddd; }
          td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
          .totals-row { font-weight: bold; background-color: #fcfbfd; border-top: 2px solid #ddd; }
          .footer { text-align: center; font-size: 12px; color: #999; margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Vanessa's Care Assistant</div>
            <div style="font-size:14px; color:#555; margin-top:4px;">Billing Summary & Hours Report</div>
          </div>
          <div style="text-align: right;">
            <div class="date">Range: <strong>${startStr}</strong> to <strong>${endStr}</strong></div>
            <div class="date" style="margin-top:4px;">Generated: ${new Date().toLocaleDateString()}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Timeslot</th>
              <th>Hours</th>
              <th>Units (DODD)</th>
              <th>Mileage</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
            <tr class="totals-row">
              <td colspan="3">TOTALS</td>
              <td>${totalHours}</td>
              <td>${totalUnits}</td>
              <td>${totalMileage}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 40px; display: flex; gap: 40px;">
          <div>
            <span style="font-size: 13px; color: #666;">Provider Signature:</span>
            <div style="width: 250px; border-bottom: 1px solid #666; margin-top: 30px;"></div>
          </div>
          <div>
            <span style="font-size: 13px; color: #666;">Date Signed:</span>
            <div style="width: 150px; border-bottom: 1px solid #666; margin-top: 30px;"></div>
          </div>
        </div>
        
        <div class="footer">
          Generated via Vanessa's Concierge SPA - Capstone Project.
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // ----------------------------------------------------
  // Configuration Settings UI
  // ----------------------------------------------------
  loadSettingsUI() {
    const key = localStorage.getItem('gemini_api_key') || '';
    document.getElementById('setting-gemini-key').value = key;
    this.updateGeminiBadge(key);

    const clientID = localStorage.getItem('google_client_id') || '';
    document.getElementById('setting-google-id').value = clientID;
    this.updateGoogleBadge();

    // Load Firebase Config in settings textarea
    document.getElementById('setting-firebase-config').value = localStorage.getItem('firebase_config') || '';

    this.updateFirebaseUI();
  }

  updateGeminiBadge(key) {
    const badge = document.getElementById('gemini-status-badge');
    if (key) {
      badge.className = 'status-badge connected';
      badge.innerHTML = '<i data-lucide="check"></i> API Key Configured';
    } else {
      badge.className = 'status-badge disconnected';
      badge.innerHTML = '<i data-lucide="alert-triangle"></i> Not Configured';
    }
    lucide.createIcons();
  }

  updateGoogleBadge() {
    const badge = document.getElementById('google-status-badge');
    const loginBtn = document.getElementById('setting-google-login-btn');
    const logoutBtn = document.getElementById('setting-google-logout-btn');

    if (!googleAPI.clientId) {
      badge.className = 'status-badge disconnected';
      badge.innerHTML = '<i data-lucide="link-2-off"></i> Mock/Local Mode Active';
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'none';
    } else if (googleAPI.isAuthorized()) {
      badge.className = 'status-badge connected';
      badge.innerHTML = '<i data-lucide="link"></i> Connected to Google';
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-flex';
    } else {
      badge.className = 'status-badge disconnected';
      badge.innerHTML = '<i data-lucide="link-2-off"></i> Google Disconnected';
      loginBtn.style.display = 'inline-flex';
      logoutBtn.style.display = 'none';
    }
    lucide.createIcons();
  }

  updateFirebaseUI() {
    const badge = document.getElementById('firebase-status-badge');
    const userStatus = document.getElementById('firebase-user-status');
    const loginRow = document.getElementById('firebase-login-row');
    const logoutRow = document.getElementById('firebase-logout-row');
    const banner = document.getElementById('demo-mode-banner');

    if (!badge) return;

    if (fileSystem.cloudAvailable) {
      badge.className = 'status-badge connected';
      badge.innerHTML = '<i data-lucide="check"></i> Cloud Sync Active';
      userStatus.textContent = `Logged in as: ${fileSystem.currentUser.email}`;
      
      loginRow.style.display = 'none';
      logoutRow.style.display = 'flex';
      banner.style.display = 'none';
    } else {
      badge.className = 'status-badge disconnected';
      badge.innerHTML = '<i data-lucide="database"></i> Demo/Guest Mode';
      userStatus.textContent = 'Viewing as Guest (LocalStorage)';
      
      loginRow.style.display = 'flex';
      logoutRow.style.display = 'none';
      banner.style.display = 'flex';
    }
    lucide.createIcons();
  }

  // ----------------------------------------------------
  // Bind Event Listeners
  // ----------------------------------------------------
  bindEvents() {
    // 1. Sidebar Nav button clicks
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const pageId = item.getAttribute('data-page');
        this.switchPage(pageId);
      });
    });

    // 2. Daily Journal event updates
    document.getElementById('work-start-time').addEventListener('change', () => this.recalculateJournalUnits());
    document.getElementById('work-end-time').addEventListener('change', () => this.recalculateJournalUnits());
    document.getElementById('journal-save-btn').addEventListener('click', () => this.saveJournalToday());
    document.getElementById('journal-clear-btn').addEventListener('click', () => this.clearJournalEditor());
    document.getElementById('journal-warning-reset-btn').addEventListener('click', () => this.loadJournalEditorToday());



    // 3. Expenses filtering and modals
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await this.loadExpensesData();
      });
    });

    document.getElementById('expense-add-btn').addEventListener('click', () => {
      // Set default date in modal
      document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('add-expense-modal').classList.add('active');
    });

    document.getElementById('expense-modal-close').addEventListener('click', () => {
      document.getElementById('add-expense-modal').classList.remove('active');
    });
    document.getElementById('expense-modal-cancel').addEventListener('click', () => {
      document.getElementById('add-expense-modal').classList.remove('active');
    });
    document.getElementById('expense-modal-save').addEventListener('click', () => this.recordNewExpense());

    // 4. Billing Generator range clicks and compiling
    document.getElementById('billing-cal-prev').addEventListener('click', () => {
      this.billingCalMonth1.setMonth(this.billingCalMonth1.getMonth() - 1);
      this.billingCalMonth2.setMonth(this.billingCalMonth2.getMonth() - 1);
      this.renderBillingCalendars();
    });

    document.getElementById('billing-cal-next').addEventListener('click', () => {
      this.billingCalMonth1.setMonth(this.billingCalMonth1.getMonth() + 1);
      this.billingCalMonth2.setMonth(this.billingCalMonth2.getMonth() + 1);
      this.renderBillingCalendars();
    });

    document.getElementById('billing-clear-range-btn').addEventListener('click', () => {
      this.selectedStartDate = null;
      this.selectedEndDate = null;
      this.renderBillingCalendars();
      document.getElementById('compiled-report-card').style.display = 'none';
    });

    document.getElementById('billing-compile-btn').addEventListener('click', () => this.compileBillingReport());
    document.getElementById('billing-download-csv-btn').addEventListener('click', () => this.downloadCSVReport());
    document.getElementById('billing-download-pdf-btn').addEventListener('click', () => this.printPDFReport());

    // 5. Settings Actions
    document.getElementById('setting-save-gemini-btn').addEventListener('click', () => {
      const val = document.getElementById('setting-gemini-key').value.trim();
      geminiAgent.setApiKey(val);
      this.updateGeminiBadge(val);
      this.showToast("Gemini API Key Saved!");
    });

    document.getElementById('setting-save-google-btn').addEventListener('click', () => {
      const val = document.getElementById('setting-google-id').value.trim();
      googleAPI.setClientId(val);
      this.updateGoogleBadge();
      this.showToast("Google Client ID Saved!");
    });

    document.getElementById('setting-google-login-btn').addEventListener('click', () => {
      googleAPI.login().catch(err => this.showToast(err.message));
    });

    document.getElementById('setting-google-logout-btn').addEventListener('click', () => {
      googleAPI.logout();
      this.showToast("Logged out of Google.");
    });

    window.addEventListener('google-auth-success', () => {
      this.updateGoogleBadge();
      this.refreshAllData();
      this.showToast("Google login successful!");
    });

    window.addEventListener('google-auth-logout', () => {
      this.updateGoogleBadge();
      this.refreshAllData();
    });



    // 6. Floating AI Input actions
    document.getElementById('ai-chat-send-btn').addEventListener('click', () => this.submitAIChat());
    document.getElementById('ai-chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.submitAIChat();
    });
    document.getElementById('ai-response-close').addEventListener('click', () => {
      document.getElementById('ai-response-bubble').classList.remove('active');
    });

    // 7. Firebase Actions & Auth Events
    window.addEventListener('firebase-auth-change', () => {
      this.updateFirebaseUI();
      this.refreshAllData();
    });

    document.getElementById('setting-firebase-signin-btn').addEventListener('click', () => this.handleFirebaseSignIn());
    document.getElementById('setting-firebase-signout-btn').addEventListener('click', () => this.handleFirebaseSignOut());
    document.getElementById('setting-save-firebase-config-btn').addEventListener('click', () => this.handleSaveFirebaseConfig());

    const bannerLogin = document.getElementById('banner-login-link');
    if (bannerLogin) {
      bannerLogin.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchPage('settings');
        document.getElementById('setting-firebase-email').focus();
      });
    }
  }

  // ----------------------------------------------------
  // Helper Actions
  // ----------------------------------------------------
  showToast(message) {
    const toast = document.getElementById('global-toast-msg');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('active');
      setTimeout(() => toast.classList.remove('active'), 3000);
    }
  }

  async handleFirebaseSignIn() {
    const email = document.getElementById('setting-firebase-email').value.trim();
    const password = document.getElementById('setting-firebase-password').value;

    if (!email || !password) {
      this.showToast("Please enter email and password.");
      return;
    }

    try {
      this.showToast("Signing in...");
      if (window.firebase) {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        this.showToast("Signed in successfully!");
        document.getElementById('setting-firebase-password').value = '';
      } else {
        this.showToast("Firebase SDK not loaded.");
      }
    } catch (e) {
      console.error("Firebase Signin failed:", e);
      this.showToast(`Login failed: ${e.message}`);
    }
  }

  async handleFirebaseSignOut() {
    try {
      if (window.firebase) {
        await firebase.auth().signOut();
        this.showToast("Signed out.");
      }
    } catch (e) {
      console.error("Firebase Signout failed:", e);
      this.showToast(`Sign out failed: ${e.message}`);
    }
  }

  handleSaveFirebaseConfig() {
    const configVal = document.getElementById('setting-firebase-config').value.trim();
    if (!configVal) {
      localStorage.removeItem('firebase_config');
      this.showToast("Reset to default Firebase configuration. Reloading...");
    } else {
      try {
        JSON.parse(configVal);
        localStorage.setItem('firebase_config', configVal);
        this.showToast("Custom Firebase configuration saved! Reloading...");
      } catch (e) {
        this.showToast("Invalid JSON configuration. Please check syntax.");
        return;
      }
    }
    setTimeout(() => location.reload(), 1500);
  }

  // ----------------------------------------------------
  // Client-Side AI Tool Executors Callback Hooks
  // ----------------------------------------------------
  registerAgentCallbacks() {
    const agentCallbacks = {
      // 1. Tool to add checklist items
      addTodoItem: async (args) => {
        const title = args.title;
        const taskId = 'task-' + Date.now();
        const localTask = {
          id: taskId,
          title: title,
          status: 'needsAction',
          created_at: new Date().toISOString().split('T')[0]
        };
        await fileSystem.saveTask(localTask);

        let googleId = '';
        if (googleAPI.isAuthorized()) {
          try {
            const task = await googleAPI.createTask(title);
            googleId = task.id;
          } catch (e) {
            console.warn("Failed to sync with Google Tasks.", e);
          }
        }
        await this.loadDashboardData();
        return { task_id: taskId, google_id: googleId, status: "created", title };
      },

      // 2. Tool to add appointments
      addCalendarEvent: async (args) => {
        const eventId = 'event-' + Date.now();
        const localEvent = {
          id: eventId,
          summary: args.summary,
          description: args.description || '',
          startDateTime: args.startDateTime,
          endDateTime: args.endDateTime,
          completed: false
        };
        await fileSystem.saveEvent(localEvent);

        let googleId = '';
        if (googleAPI.isAuthorized()) {
          try {
            const details = {
              summary: args.summary,
              description: args.description || '',
              startDateTime: args.startDateTime,
              endDateTime: args.endDateTime
            };
            const event = await googleAPI.createCalendarEvent(details);
            googleId = event.id;
          } catch (e) {
            console.warn("Failed to sync with Google Calendar.", e);
          }
        }
        await this.loadDashboardData();
        return { event_id: eventId, google_id: googleId, status: "created", summary: args.summary };
      },

      // 3. Tool to delete appointments
      deleteCalendarEvent: async (args) => {
        const summary = (args.summary || '').toLowerCase();
        
        // Find local event to delete
        const localEvents = await fileSystem.getEvents();
        const localToDelete = localEvents.find(evt => (evt.summary || '').toLowerCase().includes(summary));
        
        // Find Google event to delete if connected
        let googleDeleted = false;
        if (googleAPI.isAuthorized()) {
          try {
            const googleEvents = await googleAPI.listCalendarEvents();
            const googleToDelete = googleEvents.find(evt => (evt.summary || '').toLowerCase().includes(summary));
            if (googleToDelete) {
              await googleAPI.deleteCalendarEvent(googleToDelete.id);
              googleDeleted = true;
            }
          } catch (e) {
            console.warn("Failed to delete from Google Calendar.", e);
          }
        }

        if (localToDelete) {
          await fileSystem.deleteEvent(localToDelete.id);
          await this.loadDashboardData();
          return { status: "deleted_locally_and_google", event_title: localToDelete.summary, google_deleted: googleDeleted };
        } else if (googleDeleted) {
          await this.loadDashboardData();
          return { status: "deleted_google_only", event_title: args.summary };
        } else {
          throw new Error(`No calendar appointment found matching "${args.summary}"`);
        }
      },

      // 4. Tool to fill and log journal entries
      logJournalEntry: async (args) => {
        // We will directly populate the fields and editor in the Journal tab
        this.switchPage('journal');
        
        const editor = document.getElementById('journal-text-editor');
        const startInput = document.getElementById('work-start-time');
        const endInput = document.getElementById('work-end-time');
        const mileageInput = document.getElementById('work-mileage');
        const clientInput = document.getElementById('work-client');

        if (args.start_time) startInput.value = this.convertTimeTo24h(args.start_time);
        if (args.end_time) endInput.value = this.convertTimeTo24h(args.end_time);
        if (args.mileage) mileageInput.value = Math.round(Number(args.mileage)).toString();
        if (args.client) clientInput.value = args.client;
        if (args.notes) editor.innerHTML = args.notes;

        const units = this.recalculateJournalUnits();
        
        // Auto-save the journal log!
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const entryId = `${dateStr}-${Date.now()}`;
        const metadata = {
          client: clientInput.value,
          start_time: startInput.value,
          end_time: endInput.value,
          mileage: Math.round(parseFloat(mileageInput.value)) || 0,
          units: units
        };
        await fileSystem.saveJournalEntry(entryId, dateStr, metadata, editor.innerHTML);

        // Refresh sidebar and set current state
        await this.loadPastJournalsSidebar();
        this.currentJournalId = entryId;
        this.currentJournalDate = dateStr;

        return { status: "logged_and_saved", client: metadata.client, hours: `${startInput.value}-${endInput.value}`, units, mileage: metadata.mileage };
      },

      // 5. Tool to record expense reports
      logExpense: async (args) => {
        const category = args.category || "Supplies";
        const amt = Number(args.amount) || 0.0;
        const desc = args.description || "Misc Supplies";
        
        const todayStr = new Date().toISOString().split('T')[0];
        
        await fileSystem.addExpense({
          date: todayStr,
          description: desc,
          category,
          amount: amt,
          status: 'Paid'
        });

        await this.loadExpensesData();
        return { status: "logged", description: desc, amount: amt, date: todayStr };
      },

      // 6. Tool to retrieve/read calendar appointments
      listCalendarEvents: async () => {
        const localEvents = await fileSystem.getEvents();
        let googleEvents = [];
        if (googleAPI.isAuthorized()) {
          try {
            googleEvents = await googleAPI.listCalendarEvents();
          } catch (e) {
            console.warn("Failed to retrieve Google Calendar events for AI.", e);
          }
        }
        
        // Merge and deduplicate by Google ID or summary + startDateTime
        const combined = [...localEvents];
        googleEvents.forEach(ge => {
          const gSummary = ge.summary || 'Untitled Event';
          const match = combined.some(le => 
            (le.google_event_id === ge.id) || 
            ((le.summary || '').toLowerCase() === gSummary.toLowerCase() && le.startDateTime === ge.startDateTime)
          );
          if (!match) {
            combined.push({
              id: ge.id,
              summary: gSummary,
              description: ge.description || '',
              startDateTime: ge.startDateTime,
              endDateTime: ge.endDateTime,
              completed: false,
              source: 'google'
            });
          }
        });

        // Sort by start datetime
        combined.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
        
        return combined.map(e => ({
          summary: e.summary,
          startDateTime: e.startDateTime,
          endDateTime: e.endDateTime,
          description: e.description || 'No description'
        }));
      },

      // 7. Tool to retrieve/read task checklist items
      listTodoItems: async () => {
        const localTasks = await fileSystem.getTasks();
        let googleTasks = [];
        if (googleAPI.isAuthorized()) {
          try {
            googleTasks = await googleAPI.listTasks();
          } catch (e) {
            console.warn("Failed to retrieve Google tasks for AI.", e);
          }
        }

        const combined = [...localTasks];
        googleTasks.forEach(gt => {
          const gTitle = gt.title || 'Untitled Task';
          const match = combined.some(lt => 
            (lt.google_task_id === gt.id) || 
            ((lt.title || '').toLowerCase() === gTitle.toLowerCase())
          );
          if (!match) {
            combined.push({
              id: gt.id,
              title: gTitle,
              status: gt.status || 'needsAction',
              source: 'google'
            });
          }
        });

        return combined.map(t => ({
          title: t.title,
          status: t.status
        }));
      },

      // 8. Tool to add reminders/alerts
      addReminder: async (args) => {
        const reminderId = 'rem-' + Date.now();
        const localReminder = {
          id: reminderId,
          title: args.title || 'Note',
          text: args.text,
          type: args.type || 'note',
          date: new Date().toISOString().split('T')[0]
        };
        await fileSystem.saveReminder(localReminder);

        // Also push to Google Tasks so the reminder reaches Vanessa's phone during the day
        let syncedToGoogle = false;
        if (googleAPI.isAuthorized()) {
          try {
            await googleAPI.createTask(`Reminder: ${localReminder.title} - ${localReminder.text}`);
            syncedToGoogle = true;
          } catch (e) {
            console.warn("Failed to sync reminder to Google Tasks, kept local copy.", e);
          }
        }

        await this.loadDashboardData();
        return { reminder_id: reminderId, status: "created", title: localReminder.title, text: localReminder.text, synced_to_google_tasks: syncedToGoogle };
      },

      // 9. Tool to list reminders/alerts
      listReminders: async () => {
        const reminders = await fileSystem.getReminders();
        return reminders.map(r => ({
          title: r.title,
          text: r.text,
          type: r.type
        }));
      },

      // 10. Tool to add daily routine items
      addDailyRoutineItem: async (args) => {
        const day = (args.dayOfWeek || 'monday').toLowerCase();
        const activity = args.activity;
        if (!activity) throw new Error("Activity description is required.");
        
        const items = await fileSystem.getRoutine(day);
        const exists = items.some(item => (item.activity || '').toLowerCase() === activity.toLowerCase());
        if (!exists) {
          items.push({ activity, completed: false });
          await fileSystem.saveRoutine(day, items);
        }
        await this.loadDashboardData();
        return { status: "success", dayOfWeek: day, activity, total_items: items.length };
      },

      // 11. Tool to remove daily routine items
      removeDailyRoutineItem: async (args) => {
        const day = (args.dayOfWeek || 'monday').toLowerCase();
        const activity = args.activity;
        if (!activity) throw new Error("Activity description to remove is required.");

        const items = await fileSystem.getRoutine(day);
        const filtered = items.filter(item => !(item.activity || '').toLowerCase().includes(activity.toLowerCase()));
        
        if (items.length !== filtered.length) {
          await fileSystem.saveRoutine(day, filtered);
        }
        await this.loadDashboardData();
        return { status: "success", dayOfWeek: day, activity, total_items: filtered.length, removed: items.length - filtered.length };
      },

      // 12. Tool to list daily routine items
      listDailyRoutine: async (args) => {
        const day = (args.dayOfWeek || 'monday').toLowerCase();
        const items = await fileSystem.getRoutine(day);
        return items.map(item => ({
          activity: item.activity,
          completed: item.completed
        }));
      }
    };

    geminiAgent.registerCallbacks(agentCallbacks);
  }

  // Time conversion utility helper: "09:00 AM" or "9 AM" -> "09:00"
  convertTimeTo24h(timeStr) {
    if (!timeStr) return '';
    // If it's already HH:MM
    if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;

    const match = timeStr.match(/(\d+)(?::(\d+))?\s*(AM|PM)?/i);
    if (!match) return '';

    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // ----------------------------------------------------
  // Floating AI Chat Submission Action
  // ----------------------------------------------------
  async submitAIChat() {
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if (!text) return;

    // Clear input
    input.value = '';

    // Open Response bubble and show loader dots
    const bubble = document.getElementById('ai-response-bubble');
    const bubbleText = document.getElementById('ai-response-text');

    bubbleText.innerHTML = `
      <div class="loader-dots">
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
      </div>
    `;
    bubble.classList.add('active');

    try {
      // Trigger API / Local mock agent call
      const response = await geminiAgent.sendMessage(text);
      
      // Update response bubble text
      bubbleText.innerHTML = this.formatMarkdownText(response.text);

      // Perform notifications for any executed functions
      if (response.actions && response.actions.length > 0) {
        response.actions.forEach(act => {
          this.showToast(`AI executed: ${act.type}`);
        });
        
        // Refresh active page data in case data changed
        await this.refreshPageData(this.activePage);
      }
    } catch (e) {
      console.error(e);
      bubbleText.innerHTML = `<span style="color: var(--error); font-weight: 700;"><i data-lucide="alert-triangle"></i> Error:</span> ${e.message || "Failed to communicate with AI Assistant."}`;
      lucide.createIcons();
    }
  }

  // Simple markdown conversion helper for UI
  formatMarkdownText(mdText) {
    if (!mdText) return '';
    return mdText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}

// Instantiate and start app on page load
window.addEventListener('DOMContentLoaded', () => {
  const app = new AppController();
  window.app = app;
  app.init().catch(err => {
    console.error("Critical app failure during load:", err);
  });
});
