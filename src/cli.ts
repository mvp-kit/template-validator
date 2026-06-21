#!/usr/bin/env node

/**
 * CLI for @mvp-kit/template-validator
 */

import { validateTemplates, detectTemplateType, getAllowedVariables } from './index.js'

interface CLIOptions {
  templateType?: string
  directory?: string
  verbose?: boolean
  test?: boolean
  help?: boolean
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2)
  const options: CLIOptions = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--type':
      case '-t':
        options.templateType = args[++i]
        break
      case '--dir':
      case '-d':
        options.directory = args[++i]
        break
      case '--verbose':
      case '-v':
        options.verbose = true
        break
      case '--test':
        options.test = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        // Assume it's a template type if it's a known type
        if (['core', 'saas'].includes(arg)) {
          options.templateType = arg
        }
        break
    }
  }

  return options
}

function showHelp() {
  console.log(`
🛡️ MVPKit Template Validator

USAGE:
  mvpkit-validate [template-type] [options]

TEMPLATE TYPES:
  core      Core React starter template (default)
  saas      SaaS starter template

OPTIONS:
  -t, --type <type>     Specify template type
  -d, --dir <path>      Directory to validate (default: current)
  -v, --verbose         Verbose output
  --test                Run self-test
  -h, --help            Show this help

EXAMPLES:
  mvpkit-validate                    # Validate current directory (auto-detect type)
  mvpkit-validate core               # Validate as core template
  mvpkit-validate --dir ./templates  # Validate specific directory

CI USAGE:
  - name: Validate templates
    run: npx @mvp-kit/template-validator@latest core --dir "$PWD"
`)
}

async function runSelfTest() {
  console.log('🧪 Running self-test...')

  // Test variable extraction
  const testContent = '{"name": "{{name}}", "domain": "{{domain}}"}'
  const { extractTemplateVariables } = await import('./index.js')
  const variables = extractTemplateVariables(testContent)

  if (variables.includes('name') && variables.includes('domain')) {
    console.log('✅ Variable extraction test passed')
  } else {
    console.log('❌ Variable extraction test failed')
    process.exit(1)
  }

  // Test template type detection
  const templateType = detectTemplateType({ templateType: 'core' })
  if (templateType === 'core') {
    console.log('✅ Template type detection test passed')
  } else {
    console.log('❌ Template type detection test failed')
    process.exit(1)
  }

  console.log('🎉 All tests passed!')
}

async function main() {
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  if (options.test) {
    await runSelfTest()
    return
  }

  try {
    const result = await validateTemplates(options)
    const templateType = detectTemplateType(options)

    // Report results
    console.log(`🔍 Validating ${templateType.toUpperCase()} template variables...`)

    if (result.summary.total === 0) {
      console.log('⚠️  No template files found')
      return
    }

    console.log(`\n📊 Validation Results (${result.summary.total} files):`)

    for (const file of result.files) {
      if (file.isValid) {
        console.log(`✅ ${file.file}`)
        if (options.verbose && file.variables.length > 0) {
          console.log(`   Variables: ${file.variables.map((v: string) => `{{${v}}}`).join(', ')}`)
        }
      } else {
        console.log(`❌ ${file.file}`)
        for (const error of file.errors) {
          console.log(`   ${error}`)
        }
      }
    }

    // Summary
    console.log('\n📈 Summary:')
    console.log(`✅ Valid: ${result.summary.valid}`)
    if (result.summary.invalid > 0) {
      console.log(`❌ Invalid: ${result.summary.invalid}`)
    }

    // Show allowed variables if there are errors
    if (!result.isValid) {
      console.log(`\n📋 Allowed Variables for ${templateType.toUpperCase()}:`)
      console.log('Base variables:')
      console.log('  {{name}}, {{description}}, {{domain}}, {{executionDate}}, {{tagline}}, {{social.*}}')
      console.log('  {{packageManager}}, {{packageManagerVersion}}')

      if (templateType === 'saas') {
        console.log('Additional variables:')
        console.log('  (none)')
      }

      console.log('Handlebars helpers:')
      console.log('  {{#if (eq packageManager "pnpm")}}')
    }

    if (result.isValid) {
      console.log(`\n🎉 All ${templateType} templates valid!`)
      process.exit(0)
    } else {
      console.log('\n💥 Template validation failed!')
      console.log('Fix unauthorized variables or update allowed variables list')
      process.exit(1)
    }

  } catch (error) {
    console.error('❌ Validation error:', error)
    process.exit(1)
  }
}


main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
