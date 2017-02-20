#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const acorn = require('acorn')
const P = require('../lib/promise')
const fs = P.promisifyAll(require('fs'), { suffix: 'P' })
const mustache = require('mustache')
const path = require('path')

const ACORN_OPTIONS = {
  locations: true,
  sourceType: 'script'
}
const EMPTY_MAP = new Map()
const IGNORE = new Set([ 'defaults.js', 'idp.js', 'index.js', 'validators.js' ])
const ROUTES_DIR = path.resolve(__dirname, '../lib/routes')
const FUNCTION_EXPRESSION_TYPES = new Set([ 'FunctionExpression', 'ArrowFunctionExpression' ])
const ARRAY_TYPES = new Set([ 'ArrayExpression' ])
const RETURN_TYPES = new Set([ 'ReturnStatement' ])
const OBJECT_TYPES = new Set([ 'ObjectExpression' ])
const LITERAL_TYPES = new Set([ 'Literal' ])
const ERROR_PROPERTY_TYPES = new Set([ 'Literal', 'MemberExpression', 'BinaryExpression', 'LogicalExpression' ])
const SESSION_TOKEN_STRATEGY = /^sessionToken/
const KEY_FETCH_TOKEN_STRATEGY = /^keyFetchToken/
const NOT_ERRORS = new Set([ 'toString', 'header', 'backtrace', 'translate' ])
const TEMPLATE = fs.readFileSync(path.resolve(__dirname, 'api-docs.mustache'), { encoding: 'utf8' })

const args = parseArgs()

parseDocs(args.path)
  .then(docs => Promise.all([
    parseRoutes().then(routes => marshallRouteData(docs, routes)),
    parseValidators(),
    parseMetricsContext(),
    parseErrors()
  ]))
  .then(data => writeOutput({
    modules: data[0],
    validators: data[1],
    metricsContext: data[2],
    errors: data[3].errors,
    additionalErrorParams: data[3].additionalErrorParams
  }, args.path))
  .catch(error => {
    console.error(error.stack)
    process.exit(1)
  })

function parseArgs () {
  let outputPath

  switch (process.argv.length) {
    /* eslint-disable indent, no-fallthrough */
    case 3:
      outputPath = path.resolve(process.argv[2])
    case 2:
      break
    default:
      fail(`Usage: ${process.argv[1]} [outputPath]`)
    /* eslint-enable indent, no-fallthrough */
  }

  return {
    path: outputPath || path.resolve(__dirname, '../docs/api.md')
  }
}

function fail (message, filePath, lineNumber) {
  let debugFriendlyMessage
  if (filePath) {
    debugFriendlyMessage = `Error parsing "${filePath}"`
    if (lineNumber) {
      debugFriendlyMessage += ` at line ${lineNumber}`
    }
    debugFriendlyMessage += `:\n${message}`
  } else {
    debugFriendlyMessage = message
  }

  throw new TypeError(debugFriendlyMessage)
}

function parseDocs (docsPath) {
  return Promise.resolve({})
}

function parseRoutes () {
  return fs.readdirP(path.resolve(__dirname, '../lib/routes'))
    .then(fileNames => {
      return Promise.all(
        fileNames
          .filter(fileName => fileName.endsWith('.js') && ! IGNORE.has(fileName))
          .map(fileName => path.join(ROUTES_DIR, fileName))
          .filter(filePath => fs.statSync(filePath).isFile())
          .map(filePath => {
            return fs.readFileP(filePath)
              .then(js => ({
                path: filePath,
                node: acorn.parse(js, ACORN_OPTIONS).body
              }))
          })
      )
    })
}

function marshallRouteData (docs, files) {
  return files.map(file => {
    const filePath = file.path
    const node = file.node
    const moduleName = getModuleName(filePath)
    const variables = parseVariables(node)
    const exportedFunction = findExportedFunction(node, filePath)
    const routes = findReturnedData(exportedFunction, filePath)

    return {
      name: moduleName,
      slug: getSlug(moduleName),
      routes: routes.map(route => {
        assertType(route, OBJECT_TYPES, filePath)

        const routeMethod = findRouteMethod(route, filePath)
        const routePath = findRoutePath(route, filePath)
        const routeConfig = findRouteConfig(route, filePath)
        let routeAuthentication, routeValidation, routeResponse
        if (routeConfig) {
          routeAuthentication = findRouteAuthentication(routeConfig, filePath)
          routeValidation = findRouteValidation(routeConfig, filePath)
          routeResponse = findRouteResponse(routeConfig, filePath)
        }
        const queryParameters = marshallQueryParameters(routeValidation, variables, filePath)
        const requestBodyParameters = marshallRequestBodyParameters(routeValidation, variables, filePath)
        const responseBodyParameters = marshallResponseBodyParameters(routeResponse, variables, filePath)
        return {
          method: routeMethod,
          path: routePath,
          slug: getSlug(`${routeMethod} ${routePath}`),
          authentication: marshallAuthentication(routeAuthentication),
          hasQueryParameters: queryParameters.length > 0,
          queryParameters: queryParameters,
          hasRequestBody: requestBodyParameters.length > 0,
          requestBody: requestBodyParameters,
          hasResponseBody: responseBodyParameters.length > 0,
          responseBody: responseBodyParameters
        }
      })
    }
  })
}

