import { readFileSync, writeFileSync } from 'node:fs'

// PAC currently emits invalid identifiers for these HTTP parameter names.
for (const name of ['CopilotStudioCreditConsumption', 'CopilotCostManagement']) {
  const file = new URL(`../src/generated/services/${name}Service.ts`, import.meta.url)
  const source = readFileSync(file, 'utf8')
  const repaired = source.split('\n').map((line) => {
    if (line.includes('public static async')) {
      return line
        .replaceAll('api-version: string', "apiVersion: string = '2024-10-01'")
        .replaceAll('If-Match?: string', 'ifMatch?: string')
    }
    return line
      .replaceAll('api-version: string', "'api-version': string")
      .replaceAll('If-Match?: string', "'If-Match'?: string")
      .replaceAll(', api-version }', ", 'api-version': apiVersion }")
      .replaceAll(', If-Match }', ", 'If-Match': ifMatch }")
  }).join('\n')
  if (repaired !== source) writeFileSync(file, repaired)
}

const modelFile = new URL('../src/generated/models/Cat_copilotconfigurationsModel.ts', import.meta.url)
const model = readFileSync(modelFile, 'utf8')
const repairedModel = model.replace(
  'extends Cat_copilotconfigurationsBase {',
  'extends Cat_copilotconfigurationsBase, Record<string, unknown> {',
)
if (repairedModel !== model) writeFileSync(modelFile, repairedModel)

// PAC can still retrieve an earlier schema after the live connector is updated.
const dataSourceFile = new URL('../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url)
const dataSourceText = readFileSync(dataSourceFile, 'utf8')
const start = dataSourceText.indexOf('export const dataSourcesInfo = ')
if (start < 0) throw new Error('Could not locate PAC connector metadata')
const prefixEnd = start + 'export const dataSourcesInfo = '.length
const dataSources = JSON.parse(dataSourceText.slice(prefixEnd).trim().replace(/;$/, ''))
const overlays = {
  zama_5fcopilotstudiocreditconsumption_5fb043a1f4407b1320: 'copilot-studio-usage/report-operations.json',
  zama_5fcopilotcostmanagement_5fb043a1f4407b1320: 'copilot-cost-management/cowork-operations.json',
}
for (const [source, file] of Object.entries(overlays)) {
  const schema = JSON.parse(readFileSync(new URL(`../connectors/${file}`, import.meta.url), 'utf8'))
  const connector = dataSources[source]
  if (!connector?.apis) throw new Error(`Connector ${source} is not bound`)
  for (const [path, methods] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      connector.apis[operation.operationId] = {
        path: `/{connectionId}${path}`,
        method: method.toUpperCase(),
        parameters: [
          { name: 'connectionId', in: 'path', required: true, type: 'string' },
          ...operation.parameters.map((parameter) =>
            parameter.$ref
              ? { name: 'api-version', in: 'query', required: true, type: 'string' }
              : { name: parameter.name, in: parameter.in, required: parameter.required, type: parameter.type ?? 'object' },
          ),
        ],
        responseInfo: Object.fromEntries(Object.entries(operation.responses).map(([code, response]) => [
          code, { type: response.schema ? 'object' : 'void' },
        ])),
      }
    }
  }
}
const updatedDataSources = `${dataSourceText.slice(0, prefixEnd)}${JSON.stringify(dataSources, null, 2)};\n`
if (dataSourceText !== updatedDataSources) writeFileSync(dataSourceFile, updatedDataSources)
