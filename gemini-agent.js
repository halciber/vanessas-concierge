/**
 * gemini-agent.js
 * Manages the client-side Gemini AI agent, handles function calling (tools),
 * and provides a local fallback parser if no API Key is provided.
 */

class GeminiAgentManager {
  constructor() {
    this.apiKey = '';
    this.modelName = 'gemini-2.5-flash';
    this.chatHistory = [];
    this.systemInstruction = `You are "Care Assistant", a gentle, supportive personal concierge and assistant for Vanessa. 
Vanessa takes care of special needs adults and needs a clean, low-stress, organized workspace. 
Your goal is to help her manage her day, schedule events, complete tasks (checklist items), manage reminders (brief notes, alerts, or warnings), manage daily routines (checklist items for specific days of the week), log journal entries (including work start/end times and mileage), and track expenses. 
Use the 'addTodoItem' tool for actionable tasks on her To-Do list, 'addReminder' for notifications, quick alerts, or warnings (like calling someone or renewals), and 'addDailyRoutineItem' / 'removeDailyRoutineItem' / 'listDailyRoutine' to manage daily routine items (like Client hygiene or Pet care) for specific days of the week.
For expenses, use 'logExpense' to record new ones, and 'updateExpense' / 'deleteExpense' to correct or remove existing ones. When updating or deleting, call 'listExpenses' first if you are unsure which expense matches, and ask Vanessa to clarify if several could match.
Expense records go into a monthly report for the client's guardian, so they follow a standard: the expense description is the STORE/VENDOR name, and the category is the standardized purchase description. Known vendors and their standard descriptions: ALDI = Groceries; Walmart = Groceries and misc. house goods; McDonald's = Food/Meal; WellAbility = Cash for activities; Fiesta Acapulco = Food/Meal; Giant Eagle = Groceries; Chipotle = Food/Meal; Dollar Tree = Misc. household goods; Sally Beauty = Hair/Beauty supplies; Michaels = Crafts/Supplies; CVS = Misc./Pharmacy; Deja Vu = Used clothing; Five Below = Taxable misc.; Ulta Beauty Salon = Haircare.

You can perform actions on her behalf using the tools provided. When an action is completed, explain what you did in a warm, friendly, and reassuring tone. 
Avoid jargon. Keep responses concise and supportive. Always assume the current year is 2026.`;
    
    // Tools declarations for Gemini
    this.tools = [
      {
        functionDeclarations: [
          {
            name: "addTodoItem",
            description: "Add a new checklist item to Vanessa's To-Do list.",
            parameters: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING", description: "The task text description, e.g., 'Submit weekly meal plan'." }
              },
              required: ["title"]
            }
          },
          {
            name: "addCalendarEvent",
            description: "Add a new appointment or event to Vanessa's schedule.",
            parameters: {
              type: "OBJECT",
              properties: {
                summary: { type: "STRING", description: "Title of the appointment, e.g., 'Optometrist Appointment'." },
                startDateTime: { type: "STRING", description: "ISO 8601 datetime string, e.g., '2026-06-28T09:00:00'." },
                endDateTime: { type: "STRING", description: "ISO 8601 datetime string, e.g., '2026-06-28T10:00:00'." },
                description: { type: "STRING", description: "Optional description or location details." }
              },
              required: ["summary", "startDateTime", "endDateTime"]
            }
          },
          {
            name: "deleteCalendarEvent",
            description: "Remove an event from the schedule by title or date.",
            parameters: {
              type: "OBJECT",
              properties: {
                summary: { type: "STRING", description: "The title of the event to delete, e.g., 'Physical Therapy'." }
              },
              required: ["summary"]
            }
          },
          {
            name: "logJournalEntry",
            description: "Add or update today's work hours, mileage, and general journal notes.",
            parameters: {
              type: "OBJECT",
              properties: {
                client: { type: "STRING", description: "The name of the client Vanessa worked with, e.g., 'John Doe'." },
                start_time: { type: "STRING", description: "Time started, e.g., '09:00 AM'." },
                end_time: { type: "STRING", description: "Time finished, e.g., '11:30 AM'." },
                mileage: { type: "NUMBER", description: "Miles driven, e.g., 15.4." },
                notes: { type: "STRING", description: "Notes about what happened today during the session." }
              },
              required: ["notes"]
            }
          },
          {
            name: "logExpense",
            description: "Record a business-related expense.",
            parameters: {
              type: "OBJECT",
              properties: {
                description: { type: "STRING", description: "The store or vendor name where the purchase was made, e.g., 'Walmart', 'ALDI', 'CVS'." },
                category: { type: "STRING", description: "The standardized purchase description for the guardian report. Known vendors are auto-categorized; only needed for unknown vendors.", enum: ["Groceries", "Groceries and misc. house goods", "Food/Meal", "Cash for activities", "Misc. household goods", "Hair/Beauty supplies", "Crafts/Supplies", "Misc./Pharmacy", "Used clothing", "Taxable misc.", "Haircare"] },
                amount: { type: "NUMBER", description: "Cost of the item in USD, e.g., 84.20." },
                payment_method: { type: "STRING", description: "How it was paid: 'Debit', 'Client Cash', 'Provider Cash', or 'SNAP'. Defaults to 'Debit'.", enum: ["Debit", "Client Cash", "Provider Cash", "SNAP"] }
              },
              required: ["description", "amount"]
            }
          },
          {
            name: "listExpenses",
            description: "Retrieve the list of recorded expenses (with their expense_id values) to answer questions or to find the right expense before updating or deleting it.",
            parameters: {
              type: "OBJECT",
              properties: {},
              required: []
            }
          },
          {
            name: "updateExpense",
            description: "Correct an existing expense. Identify it by expense_id (preferred; get it from listExpenses) or by a matching description. Only the provided new_* fields are changed.",
            parameters: {
              type: "OBJECT",
              properties: {
                expense_id: { type: "STRING", description: "The id of the expense to update, from listExpenses." },
                description: { type: "STRING", description: "Text to match against the expense description if no expense_id is given, e.g. 'Walmart'." },
                new_description: { type: "STRING", description: "New store/vendor name, if it should change." },
                new_amount: { type: "NUMBER", description: "New amount in USD, if it should change." },
                new_category: { type: "STRING", description: "New standardized purchase description.", enum: ["Groceries", "Groceries and misc. house goods", "Food/Meal", "Cash for activities", "Misc. household goods", "Hair/Beauty supplies", "Crafts/Supplies", "Misc./Pharmacy", "Used clothing", "Taxable misc.", "Haircare"] },
                new_date: { type: "STRING", description: "New date in YYYY-MM-DD format, if it should change." },
                new_status: { type: "STRING", description: "New payment method: 'Debit', 'Client Cash', 'Provider Cash', or 'SNAP'.", enum: ["Debit", "Client Cash", "Provider Cash", "SNAP"] }
              },
              required: []
            }
          },
          {
            name: "deleteExpense",
            description: "Remove a recorded expense. Identify it by expense_id (preferred; get it from listExpenses) or by a matching description.",
            parameters: {
              type: "OBJECT",
              properties: {
                expense_id: { type: "STRING", description: "The id of the expense to delete, from listExpenses." },
                description: { type: "STRING", description: "Text to match against the expense description if no expense_id is given, e.g. 'pharmacy'." }
              },
              required: []
            }
          },
          {
            name: "listCalendarEvents",
            description: "Retrieve Vanessa's scheduled appointments and events to answer questions about what is on her calendar.",
            parameters: {
              type: "OBJECT",
              properties: {},
              required: []
            }
          },
          {
            name: "listTodoItems",
            description: "Retrieve Vanessa's To-Do list items to answer questions about tasks she needs to complete.",
            parameters: {
              type: "OBJECT",
              properties: {},
              required: []
            }
          },
          {
            name: "addReminder",
            description: "Add a new reminder, alert, or brief message for Vanessa.",
            parameters: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING", description: "Short title for the reminder, e.g., 'Call Guardian'." },
                text: { type: "STRING", description: "Details of the reminder, e.g., 'Discuss weekly schedule adjustments'." },
                type: { type: "STRING", description: "Importance type: 'critical' for urgent warnings, or 'note' for normal notes.", enum: ["critical", "note"] }
              },
              required: ["title", "text"]
            }
          },
          {
            name: "listReminders",
            description: "Retrieve Vanessa's reminders list to answer questions about alerts or notes.",
            parameters: {
              type: "OBJECT",
              properties: {},
              required: []
            }
          },
          {
            name: "addDailyRoutineItem",
            description: "Add a routine checklist item for a specific day of the week (e.g., 'Hygiene', 'Clean litter box').",
            parameters: {
              type: "OBJECT",
              properties: {
                dayOfWeek: { type: "STRING", description: "The day of the week, e.g., 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
                activity: { type: "STRING", description: "Description of the routine activity." }
              },
              required: ["dayOfWeek", "activity"]
            }
          },
          {
            name: "removeDailyRoutineItem",
            description: "Remove a routine checklist item from a specific day of the week.",
            parameters: {
              type: "OBJECT",
              properties: {
                dayOfWeek: { type: "STRING", description: "The day of the week, e.g., 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
                activity: { type: "STRING", description: "Description of the routine activity to delete (matches case-insensitively)." }
              },
              required: ["dayOfWeek", "activity"]
            }
          },
          {
            name: "listDailyRoutine",
            description: "List the routine items scheduled for a specific day of the week.",
            parameters: {
              type: "OBJECT",
              properties: {
                dayOfWeek: { type: "STRING", description: "The day of the week, e.g., 'monday', 'tuesday', etc.", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] }
              },
              required: ["dayOfWeek"]
            }
          }
        ]
      }
    ];

    // Local application callbacks mapping
    this.callbacks = {
      addTodoItem: null,
      addCalendarEvent: null,
      deleteCalendarEvent: null,
      logJournalEntry: null,
      logExpense: null,
      listExpenses: null,
      updateExpense: null,
      deleteExpense: null,
      listCalendarEvents: null,
      listTodoItems: null,
      addReminder: null,
      listReminders: null,
      addDailyRoutineItem: null,
      removeDailyRoutineItem: null,
      listDailyRoutine: null
    };
  }

  init(apiKey) {
    this.apiKey = apiKey || localStorage.getItem('gemini_api_key') || '';
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    localStorage.setItem('gemini_api_key', apiKey);
  }

  registerCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  async sendMessage(userMessage) {
    // Add user message to history
    this.chatHistory.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    // If no API key, use the local mock AI parser so judges can still test it
    if (!this.apiKey) {
      return this.handleLocalMockResponse(userMessage);
    }

    try {
      const localDate = new Date();
      const dateStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[localDate.getDay()];
      const dynamicInstruction = this.systemInstruction + `\n\n[Current Local Context] Today's date is ${dayName}, ${dateStr}. Current local time is ${localDate.toLocaleTimeString()}. Use this information to resolve relative date queries (e.g. "tomorrow", "yesterday", "this Wednesday").`;

      const response = await this.callGeminiAPI(this.chatHistory, dynamicInstruction);
      return await this.processAgentResponse(response);
    } catch (e) {
      console.error("Gemini API call failed:", e);
      // Remove last user message on failure so history remains consistent
      this.chatHistory.pop();
      throw e;
    }
  }

  async callGeminiAPI(contents, systemInstructionText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    
    const requestBody = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemInstructionText || this.systemInstruction }]
      },
      tools: this.tools
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status} response from Gemini API.`);
    }

    return await res.json();
  }

  async processAgentResponse(responseJson) {
    const candidate = responseJson.candidates?.[0];
    const message = candidate?.content;
    if (!message) {
      throw new Error("No response content generated by Gemini.");
    }

    // Save the model's response structure to history
    this.chatHistory.push(message);

    const parts = message.parts || [];
    let textResponse = '';
    const functionCalls = [];

    // Separate text responses and function calls
    for (const part of parts) {
      if (part.text) {
        textResponse += part.text;
      }
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      }
    }

    // If there are function calls, execute them and send results back to Gemini
    if (functionCalls.length > 0) {
      const toolResponseParts = [];

      for (const call of functionCalls) {
        const { name, args } = call;
        let result = { success: false, message: "Callback not registered" };

        if (this.callbacks[name]) {
          try {
            console.log(`Executing AI Tool: ${name}`, args);
            const callResult = await this.callbacks[name](args);
            result = { success: true, data: callResult };
          } catch (err) {
            console.error(`Error running tool callback ${name}:`, err);
            result = { success: false, error: err.message };
          }
        }

        toolResponseParts.push({
          functionResponse: {
            name: name,
            response: result
          }
        });
      }

      // Add the tool response to history
      const toolMessage = {
        role: 'user', // In Gemini API, tool responses are sent as 'user' role with a functionResponse
        parts: toolResponseParts
      };
      this.chatHistory.push(toolMessage);

      // Call Gemini again with the tool responses to get the final text summary
      const finalResponse = await this.callGeminiAPI(this.chatHistory);
      const finalCandidate = finalResponse.candidates?.[0];
      const finalMessage = finalCandidate?.content;
      
      if (finalMessage) {
        this.chatHistory.push(finalMessage);
        const finalParts = finalMessage.parts || [];
        let finalOutputText = '';
        for (const p of finalParts) {
          if (p.text) finalOutputText += p.text;
        }
        return {
          text: finalOutputText,
          actions: functionCalls.map(c => ({ type: c.name, args: c.args }))
        };
      }
    }

    return {
      text: textResponse || "I've processed your request.",
      actions: []
    };
  }

  // ----------------------------------------------------
  // Local Mock AI Parser (Regex / Keyword based fallback)
  // ----------------------------------------------------
  async handleLocalMockResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    let text = "";
    const actions = [];

    // Helper to extract quotes or segments
    const extractQuote = (str) => {
      const match = str.match(/["'](.*?)["']/);
      return match ? match[1] : null;
    };

     // 0.1 Routine Creation
    if (msg.includes("routine") && (msg.includes("add") || msg.includes("create") || msg.includes("insert"))) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      let dayOfWeek = "monday";
      for (const d of days) {
        if (msg.includes(d)) {
          dayOfWeek = d;
          break;
        }
      }
      
      let activity = extractQuote(userMessage);
      if (!activity) {
        activity = userMessage.replace(/(add a daily routine item|add daily routine item|create routine item|add routine item|for monday|for tuesday|for wednesday|for thursday|for friday|for saturday|for sunday|for monday's|for tuesday's|for wednesday's|for thursday's|for friday's|for saturday's|for sunday's|add|routine|item)/gi, '').replace(/[:"']/g, '').trim();
      }
      activity = activity || "Client hygiene";
      activity = activity.charAt(0).toUpperCase() + activity.slice(1);

      if (this.callbacks.addDailyRoutineItem) {
        const args = { dayOfWeek, activity };
        await this.callbacks.addDailyRoutineItem(args);
        actions.push({ type: 'addDailyRoutineItem', args });
        const capDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
        text = `✨ **(Offline Demo Mode)** I've added **"${activity}"** to your routine for **${capDay}**.`;
      }
    }
    // 0.2 Routine Removal
    else if (msg.includes("routine") && (msg.includes("remove") || msg.includes("delete") || msg.includes("clear") || msg.includes("erase"))) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      let dayOfWeek = "monday";
      for (const d of days) {
        if (msg.includes(d)) {
          dayOfWeek = d;
          break;
        }
      }
      
      let activity = extractQuote(userMessage);
      if (!activity) {
        activity = userMessage.replace(/(remove a daily routine item|remove daily routine item|delete routine item|remove routine item|from monday|from tuesday|from wednesday|from thursday|from friday|from saturday|from sunday|remove|delete|routine|item)/gi, '').replace(/[:"']/g, '').trim();
      }
      activity = activity || "";

      if (this.callbacks.removeDailyRoutineItem) {
        const args = { dayOfWeek, activity };
        await this.callbacks.removeDailyRoutineItem(args);
        actions.push({ type: 'removeDailyRoutineItem', args });
        const capDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
        text = `✨ **(Offline Demo Mode)** I've removed **"${activity}"** from your routine for **${capDay}**.`;
      }
    }
    // 0.3 Reminder Creation (skip list-intent questions so branch 7.5 can answer them)
    else if ((msg.includes("remind") || msg.includes("reminder") || msg.includes("alert")) &&
             !(msg.includes("what") || msg.includes("which") || msg.includes("show") || msg.includes("list") || msg.includes("read") || msg.includes("do i have"))) {
      let textVal = extractQuote(userMessage);
      if (!textVal) {
        textVal = userMessage.replace(/(remind me to|add reminder|create reminder|make a reminder:|make a reminder|add an alert|alert)/gi, '').replace(/[:"']/g, '').trim();
      }
      textVal = textVal || "Call Guardian";
      textVal = textVal.charAt(0).toUpperCase() + textVal.slice(1);
      
      const titleVal = textVal.toLowerCase().startsWith("call") ? "Call Request" : "Alert";

      if (this.callbacks.addReminder) {
        const args = { title: titleVal, text: textVal, type: "note" };
        await this.callbacks.addReminder(args);
        actions.push({ type: 'addReminder', args });
        text = `✨ **(Offline Demo Mode)** I've added a reminder: **"${textVal}"**.`;
      }
    }
    // 1. Task Creation
    else if ((msg.includes("add") || msg.includes("create")) && (msg.includes("task") || msg.includes("todo") || msg.includes("to-do") || msg.includes("to do"))) {
      let title = extractQuote(userMessage);
      if (!title) {
        // Strip out common task creation patterns
        title = userMessage.replace(/(add task|create task|add a task|add to-do|add todo|add to do|to do list item|to-do list item|to-do item|to do item)/gi, '').replace(/[:"']/g, '').trim();
      }
      title = title || "New Task";

      if (this.callbacks.addTodoItem) {
        await this.callbacks.addTodoItem({ title });
        actions.push({ type: 'addTodoItem', args: { title } });
        text = `✨ **(Offline Demo Mode)** I've added **"${title}"** to your To-Do items list.`;
      }
    }
    // 2. Calendar Event Creation
    else if ((msg.includes("schedule") || msg.includes("add") || msg.includes("appointment")) && (msg.includes("event") || msg.includes("appointment") || msg.includes("calendar"))) {
      let summary = extractQuote(userMessage) || "New Event";
      const today = toLocalDateString();
      
      // Basic time inference
      let startDateTime = `${today}T13:00:00`;
      let endDateTime = `${today}T14:00:00`;

      if (msg.includes("at 9") || msg.includes("9:00")) {
        startDateTime = `${today}T09:00:00`;
        endDateTime = `${today}T10:00:00`;
      } else if (msg.includes("at 10") || msg.includes("10:00")) {
        startDateTime = `${today}T10:00:00`;
        endDateTime = `${today}T11:00:00`;
      } else if (msg.includes("at 11") || msg.includes("11:30")) {
        startDateTime = `${today}T11:30:00`;
        endDateTime = `${today}T12:30:00`;
      }

      if (this.callbacks.addCalendarEvent) {
        const args = { summary, startDateTime, endDateTime, description: "Added via offline voice assistant demo." };
        await this.callbacks.addCalendarEvent(args);
        actions.push({ type: 'addCalendarEvent', args });
        text = `✨ **(Offline Demo Mode)** I've scheduled **"${summary}"** for today at ${startDateTime.substring(11, 16)}.`;
      }
    }
    // 3. Calendar Event Deletion
    else if ((msg.includes("delete") || msg.includes("remove") || msg.includes("cancel")) && (msg.includes("event") || msg.includes("appointment") || msg.includes("meeting"))) {
      let summary = extractQuote(userMessage);
      if (!summary) {
        summary = userMessage.replace(/(delete event|remove event|delete appointment|cancel appointment|cancel)/gi, '').replace(/[:"']/g, '').trim();
      }
      summary = summary || "Morning Vital Checks";

      if (this.callbacks.deleteCalendarEvent) {
        await this.callbacks.deleteCalendarEvent({ summary });
        actions.push({ type: 'deleteCalendarEvent', args: { summary } });
        text = `✨ **(Offline Demo Mode)** I've removed the event **"${summary}"** from your schedule.`;
      }
    }
    // 4. Log Journal
    else if (msg.includes("journal") || msg.includes("log") || msg.includes("drove") || msg.includes("mileage") || msg.includes("hours")) {
      const notes = userMessage;
      let mileage = 0.0;
      let start_time = "09:00 AM";
      let end_time = "11:30 AM";
      let client = "John Doe";

      // Parse mileage
      const mileageMatch = msg.match(/(\d+(\.\d+)?)\s*miles?/);
      if (mileageMatch) {
        mileage = parseFloat(mileageMatch[1]);
      }

      // Parse times
      if (msg.includes("9 to 11") || msg.includes("9:00 to 11:30")) {
        start_time = "09:00 AM";
        end_time = "11:30 AM";
      }

      if (this.callbacks.logJournalEntry) {
        const args = { client, start_time, end_time, mileage, notes };
        await this.callbacks.logJournalEntry(args);
        actions.push({ type: 'logJournalEntry', args });
        text = `✨ **(Offline Demo Mode)** I've logged today's journal with **${mileage} miles** and hours **${start_time} - ${end_time}** for client ${client}.`;
      }
    }
    // 5a. Delete Expense (checked before logging, since both phrasings mention "expense")
    else if ((msg.includes("delete") || msg.includes("remove")) && msg.includes("expense")) {
      if (this.callbacks.deleteExpense) {
        const description = extractQuote(userMessage) ||
          userMessage.replace(/.*?(?:delete|remove)\s+(?:the\s+)?/i, '').replace(/\s*expense.*$/i, '').trim();
        const result = await this.callbacks.deleteExpense({ description });
        actions.push({ type: 'deleteExpense', args: { description } });
        if (result && result.status === 'deleted') {
          text = `✨ **(Offline Demo Mode)** I've removed the **"${result.description}"** expense of **$${Number(result.amount).toFixed(2)}**.`;
        } else if (result && result.error) {
          text = `✨ **(Offline Demo Mode)** ${result.error}`;
        } else {
          text = `✨ **(Offline Demo Mode)** I couldn't find an expense matching **"${description}"**.`;
        }
      }
    }
    // 5. Log Expense
    else if (msg.includes("expense") || msg.includes("spent") || msg.includes("buy") || msg.includes("cost")) {
      let description = extractQuote(userMessage) || "Supplies";
      let amount = 25.0;
      
      const amountMatch = msg.match(/\$\s*(\d+(\.\d+)?)/) || msg.match(/(\d+(\.\d+)?)\s*dollars/);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1]);
      }

      if (this.callbacks.logExpense) {
        const args = { description, amount };
        await this.callbacks.logExpense(args);
        actions.push({ type: 'logExpense', args });
        text = `✨ **(Offline Demo Mode)** I've recorded a **$${amount.toFixed(2)}** expense for **"${description}"**.`;
      }
    }
    // 6. List Calendar Events
    else if ((msg.includes("what") || msg.includes("show") || msg.includes("list") || msg.includes("read") || msg.includes("get")) && 
             (msg.includes("schedule") || msg.includes("calendar") || msg.includes("events") || msg.includes("appointment") || msg.includes("appointments"))) {
      
      if (this.callbacks.listCalendarEvents) {
        try {
          const events = await this.callbacks.listCalendarEvents();
          
          // Determine date filter (today vs tomorrow) using local time
          const getLocalDateStr = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          };
          let targetDateStr = getLocalDateStr(new Date());
          let dateLabel = "today";
          
          if (msg.includes("tomorrow")) {
            const tom = new Date();
            tom.setDate(tom.getDate() + 1);
            targetDateStr = getLocalDateStr(tom);
            dateLabel = "tomorrow";
          }
          
          const filtered = events.filter(e => e.startDateTime.startsWith(targetDateStr));
          
          if (filtered.length === 0) {
            text = `✨ **(Offline Demo Mode)** There are no events scheduled for ${dateLabel}.`;
          } else {
            text = `✨ **(Offline Demo Mode)** Here is your schedule for ${dateLabel}:\n` + 
              filtered.map(e => {
                const time = new Date(e.startDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `- **${time}**: ${e.summary} (${e.description || 'No description'})`;
              }).join('\n');
          }
        } catch (e) {
          text = `✨ **(Offline Demo Mode)** Sorry, I couldn't read your calendar.`;
        }
      }
    }
    // 7. List Tasks
    else if ((msg.includes("what") || msg.includes("show") || msg.includes("list") || msg.includes("read") || msg.includes("get")) && 
             (msg.includes("task") || msg.includes("tasks") || msg.includes("todo") || msg.includes("to-do") || msg.includes("to do"))) {
      if (this.callbacks.listTodoItems) {
        try {
          const tasks = await this.callbacks.listTodoItems();
          const incomplete = tasks.filter(t => t.status !== 'completed');
          if (incomplete.length === 0) {
            text = `✨ **(Offline Demo Mode)** You have no active tasks on your To-Do list!`;
          } else {
            text = `✨ **(Offline Demo Mode)** Here are your active To-Do items:\n` + 
              incomplete.map(t => `- [ ] ${t.title}`).join('\n');
          }
        } catch (e) {
          text = `✨ **(Offline Demo Mode)** Sorry, I couldn't read your task list.`;
        }
      }
    }
    // 7.5 List Reminders
    else if ((msg.includes("what") || msg.includes("show") || msg.includes("list") || msg.includes("read") || msg.includes("get")) && 
             (msg.includes("reminder") || msg.includes("reminders") || msg.includes("alert") || msg.includes("alerts"))) {
      if (this.callbacks.listReminders) {
        try {
          const reminders = await this.callbacks.listReminders();
          if (reminders.length === 0) {
            text = `✨ **(Offline Demo Mode)** You have no active reminders!`;
          } else {
            text = `✨ **(Offline Demo Mode)** Here are your active reminders:\n` + 
              reminders.map(r => `- **${r.title}**: ${r.text}`).join('\n');
          }
        } catch (e) {
          text = `✨ **(Offline Demo Mode)** Sorry, I couldn't read your reminders.`;
        }
      }
    }
    // 7.8 List Daily Routine
    else if ((msg.includes("what") || msg.includes("show") || msg.includes("list") || msg.includes("read") || msg.includes("get")) && 
             msg.includes("routine")) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      let dayOfWeek = "monday";
      for (const d of days) {
        if (msg.includes(d)) {
          dayOfWeek = d;
          break;
        }
      }
      if (this.callbacks.listDailyRoutine) {
        try {
          const items = await this.callbacks.listDailyRoutine({ dayOfWeek });
          const dayName = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
          if (items.length === 0) {
            text = `✨ **(Offline Demo Mode)** You have no routine items for ${dayName}!`;
          } else {
            text = `✨ **(Offline Demo Mode)** Here is your daily routine for ${dayName}:\n` + 
              items.map(item => `- [${item.completed ? 'x' : ' '}] ${item.activity}`).join('\n');
          }
        } catch (e) {
          text = `✨ **(Offline Demo Mode)** Sorry, I couldn't read your routine for ${dayOfWeek}.`;
        }
      }
    }
    // 8. Generic response
    else {
      text = `✨ **(Offline Demo Mode)** Hello! I am running in local demonstration mode. Enter your Gemini API Key in **Settings** to enable my full natural language processing capabilities!\n\nTry commands like:\n- *What's on my calendar tomorrow?*\n- *Add task "Check blood sugar"* \n- *Schedule "Dentist appointment" today*\n- *Log journal: worked 9:00 to 11:30, drove 12 miles, John did great.*`;
    }

    // Add assistant reply to history
    this.chatHistory.push({
      role: 'model',
      parts: [{ text }]
    });

    return { text, actions };
  }

  clearHistory() {
    this.chatHistory = [];
  }
}

// Export singleton instance
const geminiAgent = new GeminiAgentManager();
window.geminiAgent = geminiAgent;
