/**
 * 高频自定义 Hook：useLatest / usePrevious / debounce / throttle / cleanup
 *
 * 运行：node React/12-mini-hooks-custom.js
 *
 * 自定义 Hook 没有特殊运行时：它只是组合内置 Hook 来复用“有状态逻辑”，
 * 不会让多个组件共享同一份 state。重点是闭包、依赖和资源清理。
 * 下方极简运行时只演示同步 render/commit，不实现 Fiber 双缓冲、并发中断、Lane
 * 或 StrictMode；不要用它推断被放弃 render 的内部恢复细节。
 */

let currentFiber = null;
let hookIndex = 0;
let isMount = false;

function createFiber() {
  return { hooks: [], pendingEffects: [] };
}

function beginRender(fiber) {
  currentFiber = fiber;
  hookIndex = 0;
  isMount = fiber.hooks.length === 0;
  fiber.pendingEffects = [];
}

function getHook(kind) {
  if (!currentFiber) throw new Error("Hook 只能在 renderHook 期间调用");

  if (isMount) currentFiber.hooks.push({ kind });
  const hook = currentFiber.hooks[hookIndex++];
  if (!hook || hook.kind !== kind) {
    throw new Error("Hook 调用顺序发生变化");
  }
  return hook;
}

function depsEqual(nextDeps, prevDeps) {
  return Boolean(
    nextDeps &&
      prevDeps &&
      nextDeps.length === prevDeps.length &&
      nextDeps.every((dep, index) => Object.is(dep, prevDeps[index]))
  );
}

function useState(initialState) {
  const hook = getHook("state");
  if (isMount) {
    hook.state = typeof initialState === "function" ? initialState() : initialState;
    hook.queue = [];
    hook.setState = (action) => hook.queue.push(action);
  }

  for (const action of hook.queue) {
    hook.state = typeof action === "function" ? action(hook.state) : action;
  }
  hook.queue = [];
  return [hook.state, hook.setState];
}

function useRef(initialValue) {
  const hook = getHook("ref");
  if (isMount) hook.ref = { current: initialValue };
  return hook.ref;
}

function useCallback(callback, deps) {
  const hook = getHook("callback");
  if (isMount || !depsEqual(deps, hook.deps)) {
    hook.callback = callback;
    hook.deps = deps;
  }
  return hook.callback;
}

/**
 * render 阶段只登记 effect，commitEffects 才执行 setup/cleanup。
 * 这修复了常见的错误模拟：若在 useEffect 调用处立即执行，usePrevious 会返回当前值。
 */
function useEffect(setup, deps) {
  const hook = getHook("effect");
  const changed = isMount || !depsEqual(deps, hook.deps);
  if (changed) currentFiber.pendingEffects.push({ hook, setup, deps });
}

// 本模型没有浏览器绘制阶段，因此共用同一 effect 队列；语义上把它视为 DOM 提交后、
// 外部事件获得执行机会前刷新的 layout effect。真实时序见 04-mini-layout-effect.js。
function useLayoutEffect(setup, deps) {
  useEffect(setup, deps);
}

function commitEffects(fiber) {
  for (const effect of fiber.pendingEffects) {
    if (typeof effect.hook.cleanup === "function") effect.hook.cleanup();
  }
  for (const effect of fiber.pendingEffects) {
    const cleanup = effect.setup();
    effect.hook.cleanup = typeof cleanup === "function" ? cleanup : null;
    effect.hook.deps = effect.deps;
  }
  fiber.pendingEffects = [];
}

function renderHook(fiber, callback) {
  beginRender(fiber);
  let result;
  try {
    result = callback();
    if (!isMount && hookIndex !== fiber.hooks.length) {
      throw new Error("Hook 调用数量发生变化");
    }
  } catch (error) {
    // 失败的 render 不应留下待提交 effect，也不能让后续 Hook 误以为仍在渲染。
    fiber.pendingEffects = [];
    throw error;
  } finally {
    currentFiber = null;
  }
  commitEffects(fiber);
  return result;
}

function unmountFiber(fiber) {
  for (const hook of fiber.hooks) {
    if (hook.kind === "effect" && typeof hook.cleanup === "function") {
      hook.cleanup();
      hook.cleanup = null;
    }
  }
  fiber.hooks = [];
}

// ---------------------------------------------------------------------------
// 自定义 Hooks
// ---------------------------------------------------------------------------

/**
 * 返回稳定 ref，并在 layout commit 时让 current 指向最新已提交值。常用于定时器回调。
 * 不要在 render 里直接写 ref.current 来泄漏尚未提交的并发 render，也不要用 ref
 * 掩盖本应声明的 effect 依赖。
 * React 19.2+ 中，仅供 Effect 内调用的非响应式逻辑优先考虑 useEffectEvent；但事件
 * 处理器或本文件这种“返回给调用方执行”的 debounce/throttle 回调不能用它替代。
 */
