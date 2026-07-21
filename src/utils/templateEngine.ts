// src/utils/templateEngine.ts
// Simple Mustache-like template engine for Data Lens AI
//
// Supports:
// - Single values: {{name}} or {{name.field}}
// - Array loops: {{#items}}...{{/items}}
// - Conditionals: {{?hasData}}...{{/hasWarning}}
// - Formatters: {{value | currency}}, {{value | number}}, {{value | percent}}, {{value | compact}}

function formatValue(value: any, format: string): string {
  if (value === null || value === undefined) return ''
  
  switch (format.trim()) {
    case 'currency':
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(Number(value))
    
    case 'currency_decimal':
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value))
    
    case 'number':
      return new Intl.NumberFormat('en-US').format(Number(value))
    
    case 'number_decimal':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(value))
    
    case 'percent':
      return `${(Number(value) * 100).toFixed(1)}%`
    
    case 'percent_whole':
      return `${Math.round(Number(value) * 100)}%`
    
    case 'compact':
      return new Intl.NumberFormat('en-US', { 
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(Number(value))
    
    default:
      return String(value)
  }
}

function getValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  
  const parts = path.split('.')
  let current = obj
  
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  
  return current
}

export function renderTemplate(template: string, variables: Record<string, any>): string {
  if (!template) return ''
  
  let result = template
  
  // 1. Handle array loops {{#arrayName}}...{{/arrayName}}
  const loopRegex = /\{\{#([^\s{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g
  result = result.replace(loopRegex, (_, arrayName, content) => {
    const arr = variables[arrayName]
    
    if (!Array.isArray(arr)) {
      console.warn(`Template: Expected array for {{#${arrayName}}}, got:`, typeof arr)
      return ''
    }
    
    return arr.map((item, index) => {
      const itemContext = {
        ...variables,
        ...(typeof item === 'object' ? item : { value: item }),
        _index: index,
        _first: index === 0,
        _last: index === arr.length - 1
      }
      
      return renderTemplate(content, itemContext)
    }).join('')
  })
  
  // 2. Handle conditional blocks {{?name}}...{{/name}}
  const conditionalRegex = /\{\{\?([^\s{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g
  result = result.replace(conditionalRegex, (_, path, content) => {
    const value = getValue(variables, path)
    // Accept arrays with elements or non-empty/truthy values
    const isTruthy = Array.isArray(value) ? value.length > 0 : !!value
    return isTruthy ? renderTemplate(content, variables) : ''
  })
  
  // 3. Handle single values {{name}}, {{name.field}}, {{name | format}}
  const valueRegex = /\{\{([^{}|]+?)\s*(?:\|\s*([^{}]+))?\}\}/g
  result = result.replace(valueRegex, (match, rawPath, format) => {
    const path = rawPath.trim()
    const value = getValue(variables, path)
    
    if (value === null || value === undefined) {
      console.debug(`Template: Variable "${path}" not found in variables`)
      return '' // return empty instead of placeholder in production
    }
    
    if (format) {
      return formatValue(value, format.trim())
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    
    return String(value)
  })
  
  return result
}
