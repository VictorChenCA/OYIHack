Source: https://qm.ycombinator.com



 QM documentation

 / Documentation

 /

 Menu

 About
 GitHub ↗
 Twitter ↗

Start hereOverviewQuickstartArchitecture

Core conceptsScopes and sharingSandboxesBackground workApps and skills

ConnectModels and harnessesIntegrationsSlack and web

OperateDeploymentSecurityReference

Twitter ↗

QM documentation

A multiplayer agent harness for work
Copy for agentsPlain text

QM gives each person and shared room a durable, isolated agent workspace, while keeping administration, permissions, and background work in one system. It works in Slack and on the web.

For agents: use /agents.txt for all of this site’s documentation in one text file, or use “Copy for agents” on any page for just that page.

Fastest path: tell your coding agent, 
```
Let's deploy https://github.com/yc-software/qm. It should follow the repository's deployment guide.

 Deploy QM →Initialize an organization-owned deployment for Fly.io or AWS.
 Understand the system →Core, Postgres, surfaces, and one durable computer per scope.
 Work together →Personal contexts, channels, groups, projects, and explicit sharing.
 Review security →Security postures, command policy, credentials, and audit.

What you can do

Search internal notes, email, documents, databases, and the web together.
Build internal apps, publish them to the right people, and keep their data current.
Learn a writing voice, triage an inbox on a schedule, and prepare reply drafts.
Work in repositories, run tests, open pull requests, monitor CI, and inspect logs.
Track shared projects in channels and handle updates and follow-ups.

Design principles

PrincipleWhat it means
Scoped by defaultEach person and room has its own memory, files, permissions, crons, apps, and sandbox.
Harness-agnosticPi, OpenCode, Codex, and Claude Code can drive the same core.
Operator-ownedYour deployment runs in your cloud account and uses your policies and credentials.
Durable workComputers, files, sessions, schedules, and published apps can outlive a single turn.

Based on the public QM README. QM is MIT licensed except where noted.

Start here

Deploy QM for an organization
Copy for agentsPlain text

Start in an empty, private repository owned by your organization. You do not need to clone QM to deploy it.

Before you begin
Node.js and npm.
An operator-owned Fly.io or AWS account with billing enabled.
An administrator email address.
For email sign-in, a verified sender plus Resend or SMTP credentials. You can also use an external identity provider.

1. Initialize the deployment

```

```
npm exec --yes --package=@yc-software/qm@latest -- \
 qm init . --org <slug> --target <fly-or-aws>
npm install
```

The slug is a local name derived from your organization. Provider choice happens during initialization because it determines configuration, secret rules, generated files, and teardown behavior.

2. Hand the runbook to an agent

```
qm init materializes 
```
deployment.md and 
```
.codex/skills/deploy-qm/. The runbook guides the agent through infrastructure, web sign-in, optional connectors and Slack, deployment, and live verification.

3. Verify the deployment

```

```
npm exec qm -- check
npm exec qm -- doctor
npm exec qm -- plan
npm exec qm -- up --yes
npm exec qm -- check --live
```

