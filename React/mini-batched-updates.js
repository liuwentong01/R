/**
 * React 批量更新（batched updates）手写模拟
 *
 * ═══════════════════════════════════════════════════════
 *  为什么这是高频面试题？
 * ═══════════════════════════════════════════════════════
 *
 * 面试里经常会问：
 *   1. setState 为什么连续调用不一定触发多次 render？
 *   2. React 17 和 React 18 的批量更新差别是什么？
 *   3. flushSync 是干什么的？
 *
 * 本文件不实现完整 React，只聚焦“更新队列 + 批量提交”的核心思路。
 *
 * 运行方式：node React/mini-batched-updates.js
 */

function createRuntime(name, options = {}) {
  const { autoBatchAsync = false } = options;

  let state = { count: 0, text: "init" };
  let renderCount = 0;
  let pendingUpdates = [];
  let isBatching = false;
  let asyncFlushScheduled = false;

  function render() {
    renderCount++;
    console.log(`[${name}] render #${renderCount}`, JSON.stringify(state));
  }

  function applyUpdates() {
    if (pendingUpdates.length === 0) return;

    pendingUpdates.forEach((update) => {
      if (typeof update === "function") {
        state = update(state);
      } else {
        state = { ...state, ...update };
      }
    });

    pendingUpdates = [];
    render();
  }

  function scheduleAsyncFlush() {
    if (!autoBatchAsync || asyncFlushScheduled) return;

    asyncFlushScheduled = true;
    Promise.resolve().then(() => {
      asyncFlushScheduled = false;
      applyUpdates();
    });
  }

  function setState(update) {
    pendingUpdates.push(update);

    if (isBatching) return;

    if (autoBatchAsync) {
      scheduleAsyncFlush();
    } else {
      applyUpdates();
    }
  }

  function batchedUpdates(fn) {
    const prevBatching = isBatching;
    isBatching = true;

    try {
      fn();
    } finally {
      isBatching = prevBatching;
      if (!isBatching) {
        applyUpdates();
      }
    }
  }

  function flushSync(fn) {
    const prevBatching = isBatching;
    const prevAsyncFlushScheduled = asyncFlushScheduled;

    isBatching = false;
    asyncFlushScheduled = false;

    try {
      fn();
      applyUpdates();
    } finally {
      isBatching = prevBatching;
      asyncFlushScheduled = prevAsyncFlushScheduled && pendingUpdates.length > 0;
    }
  }

  return {
    render,
    setState,
    batchedUpdates,
    flushSync,
    getState() {
      return state;
    },
  };
}

async function main() {
  console.log("=== React 批量更新手写模拟 ===\n");

  const react17 = createRuntime("React17", { autoBatchAsync: false });
  const react18 = createRuntime("React18", { autoBatchAsync: true });

  console.log("【初始化】");
  react17.render();
  react18.render();

  // ── 测试 1：事件回调中的批量更新 ──
  console.log("\n【测试 1】事件回调中的 batchedUpdates");

  react17.batchedUpdates(() => {
    react17.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react17.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react17.setState((prev) => ({ ...prev, text: "event" }));
  });

  react18.batchedUpdates(() => {
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react18.setState((prev) => ({ ...prev, text: "event" }));
  });

  console.log("  说明：事件回调里的多个更新会合并成一次 render");

  // ── 测试 2：异步回调中的差异 ──
  console.log("\n【测试 2】Promise.then 中的更新差异");

  await Promise.resolve().then(() => {
    console.log("  [React17] Promise.then 开始");
    react17.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react17.setState((prev) => ({ ...prev, text: "async-1" }));
  });

  await Promise.resolve().then(() => {
    console.log("  [React18] Promise.then 开始");
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react18.setState((prev) => ({ ...prev, text: "async-1" }));
  });

  // 等待 React18 的微任务批量提交完成
  await Promise.resolve();

  console.log("  说明：这里模拟的是 React 17 与 React 18 automatic batching 的核心差异");

  // ── 测试 3：为什么连续 setState(count + 1) 容易出错 ──
  console.log("\n【测试 3】直接值更新 vs 函数式更新");

  const snapshot = react18.getState().count;
  react18.batchedUpdates(() => {
    react18.setState({ count: snapshot + 1 });
    react18.setState({ count: snapshot + 1 });
    react18.setState({ count: snapshot + 1 });
  });
  console.log("  上面只加了 1，因为三次都基于同一个旧快照");

  react18.batchedUpdates(() => {
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    react18.setState((prev) => ({ ...prev, count: prev.count + 1 }));
  });
  console.log("  函数式更新会依次消费前一次结果，所以这里加了 3");

  // ── 测试 4：flushSync ──
  console.log("\n【测试 4】flushSync 强制立即提交");

  react18.flushSync(() => {
    react18.setState((prev) => ({ ...prev, text: "flush-sync" }));
  });

  console.log("  flushSync 之后立刻读取 state =>", react18.getState());

  console.log("\n\n=== 面试要点 ===");
  console.log("1. setState 的本质是把更新放进队列，真正新 state 在后续统一计算");
  console.log("2. 批量更新的目标是减少 render 次数，避免一次事件里反复提交中间态");
  console.log("3. React 17 更偏“事件内批量”，React 18 把 Promise / timeout 等也纳入 automatic batching");
  console.log("4. 连续依赖旧值更新时要用函数式更新，否则会基于同一个快照重复覆盖");
  console.log("5. flushSync 用于强制立即提交，常见于“更新后马上读 DOM / 布局”的场景");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
