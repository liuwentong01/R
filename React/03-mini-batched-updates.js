/**
 * React 批量更新：更新队列、函数式更新、automatic batching、flushSync
 *
 * 运行：node React/03-mini-batched-updates.js
 *
 * 版本边界：React 18 使用 createRoot 时，Promise、setTimeout、原生事件等来源的
 * 更新也会自动批处理；React 18 的旧 ReactDOM.render 仍保留旧行为。
 */

function createRuntime(name, { automaticBatching }) {
  let state = { count: 0, text: "init" };
  let pendingUpdates = [];
  let batchingDepth = 0;
  let flushScheduled = false;
  let renderCount = 0;

  function render() {
    renderCount++;
    console.log(`[${name}] render #${renderCount}`, state);
  }

  function flush() {
    if (pendingUpdates.length === 0) return;

    let nextState = state;
    for (const update of pendingUpdates) {
      const partialState =
        typeof update === "function" ? update(nextState) : update;
      // 这里模拟 class this.setState：对象更新做浅合并。
      nextState = { ...nextState, ...partialState };
    }
    pendingUpdates = [];
    state = nextState;
    render();
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    // 仅作教学模拟；真实 React 调度并不承诺就是这个微任务实现。
    queueMicrotask(() => {
      flushScheduled = false;
      flush();
    });
  }

  function setClassState(update) {
    pendingUpdates.push(update);
    if (batchingDepth > 0) return;
    if (automaticBatching) scheduleFlush();
    else flush();
  }

  /** 模拟 React 事件边界（以及历史上的 unstable_batchedUpdates）。 */
  function batchedUpdates(callback) {
    batchingDepth++;
    try {
      callback();
    } finally {
      batchingDepth--;
      if (batchingDepth === 0) flush();
    }
  }

  /**
   * 模拟 react-dom 的 flushSync：回调结束前同步处理队列。
   * 真实 flushSync 还可能连带刷新回调外已挂起的工作，且会伤害性能，应少用。
   */
  function flushSync(callback) {
    const previousDepth = batchingDepth;
    batchingDepth = 1;
    try {
      callback();
    } finally {
      batchingDepth = previousDepth;
      flush();
    }
  }

  return {
    render,
    setClassState,
    batchedUpdates,
    flushSync,
    getState: () => state,
    getRenderCount: () => renderCount,
  };
}

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${message}:`, actual);
}

async function main() {
  console.log("=== React 批量更新 ===");

  const legacy = createRuntime("legacy", { automaticBatching: false });
  const modern = createRuntime("createRoot", { automaticBatching: true });
  legacy.render();
  modern.render();

  console.log("\n1) 同一个 React 事件边界");
  legacy.batchedUpdates(() => {
    legacy.setClassState((prev) => ({ count: prev.count + 1 }));
    legacy.setClassState((prev) => ({ count: prev.count + 1 }));
  });
  modern.batchedUpdates(() => {
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
  });
  assertEqual(legacy.getRenderCount(), 2, "旧模式事件内只提交一次");
  assertEqual(modern.getRenderCount(), 2, "createRoot 事件内只提交一次");

  console.log("\n2) Promise 回调中的版本差异");
  await Promise.resolve().then(() => {
    legacy.setClassState({ text: "async" });
    legacy.setClassState((prev) => ({ count: prev.count + 1 }));
  });
  assertEqual(legacy.getRenderCount(), 4, "旧模式异步来源逐次提交");

  await Promise.resolve().then(() => {
    modern.setClassState({ text: "async" });
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
  });
  await Promise.resolve();
  assertEqual(modern.getRenderCount(), 3, "createRoot 自动批处理异步来源");

  console.log("\n3) 值更新与函数式更新");
  const snapshot = modern.getState().count;
  modern.batchedUpdates(() => {
    modern.setClassState({ count: snapshot + 1 });
    modern.setClassState({ count: snapshot + 1 });
    modern.setClassState({ count: snapshot + 1 });
  });
  assertEqual(modern.getState().count, snapshot + 1, "同一快照的值更新相互覆盖");

  modern.batchedUpdates(() => {
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
    modern.setClassState((prev) => ({ count: prev.count + 1 }));
  });
  assertEqual(modern.getState().count, snapshot + 4, "函数式更新串行消费结果");

  console.log("\n4) flushSync");
  modern.flushSync(() => {
    modern.setClassState({ text: "committed-now" });
  });
  assertEqual(modern.getState().text, "committed-now", "回调返回时已同步提交");

  console.log("\n面试速记：");
  console.log("1. 批处理减少的是 render/commit 次数，不会让当前 render 的 state 快照原地变化。");
  console.log("2. React 18 + createRoot 扩大了自动批处理范围；不是把所有时间里的更新永久合成一批。");
  console.log("3. 依赖旧值时使用函数式更新；队列会把前一个结果交给下一个 updater。");
  console.log("4. useState setter 替换该 state 值；class this.setState 的对象形式才是浅合并。");
  console.log("5. flushSync 常用于更新后必须立刻读取 DOM 的集成场景，滥用会破坏调度和性能。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
