# Owner browser evidence

The final workflow stage must open and observe the verified public production hostname in the owner's actual Windows browser. A successful process launch or a Linux Playwright screenshot alone does not satisfy this gate.

## Available native route

The coordinator verified the following route against the local foundation preview on 30 September 2026. It is a capability check, not production evidence.

1. Windows HTTPS associations select Microsoft Edge. Resolve its executable through the Windows App Paths registry, and launch the requested URL in a dedicated window with `--new-window`, using the owner's existing profile.
2. Use Windows UI Automation to inspect only candidate browser windows whose title includes AxionBench. Read the current address/search Edit control using ValuePattern. Require the exact approved HTTPS hostname and expected URL before inspecting or capturing its web document. Do not enumerate or retain unrelated tabs, passwords, account details or bookmarks.
3. Select the visible AxionBench Document accessibility element and its native bounding rectangle. Record its actual title and observed URL, normalizing a browser-hidden scheme only after the verified public HTTPS origin is established. Recheck the address immediately before capture.
4. Native `PrintWindow(hwnd, dc, 2)` successfully captured the Edge window even when Windows refused a foreground request. Crop that actual capture to the validated web Document rectangle so browser chrome and profile details stay outside the image. Close drawing resources. Reject a failed, blank, unrelated or wrongly sized capture; inspect the retained pixels before claiming success.
5. Keep the page open. Save the real observation and screenshot under this candidate repository, then hash the actual bytes. The acceptance verifier reads these artifacts; it must not launch or manipulate GUI applications itself.

PowerShell can load UIAutomationClient, UIAutomationTypes and System.Drawing and declare the native PrintWindow/GetWindowRect calls through Add-Type. Invoke it with structured process arguments and a UTF-16LE EncodedCommand; never interpolate a URL or path into an unquoted shell command. Use task-specific variable names: PowerShell's automatic `$Matches` variable is unsuitable for accumulating observations. Refuse unsafe target hosts and unexpected document bounds.

## Required final receipts

Read `scripts/verify-workflow.mjs` for the exact current browser/deployment schemas. `evidence/browser.json` binds the approved URL, real opening time/method, product digest, native observed URL/title, observation receipt path/hash and screenshot path/hash. The raw receipt should describe the actual native observation and capture without unrelated profile metadata. `evidence/production-tests.json` separately contains at least 12 genuine production interaction assertions, observed values, the matching product digest and no console errors.

The final native capture must be new and belong to the deployed release. Do not reuse the coordinator's preview screenshot or fabricate a production observation from the opening command. Independently inspect the resulting screenshot and compare it with the verified product. Final JadBot evaluation and verified integration remain separate, later evidence requirements.
