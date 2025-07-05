# A Firefox extension to help visualize which external connections (like trackers, ads, analytics, and other third-party requests) are triggered when visiting a website.

## 📦 Step 1: Download and Extract
Download the `.zip` file and extract its contents to a folder on your computer.

## 🦊 Step 2: Load Extension in Firefox
1. Open Firefox.
2. Navigate to [`about:debugging#/runtime/this-firefox`](about:debugging#/runtime/this-firefox).
3. Click **"Load Temporary Add-on..."**.
4. In the file picker, select the `manifest.json` file from the extracted folder.

## 🔄 Step 3: Update & Reload
If you make changes to the extension code:
- Go back to the same `about:debugging` page.
- Click **"Reload"** next to your extension to apply the updates.

> 💡 **Tip:** For best results, use the extension with all other tabs and windows closed.  
> For example, visit `nytimes.com`, wait for it to load, then close the tab and any others that were opened.  
> This prevents UI reloads caused by tab activity, which can lead to some UX issues.