```
check validates local configuration. 
```
doctor checks external prerequisites without changing them. 
```
check --live verifies the running system.

Keep secrets out of git. Commit 
```
qm.config.jsonc and the lockfile. Keep secret values in the ignored 
```
.env and your provider's secret store.

Authoritative sources: getting started, deployment guide, and CLI reference.

Start here

Architecture
Copy for agentsPlain text

Every turn passes through a central core. Durable state lives in Postgres. Tools execute inside the scope's isolated computer. Slack and the web UI are two surfaces over the same system.

Slack · Web · APIIdentity and conversation surfaces

QM corePolicy · scheduler · agent loop

PostgresSessions & memory
Durable queue

Per-scope sandboxFiles & tools
Logged-in services

Core
The TypeScript core uses Fastify. It handles identity, policy, the scheduler, agent orchestration, and the fixed tool surface. Slack runs as an optional in-process plugin.

Persistence
Use 
```
DATABASE_URL and 
```
SESSION_STORE=postgres for durability. Without Postgres-backed sessions, session data lives in process memory and disappears on restart.

Surfaces
The web UI and admin panel share one service. The portal and optional built-in authentication broker share another. Slack and web use the same core identity and configuration.

Replaceable interfaces
Harnesses, session stores, sandboxes, model gateways, and memory providers sit behind interfaces. The deployment layer contains organization-specific configuration, tools, skills, images, and infrastructure.

Source: README architecture and combined services.

Core concepts

Scopes and sharing
Copy for agentsPlain text

A scope is the boundary around an agent's identity, data, permissions, and computer. Personal conversations and shared rooms do not silently become one workspace.

Scope types
ScopeTypical use
PersonalA person's private assistant, memory, files, credentials, crons, and apps.
Channel or groupA shared agent for a room, with membership-aware access.
ProjectA durable shared work context independent of one chat thread.
OrganizationAdmin defaults, shared services, promoted skills, and policy ceilings.

Isolated is the default
Resources stay in their owning scope unless they are explicitly shared. Access grants are auditable and revocable.

Open sharing
Open is an opt-in posture for more continuity between personal and shared contexts. On a live authenticated internal turn, it can expose selected personal resources in an opted-in shared room, and recent shared resources in a person's DM.

Open does not silently carry credentials, message history, writes, automation access, or another person's entitlements across scopes. It does not weaken screening, command approval, or egress policy.

External sharing
Conversation sharing and published-app access are explicit. Public access is opt-in, never the default. Treat widening access like publishing any other scoped data.

Sources: README security and sharing and session sharing.

Core concepts

Sandboxes
Copy for agentsPlain text
The agent's 
```
execute tool runs commands in an isolated computer associated with its scope. Installed tools and working files can persist across turns.

Durable computers
Use a durable scope computer for repository work, installed CLIs, long-running tasks, cached dependencies, and anything that must resume later.

Disposable workers
Use a scratch or blank worker for self-contained analysis, heavy tests, or parallel work that does not need the scope's files or credentials. Durable outputs should move to git or QM Files.

Provider model
Sandbox providers are pluggable. A deployment chooses its provider and image while the agent uses the same tool contract. Provider capabilities such as pause, restart, process monitoring, and durable storage can differ.

Credentials
Credentials are authorized separately from the computer. QM can deliver only the credentials needed by a command or turn, and audit their use. A machine existing does not grant it access to every key.

Sources: sandbox resources, preservation, and the public README.

Core concepts

Background work
Copy for agentsPlain text
QM can continue work without an open browser. Scheduled tasks, process watches, and inbound webhooks run through the same identity and policy system as live turns.

Scheduled tasks
Crons reevaluate a prompt on a calendar or polling schedule. They have an owner, a destination, and explicit access to the resources they need.

Process watches
A long-running process can notify the conversation when output arrives or when it exits. The process writes durable results to the scope's workspace; a later live turn can deliver files.

Inbound webhooks
External systems can wake a QM turn by posting a verified event. Filters can discard irrelevant events before a model runs.

Ownership and deploys
Production deployments can use durable background-work ownership so exactly one core cohort claims scheduled work during replacements and rollbacks.

Sources: public README, background ownership, and CLI deployment reference.

Core concepts

Apps and skills
Copy for agentsPlain text
QM turns useful one-off work into reusable software: publish a web app for people to use, or save a procedure as a skill for agents to follow.

Published apps
An agent can publish a directory as a long-lived web app with a stable URL, immutable versions, access grants, and rollback. Stateful apps write to the deployment's durable data directory.

Skills
Skills are plain instruction packages owned by a scope. They can include scripts and supporting files, be shared by grant, or be promoted by an administrator for the whole organization.

When to use each
Use an app when…Use a skill when…
A person needs a browser UI, dashboard, form, or durable endpoint.An agent needs a repeatable procedure, policy, or service workflow.
Several people need to view or interact with the result.The value is in how the work is done, not a separate interface.

Sources: files and publication and skill registry.

Connect

Models and harnesses
Copy for agentsPlain text
QM separates the model, the harness that drives it, and the core that supplies identity, policy, tools, and durable state.

Supported harnesses
Pi, OpenCode, Codex, and Claude Code can drive the same QM core. Organizations can limit which harnesses and models are available.

Model gateway
A gateway can provide model discovery, aliases, routing, pricing, and organization-level credentials while keeping the core model-independent.

Runtime settings
Users can select a model, harness, reasoning effort, and supported fast mode for a task or scope. Organization defaults and availability rules still apply.

