# IV SmartCheck

A browser-based conversion of the iPhone evaluation prototype. Clinical use requires institutional validation and authorization.

## Open the website

Serve this directory over HTTP for local testing, for example with `python3 -m http.server 8000`. Open the resulting localhost URL in a current browser.

For GitHub Pages, put the contents of this directory at the root of the public repository's default branch. Under **Settings → Pages**, select **Deploy from a branch**, then select the default branch and **/(root)**. GitHub shows the public URL once deployment completes.

## Try it

1. Open **Search** and look for Alder, Birch, or Cedar.
2. In **Double Check**, select Adult and Demo Alder. Enter 20 mg in 10 mL, Demo fluid A, and 30 minutes. An inactive fixture returns **REVIEW REQUIRED**.
3. Under **Library**, open Demo Alder, enter evaluator initials, and approve it. Run the same check for **PASS**, or enter 9 mL for **FAIL**.
4. Import an authorized reference PDF with its population and version. Text-line prefixes appear in search by page. Reviewed citations are available only when the imported file matches the exact original fingerprint and population. PDF text does not activate clinical rules.

PDFs and synthetic review history stay in browser storage for this site. Check inputs stay in memory. The website has no application server or account, and includes no institutional PDF. Clearing site data removes local records. PDF.js is bundled with its license.
