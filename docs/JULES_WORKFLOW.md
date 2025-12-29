# 🤖 Jules CLI Workflow

This project supports **Jules**, an AI-powered coding assistant CLI. Use it to create sessions, manage tasks, and get intelligent code suggestions directly from your terminal.

## 🚀 Setup

1.  **Installation**: Ensure `jules` is installed globally (already detected in environment).
2.  **Login**: Authenticate with your Google account.
    ```bash
    npm run jules:login
    # OR
    jules login
    ```

## 🛠️ Common Commands

| Script | Command | Description |
|--------|---------|-------------|
| `npm run jules:new -- "Task description"` | `jules new "Task description"` | Start a new AI coding session (**Description required**). |
| `npm run jules:remote` | `jules remote list` | List your active remote sessions. |
| `npm run jules:logout` | `jules logout` | Sign out of Jules. |

## 🔄 Hybrid Workflow (Clasp + Jules)

Since this is a Google Apps Script project managed by **clasp**, follow this workflow to keep everything in sync:

1.  **Pull Latest Code**:
    ```bash
    clasp pull
    ```
2.  **Start Jules Session**:
    ```bash
    jules new
    ```
    *Ask Jules to modify your local files (e.g., "Refactor Code.gs to add error handling").*

3.  **Review & Push**:
    Once Jules applies changes:
    ```bash
    clasp push
    ```

## 🐛 Troubleshooting

*   **"Error: Must specify what to list"**: Run `jules remote list sessions` or `jules remote --help` to check syntax.
*   **Auth Issues**: Run `jules logout` then `jules login` to refresh credentials.
