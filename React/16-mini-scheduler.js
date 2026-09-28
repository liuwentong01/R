/**
 * Mini Scheduler：优先级、时间切片、continuation 与延迟任务
 *
 * 高频边界先说清：
 * - Scheduler 的五档任务优先级，和 React reconciler 的 lanes / 事件优先级是
 *   相邻但不同的抽象，不能画等号。更新先获得 lane；并发 root 需要宿主回调时，
 *   React 才会把相应工作交给 Scheduler。同步 lane 还可能走同步刷新路径。
 * - Fiber 是可暂停的工作数据结构；并发渲染 + Scheduler 才会实际时间切片。
 * - Render 可以被中断/重做，Commit 一旦开始则不会按 Fiber 单元让步。
 * - ImmediatePriority 表示任务一入队就已过期，应在下一次宿主回调中尽快执行；
 *   它本身不等于“立刻在当前 JavaScript 调用栈同步执行”。
 *
 * 本文件是 Scheduler 包的教学模拟，不是 React 源码：实现两个最小堆、五档
 * priority、delay、取消、约 5ms 让步及 continuation；省略 profiling、错误恢复、
 * paint 请求和平台分支等细节。
 * 运行：node React/16-mini-scheduler.js
 */

const ImmediatePriority = 1;
const UserBlockingPriority = 2;
const NormalPriority = 3;
const LowPriority = 4;
const IdlePriority = 5;

const priorityTimeouts = new Map([
  [ImmediatePriority, -1],
  [UserBlockingPriority, 250],
  [NormalPriority, 5_000],
  [LowPriority, 10_000],
  [IdlePriority, 1_073_741_823], // 约 12.4 天，实践中视为“不会过期”
]);

const priorityNames = new Map([
  [ImmediatePriority, "Immediate"],
  [UserBlockingPriority, "UserBlocking"],
  [NormalPriority, "Normal"],
  [LowPriority, "Low"],
  [IdlePriority, "Idle"],
]);

function now() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

// ---------------------------------------------------------------------------
// 最小堆：先按 sortIndex，再按 id，保证相同时间下稳定排序
// ---------------------------------------------------------------------------

function compare(a, b) {
  const order = a.sortIndex - b.sortIndex;
  return order !== 0 ? order : a.id - b.id;
}

function peek(heap) {
  return heap.length === 0 ? null : heap[0];
}

function push(heap, node) {
  heap.push(node);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = (index - 1) >>> 1;
    const parent = heap[parentIndex];
    if (compare(parent, node) <= 0) break;
    heap[parentIndex] = node;
    heap[index] = parent;
    index = parentIndex;
  }
}

function pop(heap) {
  if (heap.length === 0) return null;
  const first = heap[0];
  const last = heap.pop();

  if (last !== first) {
    heap[0] = last;
    let index = 0;
    const halfLength = heap.length >>> 1;

    while (index < halfLength) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      const left = heap[leftIndex];
      const right = rightIndex < heap.length ? heap[rightIndex] : null;
      const smaller = right !== null && compare(right, left) < 0 ? right : left;
      const smallerIndex = smaller === right ? rightIndex : leftIndex;
      if (compare(smaller, last) >= 0) break;

      heap[index] = smaller;
      heap[smallerIndex] = last;
      index = smallerIndex;
    }
  }

  return first;
}

// ---------------------------------------------------------------------------
// Scheduler：timerQueue 按 startTime；taskQueue 按 expirationTime
// ---------------------------------------------------------------------------

const taskQueue = [];
const timerQueue = [];
let nextTaskId = 1;
let currentTask = null;
let isHostCallbackScheduled = false;
let isHostTimeoutScheduled = false;
let hostTimeoutId = null;
let deadline = 0;

const YIELD_INTERVAL = 5; // 教学值；真实实现是启发式宿主配置，不是浏览器一帧长度

function shouldYieldToHost() {
  return now() >= deadline;
}

function advanceTimers(currentTime) {
  let timer = peek(timerQueue);

  while (timer !== null) {
    if (timer.callback === null) {
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
    } else {
      return;
    }
    timer = peek(timerQueue);
  }
}

function scheduleCallback(priorityLevel, callback, options = {}) {
  if (!priorityTimeouts.has(priorityLevel)) {
    throw new RangeError(`未知 Scheduler priority：${priorityLevel}`);
  }
  if (typeof callback !== "function") {
    throw new TypeError("callback 必须是函数。");
  }

  const currentTime = now();
  const delay = typeof options.delay === "number" && options.delay > 0
    ? options.delay
    : 0;
  const startTime = currentTime + delay;
  const expirationTime = startTime + priorityTimeouts.get(priorityLevel);
  const task = {
    id: nextTaskId++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };

  if (startTime > currentTime) {
    task.sortIndex = startTime;
    push(timerQueue, task);

    // 没有就绪任务时，定时唤醒最早的延迟任务；这是旧版本遗漏后 delay 失效的关键。
    if (peek(taskQueue) === null && task === peek(timerQueue)) {
      cancelHostTimeout();
      requestHostTimeout(startTime - currentTime);
    }
  } else {
    task.sortIndex = expirationTime;
    push(taskQueue, task);
    cancelHostTimeout();
    ensureHostCallback();
  }

  return task;
}

function cancelCallback(task) {
  // 堆内任意删除要 O(n)；惰性清空，等它到堆顶再丢弃。
  task.callback = null;
}

