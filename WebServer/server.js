
require('dotenv').config()
const { fork } = require('child_process')
const open = require('open')

CONSOLE_LOG = process.env.CONSOLE_LOG === 'true'
CONSOLE_ERROR_LOG = process.env.CONSOLE_ERROR_LOG === 'true'
LOG_FILE_CONTENT = process.env.LOG_FILE_CONTENT === 'true'

global.DEFAULT_OK_RESPONSE = {
  result: 'Ok',
  message: 'Operation Succeeded'
}

global.DEFAULT_FAIL_RESPONSE = {
  result: 'Fail',
  message: 'Operation Failed'
}

global.DEFAULT_RETRY_RESPONSE = {
  result: 'Retry',
  message: 'Retry Later'
}

global.CUSTOM_OK_RESPONSE = {
  result: 'Ok, but check Message',
  message: 'Custom Message'
}

global.CUSTOM_FAIL_RESPONSE = {
  result: 'Fail Because',
  message: 'Custom Message'
}

let port = process.env.WEB_SERVER_PORT  

process.on('uncaughtException', function (err) {
    if (err.message.indexOf("EADDRINUSE") > 0) {
        console.log("Superalgos Web Server cannot be started. Reason: the port " + port + " is already in use by another application. The web server cannot be started until either you stop the other application or you change the port number at the WebServer/.env file for an unused one. (variable name WEB_SERVER_PORT)")
        return
    }
    console.log('[ERROR] Web Server -> server -> uncaughtException -> err.message = ' + err.message)
    console.log('[ERROR] Web Server -> server -> uncaughtException -> err.stack = ' + err.stack)
    process.exit(1)
})

process.on('unhandledRejection', (reason, p) => {
    console.log('[ERROR] Web Server -> server -> unhandledRejection -> reason = ' + JSON.stringify(reason))
    console.log('[ERROR] Web Server -> server -> unhandledRejection -> p = ' + JSON.stringify(p))
    process.exit(1)
})

let http = require('http')
let isHttpServerStarted = false
let cloneExecutorChildProcess

startHtttpServer()

function startHtttpServer () {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> startHtttpServer -> Entering function.') }

  try {
    if (isHttpServerStarted === false) {
      gWebServer = http.createServer(onBrowserRequest).listen(port)
      isHttpServerStarted = true
      open('http://localhost:' + port)
      console.log('Web Server Started.')
    }
  } catch (err) {     
      console.log('[ERROR] server -> startHtttpServer -> Error = ' + err.stack)
  }
}

function startCloneExecutor () {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> startCloneExecutor -> Entering function.') };

  if (process.env.RUN_CLON_EXECUTOR !== 'true') { return }

  let path = process.env.CLONE_EXECUTOR_PATH + '/run.js'
  cloneExecutorChildProcess = fork(path, [], { stdio: 'inherit' })

  cloneExecutorChildProcess.on('error', (err) => {
    console.log(`[ERROR] server -> startCloneExecutor -> Clone Executor exited with error ${err}`)
  })
  cloneExecutorChildProcess.on('close', (code, signal) => {
    console.log(`[INFO] CloneExecutor process terminated.`)
  })
}

function stopCloneExecutor () {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> stopCloneExecutor -> Entering function.') };

  if (cloneExecutorChildProcess) {
    cloneExecutorChildProcess.send('STOP');
  }
}

