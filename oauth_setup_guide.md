# Google OAuth 2.0 Configuration Guide (Error 400: origin_mismatch)

This guide explains how to fix the `Access blocked: Authorization Error. Error 400: origin_mismatch` error when logging into **Vanessa's Concierge** at its live domain: `https://vanessa-s-concierge.web.app/`.

---

## Why does this error occur?

Google OAuth 2.0 Web Client IDs require explicit registration of the domain (origin) from which the sign-in request is initiated. When the application runs from `https://vanessa-s-concierge.web.app` (or any other domain not explicitly registered in your Google Cloud Project), Google blocks the sign-in attempt to prevent unauthorized applications from requesting access tokens.

---

## Step-by-Step Resolution

To register the domain and authorize access, follow these steps:

### 1. Open Google Cloud Console
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your Google Cloud Project associated with the application from the project dropdown selector in the top navbar.

### 2. Locate Your OAuth Credentials
1. In the left navigation menu, navigate to **APIs & Services** > **Credentials**.
2. Under the **OAuth 2.0 Client IDs** table, locate the client ID that matches the one configured in your application settings (stored in browser `localStorage` as `google_client_id`).
3. Click the name of the Client ID or click the **Edit Client** (pencil) icon to open its details.

### 3. Add Authorized Origins
1. Scroll down to the **Authorized JavaScript origins** section.
2. Click the **ADD URI** button.
3. In the text field, input the exact live domain:
   ```text
   https://vanessa-s-concierge.web.app
   ```
4. If you also run the application locally for offline testing or development, click **ADD URI** again and register the local environment origin (e.g. if running Python's static HTTP server):
   ```text
   http://localhost:5000
   ```
   *Note: Google OAuth accepts `http://localhost` origins without HTTPS, but the live Firebase domain must use `https`.*

### 4. Save and Propagate
1. Scroll to the bottom of the page and click the blue **Save** button.
2. **Important:** Allow 2 to 5 minutes for Google's authorization servers to sync the new origin rules globally.
3. Clear your browser cache or open a fresh tab, visit `https://vanessa-s-concierge.web.app/`, and attempt the login flow again.
