parseArgs = require 'minimist'
GailanServer = require './src/app.coffee'
cors_proxy = require 'cors-anywhere'
path = require 'path'
fs = require 'fs'
crypto = require 'crypto'

# The token arrives on stdin so it never shows in the process list. Reading
# is guarded by isTTY so `npm start` in a terminal does not hang waiting for
# input the way the upstream patch would.
readToken = ->
  return null if process.stdin.isTTY
  try
    raw = fs.readFileSync(0, 'utf-8').trim()
    return raw if raw.length > 0
  catch e
    null
  null

handleError = (err) ->
  console.log(err.message || err)
  throw err

try
  args = parseArgs process.argv.slice(2)
  widgetPath = path.resolve(__dirname, args.d ? args.dir  ? './widgets')
  port = args.p ? args.port ? 41416
  token = readToken() ? crypto.randomUUID()
  settingsPath = path.resolve(__dirname, args.s ? args.settings ? './settings')
  publicPath = path.resolve(__dirname, './public')
  options =
    loginShell: args['login-shell']
    shell: args['shell']
    disableToken: args['disable-token']

  server = GailanServer(
    Number(port),
    widgetPath,
    settingsPath,
    publicPath,
    token,
    options,
    -> console.log 'server started on port', port
  )
  server.on 'close', handleError
  server.on 'error', handleError

  cors_host = '127.0.0.1'
  cors_port = port + 1
  cors_proxy.createServer(
    originWhitelist: ['http://127.0.0.1:' + port]
    requireHeader: ['origin']
    removeHeaders: ['cookie']
  ).listen(cors_port, cors_host, ->
    console.log 'CORS Anywhere on port', cors_port
  )

catch e
  handleError e
