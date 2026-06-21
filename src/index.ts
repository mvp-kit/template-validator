/**
 * @mvp-kit/template-validation
 *
 * Validates that MVPKit templates only use approved variables
 */

import fs from 'fs'
import path from 'path'

export interface ValidationOptions {
  templateType?: 'core' | string
  directory?: string
  verbose?: boolean
}

export interface ValidationResult {
  isValid: boolean
  files: Array<{
    file: string
    isValid: boolean
    variables: string[]
    errors: string[]
  }>
  summary: {
    total: number
    valid: number
    invalid: number
  }
}

const LEGACY_TEMPLATE_VARIABLE_ROOTS = [
  'projectName',
  'projectDescription',
  'domainName',
  'socialGithubHandle',
  'socialXHandle',
  'socialInstagramHandle',
  'socialTiktokHandle',
  'schemaTemplateUrl',
  'displayName'
] as const

// Base allowed variables (common to all templates)
const BASE_ALLOWED_VARIABLES = [
  // Base variables
  'name',
  'description',
  'domain',
  'executionDate',
  'tagline',
  'social',
  'packageManager',
  'packageManagerVersion',

  // Handlebars conditionals
  'eq',  // {{#if (eq packageManager 'pnpm')}}
] as const

// Template-specific variables (currently only core)
const TEMPLATE_SPECIFIC_VARIABLES: Record<string, string[]> = {
  core: [
    // Core template uses only base variables - clean and simple
  ],
  saas: [
    // SaaS currently uses base variables only
  ]
}

/**
 * Get allowed variables for a specific template type
 */
export function getAllowedVariables(templateType: string = 'core'): string[] {
  const specific = TEMPLATE_SPECIFIC_VARIABLES[templateType] || []
  return [...BASE_ALLOWED_VARIABLES, ...specific]
}

/**
 * Extract Handlebars variables from template content
 */
export function extractTemplateVariables(content: string): string[] {
  const variableRegex = /\{\{([^}]+)\}\}/g
  const variables: string[] = []
  let match

  while ((match = variableRegex.exec(content)) !== null) {
    const expression = match[1].trim()

    if (expression.startsWith('#if')) {
      // {{#if (eq packageManager 'pnpm')}} -> extract 'packageManager'
      const ifMatch = expression.match(/\(eq\s+([\w.]+)/)
      if (ifMatch) {
        variables.push(ifMatch[1])
      }
    } else if (expression.startsWith('/if') || expression.startsWith('#') || expression.startsWith('/')) {
      // Skip closing tags and other block helpers
      continue
    } else {
      // Only allow simple handlebars variable paths, e.g. {{name}} or {{social.github.handle}}
      if (/^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(expression)) {
        variables.push(expression)
      }
    }
  }

  return [...new Set(variables)] // Remove duplicates
}

/**
 * Allow exact variable matches and nested object paths via root key:
 * - allowed: social
 * - template use: social.github.handle
 */
function isAllowedVariable(variable: string, allowedVariables: string[]): boolean {
  if (allowedVariables.includes(variable)) {
    return true
  }

  const rootKey = variable.split('.')[0]
  return allowedVariables.includes(rootKey)
}

/**
 * Find all .template files recursively
 */
export function findTemplateFiles(dir: string = '.'): string[] {
  const files: string[] = []

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir)

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        // Skip common ignore patterns
        if (!['node_modules', '.git', 'dist', '.turbo', '.next', '.wrangler'].includes(entry)) {
          scan(fullPath)
        }
      } else if (entry.endsWith('.template')) {
        files.push(path.relative(dir, fullPath))
      }
    }
  }

  scan(dir)
  return files
}

/**
 * Validate a single template file
 */
export function validateTemplateFile(filePath: string, allowedVariables: string[]) {
  const content = fs.readFileSync(filePath, 'utf8')
  const variables = extractTemplateVariables(content)
  const errors: string[] = []

  for (const variable of variables) {
    if (!isAllowedVariable(variable, allowedVariables)) {
      errors.push(`Unauthorized variable: {{${variable}}}`)
    }
  }

  return {
    isValid: errors.length === 0,
    variables,
    errors
  }
}

/**
 * Detect known template variables in non-.template files.
 * This catches drift where placeholders are left in files that are copied as-is.
 */
export function findNonTemplateVariableUsage(
  dir: string,
  monitoredVariables: string[]
): Array<{ file: string; variables: string[] }> {
  const findings: Array<{ file: string; variables: string[] }> = []
  const monitoredRoots = new Set(monitoredVariables.map(v => v.split('.')[0]))

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir)

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        if (!['node_modules', '.git', 'dist', '.turbo', '.next', '.wrangler', 'examples', '_scripts', 'references'].includes(entry)) {
          scan(fullPath)
        }
        continue
      }

      if (entry.endsWith('.template')) {
        continue
      }

      let content: string
      try {
        content = fs.readFileSync(fullPath, 'utf8')
      } catch {
        continue
      }

      const variables = extractTemplateVariables(content)
      const knownTemplateVariables = variables.filter(variable => monitoredRoots.has(variable.split('.')[0]))

      if (knownTemplateVariables.length > 0) {
        findings.push({
          file: path.relative(dir, fullPath),
          variables: [...new Set(knownTemplateVariables)]
        })
      }
    }
  }

  scan(dir)
  return findings
}

/**
 * Detect template type from directory or options
 */
export function detectTemplateType(options: ValidationOptions = {}): string {
  if (options.templateType) {
    return options.templateType
  }

  // Detect from current directory name
  const currentDir = path.basename(options.directory || process.cwd())
  if (['core', 'saas', 'ai'].includes(currentDir)) {
    return currentDir
  }

  // Default to core
  return 'core'
}

/**
 * Main validation function
 */
export async function validateTemplates(options: ValidationOptions = {}): Promise<ValidationResult> {
  const templateType = detectTemplateType(options)
  const allowedVariables = getAllowedVariables(templateType)
  const directory = options.directory || process.cwd()
  const monitoredVariables = [...allowedVariables, ...LEGACY_TEMPLATE_VARIABLE_ROOTS]

  // Find all template files
  const templateFiles = findTemplateFiles(directory)

  const results = templateFiles.map(filePath => {
    const fullPath = path.resolve(directory, filePath)
    const result = validateTemplateFile(fullPath, allowedVariables)

    return {
      file: filePath,
      ...result
    }
  })

  const nonTemplateFindings = findNonTemplateVariableUsage(directory, monitoredVariables).map(finding => ({
    file: finding.file,
    isValid: false,
    variables: finding.variables,
    errors: [
      `Known template variables found in non-template file: ${finding.variables.map(v => `{{${v}}}`).join(', ')}`
    ]
  }))

  const allResults = [...results, ...nonTemplateFindings]

  const validCount = allResults.filter(r => r.isValid).length
  const invalidCount = allResults.length - validCount

  return {
    isValid: invalidCount === 0,
    files: allResults,
    summary: {
      total: allResults.length,
      valid: validCount,
      invalid: invalidCount
    }
  }
}
