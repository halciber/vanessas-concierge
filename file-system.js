/**
 * file-system.js
 * Manages local file storage using the File System Access API.
 * Provides fallback to LocalStorage if the API is unsupported or access is denied.
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCBel0QehveOEeocK5Mf3T2scZJA5ij17Y",
  authDomain: "vanessa-s-concierge.firebaseapp.com",
  projectId: "vanessa-s-concierge",
  storageBucket: "vanessa-s-concierge.firebasestorage.app",
  messagingSenderId: "1057164650739",
  appId: "1:1057164650739:web:5b402b4c84b60fc7dcef86",
  measurementId: "G-ZMEB0PJLSY"
};

class FileSystemManager {
  constructor() {
    this.serverAvailable = false;
    this.db = null;
    this.currentUser = null;
  }

  // Initialize Firebase and Auth listener
  async init() {
    const savedConfigStr = localStorage.getItem('firebase_config');
    let firebaseConfig = DEFAULT_FIREBASE_CONFIG;
    if (savedConfigStr) {
      try {
        firebaseConfig = JSON.parse(savedConfigStr);
      } catch (e) {
        console.error("Failed to parse custom Firebase configuration", e);
      }
    }

    try {
      if (window.firebase) {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        this.db = firebase.firestore();
        
        // Listen for authentication changes
        firebase.auth().onAuthStateChanged(user => {
          this.currentUser = user;
          console.log("Firebase Auth State Changed:", user ? user.email : "Guest/Demo Mode");
          // Dispatch global event for app.js to reload UI
          window.dispatchEvent(new CustomEvent('firebase-auth-change', { detail: { user } }));
        });
      } else {
        console.warn("Firebase SDK not loaded. App will run in Local/Demo Mode.");
      }
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
    }

    // Check if python server is running (fallback only)
    try {
      const resp = await fetch('/api/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathArray: ['tasks'] })
      });
      if (resp.status === 200) {
        this.serverAvailable = true;
        console.log("Connected to Concierge Python server.");
      }
    } catch (e) {
      this.serverAvailable = false;
    }
  }

  get cloudAvailable() {
    return !!(this.db && this.currentUser);
  }

  get userDocRef() {
    if (!this.cloudAvailable) return null;
    return this.db.collection('users').doc(this.currentUser.uid);
  }

  // Helper: List MD files in a directory (for LocalStorage/Python server fallback)
  async listFiles(pathArray) {
    if (this.serverAvailable) {
      try {
        const resp = await fetch('/api/list-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathArray })
        });
        const data = await resp.json();
        return data.files || [];
      } catch (e) {
        console.warn("Failed to list files, falling back to localStorage", e);
      }
    }

    // Fallback to localStorage keys
    const prefix = `local_fs:${pathArray.join('/')}/`;
    const files = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(prefix)) {
        files.push(key.replace(prefix, ''));
      }
    }
    return files;
  }

  // Helper: Read file text content (for LocalStorage/Python server fallback)
  async readTextFile(pathArray, filename) {
    if (this.serverAvailable) {
      try {
        const resp = await fetch(`/data/${pathArray.join('/')}/${filename}`, {
          cache: 'no-store'
        });
        if (resp.status === 200) {
          return await resp.text();
        }
      } catch (e) {
        console.warn(`Failed to read file ${filename} from server, falling back to localStorage`, e);
      }
    }

    const key = `local_fs:${pathArray.join('/')}/${filename}`;
    return localStorage.getItem(key) || null;
  }

  // Helper: Write file text content (for LocalStorage/Python server fallback)
  async writeTextFile(pathArray, filename, content) {
    if (this.serverAvailable) {
      try {
        const resp = await fetch('/api/write-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathArray, filename, content })
        });
        if (resp.status === 200) return;
      } catch (e) {
        console.warn("Failed to write file to server, falling back to localStorage", e);
      }
    }

    const key = `local_fs:${pathArray.join('/')}/${filename}`;
    localStorage.setItem(key, content);
  }

  // Helper: Delete file (for LocalStorage/Python server fallback)
  async deleteFile(pathArray, filename) {
    if (this.serverAvailable) {
      try {
        const resp = await fetch('/api/delete-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathArray, filename })
        });
        if (resp.status === 200) return;
      } catch (e) {
        console.warn("Failed to delete file from server, falling back to localStorage", e);
      }
    }

    const key = `local_fs:${pathArray.join('/')}/${filename}`;
    localStorage.removeItem(key);
  }

  // YAML frontmatter helper parser
  parseMarkdownWithFrontmatter(text) {
    if (!text) return { metadata: {}, content: "" };
    const regex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = text.match(regex);
    if (!match) {
      return { metadata: {}, content: text };
    }

    const yamlText = match[1];
    const content = match[2];
    const metadata = {};

    yamlText.split('\n').forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim();
        
        if (val.startsWith('"') && val.endsWith('"')) {
          metadata[key] = val.slice(1, -1);
        } else if (!isNaN(val) && val !== '') {
          metadata[key] = Number(val);
        } else if (val === 'true') {
          metadata[key] = true;
        } else if (val === 'false') {
          metadata[key] = false;
        } else {
          metadata[key] = val;
        }
      }
    });

    return { metadata, content };
  }

  // YAML frontmatter generator
  generateMarkdownWithFrontmatter(metadata, content) {
    let yaml = "---\n";
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        yaml += `${key}: "${value}"\n`;
      } else {
        yaml += `${key}: ${value}\n`;
      }
    }
    yaml += "---\n";
    return yaml + content;
  }

  // ----------------------------------------------------
  // Journal Operations
  // ----------------------------------------------------
  async getJournalEntry(dateString) {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('journals')
          .where('date', '==', dateString)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          return {
            id: doc.id,
            metadata: {
              client: data.client || "John Doe",
              start_time: data.start_time || "",
              end_time: data.end_time || "",
              mileage: data.mileage || 0.0,
              units: data.units || 0,
              date: data.date || dateString
            },
            content: data.content || ""
          };
        }
        return null;
      } catch (e) {
        console.error("Firestore getJournalEntry failed:", e);
      }
    }

    const files = await this.listFiles(['journal']);
    const dateFiles = files.filter(f => f.startsWith(dateString));
    if (dateFiles.length > 0) {
      const fileContent = await this.readTextFile(['journal'], dateFiles[0]);
      if (fileContent) {
        const parsed = this.parseMarkdownWithFrontmatter(fileContent);
        return {
          id: dateFiles[0].replace('.md', ''),
          ...parsed
        };
      }
    }
    return null;
  }

  async getJournalEntryById(id) {
    if (this.cloudAvailable) {
      try {
        const doc = await this.userDocRef.collection('journals').doc(id).get();
        if (doc.exists) {
          const data = doc.data();
          return {
            id: doc.id,
            metadata: {
              client: data.client || "John Doe",
              start_time: data.start_time || "",
              end_time: data.end_time || "",
              mileage: data.mileage || 0.0,
              units: data.units || 0,
              date: data.date || id.substring(0, 10)
            },
            content: data.content || ""
          };
        }
        return null;
      } catch (e) {
        console.error("Firestore getJournalEntryById failed:", e);
      }
    }

    const fileContent = await this.readTextFile(['journal'], `${id}.md`);
    if (!fileContent) return null;
    const parsed = this.parseMarkdownWithFrontmatter(fileContent);
    return {
      id: id,
      ...parsed
    };
  }

  async saveJournalEntry(entryId, dateString, metadata, noteContent) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('journals').doc(entryId).set({
          id: entryId,
          date: dateString,
          client: metadata.client || "General Client",
          start_time: metadata.start_time || "",
          end_time: metadata.end_time || "",
          mileage: Math.round(Number(metadata.mileage)) || 0,
          units: Number(metadata.units) || 0,
          content: noteContent,
          updated_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        return;
      } catch (e) {
        console.error("Firestore saveJournalEntry failed:", e);
      }
    }

    const fileContent = this.generateMarkdownWithFrontmatter({
      date: dateString,
      client: metadata.client || "General Client",
      start_time: metadata.start_time || "",
      end_time: metadata.end_time || "",
      mileage: Math.round(Number(metadata.mileage)) || 0,
      units: metadata.units || 0,
      ...metadata
    }, noteContent);

    await this.writeTextFile(['journal'], `${entryId}.md`, fileContent);
  }

  async getJournalEntriesInRange(startDateStr, endDateStr) {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('journals')
          .where('date', '>=', startDateStr)
          .where('date', '<=', endDateStr)
          .get();
        const entries = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          entries.push({
            id: doc.id,
            date: data.date || doc.id.substring(0, 10),
            client: data.client || "General Client",
            start_time: data.start_time || "",
            end_time: data.end_time || "",
            mileage: Math.round(Number(data.mileage)) || 0,
            units: data.units || 0,
            journalContent: data.content || ""
          });
        });
        return entries.sort((a, b) => a.date.localeCompare(b.date));
      } catch (e) {
        console.error("Firestore getJournalEntriesInRange failed:", e);
      }
    }

    const entries = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    const files = (await this.listFiles(['journal'])).filter(file => {
      const entryDate = new Date(file.substring(0, 10));
      return entryDate >= start && entryDate <= end;
    });
    const texts = await Promise.all(files.map(file => this.readTextFile(['journal'], file)));
    files.forEach((file, i) => {
      const text = texts[i];
      if (text) {
        const parsed = this.parseMarkdownWithFrontmatter(text);
        entries.push({
          id: file.replace('.md', ''),
          date: file.substring(0, 10),
          ...parsed.metadata,
          journalContent: parsed.content
        });
      }
    });
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ----------------------------------------------------
  // Expenses Operations
  // ----------------------------------------------------
  async getExpenses() {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('expenses').orderBy('date', 'desc').get();
        const expenses = [];
        snapshot.forEach(doc => {
          expenses.push(doc.data());
        });
        return expenses;
      } catch (e) {
        console.error("Firestore getExpenses failed:", e);
      }
    }

    const fileContent = await this.readTextFile(['expenses'], 'expenses.json');
    if (!fileContent) return [];
    try {
      return JSON.parse(fileContent);
    } catch (e) {
      console.error("Failed to parse expenses.json", e);
      return [];
    }
  }

  async saveExpenses(expensesList) {
    if (this.cloudAvailable) {
      try {
        const batch = this.db.batch();
        for (const exp of expensesList) {
          const docRef = this.userDocRef.collection('expenses').doc(exp.id);
          batch.set(docRef, exp);
        }
        await batch.commit();
        return;
      } catch (e) {
        console.error("Firestore saveExpenses failed:", e);
      }
    }

    const jsonStr = JSON.stringify(expensesList, null, 2);
    await this.writeTextFile(['expenses'], 'expenses.json', jsonStr);

    let markdown = `# Expense Log\n\n`;
    markdown += `| Date | Description | Category | Amount |\n`;
    markdown += `|------|-------------|----------|--------|\n`;
    expensesList.forEach(exp => {
      markdown += `| ${exp.date} | ${exp.description} | ${exp.category} | $${Number(exp.amount).toFixed(2)} |\n`;
    });
    await this.writeTextFile(['expenses'], 'expenses.md', markdown);
  }

  async addExpense(expense) {
    const newExpense = {
      id: expense.id || Date.now().toString(),
      date: expense.date || new Date().toISOString().split('T')[0],
      description: expense.description || "",
      category: expense.category || "Services",
      amount: Number(expense.amount) || 0.0,
      status: expense.status || "Paid"
    };

    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('expenses').doc(newExpense.id).set(newExpense);
        return await this.getExpenses();
      } catch (e) {
        console.error("Firestore addExpense failed:", e);
      }
    }

    const expenses = await this.getExpenses();
    expenses.push(newExpense);
    expenses.sort((a, b) => b.date.localeCompare(a.date));
    await this.saveExpenses(expenses);
    return expenses;
  }

  // ----------------------------------------------------
  // Tasks Operations
  // ----------------------------------------------------
  async getTasks() {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('tasks').get();
        const tasks = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          tasks.push({
            id: doc.id,
            title: data.title,
            status: data.status || 'needsAction',
            created_at: data.created_at,
            completed_at: data.completed_at || null,
            description: data.description || `# Task: ${data.title}`
          });
        });

        // Initialize defaults if empty in cloud
        if (tasks.length === 0) {
          const defaultTasks = [
            { id: 'task-def-1', title: 'Submit weekly meal plan', status: 'needsAction', created_at: new Date().toISOString().split('T')[0] },
            { id: 'task-def-2', title: 'Update hydration tracker', status: 'needsAction', created_at: new Date().toISOString().split('T')[0] },
            { id: 'task-def-3', title: 'Coordinate family visit', status: 'needsAction', created_at: new Date().toISOString().split('T')[0] }
          ];
          for (const t of defaultTasks) {
            await this.saveTask(t);
            tasks.push({ ...t, description: `# Task: ${t.title}` });
          }
        }
        return tasks;
      } catch (e) {
        console.error("Firestore getTasks failed:", e);
      }
    }

    const tasks = [];
    const files = await this.listFiles(['tasks']);
    const texts = await Promise.all(files.map(file => this.readTextFile(['tasks'], file)));
    files.forEach((file, i) => {
      const text = texts[i];
      if (text) {
        const parsed = this.parseMarkdownWithFrontmatter(text);
        tasks.push({
          id: file.replace('.md', ''),
          ...parsed.metadata,
          description: parsed.content
        });
      }
    });
    
    if (tasks.length === 0) {
      const defaultTasks = [
        { id: 'task-def-1', title: 'Submit weekly meal plan', status: 'needsAction' },
        { id: 'task-def-2', title: 'Update hydration tracker', status: 'needsAction' },
        { id: 'task-def-3', title: 'Coordinate family visit', status: 'needsAction' }
      ];
      for (const t of defaultTasks) {
        await this.saveTask(t);
        tasks.push({ ...t, description: `# Task: ${t.title}` });
      }
    }
    return tasks;
  }

  async saveTask(task) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('tasks').doc(task.id).set({
          id: task.id,
          title: task.title,
          status: task.status || 'needsAction',
          created_at: task.created_at || new Date().toISOString().split('T')[0],
          completed_at: task.completed_at || null,
          description: task.description || `# Task: ${task.title}`
        });
        return;
      } catch (e) {
        console.error("Firestore saveTask failed:", e);
      }
    }

    const filename = `${task.id}.md`;
    const metadata = {
      title: task.title,
      status: task.status || 'needsAction',
      created_at: task.created_at || new Date().toISOString().split('T')[0]
    };
    if (task.completed_at) {
      metadata.completed_at = task.completed_at;
    }
    const markdownContent = `# Task: ${task.title}\n\nCreated on ${metadata.created_at}`;
    const fileContent = this.generateMarkdownWithFrontmatter(metadata, markdownContent);
    await this.writeTextFile(['tasks'], filename, fileContent);
  }

  async deleteTask(taskId) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('tasks').doc(taskId).delete();
        return;
      } catch (e) {
        console.error("Firestore deleteTask failed:", e);
      }
    }

    await this.deleteFile(['tasks'], `${taskId}.md`);
  }

  // ----------------------------------------------------
  // Calendar Events Operations
  // ----------------------------------------------------
  async getEvents() {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('calendar').get();
        const events = [];
        snapshot.forEach(doc => {
          events.push(doc.data());
        });

        // Initialize defaults if empty in cloud
        if (events.length === 0) {
          const today = new Date().toISOString().split('T')[0];
          const getRelativeDate = (offsetDays) => {
            const d = new Date();
            d.setDate(d.getDate() + offsetDays);
            return d.toISOString().split('T')[0];
          };
          const defaultEvents = [
            { id: 'event-def-1', summary: 'Morning Vital Checks', startDateTime: `${today}T09:00:00`, endDateTime: `${today}T10:00:00`, completed: true, description: 'Blood pressure & sugar checks for John.' },
            { id: 'event-def-2', summary: 'Physical Therapy', startDateTime: `${today}T11:30:00`, endDateTime: `${today}T12:30:00`, completed: false, description: 'Dr. Marcus home visit for stretches.' },
            { id: 'event-def-3', summary: 'Optometrist Appointment', startDateTime: `${getRelativeDate(1)}T10:00:00`, endDateTime: `${getRelativeDate(1)}T11:00:00`, completed: false, description: '10:00 AM • Main St Vision Center' },
            { id: 'event-def-4', summary: 'Grocery Restock', startDateTime: `${getRelativeDate(2)}T14:00:00`, endDateTime: `${getRelativeDate(2)}T15:00:00`, completed: false, description: 'Focused on fresh organic greens.' },
            { id: 'event-def-5', summary: 'Social Tea Hour', startDateTime: `${getRelativeDate(4)}T15:30:00`, endDateTime: `${getRelativeDate(4)}T17:00:00`, completed: false, description: 'Community Center Hall B' }
          ];
          for (const e of defaultEvents) {
            await this.saveEvent(e);
            events.push(e);
          }
        }
        return events;
      } catch (e) {
        console.error("Firestore getEvents failed:", e);
      }
    }

    const events = [];
    const files = await this.listFiles(['calendar']);
    const texts = await Promise.all(files.map(file => this.readTextFile(['calendar'], file)));
    files.forEach((file, i) => {
      const text = texts[i];
      if (text) {
        const parsed = this.parseMarkdownWithFrontmatter(text);
        // Body is stored as "# Event: <title>" followed by details; only the details are the description
        const description = (parsed.content || '').trim().replace(/^#.*(\r?\n)*/, '').trim();
        events.push({
          id: file.replace('.md', ''),
          ...parsed.metadata,
          description: description
        });
      }
    });
    
    if (events.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      const getRelativeDate = (offsetDays) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().split('T')[0];
      };
      const defaultEvents = [
        { id: 'event-def-1', summary: 'Morning Vital Checks', startDateTime: `${today}T09:00:00`, endDateTime: `${today}T10:00:00`, completed: true, description: 'Blood pressure & sugar checks for John.' },
        { id: 'event-def-2', summary: 'Physical Therapy', startDateTime: `${today}T11:30:00`, endDateTime: `${today}T12:30:00`, completed: false, description: 'Dr. Marcus home visit for stretches.' },
        { id: 'event-def-3', summary: 'Optometrist Appointment', startDateTime: `${getRelativeDate(1)}T10:00:00`, endDateTime: `${getRelativeDate(1)}T11:00:00`, completed: false, description: '10:00 AM • Main St Vision Center' },
        { id: 'event-def-4', summary: 'Grocery Restock', startDateTime: `${getRelativeDate(2)}T14:00:00`, endDateTime: `${getRelativeDate(2)}T15:00:00`, completed: false, description: 'Focused on fresh organic greens.' },
        { id: 'event-def-5', summary: 'Social Tea Hour', startDateTime: `${getRelativeDate(4)}T15:30:00`, endDateTime: `${getRelativeDate(4)}T17:00:00`, completed: false, description: 'Community Center Hall B' }
      ];
      for (const e of defaultEvents) {
        await this.saveEvent(e);
        events.push(e);
      }
    }
    return events;
  }

  async saveEvent(event) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('calendar').doc(event.id).set({
          id: event.id,
          summary: event.summary,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          completed: event.completed || false,
          description: event.description || 'No description.'
        });
        return;
      } catch (e) {
        console.error("Firestore saveEvent failed:", e);
      }
    }

    const filename = `${event.id}.md`;
    const metadata = {
      summary: event.summary,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      completed: event.completed || false
    };
    const markdownContent = `# Event: ${event.summary}\n\n${event.description || 'No description.'}`;
    const fileContent = this.generateMarkdownWithFrontmatter(metadata, markdownContent);
    await this.writeTextFile(['calendar'], filename, fileContent);
  }

  async deleteEvent(eventId) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('calendar').doc(eventId).delete();
        return;
      } catch (e) {
        console.error("Firestore deleteEvent failed:", e);
      }
    }

    await this.deleteFile(['calendar'], `${eventId}.md`);
  }

  // ----------------------------------------------------
  // Reminders Operations
  // ----------------------------------------------------
  async getReminders() {
    if (this.cloudAvailable) {
      try {
        const snapshot = await this.userDocRef.collection('reminders').get();
        const reminders = [];
        snapshot.forEach(doc => {
          reminders.push(doc.data());
        });

        // Initialize defaults if empty in cloud
        if (reminders.length === 0) {
          const defaultReminders = [
            { id: 'rem-def-1', title: 'Critical Update', text: 'Call pharmacy for renewal.', type: 'critical', date: new Date().toISOString().split('T')[0] },
            { id: 'rem-def-2', title: 'Note', text: 'Mild knee pain reported by John.', type: 'note', date: new Date().toISOString().split('T')[0] }
          ];
          for (const r of defaultReminders) {
            await this.saveReminder(r);
            reminders.push(r);
          }
        }
        return reminders;
      } catch (e) {
        console.error("Firestore getReminders failed:", e);
      }
    }

    const reminders = [];
    const files = await this.listFiles(['reminders']);
    const texts = await Promise.all(files.map(file => this.readTextFile(['reminders'], file)));
    files.forEach((file, i) => {
      const text = texts[i];
      if (text) {
        const parsed = this.parseMarkdownWithFrontmatter(text);
        reminders.push({
          id: file.replace('.md', ''),
          ...parsed.metadata,
          text: parsed.content
        });
      }
    });
    
    if (reminders.length === 0) {
      const defaultReminders = [
        { id: 'rem-def-1', title: 'Critical Update', text: 'Call pharmacy for renewal.', type: 'critical' },
        { id: 'rem-def-2', title: 'Note', text: 'Mild knee pain reported by John.', type: 'note' }
      ];
      for (const r of defaultReminders) {
        await this.saveReminder(r);
        reminders.push(r);
      }
    }
    return reminders;
  }

  async saveReminder(reminder) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('reminders').doc(reminder.id).set({
          id: reminder.id,
          title: reminder.title,
          text: reminder.text,
          type: reminder.type || 'note',
          date: reminder.date || new Date().toISOString().split('T')[0]
        });
        return;
      } catch (e) {
        console.error("Firestore saveReminder failed:", e);
      }
    }

    const filename = `${reminder.id}.md`;
    const metadata = {
      title: reminder.title,
      type: reminder.type || 'note',
      date: reminder.date || new Date().toISOString().split('T')[0]
    };
    const fileContent = this.generateMarkdownWithFrontmatter(metadata, reminder.text);
    await this.writeTextFile(['reminders'], filename, fileContent);
  }

  async deleteReminder(reminderId) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('reminders').doc(reminderId).delete();
        return;
      } catch (e) {
        console.error("Firestore deleteReminder failed:", e);
      }
    }

    await this.deleteFile(['reminders'], `${reminderId}.md`);
  }

  // ----------------------------------------------------
  // Routine Operations
  // ----------------------------------------------------
  async getRoutine(dayOfWeek) {
    if (this.cloudAvailable) {
      try {
        const doc = await this.userDocRef.collection('routine').doc(dayOfWeek.toLowerCase()).get();
        if (doc.exists) {
          return doc.data().items || [];
        }
        
        // Fallback: save and return defaults
        const defaults = this.getDefaultRoutineForDay(dayOfWeek);
        await this.saveRoutine(dayOfWeek, defaults);
        return defaults;
      } catch (e) {
        console.error("Firestore getRoutine failed:", e);
      }
    }

    const filename = `${dayOfWeek.toLowerCase()}.md`;
    const text = await this.readTextFile(['routine'], filename);
    if (!text) {
      const defaults = this.getDefaultRoutineForDay(dayOfWeek);
      await this.saveRoutine(dayOfWeek, defaults);
      return defaults;
    }

    const parsed = this.parseMarkdownWithFrontmatter(text);
    const items = [];
    const lines = parsed.content.split('\n');
    lines.forEach(line => {
      const match = line.match(/^-\s*\[([ xX])\]\s*(.*)$/);
      if (match) {
        items.push({
          activity: match[2].trim(),
          completed: match[1].toLowerCase() === 'x'
        });
      }
    });
    return items;
  }

  async saveRoutine(dayOfWeek, items) {
    if (this.cloudAvailable) {
      try {
        await this.userDocRef.collection('routine').doc(dayOfWeek.toLowerCase()).set({
          day: dayOfWeek,
          items: items
        });
        return;
      } catch (e) {
        console.error("Firestore saveRoutine failed:", e);
      }
    }

    const filename = `${dayOfWeek.toLowerCase()}.md`;
    const metadata = {
      day: dayOfWeek
    };
    let content = `# Routine for ${dayOfWeek}\n\n`;
    items.forEach(item => {
      content += `- [${item.completed ? 'x' : ' '}] ${item.activity}\n`;
    });
    const fileContent = this.generateMarkdownWithFrontmatter(metadata, content);
    await this.writeTextFile(['routine'], filename, fileContent);
  }

  getDefaultRoutineForDay(dayOfWeek) {
    const day = dayOfWeek.toLowerCase();
    const defaults = [];
    if (day === 'monday') {
      defaults.push({ activity: 'Client hygiene', completed: false });
      defaults.push({ activity: 'Clean litter box', completed: true });
    } else if (day === 'wednesday') {
      defaults.push({ activity: 'Refill medicine containers', completed: false });
    } else if (day === 'friday') {
      defaults.push({ activity: 'Submit timesheet logs', completed: false });
      defaults.push({ activity: 'Client hygiene', completed: false });
    } else {
      defaults.push({ activity: 'Client hygiene', completed: false });
      defaults.push({ activity: 'Pet Care (Fed & Walked)', completed: true });
    }
    return defaults;
  }
}

// Export singleton instance
const fileSystem = new FileSystemManager();
window.fileSystem = fileSystem;
