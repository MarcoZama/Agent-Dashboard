# Agents Dashboard

English · [Italiano](./README.it.md)

React and TypeScript Power Apps Code App for agent inventory and governance, Copilot Studio consumption and capacity, M365 balances and policies, and daily Cowork consumption. It does not modify policies, limits, or agents and does not import Cowork CSV files.

## App prerequisites

- Node.js **22.12+** with npm (an LTS release is preferred), Git, and VS Code or another editor. Use the **Power Platform CLI (`pac`)** for connector binding and local playback, and the **Power Apps CLI (`pa`)** to publish by solution ID.
- A Power Platform environment with **Code Apps enabled** and **Dataverse** for the solution. The maker must be able to create or update the app in the unmanaged `AgentsDashboard` solution. Users need access to the app, an eligible Power Apps license, and the permissions required by the backing APIs. Data policies (DLP) must allow the four connectors to work together.
- A work or school Entra account in the same tenant. Inventory and licensing reports require appropriate delegated roles; OAuth consent does not replace the administrator role. The app does not require a separate application server or database.

## Connectors and authentication

The original custom connector solutions are in the test Power Apps environment and require tenant access:

- [CopilotStudioCreditConsumption](https://make.powerapps.com/environments/90d9d59b-8118-e2c8-9726-1899715d4443/solutions/3465acc8-0fc7-442c-bf9c-cf2cc3043408/overview?tenant=cd24ae47-6aca-4419-973f-ea765b169335)
- [CopilotCostManagment](https://make.powerapps.com/environments/90d9d59b-8118-e2c8-9726-1899715d4443/solutions/3d88cd0c-d3eb-43d2-be76-83cc6cae065e/overview?tenant=cd24ae47-6aca-4419-973f-ea765b169335) (the solution name for `CopilotCostManagement`)

| Connector | Backend and operations | Requirements |
|---|---|---|
| **CopilotStudioCreditConsumption** (custom) | `https://api.powerplatform.com`, API `2024-10-01`. `GetCreditCapacity`, `ListAgentCreditLimits`, `StartAgentUsageReport`, `CheckAgentUsageReport`, `DownloadAgentUsageReport` for `FeatureDetailsPerResource`. | Delegated OAuth and Power Platform licensing read permissions. The licensing report requires a Global, Power Platform, or Dynamics 365 Administrator. The report is in public preview. |
| **CopilotCostManagement** (custom) | `https://graph.microsoft.com/beta`. `GetTenantCreditBalance`, `ListSpendingPolicies`, and `GetCoworkDailyUsage` for the `cowork` service. | Delegated OAuth and admin consent. The balance requires `CopilotCostManagement.Read.All`; verify `CopilotCostManagement-Policy.Read.All` for policies. The aggregate Cowork report accepts `CopilotCostManagement-Reports.Read.All` or the broader `CopilotCostManagement.Read.All` already needed for the balance. The account must also pass applicable Graph role checks. |
| **Power Platform for Admins V2** (standard) | Tenant inventory, environments, and agent metadata (`QueryResources`, `ListEnvironmentsForUser`). | An **OAuth Connection** with a user authorized to read tenant inventory and environments. Inventory does not support a service principal token. |
| **Office 365 Users** (standard) | Agent owner name and address resolution (`UserProfile_V2`). | A Microsoft 365 OAuth connection with access to the requested profiles. An inaccessible profile remains unavailable. |

For each custom connector:

1. Install or import the base OpenAPI definition in its own solution. The files in [`connectors`](./connectors) are **extensions** to merge into the base definition, not complete exports.
2. In **Security**, configure Microsoft Entra ID OAuth 2.0 using an app registered in the tenant. Register the exact connector-generated redirect URL as a **Web** redirect URI. Use `https://api.powerplatform.com` as the Copilot Studio OAuth resource and `https://graph.microsoft.com` for Cost Management. Grant only required delegated permissions, obtain admin consent where needed, and enter the current client secret in protected Power Platform connector settings. Never put the secret in code, `VITE_*` variables, or exports.
3. Add the Copilot Studio [report operations](./connectors/copilot-studio-usage/report-operations.json) and upload the [script](./connectors/copilot-studio-usage/script.csx) **only** for `StartAgentUsageReport`, `CheckAgentUsageReport`, and `DownloadAgentUsageReport`. It exposes the job ID and `Retry-After` and wraps the download for the SDK. Add the [Cowork operation](./connectors/copilot-cost-management/cowork-operations.json) to the Graph connector; it uses the existing `ODataError` definition and requires no script.
4. Create and test an OAuth connection for each connector in the app's environment. Check the inventory, capacity, Copilot Studio report, M365 balance, and one completed UTC day of Cowork usage. A Graph *usage unavailable* result is valid and does not mean zero. Do not confuse it with a missing connector route.

The custom connectors stay in separate solutions from the app. Keep [power.config.json](./power.config.json), `.power/schemas/`, generated clients, and `package-lock.json`: they hold build settings, metadata, and dependencies, not credentials. Review environment-specific identifiers before sharing the folder. The [`.gitignore`](./.gitignore) excludes dependencies, outputs, local settings, secrets, and local solution exports.

## Run, regenerate, and publish

In PowerShell from the project directory:

```powershell
npm ci
pac auth select --name AgentConsumption
npm run dev
```

In a second terminal:

```powershell
pac code run --port 8181 --appUrl http://localhost:5173
```

Open the `play/e/.../app/local` URL printed by PAC, then accept connection consent and local-network access if prompted. Opening Vite directly cannot authenticate connectors. For standalone UI development, set `$env:VITE_DATA_SOURCE='mock'` before `npm run dev`: sample mode only supplies inventory. Do not use it in a published build.

For a fresh deployment, select its PAC profile, set the target `environmentId`, remove the previous deployment's `appId` from the new configuration copy, and bind the target's connections. For each connector use `pac connection list --environment "<ENVIRONMENT_ID>"` to obtain the API and connection IDs, then run `pac code add-data-source --apiId "<CONNECTOR_API_ID>" --connectionId "<CONNECTION_ID>"`. If custom connector installations generate different data-source names, align the keys in [repair-connector-clients.mjs](./scripts/repair-connector-clients.mjs), [UsageReportService.ts](./src/data/UsageReportService.ts), and [CoworkUsageService.ts](./src/data/CoworkUsageService.ts) with `.power/schemas/appschemas/dataSourcesInfo.ts`.

Regenerate and validate:

```powershell
npm run repair:connectors
npm test
npm run lint
npm run build
```

The repair script fixes TypeScript identifiers generated by PAC and supplies operation metadata when the generated connector schema is stale. To publish manually, select the target account and environment in `pa`, get the solution ID with `pa solution list`, then run `pa app push --solution-id "<SOLUTION_ID>"`. The published version opens in the Power Apps player without either local server.

## Managed solution per pull request

The [Code App PR workflow](./.github/workflows/code-app-pr.yml) builds, tests, and lints each PR targeting `main` on open, reopen, or update. For successful same-repository PRs, [Code App managed solution](./.github/workflows/code-app-solution.yml) publishes only in the packaging sandbox, sets version `1.0.<run>.<attempt>`, and exports `AgentsDashboard_managed.zip`. It checks the manifest and asset hashes before uploading the ZIP under **Actions → Code App managed solution → Artifacts**. Fork PRs only run CI, without Power Platform credentials. No workflow deploys to the customer.

One-time setup:

1. Prepare a **dedicated Dataverse sandbox**, separate from the current test environment and without sensitive data. Enable Code Apps, install both connector solutions, then seed an **unmanaged** `AgentsDashboard` solution containing only the Code App. To preserve solution and app identity for upgrades, start from an unmanaged export of the existing app solution. Bind the packaging environment's connections and verify its [power.config.json](./power.config.json) points to the already published sandbox app.
2. Configure a [CI service principal](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/use-service-principal) with access **only** to the sandbox and Dataverse privileges to update and export the solution. Share the sandbox Code App with the principal using its enterprise application object ID and `edit` access. The connectors continue using their own delegated OAuth connections at runtime.
3. Create the `power-platform-packaging` GitHub environment. Restrict deployments to protected `main`, require reviewers, and store its client secret as `PP_CI_CLIENT_SECRET`. In that environment, set `PP_CI_TENANT_ID`, `PP_CI_CLIENT_ID`, `PP_CI_ENVIRONMENT_ID`, `PP_CI_SOLUTION_ID`, and `PP_CI_POWER_CONFIG` with the **sandbox** configuration JSON, without secrets. The workflow rejects the current test app's environment. The job with credentials uses the script from the default branch and does not execute PR code.
4. Once both workflows are on `main`, validate using an internal PR and approve the export. For the first import trial, install the two connector solutions in another test environment and bind the destination connections. Do not distribute an unverified preview ZIP.

## Data interpretation and troubleshooting

- **Copilot Studio:** report by agent, feature, and environment. Complete UTC days, at most 92 days; the first poll usually waits about five minutes and follows `Retry-After`. Standard Harness, GitHub Harness, and unreported harnesses stay separate. Billed and non-billed credits are not interchangeable.
- **Cowork:** select **Cowork** in the main product switcher, between **Agent Builder** and **Copilot Studio**. The default period is seven completed UTC days with a maximum of 31 days. Only reported days contribute to the total. Power Platform agent and environment filters do not apply. No active-user, task, retention, manual-import, or currency-cost figures are included.
- **Capacity and policies:** balances are tenant snapshots. Do not add Copilot Studio PAYG, M365 balance, and Cowork detail together. Optional contract pricing estimates Copilot Studio cost; it is not an invoice.
- **Errors:** for `401/403`, check roles, tenant, scopes, and consent for the connection user. For `AADSTS7000215`, check the secret and expiration in Entra, update the connector, and reauthenticate if prompted. If the API returns `429`, wait before retrying. Graph `/beta` endpoints can change and Microsoft does not support them for production applications.

## Microsoft Learn

- [Power Apps Code Apps requirements](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview) · [Application lifecycle management](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm) · [Custom connector authentication](https://learn.microsoft.com/en-us/connectors/custom-connectors/connection-parameters)
- [Power Platform inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api) · [Copilot Credit usage reports](https://learn.microsoft.com/en-us/power-platform/admin/programmability-tutorial-download-copilot-credit-usage-reports)
- [M365 Cost Management permissions](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview#permissions) · [Daily Cowork consumption API](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/costmanagementserviceusagerecord-get)