function getModuleName (filePath) {
  return path.basename(filePath, '.js').replace(/^[a-z]/, character => character.toUpperCase())
}

function parseVariables (node) {
  return findVariables(node)
    .reduce((map, variable) => {
      variable.declarations.forEach(declaration => {
        if (declaration.init) {
          const value = marshallValue(declaration.init, EMPTY_MAP)
          if (value) {
            map.set(declaration.id.name, value)
          }
        }
      })
      return map
    }, new Map())
}

function findVariables (node) {
  return find(node, {
    type: 'VariableDeclaration'
  }, { array: true })
}

function find (node, criteria, options) {
  options = options || {}

  if (match(node, criteria)) {
    return [ node ]
  }

  if (Array.isArray(node) && options.array) {
    return node.reduce((results, property) => {
      return results.concat(find(property, criteria, options))
    }, [])
  }

  if (isObject(node) && options.recursive) {
    return Object.keys(node).reduce((results, key) => {
      return results.concat(find(node[key], criteria, options))
    }, [])
  }

  return []
}

function match (node, criteria) {
  if (! isObject(node)) {
    if (node === criteria) {
      return true
    }

    return false
  }

  if (! isObject(criteria)) {
    return false
  }

  return Object.keys(criteria).every(criteriaKey => {
    return Object.keys(node).some(nodeKey => {
      return match(node[nodeKey], criteria[criteriaKey])
    })
  })
}

function isObject (node) {
  return node && typeof node === 'object'
}

function marshallValue (node, variables) {
  switch (node.type) {
    /* eslint-disable indent */
    case 'Literal':
      return node.value

    case 'Identifier':
      return variables.get(node.name) || node.name

    case 'CallExpression': {
      let result = marshallValue(node.callee, EMPTY_MAP)
      if (node.arguments.length > 0) {
        result += `(${
          node.arguments.map(argument => marshallValue(argument, variables)).join(', ')
        })`
      }
      return result
    }

    case 'MemberExpression': {
      const unmapped = marshallValue(node.property, EMPTY_MAP)
      const mapped = marshallValue(node.property, variables)
      if (mapped !== unmapped) {
        // HACK: substitute namespaced variables
        return mapped
      }
      return `${
        marshallValue(node.object, EMPTY_MAP)
      }.${unmapped}`
    }

    case 'ObjectExpression': {
      const properties = node.properties.map(
        property => `${property.key.name}: ${
          marshallValue(property.value, variables)
        }`
      ).join(', ')
      return `{ ${properties} }`
    }
    /* eslint-enable indent */
  }
}

function findExportedFunction (node, filePath) {
  const exported = findModuleExports(node)

  if (exported.length !== 1) {
    fail(`Expected 1 export, found ${exported.length}`, filePath)
  }

  const exportedFunction = exported[0].right
  assertType(exportedFunction, FUNCTION_EXPRESSION_TYPES, filePath)

  return exportedFunction.body
}

function findModuleExports (node) {
  return findAssignmentsTo(node, {
    type: 'MemberExpression',
    object: {
      type: 'MemberExpression',
      object: {
        type: 'Identifier',
        name: 'module'
      },
      property: {
        type: 'Identifier',
        name: 'exports'
      }
    }
  })
  .concat(findAssignmentsTo(node, {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'exports'
    }
  }))
}

function findAssignmentsTo (node, lhs) {
  return find(node, {
    type: 'AssignmentExpression',
    operator: '=',
    left: lhs
  }, { recursive: true })
}

function assertType (node, types, filePath) {
  if (! node) {
    fail(`Expected type [${Array.from(types).join(',')}], found nothing`, filePath)
  }

  const nodeType = node.type

  if (! types.has(nodeType)) {
    const line = node.loc.start.line
    const column = node.loc.start.column
    fail(`Expected type [${Array.from(types).join(',')}], found "${nodeType}" at column "${column}"`, filePath, line)
  }
}

