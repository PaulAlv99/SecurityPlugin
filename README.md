# Load Temporary Firefox Extension

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

> 💡 Tip: Each time you restart Firefox, you’ll need to reload the extension manually.
