const read = require('read')
const { spawn } = require('child_process')

// TODO: add unit tests
// TODO: implement error handling (exit entire process if anything errors)
// TODO: offload console calls to another process using json and make optional/modular (example: output to nothing or output to event handler for web installer)

const noop = () => {}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) await callback(array[index], index, array)
}

function executeShell (instructions, state, conditional) {
  if ((typeof conditional === 'function' ? conditional(state) : conditional) === false) return Promise.resolve()

  return new Promise(resolve => {
    const {
      command = '',
      args = [],
      onOutput = [],
    } = instructions

    const child = spawn(
      typeof command === 'function' ? command(state) : command,
      args.map(arg => typeof arg === 'function' ? arg(state) : arg),
    )

    const promises = []

    child.stderr.on('data', data => {
      const output = data.toString().replace(/^\s+|\s+$/g, '')
      const write = input => {
        child.stdin.write(input)
      }

      onOutput.forEach(item => {
        const {
          expect,
          perform = noop,
        } = item

        if (!expect || output.match(expect)) promises.push(Promise.resolve(perform({ write, output, state })))
      })
    })

    child.stdout.on('data', data => {
      const output = data.toString().replace(/^\s+|\s+$/g, '')
      const write = input => child.stdin.write(input)

      onOutput.forEach(item => {
        const {
          expect,
          perform = noop,
        } = item

        if (!expect || output.match(expect)) promises.push(Promise.resolve(perform({ write, output, state })))
      })
    })

    child.on('close', () => Promise.all(promises)
    .then(resolve))
  })
}

function executeScript (instructions, state, conditional) {
  if ((typeof conditional === 'function' ? conditional(state) : conditional) === false) return Promise.resolve()

  return Promise.resolve(instructions.script(state))
}

function executeRead (instructions, state, conditional) {
  if ((typeof conditional === 'function' ? conditional(state) : conditional) === false) return Promise.resolve()

  const {
    query = '',
    onReady = noop,
    onResponse = noop,
    silent = false,
    defaultValue = '',
  } = instructions

  return new Promise(resolve => Promise.resolve(onReady(state))
  .then(() => {
    read(
      {
        prompt: `\n${typeof query === 'function' ? query(state) : query}\n\n> `,
        terminal: true,
        edit: true,
        default: typeof defaultValue === 'function' ? defaultValue(state) : defaultValue,
        replace: '*',
        silent,
      },
      (error, response) => Promise.resolve(onResponse({
        response,
        state,
      }))
      .then(resolve)
    )
  }))
}

function progress (percent, string) {
  if (percent === 100) return

  console.log(`[${Math.round(percent)}%] ${string}`)
}

function run (steps) {
  const state = {}

  return asyncForEach(steps, (step, index) => {
    const {
      type,
      name,
      instructions,
      conditional = () => true,
    } = step

    const percent = (index / steps.length) * 100

    progress(percent, typeof name === 'function' ? name(state) : name)

    let execute

    switch (type) {
      case 'shell':
        execute = executeShell
        break
      case 'script':
        execute = executeScript
        break
      case 'read':
        execute = executeRead
        break
      default:
        execute = noop
    }

    return execute(instructions, state, conditional)
  })
  .then(() => progress(100))
}

module.exports = run