function findReturnedData (functionNode, filePath) {
  let returnedData
  if (functionNode.type === 'BlockStatement') {
    const returned = find(functionNode.body, {
      type: 'ReturnStatement'
    }, {
      array: true
    })

    if (returned.length !== 1) {
      fail(`Expected 1 return statement, found ${returned.length}`, filePath)
    }

    returnedData = returned[0].argument
  } else {
    assertType(returnedData, RETURN_TYPES, filePath)
    returnedData = functionNode.argument
  }

  if (returnedData.type === 'Identifier') {
    const routeDefinitions = find(functionNode, {
      type: 'VariableDeclarator',
      id: {
        type: 'Identifier',
        name: returnedData.name
      }
    }, {
      recursive: true
    })

    if (routeDefinitions.length !== 1) {
      fail(`Expected 1 set of route definitions, found ${routeDefinitions.length}`, filePath)
    }

    returnedData = routeDefinitions[0].init
  }

  assertType(returnedData, ARRAY_TYPES, filePath)

  return returnedData.elements
}

function findRoutePath (route, filePath) {
  return findProperty(route, 'path', LITERAL_TYPES, filePath).value
}

function findProperty (node, key, types, filePath) {
  const found = find(node.properties, {
    type: 'Property',
    kind: 'init',
    key: {
      type: 'Identifier',
      name: key
    }
  }, {
    array: true
  })[0]

  if (found) {
    assertType(found.value, types, filePath)

    return found.value
  }
}

function findRouteMethod (route, filePath) {
  return findProperty(route, 'method', LITERAL_TYPES, filePath).value
}

function findRouteConfig (route, filePath) {
  return findProperty(route, 'config', OBJECT_TYPES, filePath)
}

function findRouteAuthentication (routeConfig, filePath) {
  const routeAuthentication = findProperty(routeConfig, 'auth', OBJECT_TYPES, filePath)
  if (routeAuthentication) {
    let optional = false, tokens

    const mode = findProperty(routeAuthentication, 'mode', LITERAL_TYPES, filePath)
    if (mode && (mode.value === 'try' || mode.value === 'optional')) {
      optional = true
    }

    const strategies = findProperty(routeAuthentication, 'strategies', ARRAY_TYPES, filePath)
    if (strategies) {
      tokens = strategies.elements.map(strategy => {
        assertType(strategy, LITERAL_TYPES, filePath)
        return strategy.value
      })
    } else {
      const strategy = findProperty(routeAuthentication, 'strategy', LITERAL_TYPES, filePath)
      if (strategy) {
        tokens = [ strategy.value ]
      }
    }

    if (! tokens) {
      fail('Missing authentication strategy', filePath, routeAuthentication.loc.start.line)
    }

    return { optional, tokens }
  }
}

function findRouteValidation (routeConfig, filePath) {
  return findProperty(routeConfig, 'validate', OBJECT_TYPES, filePath)
}

function findRouteResponse (routeConfig, filePath) {
  return findProperty(routeConfig, 'response', OBJECT_TYPES, filePath)
}

function marshallQueryParameters (routeValidation, variables, filePath) {
  return marshallParameters(routeValidation, 'query', variables, filePath)
}

function marshallParameters (node, type, variables, filePath) {
  let parameters

  try {
    parameters = findProperty(node, type, OBJECT_TYPES, filePath)
  } catch (error) {
  }

  if (! parameters) {
    return []
  }

  return parameters.properties.map(parameter => ({
    name: parameter.key.name,
    description: 'TODO: description goes here',
    validation: marshallValue(parameter.value, variables)
  }))
}

function marshallRequestBodyParameters (routeValidation, variables, filePath) {
  return marshallParameters(routeValidation, 'payload', variables, filePath)
}

function marshallResponseBodyParameters (routeResponse, variables, filePath) {
  return marshallParameters(routeResponse, 'schema', variables, filePath)
}

function marshallAuthentication (authentication) {
  if (! authentication) {
    return
  }

  const tokens = authentication.tokens.map(token => {
    return marshallToken(token)
  }).reduce((deduped, token) => {
    if (deduped.indexOf(token) === -1) {
      deduped.push(token)
    }
    return deduped
  }, [])

  return {
    emojis: `:lock:${authentication.optional ? ':question:' : ''}`,
    token: tokens.join(', '),
    summary: tokens.sort((lhs, rhs) => {
      // Move OAuth tokens to the front of the list as a concession to readability
      if (lhs === 'oauthToken') {
        return -1
      }
      if (rhs === 'oauthToken') {
        return 1
      }
      return 0
    }).reduce((summary, token, index) => {
      if (token === 'oauthToken') {
        summary += 'authenticated with OAuth bearer token'
      } else {
        summary += `${index === 0 ? '' : ', or '}HAWK-authenticated with ${uncamel(token)}`
      }
      return summary
    }, authentication.optional ? 'Optionally ' : '')
  }
}

