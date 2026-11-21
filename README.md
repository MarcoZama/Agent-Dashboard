# Agents Dashboard

[Italiano](#italiano) · [English](#english)

## Italiano

Power Apps Code App in React e TypeScript per inventario e governance degli agenti, consumi e capacità Copilot Studio, saldo e policy M365 e consumi giornalieri di Cowork. Non modifica policy, limiti o agenti e non importa CSV di Cowork.

### Prerequisiti dell'app

- Node.js **22.12+** con npm (preferibilmente una versione LTS), Git e VS Code o un altro editor. Servono il **Power Platform CLI (`pac`)** per l'associazione dei connettori e il player locale e il **Power Apps CLI (`pa`)** per pubblicare in una soluzione per ID.
- Ambiente Power Platform con **Code Apps abilitate** e **Dataverse** per la soluzione. Il maker deve poter creare o aggiornare l'app nella soluzione non gestita `AgentsDashboard`. Gli utenti devono avere accesso all'app, una licenza Power Apps idonea e le autorizzazioni richieste dalle API sottostanti. Le policy dati (DLP) devono consentire l'uso congiunto dei quattro connettori.
- Account Entra di lavoro o scuola nello stesso tenant. Per inventario e licensing report servono i ruoli delegati appropriati; il consenso OAuth non sostituisce il ruolo amministrativo. L'app non richiede un server applicativo o un database separato.

### Connettori e autenticazione

| Connettore | Backend e operazioni usate | Requisiti |
|---|---|---|
| **CopilotStudioCreditConsumption** (custom) | `https://api.powerplatform.com`, API `2024-10-01`. `GetCreditCapacity`, `ListAgentCreditLimits`, `StartAgentUsageReport`, `CheckAgentUsageReport`, `DownloadAgentUsageReport` per `FeatureDetailsPerResource`. | OAuth delegato e permessi di lettura del licensing Power Platform. Il licensing report richiede un amministratore globale, Power Platform o Dynamics 365. Il report è in anteprima pubblica. |
| **CopilotCostManagement** (custom) | `https://graph.microsoft.com/beta`. `GetTenantCreditBalance`, `ListSpendingPolicies` e `GetCoworkDailyUsage` per il servizio `cowork`. | OAuth delegato e consenso amministrativo. Il saldo richiede `CopilotCostManagement.Read.All`; per le policy verificare `CopilotCostManagement-Policy.Read.All`. Il report aggregato Cowork supporta `CopilotCostManagement-Reports.Read.All` o il più ampio `CopilotCostManagement.Read.All`, già necessario per il saldo. L'account deve anche superare i controlli di ruolo di Graph. |
| **Power Platform for Admins V2** (standard) | Inventario del tenant, ambienti e metadati degli agenti (`QueryResources`, `ListEnvironmentsForUser`). | Connessione **OAuth Connection** con un utente autorizzato a leggere l'inventario e gli ambienti del tenant. L'inventario non supporta il token di un service principal. |
| **Office 365 Users** (standard) | Risoluzione di nome e indirizzo del proprietario dell'agente (`UserProfile_V2`). | Connessione OAuth a M365 e permesso di leggere i profili richiesti. Un profilo non accessibile resta non disponibile. |

Per ciascun custom connector:

1. Installa o importa la definizione OpenAPI di base del connettore nella sua soluzione. I file in [`connectors`](./connectors) sono **estensioni** da unire alla definizione di base, non esportazioni complete.
2. Nella scheda **Security**, imposta OAuth 2.0 con Microsoft Entra ID e usa un'app registrata nel tenant. Registra come redirect URI **Web** l'URL esatto generato dal connettore. Usa `https://api.powerplatform.com` come risorsa OAuth per Copilot Studio e `https://graph.microsoft.com` per Cost Management. Configura solo i permessi delegati richiesti, concedi il consenso amministrativo dove previsto e inserisci il segreto corrente nella configurazione protetta di Power Platform. Non salvarlo nel codice, in `VITE_*` o negli export.
3. Per Copilot Studio aggiungi le [operazioni del report](./connectors/copilot-studio-usage/report-operations.json) e carica lo [script](./connectors/copilot-studio-usage/script.csx) **solo** per `StartAgentUsageReport`, `CheckAgentUsageReport` e `DownloadAgentUsageReport`. Espone l'ID del job e `Retry-After` e converte il download in una risposta leggibile dall'SDK. Per Cost Management aggiungi l'[operazione Cowork](./connectors/copilot-cost-management/cowork-operations.json) al connettore Graph; mantiene la definizione `ODataError` esistente e non richiede uno script.
4. Crea e testa una connessione OAuth per ogni connettore nell'ambiente dell'app. Verifica almeno inventario, capacità, report Copilot Studio, saldo M365 e report Cowork su un giorno UTC completo. Per Cowork una risposta da Graph *usage unavailable* è valida e non equivale a zero. Non confonderla con una route non installata.

I custom connector rimangono in soluzioni separate dall'app. Conserva [power.config.json](./power.config.json), `.power/schemas/`, i client generati e `package-lock.json`: sono configurazione, metadati e dipendenze per il build, non credenziali. Prima di condividere la cartella verifica comunque gli identificatori associati al tuo ambiente. Il [`.gitignore`](./.gitignore) esclude dipendenze, output, configurazioni locali, segreti ed export di soluzione locali.

### Avvio, rigenerazione e pubblicazione

Da PowerShell, nella cartella del progetto:

```powershell
npm ci
pac auth select --name AgentConsumption
npm run dev
```

In un secondo terminale:

```powershell
pac code run --port 8181 --appUrl http://localhost:5173
```

Apri il link `play/e/.../app/local` restituito da PAC e accetta, se richiesto, il consenso alle connessioni e l'accesso alla rete locale. Aprire soltanto Vite non autentica i connettori. Per sviluppo esclusivamente grafico si può impostare `$env:VITE_DATA_SOURCE='mock'` prima di `npm run dev`: la modalità campione riguarda solo l'inventario. Non usarla per il build pubblicato.

Per un nuovo ambiente crea o seleziona il profilo PAC appropriato, usa l'`environmentId` di destinazione, rimuovi l'`appId` del deployment precedente dalla nuova copia della configurazione e associa connessioni locali all'ambiente. Per ogni connettore, recupera API ID e ID connessione con `pac connection list --environment "<ENVIRONMENT_ID>"`, quindi usa `pac code add-data-source --apiId "<CONNECTOR_API_ID>" --connectionId "<CONNECTION_ID>"`. Se i due custom connector hanno nuovi nomi dati generati, allinea le chiavi in [repair-connector-clients.mjs](./scripts/repair-connector-clients.mjs), [UsageReportService.ts](./src/data/UsageReportService.ts) e [CoworkUsageService.ts](./src/data/CoworkUsageService.ts) a `.power/schemas/appschemas/dataSourcesInfo.ts`.

Rigenera e verifica:

```powershell
npm run repair:connectors
npm test
npm run lint
npm run build
```

Lo script corregge gli identificatori TypeScript prodotti da PAC e integra i metadati delle operazioni aggiuntive quando lo schema generato è ancora in cache. Per pubblicare, seleziona account e ambiente di destinazione anche in `pa`, ricava l'ID soluzione con `pa solution list` e usa `pa app push --solution-id "<SOLUTION_ID>"`. La versione pubblicata si apre nel player Power Apps e non richiede i due server locali.

### Interpretazione dei dati e diagnostica

- **Copilot Studio:** report per agente, feature e ambiente. Date UTC complete, fino a 92 giorni; il primo polling richiede di norma circa cinque minuti e rispetta `Retry-After`. Standard Harness, GitHub Harness e harness non riportato restano distinti. I crediti fatturati e non fatturati non sono intercambiabili.
- **Cowork:** scegli **Cowork** nel selettore principale, tra **Agent Builder** e **Copilot Studio**. Il periodo predefinito è di sette giorni UTC completi, con un massimo di 31 giorni; Graph restituisce una quantità per giorno. Il totale include solo i giorni riportati. Non si applicano filtri su agenti o ambienti Power Platform. Non sono inclusi utenti attivi, attività, retention, import manuali o costi in valuta.
- **Capacità e policy:** i saldi sono istantanee del tenant; non sommare il PAYG Copilot Studio, il saldo M365 e il dettaglio Cowork. Un'opzione di prezzo contrattuale stima un costo Copilot Studio; non è una fattura.
- **Errori:** per `401/403` verifica il ruolo, il tenant, gli scope e il consenso con l'utente della connessione; con `AADSTS7000215` verifica il segreto e la data di scadenza in Entra, aggiornalo nel connettore e ri-autentica se richiesto. Se l'API restituisce `429`, attendi prima di riprovare. Le chiamate Graph `/beta` possono cambiare e Microsoft non le supporta per applicazioni di produzione.

## English

React and TypeScript Power Apps Code App for agent inventory and governance, Copilot Studio consumption and capacity, M365 balances and policies, and daily Cowork consumption. It does not modify policies, limits, or agents and does not import Cowork CSV files.

### App prerequisites

- Node.js **22.12+** with npm (an LTS release is preferred), Git, and VS Code or another editor. Use the **Power Platform CLI (`pac`)** for connector binding and local playback, and the **Power Apps CLI (`pa`)** to publish by solution ID.
- A Power Platform environment with **Code Apps enabled** and **Dataverse** for the solution. The maker must be able to create or update the app in the unmanaged `AgentsDashboard` solution. Users need access to the app, an eligible Power Apps license, and the permissions required by the backing APIs. Data policies (DLP) must allow the four connectors to work together.
- A work or school Entra account in the same tenant. Inventory and licensing reports require appropriate delegated roles; OAuth consent does not replace the administrator role. The app does not require a separate application server or database.

### Connectors and authentication

| Connector | Backend and operations | Requirements |
|---|---|---|
| **CopilotStudioCreditConsumption** (custom) | `https://api.powerplatform.com`, API `2024-10-01`. `GetCreditCapacity`, `ListAgentCreditLimits`, `StartAgentUsageReport`, `CheckAgentUsageReport`, `DownloadAgentUsageReport` for `FeatureDetailsPerResource`. | Delegated OAuth and Power Platform licensing read permissions. The licensing report requires a Global, Power Platform, or Dynamics 365 Administrator. The report is in public preview. |
| **CopilotCostManagement** (custom) | `https://graph.microsoft.com/beta`. `GetTenantCreditBalance`, `ListSpendingPolicies`, and `GetCoworkDailyUsage` for the `cowork` service. | Delegated OAuth and admin consent. The balance requires `CopilotCostManagement.Read.All`; verify `CopilotCostManagement-Policy.Read.All` for policies. The aggregate Cowork report accepts `CopilotCostManagement-Reports.Read.All` or the broader `CopilotCostManagement.Read.All` already needed for the balance. The account must also pass applicable Graph role checks. |
| **Power Platform for Admins V2** (standard) | Tenant inventory, environments, and agent metadata (`QueryResources`, `ListEnvironmentsForUser`). | An **OAuth Connection** with a user authorized to read tenant inventory and environments. Inventory does not support a service principal token. |
| **Office 365 Users** (standard) | Agent owner name and address resolution (`UserProfile_V2`). | A Microsoft 365 OAuth connection with access to the requested profiles. An inaccessible profile remains unavailable. |

For each custom connector:

1. Install or import the base OpenAPI definition in its own solution. The files in [`connectors`](./connectors) are **extensions** to merge into the base definition, not complete exports.
2. In **Security**, configure Microsoft Entra ID OAuth 2.0 using an app registered in the tenant. Register the exact connector-generated redirect URL as a **Web** redirect URI. Use `https://api.powerplatform.com` as the Copilot Studio OAuth resource and `https://graph.microsoft.com` for Cost Management. Grant only the required delegated permissions, obtain admin consent where needed, and enter the current client secret in protected Power Platform connector settings. Never put the secret in code, `VITE_*` variables, or exports.
3. Add the Copilot Studio [report operations](./connectors/copilot-studio-usage/report-operations.json) and upload the [script](./connectors/copilot-studio-usage/script.csx) **only** for `StartAgentUsageReport`, `CheckAgentUsageReport`, and `DownloadAgentUsageReport`. It exposes the job ID and `Retry-After` and wraps the download for the SDK. Add the [Cowork operation](./connectors/copilot-cost-management/cowork-operations.json) to the Graph connector; it uses the existing `ODataError` definition and requires no script.
4. Create and test an OAuth connection for each connector in the app's environment. Check at least the inventory, capacity, Copilot Studio report, M365 balance, and one completed UTC day of Cowork usage. A Graph *usage unavailable* result is valid and does not mean zero. Do not confuse it with a missing connector route.

The custom connectors stay in separate solutions from the app. Keep [power.config.json](./power.config.json), `.power/schemas/`, generated clients, and `package-lock.json`: they hold build settings, metadata, and dependencies, not credentials. Review environment-specific identifiers before sharing the folder. The [`.gitignore`](./.gitignore) excludes dependencies, outputs, local settings, secrets, and local solution exports.

### Run, regenerate, and publish

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

For a new environment, create or select its PAC profile, set the target `environmentId`, remove the old deployment's `appId` from the new configuration copy, and bind that environment's connections. For every connector use `pac connection list --environment "<ENVIRONMENT_ID>"` to obtain the API and connection IDs, then run `pac code add-data-source --apiId "<CONNECTOR_API_ID>" --connectionId "<CONNECTION_ID>"`. If new connector installations generate different data-source names, align the keys in [repair-connector-clients.mjs](./scripts/repair-connector-clients.mjs), [UsageReportService.ts](./src/data/UsageReportService.ts), and [CoworkUsageService.ts](./src/data/CoworkUsageService.ts) with `.power/schemas/appschemas/dataSourcesInfo.ts`.

Regenerate and validate:

```powershell
npm run repair:connectors
npm test
npm run lint
npm run build
```

The repair script fixes TypeScript identifiers generated by PAC and supplies operation metadata when the generated connector schema is stale. To publish, select the target account and environment in `pa`, get the solution ID with `pa solution list`, then run `pa app push --solution-id "<SOLUTION_ID>"`. The published version opens in the Power Apps player without either local server.

### Data interpretation and troubleshooting

- **Copilot Studio:** report by agent, feature, and environment. Complete UTC days, at most 92 days; the first poll usually waits about five minutes and follows `Retry-After`. Standard Harness, GitHub Harness, and unreported harnesses stay separate. Billed and non-billed credits are not interchangeable.
- **Cowork:** select **Cowork** in the main product switcher, between **Agent Builder** and **Copilot Studio**. The default period is seven completed UTC days with a maximum of 31 days; Graph returns one quantity per day. Only reported days contribute to the total. Power Platform agent and environment filters do not apply. No active-user, task, retention, manual-import, or currency-cost figures are included.
- **Capacity and policies:** balances are tenant snapshots. Do not add Copilot Studio PAYG, M365 balance, and Cowork detail together. Optional contract pricing estimates Copilot Studio cost; it is not an invoice.
- **Errors:** for `401/403`, check roles, tenant, scopes, and consent for the connection user. For `AADSTS7000215`, check the secret and expiration in Entra, update the connector, and reauthenticate if prompted. If the API returns `429`, wait before retrying. Graph `/beta` endpoints can change and Microsoft does not support them for production applications.

### Microsoft Learn

- [Power Apps Code Apps requirements](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview) · [Application lifecycle management](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm) · [Custom connector authentication](https://learn.microsoft.com/en-us/connectors/custom-connectors/connection-parameters)
- [Power Platform inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api) · [Copilot Credit usage reports](https://learn.microsoft.com/en-us/power-platform/admin/programmability-tutorial-download-copilot-credit-usage-reports)
- [M365 Cost Management permissions](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview#permissions) · [Daily Cowork consumption API](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/costmanagementserviceusagerecord-get)
