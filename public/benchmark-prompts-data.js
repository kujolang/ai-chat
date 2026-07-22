window.BENCHMARK_PROMPT_CATALOG = {
  promptSets: {
    baseline: {
      id: "baseline",
      label: "Baseline benchmark set",
      source:
        "Exact prompts extracted from the checked-in RND006 Ollama chat export. RND005 reuses this same test set.",
      tests: [
        {
          id: "TST001",
          number: 1,
          title: "BUG HUNT AND FIX",
          prompt: "Review the following Python code.\n\nIdentify the bugs, security concerns, and reliability problems. Then provide a corrected version.\n\nDo not merely describe what is wrong. Return working replacement code and briefly explain the most important changes.\n\n```\nimport sqlite3\nimport requests\nfrom flask import Flask, request, jsonify\n\napp = Flask(__name__)\n\nDATABASE = \"users.db\"\n\n@app.route(\"/user\", methods=[\"GET\"])\ndef get_user():\n    username = request.args.get(\"username\")\n\n    conn = sqlite3.connect(DATABASE)\n    cursor = conn.cursor()\n\n    query = f\"SELECT id, username, email, api_token FROM users WHERE username = '{username}'\"\n    result = cursor.execute(query).fetchone()\n\n    if not result:\n        return jsonify({\"error\": \"User not found\"}), 404\n\n    callback = request.args.get(\"callback\")\n\n    if callback:\n        requests.post(callback, json={\n            \"id\": result[0],\n            \"username\": result[1],\n            \"email\": result[2],\n            \"api_token\": result[3]\n        })\n\n    return jsonify({\n        \"id\": result[0],\n        \"username\": result[1],\n        \"email\": result[2],\n        \"api_token\": result[3]\n    })\n\napp.run(host=\"0.0.0.0\", port=5000, debug=True)\n```\n\nEvaluate the code for at least:\n\n-   Injection vulnerabilities\n-   Sensitive-data exposure\n-   Server-side request forgery\n-   Missing validation\n-   Error handling\n-   Resource cleanup\n-   Production safety\n\nEnd your response with:\n\n1.  Critical issues found\n2.  Corrected code\n3.  Recommended tests\n4.  Confidence score from 0–100"
        },
        {
          id: "TST002",
          number: 2,
          title: "FEATURE IMPLEMENTATION",
          prompt: "Write a self-contained Python implementation of a lightweight task queue.\n\nRequirements:\n\n-   A task has an ID, name, payload, status, attempt count, and creation time.\n-   Valid statuses are `pending`, `running`, `completed`, and `failed`.\n-   Tasks can be added to the queue.\n-   The next pending task can be claimed.\n-   Claiming a task must change its status to `running`.\n-   A task can be marked completed.\n-   A task can be marked failed.\n-   Failed tasks can be retried up to three times.\n-   A task must not be claimed by two workers at the same time.\n-   Use only the Python standard library.\n-   Store the data in SQLite.\n-   Include a short demonstration showing the queue being used.\n-   Include a small set of tests using `unittest`.\n\nReturn one complete Python script that can be copied into a file and run.\n\nAfter the code, briefly state:\n\n1.  Important design decisions\n2.  Known limitations\n3.  How you would make it safe for multiple machines"
        },
        {
          id: "TST003",
          number: 3,
          title: "CHANGE REQUEST",
          prompt: "You are given this Python rate limiter:\n\n```\nimport time\n\nclass RateLimiter:\n    def __init__(self, limit, window_seconds):\n        self.limit = limit\n        self.window_seconds = window_seconds\n        self.requests = {}\n\n    def allow(self, user_id):\n        now = time.time()\n        history = self.requests.setdefault(user_id, [])\n\n        history = [\n            timestamp\n            for timestamp in history\n            if now - timestamp < self.window_seconds\n        ]\n\n        self.requests[user_id] = history\n\n        if len(history) >= self.limit:\n            return False\n\n        history.append(now)\n        return True\n```\n\nAdd the following features:\n\n-   Return the number of remaining requests.\n-   Return the number of seconds until another request becomes available.\n-   Support separate limits for different actions such as `login`, `api`, and `upload`.\n-   Allow limits to be configured per action.\n-   Preserve simple usage for callers that only provide a user ID.\n-   Prevent memory from growing indefinitely when users stop making requests.\n-   Make time controllable during tests.\n-   Include unit tests.\n\nReturn:\n\n1.  The updated implementation\n2.  Tests\n3.  A short compatibility note\n4.  Any tradeoffs or limitations\n\nDo not replace the solution with an external package."
        },
        {
          id: "TST004",
          number: 4,
          title: "SECURITY REVIEW",
          prompt: "Review this authentication flow for a small internal AI-agent dashboard.\n\n```\napp.post(\"/login\", async (req, res) => {\n  const user = await db.users.findOne({\n    email: req.body.email\n  });\n\n  if (!user || user.password !== req.body.password) {\n    return res.status(401).json({\n      error: `Invalid login for ${req.body.email}`\n    });\n  }\n\n  const token = Buffer.from(\n    `${user.id}:${Date.now()}`\n  ).toString(\"base64\");\n\n  await db.sessions.insert({\n    userId: user.id,\n    token,\n    createdAt: new Date()\n  });\n\n  res.cookie(\"session\", token);\n\n  return res.json({\n    ok: true,\n    token,\n    user\n  });\n});\n```\n\nProvide a prioritized security review.\n\nFor every important issue:\n\n-   Explain why it matters.\n-   Describe a realistic attack or failure scenario.\n-   Recommend a concrete fix.\n\nThen provide a safer replacement implementation or detailed pseudocode.\n\nFocus on issues that materially affect security rather than listing every possible best practice.\n\nEnd with:\n\n-   Critical findings\n-   High-priority findings\n-   Lower-priority improvements\n-   Immediate fix order\n-   Confidence score from 0–100"
        },
        {
          id: "TST005",
          number: 5,
          title: "TECHNICAL PLANNING",
          prompt: "Plan a system that allows AI agents to pause work and request a human decision.\n\nThe system should support:\n\n-   An agent entering a waiting state.\n-   A human approving, rejecting, or requesting changes.\n-   Decisions submitted from a web interface, CLI, Slack, or Discord.\n-   Authentication and authorization.\n-   Duplicate-decision prevention.\n-   Recovery if the server crashes.\n-   An audit history.\n-   Safe retries.\n-   Multiple agents and workers.\n-   A clear distinction between the core decision system and provider-specific integrations.\n\nDo not write a full implementation.\n\nProduce:\n\n1.  Recommended architecture\n2.  Main components and responsibilities\n3.  State transitions\n4.  Suggested database records\n5.  API or message contracts\n6.  Failure scenarios\n7.  Security concerns\n8.  Implementation phases\n9.  Minimum viable version\n10.  What should deliberately be postponed\n\nPrefer a practical, composable system over a large theoretical platform."
        },
        {
          id: "TST006",
          number: 6,
          title: "PROBLEM DIAGNOSIS",
          prompt: "An AI-agent development system created approximately 8,800 issues in 14 days.\n\nOnly about 400 were later judged to be genuinely high-value.\n\nA review component may be generating noisy findings, but it is not yet clear whether the component is:\n\n-   The root cause\n-   Amplifying another problem\n-   Working correctly but receiving poor inputs\n-   Merely correlated with the issue volume\n\nCreate a one-week investigation and improvement plan.\n\nThe plan should:\n\n-   Avoid removing the component without evidence.\n-   Identify why low-value issues are being generated.\n-   Preserve useful security and correctness findings.\n-   Measure duplicate, invalid, low-value, and high-value findings.\n-   Define success and failure thresholds.\n-   Include stop conditions.\n-   Explain when the component should be hardened, replaced, or removed.\n\nReturn:\n\n1.  Initial diagnosis\n2.  Key hypotheses\n3.  Data required\n4.  Experiments\n5.  Daily plan\n6.  Metrics\n7.  Decision criteria\n8.  Risks and blind spots\n\nClearly distinguish facts, assumptions, and recommendations."
        },
        {
          id: "TST007",
          number: 7,
          title: "PRODUCT MANAGEMENT",
          prompt: "Write a concise product requirements document for recovering and improving a modular website connector.\n\nContext:\n\n-   The connector manages WordPress websites.\n-   Approximately 80 provisioning records are stranded.\n-   Some retries created inconsistent states.\n-   Provisioning needs to become safely repeatable.\n-   The connector should eventually be reusable inside backup, performance, and security products.\n-   The immediate priority is recovering the stranded records without creating more damage.\n-   The longer-term priority is making the connector modular and reusable.\n-   Operators need clear logs and recovery controls.\n-   Credentials and sensitive output must not be exposed.\n\nInclude:\n\n1.  Problem statement\n2.  Users and stakeholders\n3.  Goals\n4.  Non-goals\n5.  Immediate recovery requirements\n6.  Longer-term modularization requirements\n7.  Security requirements\n8.  Observability requirements\n9.  Acceptance criteria\n10.  Rollout plan\n11.  Rollback plan\n12.  Open questions\n\nKeep the immediate recovery work clearly separated from the longer-term architecture."
        },
        {
          id: "TST008",
          number: 8,
          title: "MARKETING AND POSITIONING",
          prompt: "Write homepage copy for Kujo, a programming language and ecosystem designed to help humans and AI agents build reliable software.\n\nUse the tagline:\n\n“Trust at the speed of AI.”\n\nThe main ideas are:\n\n-   Clarity\n-   Context\n-   Control\n-   Humans and agents working together\n-   Verification and evidence\n-   Speed without sacrificing trust\n\nThe audience includes:\n\n-   Developers\n-   Technical leaders\n-   Teams adopting AI agents\n\nAvoid:\n\n-   “Software factory”\n-   “Replace developers”\n-   “Revolutionary”\n-   “Experimental language”\n-   Unsupported claims about speed or performance\n-   Generic AI marketing language\n\nProduce:\n\n1.  Hero headline\n2.  Hero subheading\n3.  Primary call to action\n4.  Secondary call to action\n5.  Three short pillar sections\n6.  How it works\n7.  Proof and trust section\n8.  Final call to action\n\nThe tone should be direct, technical, confident, and memorable."
        },
        {
          id: "TST009",
          number: 9,
          title: "EXECUTIVE SYNTHESIS",
          prompt: "A software team is introducing open-source AI models into engineering, product, QA, security, and operational workflows.\n\nEarly observations include:\n\n-   Some models write code well but plan poorly.\n-   Some produce thoughtful plans but are slow and verbose.\n-   Some follow exact instructions but miss larger risks.\n-   Some create large amounts of low-value output.\n-   Local models reduce API dependency but require hardware and operational support.\n-   The team needs to determine which models should be task runners and which should be planners, reviewers, or orchestrators.\n-   The team does not want to select one model for every job.\n\nWrite an executive recommendation.\n\nInclude:\n\n1.  Recommended model-role categories\n2.  Tasks suitable for small or fast models\n3.  Tasks that require stronger reasoning models\n4.  Tasks that should always require human review\n5.  Evaluation criteria\n6.  Routing strategy\n7.  Risks\n8.  A 30-day pilot plan\n9.  Metrics\n10.  Decisions the team must make\n\nDo not recommend a specific model by name. Recommend a process for assigning models to roles based on evidence."
        },
        {
          id: "TST010",
          number: 10,
          title: "SAFE CONNECTOR ACTION RUNNER",
          prompt: "You are reviewing a simplified TypeScript service from a multi-tenant SaaS platform that manages WordPress sites. Users can request connector actions such as clearing a cache, updating a plugin, restoring a backup, or rotating credentials.\n\nThe current implementation has reliability, security, and concurrency problems.\n\n```\ntype ActionKind =\n  | \"clear_cache\"\n  | \"update_plugin\"\n  | \"restore_backup\"\n  | \"rotate_credentials\";\n\ntype ActionStatus =\n  | \"queued\"\n  | \"running\"\n  | \"completed\"\n  | \"failed\";\n\ninterface Action {\n  id: string;\n  tenantId: string;\n  siteId: string;\n  kind: ActionKind;\n  idempotencyKey: string;\n  approved: boolean;\n  status: ActionStatus;\n  attempts: number;\n  result?: unknown;\n  error?: string;\n}\n\ninterface ActionInput {\n  tenantId: string;\n  siteId: string;\n  kind: ActionKind;\n  idempotencyKey: string;\n  approved?: boolean;\n}\n\nconst actions = new Map<string, Action>();\n\nasync function verifySiteAccess(\n  userId: string,\n  tenantId: string,\n  siteId: string\n): Promise<boolean> {\n  return true;\n}\n\nasync function executeConnector(\n  action: Action\n): Promise<unknown> {\n  return {\n    success: true,\n    accessToken: \"secret-token-from-provider\"\n  };\n}\n\nexport async function enqueueAction(\n  input: ActionInput,\n  userId: string\n): Promise<Action> {\n  const existing = [...actions.values()].find(\n    action => action.idempotencyKey === input.idempotencyKey\n  );\n\n  if (existing) {\n    return existing;\n  }\n\n  const hasAccess = await verifySiteAccess(\n    userId,\n    input.tenantId,\n    input.siteId\n  );\n\n  if (!hasAccess) {\n    throw new Error(\"Access denied\");\n  }\n\n  const action: Action = {\n    id: Math.random().toString(36).slice(2),\n    tenantId: input.tenantId,\n    siteId: input.siteId,\n    kind: input.kind,\n    idempotencyKey: input.idempotencyKey,\n    approved: input.approved ?? false,\n    status: \"queued\",\n    attempts: 0\n  };\n\n  actions.set(action.id, action);\n  void runAction(action);\n\n  return action;\n}\n\nasync function runAction(action: Action): Promise<void> {\n  action.status = \"running\";\n  action.attempts++;\n\n  try {\n    action.result = await executeConnector(action);\n    action.status = \"completed\";\n  } catch (error) {\n    action.error = String(error);\n\n    if (action.attempts <= 3) {\n      setTimeout(() => {\n        void runAction(action);\n      }, 1000);\n    } else {\n      action.status = \"failed\";\n    }\n  }\n}\n\nexport function getAction(\n  actionId: string,\n  tenantId: string\n): Action | undefined {\n  return actions.get(actionId);\n}\n```\n\n### Your task\n\n1.  Identify the important correctness, security, concurrency, retry, authorization, and data-leakage problems.\n2.  Replace the implementation with a more robust version.\n3.  Keep the solution in-memory and compatible with Node.js 20 and TypeScript.\n4.  Do not use external packages or require a database.\n\nYour corrected implementation must provide:\n\n-   Tenant-scoped idempotency.\n-   Protection against overlapping requests creating duplicate actions.\n-   Server-controlled approval for `restore_backup` and `rotate_credentials`.\n-   A maximum of three total execution attempts.\n-   Exponential retry delays.\n-   No unhandled background promise rejections.\n-   Tenant authorization when retrieving an action.\n-   Safe public responses that cannot expose connector secrets.\n-   Cryptographically safe action IDs.\n-   Clear status transitions and useful timestamps.\n-   At least five focused tests or test cases covering the most important behavior.\n\n### Response format\n\nReturn these sections in order:\n\n1.  **Problems Found**\n2.  **Corrected TypeScript**\n3.  **Tests**\n4.  **Design Tradeoffs**\n\nKeep the corrected implementation reasonably compact. Do not redesign the entire application or introduce infrastructure that was not requested."
        }
      ]
    },
    wordpress: {
      id: "wordpress",
      label: "TypeScript / WordPress benchmark set",
      source:
        "Exact prompts extracted from the checked-in RND007 OpenRouter chat export. The paired RND007 Ollama run uses the same test set.",
      tests: [
        {
          id: "TST001",
          number: 1,
          title: "Type-Safe Connector Result Normalization",
          prompt: "You own a TypeScript connector that receives unknown JSON from a WordPress\nsite. Implement a small, dependency-free `normalizePluginStatus(input: unknown)`\nfunction and its types. It must return either a validated status object or a\ntyped error result; never throw for malformed upstream input.\n\nThe accepted object is:\n\n```ts\n{\n  siteUrl: \"https://example.com\",\n  plugin: { slug: \"updraftplus\", version: \"1.2.3\", active: true },\n  lastBackupAt: \"2026-07-19T10:00:00.000Z\" | null\n}\n```\n\nReject non-HTTPS URLs, unknown extra top-level fields, invalid dates, empty\nslugs/versions, and non-boolean `active`. Show the implementation, three\nfocused tests, and explain the trust boundary."
        },
        {
          id: "TST002",
          number: 2,
          title: "React Request Race and Cancellation Fix",
          prompt: "This React + TypeScript hook fetches a site's backups when `siteId` changes:\n\n```ts\nexport function useBackups(siteId: string) {\n  const [backups, setBackups] = useState<Backup[]>([]);\n  const [loading, setLoading] = useState(false);\n\n  useEffect(() => {\n    setLoading(true);\n    fetch(`/api/sites/${siteId}/backups`)\n      .then((r) => r.json())\n      .then(setBackups)\n      .finally(() => setLoading(false));\n  }, [siteId]);\n\n  return { backups, loading };\n}\n```\n\nRewrite it to avoid stale responses, update-after-unmount behavior, and opaque\nHTTP/JSON errors. Keep the public return shape small, use `AbortController`,\nand show a focused test strategy using mocked fetch behavior."
        },
        {
          id: "TST003",
          number: 3,
          title: "Multi-Tenant TypeScript Authorization Boundary",
          prompt: "Design and implement the core TypeScript boundary for this request:\n\n```ts\nPOST /api/teams/:teamId/sites/:siteId/restore\n```\n\nThe caller has `userId`, `teamId`, and a role. A restore is destructive and\nmust be initiated only after a server-side approval record exists. Provide\ntyped request/response shapes, pseudocode or TypeScript for authorization and\nidempotency handling, the HTTP responses for key failure cases, and tests that\nprove a user cannot restore another team's site. Do not rely on client-supplied\ntenant IDs as authorization evidence."
        },
        {
          id: "TST004",
          number: 4,
          title: "Front-End Backup List Performance Investigation",
          prompt: "A React admin page renders 8,000 backup rows. Typing in a filter freezes the\npage for 500-900 ms and selecting a row causes the whole list to rerender.\nThe current data is an in-memory `Backup[]`; no backend search endpoint exists.\n\nGive a pragmatic TypeScript/React remediation plan. Include how you would\nmeasure the problem, which calculations need memoization, when virtualization\nis justified, state placement, accessibility consequences, and a compact code\nsketch for the most important change. Avoid prematurely adding a global state\nlibrary or changing the backend unless justified."
        },
        {
          id: "TST005",
          number: 5,
          title: "Accessible Restore Confirmation Flow",
          prompt: "Create a TypeScript/React design for a destructive \"Restore backup\" dialog.\nThe user must understand the site, backup timestamp, and consequence; type a\nconfirmation phrase; then submit only once. Include semantic HTML/ARIA choices,\nkeyboard and focus behavior, pending/error/success states, duplicate-submit\nprotection, and the minimum API payload. Provide a compact component sketch and\na test checklist. Do not claim WCAG conformance without evidence."
        },
        {
          id: "TST006",
          number: 6,
          title: "WordPress Admin Action Security Review",
          prompt: "Review this WordPress/PHP 8.2 code for security and correctness. Provide a\nprioritized finding table, then a safe minimal patch.\n\n```php\nadd_action( 'admin_post_tu_disconnect_site', function () {\n    $site_id = $_GET['site_id'];\n    delete_option( 'tu_connection_' . $site_id );\n    wp_redirect( $_SERVER['HTTP_REFERER'] );\n    exit;\n} );\n```\n\nCover authentication, capabilities, CSRF/nonces, input handling, option-key\nconstruction, open redirects, response behavior, and auditability. Preserve\nWordPress conventions and explain what cannot be solved solely in this handler."
        },
        {
          id: "TST007",
          number: 7,
          title: "WordPress Abilities API - Secure Backup Summary Ability",
          prompt: "For WordPress 7+ and PHP 8.2+, implement a plugin ability named\n`team-updraft/get-backup-summary`. It accepts a validated `site_id` string and\nreturns only an aggregate backup summary: latest backup timestamp, backup count,\nand health state. It must not return credentials, raw backup paths, or secrets.\n\nUse the WordPress Abilities API correctly: register on\n`wp_abilities_api_init`, use `wp_register_ability()`, define input/output\nschemas, use a least-privilege permission callback, and keep REST exposure\ndisabled by default. Show the PHP implementation, explain the authorization\ndecision, and give tests for schema rejection and unauthorized execution."
        },
        {
          id: "TST008",
          number: 8,
          title: "WordPress Ability REST Exposure Threat Model",
          prompt: "A product manager asks to expose `team-updraft/run-backup` through the\nWordPress Abilities REST API so an external AI agent can execute it. Write a\nshort threat model and an implementation recommendation.\n\nAddress authenticated access, the ability permission callback, `show_in_rest`,\nCSRF/session assumptions, application-password or token risk, replay and\nidempotency, rate limiting, audit events, output redaction, and whether a\nbackup action should be synchronous. End with a go/no-go recommendation and\nthe minimum controls required before exposure. Do not assume REST exposure is\nenabled by default."
        },
        {
          id: "TST009",
          number: 9,
          title: "Connector Webhook SSRF and Retry Design",
          prompt: "A WordPress plugin sends an outbound callback to a SaaS URL after a backup is\ncompleted. The SaaS receives duplicate callbacks during retries, and a future\nsettings screen may let an administrator configure a callback URL.\n\nDesign a secure PHP/TypeScript-compatible contract for this integration.\nCover URL validation and SSRF boundaries, signing and timestamp verification,\nevent IDs/idempotency keys, retry policy, timeout behavior, response handling,\ntenant binding, replay windows, and audit fields. Include a compact example\npayload and receiver-side verification pseudocode. Clearly separate what is\nenforced by WordPress/plugin code versus the SaaS receiver."
        },
        {
          id: "TST010",
          number: 10,
          title: "PHP WordPress Connector Vulnerability Triage",
          prompt: "Analyze this simplified WordPress REST route. Identify exploitable issues,\nrank them by severity, and provide a corrected implementation sketch.\n\n```php\nregister_rest_route( 'team-updraft/v1', '/site/(?P<id>[^/]+)/token', array(\n    'methods'  => 'GET',\n    'callback' => function ( WP_REST_Request $request ) {\n        $id = $request['id'];\n        return array(\n            'token' => get_option( 'tu_site_token_' . $id ),\n            'site'  => get_site_url(),\n        );\n    },\n    'permission_callback' => '__return_true',\n) );\n```\n\nAssume tokens authenticate a remote connector. Cover route authorization,\nsecret disclosure, identifier validation, enumeration, response caching,\nlogging, and safer alternatives. Do not merely add a nonce; explain the right\nauthorization model for a remote connector."
        },
        {
          id: "TST011",
          number: 11,
          title: "TypeScript Contract and Failure-Mode Tests",
          prompt: "Propose a focused test suite for a TypeScript client that calls a WordPress\nconnector endpoint returning backup summaries. The client must distinguish\nnetwork failure, timeout, 401/403, 404, 429, malformed JSON, schema-invalid\n200 responses, and valid empty results.\n\nShow the discriminated-union result type, a small adapter boundary, and a test\nmatrix. Include one property-based or fuzzing idea for hostile JSON. Keep the\nanswer framework-neutral where possible and explain which tests belong in unit,\nintegration, and end-to-end layers."
        },
        {
          id: "TST012",
          number: 12,
          title: "Incremental Delivery Plan for a WordPress AI Connector",
          prompt: "You are planning a TypeScript SaaS feature that discovers safe WordPress 7+\nabilities and lets an authorized operator request a backup summary. Produce an\nincremental delivery plan suitable for a small engineering team.\n\nInclude: boundaries between the SaaS, WordPress plugin, and AI-facing layer;\ndata classification; first vertical slice; API contracts; authorization and\napproval decisions; observability; test gates; rollout/rollback; and explicit\nnon-goals. Identify the decisions that require product/security owner approval\ninstead of an AI agent. Keep it concrete, phased, and implementable."
        }
      ]
    }
  },
  runs: [
    {
      id: "rnd005-openrouter-tud-2026-07-18",
      label: "RND005 OpenRouter (TUD) - 2026-07-18",
      promptSetId: "baseline",
      modelGroup: "OpenRouter (TUD)",
      date: "2026-07-18",
      testCount: 10,
      notes:
        "This run does not currently include a checked-in chat export. The prompt set is matched from the paired baseline benchmark artifacts and review docs."
    },
    {
      id: "rnd006-ollama-tud-2026-07-18",
      label: "RND006 Ollama (TUD) - 2026-07-18",
      promptSetId: "baseline",
      modelGroup: "Ollama (TUD)",
      date: "2026-07-18",
      testCount: 10,
      notes:
        "Prompt text is sourced directly from data/benchmark-runs/rnd006tst-ollama-tud-2026-07-18-chat-export.json."
    },
    {
      id: "rnd007-openrouter-tud-typescript-wp-2026-07-19",
      label: "RND007 OpenRouter (TUD) TypeScript / WordPress - 2026-07-19",
      promptSetId: "wordpress",
      modelGroup: "OpenRouter (TUD)",
      date: "2026-07-19",
      testCount: 12,
      notes:
        "Prompt text is sourced directly from data/benchmark-runs/rnd007tst-openrouter-tud-typescript-wp-2026-07-19-chat-export.json."
    },
    {
      id: "rnd007-ollama-tud-typescript-wp-2026-07-19",
      label: "RND007 Ollama (TUD) TypeScript / WordPress - 2026-07-19",
      promptSetId: "wordpress",
      modelGroup: "Ollama (TUD)",
      date: "2026-07-19",
      testCount: 12,
      notes:
        "The paired Ollama run uses the same TypeScript / WordPress prompt set as the OpenRouter run."
    }
  ]
};