function marshallToken (token) {
  if (SESSION_TOKEN_STRATEGY.test(token)) {
    return 'sessionToken'
  }

  if (KEY_FETCH_TOKEN_STRATEGY.test(token)) {
    return 'keyFetchToken'
  }

  return token
}

function uncamel (string) {
  return string.replace(/[A-Z]/g, uppercase => ` ${uppercase.toLowerCase()}`)
}

function getSlug (string) {
  return string.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9_-]/g, '')
}

function parseValidators () {
  return parseModuleExports('../lib/routes/validators')
}

function parseModuleExports (relativePath) {
  return parseModule(relativePath)
    .then(node => {
      const variables = parseVariables(node)
      return findModuleExports(node)
        .map(moduleExports => ({
          key: moduleExports.left.property.name,
          value: marshallValue(moduleExports.right, variables)
        }))
        .filter(moduleExports => !! moduleExports.value)
    })
}

function parseModule (relativePath) {
  return fs.readFileP(`${path.resolve(__dirname, relativePath)}.js`)
    .then(js => acorn.parse(js, ACORN_OPTIONS).body)
}

function parseMetricsContext () {
  return parseModuleExports('../lib/metrics/context')
}

function parseErrors () {
  return parseModule('../lib/error')
    .then(node => {
      const declarations = findVariables(node)
        .reduce((variables, variable) => variables.concat(variable.declarations), [])
      const errno = filterDeclarations(declarations, 'ERRNO')
      const defaults = filterDeclarations(declarations, 'DEFAULTS')

      assertType(errno, OBJECT_TYPES, 'lib/error.js')
      assertType(defaults, OBJECT_TYPES, 'lib/error.js')

      const errnoMap = parseObject(errno, EMPTY_MAP)
      const defaultsMap = parseObject(defaults, errnoMap)

      const result = findAppErrors(node)
        .reduce(
          marshallErrors.bind(null, errnoMap, defaultsMap),
          { errors: [], additionalErrorParams: [] }
        )

      return {
        errors: result.errors.sort((lhs, rhs) => lhs.errno - rhs.errno),
        additionalErrorParams: result.additionalErrorParams.sort((lhs, rhs) => lhs.errno - rhs.errno)
      }
    })
}

function filterDeclarations (declarations, name) {
  return declarations.filter(
    declaration => declaration.init && declaration.id.name === name
  )[0].init
}

function parseObject (object, variables) {
  return new Map(object.properties.map(property => [
    property.key.name, marshallValue(property.value, variables)
  ]))
}

function findAppErrors (node) {
  return findAssignmentsTo(node, {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'AppError'
    }
  }).filter(assignment => ! NOT_ERRORS.has(assignment.left.property.name))
}

function marshallErrors (errnoMap, defaultsMap, result, errorFunction) {
  const returns = find(errorFunction, {
    type: 'ReturnStatement',
    argument: {
      type: 'NewExpression',
      callee: {
        type: 'Identifier',
        name: 'AppError'
      }
    }
  }, { recursive: true })

  returns.forEach(r => {
    let code, errno, message
    const args = r.argument.arguments
    if (args) {
      const error = args[0]
      assertType(error, OBJECT_TYPES, 'lib/error.js')
      code = marshallErrorProperty(error, 'code')
      errno = marshallErrorProperty(error, 'errno', errnoMap)
      message = marshallErrorProperty(error, 'message')

      if (args.length > 1) {
        const params = args[1].properties
        result.additionalErrorParams.push({
          errno: errno || defaultsMap.get('errno'),
          hasParams: params && params.length > 0,
          params: params && params.map(arg => arg.key.name).join(', ')
        })
      }
    }

    result.errors.push({
      code: code || defaultsMap.get('code'),
      errno: errno || defaultsMap.get('errno'),
      definition: message || defaultsMap.get('message')
    })
  })

  return result
}

function marshallErrorProperty (node, name, errnoMap) {
  const property = findProperty(node, name, ERROR_PROPERTY_TYPES, 'lib/error.js')

  if (property) {
    switch (property.type) {
      /* eslint-disable indent */
      case 'Literal':
        return property.value

      case 'BinaryExpression':
        // HACK: This just happens to be the value we want in one case we're interested in
        return property.left.value

      case 'LogicalExpression':
        // HACK: This just happens to be the value we want in one case we're interested in
        return property.right.value

      case 'MemberExpression':
        if (errnoMap && property.object.name === 'ERRNO') {
          return errnoMap.get(property.property.name)
        }
      /* eslint-enable indent */
    }
  }
}

function writeOutput (data, outputPath) {
  fs.writeFileSync(outputPath, mustache.render(TEMPLATE, data), { mode: 0o644 })
}