function onBrowserRequest (request, response) {
  if (CONSOLE_LOG === true && request.url.indexOf('NO-LOG') === -1) { console.log('[INFO] server -> onBrowserRequest -> request.url = ' + request.url) }

  let requestParameters = request.url.split('/')

  if (requestParameters[1].indexOf('index.html') >= 0) {
    /*
    We use this to solve the problem when someone is arriving to the site with a sessionToken in the queryString. We extract here that
    token, that will be sent later embedded into the HTML code, so that it can enter into the stardard circuit where any site can put
    the sessionToken into their HTML code and from there the Browser app will log the user in.
    */

    let queryString = requestParameters[1].split('?')

    requestParameters[1] = ''
    requestParameters[2] = queryString[1]
    homePage()

    return
  }

  requestParameters = request.url.split('?') // Remove version information
  requestParameters = requestParameters[0].split('/')

  switch (requestParameters[1]) {

      case 'CCXT':
          {
                  getBody(processRequest)

                  function getBody(callback) {
                      let body = ''

                      request.on('data', function (data) {
                          body += data
                          // Too much POST data
                          if (body.length > 1e6) {
                              request.connection.destroy()
                          }
                      })

                      request.on('end', function () {
                          callback(body)
                      })
                  }
                  async function processRequest(body) {
                      try {
                      let params = JSON.parse(body)

                      const ccxt = require('ccxt')
                      
                      switch (params.method) {
                          case 'fetchMarkets': {

                              const exchangeClass = ccxt[params.exchangeId]
                              const exchangeConstructorParams = {
                                  'timeout': 30000,
                                  'enableRateLimit': true,
                                  verbose: false
                              }

                              let ccxtExchange = new exchangeClass(exchangeConstructorParams)
                              let ccxtMarkets = []

                              if (ccxtExchange.has.fetchMarkets === true) {
                                  ccxtMarkets = await ccxtExchange.fetchMarkets()
                              }
                              respondWithContent(JSON.stringify(ccxtMarkets), response)
                              return
                          }
                          case 'listExchanges': {
                              let exchanges = []
                              for (let i = 0; i < ccxt.exchanges.length; i++) {
                                  let exchangeId = ccxt.exchanges[i]

                                  const exchangeClass = ccxt[exchangeId]
                                  const exchangeConstructorParams = {
                                      'timeout': 30000,
                                      'enableRateLimit': true,
                                      verbose: false
                                  }
                                  let ccxtExchange 
                                  try { ccxtExchange = new exchangeClass(exchangeConstructorParams)}
                                  catch (err) {}
                                  if (ccxtExchange === undefined) {continue}
                                  

                                    if (ccxtExchange.has.fetchOHLCV === params.has.fetchOHLCV) {
                                        if (ccxtExchange.has.fetchMarkets === params.has.fetchMarkets) {
                                            if (ccxtExchange.timeframes['1m'] !== undefined) {
                                                let exchange = {
                                                    name: ccxtExchange.name,
                                                    id: ccxtExchange.id
                                                }
                                                exchanges.push(exchange)
                                            }
                                        }
                                    }
                              }
                              respondWithContent(JSON.stringify(exchanges), response)
                              return
                          }
                      }

                      let content = {
                          err: global.DEFAULT_FAIL_RESPONSE // method not supported
                      }
                      } catch (err) {
                          if (CONSOLE_LOG === true) { console.log('[INFO] server -> CCXT FetchMarkets -> Could not fetch markets.') }
                          let error = {
                              result: 'Fail Because',
                              message: err.message
                          }
                          respondWithContent(JSON.stringify(error), response)
                      }
                  }
                  break
          }

    case 'ResetLogsAndData':
      {
        try {
            let rimraf = require('rimraf')
            rimraf.sync(process.env.STORAGE_PATH + '/Masters/Masters/AAJason.1.0')
            rimraf.sync(process.env.LOG_PATH)

          respondWithContent(JSON.stringify(global.DEFAULT_OK_RESPONSE), response)
        } catch (err) {
          if (CONSOLE_LOG === true) { console.log('[INFO] server -> ResetLogsAndData -> Could not delete Logs and Data.') }
          let error = {
            result: 'Fail Because',
            message: err.message
          }
          respondWithContent(JSON.stringify(error), response)
        }
        break
      }
    case 'RestartCloneExecutor':
      {
        try {
          stopCloneExecutor()
          startCloneExecutor()
          respondWithContent(JSON.stringify(global.DEFAULT_OK_RESPONSE), response)
        } catch (err) {
          if (CONSOLE_LOG === true) { console.log('[INFO] server -> ResetLogsAndData -> Could not restart Clone Executor.') }
          let error = {
            result: 'Fail Because',
            message: err.message
          }
          respondWithContent(JSON.stringify(error), response)
        }

        break
      }
    case 'StopCloneExecutor':
      {
        try {
          stopCloneExecutor()
          respondWithContent(JSON.stringify(global.DEFAULT_OK_RESPONSE), response)
        } catch (err) {
          if (CONSOLE_LOG === true) { console.log('[INFO] server -> ResetLogsAndData -> Could not Stop Clone Executor.') }
          let error = {
            result: 'Fail Because',
            message: err.message
          }
          respondWithContent(JSON.stringify(error), response)
        }
        break
      }

    case 'LegacyPlotter.js':
      {
        respondWithFile(process.env.PATH_TO_WEB_SERVER +  'LegacyPlotter.js', response)
      }
      break

    case 'PlotterPanel.js':
      {
        respondWithFile(process.env.PATH_TO_WEB_SERVER +  'PlotterPanel.js', response)
      }
      break

    case 'Images': // This means the Scripts folder.
      {
        let path = process.env.PATH_TO_WEB_SERVER  +  'Images/' + requestParameters[2]

        if (requestParameters[3] !== undefined) {
          path = path + '/' + requestParameters[3]
        }

        if (requestParameters[4] !== undefined) {
          path = path + '/' + requestParameters[4]
        }

        if (requestParameters[5] !== undefined) {
          path = path + '/' + requestParameters[5]
        }

        path = unescape(path)

        respondWithImage(path, response)
      }
      break

    case 'favicon.ico': // This means the Scripts folder.
      {
              respondWithImage(process.env.PATH_TO_WEB_SERVER +  'Images/' + 'favicon.ico', response)
      }
      break

    case 'CockpitSpace': // This means the CockpitSpace folder.
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/CockpitSpace/' + requestParameters[2], response)
      }
      break

    case 'TopSpace': // This means the TopSpace folder.
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/TopSpace/' + requestParameters[2], response)
      }
      break

    case 'DesignSpace': // This means the DesignSpace folder.

      {
        if (requestParameters[3] === undefined) {
          respondWithFile(process.env.PATH_TO_CANVAS_APP + '/DesignSpace/' + requestParameters[2], response)
          return
        }
        if (requestParameters[4] === undefined) {
          respondWithFile(process.env.PATH_TO_CANVAS_APP + '/DesignSpace/' + requestParameters[2] + '/' + requestParameters[3], response)
          return
        }
        if (requestParameters[5] === undefined) {
          respondWithFile(process.env.PATH_TO_CANVAS_APP + '/DesignSpace/' + requestParameters[2] + '/' + requestParameters[3] + '/' + requestParameters[4], response)
          return
        }
      }
      break

    case 'ControlsToolBox': // This means the DesignSpace folder.
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/ControlsToolBox/' + requestParameters[2], response)
      }
      break

    case 'Utilities': // This means the DesignSpace folder.
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/Utilities/' + requestParameters[2], response)
      }
      break

    case 'Scripts': // This means the Scripts folder.
      {
        respondWithFile(process.env.PATH_TO_WEB_SERVER +  'Scripts/' + requestParameters[2], response)
      }
      break

    case 'externalScripts': // This means the Scripts folder.
        {
              respondWithFile(process.env.PATH_TO_WEB_SERVER + 'externalScripts/' + requestParameters[2], response)
        }
        break

    case 'Plotters': // This means the plotter folder, not to be confused with the Plotters script!
      {
        let dataMine = requestParameters[2]
        let codeName = requestParameters[3]
        let moduleName = requestParameters[4]
        let filePath = process.env.PLOTTERS_PATH + '/' + dataMine + '/plotters/' + codeName + '/' + moduleName
        respondWithFile(filePath, response)
      }
      break

    case 'PlotterPanels': // This means the PlotterPanels folder, not to be confused with the Plotter Panels scripts!
      {
        let dataMine = requestParameters[2]
        let codeName = requestParameters[3]
        let moduleName = requestParameters[4]
        let filePath = process.env.PLOTTERS_PATH + '/' + dataMine + '/plotters/' + codeName + '/' + moduleName
        respondWithFile(filePath, response)
      }
      break
    case 'Panels':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'ChartLayers':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'Spaces':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'Scales':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'Files':
      {
        respondWithFile(process.env.PATH_TO_FILES_COMPONENT + '/' + requestParameters[2], response)
      }
      break

    case 'FloatingSpace':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'ChartingSpace':
      {
        respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1] + '/' + requestParameters[2], response)
      }
      break

    case 'AppSchema.js':
        {
            let fs = require('fs')

            try {
                let filePath = process.env.APP_SCHEMA_PATH + 'AppSchema.json'
                fs.readFile(filePath, onFileRead)
            } catch (e) {
                console.log('[ERROR] Error reading the App Schema.', e)
            }

            function onFileRead(err, appSchema) {
                if (err) {
                    respondWithContent(undefined, response)
                } else {
                    let responseContent = 'function getAppSchema(){ return ' + appSchema + '}'
                    respondWithContent(responseContent, response)
                }
            }
        }
        break

    case 'Workspace.js':
        {
            let fs = require('fs')

            try {
                let filePath = process.env.WORKSPACE_PATH + 'Workspace.json'
                fs.readFile(filePath, onFileRead)
            } catch (e) {
                console.log('[ERROR] Error reading the Workspace.', e)
            }

            function onFileRead(err, workspace) {
                if (err) {
                    respondWithContent(undefined, response)
                } else {
                    let responseContent = 'function getWorkspace(){ return ' + workspace + '}'
                    respondWithContent(responseContent, response)
                }
            }
        }
        break

    case 'Storage':
      {
        respondWithFile(process.env.STORAGE_PATH + '/' + request.url.substring(9), response)
      }
      break

    case 'GetDefinition':
      {
        respondWithFile(process.env.INTER_PROCESS_FILES_PATH + '/definition.json', response)
      }
      break

    case 'SaveDefinition':
      {
        let fs = require('fs')
        let body = ''

        request.on('data', function (data) {
          body += data
          // Too much POST data
          if (body.length > 1e6) {
            request.connection.destroy()
          }
        })

        request.on('end', function () {
          try {
            let filePath = process.env.INTER_PROCESS_FILES_PATH + '/definition.json'
            fs.writeFile(filePath, body, onFileWrite)
          } catch (e) {
            console.log('[ERROR] Error writing user config.', e)
            respondWithContent(undefined, response)
          }

          function onFileWrite (err) {
            if (err) {
              respondWithContent(undefined, response)
            } else {
              let responseContent = 'User config updated.'
              respondWithContent(responseContent, response)
            }
          }
        })
      }
      break

    default:
      {
        homePage()
      }
  }

  function homePage () {
    if (requestParameters[1] === '') {
      let fs = require('fs')
      try {
          let fileName = process.env.PATH_TO_WEB_SERVER  + 'index.html'
        fs.readFile(fileName, onFileRead)

        function onFileRead (err, file) {
          if (CONSOLE_LOG === true) { console.log('[INFO] server -> onBrowserRequest -> onFileRead -> Entering function.') }

          try {
            let fileContent = file.toString()

            fileContent = fileContent.replace('WEB_SERVER_PORT', process.env.WEB_SERVER_PORT)
            respondWithContent(fileContent, response)
          } catch (err) {
            console.log('[ERROR] server -> onBrowserRequest -> File Not Found: ' + fileName + ' or Error = ' + err.stack)
          }
        }
      } catch (err) {
        console.log(err)
      }
    } else {
      respondWithFile(process.env.PATH_TO_CANVAS_APP + '/' + requestParameters[1], response)
    }
  }
}