function workLoop(initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);

  while (currentTask !== null) {
    const didTimeout = currentTask.expirationTime <= currentTime;
    if (!didTimeout && shouldYieldToHost()) break;

    const callback = currentTask.callback;
    if (typeof callback !== "function") {
      pop(taskQueue);
    } else {
      currentTask.callback = null;
      const continuation = callback(didTimeout);
      currentTime = now();

      if (typeof continuation === "function") {
        // 保留同一个 task、priority 与 expirationTime，下个时间片接着做。
        currentTask.callback = continuation;
      } else if (currentTask === peek(taskQueue)) {
        pop(taskQueue);
      }
    }

    advanceTimers(currentTime);
    currentTask = peek(taskQueue);
  }

  if (currentTask !== null) return true;

  const nextTimer = peek(timerQueue);
  if (nextTimer !== null) {
    requestHostTimeout(Math.max(0, nextTimer.startTime - currentTime));
  }
  return false;
}

function flushWork(initialTime) {
  let hasMoreWork = false;
  try {
    hasMoreWork = workLoop(initialTime);
    return hasMoreWork;
  } finally {
    if (!hasMoreWork) isHostCallbackScheduled = false;
  }
}

function ensureHostCallback() {
  if (isHostCallbackScheduled) return;
  isHostCallbackScheduled = true;
  requestHostCallback(flushWork);
}

function handleTimeout() {
  isHostTimeoutScheduled = false;
  hostTimeoutId = null;
  const currentTime = now();
  advanceTimers(currentTime);

  if (peek(taskQueue) !== null) {
    ensureHostCallback();
  } else {
    const nextTimer = peek(timerQueue);
    if (nextTimer !== null) {
      requestHostTimeout(Math.max(0, nextTimer.startTime - currentTime));
    }
  }
}

function requestHostTimeout(delay) {
  if (isHostTimeoutScheduled) return;
  isHostTimeoutScheduled = true;
  hostTimeoutId = setTimeout(handleTimeout, delay);
}

function cancelHostTimeout() {
  if (!isHostTimeoutScheduled) return;
  clearTimeout(hostTimeoutId);
  isHostTimeoutScheduled = false;
  hostTimeoutId = null;
}

// ---------------------------------------------------------------------------
// 宿主循环：一个宏任务跑一个时间片，再发消息继续
// ---------------------------------------------------------------------------

let scheduledHostCallback = null;
let isMessageLoopRunning = false;

function performWorkUntilDeadline() {
  if (scheduledHostCallback === null) {
    isMessageLoopRunning = false;
    return;
  }

  deadline = now() + YIELD_INTERVAL;
  let hasMoreWork = false;
  try {
    hasMoreWork = scheduledHostCallback(now());
  } finally {
    if (hasMoreWork) {
      schedulePerformWorkUntilDeadline();
    } else {
      scheduledHostCallback = null;
      isMessageLoopRunning = false;
    }
  }
}

let schedulePerformWorkUntilDeadline;

if (typeof setImmediate === "function") {
  // React 当前也优先使用 setImmediate（Node / 旧 IE），它不会像 MessageChannel
  // 那样意外维持 Node 进程，并且比 setTimeout 更符合这里的执行时机。
  schedulePerformWorkUntilDeadline = () => setImmediate(performWorkUntilDeadline);
} else if (typeof MessageChannel === "function") {
  const channel = new MessageChannel();
  channel.port1.onmessage = performWorkUntilDeadline;
  schedulePerformWorkUntilDeadline = () => channel.port2.postMessage(null);
} else {
  schedulePerformWorkUntilDeadline = () => setTimeout(performWorkUntilDeadline, 0);
}

function requestHostCallback(callback) {
  scheduledHostCallback = callback;
  if (isMessageLoopRunning) return;
  isMessageLoopRunning = true;
  schedulePerformWorkUntilDeadline();
}

// ---------------------------------------------------------------------------
// 演示
// ---------------------------------------------------------------------------

async function runDemo() {
  console.log("=== Mini Scheduler ===");
  const log = [];

  scheduleCallback(LowPriority, () => log.push("Low"));
  scheduleCallback(NormalPriority, () => log.push("Normal"));
  scheduleCallback(ImmediatePriority, () => log.push("Immediate"));
  scheduleCallback(UserBlockingPriority, () => log.push("UserBlocking"));

  const cancelled = scheduleCallback(NormalPriority, () => log.push("不应执行"));
  cancelCallback(cancelled);

  let chunk = 0;
  scheduleCallback(NormalPriority, function continuation() {
    chunk += 1;
    log.push(`chunk-${chunk}`);
    return chunk < 3 ? continuation : null;
  });

  scheduleCallback(
    NormalPriority,
    () => log.push("delayed"),
    { delay: 15 },
  );

  await new Promise((resolve) => setTimeout(resolve, 40));
  console.log(log.join(" → "));
  console.log("优先级名称:", [...priorityNames.values()].join(", "));
  console.log("检查：Immediate 先执行、取消项不执行、delayed 到期后才进入就绪队列。");
  console.log("注意：delay 只是最早开始时间；到期入队后仍按 expirationTime 竞争。");
}

if (
  typeof module !== "undefined" &&
  typeof require !== "undefined" &&
  require.main === module
) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    ImmediatePriority,
    UserBlockingPriority,
    NormalPriority,
    LowPriority,
    IdlePriority,
    scheduleCallback,
    cancelCallback,
  };
}
