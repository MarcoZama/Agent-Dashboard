# Agents Dashboard

Italiano · [English](./README.md)

Power Apps Code App in React e TypeScript per inventario e governance degli agenti, consumi e capacità Copilot Studio, saldo e policy M365 e consumi giornalieri di Cowork. Non modifica policy, limiti o agenti e non importa CSV di Cowork.

## Prerequisiti dell'app

- Node.js **22.12+** con npm (preferibilmente una versione LTS), Git e VS Code o un altro editor. Servono il **Power Platform CLI (`pac`)** per l'associazione dei connettori e il player locale e il **Power Apps CLI (`pa`)** per pubblicare in una soluzione per ID.
- Ambiente Power Platform con **Code Apps abilitate** e **Dataverse** per la soluzione. Il maker deve poter creare o aggiornare l'app nella soluzione non gestita `AgentsDashboard`. Gli utenti devono avere accesso all'app, una licenza Power Apps idonea e le autorizzazioni richieste dalle API sottostanti. Le policy dati (DLP) devono consentire l'uso congiunto dei quattro connettori.
- Account Entra di lavoro o scuola nello stesso tenant. Per inventario e licensing report servono i ruoli delegati appropriati; il consenso OAuth non sostituisce il ruolo amministrativo. L'app non richiede un server applicativo o un database separato.

## Connettori e autenticazione

Le soluzioni originali dei connettori sono nell'ambiente Power Apps di test e richiedono accesso al tenant:

- [CopilotStudioCreditConsumption](https://make.powerapps.com/environments/90d9d59b-8118-e2c8-9726-1899715d4443/solutions/3465acc8-0fc7-442c-bf9c-cf2cc3043408/overview?tenant=cd24ae47-6aca-4419-973f-ea765b169335)
- [CopilotCostManagment](https://make.powerapps.com/environments/90d9d59b-8118-e2c8-9726-1899715d4443/solutions/3d88cd0c-d3eb-43d2-be76-83cc6cae065e/overview?tenant=cd24ae47-6aca-4419-973f-ea765b169335) (nome della soluzione che contiene `CopilotCostManagement`)

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

## Avvio, rigenerazione e pubblicazione

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

## Soluzioni gestite e release

Il workflow [Code App build](./.github/workflows/code-app-pr.yml) esegue build, test e lint sulle PR verso `main` e sui tag di release. Per una PR interna riuscita, [Code App managed solution](./.github/workflows/code-app-solution.yml) unisce la build ai [metadati versionati della soluzione](./solution) ed esegue `pac solution pack --packagetype Managed`. Verifica il manifest e gli hash degli asset prima di caricare `AgentsDashboard_managed.zip` in **Actions → Code App managed solution → Artifacts**, con versione di anteprima `1.0.<run>.<tentativo>`. Le PR da fork eseguono solo la build e i controlli.

Per una **GitHub Release**, pubblica un tag `vX.Y.Z` su un commit già presente su `main`. La pipeline prepara e verifica la soluzione con versione Dataverse `X.Y.Z.0`, poi allega lo ZIP in **Releases**. Le PR non pubblicano release.

Il packaging usa PAC CLI su un runner Windows di GitHub. Non accede a Dataverse, non richiede credenziali Power Platform o sandbox e non pubblica l'app. Lo [script di packaging](./scripts/Pack-CodeAppSolution.ps1) rigenera l'elenco degli asset dalla build corrente; i metadati conservano publisher, identità dell'app e dipendenze dai custom connector della soluzione gestita originale.

Per un collaudo d'importazione, installa prima le due soluzioni dei connettori nell'ambiente Dataverse di destinazione e associa le connessioni di destinazione. Riserva ai responsabili delle release la creazione e la modifica dei tag `v*` e verifica l'import prima di distribuire il pacchetto.

## Interpretazione dei dati e diagnostica

- **Copilot Studio:** report per agente, feature e ambiente. Date UTC complete, fino a 92 giorni; il primo polling richiede di norma circa cinque minuti e rispetta `Retry-After`. Standard Harness, GitHub Harness e harness non riportato restano distinti. I crediti fatturati e non fatturati non sono intercambiabili.
- **Cowork:** scegli **Cowork** nel selettore principale, tra **Agent Builder** e **Copilot Studio**. Il periodo predefinito è di sette giorni UTC completi, con un massimo di 31 giorni; Graph restituisce una quantità per giorno. Il totale include solo i giorni riportati. Non si applicano filtri su agenti o ambienti Power Platform. Non sono inclusi utenti attivi, attività, retention, import manuali o costi in valuta.
- **Capacità e policy:** i saldi sono istantanee del tenant; non sommare il PAYG Copilot Studio, il saldo M365 e il dettaglio Cowork. Un'opzione di prezzo contrattuale stima un costo Copilot Studio; non è una fattura.
- **Errori:** per `401/403` verifica il ruolo, il tenant, gli scope e il consenso con l'utente della connessione; con `AADSTS7000215` verifica il segreto e la data di scadenza in Entra, aggiornalo nel connettore e ri-autentica se richiesto. Se l'API restituisce `429`, attendi prima di riprovare. Le chiamate Graph `/beta` possono cambiare e Microsoft non le supporta per applicazioni di produzione.

## Microsoft Learn

- [Power Apps Code Apps requirements](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview) · [Application lifecycle management](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm) · [Custom connector authentication](https://learn.microsoft.com/en-us/connectors/custom-connectors/connection-parameters)
- [Power Platform inventory API](https://learn.microsoft.com/en-us/power-platform/admin/inventory-api) · [Copilot Credit usage reports](https://learn.microsoft.com/en-us/power-platform/admin/programmability-tutorial-download-copilot-credit-usage-reports)
- [M365 Cost Management permissions](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/overview#permissions) · [Daily Cowork consumption API](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/admin-settings/cost-management/costmanagementserviceusagerecord-get)
