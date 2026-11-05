import type { Challenge } from '../types.ts'
import { scenario } from './scenarios.ts'

export const easyChallenges: Challenge[] = [
  {
    id: 'easy-1-battery-math',
    kind: 'predict-output',
    title: 'Battery Check',
    difficulty: 'easy',
    mode: 'java-lab',
    concepts: ['java-basics', 'operators', 'strings'],
    objective: 'Read Java statements top to bottom and predict exactly what they print.',
    briefing: [
      'Java runs statements in order, top to bottom. `int` variables hold whole numbers, and `=` stores a new value.',
      'Multiplication happens before subtraction. And when you use `+` with a String, Java glues text together left to right.',
    ],
    prompt: 'What does this code print? Type each line of output on its own line.',
    code: `int battery = 100;
int motors = 4;
battery = battery - motors * 5;
System.out.println("Battery: " + battery + "%");
System.out.println("Motors: " + motors + 1);`,
    expectedOutput: ['Battery: 80%', 'Motors: 41'],
    mistakes: [
      {
        output: ['Battery: 480%', 'Motors: 41'],
        feedback: 'Multiplication happens before subtraction: `motors * 5` is 20, and 100 - 20 = 80.',
      },
      {
        output: ['Battery: 80%', 'Motors: 5'],
        feedback:
          'Close! `"Motors: " + motors` is already a String, so `+ 1` glues the text "1" on the end. You get "Motors: 41", not 5.',
      },
      {
        output: ['Battery: 480%', 'Motors: 5'],
        feedback: 'Two traps here: operator precedence (`*` before `-`) and String concatenation (`"text" + 4 + 1` is "text41").',
      },
    ],
    hints: [
      'Work out `motors * 5` first, then subtract.',
      'Once Java has a String on the left of `+`, every following `+` adds text, not numbers.',
    ],
    why: '`battery - motors * 5` is `100 - 20 = 80`. In the last line Java evaluates left to right: `"Motors: " + 4` becomes the String `"Motors: 4"`, then `+ 1` appends `"1"`. Use parentheses, `"Motors: " + (motors + 1)`, if you want the number 5.',
    successMessage: 'Precise prediction. Robot code lives and dies on details like this.',
  },
  {
    id: 'easy-2-countdown-loop',
    kind: 'code-edit',
    title: 'Fix the Countdown',
    difficulty: 'easy',
    mode: 'java-lab',
    concepts: ['loops', 'java-basics'],
    objective: 'Fix a `for` loop condition so the loop runs the right number of times.',
    briefing: [
      'A `for` loop has three parts: start (`int i = 3`), a condition checked before every pass, and an update (`i--` subtracts 1).',
      'The loop keeps running only while the condition is `true`.',
    ],
    prompt: 'This countdown should print 3, 2, 1 and then "Launch!", but it only prints "Launch!". Fix the highlighted loop condition.',
    prefix: `// Goal: print 3, 2, 1, then "Launch!"
for (int i = 3; `,
    initial: 'i < 0',
    suffix: `; i--) {
  System.out.println(i);
}
System.out.println("Launch!");`,
    accepted: ['^i>0$', '^i>=1$', '^0<i$', '^1<=i$', '^i!=0$', '^0!=i$'],
    mistakes: [
      { pattern: '^i<0$', feedback: 'That is the original bug: `i` starts at 3, and `3 < 0` is false, so the body never runs.' },
      { pattern: '^i>=0$', feedback: 'Almost: `i >= 0` is still true when `i` is 0, so this prints 3, 2, 1, 0.' },
      { pattern: '^i>1$', feedback: 'This stops too early: when `i` is 1, `1 > 1` is false, so 1 is never printed.' },
      {
        pattern: '^(i<=3|i<4|i<=4|i<5|i>-1|i!=-1)$',
        feedback: 'Careful: `i` keeps going down (3, 2, 1, 0, -1...) so this condition stays true for a very long time. That is a runaway loop.',
      },
    ],
    solution: 'i > 0',
    hints: ['Trace it: `i` starts at 3. Is `3 < 0` true or false?', 'You want the loop to run while `i` is still above zero.'],
    why: 'The condition is checked before every pass. With `i > 0`, the loop runs for i = 3, 2, 1 and stops when `i` reaches 0. Off-by-one mistakes like `i >= 0` are one of the most common loop bugs, so trace the first and last pass whenever you write a loop.',
    successMessage: 'Liftoff! You debugged an off-by-one style loop.',
  },
  {
    id: 'easy-3-arm-safety',
    kind: 'choice',
    title: 'Arm Safety Check',
    difficulty: 'easy',
    mode: 'java-lab',
    concepts: ['conditionals', 'java-basics'],
    objective: 'Choose the right boolean operator for a safety condition.',
    briefing: [
      '`&&` means AND: both sides must be true. `||` means OR: at least one side must be true. `!` flips true and false.',
      'Safety checks on robots usually stop a motor if any one warning sign appears.',
    ],
    prompt:
      'The arm must stop if it is past 90 degrees OR its top limit switch is pressed. `topLimit.get()` returns true when pressed. Which `if` statement is correct?',
    options: [
      {
        id: 'a',
        label: 'Option A',
        code: 'if (angle > 90 && topLimit.get()) {\n  stopArm();\n}',
        feedback: '`&&` needs both to be true. If the switch is pressed at 80 degrees, the arm keeps moving and could break.',
      },
      {
        id: 'b',
        label: 'Option B',
        code: 'if (angle > 90 || topLimit.get()) {\n  stopArm();\n}',
        feedback: 'Correct: `||` stops the arm when either warning sign is true.',
      },
      {
        id: 'c',
        label: 'Option C',
        code: 'if (angle > 90 || !topLimit.get()) {\n  stopArm();\n}',
        feedback: '`!topLimit.get()` is true when the switch is NOT pressed, so this stops the arm almost all the time.',
      },
      {
        id: 'd',
        label: 'Option D',
        code: 'if (angle = 90 || topLimit.get()) {\n  stopArm();\n}',
        feedback: '`=` assigns a value; `==` compares. This line does not even compile in Java.',
      },
    ],
    correct: ['b'],
    hints: ['Read the requirement out loud: "past 90 degrees OR switch pressed".', 'Which operator is true when at least one side is true?'],
    why: '`angle > 90 || topLimit.get()` is true if either condition is true, which is exactly the safety rule. Real WPILib mechanisms often expose sensors like this through `Trigger` objects, but the boolean logic is the same.',
    successMessage: 'Safe arm, happy pit crew.',
  },
  {
    id: 'easy-4-first-command',
    kind: 'reorder',
    title: 'Build Your First Command',
    difficulty: 'easy',
    mode: 'java-lab',
    concepts: ['commands', 'execution-order', 'mechanisms'],
    objective: 'Understand that a Commands v3 command body is ordinary Java that runs in order.',
    briefing: [
      'In Commands v3, a **command** is a named piece of robot behavior. A mechanism (like an Intake) creates commands with `run(coroutine -> { ... })`, which automatically requires that mechanism.',
      'The body reads in the order the robot acts. `coroutine.waitUntil(...)` pauses the command (letting other commands run) until the condition is true.',
    ],
    prompt: 'Put the four statements in an order that makes this intake command work: start the rollers, wait for a game piece, then stop.',
    codeNote: '`run`, `named`, `Mechanism` and `coroutine.waitUntil` are WPILib API. `setSpeed` and `hasGamePiece` are this team\'s own Intake code.',
    before: `public class Intake implements Mechanism {
  // private motor + beam-break sensor fields...

  public Command intakePiece() {
    return run(coroutine -> {`,
    after: `    }).named("Intake Piece");
  }
}`,
    indent: 6,
    items: [
      { id: 'print', code: 'System.out.println("Intake started");' },
      { id: 'start', code: 'setSpeed(0.75);' },
      { id: 'wait', code: 'coroutine.waitUntil(hasGamePiece);' },
      { id: 'stop', code: 'setSpeed(0);' },
    ],
    initialOrder: ['wait', 'stop', 'start', 'print'],
    correctOrders: [
      ['print', 'start', 'wait', 'stop'],
      ['start', 'print', 'wait', 'stop'],
    ],
    hints: ['The rollers must be spinning while you wait for the game piece.', 'The command finishes when the body reaches its last line.'],
    why: 'The command body runs top to bottom: rollers on, then `waitUntil` pauses this command (other commands keep running) until the beam break sees a piece, then rollers off. When the body returns, the command completes and releases the Intake. If `setSpeed(0)` came before the wait, the rollers would stop before any piece arrived.',
    successMessage: 'Your first Commands v3 command. It reads exactly like the robot acts.',
  },
  {
    id: 'easy-5-count-yield',
    kind: 'predict-output',
    title: 'Count with Yield',
    difficulty: 'easy',
    mode: 'scheduler',
    concepts: ['coroutines', 'yield', 'scheduler-cycles'],
    objective: 'Predict how `coroutine.yield()` spreads a command across scheduler cycles.',
    briefing: [
      'The scheduler runs every 20 ms. Each run, it gives every running command a turn.',
      '`coroutine.yield()` means "pause here until my next turn". Code after the yield runs in the next scheduler cycle, so other commands get a turn too.',
    ],
    prompt: 'This command is scheduled, then `Scheduler.run()` is called exactly 2 times. What has been printed so far? One line per line of output.',
    codeNote: 'This uses only WPILib API: `Command.noRequirements`, `coroutine.yield()` and `.named()`.',
    code: `Command countToThree = Command.noRequirements(coroutine -> {
  for (int i = 1; i <= 3; i++) {
    System.out.println("Count " + i);
    coroutine.yield();
  }
  System.out.println("Done!");
}).named("Count to Three");`,
    expectedOutput: ['Count 1', 'Count 2'],
    mistakes: [
      {
        output: ['Count 1', 'Count 2', 'Count 3', 'Done!'],
        feedback: 'That would happen without `yield()`. Each `yield()` pauses the command until the next scheduler cycle.',
      },
      { output: ['Count 1'], feedback: 'The second cycle resumes right after the yield, loops again, and prints "Count 2".' },
      {
        output: ['Count 1', 'Count 2', 'Count 3'],
        feedback: 'Each cycle prints one line and then yields. Two cycles means two lines.',
      },
    ],
    scenario: scenario(
      [
        {
          id: 'count',
          name: 'Count to Three',
          requirements: [],
          body: [
            { op: 'log', text: 'Count 1' },
            { op: 'yield' },
            { op: 'log', text: 'Count 2' },
            { op: 'yield' },
            { op: 'log', text: 'Count 3' },
            { op: 'yield' },
            { op: 'log', text: 'Done!' },
          ],
        },
      ],
      [{ cycle: 1, action: 'schedule', command: 'count' }],
      5,
      { mechanisms: [] },
    ),
    hints: ['Cycle 1 runs until the first `yield()`.', 'Cycle 2 picks up right after that yield.'],
    why: 'Cycle 1 prints "Count 1" and yields. Cycle 2 resumes, loops, prints "Count 2" and yields. "Count 3" comes in cycle 3, and "Done!" in cycle 4 when the loop exits and the command completes. Coroutines are cooperative: a command only lets others run when it yields.',
    successMessage: 'You think in scheduler cycles now.',
  },
]