function respondWithFile (fileName, response) {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithFile -> Entering function.') }

  let fs = require('fs')
  if (fileName.indexOf('undefined') > 0) {
    console.log('[WRN] server -> respondWithFile -> Received request for undefined file. ')
    respondWithContent(undefined, response)
  } else {
    try {
      fs.readFile(fileName, onFileRead)

      function onFileRead (err, file) {
        if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithFile -> onFileRead -> Entering function.') }
        if (!err) {
          respondWithContent(file.toString(), response)
        } else {
          respondWithContent(undefined, response)
        }
      }
    } catch (err) {
      returnEmptyArray()
    }
  }
}

function respondWithContent (content, response) {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithContent -> Entering function.') }

  try {
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') // HTTP 1.1.
    response.setHeader('Pragma', 'no-cache') // HTTP 1.0.
    response.setHeader('Expires', '0') // Proxies.
    response.setHeader('Access-Control-Allow-Origin', '*') // Allows to access data from other domains.

    if (content !== undefined) {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.write(content)
    } else {
      response.writeHead(404, { 'Content-Type': 'text/html' })
      response.write('The specified key does not exist.')
    }
    response.end('\n')
  } catch (err) {
    returnEmptyArray(response)
  }
}

function respondWithImage (fileName, response) {
  if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithImage -> Entering function.') }

  let fs = require('fs')
  try {
    fs.readFile(fileName, onFileRead)

    function onFileRead (err, file) {
      if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithImage -> onFileRead -> Entering function.') }

      try {
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') // HTTP 1.1.
        response.setHeader('Pragma', 'no-cache') // HTTP 1.0.
        response.setHeader('Expires', '0') // Proxies.
        response.setHeader('Access-Control-Allow-Origin', '*') // Allows to access data from other domains.

        response.writeHead(200, { 'Content-Type': 'image/png' })
        response.end(file, 'binary')
      } catch (err) {
        console.log('[ERROR] server -> respondWithImage -> onFileRead -> File Not Found: ' + fileName + ' or Error = ' + err.stack)
      }
    }
  } catch (err) {
    console.log('[ERROR] server -> respondWithImage -> err = ' + err.stack)
  }
}

function returnEmptyArray (response) {
  try {
    if (CONSOLE_LOG === true) { console.log('[INFO] server -> respondWithFile -> returnEmptyArray -> Entering function.') }

    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') // HTTP 1.1.
    response.setHeader('Pragma', 'no-cache') // HTTP 1.0.
    response.setHeader('Expires', '0') // Proxies.

    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.write('[]')
    response.end('\n')
  } catch (err) {
    console.log('[ERROR] server -> returnEmptyArray -> err.message ' + err.message)
  }
}