Sources: README and model gateway.

Connect

Integrations
Copy for agentsPlain text
QM keeps integrations composable. Skills describe the work; authorized credentials or connectors provide access.

Composio
When a Composio credential is available, app-specific skills can use the official SDK to discover actions, connect accounts, and execute requests. Direct connectors remain an alternative.

MCP connectors
Administrators can register MCP servers as shared service integrations. QM applies its own authorization and scope rules before exposing connector tools to a conversation.

Memory providers
Memory can remain in QM's built-in notebook or be routed by scope to an external provider through the memory provider abstraction.

Custom tools
Deployment directories can include organization-specific tools and skills without changing QM core. This keeps private integrations out of the public source tree.

Sources: Composio, MCP connectors, and memory providers.

Connect

Slack and web
Copy for agentsPlain text
Slack and the web UI are first-class surfaces over the same core. People can start work in a room and continue it in the browser without creating a second agent system.

Slack
QM can respond in DMs, group messages, channels, and threads. Workspace identity maps to QM principals and scopes. Deployment administrators control the Slack app and audience.

Web UI
The web UI provides session navigation, transcripts, files, runtime controls, apps, and administration. The portal handles authentication and routes users to their QM instance.

Identity continuity
Principal links can join several verified sign-ins belonging to the same person, avoiding split identities between Slack, email, and an external identity provider.

Sources: README, Slack plugin, and principal links.

Operate

Deployment
Copy for agentsPlain text
A deployment directory is the organization-owned source of truth for configuration, tools, skills, services, infrastructure, and the pinned QM package version.

Directory contract
```

```
qm.config.jsonc
package.json
package-lock.json
deployment.md
.codex/skills/deploy-qm/
.env.example
.env
slack-app-manifest.yml
sandbox/
plugins/
infra/
```

Providers
TargetShape
DockerSingle-host deployment; each agent computer runs in its own container.
Fly.ioLong-running Fly apps plus Fly Machines for agent computers.
AWSDigest-pinned ARM64 ECS Fargate services plus Lambda MicroVM agent computers.

Lifecycle commands
```

```
qm check
qm doctor
qm plan
qm up --yes
qm status
qm logs [service]
qm rollback --to <revision-or-sha>
qm down --purge
```

Upgrades
Upgrade the exact 
```
@yc-software/qm dependency and lockfile deliberately. Review contract changes and generated assets, then validate, plan, deploy, and run live checks.

Sources: CLI reference and deployment directory.

Operate

Security
Copy for agentsPlain text
QM assumes an agent acts for the person it is working with, using that person's authorized resources. It combines scope isolation, policy, approval, credential grants, egress rules, and audit.

Security postures
PostureBehavior
StrictEvery harness tool call pauses for human approval except no-effect turn enders.
AutoDefault. Blocks private-network access and uses configured screening. Built-in model screening is opt-in.
DangerousNo content screening or pauses between tool calls. Hard denials, auth, scope boundaries, and audit still apply.

Command policy
Predeclared approval rules and hard denials apply in every posture, including Dangerous. Organizations set a ceiling; narrower scopes may tighten it.

Credentials
Credentials live in keychains or organization-managed stores, not in prompts. Access can require an explicit grant. Use is scoped, revocable, and audited.

Threat model
Operators should read the full threat model before production deployment. It covers trust boundaries, prompt injection, sandbox escape, credentials, web publication, shared contexts, and known limitations.

Report security vulnerabilities privately as described in SECURITY.md, not in a public issue.

Source: Security policy and threat model.

Operate

Reference
Copy for agentsPlain text
The public repository remains the authoritative reference. This site organizes the common path and links into the detailed guides.

CLI commands
CommandPurpose

```
initCreate a deployment directory.

```
checkValidate config and optionally the live deployment.

```
doctorCheck external prerequisites without changing them.

```
planRender and review the deployment plan.

```
upDeploy or update services.

```
status / 
```
logsInspect the running deployment.

```
rollbackRestore code and configuration to a prior revision.

```
admin-loginMint a five-minute single-use administrator login URL.

Detailed guides
Deployment directory contract
E2B template
Porter
Superserve
Durable agent pools and swarms
Document inputs
Error reporting
Postgres connections

Browse all documentation in github.com/yc-software/qm/docs.

