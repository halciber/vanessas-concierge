/**
 * google-api.js
 * Handles Google OAuth authentication and REST calls to Calendar and Tasks APIs.
 * Includes a robust Mock fallback when credentials are not configured or Offline.
 */

class GoogleAPIManager {
  constructor() {
    this.clientId = '';
    this.accessToken = null;
    this.tokenClient = null;
    this.gisLoaded = false;
    
    // Scopes needed for calendar and tasks
    this.scopes = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks';

    // Mock data storage key
    this.mockCalendarKey = 'concierge_mock_calendar';
    this.mockTasksKey = 'concierge_mock_tasks';
  }

  init(clientId) {
    this.clientId = clientId || localStorage.getItem('google_client_id') || '';
    this.accessToken = localStorage.getItem('google_access_token') || null;
    
    // Load Google Identity Services SDK
    this.loadGIS();
    
    // Initialize mock data if empty
    this.initMockData();
  }

  loadGIS() {
    if (window.google && window.google.accounts) {
      this.gisLoaded = true;
      this.initTokenClient();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.gisLoaded = true;
      this.initTokenClient();
    };
    document.head.appendChild(script);
  }

  initTokenClient() {
    if (!this.clientId || !window.google) return;
    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: this.scopes,
        callback: (response) => {
          if (response.error !== undefined) {
            console.error("Google Auth Error:", response);
            return;
          }
          this.accessToken = response.access_token;
          localStorage.setItem('google_access_token', this.accessToken);
          // Trigger a global event to refresh dashboard
          window.dispatchEvent(new Event('google-auth-success'));
        },
      });
    } catch (e) {
      console.error("Error initializing Google Identity Services Token Client:", e);
    }
  }

  setClientId(clientId) {
    this.clientId = clientId;
    localStorage.setItem('google_client_id', clientId);
    this.initTokenClient();
  }

  isAuthorized() {
    return !!this.accessToken;
  }

  async login() {
    if (!this.clientId) {
      throw new Error("No Google Client ID configured. Please set it in Settings.");
    }
    if (!this.tokenClient) {
      this.initTokenClient();
    }
    if (!this.tokenClient) {
      throw new Error("Google GIS client not initialized. Check internet connection.");
    }
    
    // Request permission (forces popup)
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  }

  logout() {
    this.accessToken = null;
    localStorage.removeItem('google_access_token');
    window.dispatchEvent(new Event('google-auth-logout'));
  }

  // ----------------------------------------------------
  // Mock Data Generators for Fallback / Demonstration
  // ----------------------------------------------------
  initMockData() {
    const today = new Date().toISOString().split('T')[0];
    const getRelativeDate = (offsetDays) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return d.toISOString().split('T')[0];
    };

    if (!localStorage.getItem(this.mockCalendarKey)) {
      const defaultEvents = [
        {
          id: 'mock-evt-1',
          summary: 'Morning Vital Checks',
          description: 'Blood pressure & sugar checks for John.',
          start: { dateTime: `${today}T09:00:00` },
          end: { dateTime: `${today}T10:00:00` },
          completed: true
        },
        {
          id: 'mock-evt-2',
          summary: 'Physical Therapy',
          description: 'Dr. Marcus home visit for stretches.',
          start: { dateTime: `${today}T11:30:00` },
          end: { dateTime: `${today}T12:30:00` },
          completed: false
        },
        {
          id: 'mock-evt-3',
          summary: 'Optometrist Appointment',
          description: '10:00 AM • Main St Vision Center',
          start: { dateTime: `${getRelativeDate(1)}T10:00:00` },
          end: { dateTime: `${getRelativeDate(1)}T11:00:00` },
          completed: false
        },
        {
          id: 'mock-evt-4',
          summary: 'Grocery Restock',
          description: 'Focused on fresh organic greens.',
          start: { dateTime: `${getRelativeDate(2)}T14:00:00` },
          end: { dateTime: `${getRelativeDate(2)}T15:00:00` },
          completed: false
        },
        {
          id: 'mock-evt-5',
          summary: 'Social Tea Hour',
          description: 'Community Center Hall B',
          start: { dateTime: `${getRelativeDate(4)}T15:30:00` },
          end: { dateTime: `${getRelativeDate(4)}T17:00:00` },
          completed: false
        }
      ];
      localStorage.setItem(this.mockCalendarKey, JSON.stringify(defaultEvents));
    }

    if (!localStorage.getItem(this.mockTasksKey)) {
      const defaultTasks = [
        { id: 'mock-tsk-1', title: 'Submit weekly meal plan', status: 'needsAction' },
        { id: 'mock-tsk-2', title: 'Update hydration tracker', status: 'needsAction' },
        { id: 'mock-tsk-3', title: 'Coordinate family visit', status: 'needsAction' }
      ];
      localStorage.setItem(this.mockTasksKey, JSON.stringify(defaultTasks));
    }
  }

  // ----------------------------------------------------
  // CALENDAR OPERATIONS (Google API or Mock Fallback)
  // ----------------------------------------------------
  async listCalendarEvents() {
    if (!this.accessToken) {
      // Mock Fallback
      return JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
    }

    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const timeMin = today.toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 401) {
        this.logout();
        return this.listCalendarEvents(); // Recursively call using mock fallback after logout
      }

      const data = await response.json();
      return data.items || [];
    } catch (e) {
      console.warn("Google Calendar fetch failed. Using mock fallback.", e);
      return JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
    }
  }

  async createCalendarEvent(eventDetails) {
    if (!this.accessToken) {
      // Mock Creation
      const mockEvents = JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
      const newEvent = {
        id: 'mock-evt-' + Date.now(),
        summary: eventDetails.summary,
        description: eventDetails.description || '',
        start: { dateTime: eventDetails.startDateTime },
        end: { dateTime: eventDetails.endDateTime },
        completed: false
      };
      mockEvents.push(newEvent);
      // Sort mock events by start time
      mockEvents.sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime));
      localStorage.setItem(this.mockCalendarKey, JSON.stringify(mockEvents));
      return newEvent;
    }

    try {
      const body = {
        summary: eventDetails.summary,
        description: eventDetails.description || '',
        start: { dateTime: eventDetails.startDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end: { dateTime: eventDetails.endDateTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      );

      if (response.status === 401) {
        this.logout();
        throw new Error("Google Session Expired. Re-authenticating.");
      }

      return await response.json();
    } catch (e) {
      console.error("Google Calendar Create failed.", e);
      throw e;
    }
  }

  async deleteCalendarEvent(eventId) {
    if (!this.accessToken || eventId.startsWith('mock-')) {
      // Mock Delete
      let mockEvents = JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
      mockEvents = mockEvents.filter(evt => evt.id !== eventId);
      localStorage.setItem(this.mockCalendarKey, JSON.stringify(mockEvents));
      return true;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (response.status === 401) {
        this.logout();
        throw new Error("Google Session Expired.");
      }

      return response.ok;
    } catch (e) {
      console.error("Google Calendar delete failed.", e);
      throw e;
    }
  }

  async toggleCalendarEventCompleted(eventId, completed) {
    // Note: Google Calendar events don't have a native 'completed' status, so we append a checkmark in the title or store the completed state locally
    const mockEvents = JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
    const eventIndex = mockEvents.findIndex(evt => evt.id === eventId);
    if (eventIndex !== -1) {
      mockEvents[eventIndex].completed = completed;
      localStorage.setItem(this.mockCalendarKey, JSON.stringify(mockEvents));
      return mockEvents[eventIndex];
    }
    
    // For live Google Events, we will track completion state in a localStorage map indexed by event ID
    const completedMapKey = 'concierge_completed_events_map';
    const completedMap = JSON.parse(localStorage.getItem(completedMapKey)) || {};
    completedMap[eventId] = completed;
    localStorage.setItem(completedMapKey, JSON.stringify(completedMap));
    return { id: eventId, completed };
  }

  async getEventCompletionState(eventId) {
    if (eventId.startsWith('mock-')) {
      const mockEvents = JSON.parse(localStorage.getItem(this.mockCalendarKey)) || [];
      const evt = mockEvents.find(e => e.id === eventId);
      return evt ? !!evt.completed : false;
    }
    const completedMapKey = 'concierge_completed_events_map';
    const completedMap = JSON.parse(localStorage.getItem(completedMapKey)) || {};
    return !!completedMap[eventId];
  }

  // ----------------------------------------------------
  // TASKS OPERATIONS (Google API or Mock Fallback)
  // ----------------------------------------------------
  async listTasks() {
    if (!this.accessToken) {
      // Mock Fallback
      return JSON.parse(localStorage.getItem(this.mockTasksKey)) || [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 401) {
        this.logout();
        return this.listTasks();
      }

      const data = await response.json();
      return data.items || [];
    } catch (e) {
      console.warn("Google Tasks fetch failed. Using mock fallback.", e);
      return JSON.parse(localStorage.getItem(this.mockTasksKey)) || [];
    }
  }

  async createTask(title) {
    if (!this.accessToken) {
      // Mock Creation
      const mockTasks = JSON.parse(localStorage.getItem(this.mockTasksKey)) || [];
      const newTask = {
        id: 'mock-tsk-' + Date.now(),
        title: title,
        status: 'needsAction'
      };
      mockTasks.push(newTask);
      localStorage.setItem(this.mockTasksKey, JSON.stringify(mockTasks));
      return newTask;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/@default/tasks`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ title: title, status: 'needsAction' })
        }
      );

      if (response.status === 401) {
        this.logout();
        throw new Error("Google Session Expired.");
      }

      return await response.json();
    } catch (e) {
      console.error("Google Tasks Create failed.", e);
      throw e;
    }
  }

  async updateTaskStatus(taskId, completed) {
    const status = completed ? 'completed' : 'needsAction';

    if (!this.accessToken || taskId.startsWith('mock-')) {
      // Mock Update
      const mockTasks = JSON.parse(localStorage.getItem(this.mockTasksKey)) || [];
      const taskIndex = mockTasks.findIndex(tsk => tsk.id === taskId);
      if (taskIndex !== -1) {
        mockTasks[taskIndex].status = status;
        localStorage.setItem(this.mockTasksKey, JSON.stringify(mockTasks));
        return mockTasks[taskIndex];
      }
      return null;
    }

    try {
      // Get the full task representation first (required by patch/update API)
      const getResponse = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`,
        {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        }
      );
      const task = await getResponse.json();
      task.status = status;
      if (completed) {
        task.completed = new Date().toISOString();
      } else {
        delete task.completed;
      }

      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(task)
        }
      );

      if (response.status === 401) {
        this.logout();
        throw new Error("Google Session Expired.");
      }

      return await response.json();
    } catch (e) {
      console.error("Google Tasks status update failed.", e);
      throw e;
    }
  }

  async deleteTask(taskId) {
    if (!this.accessToken || taskId.startsWith('mock-')) {
      // Mock Delete
      let mockTasks = JSON.parse(localStorage.getItem(this.mockTasksKey)) || [];
      mockTasks = mockTasks.filter(tsk => tsk.id !== taskId);
      localStorage.setItem(this.mockTasksKey, JSON.stringify(mockTasks));
      return true;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      if (response.status === 401) {
        this.logout();
        throw new Error("Google Session Expired.");
      }

      return response.ok;
    } catch (e) {
      console.error("Google Tasks delete failed.", e);
      throw e;
    }
  }
}

// Export singleton instance
const googleAPI = new GoogleAPIManager();
window.googleAPI = googleAPI;