function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/** 首次返回 undefined，以后返回“上一次已提交 render”的值。 */
function usePrevious(value) {
  const ref = useRef(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function useDebouncedCallback(callback, delay) {
  const callbackRef = useLatest(callback);
  const timerRef = useRef(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const debounced = useCallback((...args) => {
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callbackRef.current(...args);
    }, delay);
  }, [cancel, delay]);

  useEffect(() => cancel, [cancel, delay]);
  return debounced;
}

/** leading + trailing 节流；间隔内多次调用时，trailing 使用最后一次参数。 */
function useThrottledCallback(callback, delay) {
  const callbackRef = useLatest(callback);
  const lastRunRef = useRef(0);
  const timerRef = useRef(null);
  const latestArgsRef = useRef(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    latestArgsRef.current = null;
  }, []);

  const throttled = useCallback((...args) => {
    const now = Date.now();
    const remaining = delay - (now - lastRunRef.current);
    latestArgsRef.current = args;

    if (remaining <= 0 || remaining > delay) {
      cancel();
      lastRunRef.current = now;
      callbackRef.current(...args);
    } else if (timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastRunRef.current = Date.now();
        const latestArgs = latestArgsRef.current;
        latestArgsRef.current = null;
        callbackRef.current(...latestArgs);
      }, remaining);
    }
  }, [cancel, delay]);

  useEffect(() => cancel, [cancel, delay]);
  return throttled;
}

function useMount(setup) {
  useEffect(setup, []);
}

function useUnmount(callback) {
  const callbackRef = useLatest(callback);
  useEffect(() => () => callbackRef.current(), []);
}

// ---------------------------------------------------------------------------
// 可运行验证
// ---------------------------------------------------------------------------

function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
  console.log(`  ✓ ${message}:`, actual);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  console.log("=== 自定义 Hooks ===");

  const previousFiber = createFiber();
  let previous = renderHook(previousFiber, () => usePrevious(1));
  assertEqual(previous, undefined, "usePrevious 首次没有旧值");
  previous = renderHook(previousFiber, () => usePrevious(2));
  assertEqual(previous, 1, "effect 在 commit 后才更新 ref");
  previous = renderHook(previousFiber, () => usePrevious(5));
  assertEqual(previous, 2, "返回上一次已提交值");
  unmountFiber(previousFiber);

  const debounceValueFiber = createFiber();
  let debounced = renderHook(debounceValueFiber, () => useDebouncedValue("h", 10));
  debounced = renderHook(debounceValueFiber, () => useDebouncedValue("hello", 10));
  assertEqual(debounced, "h", "延迟结束前保留旧值");
  await wait(15);
  debounced = renderHook(debounceValueFiber, () => useDebouncedValue("hello", 10));
  assertEqual(debounced, "hello", "延迟结束后消费 state 更新");
  unmountFiber(debounceValueFiber);

  const callbackFiber = createFiber();
  const calls = [];
  let debouncedCallback = renderHook(callbackFiber, () =>
    useDebouncedCallback((value) => calls.push(`old:${value}`), 10)
  );
  debouncedCallback("ignored");
  debouncedCallback = renderHook(callbackFiber, () =>
    useDebouncedCallback((value) => calls.push(`new:${value}`), 10)
  );
  debouncedCallback("kept");
  await wait(15);
  assertEqual(calls.join(","), "new:kept", "防抖只调用最新回调和最后一次参数");
  unmountFiber(callbackFiber);

  const throttleFiber = createFiber();
  const throttledCalls = [];
  const throttledCallback = renderHook(throttleFiber, () =>
    useThrottledCallback((value) => throttledCalls.push(value), 10)
  );
  throttledCallback("leading");
  throttledCallback("discarded");
  throttledCallback("trailing");
  await wait(15);
  assertEqual(
    throttledCalls.join(","),
    "leading,trailing",
    "节流立即执行首项，trailing 使用最后一次参数"
  );
  unmountFiber(throttleFiber);

  const lifecycleFiber = createFiber();
  let mountCount = 0;
  let unmountLabel = "first";
  renderHook(lifecycleFiber, () => {
    const capturedLabel = unmountLabel;
    useMount(() => { mountCount++; });
    useUnmount(() => calls.push(capturedLabel));
  });
  unmountLabel = "latest";
  renderHook(lifecycleFiber, () => {
    const capturedLabel = unmountLabel;
    useMount(() => { mountCount++; });
    useUnmount(() => calls.push(capturedLabel));
  });
  unmountFiber(lifecycleFiber);
  assertEqual(mountCount, 1, "useMount 只在挂载提交后执行");
  assertEqual(calls.at(-1), "latest", "useUnmount 执行最新回调");

  console.log("\n面试速记：");
  console.log("1. 自定义 Hook 复用逻辑，不共享 state；每个调用者仍拥有独立 Hook 状态。");
  console.log("2. 闭包拿到创建它那次 render 的快照；用完整依赖、函数式更新或 ref 解决不同问题。");
  console.log("3. effect 的 cleanup 在依赖变化后的新 setup 前以及卸载时运行；定时器和订阅必须清理。");
  console.log("4. 防抖是停止触发一段时间后执行；节流是单位时间最多执行一次，二者不要混淆。");
  console.log("5. React 19.2+ 的 useEffectEvent 可读取最新已提交值，但只能从 Effect/Effect Event 调用。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
