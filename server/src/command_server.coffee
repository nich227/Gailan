# middleware to serve the results of shell commands
# Listens to POST /run/
{spawn} = require('child_process')
module.exports = (workingDir, useLoginShell, shellName) ->
  args = if useLoginShell then ['-l'] else []
  shellName ?= 'zsh'
  # the Connect middleware
  (req, res, next) ->
    return next() unless req.method == 'POST' and req.url == '/run/'

    command = ''
    req.on 'data', (chunk) -> command += chunk

    req.on 'end', ->
      # fish cannot read commands from the socketpair node hands it as stdin,
      # so it gets them as an argument; zsh and bash keep the stdin protocol
      if shellName == 'fish'
        shell = spawn shellName, args.concat(['-c', command]), cwd: workingDir
      else
        shell = spawn shellName, args, cwd: workingDir

      setStatusOnce = (status) ->
        res.writeHead status
        setStatusOnce = ->

      shell.stderr.on 'data', (d) ->
        setStatusOnce 500
        res.write d

      shell.stdout.on 'data', (d) ->
        setStatusOnce 200
        res.write d

      shell.on 'error', (err) ->
        setStatusOnce 500
        res.write err.message

      shell.on 'close', ->
        setStatusOnce 200
        res.end()

      unless shellName == 'fish'
        shell.stdin.write command
        shell.stdin.write '\n'
        shell.stdin.end()





